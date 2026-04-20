# oh-my-ralpha

`oh-my-ralpha` is a standalone repository for the Ralph-derived skill we built during the Python query-engine parity push.

This project comes out of the `oh-my-codex` / OMX workflow lineage, but it is
not the full OMX runtime. OMX is powerful, but too heavy when the goal is to
ship one focused persistence skill that keeps long-running agent work from
drifting. `oh-my-ralpha` keeps the useful pieces from that lineage and packages
them as a small Codex-native runtime:

- the skill body
- the flow explainer
- example `.codex/oh-my-ralpha/examples` truth-source artifacts
- minimal Node-based contract, trigger, setup, and MCP tests

## Relationship to OMX

OMX proved the value of persistent agent state, role lanes, traceable progress,
and local runtime surfaces. The problem is that the full OMX stack is larger
than this skill needs, and its general-purpose orchestration does not by itself
solve the most important failure mode we saw: long-running work slowly drifting
away from the actual TODO ledger and evidence.

`oh-my-ralpha` is the lightweight extraction:

- **From OMX**: persistent state, local Codex integration, MCP exposure, and
  explicit execution lanes.
- **Not from OMX**: heavyweight team runtime, broad orchestration surface, and
  `.omx` project state as the package truth source.
- **Added here**: a strict working-model loop centered on
  `.codex/oh-my-ralpha/working-model`, one active slice at a time, mandatory
  evidence updates, and resume behavior that follows files instead of chat
  memory.

## Why this repo exists

The skill stopped being reliable when it lived as prose alone, and the full OMX
runtime was too broad for a standalone package. The useful unit is the
combination of:

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
4. A Codex integration layer based on native hooks and MCP servers

The package is meant to be usable in a fresh Codex environment without requiring the full `oh-my-codex` runtime tree.

## What problem it solves

The original motivation was not "write another skill markdown file." It was:

- keep long-running execution from drifting
- keep progress in files instead of transient chat memory
- make install/setup/uninstall behavior deterministic
- expose a small but real runtime surface inside Codex
- avoid requiring the full OMX stack for a focused long-context persistence loop

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
  - install bundled companion prompts/native agents and companion skills
  - setup/uninstall for Codex integration
  - native hooks for `SessionStart`, `UserPromptSubmit`, and `Stop`
  - one built-in MCP server with state, trace, workflow, and admin command groups
  - release-style `verify` preflight

## How it works

At a high level, `oh-my-ralpha` works like this:

1. The skill contract defines how work should be planned, resumed, verified, and closed out.
2. The runtime initializes and maintains `.codex/oh-my-ralpha/working-model/context`, `.codex/oh-my-ralpha/working-model/state`, and `.codex/oh-my-ralpha/working-model/plans`.
3. `setup` installs the skill bundle, bundled companion prompts/native agents, bundled companion skills, a launcher, Codex native hook registrations in `.codex/hooks.json`, and MCP server registrations in `.codex/config.toml`.
4. Native hooks handle startup context, prompt routing, and active-mode stop protection.
5. `verify` checks the installed/runtime surface end-to-end.

The result is a package that is more than a prompt: it is a small local execution environment around a workflow.

## Agent lanes

The workflow-level execution lanes currently formalized by `oh-my-ralpha` are:

- `architect`
- `code-reviewer`
- `code-simplifier`

These are the native-subagent lanes `oh-my-ralpha` must spawn for every completed slice when the host runtime provides native subagents. Implementation itself stays with the main thread in this standalone package; the OMX `team-executor` role is not bundled because this repo does not ship the OMX team runtime.

They are bundled in this repository under `companions/prompts/` and installed by `setup` under the target Codex home's `prompts/` and `agents/` directories. The only bundled companion skill is the one the closeout loop directly requires:

- `ai-slop-cleaner`

The oh-my-ralpha MCP/CLI still stays narrow: it manages state, trace, workflow scaffolding, admin, hooks, and setup. It does not expose separate CLI/MCP commands that execute `architect`, `code-reviewer`, or `code-simplifier`; those are installed for Codex's prompt/native-agent surfaces. Invoking `$ralpha` is an explicit request for the workflow's per-slice native-subagent acceptance contract. `ai-slop-cleaner` is installed as the final closeout cleanup skill.

## Codex integration surface

The current Codex integration has two layers:

- **Native hooks**
  - `SessionStart`
  - `UserPromptSubmit`
  - `Stop`
