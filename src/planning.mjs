import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { omxPlansDir, omxSpecsDir } from './paths.mjs';

const PRD_PATTERN = /^prd-.*\.md$/i;
const TEST_SPEC_PATTERN = /^test-?spec-.*\.md$/i;

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
  const plansDir = omxPlansDir(cwd);
  return {
    plansDir,
    prdPaths: await listMatchingPaths(plansDir, PRD_PATTERN),
    testSpecPaths: await listMatchingPaths(plansDir, TEST_SPEC_PATTERN),
  };
}

export async function isPlanningComplete(cwd) {
  const artifacts = await readPlanningArtifacts(cwd);
  return artifacts.prdPaths.length > 0 && artifacts.testSpecPaths.length > 0;
}

export async function scaffoldPlan({ cwd, task, slug = slugify(task), overwrite = false }) {
  const plansDir = omxPlansDir(cwd);
  await mkdir(plansDir, { recursive: true });
  const prdPath = join(plansDir, `prd-${slug}.md`);
  const testSpecPath = join(plansDir, `test-spec-${slug}.md`);

  if (!overwrite && (existsSync(prdPath) || existsSync(testSpecPath))) {
    return { prdPath, testSpecPath, created: false };
  }

  const prd = `# PRD: ${task}\n\n## Goal\n- Describe the desired outcome.\n\n## Scope\n- In scope:\n- Out of scope:\n\n## Acceptance Criteria\n- Add measurable acceptance criteria here.\n`;
  const testSpec = `# Test Spec: ${task}\n\n## Narrow Proof\n- Smallest command that proves the current slice.\n\n## Broad Regression\n- Broader commands that must stay green before final approval.\n`;

  await writeFile(prdPath, prd, 'utf-8');
  await writeFile(testSpecPath, testSpec, 'utf-8');
  return { prdPath, testSpecPath, created: true };
}

export async function scaffoldInterview({ cwd, task, slug = slugify(task), overwrite = false }) {
  const specsDir = omxSpecsDir(cwd);
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
