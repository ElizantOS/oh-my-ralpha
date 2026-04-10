# PRD: oh-my-ralpha session logging hook

## Goal
- Let the user type `@LOG` to enable session-level debugging capture, so later behavior shifts can be traced using durable logs instead of memory.

## In Scope
- `@LOG` activation from `UserPromptSubmit`
- Session-scoped log state
- Native hook logging for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `Stop`
- Notify-driven turn logging for assistant/user turn content
- Minimal CLI/log inspection helpers
- Setup/config integration for notify plus hook registration

## Out of Scope
- Always-on logging
- Remote upload/export
- UI viewer beyond local files / simple CLI surfaces

## Acceptance Criteria
- Typing `@LOG` enables logging for the current session and reports where logs are written.
- Subsequent tool hooks and turn-complete notify events append to the session log.
- Setup writes the necessary native hooks and notify config without clobbering user-owned config.
- Tests prove activation, payload capture, and ownership behavior.
