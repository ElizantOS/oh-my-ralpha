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
  - one built-in MCP server with state, acceptance, trace, workflow, and admin command groups
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
- `workflow-auditor`

These are native-subagent acceptance lanes. Every ordinary slice runs the mandatory three-lane bundle after fresh proof: `architect`, `code-reviewer`, and `code-simplifier`. Final closeout adds a fourth independent read-only `FINAL-CLOSEOUT` lane: `workflow-auditor`. Implementation itself stays with the main thread in this standalone package; the OMX `team-executor` role is not bundled because this repo does not ship the OMX team runtime.

They are bundled in this repository under `companions/prompts/` and installed by `setup` under the target Codex home's `prompts/` and `agents/` directories. The bundled companion skills are:

- `ai-slop-cleaner`
- `tmux-cli-agent-harness`

The oh-my-ralpha MCP/CLI still stays narrow: it manages state, append-only acceptance evidence, trace, workflow scaffolding, admin, hooks, and setup. It does not expose separate CLI/MCP commands that execute `architect`, `code-reviewer`, `code-simplifier`, or `workflow-auditor`; those are installed for Codex's prompt/native-agent surfaces. Invoking `$ralpha` is an explicit request for the workflow's per-slice native-subagent acceptance contract. `ai-slop-cleaner` is installed as the final closeout cleanup skill, and `tmux-cli-agent-harness` is installed for inspectable reviewer/test/diagnostic sessions when native subagents are late, unavailable, or need pane history.

## Codex integration surface

The current Codex integration has two layers:

- **Native hooks**
  - `SessionStart`
  - `UserPromptSubmit`
  - `Stop`
- **MCP**
  - `ralpha`
  - tools: `ralpha_state`, `ralpha_acceptance`, `ralpha_trace`, `ralpha_workflow`, `ralpha_admin`

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

1. `base`: Ubuntu 24.04, `ubuntu-standard`, tmux, Node 22, npm, and Codex CLI.
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

## Canonical tmux + Docker test protocol

Use this runbook when validating the installed skill, the Codex integration,
native reviewer lanes, or `ralpha acceptance wait`. This is the canonical
end-to-end path: start from a host tmux session, enter the repository-provided
Docker shell, then test inside that container. Do not replace this with a manual
`docker run` unless you are explicitly debugging the Docker helper itself. Do
not use `codex exec` as a substitute for the interactive Codex TUI smoke.

### 0. Clean only the previous ralpha smoke state

Do not kill unrelated user sessions. Only remove sessions and containers whose
names belong to this smoke run.

```bash
tmux kill-session -t ralpha-docker-shell-smoke 2>/dev/null || true
tmux kill-session -t ralpha-docker-shell-inspector 2>/dev/null || true
docker rm -f oh-my-ralpha-codex-shell 2>/dev/null || true
```

### 1. Start the canonical container from tmux

Always enter the container through the repo helper:

```bash
tmux new-session -d -s ralpha-docker-shell-smoke \
  -c /path/to/oh-my-ralpha
tmux set-option -t ralpha-docker-shell-smoke history-limit 200000
tmux pipe-pane -o -t ralpha-docker-shell-smoke:0 \
  'cat >> /tmp/ralpha-docker-shell-smoke.log'
tmux send-keys -t ralpha-docker-shell-smoke:0 \
  'CODEX_DOCKER_AUTO_SETUP=1 npm run docker:shell' Enter
tmux attach -t ralpha-docker-shell-smoke
```

Wait until the pane shows all of:

```text
Ubuntu + Codex skill sandbox is ready.
Installing latest baked skill into CODEX_HOME...
Skill install verified: ok true
root@...:/workspace#
```

This proves the helper rebuilt the baked image, started a disposable container
with fresh `/root/.codex`, ran `setup --scope user --force`, and ran
`verify --scope user` against the installed copy.

### 2. Container smoke: installed runtime and acceptance wait

Run these commands inside the container shell. They use the installed launcher,
not the source checkout fallback.

```bash
/root/.codex/bin/ralpha verify --scope user
export SMOKE_CWD=$(mktemp -d /tmp/ralpha-wait-smoke-XXXXXX)
```

Accepted path:

