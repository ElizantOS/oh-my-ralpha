---
name: ralpha
description: Ralph-derived persistent execution loop with mandatory native-subagent slice acceptance centered on .codex working-model truth-source files
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
- The user invokes `$ralpha` and thereby requests this workflow's native-subagent slice acceptance contract
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
- Fire independent specialist lanes simultaneously when they materially help
- Use `run_in_background: true` for long operations (builds, installs, full test suites)
- Deliver the full implementation: no scope reduction, no partial completion, no deleting tests to make them pass
- Before final completion: broad regressions, relevant typecheck/lint, slice acceptance evidence, final deslop, post-deslop regression, and final artifact sync
- Treat `$ralpha` invocation as explicit user intent to use the required per-slice native subagents: `architect`, `code-reviewer`, and `code-simplifier`
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
   - Use `architect` to validate large-slice boundaries before implementation starts
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
     - `architect`: validate slice boundaries and architecture decisions
     - `code-reviewer`: verify code quality, correctness, and request fit
     - `code-simplifier`: simplify changed code while preserving behavior
     - `ai-slop-cleaner`: final closeout deslop pass only
   - Large TODO decomposition is leader-owned, then `architect` validates the slice boundary
   - Slice acceptance is mandatory and must use native subagents when the host provides them:
     - spawn `architect`
     - spawn `code-reviewer`
     - spawn `code-simplifier`
   - Acceptance prompts are role prompts, not workflow invocations; do not include explicit `$ralpha` tokens in spawned acceptance prompts
   - Plain references to the package/workflow name are safe in acceptance prompts because the router only treats bare `ralpha` as a workflow trigger when explicit workflow intent is present
   - Run acceptance agents as soon as the slice has fresh proof; do not replace them with a manual pass unless native subagents are unavailable in the host runtime

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

7. **Slice acceptance bundle**:
   - Spawn `architect`, `code-reviewer`, and `code-simplifier` for every completed slice
   - Use role-scoped acceptance prompts such as "Review slice P0-01 for the workflow package"; do not prefix them with `$ralpha`
   - Treat these as slice-level acceptance gates, not only final closeout gates
   - Do not mark a slice `completed` until all three acceptance agents have returned PASS/APPROVED or all reported issues have been fixed and re-verified
   - If `code-simplifier` changes files, re-run the narrow slice proof and any affected tests before moving on
   - If `code-simplifier` changes behavior or creates uncertainty, revert/fix the simplification and repeat acceptance
   - Record all three acceptance results and any follow-up verification in the workboard and rounds ledger
   - If native subagent spawning is unavailable, record `degraded_missing_subagent_runtime` in rounds/trace; manual acceptance is a fallback note, not equivalent to subagent approval

8. **Update the `.codex/oh-my-ralpha/working-model` truth-source files**:
   - Mark the slice `completed`
   - Record exact evidence in the workboard
   - Update the rounds ledger with:
     - current focus
     - completed TODOs
     - next TODO
     - blockers
     - verification evidence
     - remaining TODOs
   - `state_write({mode: "ralpha", iteration: <current>, current_phase: "executing", state: {current_slice: "<id>"}})`

9. **Final deslop pass**:
   - After all slices are accepted, run `ai-slop-cleaner` on all files changed during the session
   - Scope the cleaner to changed files only
   - Run the cleaner in standard mode, not `--review`
   - If the prompt contains `--no-deslop`, skip this pass and use the most recent successful pre-deslop verification evidence

9.5 **Post-deslop regression**:
   - After the final deslop pass, re-run tests/build/lint and confirm they still pass
   - If post-deslop regression fails, fix and retry before final closeout

9.8 **Sync final artifacts**:
   - Ensure workboard, rounds ledger, final verdict, and any audit doc all agree
   - Never leave one artifact saying `pending` and another saying `approved`

10. **Claim completion and clean up**:
   - Only claim done when:
     - no `pending` or `in_progress` items remain in the workboard
     - fresh verification is green
     - architect / code-reviewer / code-simplifier acceptance passed for every completed slice
     - final `ai-slop-cleaner` pass completed, unless `--no-deslop` explicitly skipped it
     - post-deslop regression passed, unless `--no-deslop` retained pre-deslop evidence
     - final closeout artifacts are internally consistent
   - On approval:
     - `state_write({mode: "ralpha", active: false, current_phase: "complete", completed_at: "<now>"})`
     - `state_clear({mode: "ralpha"})`
   - On rejection:
     - fix the raised issues, re-verify, and continue from the current truth-source files
</Steps>

<Tool_Usage>
- Use read-only exploration first: search, inspect, map touchpoints
- Use ralpha state tools as the execution spine:
  - `state_read(mode="ralpha")` on resume
  - `state_write(...)` on start / slice transition / verify / complete
  - `state_clear(mode="ralpha")` on final cleanup
