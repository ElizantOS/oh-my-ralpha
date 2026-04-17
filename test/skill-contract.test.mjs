import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OH_MY_RALPHA_REQUIRED_TRUTH_SOURCES,
  OH_MY_RALPHA_STATE_DEFAULTS,
  OH_MY_RALPHA_TEAM_LANES,
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
  it('keeps the Ralph-derived execution skeleton', () => {
    assert.match(skill, /Ralph-derived/i);
    assert.match(skill, /persistent state/i);
    assert.match(skill, /architect review/i);
    assert.match(skill, /post-deslop regression/i);
  });

  it('documents the required truth-source files', () => {
    for (const path of OH_MY_RALPHA_REQUIRED_TRUTH_SOURCES) {
      assert.match(skill, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(skill, /Keep exactly one slice `in_progress`/i);
  });

  it('locks the plan-first, decomposition, and lane model', () => {
    assert.match(skill, /Plan-first gate/i);
    assert.match(skill, /sub-TODO/i);
    for (const lane of OH_MY_RALPHA_TEAM_LANES) {
      assert.match(skill, new RegExp(lane.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('documents the seeded state defaults', () => {
    assert.match(skill, new RegExp(`mode: "${OH_MY_RALPHA_STATE_DEFAULTS.mode}"`));
    assert.match(skill, new RegExp(`iteration: ${OH_MY_RALPHA_STATE_DEFAULTS.iteration}`));
    assert.match(skill, new RegExp(`max_iterations: ${OH_MY_RALPHA_STATE_DEFAULTS.maxIterations}`));
  });

  it('keeps the audit artifact optional but consistency-bound', () => {
    assert.match(skill, /optional final audit doc/i);
    assert.match(skill, /any audit doc all agree/i);
    assert.match(flow, /any audit doc must agree/i);
  });

  it('locks verification gates separately from Stop hook protection', () => {
    assert.match(skill, /mandatory native-subagent slice acceptance/i);
    assert.match(skill, /oh-my-ralpha invocation as explicit user intent/i);
    assert.match(skill, /Each completed slice has fresh evidence/i);
    assert.match(skill, /Spawn `architect`, `code-reviewer`, and `code-simplifier` for every completed slice/i);
    assert.match(skill, /Do not mark a slice `completed` until all three acceptance agents have returned PASS\/APPROVED/i);
    assert.match(skill, /degraded_missing_subagent_runtime/i);
    assert.match(skill, /Each completed slice passed `architect` \/ `code-reviewer` \/ `code-simplifier` acceptance/i);
    assert.match(skill, /ai-slop-cleaner.*--no-deslop/i);
    assert.match(skill, /Post-deslop regression passed/i);
    assert.match(skill, /`Stop` hook is a cleanup guard, not a verification lane/i);
    assert.match(skill, /current_phase: "paused"/i);
    assert.match(skill, /active: true/);
    assert.match(skill, /active: false.*current_phase: "paused_after_\*"/);
    assert.match(skill, /does not replace per-slice fresh evidence[\s\S]*`architect` \/ `code-reviewer` \/ `code-simplifier` slice acceptance[\s\S]*final deslop pass[\s\S]*post-deslop regression/i);
    assert.match(flow, /Stop protection is not verification/i);
  });

  it('documents bundled companion capabilities', () => {
    assert.match(skill, /Bundled companions are installed by `setup` from this package/i);
    assert.match(skill, /role prompts\/native agents: `architect`, `code-reviewer`, `code-simplifier`/i);
    assert.match(skill, /skills: `ai-slop-cleaner`/i);
  });

  it('documents the built-in JS runtime and fallback model', () => {
    assert.match(skill, /Standalone_Runtime/);
    assert.match(skill, /oh-my-ralpha state read/i);
    assert.match(skill, /oh-my-ralpha doctor/i);
    assert.match(skill, /node bin\/oh-my-ralpha\.js/i);
    assert.match(skill, /planning phase/i);
    assert.match(skill, /degraded mode/i);
    assert.match(flow, /Built-in runtime support/i);
  });
});