```bash
/root/.codex/bin/ralpha verdict A-01 architect PASS \
  "architect clean" --cwd "$SMOKE_CWD"
/root/.codex/bin/ralpha verdict A-01 code-reviewer PASS \
  "reviewer clean" --cwd "$SMOKE_CWD"
/root/.codex/bin/ralpha verdict A-01 code-simplifier PASS \
  "simplifier clean" --cwd "$SMOKE_CWD"
/root/.codex/bin/ralpha acceptance wait \
  --cwd "$SMOKE_CWD" \
  --slice A-01 \
  --roles architect,code-reviewer,code-simplifier \
  --idle-ms 20 \
  --max-ms 200 \
  --poll-ms 5
```

Expected: `status` is `accepted`, `roles` contains all three required ordinary
slice roles, and `gate.has_blocking_reviewer_verdict` is `false`.

Blocked path:

```bash
/root/.codex/bin/ralpha verdict B-01 code-reviewer CHANGES \
  "needs fix" --cwd "$SMOKE_CWD"
/root/.codex/bin/ralpha verdict B-01 leader PASS \
  "manual should not override" --cwd "$SMOKE_CWD"
/root/.codex/bin/ralpha acceptance wait \
  --cwd "$SMOKE_CWD" \
  --slice B-01 \
  --role code-reviewer \
  --idle-ms 20 \
  --max-ms 200 \
  --poll-ms 5
```

Expected: `status` is `blocked`; leader/manual `PASS` did not override reviewer
`CHANGES`.

Idle timeout path:

```bash
/root/.codex/bin/ralpha acceptance wait \
  --cwd "$SMOKE_CWD" \
  --slice C-01 \
  --role code-reviewer \
  --idle-ms 20 \
  --max-ms 200 \
  --poll-ms 5
```

Expected: `status` is `idle_timeout`.

Activity reset path:

```bash
LOG="$SMOKE_CWD/reviewer.log"
printf 'start\n' > "$LOG"

(
  /root/.codex/bin/ralpha acceptance wait \
    --cwd "$SMOKE_CWD" \
    --slice D-01 \
    --role code-reviewer \
    --log "$LOG" \
    --idle-ms 250 \
    --max-ms 3000 \
    --poll-ms 50 \
    > "$SMOKE_CWD/wait-D.json"
) &
WAIT_PID=$!

sleep 0.12
printf 'still working\n' >> "$LOG"
sleep 0.12
/root/.codex/bin/ralpha verdict D-01 code-reviewer PASS \
  "reviewer accepted after activity" --cwd "$SMOKE_CWD"
wait "$WAIT_PID"
cat "$SMOKE_CWD/wait-D.json"
```

Expected: `status` is `accepted`; `activity.activity_resets` contains one entry
for `log` and one entry for `acceptance`. This is the important timeout
semantic: new observable output resets idle timing, so elapsed wall-clock wait
alone is not failure evidence.

### 3. Container smoke: MCP parity

Run this inside the same container to verify MCP/runtime behavior for role
scoping. It imports the installed package, so it validates the installed
container copy.

```bash
node --input-type=module <<'NODE'
import { summarizeAcceptance } from '/root/.codex/skills/ralpha/src/acceptance.mjs';
const cwd = process.env.SMOKE_CWD;
const summary = await summarizeAcceptance({
  cwd,
  sliceId: 'B-01',
  roles: ['architect'],
});
console.log(JSON.stringify({
  roles: summary.gate.roles,
  blocking: summary.gate.has_blocking_reviewer_verdict,
  records: summary.records.length,
}, null, 2));
NODE
```

Expected: the gate is scoped to `architect`. A `code-reviewer` verdict from the
blocked path must not leak into this role-scoped gate.

### 4. Plain Codex native-subagent team smoke

Use this only when validating that native reviewer lanes actually run. Start
plain Codex in the same tmux/container. Do not use `codex exec`.

```bash
codex --no-alt-screen --dangerously-bypass-approvals-and-sandbox -C /workspace
```

Submit a prompt that asks Codex to create a temporary workspace under
`/tmp/ralpha-subagent-team-smoke`, but do not let it invent free-form planning
files. The smoke is valid only when the temporary artifacts satisfy the same
completeness checks used by `src/planning.mjs`. If route readiness returns
`planningArtifactsComplete:false`, the smoke result is `DEGRADED` even if native
subagent verdicts were appended.

Use this prompt shape so Codex writes complete artifacts before spawning
reviewers:

