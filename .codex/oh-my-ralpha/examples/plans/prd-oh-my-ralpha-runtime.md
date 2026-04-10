# PRD: oh-my-ralpha runtime hardening

## Goal
- Make the standalone `oh-my-ralpha` repository usable in a fresh Codex environment without depending on a live `oh-my-codex` checkout for core runtime behavior.

## In Scope
- Install an actual runtime payload into `CODEX_HOME`
- Tighten planning gate semantics
- Fix `initWorkspace()` return contract
- Keep the standalone skill docs aligned with the real runtime

## Out of Scope
- Full parity with the entire `oh-my-codex` CLI/runtime
- Team orchestration runtime
- Rich MCP server mesh beyond the minimum standalone runtime surfaces

## User Stories
1. As a new Codex user, I want `oh-my-ralpha install` to create a working installed command even if the source repo later moves.
2. As a workflow user, I want vague `oh-my-ralpha` prompts to keep respecting plan-first instead of skipping straight to execution just because stale planning artifacts exist.
3. As a caller of `initWorkspace()`, I want returned artifact paths to be trustworthy.
4. As an operator, I want `doctor` to explain what is installed, what is missing, and what fallback behavior exists.

## Acceptance Criteria
- Installed launcher works independently of the original repo path.
- Vague prompts remain gated unless an explicit approved continuation rule is met.
- `initWorkspace()` never returns a nonexistent context path.
- Tests cover install/runtime/gate behavior.
