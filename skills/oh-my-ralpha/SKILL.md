---
name: ralpha
description: Ralph-derived persistent execution loop with bounded reviewer-only native-subagent slice acceptance centered on .codex working-model truth-source files
---

[OH-MY-RALPHA + RALPH - ITERATION {{ITERATION}}/{{MAX}}]

Continue the task from the current `.codex/oh-my-ralpha/working-model` truth-source files. Do not restart discovery if the next slice is already clear.

<Purpose>
Oh My Ralpha is a Ralph-derived persistence workflow. It keeps Ralph's full useful execution skeleton — pre-context grounding, persistent state, automatic continuation, fresh verification, architect review, deslop, post-deslop regression, and clean cleanup — but specializes the loop around the `.codex/oh-my-ralpha/working-model` files that actually drove our parity effort:

- `.codex/oh-my-ralpha/working-model/context/...` for shared grounding
- `.codex/oh-my-ralpha/working-model/state/...-todo.md` for the truth-source workboard
- `.codex/oh-my-ralpha/working-model/state/...-rounds.json` for the resume and verification ledger
- optional final audit doc for closeout when the task benefits from it
</Purpose>

<Use_When>
- The task requires real completion, not best-effort progress
- There is already a TODO ledger, audit list, or obvious remaining slices
- The user invokes `$ralpha` for continuation, completion, or remaining TODO work
- The work needs to run for a long time without drifting or waiting for repeated "continue" nudges
- The user invokes `$ralpha` and thereby requests this workflow's bounded reviewer-only native-subagent slice acceptance contract
</Use_When>

<Do_Not_Use_When>
- The request is still vague or exploratory and does not invoke `$ralpha` -- use ordinary planning first
- The user wants a full autonomous pipeline -- use `autopilot`
- The task is a tiny one-shot fix with one obvious proof command -- just do it directly
- The user explicitly wants manual control over every subtask -- use `ultrawork` or direct delegation
</Do_Not_Use_When>

<Why_This_Exists>
Ralph gave us the right backbone, but our parity push only became stable once we made a few things explicit:
1. context snapshot first
2. one workboard as the truth source
3. one rounds ledger as the resume log
4. one active slice at a time
5. narrow proof before broad proof
6. final artifact sync before approval

Oh My Ralpha is Ralph with that specialization baked in.
</Why_This_Exists>

<Execution_Policy>
- Keep Ralph's persistence model: do not stop after partial progress if a clear next slice exists
- Use `.codex/oh-my-ralpha/working-model` files as the source of truth, not transient conversation memory
- Use one authoritative workboard and one rounds ledger; never rely on an implicit checklist
- Keep exactly one slice `in_progress`
- If the rounds ledger already has `next_todo` or `current_focus`, continue from it automatically instead of waiting for the user to say "继续"
- Fire independent specialist lanes only when they materially help, have disjoint scope, and fit the acceptance budget
- Use `run_in_background: true` for long operations (builds, installs, full test suites)
- Deliver the full implementation: no scope reduction, no partial completion, no deleting tests to make them pass
- Before final completion: broad regressions, relevant typecheck/lint, slice acceptance evidence, final deslop, post-deslop regression, and final artifact sync
- Treat `$ralpha` invocation as explicit user intent to use bounded, leader-owned native subagents when they are useful and available
- During acceptance and final review, the leader/main thread is the only writer for code, `ralpha_state`, the workboard, and the rounds ledger; subagents return verdicts and recommendations, never direct edits or workflow state transitions
- Red line: subagents are append-only for workflow information. They may add verdicts/findings/proposed ledger text through the single `ralpha verdict <slice> <role> <PASS|CHANGES|REJECT|COMMENT> "summary"` command, but they must never modify workflow state/status/phase/current slice or mark anything complete.
- Final acceptance is read-only. Any simplification or cleanup that changes files must happen in the explicit leader-owned cleanup lane before final acceptance, followed by fresh regression evidence.
</Execution_Policy>

