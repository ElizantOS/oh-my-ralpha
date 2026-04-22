import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { workingModelStateDir } from './paths.mjs';
import { deepMerge, readJsonIfExists, writeJson } from './json-file.mjs';

const BLOCKED_STATE_MUTATION_ROLES = new Set([
  'architect',
  'code-reviewer',
  'code_reviewer',
  'code-simplifier',
  'code_simplifier',
  'reviewer',
  'simplifier',
  'subagent',
  'sub-agent',
  'acceptance',
  'acceptance-agent',
  'acceptance_agent',
]);

function normalizeMode(mode) {
  if (!mode || typeof mode !== 'string') {
    throw new Error('mode is required');
  }
  return mode.trim();
}

function normalizeRole(role) {
  return typeof role === 'string' ? role.trim().toLowerCase() : '';
}

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function readPatchPhase(patch) {
  if (!patch || typeof patch !== 'object') return '';
  return safeText(patch.current_phase || patch.currentPhase);
}

function readAwaitingUserReason(patch, mutationReason) {
  if (!patch || typeof patch !== 'object') return safeText(mutationReason);
  const nested = patch.state && typeof patch.state === 'object' ? patch.state : {};
  return safeText(
    nested.awaiting_user_reason
      || nested.awaiting_user_prompt
      || patch.awaiting_user_reason
      || patch.awaiting_user_prompt
      || mutationReason,
  );
}

function isSubagentWaitReason(reason) {
  const text = safeText(reason);
  if (!text) return false;
  const namesSubagentWork = /sub-?agent|native agent|acceptance agent|architect|code-reviewer|code-simplifier|reviewer|simplifier/i.test(text);
  const namesWaiting = /wait|waiting|await|pending|timeout|timed out|capacity|limit|cap|等|等待|超时|上限/i.test(text);
  const namesUserDecision = /user.*(decision|input|approval|clarification)|human.*(decision|input|approval|clarification)|(decision|input|approval|clarification).*user|用户|人工|确认|澄清/i.test(text);
  return namesSubagentWork && namesWaiting && !namesUserDecision;
}

function isRealUserWaitReason(reason) {
  const text = safeText(reason);
  if (!text) return false;
  return /user|human|operator|decision|input|approval|clarification|用户|人工|确认|澄清|批准|输入/.test(text);
}

export function validateStateMutation({
  command,
  patch,
  actorRole,
  mutationReason,
  requireActor = false,
}) {
  if (command !== 'write' && command !== 'clear') return { ok: true };

  const role = normalizeRole(actorRole);
  if (requireActor && !role) {
    return {
      ok: false,
      error: 'actorRole is required for state write/clear. Use actorRole="leader" only from the leader/main thread; acceptance subagents may read state or append information through ralpha_trace, but must not mutate it.',
    };
  }

  if (BLOCKED_STATE_MUTATION_ROLES.has(role)) {
    return {
      ok: false,
      error: `actorRole="${actorRole}" is append-only for ralpha workflow information and read-only for ralpha state. Acceptance subagents must use ralpha verdict, return PASS/CHANGES, or suggest ledger text; the leader/main thread writes state.`,
    };
  }

  if (command === 'write' && readPatchPhase(patch) === 'awaiting_user') {
    const reason = readAwaitingUserReason(patch, mutationReason);
    if (!reason) {
      return {
        ok: false,
        error: 'current_phase="awaiting_user" requires state.awaiting_user_reason or mutationReason describing the user input needed.',
      };
    }
    if (isSubagentWaitReason(reason)) {
      return {
        ok: false,
        error: 'current_phase="awaiting_user" is only for real user input, not waiting for subagents/reviewers/simplifiers. Record degraded acceptance evidence or continue the leader-owned workflow instead.',
      };
    }
    if (!isRealUserWaitReason(reason)) {
      return {
        ok: false,
        error: 'current_phase="awaiting_user" must clearly name the user/human decision, input, approval, or clarification needed.',
      };
    }
  }

  return { ok: true };
}

export function getModeStatePath(cwd, mode, sessionId) {
  const normalizedMode = normalizeMode(mode);
  const base = workingModelStateDir(cwd);
  if (sessionId) {
    return join(base, 'sessions', sessionId, `${normalizedMode}-state.json`);
  }
  return join(base, `${normalizedMode}-state.json`);
}

export async function readModeState({ cwd, mode, sessionId }) {
  return readJsonIfExists(getModeStatePath(cwd, mode, sessionId));
}

export async function writeModeState({
  cwd,
  mode,
  sessionId,
  patch,
  replace = false,
  nowIso = new Date().toISOString(),
}) {
  const statePath = getModeStatePath(cwd, mode, sessionId);
  const existing = replace ? null : await readJsonIfExists(statePath);
  const base = existing ?? { mode };
  const merged = replace ? { mode, ...patch } : deepMerge(base, patch ?? {});
  merged.mode = mode;
  if (!merged.updated_at) {
    merged.updated_at = nowIso;
  } else if (!replace) {
    merged.updated_at = nowIso;
  }
  await writeJson(statePath, merged);
  return merged;
}

export async function clearModeState({ cwd, mode, sessionId }) {
  const statePath = getModeStatePath(cwd, mode, sessionId);
  if (!existsSync(statePath)) return false;
  await rm(statePath, { force: true });
  return true;
}
