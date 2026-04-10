---
name: oh-my-ralpha
description: Ralph-derived persistent execution loop centered on OMX truth-source files
---

[OH-MY-RALPHA + RALPH - ITERATION {{ITERATION}}/{{MAX}}]

Continue the task from the current OMX truth-source files. Do not restart discovery if the next slice is already clear.

<Purpose>
Oh My Ralpha is a Ralph-derived persistence workflow. It keeps Ralph's full useful execution skeleton — pre-context grounding, persistent state, automatic continuation, fresh verification, architect review, deslop, post-deslop regression, and clean cleanup — but specializes the loop around the OMX files that actually drove our parity effort:

- `.codex/oh-my-ralpha/working-model/context/...` for shared grounding
- `.codex/oh-my-ralpha/working-model/state/...-todo.md` for the truth-source workboard
- `.codex/oh-my-ralpha/working-model/state/...-rounds.json` for the resume and verification ledger
- optional final audit doc for closeout when the task benefits from it
</Purpose>

<Use_When>
- The task requires real completion, not best-effort progress
- There is already a TODO ledger, audit list, or obvious remaining slices
- The user says "继续推进", "继续完成", "收掉这些 TODO", "keep moving", "finish the remaining work", or "继续处理"
- The user types `@LOG` because they want the current session fully recorded for debugging
- The work needs to run for a long time without drifting or waiting for repeated "continue" nudges
</Use_When>

<Do_Not_Use_When>
- The request is still vague or exploratory -- use `plan`
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
- Use OMX files as the source of truth, not transient conversation memory
- Use one authoritative workboard and one rounds ledger; never rely on an implicit checklist
- Keep exactly one slice `in_progress`
- If the rounds ledger already has `next_todo` or `current_focus`, continue from it automatically instead of waiting for the user to say "继续"
- Fire independent specialist lanes simultaneously when they materially help
- Use `run_in_background: true` for long operations (builds, installs, full test suites)
- Deliver the full implementation: no scope reduction, no partial completion, no deleting tests to make them pass
- Before final completion: broad regressions, relevant typecheck/lint, architect verification, code simplification, post-simplification regression, and final artifact sync
</Execution_Policy>

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
   - Use `analyst` to frame decomposition and `architect` to validate slice boundaries before implementation starts
   - Do not implement a large TODO directly if sub-TODO decomposition is missing

1. **Review progress**:
   - Read the workboard
   - Read the rounds ledger
   - Read trace/state if the last stop point is unclear
   - Confirm which single slice is actually next

2. **Continue from where you left off**:
   - If a slice is already `in_progress`, resume it
   - Otherwise promote the next pending blocker to `in_progress`
   - Never require repeated user "continue" messages when the next slice is obvious from OMX files

3. **Delegate lanes and implement the active slice**:
   - Default lane map:
     - `analyst`: frame and refine large TODO decomposition
     - `architect`: validate plan boundaries and final architecture decisions
     - `team-executor`: main implementation lane
     - `code-simplifier`: post-green simplification lane
     - `code-reviewer`: final quality closeout lane
   - Large TODO decomposition is serial:
     - `analyst` first
     - then `architect`
   - Implementation may use bounded parallel lanes:
     - main implementation lane
     - bounded test lane
   - Final review may run in parallel:
     - `architect`
     - `code-reviewer`

4. **Run long operations in background**:
   - Builds, installs, and broad test suites use `run_in_background: true`

5. **Visual task gate (when screenshot/reference images are present)**:
   - Keep Ralph's visual behavior:
     - use `visual-verdict` before edits for screenshot-driven work
     - use `web-clone` for URL-based cloning work

6. **Verify the slice with fresh evidence**:
   - Run the narrowest command that proves the change
   - Read the output, not just the exit code
   - If it fails, fix before moving on

6.5 **Test solidification**:
   - Add or update regression coverage so the slice is locked by tests, not remembered informally
   - Do not treat a slice as done until behavior is proven and tests are solidified

7. **Architect verification**:
   - Run architect verification for the completed slice or milestone
   - For final closeout, run `architect` and `code-reviewer` in parallel and require both to pass

7.5 **Mandatory Deslop Pass**:
   - After Step 7 passes, run `oh-my-codex:ai-slop-cleaner` on all files changed during the session
   - Scope the cleaner to changed files only
   - Run the cleaner in standard mode, not `--review`
   - If the prompt contains `--no-deslop`, skip this pass and use the most recent successful pre-simplification verification evidence

7.6 **Regression Re-verification**:
   - After the simplification pass, re-run tests/build/lint and confirm they still pass
   - If post-simplification regression fails, fix and retry before moving on

8. **Update the OMX truth-source files**:
   - Mark the slice `completed`
   - Record exact evidence in the workboard
   - Update the rounds ledger with:
     - current focus
     - completed TODOs
     - next TODO
     - blockers
     - verification evidence
     - remaining TODOs
   - `state_write({mode: "oh-my-ralpha", iteration: <current>, current_phase: "executing", state: {current_slice: "<id>"}})`

9. **Sync final artifacts**:
   - Ensure workboard, rounds ledger, final verdict, and any audit doc all agree
   - Never leave one artifact saying `pending` and another saying `approved`

10. **Claim completion and clean up**:
   - Only claim done when:
     - no `pending` or `in_progress` items remain in the workboard
     - fresh verification is green
     - architect verification passed for the final milestone
     - code-reviewer final closeout passed
     - final closeout artifacts are internally consistent
   - On approval:
     - `state_write({mode: "oh-my-ralpha", active: false, current_phase: "complete", completed_at: "<now>"})`
     - `state_clear({mode: "oh-my-ralpha"})`
   - On rejection:
     - fix the raised issues, re-verify, and continue from the current truth-source files
