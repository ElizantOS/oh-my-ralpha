import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initWorkspace } from '../src/init.mjs';
import { scaffoldInterview, scaffoldPlan } from '../src/planning.mjs';
import { readModeState, writeModeState, clearModeState } from '../src/state.mjs';
import { appendTraceEvent, readTraceEvents } from '../src/trace.mjs';
import { routePrompt } from '../src/router.mjs';
import { doctorReport } from '../src/doctor.mjs';
import { installSkill } from '../src/install.mjs';
import { runCli } from '../src/cli.mjs';

async function makeTempWorkspace(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeCompletePlanningArtifacts(cwd, task = 'Complete planning task') {
  const init = await initWorkspace({ cwd, task });
  const plan = await scaffoldPlan({ cwd, task });
  await writeFile(init.contextPath, `# ${task} Context Snapshot

- Task statement: ${task}
- Desired outcome: Ship a bounded implementation safely.
- Known facts/evidence: Existing runtime, routing, and test files are available.
- Constraints: Node-only runtime and no new dependencies.
- Unknowns/open questions: None.
- Likely codebase touchpoints: src/router.mjs, src/native-hook.mjs, test/runtime.test.mjs.
`, 'utf-8');
  await writeFile(init.todoPath, `# ${task} TODO

## \`T-01\`
- \`title\`: Implement the bounded execution slice
- \`priority\`: P0
- \`status\`: pending
- \`implementation overview\`: Update the routed behavior and keep changes scoped.
- \`acceptance\`: Route output distinguishes planning and execution phases.
- \`evidence\`: npm test passes.
`, 'utf-8');
  await writeFile(init.roundsPath, JSON.stringify({
    task: 'complete-planning-task',
    current_iteration: 1,
    max_iterations: 40,
    current_focus: 'Implement bounded execution slice',
    completed_todos: [],
    next_todo: 'T-01',
    blocked_todos: [],
    verification_evidence: {},
    remaining_todos: ['T-01'],
    done_when: ['npm test passes'],
  }, null, 2) + '\n', 'utf-8');
  await writeFile(plan.prdPath, `# PRD: ${task}

## Goal
- Ship the requested behavior with a bounded implementation.

## Current State / Evidence
- The repo has runtime routing, native hooks, and Node tests.

## Scope
- In scope: Route planning and execution phases.
- Out of scope: Codex host collaboration-mode changes.

## Constraints
- Node-only runtime and no new dependencies.

## Success Criteria
- Vague prompts enter planning and concrete prompts enter execution only after planning is complete.

## Assumptions
- Existing trigger phrases remain stable.

## Open Questions
- None.

## Approach
- Use artifact completeness to choose planning or execution phase.

## Interfaces / APIs / Schemas / I/O
- routePrompt returns phase and planning artifact status.

## Data Flow
- Prompt detection reads artifacts, writes skill state, then returns phase.

## Edge Cases / Failure Modes
- Missing or placeholder artifacts remain planning phase.

## Compatibility / Migration Notes
- Existing route fields remain present where possible.

## Execution Slices
- T-01: Implement route behavior and verify with npm test.
`, 'utf-8');
  await writeFile(plan.testSpecPath, `# Test Spec: ${task}

## Narrow Proof
- Run targeted router tests.

## Broad Regression
- Run npm test.

## Integration / Manual Scenarios
- Trigger vague and concrete ralpha prompts.

## Acceptance Evidence
- Route output and mode state match expected phases.
`, 'utf-8');
  return { init, plan };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('oh-my-ralpha standalone runtime', () => {
  it('initializes truth-source files for a new task', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-init-');
    const result = await initWorkspace({
      cwd,
      task: 'Bootstrap standalone runtime',
      now: new Date('2026-04-10T08:00:00.000Z'),
    });

    assert.equal(result.created, true);
    assert.equal(existsSync(result.contextPath), true);
    assert.equal(existsSync(result.todoPath), true);
    assert.equal(existsSync(result.roundsPath), true);

    const todo = await readFile(result.todoPath, 'utf-8');
    assert.match(todo, /`implementation overview`/);
    assert.match(todo, /`acceptance`/);
    assert.match(todo, /`evidence`/);
  });

  it('supports mode state read, write, and clear', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-state-');
    const written = await writeModeState({
      cwd,
      mode: 'oh-my-ralpha',
      patch: { active: true, current_phase: 'executing' },
    });

    assert.equal(written.mode, 'oh-my-ralpha');
    assert.equal(written.active, true);

    const readBack = await readModeState({ cwd, mode: 'oh-my-ralpha' });
    assert.equal(readBack.active, true);
    assert.equal(readBack.current_phase, 'executing');

    const cleared = await clearModeState({ cwd, mode: 'oh-my-ralpha' });
    assert.equal(cleared, true);
    assert.equal(await readModeState({ cwd, mode: 'oh-my-ralpha' }), null);
  });

  it('supports local trace append and show', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-trace-');
    await appendTraceEvent({ cwd, type: 'test', metadata: { a: 1 }, nowIso: '2026-04-10T00:00:00.000Z' });
    await appendTraceEvent({ cwd, type: 'test', metadata: { a: 2 }, nowIso: '2026-04-10T00:00:01.000Z' });

    const events = await readTraceEvents({ cwd, limit: 1 });
    assert.equal(events.length, 1);
    assert.equal(events[0].metadata.a, 2);
  });

  it('scaffolds plan and interview artifacts', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-plan-');
    const plan = await scaffoldPlan({ cwd, task: 'Ship runtime parity' });
    const interview = await scaffoldInterview({ cwd, task: 'Ship runtime parity' });

    assert.equal(plan.created, true);
    assert.equal(interview.created, true);
    assert.equal(existsSync(plan.prdPath), true);
    assert.equal(existsSync(plan.testSpecPath), true);
    assert.equal(existsSync(interview.specPath), true);
  });

  it('supports workflow command group aliases in the CLI', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-workflow-cli-');
    const originalLog = console.log;
    const lines = [];
    console.log = (value) => {
      lines.push(String(value));
    };
    try {
      await runCli(['workflow', 'init', '--cwd', cwd, '--task', 'Workflow CLI task']);
      await runCli(['workflow', 'plan', '--cwd', cwd, '--task', 'Workflow CLI task']);
      await runCli(['workflow', 'interview', '--cwd', cwd, '--task', 'Workflow CLI task']);
      await runCli(['workflow', 'route', '--cwd', cwd, '--text', '$ralpha update src/router.mjs with activation tests']);
    } finally {
      console.log = originalLog;
    }

    const parsed = lines.map((line) => JSON.parse(line));
    assert.equal(parsed[0].created, true);
    assert.equal(existsSync(parsed[1].prdPath), true);
    assert.equal(existsSync(parsed[2].specPath), true);
    assert.equal(parsed[3].phase, 'planning');
    assert.equal(parsed[3].finalSkill, 'ralplan');
  });

  it('routes vague prompts to planning phase before execution activation', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-route-gate-');
    const result = await routePrompt({
      cwd,
      text: '$ralpha fix this',
      activate: true,
    });

    assert.equal(result.matched, true);
    assert.equal(result.gateApplied, true);
    assert.equal(result.phase, 'planning');
    assert.equal(result.finalSkill, 'ralplan');
    assert.equal(result.activation.phase, 'planning');
    assert.equal(await readModeState({ cwd, mode: 'oh-my-ralpha' }), null);
  });

  it('does not route acceptance subagent prompts back into oh-my-ralpha', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-acceptance-routing-');
    const result = await routePrompt({
      cwd,
      text: 'Review the oh-my-ralpha P0-01 slice and mention ralpha safely.',
      activate: true,
    });

    assert.equal(result.matched, false);
    assert.equal(result.finalSkill, null);
    assert.equal(await readModeState({ cwd, mode: 'oh-my-ralpha' }), null);
  });

  it('keeps placeholder planning artifacts incomplete', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-route-existing-plan-');
    await scaffoldPlan({ cwd, task: 'Existing unrelated plan' });
    const result = await routePrompt({
      cwd,
      text: '$ralpha fix this',
      activate: true,
    });

    assert.equal(result.planningComplete, false);
    assert.equal(result.gateApplied, true);
    assert.equal(result.phase, 'planning');
    assert.equal(result.finalSkill, 'ralplan');
  });

  it('recognizes complete planning artifacts', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-route-complete-plan-');
    await writeCompletePlanningArtifacts(cwd);
    const result = await routePrompt({
      cwd,
      text: '$ralpha update src/router.mjs with activation tests',
      activate: false,
    });

    assert.equal(result.planningComplete, true);
    assert.equal(result.planningArtifacts.status.prd.complete, true);
    assert.equal(result.planningArtifacts.status.testSpec.complete, true);
    assert.equal(result.planningArtifacts.status.context.complete, true);
    assert.equal(result.planningArtifacts.status.todo.complete, true);
    assert.equal(result.planningArtifacts.status.rounds.complete, true);
  });

  it('activates oh-my-ralpha and seeds runtime state when the prompt is well specified', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-route-activate-');
    await writeCompletePlanningArtifacts(cwd, 'Implement runtime route activation');
    const result = await routePrompt({
      cwd,
      text: '$ralpha update src/router.mjs with activation tests',
      sessionId: 'sess-1',
      activate: true,
    });

    assert.equal(result.gateApplied, false);
    assert.equal(result.phase, 'execution');
    assert.equal(result.finalSkill, 'oh-my-ralpha');
    assert.equal(result.activation.skill, 'oh-my-ralpha');
    assert.equal(result.activation.phase, 'execution');

    const modeState = await readModeState({ cwd, mode: 'oh-my-ralpha', sessionId: 'sess-1' });
    assert.equal(modeState.iteration, 1);
    assert.equal(modeState.max_iterations, 40);
    assert.equal(modeState.current_phase, 'starting');
  });

  it('installs the skill bundle and launcher into CODEX_HOME', async () => {
    const runtimeRoot = process.cwd();
    const codexHome = await makeTempWorkspace('oh-my-ralpha-codex-home-');
    const installed = await installSkill({
      runtimeRoot,
      codexHome,
      force: true,
    });

    assert.equal(existsSync(join(installed.targetSkillDir, 'SKILL.md')), true);
    assert.equal(existsSync(installed.launcherPath), true);
    assert.equal(existsSync(installed.installedCliPath), true);
    assert.equal(existsSync(join(installed.targetSkillDir, 'companions', 'prompts', 'architect.md')), true);
    assert.equal(existsSync(join(installed.targetSkillDir, 'companions', 'prompts', 'code-reviewer.md')), true);
    assert.equal(existsSync(join(installed.targetSkillDir, 'companions', 'prompts', 'code-simplifier.md')), true);
    assert.equal(existsSync(join(installed.targetSkillDir, 'prompts', 'architect.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'prompts', 'code-reviewer.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'prompts', 'code-simplifier.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'companions', 'skills', 'ai-slop-cleaner', 'SKILL.bundle.md')), true);
    assert.equal(existsSync(join(installed.targetSkillDir, 'companions', 'skills', 'ai-slop-cleaner', 'SKILL.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'skills', 'ai-slop-cleaner', 'SKILL.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'prompts', 'analyst.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'prompts', 'team-executor.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'skills', 'deep-interview', 'SKILL.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'skills', 'visual-verdict', 'SKILL.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'skills', 'web-clone', 'SKILL.md')), false);

    const launcher = await readFile(installed.launcherPath, 'utf-8');
    assert.match(launcher, new RegExp(escapeRegExp(installed.installedCliPath)));
    assert.doesNotMatch(launcher, new RegExp(escapeRegExp(runtimeRoot)));
  });

  it('reports built-in runtime and companion fallback status', async () => {
    const runtimeRoot = process.cwd();
    const codexHome = await makeTempWorkspace('oh-my-ralpha-doctor-home-');
    const previousCodexHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = codexHome;
    let report;
    try {
      report = doctorReport({ runtimeRoot, codexHome });
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previousCodexHome;
      }
    }

    assert.equal(report.checks.packagedSkill, true);
    assert.equal(report.checks.cli, true);
    assert.ok(report.builtInRuntime.includes('state read/write/clear'));
    assert.ok(Array.isArray(report.suggestions));
    assert.ok(report.suggestions.some((entry) => entry.includes('Add')));
    assert.equal(report.companions.some((entry) => entry.id === 'plan'), false);
    assert.equal(report.companions.find((entry) => entry.id === 'architect').type, 'agent-prompt');
    assert.equal(report.companions.find((entry) => entry.id === 'architect').installed, false);
    assert.equal(report.companions.find((entry) => entry.id === 'ai-slop-cleaner').type, 'skill');
    assert.equal(report.companions.find((entry) => entry.id === 'ai-slop-cleaner').source, 'fallback');
  });

  it('returns an existing snapshot path instead of a phantom path on repeated init', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-repeat-init-');
    const first = await initWorkspace({
      cwd,
      task: 'Repeat init task',
      now: new Date('2026-04-10T08:00:00.000Z'),
    });
    const second = await initWorkspace({
      cwd,
      task: 'Repeat init task',
      now: new Date('2026-04-10T08:01:00.000Z'),
    });

    assert.equal(second.created, false);
    assert.equal(second.contextPath, first.contextPath);
    assert.equal(existsSync(second.contextPath), true);
  });
});
