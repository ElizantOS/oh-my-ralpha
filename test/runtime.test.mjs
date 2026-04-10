import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
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

async function makeTempWorkspace(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
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

  it('routes vague prompts to ralplan before activation', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-route-gate-');
    const result = await routePrompt({
      cwd,
      text: '$ralpha fix this',
      activate: true,
    });

    assert.equal(result.matched, true);
    assert.equal(result.gateApplied, true);
    assert.equal(result.finalSkill, 'ralplan');
    assert.equal(result.activation, null);
  });

  it('keeps vague prompts gated even when planning artifacts already exist', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-route-existing-plan-');
    await scaffoldPlan({ cwd, task: 'Existing unrelated plan' });
    const result = await routePrompt({
      cwd,
      text: '$ralpha fix this',
      activate: true,
    });

    assert.equal(result.planningComplete, true);
    assert.equal(result.gateApplied, true);
    assert.equal(result.finalSkill, 'ralplan');
    assert.equal(result.activation, null);
  });

  it('activates oh-my-ralpha and seeds runtime state when the prompt is well specified', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-route-activate-');
    await scaffoldPlan({ cwd, task: 'Implement runtime route activation' });
    const result = await routePrompt({
      cwd,
      text: '$ralpha update src/router.mjs with activation tests',
      sessionId: 'sess-1',
      activate: true,
    });

    assert.equal(result.gateApplied, false);
    assert.equal(result.finalSkill, 'oh-my-ralpha');
    assert.equal(result.activation.skill, 'oh-my-ralpha');

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

    const launcher = await readFile(installed.launcherPath, 'utf-8');
    assert.match(launcher, new RegExp(escapeRegExp(installed.installedCliPath)));
    assert.doesNotMatch(launcher, new RegExp(escapeRegExp(runtimeRoot)));
  });

  it('reports built-in runtime and companion fallback status', async () => {
    const runtimeRoot = process.cwd();
    const codexHome = await makeTempWorkspace('oh-my-ralpha-doctor-home-');
    const report = doctorReport({ runtimeRoot, codexHome });

    assert.equal(report.checks.packagedSkill, true);
    assert.equal(report.checks.cli, true);
    assert.ok(report.builtInRuntime.includes('state read/write/clear'));
    assert.ok(Array.isArray(report.suggestions));
    assert.ok(report.suggestions.some((entry) => entry.includes('Add')));
    const planCapability = report.companions.find((entry) => entry.id === 'plan');
    assert.equal(planCapability.installed, false);
    assert.equal(planCapability.fallback, 'built-in plan scaffold');
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
