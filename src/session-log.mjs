import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { omxLogsDir, omxStateDir } from './paths.mjs';
import { clearModeState, readModeState, writeModeState } from './state.mjs';

const SESSION_LOG_MODE = 'session-log';

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function stableHash(value) {
  return createHash('sha1').update(String(value)).digest('hex').slice(0, 12);
}

function resolveDerivedScope({ transcriptPath, sessionOwnerPid, cwd }) {
  const normalizedTranscript = safeString(transcriptPath).trim();
  if (normalizedTranscript) {
    return {
      scopeId: `transcript-${stableHash(normalizedTranscript)}`,
      scopeKind: 'transcript',
    };
  }

  const normalizedPid = safeString(sessionOwnerPid).trim();
  if (normalizedPid) {
    return {
      scopeId: `pid-${normalizedPid}`,
      scopeKind: 'pid',
    };
  }

  return {
    scopeId: `workspace-${stableHash(cwd || process.cwd())}`,
    scopeKind: 'workspace',
  };
}

export function resolveSessionLogScope({
  sessionId,
  threadId,
  transcriptPath,
  sessionOwnerPid,
  cwd,
} = {}) {
  const normalizedSessionId = safeString(sessionId).trim();
  if (normalizedSessionId) {
    return {
      scopeId: normalizedSessionId,
      scopeKind: 'session',
    };
  }
  const normalizedThreadId = safeString(threadId).trim();
  if (normalizedThreadId) {
    return {
      scopeId: `thread-${normalizedThreadId}`,
      scopeKind: 'thread',
    };
  }
  return resolveDerivedScope({ transcriptPath, sessionOwnerPid, cwd });
}

export function resolveSessionLogScopeId(input = {}) {
  if (typeof input === 'string') {
    return resolveSessionLogScope({ sessionId: input }).scopeId;
  }
  return resolveSessionLogScope(input).scopeId;
}

export function getSessionLogFilePath(cwd, scopeId) {
  return join(omxLogsDir(cwd), 'session-logs', `${scopeId}.jsonl`);
}

function summarizePayload(channel, eventName, payload) {
  const summary = {
    channel,
    event: eventName,
  };

  if (channel === 'notify') {
    const inputMessages = payload['input-messages'] || payload.input_messages || [];
    return {
      ...summary,
      type: safeString(payload.type || 'agent-turn-complete'),
      turn_id: safeString(payload['turn-id'] || payload.turn_id),
      last_assistant_message: safeString(payload['last-assistant-message'] || payload.last_assistant_message),
      input_messages: Array.isArray(inputMessages) ? inputMessages : [],
    };
  }

  return {
    ...summary,
    session_id: safeString(payload.session_id || payload['session-id']),
    thread_id: safeString(payload.thread_id || payload['thread-id']),
    turn_id: safeString(payload.turn_id || payload['turn-id']),
    prompt: safeString(payload.prompt || payload.input || payload.user_prompt || payload.userPrompt || payload.text),
    tool_name: safeString(payload.tool_name),
    tool_use_id: safeString(payload.tool_use_id),
  };
}

export async function readSessionLogState({ cwd, sessionId, threadId }) {
  if (!safeString(sessionId).trim() && !safeString(threadId).trim()) {
    const fallback = await findUniqueActiveSessionLogState(cwd);
    return fallback?.state ?? null;
  }
  const scopeId = resolveSessionLogScopeId({ sessionId, threadId, cwd });
  return readModeState({
    cwd,
    mode: SESSION_LOG_MODE,
    sessionId: scopeId,
  });
}

export async function enableSessionLog({
  cwd,
  sessionId,
  threadId,
  turnId,
  prompt,
  transcriptPath,
  sessionOwnerPid,
  nowIso = new Date().toISOString(),
}) {
  const { scopeId, scopeKind } = resolveSessionLogScope({
    sessionId,
    threadId,
    transcriptPath,
    sessionOwnerPid,
    cwd,
  });
  const logFilePath = getSessionLogFilePath(cwd, scopeId);
  const nextState = await writeModeState({
    cwd,
    mode: SESSION_LOG_MODE,
    sessionId: scopeId,
    patch: {
      active: true,
      current_phase: 'capturing',
      activated_at: nowIso,
      session_id: safeString(sessionId).trim() || undefined,
      thread_id: safeString(threadId).trim() || undefined,
      transcript_path: safeString(transcriptPath).trim() || undefined,
      session_owner_pid: safeString(sessionOwnerPid).trim() || undefined,
      turn_id: safeString(turnId).trim() || undefined,
      scope_id: scopeId,
      scope_kind: scopeKind,
      activated_by: '@LOG',
      trigger_prompt: safeString(prompt).trim() || undefined,
      log_file_path: logFilePath,
    },
  });

  await appendSessionLogEvent({
    cwd,
    sessionId,
    threadId,
    channel: 'control',
    eventName: 'logging-enabled',
    payload: {
      session_id: sessionId,
      thread_id: threadId,
      transcript_path: transcriptPath,
      session_owner_pid: sessionOwnerPid,
      turn_id: turnId,
      prompt,
    },
    nowIso,
  });

  return nextState;
}