```text
Create /tmp/ralpha-subagent-team-smoke and use only that temporary workspace.
Do not edit product repo files. Do not use codex exec.

Create complete ralpha planning artifacts. They must satisfy these exact schema
requirements:

Context file:
- Include non-empty lines beginning exactly:
  - Task statement:
  - Desired outcome:
  - Known facts/evidence:
  - Constraints:
  - Unknowns/open questions:
  - Likely codebase touchpoints:

TODO file:
- Include slice `TEAM-01`
- Include these backtick fields with non-empty values:
  - `status`: in_progress
  - `implementation overview`:
  - `acceptance`:
  - `evidence`:

Rounds JSON:
- Include current_focus, completed_todos, next_todo:"TEAM-01",
  blocked_todos, verification_evidence, remaining_todos:["TEAM-01"],
  done_when, and final_verdict:null.

PRD file:
- Include all headings exactly:
  Goal
  Current State / Evidence
  Scope
  Constraints
  Success Criteria
  Assumptions
  Open Questions
  Approach
  Interfaces / APIs / Schemas / I/O
  Data Flow
  Edge Cases / Failure Modes
  Compatibility / Migration Notes
  Execution Slices

Test spec file:
- Include all headings exactly:
  Narrow Proof
  Broad Regression
  Integration / Manual Scenarios
  Acceptance Evidence

After writing those files, prove route readiness with:
force: $ralpha update /tmp/ralpha-subagent-team-smoke/.codex/oh-my-ralpha/working-model/state/ralpha-subagent-team-smoke-todo.md and append TEAM-01 reviewer verdict records

Continue only if route returns finalSkill:"ralpha" and phase:"execution".
Then run /root/.codex/bin/ralpha verify --scope user, check the installed
architect/code-reviewer/code-simplifier agent and prompt files, and spawn the
mandatory native acceptance subagents.
```

Each subagent must only write append-only evidence:

```bash
/root/.codex/bin/ralpha verdict TEAM-01 architect PASS \
  "architect native lane ran and appended smoke acceptance" \
  --cwd /tmp/ralpha-subagent-team-smoke
/root/.codex/bin/ralpha verdict TEAM-01 code-reviewer PASS \
  "code-reviewer native lane ran and appended smoke acceptance" \
  --cwd /tmp/ralpha-subagent-team-smoke
/root/.codex/bin/ralpha verdict TEAM-01 code-simplifier PASS \
  "code-simplifier native lane ran and appended smoke acceptance" \
  --cwd /tmp/ralpha-subagent-team-smoke
```

The final Codex TUI answer must state:

- native subagent spawn was attempted
- which roles actually ran
- append-only records exist for `architect`, `code-reviewer`, and `code-simplifier`
- route readiness returned `finalSkill:"ralpha"` and `phase:"execution"`
- final result is `PASS` or `DEGRADED`

Passing evidence includes visible TUI lines like `Spawned ... [architect]`,
`Spawned ... [code-reviewer]`, `Spawned ... [code-simplifier]`, all required
ordinary-slice agents completing, and durable records in
`/tmp/ralpha-subagent-team-smoke/.codex/oh-my-ralpha/working-model/state/acceptance-records.ndjson`.
Do not accept a `PASS` self-assessment if the route readiness check reports
`planningArtifactsComplete:false`; fix the temporary artifact schema and rerun
the route check first.

### 4A. Inspectable tmux-backed Codex reviewer smoke

Use this when the human must be able to attach to each reviewer. This is a
different test from native subagents: the leader must create real container
tmux sessions and launch plain Codex inside each session. If the result shows
`Spawned ... [architect]`, `Spawned ... [code-reviewer]`, or
`Spawned ... [code-simplifier]`, that was native subagent mode, not this
inspectable tmux-backed mode.

The main Codex prompt must require:

```text
Use tmux-cli-agent-harness. Do not spawn native subagents. Do not use codex exec.

Create /tmp/ralpha-tmux-backed-team-smoke.
Create three tmux sessions:
- ralpha-CODEX-architect
- ralpha-CODEX-code-reviewer
- ralpha-CODEX-code-simplifier
In each session, launch:
codex --no-alt-screen --dangerously-bypass-approvals-and-sandbox -C /workspace
Paste a role-specific prompt into each reviewer Codex TUI.
Each reviewer may only run its append-only ralpha verdict command.
Leave all three reviewer sessions open for human inspection.
Verify TEAM-TMUX with summarizeAcceptance before reporting PASS.
```

Reviewer attach commands:

```bash
docker exec -it oh-my-ralpha-codex-shell tmux attach -t ralpha-CODEX-architect
docker exec -it oh-my-ralpha-codex-shell tmux attach -t ralpha-CODEX-code-reviewer
docker exec -it oh-my-ralpha-codex-shell tmux attach -t ralpha-CODEX-code-simplifier
```

