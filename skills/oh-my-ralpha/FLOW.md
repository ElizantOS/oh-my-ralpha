# Oh My Ralpha Flow

This skill is Ralph specialized for the workflow that actually worked during the Python query-engine parity push.

## What we keep from Ralph

1. **Capture context first**
   - Reuse a context snapshot instead of rediscovering the problem every turn.

2. **Use persistent OMX state**
   - State lifecycle still belongs in `state_write` / `state_read` / `state_clear`.

3. **Verify before claiming done**
   - Fresh proof is still mandatory.

4. **Clean closeout**
   - Final state must be marked complete and cleaned up.

## What we add from the parity workflow

1. **Use one truth source**
   - A TODO ledger and rounds file keep progress visible and prevent drift.

2. **Work one slice at a time**
   - Do not work every open thread at once.
   - Give each slice one clear acceptance target.

3. **Verify narrowly, then broadly**
   - First prove the slice with the smallest relevant command.
   - Then run the wider regression set once it is stable.

4. **Record proof**
   - New behavior is not done until it has direct evidence.

5. **Simplify after green**
   - Cleanup happens after the green proof, not before.

6. **Sync final artifacts**
   - Code, tests, TODOs, rounds, and any audit doc must agree.
   - Final approval waits until they match.

## What changes in emphasis

1. **Truth-source files become the execution spine**
   - The TODO ledger and rounds file are not optional notes; they drive resume and completion decisions.

2. **Planning happens at slice level**
   - Large TODOs are decomposed before implementation instead of being executed as one long opaque thread.

3. **Verification stays layered**
   - Narrow proof happens before wide regressions, then simplification, then post-simplification re-verification.

## Built-in runtime support

This standalone package ships JS fallbacks for the OMX surfaces that `oh-my-ralpha` depends on:

- install
- doctor
- init
- state read/write/clear
- trace append/show
- route activation
- plan scaffold
- interview scaffold

That means a fresh Codex can use the repository even before the full OMX runtime stack is present.