</Steps>

<Tool_Usage>
- Use read-only exploration first: search, inspect, map touchpoints
- Use OMX state tools as the execution spine:
  - `state_read(mode="oh-my-ralpha")` on resume
  - `state_write(...)` on start / slice transition / verify / complete
  - `state_clear(mode="oh-my-ralpha")` on final cleanup
- Use `trace` and the rounds ledger together when reconstructing the last stop point
- Use `architect` for stage guarantees and final architecture closeout
- Use `code-reviewer` for final quality closeout
- Use `team-executor` as the default main implementation lane for substantive slice work
- Use `code-simplifier` only after correctness is proven
- Prefer targeted pytest/build/typecheck commands before broad suite runs
</Tool_Usage>

<Standalone_Runtime>
When full OMX runtime tooling is unavailable, use the built-in JS runtime shipped in this repository:

- `oh-my-ralpha init --task "<task>"`
- `oh-my-ralpha state read --mode oh-my-ralpha`
- `oh-my-ralpha state write --mode oh-my-ralpha --json '{"active":true}'`
- `oh-my-ralpha state clear --mode oh-my-ralpha`
- `oh-my-ralpha trace show`
- `oh-my-ralpha route --text "$ralpha update src/router.mjs with activation tests" --activate`
- `oh-my-ralpha plan scaffold --task "<task>"`
- `oh-my-ralpha interview scaffold --task "<task>"`
- `oh-my-ralpha doctor`
- `oh-my-ralpha verify --scope project`
- `oh-my-ralpha install`
- `oh-my-ralpha setup --scope project --force`
- `oh-my-ralpha uninstall --scope project`
- `oh-my-ralpha log status --session <session-id>`
- `oh-my-ralpha log show --session <session-id> --limit 20`

If the launcher is not yet on `PATH`, run the same commands from the repository checkout via `node bin/oh-my-ralpha.js ...`.

Companion skills such as `plan`, `deep-interview`, `visual-verdict`, `web-clone`, and `ai-slop-cleaner` should still be used when available. If they are not installed, `doctor` reports the fallback path:

- `plan` -> built-in plan scaffold
- `deep-interview` -> built-in interview scaffold
- `visual-verdict` / `web-clone` / `ai-slop-cleaner` -> proceed in degraded mode and record the missing capability in rounds/trace before continuing
- Native Codex integration is available through `setup`, which installs the skill, writes `.codex/config.toml`, and registers native hook wrappers in `.codex/hooks.json`
- The same `setup` step now registers built-in MCP tool surfaces:
  - `oh_my_ralpha_state`
  - `oh_my_ralpha_trace`
  - `oh_my_ralpha_runtime`
- Typing `@LOG` in a prompt enables session logging for the current session; logs are written under `.codex/oh-my-ralpha/working-model/logs/session-logs/` and can be inspected with `oh-my-ralpha log show`
</Standalone_Runtime>

## State Management

Use existing OMX state tools for the skill lifecycle. This is the Ralph inheritance point that stays, even though the loop is specialized around workboard + rounds files.

- **On start**:
  `state_write({mode: "oh-my-ralpha", active: true, iteration: 1, max_iterations: 40, current_phase: "executing", started_at: "<now>", state: {context_snapshot_path: "<snapshot>", workboard_path: "<todo>", rounds_path: "<rounds>", current_slice: "<id>"}})`
- **On each iteration**:
  `state_write({mode: "oh-my-ralpha", iteration: <current>, current_phase: "executing"})`
- **On verification/fix transition**:
  `state_write({mode: "oh-my-ralpha", current_phase: "verifying"})` or `state_write({mode: "oh-my-ralpha", current_phase: "fixing"})`
- **On completion**:
  `state_write({mode: "oh-my-ralpha", active: false, current_phase: "complete", completed_at: "<now>"})`
- **On cleanup**:
  `state_clear({mode: "oh-my-ralpha"})`

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
Why bad: That needs `plan`.
</Bad>
</Examples>

<Final_Checklist>
- [ ] Context snapshot exists
- [ ] One authoritative workboard exists
- [ ] One rounds ledger exists
- [ ] Large TODOs were decomposed into sub-TODOs before implementation
- [ ] Exactly one slice was active at a time
- [ ] Each completed slice has fresh evidence
- [ ] Broader regressions were run before final claim
- [ ] Architect verification passed for the final milestone
- [ ] Code-reviewer final closeout passed
- [ ] `code-simplifier` ran on changed files (or `--no-deslop` explicitly skipped the simplification pass)
- [ ] Post-simplification regression passed (or the latest successful pre-simplification verification evidence was retained because `--no-deslop` was specified)
- [ ] Closeout artifacts agree on the final state
- [ ] OMX state is marked complete and cleared
</Final_Checklist>

<Advanced>
## PRD Mode (Optional)

When the prompt contains `--prd`, keep Ralph's PRD behavior:
- create PRD artifacts first
- initialize canonical progress state
- continue using the workboard/rounds files as the execution truth source after PRD creation

### Detecting `--no-deslop`
If the prompt contains `--no-deslop`, skip the simplification pass and use the latest successful pre-simplification verification evidence, while still syncing workboard/rounds state and any audit artifact.
</Advanced>