When the leader drives the reviewer Codex TUI, paste prompts sequentially with
named buffers. Do not paste both panes in parallel; a shared tmux buffer race can
put the wrong prompt in the wrong pane.

```bash
printf '%s' "$ARCHITECT_PROMPT" | tmux load-buffer -b architect_prompt -
tmux paste-buffer -b architect_prompt -t ralpha-CODEX-architect

printf '%s' "$CODE_REVIEWER_PROMPT" | tmux load-buffer -b code_reviewer_prompt -
tmux paste-buffer -b code_reviewer_prompt -t ralpha-CODEX-code-reviewer

printf '%s' "$CODE_SIMPLIFIER_PROMPT" | tmux load-buffer -b code_simplifier_prompt -
tmux paste-buffer -b code_simplifier_prompt -t ralpha-CODEX-code-simplifier
```

After a long prompt is pasted, `Enter`, `C-j`, and `M-Enter` may remain inside
the multiline composer and not submit. The reliable submit sequence observed in
the Codex TUI is to paste a raw carriage return through a tmux buffer:

```bash
printf '\r' | tmux load-buffer -b submit_architect -
tmux paste-buffer -b submit_architect -t ralpha-CODEX-architect

printf '\r' | tmux load-buffer -b submit_code_reviewer -
tmux paste-buffer -b submit_code_reviewer -t ralpha-CODEX-code-reviewer

printf '\r' | tmux load-buffer -b submit_code_simplifier -
tmux paste-buffer -b submit_code_simplifier -t ralpha-CODEX-code-simplifier
```

Passing evidence for this tmux-backed mode:

- the reviewer sessions remain attachable
- `tmux list-panes` shows each reviewer session running `node` / `codex`
- each reviewer transcript shows it ran only its verdict command
- durable `acceptance-records.ndjson` has one `PASS` for `architect` and one
  `PASS` for `code-reviewer` and one `PASS` for `code-simplifier`
- `summarizeAcceptance` for the three required ordinary-slice roles reports
  `hasBlocking:false`

If the sessions were left open for inspection, the final report must say so and
must include cleanup commands. After the human confirms inspection is complete,
clean up the reviewer sessions explicitly:

```bash
docker exec -it oh-my-ralpha-codex-shell tmux kill-session -t ralpha-CODEX-architect
docker exec -it oh-my-ralpha-codex-shell tmux kill-session -t ralpha-CODEX-code-reviewer
docker exec -it oh-my-ralpha-codex-shell tmux kill-session -t ralpha-CODEX-code-simplifier
docker exec -it oh-my-ralpha-codex-shell tmux list-sessions
```

Do not silently leave reviewer tmux sessions running after inspection is done.

### 5. Independent inspector tmux

After a plain Codex/team smoke, open a second tmux session to inspect the first
session from outside. This verifies pane history, process state, installed
assets, and durable verdict records.

```bash
tmux new-session -d -s ralpha-docker-shell-inspector
tmux send-keys -t ralpha-docker-shell-inspector \
  'tmux capture-pane -pt ralpha-docker-shell-smoke:0 -S -260 | grep -E "Spawned|architect|code-reviewer|code-simplifier|PASS|acceptance-records" -C 3' Enter
tmux send-keys -t ralpha-docker-shell-inspector \
  'docker ps --filter name=oh-my-ralpha --format "{{.Names}} {{.Status}} {{.Command}}"' Enter
tmux send-keys -t ralpha-docker-shell-inspector \
  'docker exec oh-my-ralpha-codex-shell ps -efww | grep -E "codex|ralpha|node" | grep -v grep' Enter
tmux attach -t ralpha-docker-shell-inspector
```

Also verify durable records directly:

```bash
docker exec oh-my-ralpha-codex-shell bash -lc '
cat /tmp/ralpha-subagent-team-smoke/.codex/oh-my-ralpha/working-model/state/acceptance-records.ndjson
node --input-type=module <<NODE
import { summarizeAcceptance } from "/root/.codex/skills/ralpha/src/acceptance.mjs";
const summary = await summarizeAcceptance({
  cwd: "/tmp/ralpha-subagent-team-smoke",
  sliceId: "TEAM-01",
  roles: ["architect", "code-reviewer", "code-simplifier"],
});
console.log(JSON.stringify({
  latestRoles: Object.keys(summary.gate.latest_by_role).sort(),
  hasBlocking: summary.gate.has_blocking_reviewer_verdict,
  records: summary.records.length,
}, null, 2));
NODE'
```

