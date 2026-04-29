import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RALPHA_FINAL_CLOSEOUT_ROLES,
  RALPHA_ORDINARY_ACCEPTANCE_ROLES,
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
const architectPrompt = readFileSync(
  join(process.cwd(), 'companions/prompts/architect.md'),
  'utf-8',
);
const codeReviewerPrompt = readFileSync(
  join(process.cwd(), 'companions/prompts/code-reviewer.md'),
  'utf-8',
);
const codeSimplifierPrompt = readFileSync(
  join(process.cwd(), 'companions/prompts/code-simplifier.md'),
  'utf-8',
);
const workflowAuditorPrompt = readFileSync(
  join(process.cwd(), 'companions/prompts/workflow-auditor.md'),
  'utf-8',
);
const tmuxHarnessSkill = readFileSync(
  join(process.cwd(), 'companions/skills/tmux-cli-agent-harness/SKILL.bundle.md'),
  'utf-8',
);
const tmuxHarnessControl = readFileSync(
  join(process.cwd(), 'companions/skills/tmux-cli-agent-harness/references/tmux-control.md'),
  'utf-8',
);
const tmuxHarnessPrompts = readFileSync(
  join(process.cwd(), 'companions/skills/tmux-cli-agent-harness/references/test-prompts.json'),
  'utf-8',
);
const dockerfile = readFileSync(
  join(process.cwd(), 'docker/ubuntu-codex/Dockerfile'),
  'utf-8',
);
const dockerShell = readFileSync(
  join(process.cwd(), 'scripts/docker-codex-shell.mjs'),
  'utf-8',
);
const readme = readFileSync(
  join(process.cwd(), 'README.md'),
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

  it('defines exact ordinary and final acceptance role sets', () => {
    assert.deepEqual(RALPHA_ORDINARY_ACCEPTANCE_ROLES, [
      'architect',
      'code-reviewer',
      'code-simplifier',
    ]);
    assert.deepEqual(RALPHA_FINAL_CLOSEOUT_ROLES, [
      'architect',
      'code-reviewer',
      'code-simplifier',
      'workflow-auditor',
    ]);
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
    assert.match(skill, /mandatory three-lane native-subagent slice acceptance/i);
    assert.match(skill, /\$ralpha`? invocation as explicit user intent/i);
    assert.match(skill, /Each completed slice has fresh evidence/i);
    assert.match(skill, /Every completed ordinary slice must run all three native subagent lanes/i);
    assert.match(skill, /Do not mark an ordinary slice complete with only a single `code-reviewer` lane/i);
    assert.match(skill, /run at most two active acceptance agents concurrently for ordinary slices/i);
    assert.match(skill, /all three latest required verdicts must be accepted or explicitly degraded with evidence/i);
    assert.match(skill, /TODO review-fix convergence loop/i);
    assert.match(skill, /Every completed TODO\/slice must run the full required acceptance bundle after fresh proof/i);
    assert.match(skill, /three blocking review-fix rounds/i);
    assert.match(skill, /original TODO diff[\s\S]*previous reviewer findings[\s\S]*fix diff[\s\S]*fresh proof/i);
    assert.match(skill, /escalated_review/i);
    assert.match(skill, /final-closeout gate/i);
    assert.match(skill, /FINAL-CLOSEOUT/i);
    assert.match(skill, /workflow-auditor/i);
    assert.match(skill, /four independent read-only reviewers/i);
    assert.match(skill, /leader-owned manual acceptance pass/i);
    assert.match(skill, /Do not mark a slice `completed` until fresh evidence plus required native or degraded acceptance evidence is recorded/i);
    assert.match(skill, /degraded_missing_subagent_runtime/i);
    assert.match(skill, /degraded_subagent_limit/i);
    assert.match(skill, /degraded_acceptance_timeout/i);
    assert.match(skill, /first inspect append-only acceptance evidence/i);
    assert.match(skill, /wait_agent` timeout is an observation timeout, not execution failure/i);
    assert.match(skill, /ralpha acceptance wait --slice <id> --role <role>/i);
    assert.match(skill, /accepted`, `blocked`, `idle_timeout`, or `max_timeout`/i);
    assert.match(skill, /activity_reset/i);
    assert.match(skill, /New output resets the idle timer/i);
    assert.match(skill, /Do not close, replace, or degrade a reviewer lane while tmux\/transcript\/acceptance activity is still changing/i);
    assert.match(skill, /Reviewer `CHANGES` or `REJECT` verdicts are blocking/i);
    assert.match(skill, /A later leader\/manual `PASS` does not override them/i);
    assert.match(skill, /one bounded replacement reviewer for the missing role/i);
    assert.match(skill, /Each completed slice has recorded mandatory three-lane acceptance/i);
    assert.match(skill, /ai-slop-cleaner.*--no-deslop/i);
    assert.match(skill, /Post-deslop regression passed/i);
    assert.match(skill, /Final closeout adds a fourth read-only lane: `workflow-auditor`/i);
    assert.match(skill, /`Stop` hook is a cleanup guard, not a verification lane/i);
    assert.match(skill, /current_phase: "awaiting_plan_review"/i);
    assert.match(skill, /only active non-terminal phase that may end a turn/i);
    assert.match(skill, /valid only after planning artifacts are decision-complete and before any execution slice has started/i);
    assert.match(skill, /Do not use a user-waiting state during execution/i);
    assert.match(skill, /current_phase: "paused"/i);
    assert.match(skill, /resumable metadata only/i);
    assert.match(skill, /never permission to stop/i);
    assert.match(skill, /Blocker states such as acceptance timeouts/i);
    assert.match(skill, /active: true/);
    assert.match(skill, /active: false.*current_phase: "paused_after_\*"/);
    assert.match(skill, /next_todo:null[\s\S]*remaining_todos:\[\]/i);
    assert.match(skill, /mark state terminal and clear it, not rerun review or edit code/i);
    assert.match(skill, /does not replace per-slice fresh evidence[\s\S]*mandatory `architect` \/ `code-reviewer` \/ `code-simplifier` acceptance[\s\S]*final deslop pass[\s\S]*post-deslop regression/i);
    assert.match(flow, /Stop protection is not verification/i);
    assert.match(flow, /Verification stays layered and mandatory/i);
    assert.match(flow, /Review-fix loops are capped at three blocking rounds/i);
    assert.match(flow, /Final closeout adds workflow-auditor/i);
    assert.match(flow, /workflow-auditor/i);
    assert.match(flow, /Timeout handling must consume append-only reviewer evidence before degrading/i);
    assert.match(flow, /Native wait timeouts are observation timeouts/i);
    assert.match(flow, /`activity_reset` whenever pane\/transcript\/acceptance output changes/i);
    assert.match(flow, /`idle_timeout` only after continuous inactivity/i);
    assert.match(flow, /`max_timeout` after the total budget/i);
    assert.match(flow, /one replacement reviewer per missing role after evidence recheck/i);
  });

  it('keeps acceptance and final review read-only with leader-owned mutation', () => {
    assert.match(skill, /leader\/main thread is the only writer for code, `ralpha_state`, the workboard, and the rounds ledger/i);
    assert.match(skill, /Acceptance subagents must not edit code/i);
    assert.match(skill, /Subagents must not call `ralpha_state write`, `ralpha_state clear`, `state_write`, edit code, or edit `.codex\/oh-my-ralpha\/working-model\/\*\*`/i);
    assert.match(skill, /Red line: subagents are append-only for workflow information/i);
    assert.match(skill, /Subagents may only add information via `ralpha verdict <slice> <role> <PASS\|CHANGES\|REJECT\|COMMENT> "summary"`/i);
    assert.match(skill, /this append-only evidence is not a state transition until the leader applies it/i);
    assert.match(skill, /explicit mutation lane, separate from read-only acceptance/i);
    assert.match(skill, /State write\/clear tools require `actorRole: "leader"` plus `mutationReason`/i);
    assert.match(skill, /current_phase: "awaiting_plan_review"` is the only waiting state/i);
    assert.match(skill, /reserved for decision-complete planning artifacts awaiting user review before execution starts/i);
    assert.match(skill, /Final acceptance is read-only/i);
    assert.match(skill, /Final read-only acceptance/i);
    assert.match(skill, /Any `CHANGES` or `REJECT` from any final lane blocks state cleanup/i);
    assert.match(skill, /Do not edit files\. Do not write or clear ralpha_state/i);
    assert.match(skill, /Do not use it for generic user approval to proceed to the next known slice\/TODO, subagent timeouts, subagent capacity limits, background acceptance waits, or any execution blocker/i);
    assert.match(flow, /Only the leader\/main thread writes code, `ralpha_state`, the workboard, and the rounds ledger/i);
    assert.match(flow, /Subagents are append-only for workflow information[\s\S]*`ralpha verdict <slice> <role> <PASS\|CHANGES\|REJECT\|COMMENT> "summary"`/i);
    assert.match(flow, /Final acceptance happens after the latest mutating cleanup plus regression proof, and it stays read-only/i);
    for (const prompt of [architectPrompt, codeReviewerPrompt, workflowAuditorPrompt]) {
      assert.match(prompt, /Never call `ralpha_state write`, `ralpha_state clear`/);
      assert.match(prompt, /Never edit `.codex\/oh-my-ralpha\/working-model\/\*\*`/);
      assert.match(prompt, /only add workflow information through `ralpha verdict <slice> <role> <PASS\|CHANGES\|REJECT\|COMMENT> "summary"`/i);
    }
    assert.match(codeSimplifierPrompt, /Review-Only Default/i);
    assert.match(codeSimplifierPrompt, /`WRITE_MODE_ALLOWED`/);
    assert.match(codeSimplifierPrompt, /Unauthorized edits/i);
    assert.match(architectPrompt, /ralpha verdict <slice> architect <PASS\|CHANGES\|REJECT\|COMMENT> "summary"/);
    assert.match(codeSimplifierPrompt, /ralpha verdict <slice> code-simplifier <PASS\|CHANGES\|REJECT\|COMMENT> "summary"/);
    assert.match(codeSimplifierPrompt, /no meaningful simplification is needed/i);
    assert.match(workflowAuditorPrompt, /You are Workflow Auditor/i);
    assert.match(workflowAuditorPrompt, /FINAL-CLOSEOUT/i);
  });

  it('documents bundled companion capabilities', () => {
    assert.match(skill, /Bundled companions are installed by `setup` from this package/i);
    assert.match(skill, /`uninstall` removes those bundled companions/i);
    assert.match(skill, /role prompts\/native agents: `architect`, `code-reviewer`, `code-simplifier`, `workflow-auditor`/i);
    assert.match(skill, /`architect=high`, `code-reviewer=medium`, `code-simplifier=medium`, `workflow-auditor=high`/i);
    assert.match(flow, /workflow-auditor at high effort/i);
    assert.match(skill, /skills: `ai-slop-cleaner`/i);
    assert.match(skill, /tmux-cli-agent-harness/i);
  });

  it('bundles tmux-cli-agent-harness with the ralpha integration profile', () => {
    assert.match(tmuxHarnessSkill, /^name:\s+tmux-cli-agent-harness$/m);
    assert.match(tmuxHarnessSkill, /Ralpha Integration Profile/);
    assert.match(tmuxHarnessSkill, /Do not introduce a mailbox for ralpha v1/i);
    assert.match(tmuxHarnessSkill, /ralpha-<slice>-<role>-<shortid>/);
    assert.match(tmuxHarnessSkill, /ralpha_acceptance submit/i);
    assert.match(tmuxHarnessSkill, /ralpha_trace append/i);
    assert.match(tmuxHarnessSkill, /ralpha acceptance wait --slice <id> --role <role> --tmux <target> --log <path>/i);
    assert.match(tmuxHarnessSkill, /Treat `accepted`[\s\S]*`blocked`[\s\S]*`activity_reset`[\s\S]*`idle_timeout`[\s\S]*`max_timeout`/i);
    assert.match(tmuxHarnessSkill, /Readonly: do not edit files/i);
    assert.match(tmuxHarnessControl, /Ralpha Reviewer Handoff/);
    assert.match(tmuxHarnessControl, /Do not add mailbox files in ralpha v1/i);
    assert.match(tmuxHarnessControl, /resets idle timeout/i);
    assert.match(tmuxHarnessControl, /raw carriage\s+return/i);
    assert.match(tmuxHarnessControl, /named buffers/i);
    assert.match(tmuxHarnessPrompts, /ralpha_reviewer_acceptance_writeback/);
    assert.match(tmuxHarnessPrompts, /ralpha_timeout_recovery_without_mailbox/);
    assert.match(tmuxHarnessPrompts, /ralpha_inspectable_codex_reviewers_submit/);
    assert.match(tmuxHarnessPrompts, /resets idle timeout/i);
  });

  it('keeps the docker sandbox ready for tmux harness smoke tests', () => {
    assert.match(dockerfile, /\btmux\s*\\/);
    assert.match(dockerfile, /tmux -V/);
    assert.match(dockerShell, /--tmpfs', '\/root\/\.codex:mode=700,exec'/);
  });

  it('documents route-ready plain Codex team smoke artifacts', () => {
    assert.match(readme, /Plain Codex native-subagent team smoke/);
    assert.match(readme, /src\/planning\.mjs/);
    assert.match(readme, /planningArtifactsComplete:false/);
    assert.match(readme, /Task statement:/);
    assert.match(readme, /Desired outcome:/);
    assert.match(readme, /Known facts\/evidence:/);
    assert.match(readme, /Likely codebase touchpoints:/);
    assert.match(readme, /`implementation overview`:/);
    assert.match(readme, /Interfaces \/ APIs \/ Schemas \/ I\/O/);
    assert.match(readme, /Narrow Proof/);
    assert.match(readme, /force: \$ralpha update \/tmp\/ralpha-subagent-team-smoke/);
    assert.match(readme, /finalSkill:"ralpha" and phase:"execution"/);
  });

  it('documents inspectable tmux-backed Codex reviewer smoke', () => {
    assert.match(readme, /Inspectable tmux-backed Codex reviewer smoke/);
    assert.match(readme, /If the result shows[\s\S]*`Spawned \.\.\. \[architect\]`[\s\S]*native\s+subagent mode/i);
    assert.match(readme, /ralpha-CODEX-architect/);
    assert.match(readme, /ralpha-CODEX-code-reviewer/);
    assert.match(readme, /Do not paste both panes in parallel/i);
    assert.match(readme, /named buffers/i);
    assert.match(readme, /raw carriage return/i);
    assert.match(readme, /printf '\\r' \| tmux load-buffer -b submit_architect -/);
    assert.match(readme, /summarizeAcceptance[\s\S]*hasBlocking:false/i);
    assert.match(readme, /After the human confirms inspection is complete[\s\S]*tmux kill-session -t ralpha-CODEX-architect/i);
    assert.match(readme, /Do not silently leave reviewer tmux sessions running/i);
    assert.match(tmuxHarnessSkill, /final report[\s\S]*cleanup commands/i);
    assert.match(tmuxHarnessControl, /final report must include both attach and cleanup commands/i);
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
    assert.match(skill, /ralpha verdict P0-02 architect PASS/i);
    assert.match(skill, /ralpha verdict P0-02 code-reviewer CHANGES/i);
    assert.match(skill, /ralpha verdict P0-02 code-simplifier PASS/i);
    assert.match(skill, /ralpha verdict FINAL-CLOSEOUT architect PASS/i);
    assert.match(skill, /ralpha verdict FINAL-CLOSEOUT code-reviewer PASS/i);
    assert.match(skill, /ralpha verdict FINAL-CLOSEOUT code-simplifier PASS/i);
    assert.match(skill, /ralpha verdict FINAL-CLOSEOUT workflow-auditor PASS/i);
    assert.match(skill, /--review-round 2 --review-lens edge\/state\/regression --review-cycle-id P0-02-loop/i);
    assert.match(skill, /ralpha acceptance wait --slice FINAL-CLOSEOUT --roles architect,code-reviewer,code-simplifier,workflow-auditor/i);
    assert.match(skill, /ralpha doctor/i);
    assert.match(skill, /node bin\/oh-my-ralpha\.js/i);
    assert.match(skill, /planning phase/i);
    assert.match(skill, /degraded mode/i);
    assert.match(flow, /verdict evidence command/i);
    assert.match(flow, /Built-in runtime support/i);
  });
});