<User_Interruption_Protocol>
When `ralpha` mode is active, later user messages are insertions into the active workflow even if they do not repeat `$ralpha`.

Before acting, classify the insertion:

1. **Current-slice correction**
   - Use when the user is correcting requirements, acceptance criteria, files, tests, or behavior for the active slice.
   - Fold the correction into the active slice.
   - Update the workboard and rounds ledger.
   - Continue the same slice.

2. **Interrupt slice**
   - Use when the user introduces bounded work that must happen before the current slice can finish.
   - Create the next `INT-*` item in the workboard.
   - Record `interrupts: <current_slice>` and `return_to: <current_slice>`.
   - Set `state.current_slice` to the `INT-*` item while it is active.
   - Complete the interrupt slice with evidence and required acceptance gates, then restore `state.current_slice` to `return_to`.

3. **Independent side task**
   - Use when the work is independent of the current slice.
   - Delegate only when the task has a disjoint write scope and can run safely in parallel.
   - If delegation is unavailable or unsafe, record it as `INT-*` or `BACKLOG-*` before continuing.

4. **Backlog item**
   - Use when the work is unrelated and not urgent.
   - Record it as `BACKLOG-*` in the workboard and rounds ledger.
   - Continue the current slice.

Do not use `current_phase: "paused"` as a response to user insertions. Pause metadata is not permission to stop; keep `active: true`, update the ledgers, and keep moving.
</User_Interruption_Protocol>

<Steps>
0. **Pre-context intake (required before execution loop starts)**:
   - Reuse or create `.codex/oh-my-ralpha/working-model/context/{task-slug}-{timestamp}.md`
   - Minimum fields:
     - task statement
     - desired outcome
     - known facts/evidence
     - constraints
     - unknowns/open questions
     - likely codebase touchpoints

0.5 **Plan-first gate (required before implementation)**:
   - Reuse or create `.codex/oh-my-ralpha/working-model/state/{task-slug}-todo.md`
   - Reuse or create `.codex/oh-my-ralpha/working-model/state/{task-slug}-rounds.json`
   - If the current TODO is larger than one session, decompose it into smaller sub-TODOs such as `P0-01A`, `P0-01B`, `P0-01C`
   - Use `architect` to validate large, risky, or ambiguous slice boundaries before implementation starts
   - Do not implement a large TODO directly if sub-TODO decomposition is missing

1. **Review progress**:
   - Read the workboard
   - Read the rounds ledger
   - Read trace/state if the last stop point is unclear
   - Confirm which single slice is actually next

2. **Continue from where you left off**:
   - If a slice is already `in_progress`, resume it
   - Otherwise promote the next pending blocker to `in_progress`
   - Never require repeated user "continue" messages when the next slice is obvious from working-model files

3. **Implement the active slice**:
   - The leader/main thread owns implementation in this standalone package
   - This standalone package does not bundle or emulate the OMX `team-executor` runtime
   - Default acceptance lane map:
     - `architect`: validate large/risky slice boundaries and architecture decisions
     - `code-reviewer`: verify code quality, correctness, and request fit
     - `code-simplifier`: review changed code for simplification opportunities and propose safe cleanup; it does not edit during acceptance
     - `workflow-auditor`: audit workboard, rounds, acceptance records, ralpha state, and Stop-hook closeout consistency
     - `ai-slop-cleaner`: final closeout deslop pass only
   - Large TODO decomposition is leader-owned, then `architect` validates the slice boundary
   - Slice acceptance is mandatory, but native subagent usage is bounded and reviewer-only:
     - Default to one native acceptance lane after fresh proof, usually `code-reviewer`
     - Add `architect` only for large, risky, cross-cutting, or boundary-sensitive changes
     - Add `code-simplifier` only in review-only mode after non-trivial code edits or at final cleanup when simplification advice is likely to reduce real complexity
     - Never spawn all three acceptance lanes simultaneously for ordinary slices; if a slice truly needs all three roles, run them serially and record why
     - Final closeout is the only exception: when all TODOs are complete and state is ready to clear, run four independent read-only lanes for `FINAL-CLOSEOUT`: `architect`, `code-reviewer`, `code-simplifier`, and `workflow-auditor`
   - Acceptance prompts are role prompts, not workflow invocations; do not include explicit `$ralpha` tokens in spawned acceptance prompts
   - Plain references to the package/workflow name are safe in acceptance prompts because the router only treats bare `ralpha` as a workflow trigger when explicit workflow intent is present
   - Acceptance prompts must include the narrow read scope, the latest proof command/output, the expected `PASS` / `CHANGES` shape, and an explicit ban on editing files or writing `ralpha_state`, workboard, or rounds files
   - Run acceptance agents as soon as the slice has fresh proof; use the degraded acceptance path only when native subagents are unavailable, capped, or timed out

