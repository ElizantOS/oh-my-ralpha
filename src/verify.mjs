import { readFile, access, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { COMPANION_AGENT_PROMPTS } from './companions.mjs';
import { doctorReport } from './doctor.mjs';
import { dispatchNativeHook } from './native-hook.mjs';
import { installedAgentsDir, installedPromptsDir, installedSkillDir } from './paths.mjs';

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

  const installedCliPath = join(installedSkillDir(report.codexHome), 'bin', 'oh-my-ralpha.js');
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
    check('native_hook_prompt_submit', async () => {
      const hookCwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-verify-hook-'));
      const output = await dispatchNativeHook({
        hook_event_name: 'UserPromptSubmit',
        cwd: hookCwd,
        prompt: '$ralpha fix this',
      });
      if (!output?.hookSpecificOutput?.additionalContext) {
        throw new Error('native hook did not return additionalContext');
      }
      return output.hookSpecificOutput.additionalContext;
    }),
    check('required_native_agents', async () => {
      const missing = [];
      for (const capability of COMPANION_AGENT_PROMPTS) {
        const promptPath = join(installedPromptsDir(report.codexHome), `${capability.installName}.md`);
        const agentPath = join(installedAgentsDir(report.codexHome), `${capability.installName}.toml`);
        if (!existsSync(promptPath)) missing.push(promptPath);
        if (!existsSync(agentPath)) missing.push(agentPath);
      }
      if (missing.length > 0) {
        throw new Error(`missing native agent assets: ${missing.join(', ')}`);
      }
      return COMPANION_AGENT_PROMPTS.map((capability) => capability.installName);
    }),
    check('mcp_handshake', async () => {
      const scriptPath = findServerPath(configContent, 'ralpha');
      if (!scriptPath) throw new Error('unified server path missing from config');
      const responses = await mcpHandshake(scriptPath);
      if (responses.length < 2) throw new Error('unified server handshake incomplete');
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
