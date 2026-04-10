import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { omxLogsDir } from './paths.mjs';

export function getTracePath(cwd) {
  return join(omxLogsDir(cwd), 'oh-my-ralpha-trace.jsonl');
}

export async function appendTraceEvent({
  cwd,
  type,
  metadata = {},
  nowIso = new Date().toISOString(),
}) {
  const tracePath = getTracePath(cwd);
  await mkdir(omxLogsDir(cwd), { recursive: true });
  const event = { timestamp: nowIso, type, metadata };
  await appendFile(tracePath, `${JSON.stringify(event)}\n`, 'utf-8');
  return event;
}

export async function readTraceEvents({ cwd, limit } = {}) {
  const tracePath = getTracePath(cwd ?? process.cwd());
  if (!existsSync(tracePath)) return [];
  const raw = await readFile(tracePath, 'utf-8');
  const events = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (!limit || limit <= 0) return events;
  return events.slice(-limit);
}