4. **Run long operations in background**:
   - Builds, installs, and broad test suites use `run_in_background: true`

5. **Optional host visual helpers (when screenshot/reference images are present)**:
   - This standalone package does not bundle visual/web-clone helpers
   - If the host already provides `visual-verdict` or `web-clone`, use them for screenshot-driven or URL-cloning work
   - Otherwise record the missing optional helper in rounds/trace and continue with manual visual evidence

6. **Verify the slice with fresh evidence**:
   - Run the narrowest command that proves the change
   - Read the output, not just the exit code
   - If it fails, fix before moving on

6.5 **Test solidification**:
   - Add or update regression coverage so the slice is locked by tests, not remembered informally
   - Do not treat a slice as done until behavior is proven and tests are solidified

6.7 **TODO review-fix convergence loop**:
   - Every completed TODO/slice must run at least one reviewer acceptance pass after fresh proof
   - If a reviewer returns `CHANGES` or `REJECT`, the leader fixes it, reruns fresh proof, and repeats reviewer acceptance before marking the TODO complete
   - Each TODO may run at most three blocking review-fix rounds before escalation; round 1 focuses on spec/correctness, round 2 on edge cases/state transitions/regression risk, and round 3 on tests/maintainability/cleanup debt
   - Fix-review prompts must include the original TODO diff, previous reviewer findings, the fix diff, and fresh proof so reviewers do not only inspect the latest patch
   - If blocking findings remain after the third round, do not mark the TODO completed; record `escalated_review`, upgrade architect review, split a follow-up TODO, or explicitly ledger an accepted out-of-scope non-blocking item

