# oh-my-ralpha @LOG TODO

## `L0-01`
- `title`: Add session-log state and file append helpers
- `priority`: P0
- `status`: completed
- `implementation overview`: Introduce a session-scoped logging helper that can enable logging, append hook/notify events, and expose the current log path.
- `acceptance`: The runtime has a durable place to record session log events once activated.
- `evidence`: Added `src/session-log.mjs` with durable session-log state, file append/read helpers, stable scope derivation, and ambiguity-safe fallback rules. Verified by `npm test` (`46/46`) and focused session-log regressions.

## `L0-02`
- `title`: Activate logging via @LOG in UserPromptSubmit
- `priority`: P0
- `status`: completed
- `implementation overview`: Detect `@LOG` in prompt-submit, enable the session log state, and preserve normal routing behavior for the remainder of the prompt.
- `acceptance`: Typing `@LOG` starts logging for the current session and returns confirmation context.
- `evidence`: `src/native-hook.mjs` now enables logging on `@LOG`, disables on `@UNLOG`, strips directives before routing, and records prompt-submit events. Manual smoke returned `session logging enabled` with a concrete log path.

## `L0-03`
- `title`: Capture tool hooks and notify turn payloads
- `priority`: P0
- `status`: completed
- `implementation overview`: Extend native hook coverage to `PreToolUse` / `PostToolUse` and add a notify handler so the session log includes tool-use events plus turn-complete assistant/user content.
- `acceptance`: Session logs contain both tool lifecycle and turn content after activation.
- `evidence`: Added `src/notify.mjs`, expanded native hook coverage to `PreToolUse`, `PostToolUse`, and `Stop`, and verified capture of notify payloads, tool lifecycle, and stop events in `test/session-log.test.mjs`.

## `L1-01`
- `title`: Wire setup/config ownership for logging surfaces
- `priority`: P1
- `status`: completed
- `implementation overview`: Update setup/uninstall to manage `notify` plus the extra native hook events safely without clobbering user config.
- `acceptance`: Project/user setup enables logging surfaces; uninstall preserves user-owned content.
- `evidence`: `src/setup.mjs` now writes managed `notify`, chains pre-existing non-managed notify commands, registers `PreToolUse` / `PostToolUse`, and preserves user hooks/config on uninstall. User-scope `setup --scope user --force` now succeeds against an existing oh-my-codex notify entry.

## `L1-02`
- `title`: Add debug-facing CLI/docs/tests for @LOG
- `priority`: P1
- `status`: completed
- `implementation overview`: Add minimal log inspection commands/docs plus regression coverage and verify integration updates.
- `acceptance`: The feature is discoverable, test-backed, and verifiable.
- `evidence`: Added CLI `notify` and `log <status|show|disable|clear-state>`, updated README and SKILL docs for `@LOG`, expanded `verify` to cover notify + tool-hook capture, and reached `npm test` `46/46`. Final `code-reviewer` verdict: `READY TO SHIP`.
