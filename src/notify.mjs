import { appendSessionLogEvent } from './session-log.mjs';
import { runtimeRootFromModule } from './paths.mjs';
import { readNotifyChain } from './setup.mjs';
import { spawn } from 'node:child_process';

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

const runtimeRoot = runtimeRootFromModule(import.meta.url);

export function normalizeNotifyPayload(rawPayload) {
  return rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
}

export async function handleNotifyPayload(rawPayload) {
  const payload = normalizeNotifyPayload(rawPayload);
  const cwd = safeString(payload.cwd || payload['cwd']).trim() || process.cwd();
  const sessionId = safeString(payload.session_id || payload['session-id']).trim() || undefined;
  const threadId = safeString(payload.thread_id || payload['thread-id']).trim() || undefined;
  const type = safeString(payload.type).trim() || 'agent-turn-complete';

  return appendSessionLogEvent({
    cwd,
    sessionId,
    threadId,
    transcriptPath: safeString(payload.transcript_path || payload.transcriptPath).trim() || undefined,
    sessionOwnerPid: safeString(payload.session_pid || payload.sessionPid || payload.codex_pid || payload.codexPid || payload.parent_pid || payload.parentPid).trim() || undefined,
    channel: 'notify',
    eventName: type,
    payload,
  });
}

async function forwardNotifyChain(rawPayload) {
  const chainedCommand = await readNotifyChain(runtimeRoot);
  if (!chainedCommand || chainedCommand.length === 0) return null;

  const [command, ...args] = chainedCommand;
  if (!command) return null;

  await new Promise((resolve, reject) => {
    const child = spawn(command, [...args, JSON.stringify(rawPayload)], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8');
    });
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `notify chain exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

export async function runNotifyCli(argv = process.argv) {
  const rawPayload = argv[argv.length - 1];
  if (!rawPayload || rawPayload.startsWith('-')) return;

  let payload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return;
  }

  await handleNotifyPayload(payload);
  await forwardNotifyChain(payload).catch(() => {});
}