7. **Bounded reviewer-only slice acceptance bundle**:
   - Fresh proof comes first; do not spawn acceptance agents against stale or unverified work
   - Use role-scoped acceptance prompts such as "Review slice P0-01 for the workflow package"; do not prefix them with `$ralpha`
   - Treat these as slice-level acceptance gates, not only final closeout gates
   - Default acceptance path: one `code-reviewer` pass for ordinary slices after fresh proof
   - Add `architect` for large, risky, cross-module, or boundary-sensitive slices
   - Add `code-simplifier` only in review-only mode when the slice changed non-trivial code and simplification has a realistic chance of improving maintainability
   - Never launch all three acceptance lanes at once for ordinary slices; the default concurrent native subagent budget is one, and the hard maximum is two active acceptance agents per slice
   - The final-closeout gate is the only exception to the ordinary slice budget and requires four separate read-only reviewers for `FINAL-CLOSEOUT`
   - If subagent creation hits a host limit, do not keep spawning replacements; record `degraded_subagent_limit`, run a leader-owned manual acceptance pass, and continue after fresh proof
   - `wait_agent` timeout is an observation timeout, not execution failure. A reviewer may still be working after the leader's wait call returns without a final message.
   - Prefer `ralpha acceptance wait --slice <id> --role <role>` or `ralpha_acceptance command=wait` when tmux/transcript evidence is available. It returns `accepted`, `blocked`, `idle_timeout`, or `max_timeout`, and records `activity_reset` whenever tmux pane output, transcript growth, or acceptance-record activity proves the reviewer is still moving.
   - Do not close, replace, or degrade a reviewer lane while tmux/transcript/acceptance activity is still changing. New output resets the idle timer; only continuous inactivity may produce `idle_timeout`.
   - If an acceptance agent times out, first inspect append-only acceptance evidence for the active slice/role (`ralpha_acceptance list`, `acceptance-records.ndjson`, `ralpha_acceptance command=wait`, or equivalent) after the last wait; if a verdict exists, consume that verdict instead of recording timeout/degraded status
   - Reviewer `CHANGES` or `REJECT` verdicts are blocking even if they arrive after a `wait_agent` timeout. A later leader/manual `PASS` does not override them; fix the finding or explicitly schedule accepted follow-up, rerun fresh proof, and repeat reviewer acceptance before completing the slice
   - When `tmux-cli-agent-harness` is installed, prefer it for user-inspected reviews, long-running reviewer diagnosis, native reviewer timeout recovery, and replacement reviewer runs that need retained pane history. Tmux is the evidence/interaction layer; `ralpha_state`, `ralpha_trace`, and `ralpha_acceptance` remain the durable control plane.
   - Do not introduce mailbox files for ralpha v1. Use tmux `capture-pane`/optional `pipe-pane` transcript for live evidence, `ralpha_trace` for operational checkpoints, and `ralpha_acceptance` for verdicts.
   - Only when no verdict exists after the evidence check and `acceptance wait` returns `idle_timeout` or `max_timeout` should the leader launch one bounded replacement reviewer, subject to the hard maximum of two active acceptance agents per slice; if the replacement also times out or spawning is unavailable/capped, record `degraded_acceptance_timeout`, run a leader-owned manual acceptance pass, and continue after fresh proof
   - Do not set `current_phase: "awaiting_user"` just to wait for a subagent; `awaiting_user` is only for a real user decision or missing user input
   - Do not mark a slice `completed` until fresh evidence plus required native or degraded acceptance evidence is recorded
   - Acceptance subagents must not edit code. If an acceptance lane unexpectedly changes files, treat that result as a contract violation, inspect the diff, make any keep/revert/fix decision in the leader thread, and re-run proof before recording acceptance
   - Subagents must not call `ralpha_state write`, `ralpha_state clear`, `state_write`, edit code, or edit `.codex/oh-my-ralpha/working-model/**`; the leader records accepted verdicts and follow-up verification in the workboard and rounds ledger
   - Subagents may only add information via `ralpha verdict <slice> <role> <PASS|CHANGES|REJECT|COMMENT> "summary"`; this append-only evidence is not a state transition until the leader applies it
   - If native subagent spawning is unavailable, record `degraded_missing_subagent_runtime` in rounds/trace; manual acceptance is a fallback note, not equivalent to preferred native approval

8. **Update the `.codex/oh-my-ralpha/working-model` truth-source files**:
   - Only the leader/main thread performs this step
   - Mark the slice `completed`
   - Record exact evidence in the workboard
   - Update the rounds ledger with:
     - current focus
     - completed TODOs
     - next TODO
     - blockers
     - verification evidence
     - remaining TODOs
   - `state_write({mode: "ralpha", actorRole: "leader", mutationReason: "advance active slice after accepted proof", iteration: <current>, current_phase: "executing", state: {current_slice: "<id>"}})`

9. **Final deslop pass**:
   - After all slices are accepted, the leader/main thread must run `ai-slop-cleaner` on all files changed during the session unless `--no-deslop` is active
   - Scope the cleaner to changed files only; do not widen it to unrelated files
   - Run the cleaner in standard mode, not `--review`; this is the explicit mutation lane, separate from reviewer-only acceptance
   - If the prompt contains `--no-deslop`, skip this pass and use the most recent successful pre-deslop verification evidence

