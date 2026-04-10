import { readFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { doctorReport } from './doctor.mjs';
import { dispatchNativeHook } from './native-hook.mjs';
import { handleNotifyPayload } from './notify.mjs';
import { enableSessionLog, readSessionLogEntries } from './session-log.mjs';

function encodeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf-8');
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf-8'),
    body,
  ]);
}

function decodeMessages(buffer) {
  const messages = [];
  let rest = buffer;
  while (rest.length > 0) {
    const separatorIndex = rest.indexOf('\r\n\r\n');
    if (separatorIndex === -1) break;
    const headerText = rest.slice(0, separatorIndex).toString('utf-8');
    const lengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!lengthMatch) break;
    const bodyLength = Number.parseInt(lengthMatch[1], 10);
    const bodyStart = separatorIndex + 4;
    if (rest.length < bodyStart + bodyLength) break;
    messages.push(JSON.parse(rest.slice(bodyStart, bodyStart + bodyLength).toString('utf-8')));
    rest = rest.slice(bodyStart + bodyLength);
  }
  return { messages, rest };
}

async function mcpHandshake(scriptPath) {
  const child = spawn(process.execPath, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuffer = Buffer.alloc(0);
  let stderr = '';
  const responses = [];

  child.stdout.on('data', (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    const decoded = decodeMessages(stdoutBuffer);
    stdoutBuffer = decoded.rest;
    responses.push(...decoded.messages);
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf-8');
  });

  child.stdin.write(encodeMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
  child.stdin.write(encodeMessage({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }));
  child.stdin.write(encodeMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }));
  child.stdin.end();

  await Promise.all([
    new Promise((resolve, reject) => {
      child.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `server exited with code ${code}`));
          return;
        }
        resolve();
      });
    }),
    new Promise((resolve) => {
      child.stdout.on('end', resolve);
      child.stdout.on('close', resolve);
    }),
  ]);

  return responses;
}

function findServerPath(configContent, serverName) {
  const pattern = new RegExp(`\\[mcp_servers\\.${serverName}\\][\\s\\S]*?args\\s*=\\s*\\[\"([^\"]+)\"\\]`);
  const match = configContent.match(pattern);
  return match?.[1] ?? null;
}

export async function verifyInstallation({
  runtimeRoot,
  cwd = process.cwd(),
  scope = 'user',
  codexHome,
}) {
  const report = doctorReport({ runtimeRoot, cwd, scope, codexHome });
  const configPath = join(report.codexHome, 'config.toml');
  const hooksPath = join(report.codexHome, 'hooks.json');
  const configContent = existsSync(configPath) ? await readFile(configPath, 'utf-8') : '';

  const installedCliPath = join(report.codexHome, 'skills', 'oh-my-ralpha', 'bin', 'oh-my-ralpha.js');
  const check = async (name, fn) => {
    try {
      const detail = await fn();
      return { name, ok: true, detail };
    } catch (error) {
      return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  };

  const checks = await Promise.all([
    check('installed_cli', async () => {
      await access(installedCliPath);
      return installedCliPath;
    }),
    check('config_present', async () => {
      await access(configPath);
      return configPath;
    }),
    check('hooks_present', async () => {
      await access(hooksPath);
      return hooksPath;
    }),
    check('notify_configured', async () => {
      if (!report.checks.notifyConfigured) {
        throw new Error('notify is not configured');
      }
      return 'notify configured';
    }),
    check('native_hook_prompt_submit', async () => {
      const output = await dispatchNativeHook({
        hook_event_name: 'UserPromptSubmit',
        cwd,
        prompt: '$ralpha fix this',
      });
      if (!output?.hookSpecificOutput?.additionalContext) {
        throw new Error('native hook did not return additionalContext');
      }
      return output.hookSpecificOutput.additionalContext;
    }),
    check('notify_log_capture', async () => {
      const sessionId = 'verify-log-session';
      await enableSessionLog({
        cwd,
        sessionId,
        threadId: 'verify-thread',
        turnId: 'verify-turn',
        prompt: '@LOG verify logging',
      });
      await handleNotifyPayload({
        cwd,
        session_id: sessionId,
        thread_id: 'verify-thread',
        type: 'agent-turn-complete',
        'turn-id': 'verify-turn-2',
        'input-messages': ['hello'],
        'last-assistant-message': 'world',
      });
      const entries = await readSessionLogEntries({
        cwd,
        sessionId,
      });
      if (!entries.some((entry) => entry.channel === 'notify' && entry.event_name === 'agent-turn-complete')) {
        throw new Error('notify event was not captured in the session log');
      }
      return entries.length;
    }),
    check('tool_hook_log_capture', async () => {
      const sessionId = 'verify-tool-log-session';
      await enableSessionLog({
        cwd,
        sessionId,
        threadId: 'verify-thread',
        turnId: 'verify-turn',
        prompt: '@LOG verify tool logging',
      });
      await dispatchNativeHook({
        hook_event_name: 'PreToolUse',
        cwd,
        session_id: sessionId,
        thread_id: 'verify-thread',
        tool_name: 'Bash',
        tool_use_id: 'tool-1',
        tool_input: { command: 'echo hi' },
      });
      await dispatchNativeHook({
        hook_event_name: 'PostToolUse',
        cwd,
        session_id: sessionId,
        thread_id: 'verify-thread',
        tool_name: 'Bash',
        tool_use_id: 'tool-1',
        tool_input: { command: 'echo hi' },
        tool_response: { stdout: 'hi', stderr: '', exit_code: 0 },
      });
      const entries = await readSessionLogEntries({
        cwd,
        sessionId,
      });
      if (!entries.some((entry) => entry.event_name === 'PreToolUse')) {
        throw new Error('PreToolUse was not captured in the session log');
      }
      if (!entries.some((entry) => entry.event_name === 'PostToolUse')) {
        throw new Error('PostToolUse was not captured in the session log');
      }
      return entries.length;
    }),
    check('mcp_state_handshake', async () => {
      const scriptPath = findServerPath(configContent, 'oh_my_ralpha_state');
      if (!scriptPath) throw new Error('state server path missing from config');
      const responses = await mcpHandshake(scriptPath);
      if (responses.length < 2) throw new Error('state server handshake incomplete');
      return responses[1].result.tools.map((tool) => tool.name);
    }),
    check('mcp_trace_handshake', async () => {
      const scriptPath = findServerPath(configContent, 'oh_my_ralpha_trace');
      if (!scriptPath) throw new Error('trace server path missing from config');
      const responses = await mcpHandshake(scriptPath);
      if (responses.length < 2) throw new Error('trace server handshake incomplete');
      return responses[1].result.tools.map((tool) => tool.name);
    }),
    check('mcp_runtime_handshake', async () => {
      const scriptPath = findServerPath(configContent, 'oh_my_ralpha_runtime');
      if (!scriptPath) throw new Error('runtime server path missing from config');
      const responses = await mcpHandshake(scriptPath);
      if (responses.length < 2) throw new Error('runtime server handshake incomplete');
      return responses[1].result.tools.map((tool) => tool.name);
    }),
  ]);

  return {
    scope,
    doctor: report,
    checks,
    ok: checks.every((entry) => entry.ok),
  };
}
