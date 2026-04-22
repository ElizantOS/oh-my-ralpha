import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RALPHA_REQUIRED_TRUTH_SOURCES,
  RALPHA_STATE_DEFAULTS,
  RALPHA_TEAM_LANES,
} from '../src/contract.mjs';

const skill = readFileSync(
  join(process.cwd(), 'skills/oh-my-ralpha/SKILL.md'),
  'utf-8',
);
const flow = readFileSync(
  join(process.cwd(), 'skills/oh-my-ralpha/FLOW.md'),
  'utf-8',
);

describe('oh-my-ralpha skill contract', () => {
  it('names the installed Codex skill ralpha', () => {
    assert.match(skill, /^name:\s+ralpha$/m);
  });

  it('keeps the Ralph-derived execution skeleton', () => {
    assert.match(skill, /Ralph-derived/i);
    assert.match(skill, /persistent state/i);
    assert.match(skill, /architect review/i);
    assert.match(skill, /post-deslop regression/i);
  });

  it('documents the required truth-source files', () => {
    for (const path of RALPHA_REQUIRED_TRUTH_SOURCES) {
      assert.match(skill, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(skill, /Keep exactly one slice `in_progress`/i);
  });

  it('locks the plan-first, decomposition, and lane model', () => {
    assert.match(skill, /Plan-first gate/i);
    assert.match(skill, /sub-TODO/i);
    for (const lane of RALPHA_TEAM_LANES) {
      assert.match(skill, new RegExp(lane.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('documents user interruption scheduling while ralpha is active', () => {
    assert.match(skill, /User_Interruption_Protocol/);
    assert.match(skill, /later user messages are insertions into the active workflow/i);
    assert.match(skill, /Current-slice correction/i);
    assert.match(skill, /Interrupt slice/i);
    assert.match(skill, /INT-\*/);
    assert.match(skill, /return_to: <current_slice>/);
    assert.match(skill, /Independent side task/i);
    assert.match(skill, /BACKLOG-\*/);
    assert.match(skill, /Do not use `current_phase: "paused"` as a response to user insertions/i);
  });

  it('documents the seeded state defaults', () => {
    assert.match(skill, new RegExp(`mode: "${RALPHA_STATE_DEFAULTS.mode}"`));
    assert.match(skill, new RegExp(`iteration: ${RALPHA_STATE_DEFAULTS.iteration}`));
    assert.match(skill, new RegExp(`max_iterations: ${RALPHA_STATE_DEFAULTS.maxIterations}`));
  });

  it('keeps the audit artifact optional but consistency-bound', () => {
    assert.match(skill, /optional final audit doc/i);
    assert.match(skill, /any audit doc all agree/i);
    assert.match(flow, /any audit doc must agree/i);
  });

  it('locks verification gates separately from Stop hook protection', () => {
    assert.match(skill, /mandatory native-subagent slice acceptance/i);
    assert.match(skill, /\$ralpha`? invocation as explicit user intent/i);
    assert.match(skill, /Each completed slice has fresh evidence/i);
    assert.match(skill, /Spawn `architect`, `code-reviewer`, and `code-simplifier` for every completed slice/i);
    assert.match(skill, /Do not mark a slice `completed` until all three acceptance agents have returned PASS\/APPROVED/i);
    assert.match(skill, /degraded_missing_subagent_runtime/i);
    assert.match(skill, /Each completed slice passed `architect` \/ `code-reviewer` \/ `code-simplifier` acceptance/i);
    assert.match(skill, /ai-slop-cleaner.*--no-deslop/i);
    assert.match(skill, /Post-deslop regression passed/i);
    assert.match(skill, /`Stop` hook is a cleanup guard, not a verification lane/i);
    assert.match(skill, /current_phase: "awaiting_user"/i);
    assert.match(skill, /only active non-terminal phase that may end a turn/i);
    assert.match(skill, /current_phase: "paused"/i);
    assert.match(skill, /resumable metadata only/i);
    assert.match(skill, /never permission to stop/i);
    assert.match(skill, /Blocker states such as acceptance timeouts/i);
    assert.match(skill, /active: true/);
    assert.match(skill, /active: false.*current_phase: "paused_after_\*"/);
    assert.match(skill, /does not replace per-slice fresh evidence[\s\S]*`architect` \/ `code-reviewer` \/ `code-simplifier` slice acceptance[\s\S]*final deslop pass[\s\S]*post-deslop regression/i);
    assert.match(flow, /Stop protection is not verification/i);
  });

  it('documents bundled companion capabilities', () => {
    assert.match(skill, /Bundled companions are installed by `setup` from this package/i);
    assert.match(skill, /`uninstall` removes those bundled companions/i);
    assert.match(skill, /role prompts\/native agents: `architect`, `code-reviewer`, `code-simplifier`/i);
    assert.match(skill, /skills: `ai-slop-cleaner`/i);
  });

  it('documents Codex Plan-mode implementation handoff without broadening public keywords', () => {
    assert.match(skill, /Codex Plan-mode implementation handoff/i);
    assert.match(skill, /`Implement the plan\.` or `实施计划` are not public keywords/i);
    assert.match(skill, /activate ralpha execution/i);
    assert.match(skill, /sync the latest Plan-mode report into working-model artifacts before editing code/i);
    assert.match(flow, /Codex Plan-mode implementation handoff bridge/i);
    assert.match(flow, /without making those phrases public keywords/i);
  });

  it('documents the built-in JS runtime and fallback model', () => {
    assert.match(skill, /Standalone_Runtime/);
    assert.match(skill, /ralpha state read/i);
    assert.match(skill, /ralpha doctor/i);
    assert.match(skill, /node bin\/oh-my-ralpha\.js/i);
    assert.match(skill, /planning phase/i);
    assert.match(skill, /degraded mode/i);
    assert.match(flow, /Built-in runtime support/i);
  });
});