- Use `trace` and the rounds ledger together when reconstructing the last stop point
- Use `architect`, `code-reviewer`, and `code-simplifier` as spawned native subagents for the per-slice acceptance bundle
- Use `ai-slop-cleaner` only once at final closeout, after all slices are accepted
- Prefer targeted pytest/build/typecheck commands before broad suite runs
</Tool_Usage>

<Stop_Hook_Scope>
The native `Stop` hook is a cleanup guard, not a verification lane.

- It blocks while `ralpha` mode state is still `active: true`
- It reminds the agent to finish verification and cleanup before stopping
- It does not replace per-slice fresh evidence, `architect` / `code-reviewer` / `code-simplifier` slice acceptance, the final deslop pass, or post-deslop regression
- `current_phase: "awaiting_user"` is the only active non-terminal phase that may end a turn; it must include `state.next_todo` or `state.current_slice` plus `state.awaiting_user_reason` or `state.awaiting_user_prompt`
- `current_phase: "paused"` is resumable metadata only; it is never permission to stop while `active: true`
- Blocker states such as acceptance timeouts must continue, fix the blocker, use an approved degraded path, or ask the user before stopping
- It blocks inactive non-terminal pseudo-pauses such as `active: false` with `current_phase: "paused_after_*"`
- Clear the active mode state only after those gates are recorded in the workboard and rounds ledger
</Stop_Hook_Scope>

<Standalone_Runtime>
When external runtime tooling is unavailable, use the built-in JS runtime shipped in this repository:

- `ralpha init --task "<task>"`
- `ralpha state read --mode ralpha`
- `ralpha state write --mode ralpha --json '{"active":true}'`
- `ralpha state clear --mode ralpha`
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

- role prompts/native agents: `architect`, `code-reviewer`, `code-simplifier`
- skills: `ai-slop-cleaner`

If a companion is missing from the target Codex home, `doctor` reports the fallback path:

- `architect` / `code-reviewer` / `code-simplifier` -> proceed with the leader's best grounded manual pass and record the missing capability in rounds/trace before continuing
- `ai-slop-cleaner` -> proceed in degraded mode with a manual cleanup checklist and record the missing capability in rounds/trace before continuing
- Native Codex integration is available through `setup`, which installs the skill, writes `.codex/config.toml`, and registers native hook wrappers in `.codex/hooks.json`
- The same `setup` step now registers one built-in MCP server, `ralpha`, with grouped tool surfaces:
  - `ralpha_state`
  - `ralpha_trace`
  - `ralpha_workflow`
  - `ralpha_admin`
- Host collaboration mode switching is out of scope. oh-my-ralpha uses its own planning phase: create or refresh planning artifacts, avoid implementation, and wait for decision-complete artifacts plus an execution-specific prompt.
</Standalone_Runtime>

## State Management

Use the built-in ralpha state tools for the skill lifecycle. This is the Ralph inheritance point that stays, even though the loop is specialized around workboard + rounds files.

- **On start**:
  `state_write({mode: "ralpha", active: true, iteration: 1, max_iterations: 40, current_phase: "executing", started_at: "<now>", state: {context_snapshot_path: "<snapshot>", workboard_path: "<todo>", rounds_path: "<rounds>", current_slice: "<id>"}})`
- **On each iteration**:
  `state_write({mode: "ralpha", iteration: <current>, current_phase: "executing"})`
- **On verification/fix transition**:
  `state_write({mode: "ralpha", current_phase: "verifying"})` or `state_write({mode: "ralpha", current_phase: "fixing"})`
- **On external interruption checkpoint**:
  `state_write({mode: "ralpha", active: true, current_phase: "paused", pause_reason: "<reason>", state: {next_todo: "<id>", current_slice: "<id>"}})`
  This preserves resume metadata only; it does not permit the Stop hook to end the turn while the mode is active.
- **On waiting for the next user message**:
  `state_write({mode: "ralpha", active: true, current_phase: "awaiting_user", state: {next_todo: "<id>", current_slice: "<id>", awaiting_user_reason: "<why input is needed>"}})`
  This is the only active non-terminal state that may end a turn so queued user input can be processed.
- **On completion**:
  `state_write({mode: "ralpha", active: false, current_phase: "complete", completed_at: "<now>"})`
- **On cleanup**:
  `state_clear({mode: "ralpha"})`

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
- [ ] Each completed slice passed `architect` / `code-reviewer` / `code-simplifier` acceptance
- [ ] Broader regressions were run before final claim
- [ ] Final `ai-slop-cleaner` ran on changed files (or `--no-deslop` explicitly skipped the deslop pass)
- [ ] Post-deslop regression passed (or the latest successful pre-deslop verification evidence was retained because `--no-deslop` was specified)
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