Expected: latest roles are `architect`, `code-reviewer`, and `code-simplifier`,
`hasBlocking` is `false`, and there are three reviewer records. It is normal for native subagent
processes to be gone after the leader closes them; durable verdict records and
the tmux transcript are the evidence.

### 6. Cleanup

When the user no longer needs to inspect the session:

```bash
tmux kill-session -t ralpha-docker-shell-smoke 2>/dev/null || true
tmux kill-session -t ralpha-docker-shell-inspector 2>/dev/null || true
docker rm -f oh-my-ralpha-codex-shell 2>/dev/null || true
```

Do not remove unrelated user tmux sessions or containers.

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

## Quick install and uninstall

Install the full local Codex integration into the user Codex home:

```bash
node bin/oh-my-ralpha.js setup --scope user --force && node bin/oh-my-ralpha.js verify --scope user
```

Uninstall the user-scope integration:

```bash
node bin/oh-my-ralpha.js uninstall --scope user
```

`setup --scope user` installs the `ralpha` skill/runtime, launcher, Codex config/hooks, bundled role prompts/native agents, and bundled companion skill into the user Codex home. `uninstall --scope user` removes the managed user-scope integration and bundled companion files that still match this package's managed copies.

Use the built-in runtime with:

```bash
ralpha doctor --scope project
ralpha setup --scope project --force
ralpha verify --scope project
ralpha workflow init --task "bootstrap a new task"
ralpha workflow route --text '$ralpha update src/router.mjs with activation tests' --activate
ralpha state read --mode ralpha
ralpha verdict P0-02 architect PASS "accepted"
ralpha verdict P0-02 code-reviewer CHANGES "edge case failed" --review-round 2 --review-lens edge/state/regression --review-cycle-id P0-02-loop
ralpha verdict P0-02 code-simplifier PASS "simplification review accepted"
ralpha verdict FINAL-CLOSEOUT architect PASS "architecture closeout accepted"
ralpha verdict FINAL-CLOSEOUT code-reviewer PASS "code review closeout accepted"
ralpha verdict FINAL-CLOSEOUT code-simplifier PASS "simplification closeout accepted"
ralpha verdict FINAL-CLOSEOUT workflow-auditor PASS "artifacts agree"
ralpha acceptance wait --slice FINAL-CLOSEOUT --roles architect,code-reviewer,code-simplifier,workflow-auditor
ralpha acceptance wait --slice P0-02 --roles architect,code-reviewer,code-simplifier --tmux ralpha-P0-02-reviewer-a1b2 --log /tmp/ralpha-P0-02-reviewer-a1b2.log
ralpha trace show
```

After `setup`, Codex also gets native hooks plus one progressive `ralpha` MCP server:

- `ralpha`
- `ralpha_state` (write/clear requires `actorRole: "leader"` and `mutationReason`; acceptance subagents are read-only)
- `ralpha_acceptance` (append-only acceptance verdicts/findings/suggested ledger text; never mutates state)
- `ralpha_trace`
- `ralpha_workflow`
- `ralpha_admin`

Acceptance subagents are append-only for workflow information: they may add verdicts/findings with `ralpha verdict <slice> <role> <PASS|CHANGES|REJECT|COMMENT> "summary"`, but only the leader/main thread may convert that information into state, workboard, or rounds transitions.

Tmux-backed reviewer/test/diagnostic runs use `tmux-cli-agent-harness` as the live evidence layer and existing ralpha MCP tools as the durable control plane. v1 intentionally does not add mailbox files; use `capture-pane`/optional `pipe-pane` transcripts plus `ralpha_trace` and `ralpha_acceptance`.

`ralpha acceptance wait` and `ralpha_acceptance command=wait` make reviewer waits activity-aware. They check durable append-only verdicts first, then optional tmux pane output, transcript log growth, and acceptance file activity. New output records an `activity_reset` and resets the idle timer. Results are `accepted`, `blocked`, `idle_timeout`, or `max_timeout`; degraded timeout handling should happen only after `idle_timeout` or `max_timeout` with no durable reviewer verdict.

Install only the skill/runtime bundle and launcher into `CODEX_HOME` with:

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
- the standalone JS runtime for install/doctor/workflow/state/acceptance/trace/route
- setup / uninstall / native hook bootstrap
- unified MCP command-group exposure
- release-style `verify` preflight

## Scope

This repo intentionally focuses on the `oh-my-ralpha` package itself.
It does not attempt to duplicate the full `oh-my-codex` runtime.
