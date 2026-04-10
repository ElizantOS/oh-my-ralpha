import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { omxContextDir, omxStateDir } from './paths.mjs';
import { slugify } from './planning.mjs';

function utcTimestamp(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function todoTemplate(task) {
  return `# ${task} TODO\n\n## \`T-01\`\n- \`title\`: Plan and execute the first slice for ${task}\n- \`priority\`: P0\n- \`status\`: pending\n- \`implementation overview\`: Replace this starter TODO with the first real slice before implementation.\n- \`acceptance\`: The first real slice is clearly bounded and has proof commands.\n- \`evidence\`:\n`;
}

function roundsTemplate(task, slug) {
  return JSON.stringify({
    task: slug,
    current_iteration: 1,
    max_iterations: 40,
    current_focus: `Initialize workboard for ${task}`,
    completed_todos: [],
    next_todo: 'T-01',
    blocked_todos: [],
    verification_evidence: {},
    remaining_todos: ['T-01'],
    done_when: [
      'Context snapshot exists',
      'TODO workboard exists',
      'Rounds ledger exists',
      'The first real slice is decomposed before implementation',
    ],
  }, null, 2) + '\n';
}

function contextTemplate(task) {
  return `# ${task} Context Snapshot\n\n- Task statement: ${task}\n- Desired outcome:\n- Known facts/evidence:\n- Constraints:\n- Unknowns/open questions:\n- Likely codebase touchpoints:\n`;
}

async function findLatestContextSnapshot(contextDir, slug) {
  const prefix = `${slug}-`;
  const entries = await readdir(contextDir).catch(() => []);
  return entries
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => join(contextDir, entry))
    .at(-1) ?? null;
}

export async function initWorkspace({
  cwd,
  task,
  slug = slugify(task),
  overwrite = false,
  now = new Date(),
}) {
  const contextDir = omxContextDir(cwd);
  const stateDir = omxStateDir(cwd);
  await mkdir(contextDir, { recursive: true });
  await mkdir(stateDir, { recursive: true });

  const contextPath = join(contextDir, `${slug}-${utcTimestamp(now)}.md`);
  const todoPath = join(stateDir, `${slug}-todo.md`);
  const roundsPath = join(stateDir, `${slug}-rounds.json`);

  if (!overwrite && (existsSync(todoPath) || existsSync(roundsPath))) {
    return {
      contextPath: await findLatestContextSnapshot(contextDir, slug),
      todoPath,
      roundsPath,
      created: false,
    };
  }

  await writeFile(contextPath, contextTemplate(task), 'utf-8');
  await writeFile(todoPath, todoTemplate(task), 'utf-8');
  await writeFile(roundsPath, roundsTemplate(task, slug), 'utf-8');
  return { contextPath, todoPath, roundsPath, created: true };
}
