import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { workingModelStateDir } from './paths.mjs';
import { deepMerge, readJsonIfExists, writeJson } from './json-file.mjs';

function normalizeMode(mode) {
  if (!mode || typeof mode !== 'string') {
    throw new Error('mode is required');
  }
  return mode.trim();
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
