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
  'workflow-auditor',
  'workflow_auditor',
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

  if (requireActor && role !== 'leader') {
    return {
      ok: false,
      error: 'actorRole must be "leader" for state write/clear. Manual, acceptance, reviewer, and unknown roles may read state or append verdict/trace information, but must not mutate ralpha state.',
    };
  }

  if (requireActor && !safeText(mutationReason)) {
    return {
      ok: false,
      error: 'mutationReason is required for state write/clear. The leader/main thread must record why it is changing ralpha state.',
    };
  }

  if (command === 'write' && readPatchPhase(patch) === 'awaiting_user') {
    return {
      ok: false,
      error: 'current_phase="awaiting_user" is not supported. Use current_phase="awaiting_plan_review" only after decision-complete planning artifacts are ready for user review; otherwise keep ralpha active and continue execution.',
    };
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