9.5 **Post-deslop regression**:
   - After the final deslop pass, re-run tests/build/lint and confirm they still pass
   - If post-deslop regression fails, fix and retry before final closeout

9.7 **Final reviewer-only acceptance**:
   - After all TODOs are complete, no `current_slice` / `next_todo` remains, and post-deslop regression is green, run the mandatory final-closeout gate with fixed slice id `FINAL-CLOSEOUT`
   - Run four independent read-only reviewers for final closeout: `architect`, `code-reviewer`, `code-simplifier`, and `workflow-auditor`
   - Any `CHANGES` or `REJECT` from any final lane blocks state cleanup; the leader fixes it, reruns proof, and reruns all four final lanes
   - `code-simplifier` and `workflow-auditor` stay review-only; if either recommends cleanup, the leader applies it in the cleanup lane, reruns proof, and repeats final acceptance
   - Final acceptance prompts must explicitly say: "Do not edit files. Do not write or clear ralpha_state. Do not edit the workboard or rounds ledger."

9.8 **Sync final artifacts**:
   - Ensure workboard, rounds ledger, final verdict, and any audit doc all agree
   - Never leave one artifact saying `pending` and another saying `approved`

10. **Claim completion and clean up**:
   - Only claim done when:
     - no `pending` or `in_progress` items remain in the workboard
     - fresh verification is green
     - bounded reviewer-only architect / code-reviewer / code-simplifier acceptance, or recorded degraded acceptance, exists for every completed slice where the lane was warranted
     - TODO review-fix loops have converged, or `escalated_review` follow-up/non-blocking ledger decisions are recorded
     - final `ai-slop-cleaner` pass completed, unless `--no-deslop` explicitly skipped it
     - post-deslop regression passed, unless `--no-deslop` retained pre-deslop evidence
     - `FINAL-CLOSEOUT` has latest `PASS` verdicts from all four read-only lanes: `architect`, `code-reviewer`, `code-simplifier`, and `workflow-auditor`
     - final closeout artifacts are internally consistent
   - On approval:
     - `state_write({mode: "ralpha", actorRole: "leader", mutationReason: "all ralpha gates passed", active: false, current_phase: "complete", completed_at: "<now>"})`
     - `state_clear({mode: "ralpha", actorRole: "leader", mutationReason: "all final artifacts and verification gates are complete"})`
   - On rejection:
     - fix the raised issues, re-verify, and continue from the current truth-source files
</Steps>

<Tool_Usage>
- Use read-only exploration first: search, inspect, map touchpoints
- Use ralpha state tools as the execution spine:
  - `state_read(mode="ralpha")` on resume
  - `state_write(..., actorRole="leader", mutationReason="<why>")` on start / slice transition / verify / complete
  - `state_clear(mode="ralpha", actorRole="leader", mutationReason="<why>")` on final cleanup
- Use `trace` and the rounds ledger together when reconstructing the last stop point
- Use `architect`, `code-reviewer`, and `code-simplifier` as bounded reviewer-only native subagents for ordinary slice acceptance only when their role is warranted by risk and budget
- Use `workflow-auditor` only for final-closeout artifact/state consistency review, or for an explicitly escalated workflow-state concern
- Never ask acceptance subagents to edit code, write `ralpha_state`, clear state, or update the workboard/rounds ledger; the leader/main thread owns those transitions
- Ask acceptance subagents to add information only with one CLI format: `ralpha verdict <slice> <role> <PASS|CHANGES|REJECT|COMMENT> "summary"`
- Use `ai-slop-cleaner` only once at final closeout, after all slices are accepted
- Prefer targeted pytest/build/typecheck commands before broad suite runs
</Tool_Usage>

<Stop_Hook_Scope>
The native `Stop` hook is a cleanup guard, not a verification lane.

