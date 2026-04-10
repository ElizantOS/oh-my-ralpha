import { mkdir } from 'node:fs/promises';
import { omxContextDir, omxPlansDir, omxStateDir } from './paths.mjs';
import { routePrompt } from './router.mjs';
import { readModeState } from './state.mjs';
import {
  appendSessionLogEvent,
  containsLogDisableDirective,
  containsLogEnableDirective,
  disableSessionLog,
  enableSessionLog,
  stripLogDirectives,
} from './session-log.mjs';

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function readTranscriptPath(payload) {
  return safeString(payload.transcript_path || payload.transcriptPath).trim() || undefined;
}

function readSessionOwnerPid(payload) {
  const candidates = [
    payload.session_pid,
    payload.sessionPid,
    payload.codex_pid,
    payload.codexPid,
    payload.parent_pid,
    payload.parentPid,
  ];
  for (const candidate of candidates) {
    const value = safeString(candidate).trim();
    if (value) return value;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  }
  return undefined;
}

function readHookEventName(payload) {
  return safeString(
    payload.hook_event_name
    ?? payload.hookEventName
    ?? payload.event
    ?? payload.name,
  ).trim();
}

function readPromptText(payload) {
  for (const candidate of [payload.prompt, payload.input, payload.user_prompt, payload.userPrompt, payload.text]) {
    const value = safeString(candidate).trim();
    if (value) return value;
  }
  return '';
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  return raw ? JSON.parse(raw) : {};
}

async function buildSessionStartOutput(cwd) {
  await mkdir(omxContextDir(cwd), { recursive: true });
  await mkdir(omxStateDir(cwd), { recursive: true });
  await mkdir(omxPlansDir(cwd), { recursive: true });
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: 'oh-my-ralpha native SessionStart detected. Load AGENTS.md and the current .codex/oh-my-ralpha context/todo/rounds files before resuming work.',
    },
  };
}

async function buildPromptSubmitOutput(payload, cwd) {
  const text = readPromptText(payload);
  if (!text) return null;
  const sessionId = safeString(payload.session_id || payload['session-id']) || undefined;
  const threadId = safeString(payload.thread_id || payload['thread-id']) || undefined;
  const turnId = safeString(payload.turn_id || payload['turn-id']) || undefined;
  const transcriptPath = readTranscriptPath(payload);
  const sessionOwnerPid = readSessionOwnerPid(payload);

  const messages = [];

  if (containsLogDisableDirective(text)) {
    await disableSessionLog({
      cwd,
      sessionId,
      threadId,
      turnId,
      transcriptPath,
      sessionOwnerPid,
      reason: '@UNLOG',
    });
    messages.push('oh-my-ralpha session logging disabled for this session.');
  }

  if (containsLogEnableDirective(text)) {
    const state = await enableSessionLog({
      cwd,
      sessionId,
      threadId,
      turnId,
      prompt: text,
      transcriptPath,
      sessionOwnerPid,
    });
    messages.push(`oh-my-ralpha session logging enabled. Log file: ${state.log_file_path}`);
  }

  const result = await routePrompt({
    cwd,
    text: stripLogDirectives(text),
    sessionId,
    threadId,
    turnId,
    activate: true,
  });
  if (result.matched) {
    messages.push(
      result.gateApplied
        ? 'oh-my-ralpha detected an underspecified execution prompt. Do planning first and refresh PRD/test-spec artifacts before direct execution.'
        : 'oh-my-ralpha detected. Read the existing .codex/oh-my-ralpha state/todo/rounds artifacts and continue from the active slice instead of restarting discovery.',
    );
  }

  await appendSessionLogEvent({
    cwd,
    sessionId,
    threadId,
    transcriptPath,
    sessionOwnerPid,
    channel: 'native-hook',
    eventName: 'UserPromptSubmit',
    payload,
  });

  if (messages.length === 0) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: messages.join('\n\n'),
    },
  };
}

async function buildPreToolUseOutput(payload, cwd) {
  const sessionId = safeString(payload.session_id || payload['session-id']) || undefined;
  const threadId = safeString(payload.thread_id || payload['thread-id']) || undefined;
  await appendSessionLogEvent({
    cwd,
    sessionId,
    threadId,
    transcriptPath: readTranscriptPath(payload),
    sessionOwnerPid: readSessionOwnerPid(payload),
    channel: 'native-hook',
    eventName: 'PreToolUse',
    payload,
  });
  return null;
}

async function buildPostToolUseOutput(payload, cwd) {
  const sessionId = safeString(payload.session_id || payload['session-id']) || undefined;
  const threadId = safeString(payload.thread_id || payload['thread-id']) || undefined;
  await appendSessionLogEvent({
    cwd,
    sessionId,
    threadId,
    transcriptPath: readTranscriptPath(payload),
    sessionOwnerPid: readSessionOwnerPid(payload),
    channel: 'native-hook',
    eventName: 'PostToolUse',
    payload,
  });
  return null;
}

async function buildStopOutput(payload, cwd) {
  await appendSessionLogEvent({
    cwd,
    sessionId: safeString(payload.session_id || payload['session-id']) || undefined,
    threadId: safeString(payload.thread_id || payload['thread-id']) || undefined,
    transcriptPath: readTranscriptPath(payload),
    sessionOwnerPid: readSessionOwnerPid(payload),
    channel: 'native-hook',
    eventName: 'Stop',
    payload,
  });
  const state = await readModeState({ cwd, mode: 'oh-my-ralpha' });
  if (state?.active === true) {
    const phase = safeString(state.current_phase).trim().toLowerCase();
    if (!['complete', 'failed', 'cancelled'].includes(phase)) {
      return {
        decision: 'block',
        reason: `oh-my-ralpha mode is still active (${phase || 'executing'}). Finish verification and cleanup before stopping.`,
      };
    }
  }
  return null;
}

export async function dispatchNativeHook(payload) {
  const cwd = safeString(payload.cwd).trim() || process.cwd();
  const eventName = readHookEventName(payload);
  if (eventName === 'SessionStart') return buildSessionStartOutput(cwd);
  if (eventName === 'PreToolUse') return buildPreToolUseOutput(payload, cwd);
  if (eventName === 'PostToolUse') return buildPostToolUseOutput(payload, cwd);
  if (eventName === 'UserPromptSubmit') return buildPromptSubmitOutput(payload, cwd);
  if (eventName === 'Stop') return buildStopOutput(payload, cwd);
  return null;
}

export async function runNativeHookCli() {
  const payload = await readStdinJson();
  const output = await dispatchNativeHook(payload);
  if (output) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  }
}
