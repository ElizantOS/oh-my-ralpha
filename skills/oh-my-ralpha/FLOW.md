# Oh My Ralpha Flow

This skill is Ralph specialized for the workflow that actually worked during the Python query-engine parity push.

## What we keep from Ralph

1. **Capture context first**
   - Reuse a context snapshot instead of rediscovering the problem every turn.

2. **Use persistent working-model state**
   - State lifecycle still belongs in `state_write` / `state_read` / `state_clear`.

3. **Verify before claiming done**
   - Fresh proof is still mandatory.

4. **Clean closeout**
   - Final state must be marked complete and cleaned up.

## What we add from the parity workflow

1. **Use one truth source**
   - A TODO ledger and rounds file keep progress visible and prevent drift.

2. **Work one slice at a time**
   - Do not work every open thread at once.
   - Give each slice one clear acceptance target.

3. **Verify narrowly, then broadly**
   - First prove the slice with the smallest relevant command.
   - Then run the wider regression set once it is stable.

4. **Record proof**
   - New behavior is not done until it has direct evidence.

5. **Simplify after green**
   - Cleanup happens after the green proof, not before.

6. **Sync final artifacts**
   - Code, tests, TODOs, rounds, and any audit doc must agree.
   - Final approval waits until they match.

## What changes in emphasis

1. **Truth-source files become the execution spine**
   - The TODO ledger and rounds file are not optional notes; they drive resume and completion decisions.

2. **Planning happens at slice level**
   - Large TODOs are decomposed before implementation instead of being executed as one long opaque thread.

3. **Verification stays layered and mandatory**
   - Narrow proof happens first.
   - Every completed slice records acceptance evidence from all three native subagents: architect, code-reviewer, and code-simplifier.
   - The default acceptance path is the full three-lane bundle after fresh proof.
   - Architect always reviews slice boundaries, architecture, integration risk, and cross-module impact.
   - Code-reviewer always reviews correctness, tests, edge cases, and request fit.
   - Code-simplifier always reviews maintainability and simplification opportunities in read-only mode.
   - Every TODO must run the full required acceptance bundle after fresh proof. `CHANGES`/`REJECT` starts a bounded review-fix loop: fix, rerun proof, then repeat the affected required lane.
   - Review-fix loops are capped at three blocking rounds before `escalated_review`: round 1 checks spec/correctness, round 2 checks edge cases/state/regression, and round 3 checks tests/maintainability/cleanup debt.
   - Fix-review prompts include the original TODO diff, previous findings, the fix diff, and fresh proof so each round can judge convergence instead of only the newest patch.
   - Ordinary slices must not complete after only one or two acceptance lanes. All three latest required verdicts must be accepted or explicitly degraded with evidence.
   - Preserve bounded launch behavior: default to serial lanes when host limits are unclear, run at most two active acceptance agents concurrently for ordinary slices, and record why if concurrency is expanded.
   - Final closeout adds workflow-auditor: when all TODOs are complete and no active slice/next todo remains, run four independent read-only lanes for `FINAL-CLOSEOUT`: architect, code-reviewer, code-simplifier, and workflow-auditor.
   - Timeout handling must consume append-only reviewer evidence before degrading: if a timed-out reviewer has appended `CHANGES` or `REJECT`, that verdict blocks leader/manual `PASS` until fixed or explicitly scheduled with fresh proof.
   - Native wait timeouts are observation timeouts, not proof that the reviewer stopped. When tmux or transcript evidence exists, use tmux-aware acceptance wait semantics: `accepted` when required reviewer roles have latest `PASS`, `blocked` when latest reviewer evidence is `CHANGES`/`REJECT`, `activity_reset` whenever pane/transcript/acceptance output changes, `idle_timeout` only after continuous inactivity, and `max_timeout` after the total budget.
   - Do not close, replace, or degrade a reviewer while tmux pane output, transcript size/mtime, or acceptance records continue changing. New output resets the idle timer.
   - `tmux-cli-agent-harness` is the preferred inspectable fallback for user-inspected reviews, timeout recovery, and replacement reviewer runs that need pane history. It uses tmux as evidence/interaction layer while ralpha MCP remains the durable control plane.
   - No mailbox is added in v1: use capture history/transcripts plus `ralpha_trace` checkpoints and `ralpha_acceptance` verdicts.
   - Manual acceptance is a degraded fallback only after no reviewer verdict exists for a required role, tmux-aware waiting reaches `idle_timeout` or `max_timeout`, and one replacement reviewer is unavailable, capped, or also timed out; the fallback must be recorded.
   - Final cleanup runs through ai-slop-cleaner as the explicit mutation lane, followed by post-deslop regression.

4. **Stop protection is not verification**
   - The native Stop hook prevents an uncleared active workflow from ending silently.
   - Pause metadata stays `active: true` and is never permission to stop.
   - Inactive non-terminal pseudo-pauses are blocked because they hide unfinished work.
   - The only allowed waiting state is `awaiting_plan_review`, and only after the context, PRD, test spec, workboard, and rounds ledger are decision-complete and before any execution slice starts.
   - During execution, approval to continue the next slice is not a stop reason; known `next_todo` / `current_slice` means continue.
   - If active state has no resume target, Stop reads the workboard and rounds ledger. Completed TODOs plus `next_todo:null` and `remaining_todos:[]` route to the final-closeout gate instead of normal continuation.
   - Team-style verification still belongs to the loop: per-slice fresh evidence, mandatory architect/code-reviewer/code-simplifier slice acceptance, final deslop, post-deslop regression, and final four-lane closeout.

5. **Leader owns code and workflow state during review**
   - Subagents are acceptance helpers, not workflow owners.
   - Only the leader/main thread writes code, `ralpha_state`, the workboard, and the rounds ledger during acceptance/final review.
   - Subagents may return `PASS` / `CHANGES` verdicts, findings, or proposed cleanup notes, but they must not write waiting states, clear state, edit code, or edit `.codex/oh-my-ralpha/working-model` truth-source files.
   - Subagents are append-only for workflow information: they can add verdicts/findings/proposed ledger text with `ralpha verdict <slice> <role> <PASS|CHANGES|REJECT|COMMENT> "summary"`, but only the leader converts that information into state/workboard/rounds transitions.
   - Final acceptance happens after the latest mutating cleanup plus regression proof, and it stays read-only. If any final lane proposes changes, the leader returns to the cleanup lane before repeating proof and all four final lanes.

6. **Reasoning budget stays practical**
   - Bundled setup keeps architect at high effort for architecture-sensitive work.
   - Bundled setup lowers code-reviewer and code-simplifier to medium effort, and keeps workflow-auditor at high effort for closeout consistency.
   - If the host ignores configurable role budgets, the workflow relies on narrow prompts for the required three-lane acceptance bundle, tmux harness recovery when installed, one replacement reviewer per missing role after evidence recheck, and only then timeout degradation.

## Built-in runtime support

This standalone package ships JS fallbacks for the Codex integration surfaces that `oh-my-ralpha` depends on:

- install
- setup / uninstall, including bundled companion install and safe managed companion cleanup
- doctor
- init
- state read/write/clear
- verdict evidence command
- trace append/show
- route activation
- workflow route/init/plan/interview
- Codex Plan-mode implementation handoff bridge for exact UI prompts such as `Implement the plan.` / `实施计划`; this bridge activates ralpha from the native hook without making those phrases public keywords
- bundled `tmux-cli-agent-harness` sub-skill for inspectable reviewer/test/diagnostic sessions without adding mailbox v1

That means a fresh Codex can use the repository with only the local `.codex/oh-my-ralpha/working-model` files and the built-in runtime.
