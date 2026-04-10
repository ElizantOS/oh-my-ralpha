# oh-my-ralpha Implementation Guide

## Summary

`oh-my-ralpha` is a standalone package that combines:

- a Ralph-derived workflow skill
- a local `.codex/oh-my-ralpha/working-model` file model
- a JavaScript runtime
- a Codex integration layer

The goal is not just to ship prose instructions. The goal is to ship a workflow that can:

- install cleanly into `CODEX_HOME`
- create and maintain durable truth-source files
- integrate with Codex hooks and MCP
- survive long-running work without drifting
- expose enough observability to debug behavior changes

This document explains the current implementation requirements, architecture, and Codex integration model.

## Implementation requirements

The repository was built to satisfy these requirement groups.

### 1. Workflow requirements

The workflow must:

- preserve Ralph’s persistence backbone
- require pre-context grounding
- require plan-first execution for vague prompts
- keep a single authoritative TODO workboard
- keep a single authoritative rounds ledger
- enforce one active slice at a time
- require verification before completion
- support architect and reviewer closeout

These requirements are encoded in:

- [skills/oh-my-ralpha/SKILL.md](../skills/oh-my-ralpha/SKILL.md)
- [skills/oh-my-ralpha/FLOW.md](../skills/oh-my-ralpha/FLOW.md)

### 2. Runtime requirements

The runtime must:

- install without depending on the original source checkout path
- expose state and trace operations locally
- scaffold context / todo / rounds / planning artifacts
- integrate with Codex native hooks
- expose MCP tool surfaces
- provide a one-command verification path

These requirements are primarily implemented in:

- [src/install.mjs](../src/install.mjs)
- [src/setup.mjs](../src/setup.mjs)
- [src/cli.mjs](../src/cli.mjs)
- [src/verify.mjs](../src/verify.mjs)

### 3. Debugging requirements

The runtime must make post-hoc debugging practical.

That is why `@LOG` was added. The feature must:

- enable session-scoped logging from inside Codex
- log prompt-side hook activity
- log tool lifecycle activity
- log post-turn notify payloads
- avoid cross-session contamination
- preserve existing user notify behavior instead of silently clobbering it

These requirements are implemented in:

- [src/session-log.mjs](../src/session-log.mjs)
- [src/native-hook.mjs](../src/native-hook.mjs)
- [src/notify.mjs](../src/notify.mjs)

## Core architecture

The package is split into five layers.

### Skill layer

The skill layer defines the behavioral contract.

Files:

- [skills/oh-my-ralpha/SKILL.md](../skills/oh-my-ralpha/SKILL.md)
- [skills/oh-my-ralpha/FLOW.md](../skills/oh-my-ralpha/FLOW.md)

It is responsible for:

- workflow semantics
- lane definitions
- truth-source expectations
- done-gate semantics
- user-facing capability framing

### Truth-source layer

The truth-source layer manages the `.codex/oh-my-ralpha/working-model` file model.

Files:

- [src/init.mjs](../src/init.mjs)
- [src/planning.mjs](../src/planning.mjs)
- [src/state.mjs](../src/state.mjs)
- [src/trace.mjs](../src/trace.mjs)

It is responsible for:

- context snapshot creation
- todo/rounds scaffolding
- PRD/test-spec/deep-interview scaffolding
- mode-state persistence
- trace persistence

### Routing layer

The routing layer decides whether a prompt should enter `oh-my-ralpha` and whether it should be gated back to planning first.

Files:

- [src/keywords.mjs](../src/keywords.mjs)
- [src/router.mjs](../src/router.mjs)

It is responsible for:

- trigger phrase recognition
- explicit alias recognition like `$ralpha`
- underspecified prompt detection
- plan-first gating
- skill activation state bootstrap

### Integration layer

The integration layer connects the package to Codex.

Files:

- [src/setup.mjs](../src/setup.mjs)
- [src/native-hook.mjs](../src/native-hook.mjs)
- [src/notify.mjs](../src/notify.mjs)
- [src/mcp/protocol.mjs](../src/mcp/protocol.mjs)
- [src/mcp/state-server.mjs](../src/mcp/state-server.mjs)
- [src/mcp/trace-server.mjs](../src/mcp/trace-server.mjs)
- [src/mcp/runtime-server.mjs](../src/mcp/runtime-server.mjs)

It is responsible for:

- launcher installation
- `.codex/config.toml` integration
- `.codex/hooks.json` integration
- native hook dispatch
- notify capture
- MCP server exposure

### Verification layer

The verification layer proves the package actually works.

Files:

- [src/verify.mjs](../src/verify.mjs)
- [test/](../test)

It is responsible for:

- runtime smoke checks
- setup/uninstall ownership checks
- MCP handler checks
- MCP stdio protocol checks
- release-style project-scope verification
- `@LOG` regression coverage

## Codex integration plan

The current integration strategy uses three channels.

### 1. Native hooks

The package currently owns these native hook surfaces:

- `SessionStart`
- `PreToolUse`
- `PostToolUse`
- `UserPromptSubmit`
- `Stop`

The hook bootstrap is installed by `setup`, which writes `.codex/hooks.json`.

Design intent:

- `SessionStart`
  - restore working context
  - ensure `.codex/oh-my-ralpha/working-model` roots exist