async function findActiveSessionLogStates(cwd) {
  const sessionsRoot = join(omxStateDir(cwd), 'sessions');
  if (!existsSync(sessionsRoot)) return [];

  const entries = await readdir(sessionsRoot, { withFileTypes: true }).catch(() => []);
  const states = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const state = await readModeState({
      cwd,
      mode: SESSION_LOG_MODE,
      sessionId: entry.name,
    });
    if (state?.active) {
      states.push({ scopeId: entry.name, state });
    }
  }

  states.sort((a, b) => String(b.state.updated_at || '').localeCompare(String(a.state.updated_at || '')));
  return states;
}

async function findUniqueActiveSessionLogState(cwd) {
  const states = await findActiveSessionLogStates(cwd);
  if (states.length === 1) return states[0];
  return null;
}

export async function disableSessionLog({
  cwd,
  sessionId,
  threadId,
  turnId,
  reason = '@UNLOG',
  transcriptPath,
  sessionOwnerPid,
  nowIso = new Date().toISOString(),
}) {
  const scopeId = resolveSessionLogScopeId({
    sessionId,
    threadId,
    transcriptPath,
    sessionOwnerPid,
    cwd,
  });
  const existing = await readModeState({
    cwd,
    mode: SESSION_LOG_MODE,
    sessionId: scopeId,
  });
  if (!existing?.active) {
    return null;
  }

  await appendSessionLogEvent({
    cwd,
    sessionId,
    threadId,
    channel: 'control',
    eventName: 'logging-disabled',
    payload: {
      session_id: sessionId,
      thread_id: threadId,
      transcript_path: transcriptPath,
      session_owner_pid: sessionOwnerPid,
      turn_id: turnId,
      reason,
    },
    nowIso,
  });

  return writeModeState({
    cwd,
    mode: SESSION_LOG_MODE,
    sessionId: scopeId,
    patch: {
      active: false,
      current_phase: 'complete',
      completed_at: nowIso,
      disabled_reason: reason,
      turn_id: safeString(turnId).trim() || undefined,
    },
  });
}

export async function appendSessionLogEvent({
  cwd,
  sessionId,
  threadId,
  transcriptPath,
  sessionOwnerPid,
  channel,
  eventName,
  payload,
  nowIso = new Date().toISOString(),
}) {
  let scopeId = resolveSessionLogScopeId({
    sessionId,
    threadId,
    transcriptPath,
    sessionOwnerPid,
    cwd,
  });
  let state = await readModeState({
    cwd,
    mode: SESSION_LOG_MODE,
    sessionId: scopeId,
  });

  if (!state?.active) {
    const fallback = await findUniqueActiveSessionLogState(cwd);
    if (fallback) {
      scopeId = fallback.scopeId;
      state = fallback.state;
    }
  }

  if (!state?.active || !scopeId) return null;

  const logFilePath = state.log_file_path || getSessionLogFilePath(cwd, scopeId);
  await mkdir(join(omxLogsDir(cwd), 'session-logs'), { recursive: true });

  const event = {
    timestamp: nowIso,
    scope_id: scopeId,
    channel,
    event_name: eventName,
    session_id: safeString(sessionId).trim() || undefined,
    thread_id: safeString(threadId).trim() || undefined,
    summary: summarizePayload(channel, eventName, payload),
    payload,
  };

  await appendFile(logFilePath, `${JSON.stringify(event)}\n`, 'utf-8');
  return event;
}

export async function readSessionLogEntries({ cwd, sessionId, threadId, limit } = {}) {
  let scopeId = null;
  let state = null;
  if (safeString(sessionId).trim() || safeString(threadId).trim()) {
    scopeId = resolveSessionLogScopeId({ sessionId, threadId, cwd });
    state = await readModeState({
      cwd,
      mode: SESSION_LOG_MODE,
      sessionId: scopeId,
    });
  } else {
    const fallback = await findUniqueActiveSessionLogState(cwd);
    if (fallback) {
      scopeId = fallback.scopeId;
      state = fallback.state;
    }
  }

  if (!scopeId) return [];
  const logFilePath = state?.log_file_path || getSessionLogFilePath(cwd, scopeId);
  if (!existsSync(logFilePath)) return [];
  const raw = await readFile(logFilePath, 'utf-8');
  const entries = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (!limit || limit <= 0) return entries;
  return entries.slice(-limit);
}

export async function clearSessionLogState({ cwd, sessionId, threadId }) {
  const scopeId = resolveSessionLogScopeId({ sessionId, threadId, cwd });
  return clearModeState({
    cwd,
    mode: SESSION_LOG_MODE,
    sessionId: scopeId,
  });
}

export function containsLogEnableDirective(text) {
  return /(?:^|\s)@LOG\b/i.test(text);
}

export function containsLogDisableDirective(text) {
  return /(?:^|\s)@UNLOG\b/i.test(text);
}

export function stripLogDirectives(text) {
  return String(text)
    .replace(/(?:^|\s)@LOG\b/gi, ' ')
    .replace(/(?:^|\s)@UNLOG\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