- It blocks while `ralpha` mode state is still `active: true`
- It reminds the agent to finish verification and cleanup before stopping
- It does not replace per-slice fresh evidence, bounded reviewer-only `architect` / `code-reviewer` / `code-simplifier` acceptance when warranted, the final deslop pass, or post-deslop regression
- If `active:true` has no `state.next_todo` or `state.current_slice`, the hook reads the latest workboard and rounds ledger; when all TODOs are complete and rounds has `next_todo:null` plus `remaining_todos:[]`, it blocks with the final-closeout gate instead of telling the agent to continue normal TODO work
- The final-closeout gate requires `FINAL-CLOSEOUT` `PASS` verdicts from `architect`, `code-reviewer`, `code-simplifier`, and `workflow-auditor`; after those exist, the hook should only ask the leader to mark state terminal and clear it, not rerun review or edit code
- `current_phase: "awaiting_user"` is the only active non-terminal phase that may end a turn; it must include `state.next_todo` or `state.current_slice` plus `state.awaiting_user_reason` or `state.awaiting_user_prompt`
- `current_phase: "paused"` is resumable metadata only; it is never permission to stop while `active: true`
- Blocker states such as acceptance timeouts must continue, fix the blocker, use an approved degraded path, or ask the user before stopping only when a real user decision is required
- It blocks inactive non-terminal pseudo-pauses such as `active: false` with `current_phase: "paused_after_*"`
- Clear the active mode state only after those gates are recorded in the workboard and rounds ledger
</Stop_Hook_Scope>

<Standalone_Runtime>
When external runtime tooling is unavailable, use the built-in JS runtime shipped in this repository:

- `ralpha init --task "<task>"`
- `ralpha state read --mode ralpha`
- `ralpha state write --mode ralpha --actor leader --reason "leader starts execution" --json '{"active":true}'`
- `ralpha state clear --mode ralpha --actor leader --reason "all final gates passed"`
- `ralpha verdict P0-02 architect PASS "accepted"`
- `ralpha verdict P0-02 code-reviewer CHANGES "ctx type mismatch"`
- `ralpha verdict P0-02 code-reviewer CHANGES "edge case failed" --review-round 2 --review-lens edge/state/regression --review-cycle-id P0-02-loop`
- `ralpha verdict FINAL-CLOSEOUT workflow-auditor PASS "workboard, rounds, acceptance, and state agree"`
- `ralpha acceptance wait --slice FINAL-CLOSEOUT --roles architect,code-reviewer,code-simplifier,workflow-auditor`
- `ralpha acceptance wait --slice P0-02 --roles architect,code-reviewer --tmux ralpha-P0-02-reviewer-a1b2 --log /tmp/ralpha-P0-02-reviewer-a1b2.log`
- `ralpha trace show`
- `ralpha workflow route --text "$ralpha update src/router.mjs with activation tests" --activate`
- `ralpha workflow init --task "<task>"`
- `ralpha workflow plan --task "<task>"`
- `ralpha workflow interview --task "<task>"`
- `ralpha route --text "$ralpha update src/router.mjs with activation tests" --activate`
- `ralpha plan scaffold --task "<task>"`
- `ralpha interview scaffold --task "<task>"`
- `ralpha doctor`
- `ralpha verify --scope project`
- `ralpha install`
- `ralpha setup --scope project --force`
- `ralpha uninstall --scope project`

If the launcher is not yet on `PATH`, run the same commands from the repository checkout via `node bin/oh-my-ralpha.js ...`.

Bundled companions are installed by `setup` from this package, not fetched from an external OMX checkout:

