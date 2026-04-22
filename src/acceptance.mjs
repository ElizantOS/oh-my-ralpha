import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { workingModelStateDir } from './paths.mjs';

const ACCEPTANCE_ROLES = new Set([
  'architect',
  'code-reviewer',
  'code-simplifier',
  'leader',
  'manual',
]);

const ACCEPTANCE_VERDICTS = new Set([
  'PASS',
  'CHANGES',
  'REJECT',
  'COMMENT',
]);

const REVIEWER_ROLES = new Set([
  'architect',
  'code-reviewer',
  'code-simplifier',
]);

const BLOCKING_REVIEWER_VERDICTS = new Set([
  'CHANGES',
  'REJECT',
]);

export const ACCEPTANCE_WAIT_DEFAULTS = Object.freeze({
  idleMs: 90_000,
  maxMs: 1_200_000,
  pollMs: 5_000,
});

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRole(role) {
  return normalizeText(role).toLowerCase();
}

function normalizeFindings(findings) {
  if (findings === undefined) return [];
  if (Array.isArray(findings)) return findings;
  return [findings];
}

function normalizeObject(value, fieldName) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object when provided`);
  }
  return value;
}

function normalizeRoles(roles) {
  if (roles === undefined) return [...REVIEWER_ROLES];
  const values = Array.isArray(roles) ? roles : [roles];
  return values
    .flatMap((value) => String(value).split(','))
    .map(normalizeRole)
    .filter(Boolean);
}

function parseRecordLine(line) {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getAcceptancePath(cwd) {
  return join(workingModelStateDir(cwd), 'acceptance-records.ndjson');
}

export async function submitAcceptance({
  cwd,
  sliceId,
  role,
  verdict,
  summary,
  findings,
  suggestedLedgerText,
  evidence,
  nowIso = new Date().toISOString(),
}) {
  const normalizedSliceId = normalizeText(sliceId);
  if (!normalizedSliceId) throw new Error('sliceId is required for acceptance submit');

  const normalizedRole = normalizeRole(role);
  if (!ACCEPTANCE_ROLES.has(normalizedRole)) {
    throw new Error(`role must be one of: ${[...ACCEPTANCE_ROLES].join(', ')}`);
  }

  const normalizedVerdict = normalizeText(verdict);
  if (!ACCEPTANCE_VERDICTS.has(normalizedVerdict)) {
    throw new Error(`verdict must be one of: ${[...ACCEPTANCE_VERDICTS].join(', ')}`);
  }

  const acceptancePath = getAcceptancePath(cwd);
  await mkdir(workingModelStateDir(cwd), { recursive: true });

  const record = {
    record_id: randomUUID(),
    created_at: nowIso,
    slice_id: normalizedSliceId,
    role: normalizedRole,
    verdict: normalizedVerdict,
    summary: normalizeText(summary),
    findings: normalizeFindings(findings),
    suggested_ledger_text: normalizeText(suggestedLedgerText),
    evidence: normalizeObject(evidence, 'evidence'),
    append_only: true,
  };

  await appendFile(acceptancePath, `${JSON.stringify(record)}\n`, 'utf-8');
  return { acceptancePath, record };
}

export async function listAcceptance({
  cwd,
  sliceId,
  role,
  limit,
}) {
  const acceptancePath = getAcceptancePath(cwd);
  if (!existsSync(acceptancePath)) return { acceptancePath, records: [] };

  const normalizedSliceId = normalizeText(sliceId);
  const normalizedRole = normalizeRole(role);
  const raw = await readFile(acceptancePath, 'utf-8').catch(() => '');
  let records = raw
    .split('\n')
    .map(parseRecordLine)
    .filter(Boolean);

  if (normalizedSliceId) {
    records = records.filter((record) => record.slice_id === normalizedSliceId);
  }
  if (normalizedRole) {
    records = records.filter((record) => record.role === normalizedRole);
  }
  if (Number.isInteger(limit) && limit > 0) {
    records = records.slice(-limit);
  }

  return { acceptancePath, records };
}

export function summarizeAcceptanceRecords(records, {
  roles,
} = {}) {
  const reviewerRoles = new Set(normalizeRoles(roles));
  const reviewerRecords = records.filter((record) => reviewerRoles.has(normalizeRole(record.role)));
  const latestByRole = {};

  for (const record of reviewerRecords) {
    latestByRole[normalizeRole(record.role)] = record;
  }

  const latestReviewerRecords = Object.values(latestByRole);
  const blockingRecords = latestReviewerRecords.filter((record) =>
    BLOCKING_REVIEWER_VERDICTS.has(normalizeText(record.verdict)),
  );

  return {
    roles: [...reviewerRoles],
    latest_by_role: latestByRole,
    latest_reviewer_records: latestReviewerRecords,
    blocking_records: blockingRecords,
    has_reviewer_evidence: reviewerRecords.length > 0,
    has_blocking_reviewer_verdict: blockingRecords.length > 0,
    can_record_manual_pass: blockingRecords.length === 0,
    instruction: blockingRecords.length > 0
      ? 'Do not record leader/manual PASS or degraded acceptance. Fix or explicitly schedule the reviewer CHANGES/REJECT findings, rerun fresh proof, then repeat reviewer acceptance.'
      : 'No unresolved reviewer CHANGES/REJECT verdicts are present in the latest reviewer evidence for this slice.',
  };
}

export async function summarizeAcceptance({
  cwd,
  sliceId,
  role,
  limit,
  roles,
}) {
  const listed = await listAcceptance({ cwd, sliceId, role, limit });
  return {
    ...listed,
    gate: summarizeAcceptanceRecords(listed.records, { roles }),
  };
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function hashText(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

async function statFingerprint(path) {
  if (!path) return { exists: false, fingerprint: 'not-configured' };
  try {
    const info = await stat(path);
    return {
      exists: true,
      path,
      size: info.size,
      mtime_ms: info.mtimeMs,
      fingerprint: `${info.size}:${info.mtimeMs}`,
    };
  } catch (error) {
    return {
      exists: false,
      path,
      error: error instanceof Error ? error.message : String(error),
      fingerprint: 'missing',
    };
  }
}

function captureTmuxPane(tmuxTarget) {
  if (!tmuxTarget) return { configured: false, fingerprint: 'not-configured' };
  const result = spawnSync('tmux', ['capture-pane', '-pt', tmuxTarget, '-S', '-200'], {
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    return {
      configured: true,
      target: tmuxTarget,
      ok: false,
      error: (result.stderr || result.stdout || `tmux exited ${result.status}`).trim(),
      fingerprint: `error:${result.status}:${hashText(result.stderr || result.stdout || '')}`,
    };
  }
  const output = result.stdout ?? '';
  return {
    configured: true,
    target: tmuxTarget,
    ok: true,
    length: output.length,
    tail: output.split('\n').slice(-20).join('\n'),
    fingerprint: hashText(output),
  };
}

async function sampleActivity({ acceptancePath, logPath, tmuxTarget, capturePane = captureTmuxPane }) {
  return {
    acceptance: await statFingerprint(acceptancePath),
    log: await statFingerprint(logPath),
    tmux: capturePane(tmuxTarget),
  };
}

function changedActivitySources(previous, current) {
  if (!previous) return [];
  return Object.entries(current)
    .filter(([source, value]) => previous[source]?.fingerprint !== value?.fingerprint)
    .map(([source]) => source);
}

function classifyAcceptance(summary, requiredRoles) {
  if (summary.gate.has_blocking_reviewer_verdict) {
    return 'blocked';
  }
  const latest = summary.gate.latest_by_role;
  const allPass = requiredRoles.length > 0
    && requiredRoles.every((role) => latest[role]?.verdict === 'PASS');
  return allPass ? 'accepted' : 'pending';
}

function waitResult({
  status,
  cwd,
  sliceId,
  requiredRoles,
  summary,
  timeouts,
  startedAt,
  now,
  lastActivityAt,
  lastActivitySource,
  activityResets,
  observed,
  tmuxTarget,
  logPath,
}) {
  return {
    status,
    cwd,
    slice_id: sliceId,
    roles: requiredRoles,
    acceptancePath: summary.acceptancePath,
    records: summary.records,
    gate: summary.gate,
    activity: {
      started_at: new Date(startedAt).toISOString(),
      last_activity_at: new Date(lastActivityAt).toISOString(),
      last_activity_source: lastActivitySource,
      activity_resets: activityResets,
      observed,
      tmux_target: tmuxTarget ?? '',
      log_path: logPath ?? '',
    },
    timeouts: {
      idle_ms: timeouts.idleMs,
      max_ms: timeouts.maxMs,
      poll_ms: timeouts.pollMs,
      elapsed_ms: Math.max(0, now - startedAt),
      idle_for_ms: Math.max(0, now - lastActivityAt),
    },
  };
}

export async function waitForAcceptance({
  cwd,
  sliceId,
  role,
  roles,
  tmuxTarget,
  logPath,
  idleMs,
  maxMs,
  pollMs,
  now = () => Date.now(),
  sleepFn = sleep,
  capturePane = captureTmuxPane,
} = {}) {
  const normalizedSliceId = normalizeText(sliceId);
  if (!normalizedSliceId) throw new Error('sliceId is required for acceptance wait');

  const requiredRoles = normalizeRoles(roles ?? role);
  const timeouts = {
    idleMs: normalizePositiveInteger(idleMs, ACCEPTANCE_WAIT_DEFAULTS.idleMs),
    maxMs: normalizePositiveInteger(maxMs, ACCEPTANCE_WAIT_DEFAULTS.maxMs),
    pollMs: normalizePositiveInteger(pollMs, ACCEPTANCE_WAIT_DEFAULTS.pollMs),
  };
  const startedAt = now();
  let lastActivityAt = startedAt;
  let lastActivitySource = 'start';
  const activityResets = [];
  let observed = null;
  let summary = await summarizeAcceptance({ cwd, sliceId: normalizedSliceId, roles: requiredRoles });

  while (true) {
    const current = now();
    const classification = classifyAcceptance(summary, requiredRoles);
    if (classification === 'accepted' || classification === 'blocked') {
      return waitResult({
        status: classification,
        cwd,
        sliceId: normalizedSliceId,
        requiredRoles,
        summary,
        timeouts,
        startedAt,
        now: current,
        lastActivityAt,
        lastActivitySource,
        activityResets,
        observed,
        tmuxTarget,
        logPath,
      });
    }

    observed ??= await sampleActivity({
      acceptancePath: summary.acceptancePath,
      logPath,
      tmuxTarget,
      capturePane,
    });

    if (current - startedAt >= timeouts.maxMs) {
      return waitResult({
        status: 'max_timeout',
        cwd,
        sliceId: normalizedSliceId,
        requiredRoles,
        summary,
        timeouts,
        startedAt,
        now: current,
        lastActivityAt,
        lastActivitySource,
        activityResets,
        observed,
        tmuxTarget,
        logPath,
      });
    }

    if (current - lastActivityAt >= timeouts.idleMs) {
      return waitResult({
        status: 'idle_timeout',
        cwd,
        sliceId: normalizedSliceId,
        requiredRoles,
        summary,
        timeouts,
        startedAt,
        now: current,
        lastActivityAt,
        lastActivitySource,
        activityResets,
        observed,
        tmuxTarget,
        logPath,
      });
    }

    const sleepMs = Math.max(
      0,
      Math.min(
        timeouts.pollMs,
        timeouts.maxMs - (current - startedAt),
        timeouts.idleMs - (current - lastActivityAt),
      ),
    );
    if (sleepMs > 0) {
      await sleepFn(sleepMs);
    }

    summary = await summarizeAcceptance({ cwd, sliceId: normalizedSliceId, roles: requiredRoles });
    const nextObserved = await sampleActivity({
      acceptancePath: summary.acceptancePath,
      logPath,
      tmuxTarget,
      capturePane,
    });
    const changedSources = changedActivitySources(observed, nextObserved);
    observed = nextObserved;

    if (changedSources.length > 0) {
      const activityAt = now();
      lastActivityAt = activityAt;
      lastActivitySource = changedSources.join(',');
      activityResets.push({
        at: new Date(activityAt).toISOString(),
        sources: changedSources,
      });
    }
  }
}
