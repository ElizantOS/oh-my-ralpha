# oh-my-ralpha TODO

## `R-01`
- `title`: Build a Ralph inheritance matrix for `oh-my-ralpha`
- `priority`: P0
- `status`: completed
- `implementation overview`: Compare `skills/ralph/SKILL.md`, Ralph runtime expectations, and Ralph contract coverage against the new skill so `oh-my-ralpha` inherits the real persistence/verification/deslop/cleanup skeleton instead of a light rewrite.
- `acceptance`: A decision-complete inheritance matrix exists and drives subsequent implementation; no ambiguous “inherit some parts” wording remains.
- `evidence`: Reviewed `skills/ralph/SKILL.md` and carried forward Ralph’s pre-context intake, persistent state lifecycle, visual gate, architect verification, deslop loop, regression re-verification, and cleanup semantics into the packaged `oh-my-ralpha` contract.

## `R-02`
- `title`: Rewrite `oh-my-ralpha` skill body as Ralph-full plus `.codex/oh-my-ralpha` truth-source specialization
- `priority`: P0
- `status`: completed
- `implementation overview`: Rebuild `skills/oh-my-ralpha/SKILL.md` and `FLOW.md` so the skill keeps Ralph execution/persistence/verification semantics, then layers plan-first, workboard/rounds-driven continuation, sub-TODO decomposition, and final artifact sync.
- `acceptance`: `oh-my-ralpha` reads as a Ralph-derived full workflow, not a light cousin.
- `evidence`: The skill and flow center execution on `.codex/oh-my-ralpha/working-model/context`, `.codex/oh-my-ralpha/working-model/state/*-todo.md`, `.codex/oh-my-ralpha/working-model/state/*-rounds.json`, single active slice, layered verification, optional audit consistency, and Ralph-derived closeout guarantees.

## `R-03`
- `title`: Wire `oh-my-ralpha` into trigger, stateful-mode, and execution-gate plumbing
- `priority`: P0
- `status`: completed
- `implementation overview`: Extend routing, keyword registry, stateful skill seeding, heavy-mode detection, and execution gate logic so `oh-my-ralpha` behaves as a first-class Ralph-class execution workflow.
- `acceptance`: Triggering and state behavior are on par with other heavy workflows.
- `evidence`: This package includes trigger coverage for the canonical `$ralpha` command, rejects `$oh-my-ralpha` as a compatibility alias, rejects natural-language continuation without explicit `$ralpha` intent, and keeps seeded state defaults of `iteration: 1` and `max_iterations: 40`.

## `R-04`
- `title`: Add team-lane, sub-TODO decomposition, and done-gate contracts
- `priority`: P1
- `status`: completed
- `implementation overview`: Encode bounded reviewer-only architect/code-reviewer/code-simplifier acceptance lanes, mandatory large-TODO subdivision, and per-TODO completion gates in skill text and contract tests.
- `acceptance`: The workflow explicitly enforces planning, decomposition, bounded execution, and final review sequencing.
- `evidence`: `oh-my-ralpha` now hard-requires plan-first, sub-TODO decomposition for large work, one `in_progress` slice, layered verify -> reviewer-only bounded acceptance -> explicit cleanup when warranted -> regress -> artifact sync, and leader-owned code/state updates for the workboard and rounds ledger.

## `R-05`
- `title`: Add contract tests for Ralph inheritance and `.codex/oh-my-ralpha` truth-source execution
- `priority`: P1
- `status`: completed
- `implementation overview`: Extend tests beyond frontmatter/keyword detection to lock Ralph inheritance, workboard/rounds usage, plan-first gating, and final done-gate semantics.
- `acceptance`: Tests fail if `oh-my-ralpha` drifts away from Ralph-full plus `.codex/oh-my-ralpha` workflow semantics.
- `evidence`: This standalone repo carries Node tests for the canonical trigger contract, skill contract clauses, and the sample `.codex/oh-my-ralpha` truth-source artifacts.

## `R-06`
- `title`: Final review and package-readiness closeout
- `priority`: P1
- `status`: completed
- `implementation overview`: Run targeted tests, independent review, and final evidence sync so the skill is ready for packaging or further runtime-mode work.
- `acceptance`: Final closeout reviewer lanes say ready for packaging and all closeout artifacts agree.
- `evidence`: Final verification included build/test/trigger assertions plus architect, code-reviewer, code-simplifier, and workflow-auditor readiness verdicts before the workboard and rounds ledger were closed.
