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

The runtime no longer includes the former prompt/tool/notify session logging feature. It should route and manage state without recording user prompt, tool input/output, or turn payload logs.

## Implementation Requirements

### 1. Workflow Requirements

The workflow must:

- preserve Ralph's persistence backbone
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

### 2. Runtime Requirements

The runtime must:

- install without depending on the original source checkout path
- install bundled companion prompts/native agents and companion skills from this package
- expose state and trace operations locally
- scaffold context / todo / rounds / planning artifacts
- integrate with Codex native hooks for startup, prompt routing, and Stop protection
- expose MCP tool surfaces
- provide a one-command verification path

These requirements are primarily implemented in:

- [src/install.mjs](../src/install.mjs)
- [src/setup.mjs](../src/setup.mjs)
- [src/cli.mjs](../src/cli.mjs)
- [src/verify.mjs](../src/verify.mjs)

## Core Architecture

The package is split into five layers.

### Skill Layer

The skill layer defines the behavioral contract.

Files:

- [skills/oh-my-ralpha/SKILL.md](../skills/oh-my-ralpha/SKILL.md)
- [skills/oh-my-ralpha/FLOW.md](../skills/oh-my-ralpha/FLOW.md)

It is responsible for:

- workflow semantics
- lane definitions
- bundled companion expectations
- truth-source expectations
- done-gate semantics
- user-facing capability framing

### Truth-Source Layer

The truth-source layer manages the `.codex/oh-my-ralpha/working-model` file model.

Files:

- [src/init.mjs](../src/init.mjs)
- [src/planning.mjs](../src/planning.mjs)
- [src/state.mjs](../src/state.mjs)
- [src/trace.mjs](../src/trace.mjs)

It is responsible for:

- context snapshot creation
- todo/rounds scaffolding
- PRD/test-spec/interview scaffolding
- mode-state persistence
- trace persistence

### Companion Layer

The package carries a small copied companion surface from the original OMX tree so the standalone install does not depend on `/oh-my-codex` at runtime.

Bundled role prompts/native agent configs:

- `architect`
- `code-reviewer`
- `code-simplifier`

Bundled companion skills:

- `ai-slop-cleaner`

The companion sources live under `companions/prompts/` and `companions/skills/` so Codex does not auto-discover them while developing this repository. `setup` installs them into the target Codex home under `prompts/`, `agents/`, and `skills/`. The oh-my-ralpha MCP/CLI remains intentionally narrow; it does not expose execution commands for those roles. Implementation stays in the main thread for this standalone package; `team-executor` is not bundled because the OMX team runtime is not bundled. Invoking `$oh-my-ralpha` is treated as explicit user intent for the workflow's per-slice native-subagent acceptance contract. If native subagents are unavailable, the workflow records degraded-mode evidence in rounds/trace instead of silently treating a manual pass as equivalent.

### Routing Layer

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

### Integration Layer

The integration layer connects the package to Codex.

Files:

- [src/setup.mjs](../src/setup.mjs)
- [src/native-hook.mjs](../src/native-hook.mjs)
- [src/mcp/protocol.mjs](../src/mcp/protocol.mjs)
- [src/mcp/state-server.mjs](../src/mcp/state-server.mjs)
- [src/mcp/trace-server.mjs](../src/mcp/trace-server.mjs)
- [src/mcp/runtime-server.mjs](../src/mcp/runtime-server.mjs)

It is responsible for:

- launcher installation
- `.codex/config.toml` integration
- `.codex/hooks.json` integration
- native hook dispatch
- MCP server exposure

### Verification Layer

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

## Codex Integration Plan

The current integration strategy uses two channels.

### 1. Native Hooks

The package currently owns these native hook surfaces:

- `SessionStart`
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
- `Stop`
  - preserve active-mode stop semantics

### 2. MCP

The package registers one progressive MCP server in `.codex/config.toml`:

- `oh_my_ralpha`

It exposes four grouped tools so Codex can directly call:

- `ralpha_state` for active mode state read/write/clear
- `ralpha_trace` for evidence and recovery trace append/show
- `ralpha_workflow` for route/init/plan/interview task shaping
- `ralpha_admin` for doctor/verify/setup/uninstall maintenance

The package verifies the unified server in release preflight.

## Ownership Model

The package uses a conservative ownership policy.

### hooks.json

- managed entries are merged into existing hooks
- uninstall removes only managed wrappers
- malformed `hooks.json` causes setup to fail loudly
- user hook content is preserved

### config.toml

- `codex_hooks = true` is added when needed
- managed MCP blocks are appended
- existing user `notify` entries are preserved and not wrapped
- uninstall removes only managed MCP content plus any old managed notify line from previous releases

### installed runtime

- install copies a runtime payload into `CODEX_HOME`
- launcher points to the installed runtime, not the source checkout
- this makes the install relocatable

## Verification Model

There are two levels of verification.

### Test Suite

The repository currently tests:

- keyword routing
- runtime state/trace
- setup/uninstall ownership
- MCP handler behavior
- MCP stdio handshake
- release-style verify
- absence of the removed session-log MCP tools

### Release Preflight

The package also provides:

```bash
oh-my-ralpha verify --scope project
```

That preflight currently checks:

- installed launcher present
- config present
- hooks present
- native `UserPromptSubmit` route path
- unified MCP handshake

## Current Limitations

This package is release-ready as a standalone repo, but it is still intentionally smaller than full `oh-my-codex`.

Notable limits:

- it does not attempt to reimplement the entire external team runtime
- it does not expose every historical external MCP/tool surface
- it does not record prompt, tool, or notify payload logs

## Suggested Next Extensions

The most natural next additions are:

1. richer doctor reporting for hook/MCP health
2. optional stale state cleanup under `.codex/oh-my-ralpha/working-model`
3. additional contract tests for future hook event changes

## Reference Files

Core implementation:

- [src/cli.mjs](../src/cli.mjs)
- [src/setup.mjs](../src/setup.mjs)
- [src/native-hook.mjs](../src/native-hook.mjs)
- [src/verify.mjs](../src/verify.mjs)

Tests:

- [test/setup-integration.test.mjs](../test/setup-integration.test.mjs)
- [test/mcp-integration.test.mjs](../test/mcp-integration.test.mjs)
- [test/mcp-stdio.test.mjs](../test/mcp-stdio.test.mjs)
- [test/verify.test.mjs](../test/verify.test.mjs)
