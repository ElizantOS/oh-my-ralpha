import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { initWorkspace } from '../src/init.mjs';
import { scaffoldInterview, scaffoldPlan } from '../src/planning.mjs';
import { readModeState, writeModeState, clearModeState, validateStateMutation } from '../src/state.mjs';
import { appendTraceEvent, readTraceEvents } from '../src/trace.mjs';
import { routePrompt } from '../src/router.mjs';
import { doctorReport } from '../src/doctor.mjs';
import { installSkill } from '../src/install.mjs';
import { runCli } from '../src/cli.mjs';
import { listAcceptance, summarizeAcceptance, waitForAcceptance } from '../src/acceptance.mjs';

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
      mode: 'ralpha',
      patch: { active: true, current_phase: 'executing' },
    });

    assert.equal(written.mode, 'ralpha');
    assert.equal(written.active, true);

    const readBack = await readModeState({ cwd, mode: 'ralpha' });
    assert.equal(readBack.active, true);
    assert.equal(readBack.current_phase, 'executing');

    const cleared = await clearModeState({ cwd, mode: 'ralpha' });
    assert.equal(cleared, true);
    assert.equal(await readModeState({ cwd, mode: 'ralpha' }), null);
  });

  it('requires leader actor for CLI state mutations', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-state-cli-guard-');

    await assert.rejects(
      () => runCli(['state', 'write', '--cwd', cwd, '--mode', 'ralpha', '--json', '{"active":true}']),
      /actorRole is required/,
    );

    const originalLog = console.log;
    const lines = [];
    console.log = (value) => {
      lines.push(String(value));
    };
    try {
      await runCli([
        'state',
        'write',
        '--cwd',
        cwd,
        '--mode',
        'ralpha',
        '--actor',
        'leader',
        '--reason',
        'leader test write',
        '--json',
        '{"active":true,"current_phase":"executing"}',
      ]);
    } finally {
      console.log = originalLog;
    }

    assert.equal(JSON.parse(lines[0]).active, true);
    assert.equal((await readModeState({ cwd, mode: 'ralpha' })).current_phase, 'executing');
  });

  it('rejects legacy awaiting_user state', async () => {
    const result = validateStateMutation({
      command: 'write',
      actorRole: 'leader',
      mutationReason: 'waiting for user clarification on whether the legacy API path remains in scope',
      patch: {
        active: true,
        current_phase: 'awaiting_user',
        state: {
          awaiting_user_reason: 'waiting for user clarification on whether the legacy API path remains in scope',
        },
      },
      requireActor: true,
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /not supported/i);
    assert.match(result.error, /awaiting_plan_review/i);
  });

  it('allows the dedicated awaiting_plan_review state', async () => {
    const result = validateStateMutation({
      command: 'write',
      actorRole: 'leader',
      mutationReason: 'decision-complete plan is ready for user review',
      patch: {
        active: true,
        current_phase: 'awaiting_plan_review',
        state: {
          planning_review_reason: 'decision-complete plan is ready for user review',
        },
      },
      requireActor: true,
    });

    assert.equal(result.ok, true);
  });

  it('supports the single verdict CLI format for append-only acceptance evidence', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-verdict-cli-');
    const originalLog = console.log;
    const lines = [];
    console.log = (value) => {
      lines.push(String(value));
    };
    try {
      await runCli(['verdict', 'P0-02', 'architect', 'PASS', 'accepted', '--cwd', cwd]);
      await runCli(['verdict', 'P0-03', 'code-reviewer', 'CHANGES', 'ctx type mismatch', '--cwd', cwd]);
    } finally {
      console.log = originalLog;
    }

    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    const listed = await listAcceptance({ cwd });
    assert.equal(first.record.verdict, 'PASS');
    assert.equal(first.record.role, 'architect');
    assert.equal(first.record.summary, 'accepted');
    assert.equal(second.record.verdict, 'CHANGES');
    assert.equal(second.record.role, 'code-reviewer');
    assert.equal(listed.records.length, 2);
    assert.equal(await readModeState({ cwd, mode: 'ralpha' }), null);
  });

  it('accepts workflow-auditor verdicts with review loop metadata', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-verdict-workflow-auditor-');
    const originalLog = console.log;
    const lines = [];
    console.log = (value) => {
      lines.push(String(value));
    };
    try {
      await runCli([
        'verdict',
        'FINAL-CLOSEOUT',
        'workflow-auditor',
        'PASS',
        'workflow artifacts agree',
        '--cwd',
        cwd,
        '--review-round',
        '2',
        '--review-lens',
        'workflow-state',
        '--review-cycle-id',
        'cycle-final-1',
      ]);
    } finally {
      console.log = originalLog;
    }

    const result = JSON.parse(lines[0]);
    assert.equal(result.record.role, 'workflow-auditor');
    assert.equal(result.record.review_round, 2);
    assert.equal(result.record.review_lens, 'workflow-state');
    assert.equal(result.record.review_cycle_id, 'cycle-final-1');
  });

  it('keeps reviewer CHANGES blocking even after a later leader PASS', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-acceptance-gate-');
    const originalLog = console.log;
    console.log = () => {};
    try {
      await runCli(['verdict', 'H0-03', 'code-reviewer', 'CHANGES', 'return type error', '--cwd', cwd]);
      await runCli(['verdict', 'H0-03', 'leader', 'PASS', 'manual acceptance after timeout', '--cwd', cwd]);
    } finally {
      console.log = originalLog;
    }

    const summary = await summarizeAcceptance({ cwd, sliceId: 'H0-03' });
    assert.equal(summary.gate.has_blocking_reviewer_verdict, true);
    assert.equal(summary.gate.can_record_manual_pass, false);
    assert.equal(summary.gate.blocking_records[0].role, 'code-reviewer');
    assert.equal(summary.gate.blocking_records[0].verdict, 'CHANGES');
    assert.match(summary.gate.instruction, /Do not record leader\/manual PASS/);
  });

  it('clears reviewer CHANGES only with a later reviewer PASS for the same role', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-acceptance-gate-clear-');
    const originalLog = console.log;
    console.log = () => {};
    try {
      await runCli(['verdict', 'H0-03', 'code-reviewer', 'CHANGES', 'return type error', '--cwd', cwd]);
      await runCli(['verdict', 'H0-03', 'code-reviewer', 'PASS', 'return type fixed', '--cwd', cwd]);
    } finally {
      console.log = originalLog;
    }

    const summary = await summarizeAcceptance({ cwd, sliceId: 'H0-03' });
    assert.equal(summary.gate.has_blocking_reviewer_verdict, false);
    assert.equal(summary.gate.can_record_manual_pass, true);
    assert.equal(summary.gate.latest_by_role['code-reviewer'].verdict, 'PASS');
  });

  it('waits for required reviewer PASS records and returns accepted', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-acceptance-wait-accepted-');
    const originalLog = console.log;
    console.log = () => {};
    try {
      await runCli(['verdict', 'TEAM-01', 'architect', 'PASS', 'architect accepted', '--cwd', cwd]);
      await runCli(['verdict', 'TEAM-01', 'code-reviewer', 'PASS', 'reviewer accepted', '--cwd', cwd]);
    } finally {
      console.log = originalLog;
    }

    const result = await waitForAcceptance({
      cwd,
      sliceId: 'TEAM-01',
      roles: ['architect', 'code-reviewer'],
      idleMs: 10,
      maxMs: 100,
      pollMs: 5,
    });

    assert.equal(result.status, 'accepted');
    assert.equal(result.gate.has_blocking_reviewer_verdict, false);
    assert.deepEqual(result.roles, ['architect', 'code-reviewer']);
  });

  it('waits for all four final-closeout reviewer PASS records', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-final-closeout-acceptance-');
    const originalLog = console.log;
    console.log = () => {};
    try {
      await runCli(['verdict', 'FINAL-CLOSEOUT', 'architect', 'PASS', 'architect accepted', '--cwd', cwd]);
      await runCli(['verdict', 'FINAL-CLOSEOUT', 'code-reviewer', 'PASS', 'reviewer accepted', '--cwd', cwd]);
      await runCli(['verdict', 'FINAL-CLOSEOUT', 'code-simplifier', 'PASS', 'simplifier accepted', '--cwd', cwd]);
      await runCli(['verdict', 'FINAL-CLOSEOUT', 'workflow-auditor', 'PASS', 'workflow accepted', '--cwd', cwd]);
    } finally {
      console.log = originalLog;
    }

    const result = await waitForAcceptance({
      cwd,
      sliceId: 'FINAL-CLOSEOUT',
      roles: ['architect', 'code-reviewer', 'code-simplifier', 'workflow-auditor'],
      idleMs: 10,
      maxMs: 100,
      pollMs: 5,
    });

    assert.equal(result.status, 'accepted');
    assert.deepEqual(result.roles, ['architect', 'code-reviewer', 'code-simplifier', 'workflow-auditor']);
  });

  it('returns blocked when a reviewer CHANGES verdict is latest', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-acceptance-wait-blocked-');
    const originalLog = console.log;
    console.log = () => {};
    try {
      await runCli(['verdict', 'TEAM-02', 'code-reviewer', 'CHANGES', 'fix return type', '--cwd', cwd]);
      await runCli(['verdict', 'TEAM-02', 'leader', 'PASS', 'manual pass should not override', '--cwd', cwd]);
    } finally {
      console.log = originalLog;
    }

    const result = await waitForAcceptance({
      cwd,
      sliceId: 'TEAM-02',
      roles: ['code-reviewer'],
      idleMs: 10,
      maxMs: 100,
      pollMs: 5,
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.gate.has_blocking_reviewer_verdict, true);
    assert.equal(result.gate.blocking_records[0].verdict, 'CHANGES');
  });

  it('marks review loops for escalation after three blocking rounds', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-review-loop-escalation-');
    const originalLog = console.log;
    console.log = () => {};
    try {
      await runCli([
        'verdict',
        'P0-09',
        'code-reviewer',
        'CHANGES',
        'round one blocker',
        '--cwd',
        cwd,
        '--review-round',
        '1',
        '--review-lens',
        'spec/correctness',
        '--review-cycle-id',
        'cycle-p0-09',
      ]);
      await runCli([
        'verdict',
        'P0-09',
        'code-reviewer',
        'CHANGES',
        'round two blocker',
        '--cwd',
        cwd,
        '--review-round',
        '2',
        '--review-lens',
        'edge/state/regression',
        '--review-cycle-id',
        'cycle-p0-09',
      ]);
      await runCli([
        'verdict',
        'P0-09',
        'code-reviewer',
        'CHANGES',
        'round three blocker',
        '--cwd',
        cwd,
        '--review-round',
        '3',
        '--review-lens',
        'tests/maintainability',
        '--review-cycle-id',
        'cycle-p0-09',
      ]);
    } finally {
      console.log = originalLog;
    }

    const summary = await summarizeAcceptance({ cwd, sliceId: 'P0-09', roles: ['code-reviewer'] });
    assert.equal(summary.gate.has_blocking_reviewer_verdict, true);
    assert.equal(summary.gate.escalated_review_required, true);
    assert.deepEqual(summary.gate.review_loop.blocking_rounds, [1, 2, 3]);
    assert.match(summary.gate.review_loop.instruction, /Three blocking review-fix rounds/);
  });

  it('resets idle timeout when transcript log grows', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-acceptance-wait-log-');
    const logPath = join(cwd, 'reviewer.log');
    await writeFile(logPath, 'start\n', 'utf-8');

    const waiting = waitForAcceptance({
      cwd,
      sliceId: 'TEAM-03',
      roles: ['code-reviewer'],
      logPath,
      idleMs: 60,
      maxMs: 200,
      pollMs: 10,
    });

    await sleep(25);
    await appendFile(logPath, 'still working\n', 'utf-8');
    const result = await waiting;

    assert.equal(result.status, 'idle_timeout');
    assert.ok(result.activity.activity_resets.some((entry) => entry.sources.includes('log')));
  });

  it('returns idle_timeout when no evidence source changes', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-acceptance-wait-idle-');
    const result = await waitForAcceptance({
      cwd,
      sliceId: 'TEAM-04',
      roles: ['code-reviewer'],
      idleMs: 10,
      maxMs: 100,
      pollMs: 5,
    });

    assert.equal(result.status, 'idle_timeout');
    assert.equal(result.gate.has_reviewer_evidence, false);
  });

  it('exposes acceptance wait through the CLI command group', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-acceptance-wait-cli-');
    const originalLog = console.log;
    const lines = [];
    console.log = (value) => {
      lines.push(String(value));
    };
    try {
      await runCli(['verdict', 'TEAM-05', 'architect', 'PASS', 'architect accepted', '--cwd', cwd]);
      await runCli(['verdict', 'TEAM-05', 'code-reviewer', 'PASS', 'reviewer accepted', '--cwd', cwd]);
      await runCli([
        'acceptance',
        'wait',
        '--cwd',
        cwd,
        '--slice',
        'TEAM-05',
        '--roles',
        'architect,code-reviewer',
        '--idle-ms',
        '10',
        '--max-ms',
        '100',
        '--poll-ms',
        '5',
      ]);
    } finally {
      console.log = originalLog;
    }

    const waited = JSON.parse(lines.at(-1));
    assert.equal(waited.status, 'accepted');
    assert.deepEqual(waited.roles, ['architect', 'code-reviewer']);
  });

  it('rejects non-canonical verdict tokens', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-verdict-cli-strict-');
    await assert.rejects(
      () => runCli(['verdict', 'P0-02', 'architect', 'pass', 'accepted', '--cwd', cwd]),
      /usage: ralpha verdict <slice> <role> <PASS\|CHANGES\|REJECT\|COMMENT>/,
    );
    await assert.rejects(
      () => runCli(['verdict', 'P0-02', 'architect', 'BAD', 'fix it', '--cwd', cwd]),
      /usage: ralpha verdict <slice> <role> <PASS\|CHANGES\|REJECT\|COMMENT>/,
    );
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
    assert.equal(await readModeState({ cwd, mode: 'ralpha' }), null);
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
    assert.equal(await readModeState({ cwd, mode: 'ralpha' }), null);
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

  it('activates ralpha and seeds runtime state when the prompt is well specified', async () => {
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
    assert.equal(result.finalSkill, 'ralpha');
    assert.equal(result.activation.skill, 'ralpha');
    assert.equal(result.activation.phase, 'execution');

    const modeState = await readModeState({ cwd, mode: 'ralpha', sessionId: 'sess-1' });
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
    assert.match(installed.targetSkillDir, /\/skills\/ralpha$/);
    assert.match(installed.launcherPath, /\/bin\/ralpha$/);
    assert.equal(existsSync(installed.launcherPath), true);
    assert.equal(existsSync(installed.installedCliPath), true);
    assert.equal(existsSync(join(installed.targetSkillDir, 'companions', 'prompts', 'architect.md')), true);
    assert.equal(existsSync(join(installed.targetSkillDir, 'companions', 'prompts', 'code-reviewer.md')), true);
    assert.equal(existsSync(join(installed.targetSkillDir, 'companions', 'prompts', 'code-simplifier.md')), true);
    assert.equal(existsSync(join(installed.targetSkillDir, 'companions', 'prompts', 'workflow-auditor.md')), true);
    assert.equal(existsSync(join(installed.targetSkillDir, 'prompts', 'architect.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'prompts', 'code-reviewer.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'prompts', 'code-simplifier.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'prompts', 'workflow-auditor.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'companions', 'skills', 'ai-slop-cleaner', 'SKILL.bundle.md')), true);
    assert.equal(existsSync(join(installed.targetSkillDir, 'companions', 'skills', 'tmux-cli-agent-harness', 'SKILL.bundle.md')), true);
    assert.equal(existsSync(join(installed.targetSkillDir, 'companions', 'skills', 'tmux-cli-agent-harness', 'references', 'tmux-control.md')), true);
    assert.equal(existsSync(join(installed.targetSkillDir, 'companions', 'skills', 'ai-slop-cleaner', 'SKILL.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'skills', 'ai-slop-cleaner', 'SKILL.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'prompts', 'analyst.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'prompts', 'team-executor.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'skills', 'deep-interview', 'SKILL.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'skills', 'visual-verdict', 'SKILL.md')), false);
    assert.equal(existsSync(join(installed.targetSkillDir, 'skills', 'web-clone', 'SKILL.md')), false);

    const launcher = await readFile(installed.launcherPath, 'utf-8');
    const installedSkill = await readFile(join(installed.targetSkillDir, 'SKILL.md'), 'utf-8');
    assert.match(installedSkill, /^name: ralpha$/m);
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
    assert.equal(report.companions.find((entry) => entry.id === 'tmux-cli-agent-harness').type, 'skill');
    assert.equal(report.companions.find((entry) => entry.id === 'tmux-cli-agent-harness').source, 'fallback');
    assert.equal(typeof report.checks.tmuxAvailable, 'boolean');
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
