# AGENTS.md

This repository packages `oh-my-ralpha` as a standalone artifact bundle.

## Working rules

- Keep `skills/oh-my-ralpha/SKILL.md` and `skills/oh-my-ralpha/FLOW.md` aligned.
- Keep the example `.codex/oh-my-ralpha` truth-source files aligned with the skill contract.
- If public trigger phrases change, update:
  - `src/keywords.mjs`
  - `skills/oh-my-ralpha/SKILL.md`
  - `test/keywords.test.mjs`
  - `test/skill-contract.test.mjs` when the contract wording changes
- Use Node-only scripts in this repository.
- Prefer small, reviewable changes and re-run `npm test` after edits.

## Package goal

This repo should remain a self-contained, easy-to-read packaging surface for `oh-my-ralpha`:

- skill body
- flow explainer
- truth-source examples
- executable contract checks
