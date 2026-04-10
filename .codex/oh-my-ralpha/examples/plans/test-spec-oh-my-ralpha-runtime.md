# Test Spec: oh-my-ralpha runtime hardening

## Narrow Proof
- `npm test`

## Targeted Assertions
- Installed runtime remains executable after the source repo is moved or unavailable.
- `routePrompt("$ralpha fix this")` is gated to planning on vague prompts even when generic planning artifacts exist.
- `initWorkspace()` returns either the existing snapshot path or a created snapshot path, never a phantom path.
- Skill docs continue to describe the actual built-in runtime and fallback behavior.

## Broad Regression
- `npm test`
- `node ./bin/oh-my-ralpha.js doctor`
- `node ./bin/oh-my-ralpha.js route --text '$ralpha fix this'`
