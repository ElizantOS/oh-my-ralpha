# oh-my-ralpha

`oh-my-ralpha` is a standalone repository for the Ralph-derived skill we built during the Python query-engine parity push.

This repo is not the full `oh-my-codex` runtime. It is the extracted `oh-my-ralpha` package surface plus a standalone JS runtime:

- the skill body
- the flow explainer
- example `.codex/oh-my-ralpha/examples` truth-source artifacts
- minimal Node-based contract, trigger, setup, and MCP tests

## Why this repo exists

The skill stopped being reliable only when it lived as prose alone. The useful package is the combination of:

- `skills/oh-my-ralpha/SKILL.md`
- `skills/oh-my-ralpha/FLOW.md`
- `.codex/oh-my-ralpha/examples/context/...`
- `.codex/oh-my-ralpha/examples/state/...-todo.md`
- `.codex/oh-my-ralpha/examples/state/...-rounds.json`
- executable trigger/contract checks

This repository keeps those pieces together.

## What it is

`oh-my-ralpha` is a standalone package that combines four things:

1. A Ralph-derived workflow skill
2. A local `.codex/oh-my-ralpha/working-model` truth-source working model
3. A built-in JavaScript runtime
4. A Codex integration layer based on native hooks, `notify`, and MCP servers

The package is meant to be usable in a fresh Codex environment without requiring the full `oh-my-codex` runtime tree.

## What problem it solves

The original motivation was not "write another skill markdown file." It was:

- keep long-running execution from drifting
- keep progress in files instead of transient chat memory
- make install/setup/uninstall behavior deterministic
- expose a small but real runtime surface inside Codex
- make debugging possible when Codex behavior changes after certain skills or tools are used

That is why this repository contains both the skill and the runtime that supports it.

## Core requirements

The current repository implements these requirement groups:

- **Workflow requirements**
  - Ralph-style persistence
  - plan-first execution
  - one authoritative workboard
  - one authoritative rounds ledger
  - one active slice at a time
  - narrow proof before broad proof
- **Runtime requirements**
  - install into `CODEX_HOME`
  - setup/uninstall for Codex integration
  - native hooks for `SessionStart`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, and `Stop`
  - built-in MCP servers for state, trace, and runtime actions
  - release-style `verify` preflight
- **Debugging requirements**
  - `@LOG` session logging
  - session-scoped log files under `.codex/oh-my-ralpha/working-model/logs/session-logs/`
  - capture of prompt, tool, stop, and notify turn surfaces

## How it works

At a high level, `oh-my-ralpha` works like this:

1. The skill contract defines how work should be planned, resumed, verified, and closed out.
2. The runtime initializes and maintains `.codex/oh-my-ralpha/working-model/context`, `.codex/oh-my-ralpha/working-model/state`, `.codex/oh-my-ralpha/working-model/plans`, and `.codex/oh-my-ralpha/working-model/logs`.
3. `setup` installs:
   - the skill bundle
   - a launcher
   - Codex native hook registrations in `.codex/hooks.json`
   - MCP server registrations in `.codex/config.toml`
4. Native hooks and `notify` feed runtime events back into the local state/log system.
5. `verify` checks the installed/runtime surface end-to-end.

The result is a package that is more than a prompt: it is a small local execution environment around a workflow.

## Agent lanes

The workflow-level execution lanes currently formalized by `oh-my-ralpha` are:

- `analyst`
- `architect`
- `team-executor`
- `code-simplifier`
- `code-reviewer`

These are the lanes `oh-my-ralpha` uses when it needs decomposition, implementation, simplification, and sign-off.

## Codex integration surface

The current Codex integration has three layers:

- **Native hooks**
  - `SessionStart`
  - `PreToolUse`
  - `PostToolUse`
  - `UserPromptSubmit`
  - `Stop`
- **notify**
  - captures post-turn payloads
  - can chain a pre-existing notify command instead of clobbering it
- **MCP**
  - `oh_my_ralpha_state`
  - `oh_my_ralpha_trace`
  - `oh_my_ralpha_runtime`

This means the package can influence prompt routing, record tool/turn activity, and expose runtime actions through MCP tools.

## @LOG debugging hook

If you type `@LOG` in a prompt, `oh-my-ralpha` enables session logging for the current session scope.

The logger records:

- `UserPromptSubmit`
- `PreToolUse`
- `PostToolUse`
- `Stop`
- `notify` turn payloads

This exists specifically to help debug "Codex behaved differently after I used a certain skill/tool" situations.

The current log inspection commands are:

```bash
oh-my-ralpha log status --session <session-id>
oh-my-ralpha log show --session <session-id> --limit 50
oh-my-ralpha log disable --session <session-id>
```

## Detailed docs

Detailed documentation lives in:

- [Implementation Guide](./docs/implementation.md)

That document covers:

- implementation requirements
- internal architecture
- state / hooks / notify / MCP design
- the Codex integration plan
- logging/debugging model
- current limitations and extension points

## Structure

- `skills/oh-my-ralpha/`
  - packaged skill documents
- `.codex/oh-my-ralpha/examples/`
  - curated example context, plan, and state artifacts
- `.codex/oh-my-ralpha/working-model/`
  - live writable truth-source root used by the runtime
- `src/`
  - standalone runtime, setup, native hook, and MCP helpers
- `docs/`
  - detailed implementation and integration documentation
- `test/`
  - Node contract tests

## Usage

Run the standalone checks with:

```bash
npm test
```

Use the built-in runtime with:

```bash
oh-my-ralpha doctor --scope project
oh-my-ralpha setup --scope project --force
oh-my-ralpha verify --scope project
oh-my-ralpha init --task "bootstrap a new task"
oh-my-ralpha route --text '$ralpha update src/router.mjs with activation tests' --activate
oh-my-ralpha state read --mode oh-my-ralpha
oh-my-ralpha trace show
oh-my-ralpha log status --session <session-id>
oh-my-ralpha log show --session <session-id> --limit 20
```

To enable session logging from inside Codex, type `@LOG` in a prompt. After that, the current session will start appending:

- `UserPromptSubmit`
- `PreToolUse`
- `PostToolUse`
- `Stop`
- `notify` turn payloads including input messages and assistant output

Logs are written under `.codex/oh-my-ralpha/working-model/logs/session-logs/`.

After `setup`, Codex also gets native hooks plus three `oh-my-ralpha` MCP servers:

- `oh_my_ralpha_state`
- `oh_my_ralpha_trace`
- `oh_my_ralpha_runtime`

Install the skill into `CODEX_HOME` with:

```bash
node bin/oh-my-ralpha.js install
```

If `CODEX_HOME/bin` is not on `PATH`, either add it or run the repo-local fallback:

```bash
node bin/oh-my-ralpha.js doctor
```

The tests cover:

- public trigger aliases such as `$ralpha` and `继续处理`
- the packaged skill contract
- the sample `.codex/oh-my-ralpha` truth-source artifacts
- the standalone JS runtime for install/doctor/init/state/trace/route
- setup / uninstall / native hook bootstrap
- MCP state / trace / runtime tool exposure
- release-style `verify` preflight
- `@LOG` session capture and log inspection

## Scope

This repo intentionally focuses on the `oh-my-ralpha` package itself.
It does not attempt to duplicate the full `oh-my-codex` runtime.