- **MCP**
  - `ralpha`
  - tools: `ralpha_state`, `ralpha_trace`, `ralpha_workflow`, `ralpha_admin`

This means the package can influence prompt routing and expose runtime actions through MCP tools without recording prompt, tool, or turn payload logs.

## Detailed docs

Detailed documentation lives in:

- [Implementation Guide](./docs/implementation.md)

That document covers:

- implementation requirements
- internal architecture
- state / hooks / MCP design
- the Codex integration plan
- current limitations and extension points

## Structure

- `skills/oh-my-ralpha/`
  - packaged skill documents
- `.codex/oh-my-ralpha/examples/`
  - curated example context and state artifacts
- `.codex/oh-my-ralpha/working-model/`
  - live writable truth-source root used by the runtime
- `src/`
  - standalone runtime, setup, native hook, and MCP helpers
- `docs/`
  - detailed implementation and integration documentation
- `test/`
  - Node contract tests

## Usage

Build and enter an Ubuntu shell with Codex CLI already installed:

```bash
npm run docker:shell
```

The helper rebuilds `oh-my-ralpha-codex:ubuntu24.04` on each run with a fresh
skill-stage build id, so the container includes the latest local skill code.
The Dockerfile uses two stages:

1. `base`: Ubuntu 24.04, `ubuntu-standard`, Node 22, npm, and Codex CLI.
2. `skill`: copies this repository into `/workspace` so the image contains the
   current skill package.

The container gives `/root/.codex` a fresh tmpfs on every run and bind-mounts
only your local `${CODEX_HOME:-$HOME/.codex}/auth.json` to
`/root/.codex/auth.json`, so Codex can start already authenticated without
persisting container-side config or skill edits.

Each run starts a brand-new disposable container and automatically runs:

```bash
node bin/oh-my-ralpha.js setup --scope user --force
node bin/oh-my-ralpha.js verify --scope user
```

That installs the latest `/workspace` copy into the fresh container-local
`CODEX_HOME`. Inside the shell, start Codex with:

```bash
codex
```

Container proxy is enabled by default with
`CODEX_DOCKER_PROXY_URL=http://host.docker.internal:7890`. Toggle it with:

```bash
CODEX_DOCKER_PROXY=0 npm run docker:shell
CODEX_DOCKER_PROXY=1 CODEX_DOCKER_PROXY_URL=http://host.docker.internal:7890 npm run docker:shell
```

If you need to skip the automatic skill setup/verify step:

```bash
CODEX_DOCKER_AUTO_SETUP=0 npm run docker:shell
```

If your Codex auth file lives somewhere else:

```bash
CODEX_AUTH_JSON=/path/to/auth.json npm run docker:shell
```

## Plan-First Gate

`oh-my-ralpha` uses its own plan-first gate instead of trying to switch Codex
host modes. Native hooks can add context and block stops, but they cannot make
Codex change collaboration mode.

When a `$ralpha` prompt is underspecified, the hook activates a
ralpha planning phase, creates missing planning artifacts, and instructs
the model to refine PRD/test-spec/workboard/rounds instead of editing product
code. Execution activates only after the artifacts are decision-complete and the
next prompt is execution-specific.

Run the standalone checks with:

```bash
npm test
```

Use the built-in runtime with:

```bash
ralpha doctor --scope project
ralpha setup --scope project --force
ralpha verify --scope project
ralpha workflow init --task "bootstrap a new task"
ralpha workflow route --text '$ralpha update src/router.mjs with activation tests' --activate
ralpha state read --mode ralpha
ralpha trace show
```

After `setup`, Codex also gets native hooks plus one progressive `ralpha` MCP server:

- `ralpha`
- `ralpha_state`
- `ralpha_trace`
- `ralpha_workflow`
- `ralpha_admin`

Install the skill into `CODEX_HOME` with:

```bash
node bin/oh-my-ralpha.js install
```

If `CODEX_HOME/bin` is not on `PATH`, either add it or run the repo-local fallback:

```bash
node bin/oh-my-ralpha.js doctor
```

The tests cover:

- the canonical public trigger `$ralpha`
- the packaged skill contract
- the sample `.codex/oh-my-ralpha` truth-source artifacts
- the standalone JS runtime for install/doctor/workflow/state/trace/route
- setup / uninstall / native hook bootstrap
- unified MCP command-group exposure
- release-style `verify` preflight

## Scope

This repo intentionally focuses on the `oh-my-ralpha` package itself.
It does not attempt to duplicate the full `oh-my-codex` runtime.