- `UserPromptSubmit`
  - route prompt keywords
  - apply plan-first gate
  - enable `@LOG`
- `PreToolUse`
  - record the “before” side of tool execution
- `PostToolUse`
  - record the “after” side of tool execution
- `Stop`
  - record stop attempts
  - preserve active-mode stop semantics

### 2. notify

Native hooks do not give the whole turn transcript by themselves.
So the package also integrates through Codex `notify`.

The installed `notify` entry points to `oh-my-ralpha`'s own notify handler, which:

1. records the notify payload into the session log if `@LOG` is active
2. forwards the same payload to any pre-existing non-managed notify command through a chain file

This is important because many users already have a notify pipeline.
The design goal is to preserve that behavior while adding session logging, not replace it.

### 3. MCP

The package also registers three MCP servers in `.codex/config.toml`:

- `oh_my_ralpha_state`
- `oh_my_ralpha_trace`
- `oh_my_ralpha_runtime`

These exist so Codex can directly call:

- state tools
- trace tools
- runtime helpers such as route/init/doctor/setup/uninstall/log readout

The package now verifies all three servers in release preflight.

## How @LOG works

`@LOG` is a session-debugging feature, not just a trace toggle.

### Activation

When `@LOG` appears in `UserPromptSubmit`:

1. the hook detects the directive
2. a session-log state file is created/updated
3. a stable scope id is chosen
4. the log file path is persisted
5. a `logging-enabled` control event is written

### Scope resolution

The logger tries to avoid both drift and accidental cross-session contamination.

Scope priority:

1. `session_id`
2. `thread_id`
3. `transcript_path`
4. `session_pid` / Codex pid
5. workspace-derived fallback

Important rule:

- when later events are missing identifiers and there is more than one active logging session in the workspace, the logger does **not** assign that event to the “latest” session
- it drops the ambiguous event instead of misattributing it

That tradeoff was chosen because this feature is for debugging. Wrong attribution is worse than missing one ambiguous event.

### Captured surfaces

Once active, the logger records:

- `logging-enabled`
- `logging-disabled`
- `UserPromptSubmit`
- `PreToolUse`
- `PostToolUse`
- `Stop`
- notify turn payloads

The log entries include:

- timestamp
- scope id
- channel
- event name
- summarized fields for quick inspection
- raw payload for forensic debugging

### Inspection

Current CLI surfaces:

```bash
oh-my-ralpha log status --session <session-id>
oh-my-ralpha log show --session <session-id> --limit 50
oh-my-ralpha log disable --session <session-id>
oh-my-ralpha log clear-state --session <session-id>
```

## Ownership model

The package uses a conservative ownership policy.

### hooks.json

- managed entries are merged into existing hooks
- uninstall removes only managed wrappers
- malformed `hooks.json` causes setup to fail loudly
- user hook content is preserved

### config.toml

- `codex_hooks = true` is added when needed
- managed MCP blocks are appended
- managed `notify` is installed
- a pre-existing non-managed `notify` is chained and preserved
- uninstall removes only the managed `notify`/MCP content

### installed runtime

- install copies a runtime payload into `CODEX_HOME`
- launcher points to the installed runtime, not the source checkout
- this makes the install relocatable

## Verification model

There are two levels of verification.

### Test suite

The repository currently tests:

- keyword routing
- runtime state/trace
- setup/uninstall ownership
- MCP handler behavior
- MCP stdio handshake
- release-style verify
- `@LOG` activation and capture

### Release preflight

The package also provides:

```bash
oh-my-ralpha verify --scope project
```

That preflight currently checks:

- installed launcher present
- config present
- hooks present
- notify configured
- native `UserPromptSubmit` logging path
- MCP state handshake
- MCP trace handshake
- MCP runtime handshake
- tool and notify capture relevant to the logging feature

## Current limitations

This package is release-ready as a standalone repo, but it is still intentionally smaller than full `oh-my-codex`.

Notable limits:

- it does not attempt to reimplement the entire OMX team runtime
- it does not expose every original OMX MCP/tool surface
- the logging model only sees the surfaces Codex exposes through hooks and notify
- it does not capture model-internal reasoning, only observable runtime behavior

## Suggested next extensions

The most natural next additions are:

1. `log export`
   - package one session log plus state snapshot for sharing/debugging
2. `log diff`
   - compare pre/post skill behavior across two sessions
3. richer notify health reporting
   - show whether chained upstream notify is succeeding or failing
4. optional log retention policy
   - clean up old session logs automatically

## Reference files

Core implementation:

- [src/cli.mjs](../src/cli.mjs)
- [src/setup.mjs](../src/setup.mjs)
- [src/native-hook.mjs](../src/native-hook.mjs)
- [src/notify.mjs](../src/notify.mjs)
- [src/session-log.mjs](../src/session-log.mjs)
- [src/verify.mjs](../src/verify.mjs)

Tests:

- [test/session-log.test.mjs](../test/session-log.test.mjs)
- [test/setup-integration.test.mjs](../test/setup-integration.test.mjs)
- [test/mcp-integration.test.mjs](../test/mcp-integration.test.mjs)
- [test/mcp-stdio.test.mjs](../test/mcp-stdio.test.mjs)
- [test/verify.test.mjs](../test/verify.test.mjs)