- role prompts/native agents: `architect`, `code-reviewer`, `code-simplifier`, `workflow-auditor`
- acceptance role prompts default to reviewer-only behavior; `code-simplifier` proposes cleanup during acceptance and does not edit unless a later leader-owned cleanup prompt explicitly authorizes write mode
- default reasoning budgets written by `setup`: `architect=high`, `code-reviewer=medium`, `code-simplifier=medium`, `workflow-auditor=high`
- skills: `ai-slop-cleaner`, `tmux-cli-agent-harness`
- `tmux-cli-agent-harness` provides inspectable tmux reviewer/test/diagnostic sessions; it does not replace ralpha MCP state, trace, or acceptance evidence
- `uninstall` removes those bundled companions when their files still match this package's managed copies; pre-existing or user-edited companion files are preserved
- If a host provides immutable built-in role budgets, keep acceptance prompts narrow and timeboxed instead of requesting higher effort

If a companion is missing from the target Codex home, `doctor` reports the fallback path:

- `architect` / `code-reviewer` / `code-simplifier` / `workflow-auditor` -> proceed with the leader's best grounded manual pass and record the missing capability in rounds/trace before continuing
- `ai-slop-cleaner` -> proceed in degraded mode with a manual cleanup checklist and record the missing capability in rounds/trace before continuing
- Native Codex integration is available through `setup`, which installs the skill, writes `.codex/config.toml`, and registers native hook wrappers in `.codex/hooks.json`
- Native Codex Plan-mode implementation handoff is supported as a hook bridge: exact UI handoff prompts such as `Implement the plan.` or `实施计划` are not public keywords, but `UserPromptSubmit` may activate ralpha execution and instruct the leader to sync the latest Plan-mode report into working-model artifacts before editing code.
- The same `setup` step now registers one built-in MCP server, `ralpha`, with grouped tool surfaces:
  - `ralpha_state`
  - `ralpha_acceptance`
  - `ralpha_trace`
  - `ralpha_workflow`
  - `ralpha_admin`
  - `ralpha_acceptance command=wait` implements tmux-aware acceptance waiting with default `idleMs=90000`, `maxMs=1200000`, and `pollMs=5000`; append-only verdict evidence can finish the wait even when a native wait call timed out
- Host collaboration mode switching is out of scope. oh-my-ralpha uses its own planning phase: create or refresh planning artifacts, avoid implementation, and wait for decision-complete artifacts plus an execution-specific prompt.
</Standalone_Runtime>

## State Management

Use the built-in ralpha state tools for the skill lifecycle. This is the Ralph inheritance point that stays, even though the loop is specialized around workboard + rounds files.

- **State ownership**:
  The leader/main thread is the sole writer of code, `ralpha_state`, `.codex/oh-my-ralpha/working-model/state/*-todo.md`, and `.codex/oh-my-ralpha/working-model/state/*-rounds.json` during acceptance/final review. Acceptance subagents may suggest the exact note to record, but they must not edit files, write state, or clear state themselves.
  State write/clear tools require `actorRole: "leader"` plus `mutationReason`; calls from `architect`, `code-reviewer`, `code-simplifier`, `workflow-auditor`, or generic subagent/acceptance roles are rejected. `current_phase: "awaiting_user"` is rejected unless the reason clearly names the real user input/decision needed. Subagents may add append-only information with `ralpha verdict`; the leader decides whether and how that information changes state.
- **On start**:
  `state_write({mode: "ralpha", actorRole: "leader", mutationReason: "leader starts ralpha execution", active: true, iteration: 1, max_iterations: 40, current_phase: "executing", started_at: "<now>", state: {context_snapshot_path: "<snapshot>", workboard_path: "<todo>", rounds_path: "<rounds>", current_slice: "<id>"}})`
- **On each iteration**:
  `state_write({mode: "ralpha", actorRole: "leader", mutationReason: "advance ralpha iteration", iteration: <current>, current_phase: "executing"})`
- **On verification/fix transition**:
  `state_write({mode: "ralpha", actorRole: "leader", mutationReason: "leader enters verification", current_phase: "verifying"})` or `state_write({mode: "ralpha", actorRole: "leader", mutationReason: "leader fixes failed proof", current_phase: "fixing"})`
