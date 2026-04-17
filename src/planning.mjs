import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  workingModelContextDir,
  workingModelPlansDir,
  workingModelSpecsDir,
  workingModelStateDir,
} from './paths.mjs';

const PRD_PATTERN = /^prd-.*\.md$/i;
const TEST_SPEC_PATTERN = /^test-?spec-.*\.md$/i;
const CONTEXT_PATTERN = /.*\.md$/i;
const TODO_PATTERN = /.*-todo\.md$/i;
const ROUNDS_PATTERN = /.*-rounds\.json$/i;

const PLACEHOLDER_PATTERNS = [
  /TODO:/i,
  /TBD/i,
  /Describe the desired outcome\./i,
  /Add measurable acceptance criteria here\./i,
  /Smallest command that proves/i,
  /Broader commands that must stay green/i,
  /Replace this starter TODO/i,
  /Initialize workboard for/i,
  /The first real slice is decomposed before implementation/i,
];

const PRD_SECTIONS = [
  'Goal',
  'Current State / Evidence',
  'Scope',
  'Constraints',
  'Success Criteria',
  'Assumptions',
  'Open Questions',
  'Approach',
  'Interfaces / APIs / Schemas / I/O',
  'Data Flow',
  'Edge Cases / Failure Modes',
  'Compatibility / Migration Notes',
  'Execution Slices',
];

const TEST_SPEC_SECTIONS = [
  'Narrow Proof',
  'Broad Regression',
  'Integration / Manual Scenarios',
  'Acceptance Evidence',
];

export function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    || 'task';
}

async function listMatchingPaths(dir, pattern) {
  if (!existsSync(dir)) return [];
  return (await readdir(dir))
    .filter((file) => pattern.test(file))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => join(dir, file));
}

export async function readPlanningArtifacts(cwd) {
  const plansDir = workingModelPlansDir(cwd);
  const contextDir = workingModelContextDir(cwd);
  const stateDir = workingModelStateDir(cwd);
  const prdPaths = await listMatchingPaths(plansDir, PRD_PATTERN);
  const testSpecPaths = await listMatchingPaths(plansDir, TEST_SPEC_PATTERN);
  const contextPaths = await listMatchingPaths(contextDir, CONTEXT_PATTERN);
  const todoPaths = await listMatchingPaths(stateDir, TODO_PATTERN);
  const roundsPaths = await listMatchingPaths(stateDir, ROUNDS_PATTERN);
  const status = await planningArtifactStatus({
    prdPaths,
    testSpecPaths,
    contextPaths,
    todoPaths,
    roundsPaths,
  });

  return {
    plansDir,
    contextDir,
    stateDir,
    prdPaths,
    testSpecPaths,
    contextPaths,
    todoPaths,
    roundsPaths,
    latest: {
      prdPath: prdPaths.at(-1) ?? null,
      testSpecPath: testSpecPaths.at(-1) ?? null,
      contextPath: contextPaths.at(-1) ?? null,
      todoPath: todoPaths.at(-1) ?? null,
      roundsPath: roundsPaths.at(-1) ?? null,
    },
    status,
    complete: status.complete,
  };
}

export async function isPlanningComplete(cwd) {
  const artifacts = await readPlanningArtifacts(cwd);
  return artifacts.complete;
}

function sectionPattern(section) {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^#{2,3}\\s+${escaped}\\s*$`, 'im');
}

function hasSections(content, sections) {
  return sections.every((section) => sectionPattern(section).test(content));
}

function hasNoPlaceholders(content) {
  return !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(content));
}

function contextHasFilledFields(content) {
  const fields = [
    'Task statement',
    'Desired outcome',
    'Known facts/evidence',
    'Constraints',
    'Unknowns/open questions',
    'Likely codebase touchpoints',
  ];
  return fields.every((field) => {
    const pattern = new RegExp(`^-\\s*${field}:\\s*\\S`, 'im');
    return pattern.test(content);
  });
}

function todoIsComplete(content) {
  return /`status`:\s*(?:pending|in_progress|completed)/i.test(content)
    && /`implementation overview`:\s*\S/i.test(content)
    && /`acceptance`:\s*\S/i.test(content)
    && /`evidence`:\s*\S/i.test(content)
    && hasNoPlaceholders(content);
}

function roundsIsComplete(content) {
  try {
    const parsed = JSON.parse(content);
    return typeof parsed.current_focus === 'string'
      && parsed.current_focus.trim().length > 0
      && parsed.current_focus !== `Initialize workboard for ${parsed.task}`
      && typeof parsed.next_todo === 'string'
      && parsed.next_todo.trim().length > 0
      && Array.isArray(parsed.remaining_todos)
      && parsed.remaining_todos.length > 0
      && hasNoPlaceholders(content);
  } catch {
    return false;
  }
}

function shouldRefreshStarterTemplate(content, sections) {
  return content.trim().length === 0
    || (!hasSections(content, sections) && !hasNoPlaceholders(content));
}

async function newestComplete(paths, predicate) {
  for (const path of [...paths].reverse()) {
    const content = await readFile(path, 'utf-8').catch(() => '');
    if (predicate(content)) return { path, complete: true };
  }
  return { path: paths.at(-1) ?? null, complete: false };
}

