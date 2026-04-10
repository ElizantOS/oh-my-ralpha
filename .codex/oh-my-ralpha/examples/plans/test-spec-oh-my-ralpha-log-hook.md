# Test Spec: oh-my-ralpha session logging hook

## Narrow Proof
- `npm test`

## Targeted Assertions
- `@LOG` in `UserPromptSubmit` activates session logging state and creates a log file path.
- `notify` payloads append assistant-turn content to the session log while active.
- `PreToolUse` / `PostToolUse` append tool lifecycle records while active.
- Setup writes `notify = ["node", "..."]` and registers `PreToolUse` / `PostToolUse`.
- Ownership is preserved: invalid config fails loudly; user hooks/config survive uninstall.

## Broad Regression
- `npm test`
- `node ./bin/oh-my-ralpha.js setup --scope project --force`
- `node ./bin/oh-my-ralpha.js verify --scope project`