- **On external interruption checkpoint**:
  `state_write({mode: "ralpha", actorRole: "leader", mutationReason: "record resumable interruption checkpoint", active: true, current_phase: "paused", pause_reason: "<reason>", state: {next_todo: "<id>", current_slice: "<id>"}})`
  This preserves resume metadata only; it does not permit the Stop hook to end the turn while the mode is active.
- **On waiting for the next user message**:
  `state_write({mode: "ralpha", actorRole: "leader", mutationReason: "waiting for user decision: <why input is needed>", active: true, current_phase: "awaiting_user", state: {next_todo: "<id>", current_slice: "<id>", awaiting_user_reason: "<why user input is needed>"}})`
  This is the only active non-terminal state that may end a turn so queued user input can be processed. Do not use it for subagent timeouts, subagent capacity limits, or background acceptance waits.
- **On completion**:
  `state_write({mode: "ralpha", actorRole: "leader", mutationReason: "all ralpha gates passed", active: false, current_phase: "complete", completed_at: "<now>"})`
- **On cleanup**:
  `state_clear({mode: "ralpha", actorRole: "leader", mutationReason: "all final artifacts and verification gates are complete"})`

<Artifacts>
- Context snapshot: `.codex/oh-my-ralpha/working-model/context/{task-slug}-{timestamp}.md`
- Workboard: `.codex/oh-my-ralpha/working-model/state/{task-slug}-todo.md`
- Round ledger: `.codex/oh-my-ralpha/working-model/state/{task-slug}-rounds.json`
- Optional final audit: `docs/{task-slug}_audit.md`
</Artifacts>

<Examples>
<Good>
There is already a parity TODO ledger with 5 remaining items.
Oh My Ralpha reads the workboard and rounds ledger, resumes the current slice, proves it, updates evidence, and moves on without waiting for repeated "continue" nudges.
</Good>

<Good>
A medium refactor spans several slices over time.
Oh My Ralpha uses persisted state plus workboard/rounds to keep moving from the right next slice on every resume.
</Good>

<Bad>
"Build me a whole new product."
Why bad: That needs `autopilot`.
</Bad>

<Bad>
"I don't know what we should do yet."
Why bad: That needs ordinary planning or requirements discovery before oh-my-ralpha execution.
</Bad>
</Examples>

<Final_Checklist>
- [ ] Context snapshot exists
- [ ] One authoritative workboard exists
- [ ] One rounds ledger exists
- [ ] Large TODOs were decomposed into sub-TODOs before implementation
- [ ] Exactly one slice was active at a time
- [ ] Each completed slice has fresh evidence
- [ ] Each completed slice has recorded reviewer-only bounded acceptance: native `code-reviewer` / `architect` / `code-simplifier` as warranted, or an explicit degraded reason after timeout, host limit, or unavailable native subagents
- [ ] TODO review-fix loops converged within three blocking rounds, or `escalated_review` follow-up/non-blocking ledger decisions are recorded
- [ ] Broader regressions were run before final claim
- [ ] Final `ai-slop-cleaner` ran on changed files (or `--no-deslop` explicitly skipped the deslop pass)
- [ ] Post-deslop regression passed (or the latest successful pre-deslop verification evidence was retained because `--no-deslop` was specified)
- [ ] `FINAL-CLOSEOUT` has four independent read-only `PASS` verdicts from `architect`, `code-reviewer`, `code-simplifier`, and `workflow-auditor`
- [ ] Closeout artifacts agree on the final state
- [ ] working-model state is marked complete and cleared
</Final_Checklist>

<Advanced>
## PRD Mode (Optional)

When the prompt contains `--prd`, keep Ralph's PRD behavior:
- create PRD artifacts first
- initialize canonical progress state
- continue using the workboard/rounds files as the execution truth source after PRD creation

### Detecting `--no-deslop`
If the prompt contains `--no-deslop`, skip the final `ai-slop-cleaner` pass and use the latest successful pre-deslop verification evidence, while still syncing workboard/rounds state and any audit artifact.
</Advanced>