async function planningArtifactStatus({
  prdPaths,
  testSpecPaths,
  contextPaths,
  todoPaths,
  roundsPaths,
}) {
  const prd = await newestComplete(prdPaths, (content) =>
    hasSections(content, PRD_SECTIONS) && hasNoPlaceholders(content),
  );
  const testSpec = await newestComplete(testSpecPaths, (content) =>
    hasSections(content, TEST_SPEC_SECTIONS) && hasNoPlaceholders(content),
  );
  const context = await newestComplete(contextPaths, (content) =>
    contextHasFilledFields(content) && hasNoPlaceholders(content),
  );
  const todo = await newestComplete(todoPaths, todoIsComplete);
  const rounds = await newestComplete(roundsPaths, roundsIsComplete);
  const entries = { prd, testSpec, context, todo, rounds };
  return {
    ...entries,
    complete: Object.values(entries).every((entry) => entry.complete),
  };
}

export async function scaffoldPlan({ cwd, task, slug = slugify(task), overwrite = false }) {
  const plansDir = workingModelPlansDir(cwd);
  await mkdir(plansDir, { recursive: true });
  const prdPath = join(plansDir, `prd-${slug}.md`);
  const testSpecPath = join(plansDir, `test-spec-${slug}.md`);

  const prd = `# PRD: ${task}\n\n## Goal\n- TODO: State the concrete outcome and why it matters.\n\n## Current State / Evidence\n- TODO: Summarize observed repo state, failing behavior, user evidence, and relevant files.\n\n## Scope\n- In scope: TODO: Name the exact behavior/files/workflows covered.\n- Out of scope: TODO: Name adjacent work intentionally excluded.\n\n## Constraints\n- TODO: List compatibility, dependency, safety, sandbox, and no-new-dependency constraints.\n\n## Success Criteria\n- TODO: Define measurable acceptance criteria that prove the task is done.\n\n## Assumptions\n- TODO: Record assumptions that can be safely made before implementation.\n\n## Open Questions\n- TODO: Record unresolved questions or explicitly say none.\n\n## Approach\n- TODO: Explain the implementation strategy at a decision-complete level.\n\n## Interfaces / APIs / Schemas / I/O\n- TODO: Name changed commands, functions, files, schemas, arguments, and outputs.\n\n## Data Flow\n- TODO: Describe how input moves through routing/state/artifact/update paths.\n\n## Edge Cases / Failure Modes\n- TODO: List edge cases, expected failures, and recovery behavior.\n\n## Compatibility / Migration Notes\n- TODO: Describe backwards compatibility and migration behavior.\n\n## Execution Slices\n- TODO: Break execution into bounded slices with acceptance evidence for each slice.\n`;
  const testSpec = `# Test Spec: ${task}\n\n## Narrow Proof\n- TODO: Smallest command or assertion that proves the first execution slice.\n\n## Broad Regression\n- TODO: Broader test, lint, build, or verify commands that must remain green.\n\n## Integration / Manual Scenarios\n- TODO: Manual or integration scenarios that cover user-visible behavior.\n\n## Acceptance Evidence\n- TODO: Exact evidence to copy into workboard/rounds before execution is considered done.\n`;

  let created = false;
  let refreshed = false;
  const existingPrd = existsSync(prdPath)
    ? await readFile(prdPath, 'utf-8').catch(() => '')
    : null;
  const existingTestSpec = existsSync(testSpecPath)
    ? await readFile(testSpecPath, 'utf-8').catch(() => '')
    : null;

  if (overwrite || existingPrd == null || shouldRefreshStarterTemplate(existingPrd, PRD_SECTIONS)) {
    await writeFile(prdPath, prd, 'utf-8');
    created ||= existingPrd == null;
    refreshed ||= existingPrd != null && !overwrite;
  }

  if (
    overwrite
    || existingTestSpec == null
    || shouldRefreshStarterTemplate(existingTestSpec, TEST_SPEC_SECTIONS)
  ) {
    await writeFile(testSpecPath, testSpec, 'utf-8');
    created ||= existingTestSpec == null;
    refreshed ||= existingTestSpec != null && !overwrite;
  }

  return { prdPath, testSpecPath, created, refreshed };
}

export async function scaffoldInterview({ cwd, task, slug = slugify(task), overwrite = false }) {
  const specsDir = workingModelSpecsDir(cwd);
  await mkdir(specsDir, { recursive: true });
  const specPath = join(specsDir, `deep-interview-${slug}.md`);
  if (!overwrite && existsSync(specPath)) {
    return { specPath, created: false };
  }
  const content = `# Deep Interview Spec: ${task}\n\n## Why\n- Why does this matter?\n\n## Boundaries\n- What must stay unchanged?\n\n## Risks\n- What would make this unsafe or too broad?\n\n## Acceptance\n- What proves this is done?\n`;
  await writeFile(specPath, content, 'utf-8');
  return { specPath, created: true };
}

export function latestPlanningSlug(paths) {
  const last = paths.at(-1);
  if (!last) return null;
  return basename(last).replace(/^(?:prd|test-?spec)-/i, '').replace(/\.md$/i, '');
}
