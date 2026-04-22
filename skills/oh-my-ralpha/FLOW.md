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

3. **Verification stays layered and bounded**
   - Narrow proof happens first.
   - Every completed slice records acceptance evidence, but native subagents are used with an explicit budget.
   - The default acceptance path is one spawned code-reviewer after fresh proof.
   - Architect joins only for large, risky, cross-cutting, or boundary-sensitive changes.
   - Code-simplifier joins only in review-only mode when non-trivial edits create a real simplification question or during final cleanup review.
   - Never spawn all three acceptance lanes simultaneously; the normal concurrent budget is one native acceptance agent and the hard maximum is two.
   - Timeout handling must consume append-only reviewer evidence before degrading: if a timed-out reviewer has appended `CHANGES` or `REJECT`, that verdict blocks leader/manual `PASS` until fixed or explicitly scheduled with fresh proof.
   - Native wait timeouts are observation timeouts, not proof that the reviewer stopped. When tmux or transcript evidence exists, use tmux-aware acceptance wait semantics: `accepted` when required reviewer roles have latest `PASS`, `blocked` when latest reviewer evidence is `CHANGES`/`REJECT`, `activity_reset` whenever pane/transcript/acceptance output changes, `idle_timeout` only after continuous inactivity, and `max_timeout` after the total budget.
   - Do not close, replace, or degrade a reviewer while tmux pane output, transcript size/mtime, or acceptance records continue changing. New output resets the idle timer.
   - `tmux-cli-agent-harness` is the preferred inspectable fallback for user-inspected reviews, timeout recovery, and replacement reviewer runs that need pane history. It uses tmux as evidence/interaction layer while ralpha MCP remains the durable control plane.
   - No mailbox is added in v1: use capture history/transcripts plus `ralpha_trace` checkpoints and `ralpha_acceptance` verdicts.
   - Manual acceptance is a degraded fallback only after no reviewer verdict exists, tmux-aware waiting reaches `idle_timeout` or `max_timeout`, and one bounded replacement reviewer is unavailable, capped, or also timed out; the fallback must be recorded.
   - Final cleanup runs through ai-slop-cleaner as the explicit mutation lane, followed by post-deslop regression.

4. **Stop protection is not verification**
   - The native Stop hook prevents an uncleared active workflow from ending silently.
   - Pause metadata stays `active: true` and is never permission to stop.
   - Inactive non-terminal pseudo-pauses are blocked because they hide unfinished work.
   - Team-style verification still belongs to the loop: per-slice fresh evidence, bounded reviewer-only architect/code-reviewer/code-simplifier slice acceptance as warranted, final deslop, and post-deslop regression.

5. **Leader owns code and workflow state during review**
   - Subagents are acceptance helpers, not workflow owners.
   - Only the leader/main thread writes code, `ralpha_state`, the workboard, and the rounds ledger during acceptance/final review.
   - Subagents may return `PASS` / `CHANGES` verdicts, findings, or proposed cleanup notes, but they must not set `awaiting_user`, clear state, edit code, or edit `.codex/oh-my-ralpha/working-model` truth-source files.
   - Subagents are append-only for workflow information: they can add verdicts/findings/proposed ledger text with `ralpha verdict <slice> <role> <PASS|CHANGES|REJECT|COMMENT> "summary"`, but only the leader converts that information into state/workboard/rounds transitions.
   - Final acceptance happens after the latest mutating cleanup plus regression proof, and it stays read-only. If a simplification reviewer proposes changes, the leader returns to the cleanup lane before repeating proof/acceptance.

6. **Reasoning budget stays practical**
   - Bundled setup keeps architect at high effort for architecture-sensitive work.
   - Bundled setup lowers code-reviewer and code-simplifier to medium effort.
   - If the host ignores configurable role budgets, the workflow relies on narrow prompts, one-agent default acceptance, tmux harness recovery when installed, one bounded replacement reviewer after evidence recheck, and only then timeout degradation.

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
