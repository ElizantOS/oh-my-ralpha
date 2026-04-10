# oh-my-ralpha Runtime TODO

## `P0-01`
- `title`: Install a relocatable runtime payload into CODEX_HOME
- `priority`: P0
- `status`: completed
- `implementation overview`: Change installation so the launcher targets installed runtime files under `CODEX_HOME`, not the original repository checkout path.
- `acceptance`: The installed command still works even if the source repository path changes.
- `evidence`: `src/install.mjs` now installs the runtime payload into `CODEX_HOME/skills/oh-my-ralpha` and writes the launcher to `CODEX_HOME/bin/oh-my-ralpha` pointing at the installed runtime path. Verified by `npm test`, `node ./bin/oh-my-ralpha.js install --force`, and the installed launcher smoke.

## `P0-02`
- `title`: Tighten plan-first route gating semantics
- `priority`: P0
- `status`: completed
- `implementation overview`: Keep vague execution prompts gated unless an explicit approved continuation rule applies; do not bypass gating just because generic planning artifacts exist.
- `acceptance`: Vague prompts like `$ralpha fix this` stay gated.
- `evidence`: `src/router.mjs` now gates on underspecified prompts regardless of stale planning artifacts. Verified by `npm test` and the installed launcher route smoke, which returns `gateApplied: true` and `finalSkill: "ralplan"` even when planning artifacts already exist.

## `P0-03`
- `title`: Fix initWorkspace artifact return contract
- `priority`: P0
- `status`: completed
- `implementation overview`: Ensure `initWorkspace()` returns real existing artifact paths when no new files are created.
- `acceptance`: No phantom `contextPath` values are returned.
- `evidence`: `src/init.mjs` now looks up the latest existing context snapshot for the slug and returns that path when `created: false`. Verified by `npm test`, including the repeated-init regression in `test/runtime.test.mjs`.

## `P1-01`
- `title`: Add setup/uninstall style Codex integration
- `priority`: P1
- `status`: completed
- `implementation overview`: Add the standalone repo’s own Codex config/hook bootstrap layer after the P0 runtime issues are fixed.
- `acceptance`: The repo can bootstrap its own Codex integration surface.
- `evidence`: Added `src/setup.mjs` and `src/native-hook.mjs`, plus CLI support for `setup`, `uninstall`, and `hook native`. Verified by `npm test` (`27/27`), `node ./bin/oh-my-ralpha.js setup --scope project --force`, resulting `.codex/config.toml` and `.codex/hooks.json`, a native `UserPromptSubmit` hook smoke, and architect `APPROVED` for the P1-01 milestone.

## `P1-02`
- `title`: Add richer built-in runtime exposure
- `priority`: P1
- `status`: completed
- `implementation overview`: Expand the built-in runtime beyond CLI wrappers where needed to mirror the most important OMX surfaces for standalone use.
- `acceptance`: New Codex usage no longer depends on undocumented external surfaces.
- `evidence`: Added built-in MCP servers under `src/mcp/*`, wired project/user setup to register `oh_my_ralpha_state`, `oh_my_ralpha_trace`, and `oh_my_ralpha_runtime`, updated doctor visibility for project scope, and locked config ownership behavior plus stdio MCP handshake with `npm test` (`34/34`) and project-scope setup/doctor smoke. Architect approved the P1-02 milestone.

## `P2-01`
- `title`: Add release-style verify command for installed/runtime surfaces
- `priority`: P2
- `status`: completed
- `implementation overview`: Add a `verify` command that checks installed launcher, packaged runtime, config/hooks integration, native hook response, and MCP server handshake as one release-readiness preflight.
- `acceptance`: A user can run one command to validate the installed/runtime surfaces without manually replaying all smoke steps.
- `evidence`: Added `src/verify.mjs`, CLI `verify`, and `test/verify.test.mjs`. Verified by `npm test` (`35/35`) and `node ./bin/oh-my-ralpha.js verify --scope project`, which returns `ok: true` after project-scope setup.

## `P2-02`
- `title`: Improve PATH and packaging UX
- `priority`: P2
- `status`: completed
- `implementation overview`: Give clearer doctor/setup output and README guidance for `CODEX_HOME/bin` not on PATH, and package-level polish for first-run ergonomics.
- `acceptance`: First-run install friction is reduced and the remediation path is explicit.
- `evidence`: `src/doctor.mjs` now reports actionable suggestions, including PATH remediation and setup rerun guidance; `README.md` and `skills/oh-my-ralpha/SKILL.md` now document `verify` and project-scope doctor/setup flow.

## `P2-03`
- `title`: Final standalone release audit
- `priority`: P2
- `status`: completed
- `implementation overview`: Perform final review of the standalone repo as a releasable package, with workboard/rounds/verdict synced to terminal state.
- `acceptance`: Final audit says ready for release/package handoff.
- `evidence`: Final `code-reviewer` release audit returned `READY FOR RELEASE` with no real release blockers. Final verification remained green: `npm test` (`35/35`), fresh `setup --scope project`, `doctor --scope project`, and `verify --scope project`.
