import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { doctorReport } from '../src/doctor.mjs';
import { runtimeRootFromModule } from '../src/paths.mjs';
import { setupCodexIntegration, uninstallCodexIntegration } from '../src/setup.mjs';
import { dispatchNativeHook } from '../src/native-hook.mjs';
import { writeModeState } from '../src/state.mjs';

function makeTempWorkspace(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

describe('oh-my-ralpha setup integration', () => {
  it('writes config.toml and hooks.json while installing the runtime', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-setup-');
    const codexHome = await makeTempWorkspace('oh-my-ralpha-codex-home-');
    const runtimeRoot = runtimeRootFromModule(import.meta.url);
    const result = await setupCodexIntegration({
      cwd,
      runtimeRoot,
      codexHome,
      scope: 'user',
      force: true,
    });

    const config = await readFile(join(codexHome, 'config.toml'), 'utf-8');
    const hooks = JSON.parse(await readFile(join(codexHome, 'hooks.json'), 'utf-8'));

    assert.equal(existsSync(result.targetSkillDir), true);
    assert.match(config, /codex_hooks = true/);
    assert.doesNotMatch(config, /^notify = \["node", ".*oh-my-ralpha\.js", "notify"\]$/m);
    assert.match(config, /\[mcp_servers\.ralpha\]/);
    assert.ok(hooks.hooks.SessionStart);
    assert.equal(hooks.hooks.PreToolUse, undefined);
    assert.equal(hooks.hooks.PostToolUse, undefined);
    assert.ok(hooks.hooks.UserPromptSubmit);
    assert.ok(hooks.hooks.Stop);
  });

  it('preserves user hooks on uninstall while removing managed wrappers', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-uninstall-');
    const codexHome = await makeTempWorkspace('oh-my-ralpha-codex-home-');
    const runtimeRoot = runtimeRootFromModule(import.meta.url);
    await setupCodexIntegration({
      cwd,
      runtimeRoot,
      codexHome,
      scope: 'user',
      force: true,
    });

    const hooksPath = join(codexHome, 'hooks.json');
    const hooks = JSON.parse(await readFile(hooksPath, 'utf-8'));
    hooks.hooks.SessionStart.unshift({
      hooks: [{ type: 'command', command: 'echo user-hook' }],
    });
    await import('node:fs/promises').then(({ writeFile }) => writeFile(hooksPath, JSON.stringify(hooks, null, 2) + '\n', 'utf-8'));

    const uninstallResult = await uninstallCodexIntegration({ cwd, runtimeRoot, codexHome, scope: 'user' });

    const nextHooks = JSON.parse(await readFile(hooksPath, 'utf-8'));
    const nextConfig = await readFile(join(codexHome, 'config.toml'), 'utf-8');
    const sessionHooks = nextHooks.hooks.SessionStart.flatMap((entry) => entry.hooks ?? []);
    assert.ok(sessionHooks.some((hook) => hook.command === 'echo user-hook'));
    assert.ok(!sessionHooks.some((hook) => typeof hook.command === 'string' && hook.command.includes('oh-my-ralpha.js" hook native')));
    assert.match(nextConfig, /codex_hooks = true/);
    assert.doesNotMatch(nextConfig, /^notify = \["node", ".*oh-my-ralpha\.js", "notify"\]$/m);
    assert.doesNotMatch(nextConfig, /\[mcp_servers\.ralpha\]/);
    assert.equal(existsSync(join(codexHome, 'skills', 'ralpha')), false);
    assert.equal(existsSync(join(codexHome, 'bin', 'ralpha')), false);
    assert.equal(existsSync(join(codexHome, 'prompts', 'architect.md')), false);
    assert.equal(existsSync(join(codexHome, 'agents', 'architect.toml')), false);
    assert.equal(existsSync(join(codexHome, 'prompts', 'code-reviewer.md')), false);
    assert.equal(existsSync(join(codexHome, 'agents', 'code-reviewer.toml')), false);
    assert.equal(existsSync(join(codexHome, 'prompts', 'code-simplifier.md')), false);
    assert.equal(existsSync(join(codexHome, 'agents', 'code-simplifier.toml')), false);
    assert.equal(existsSync(join(codexHome, 'skills', 'ai-slop-cleaner')), false);
    assert.equal(uninstallResult.companions.prompts.every((entry) => entry.removed), true);
    assert.equal(uninstallResult.companions.skills.every((entry) => entry.removed), true);
  });

  it('preserves pre-existing companion files that setup did not own', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-uninstall-user-companions-');
    const codexHome = await makeTempWorkspace('oh-my-ralpha-codex-home-');
    const runtimeRoot = runtimeRootFromModule(import.meta.url);
    const userSkillDir = join(codexHome, 'skills', 'ai-slop-cleaner');
    const userHarnessDir = join(codexHome, 'skills', 'tmux-cli-agent-harness');
    await mkdir(join(codexHome, 'prompts'), { recursive: true });
    await mkdir(join(codexHome, 'agents'), { recursive: true });
    await mkdir(userSkillDir, { recursive: true });
    await mkdir(userHarnessDir, { recursive: true });
    await writeFile(join(codexHome, 'prompts', 'architect.md'), '# user architect prompt\n', 'utf-8');
    await writeFile(join(codexHome, 'agents', 'architect.toml'), 'name = "architect"\n# user agent\n', 'utf-8');
    await writeFile(join(userSkillDir, 'SKILL.md'), '---\nname: ai-slop-cleaner\ndescription: user copy\n---\n', 'utf-8');
    await writeFile(join(userHarnessDir, 'SKILL.md'), '---\nname: tmux-cli-agent-harness\ndescription: user copy\n---\n', 'utf-8');

    await setupCodexIntegration({
      cwd,
      runtimeRoot,
      codexHome,
      scope: 'user',
    });
    const result = await uninstallCodexIntegration({ cwd, runtimeRoot, codexHome, scope: 'user' });

    assert.equal(await readFile(join(codexHome, 'prompts', 'architect.md'), 'utf-8'), '# user architect prompt\n');
    assert.equal(await readFile(join(codexHome, 'agents', 'architect.toml'), 'utf-8'), 'name = "architect"\n# user agent\n');
    assert.equal(await readFile(join(userSkillDir, 'SKILL.md'), 'utf-8'), '---\nname: ai-slop-cleaner\ndescription: user copy\n---\n');
    assert.equal(await readFile(join(userHarnessDir, 'SKILL.md'), 'utf-8'), '---\nname: tmux-cli-agent-harness\ndescription: user copy\n---\n');
    assert.equal(result.companions.prompts.find((entry) => entry.id === 'architect').removed, false);
    assert.equal(result.companions.skills.find((entry) => entry.id === 'ai-slop-cleaner').removed, false);
    assert.equal(result.companions.skills.find((entry) => entry.id === 'tmux-cli-agent-harness').removed, false);
  });

  it('fails loudly when hooks.json is invalid instead of overwriting it', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-invalid-hooks-');
    const codexHome = await makeTempWorkspace('oh-my-ralpha-codex-home-');
    const runtimeRoot = runtimeRootFromModule(import.meta.url);
    await import('node:fs/promises').then(({ mkdir, writeFile }) =>
      mkdir(codexHome, { recursive: true }).then(() =>
        writeFile(join(codexHome, 'hooks.json'), '{not-valid-json', 'utf-8'),
      ),
    );

    await assert.rejects(
      () => setupCodexIntegration({
        cwd,
        runtimeRoot,
        codexHome,
        scope: 'user',
        force: true,
      }),
      /invalid hooks\.json/i,
    );

    assert.equal(existsSync(join(codexHome, 'skills', 'ralpha')), false);
    assert.equal(existsSync(join(codexHome, 'bin', 'ralpha')), false);
    assert.equal(existsSync(join(codexHome, 'config.toml')), false);
  });

  it('preserves a pre-existing non-managed notify entry without wrapping it', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-existing-notify-');
    const codexHome = await makeTempWorkspace('oh-my-ralpha-codex-home-');
    const runtimeRoot = runtimeRootFromModule(import.meta.url);
    await import('node:fs/promises').then(({ mkdir, writeFile }) =>
      mkdir(codexHome, { recursive: true }).then(() =>
        writeFile(join(codexHome, 'config.toml'), 'notify = ["node", "/tmp/custom-notify.js"]\n', 'utf-8'),
      ),
    );

    const result = await setupCodexIntegration({
      cwd,
      runtimeRoot,
      codexHome,
      scope: 'user',
      force: true,
    });

    const config = await readFile(join(codexHome, 'config.toml'), 'utf-8');

    assert.equal(existsSync(result.targetSkillDir), true);
    assert.match(config, /^notify = \["node", "\/tmp\/custom-notify\.js"\]$/m);
    assert.equal(existsSync(join(result.targetSkillDir, 'notify-chain.json')), false);
  });

  it('installs bundled companion prompts, native agents, and skills', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-companion-install-');
    const codexHome = await makeTempWorkspace('oh-my-ralpha-codex-home-');
    const runtimeRoot = runtimeRootFromModule(import.meta.url);
    await mkdir(join(codexHome, 'prompts'), { recursive: true });
    await mkdir(join(codexHome, 'agents'), { recursive: true });
    await writeFile(join(codexHome, 'prompts', 'team-executor.md'), '# stale team executor\n', 'utf-8');
    await writeFile(join(codexHome, 'agents', 'team-executor.toml'), 'name = "team-executor"\n', 'utf-8');

    const result = await setupCodexIntegration({
      cwd,
      runtimeRoot,
      codexHome,
      scope: 'user',
      force: true,
    });

    assert.equal(result.companions.prompts.every((entry) => entry.installed), true);
    assert.equal(result.companions.skills.every((entry) => entry.installed), true);
    assert.equal(existsSync(join(codexHome, 'prompts', 'architect.md')), true);
    assert.equal(existsSync(join(codexHome, 'agents', 'architect.toml')), true);
    assert.equal(existsSync(join(codexHome, 'prompts', 'code-reviewer.md')), true);
    assert.equal(existsSync(join(codexHome, 'agents', 'code-reviewer.toml')), true);
    assert.equal(existsSync(join(codexHome, 'prompts', 'code-simplifier.md')), true);
    assert.equal(existsSync(join(codexHome, 'agents', 'code-simplifier.toml')), true);
    assert.equal(existsSync(join(codexHome, 'skills', 'ai-slop-cleaner', 'SKILL.md')), true);
    assert.equal(existsSync(join(codexHome, 'skills', 'tmux-cli-agent-harness', 'SKILL.md')), true);
    assert.equal(existsSync(join(codexHome, 'skills', 'tmux-cli-agent-harness', 'references', 'tmux-control.md')), true);
    assert.equal(existsSync(join(codexHome, 'skills', 'tmux-cli-agent-harness', 'references', 'test-prompts.json')), true);
    assert.equal(existsSync(join(codexHome, 'prompts', 'analyst.md')), false);
    assert.equal(existsSync(join(codexHome, 'agents', 'analyst.toml')), false);
    assert.equal(existsSync(join(codexHome, 'prompts', 'team-executor.md')), false);
    assert.equal(existsSync(join(codexHome, 'agents', 'team-executor.toml')), false);
    assert.equal(existsSync(join(codexHome, 'skills', 'deep-interview', 'SKILL.md')), false);
    assert.equal(existsSync(join(codexHome, 'skills', 'visual-verdict', 'SKILL.md')), false);
    assert.equal(existsSync(join(codexHome, 'skills', 'web-clone', 'SKILL.md')), false);

    const architectAgent = await readFile(join(codexHome, 'agents', 'architect.toml'), 'utf-8');
    const codeReviewerAgent = await readFile(join(codexHome, 'agents', 'code-reviewer.toml'), 'utf-8');
    const codeSimplifierAgent = await readFile(join(codexHome, 'agents', 'code-simplifier.toml'), 'utf-8');
    assert.match(architectAgent, /name = "architect"/);
    assert.match(architectAgent, /model_reasoning_effort = "high"/);
    assert.match(architectAgent, /You are Architect/);
    assert.doesNotMatch(architectAgent, /developer_instructions = """\n---/);
    assert.match(codeReviewerAgent, /model_reasoning_effort = "medium"/);
    assert.match(codeSimplifierAgent, /model_reasoning_effort = "medium"/);
    assert.match(codeReviewerAgent, /Never call `ralpha_state write`/);
    assert.match(codeSimplifierAgent, /Review-Only Default/);
    assert.match(codeSimplifierAgent, /`WRITE_MODE_ALLOWED`/);

    const report = doctorReport({ runtimeRoot, codexHome });
    const architect = report.companions.find((entry) => entry.id === 'architect');
    const slopCleaner = report.companions.find((entry) => entry.id === 'ai-slop-cleaner');
    const tmuxHarness = report.companions.find((entry) => entry.id === 'tmux-cli-agent-harness');
    assert.equal(architect.installed, true);
    assert.equal(architect.source, 'bundled-agent-prompt');
    assert.equal(slopCleaner.installed, true);
    assert.equal(slopCleaner.source, 'bundled-skill');
    assert.equal(tmuxHarness.installed, true);
    assert.equal(tmuxHarness.source, 'bundled-skill');
  });

  it('does not install a project-scope companion skill when user scope already provides it', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-project-companion-skip-');
    const userCodexHome = await makeTempWorkspace('oh-my-ralpha-user-codex-home-');
    const runtimeRoot = runtimeRootFromModule(import.meta.url);
    const userSkillDir = join(userCodexHome, 'skills', 'ai-slop-cleaner');
    await mkdir(userSkillDir, { recursive: true });
    await writeFile(join(userSkillDir, 'SKILL.md'), '---\nname: ai-slop-cleaner\ndescription: user copy\n---\n', 'utf-8');

    const previousCodexHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = userCodexHome;
    try {
      const result = await setupCodexIntegration({
        cwd,
        runtimeRoot,
        scope: 'project',
        force: true,
      });

      assert.equal(result.codexHome, join(cwd, '.codex'));
      const skillResult = result.companions.skills.find((entry) => entry.id === 'ai-slop-cleaner');
      assert.equal(skillResult.installed, true);
      assert.equal(skillResult.source, 'user-skill');
      assert.equal(skillResult.skippedProjectInstall, true);
      assert.equal(existsSync(join(cwd, '.codex', 'skills', 'ai-slop-cleaner', 'SKILL.md')), false);

      const report = doctorReport({ runtimeRoot, cwd, scope: 'project' });
      const slopCleaner = report.companions.find((entry) => entry.id === 'ai-slop-cleaner');
      assert.equal(slopCleaner.installed, true);
      assert.equal(slopCleaner.source, 'user-skill');
      assert.match(slopCleaner.skillPath, /ai-slop-cleaner\/SKILL\.md$/);
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previousCodexHome;
      }
    }
  });

  it('returns native hook additional context for routed prompts', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-native-hook-');
    const output = await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      prompt: '$ralpha fix this',
    });

    assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(output.hookSpecificOutput.additionalContext, /activated planning phase/i);
    assert.match(output.hookSpecificOutput.additionalContext, /Planning artifact status/i);
    assert.equal(existsSync(join(cwd, '.codex', 'oh-my-ralpha', 'working-model', 'state')), true);
    assert.equal(output.continue, undefined);
  });

  it('activates ralpha for Codex Plan implementation handoff prompts', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-plan-handoff-');
    const output = await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      session_id: 'sess-plan-handoff',
      thread_id: 'thread-plan-handoff',
      turn_id: 'turn-plan-handoff',
      prompt: 'Implement the plan.',
    });

    assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(output.hookSpecificOutput.additionalContext, /Codex Plan implementation handoff detected/i);
    assert.match(output.hookSpecificOutput.additionalContext, /ralpha mode state has been activated/i);
    assert.match(output.hookSpecificOutput.additionalContext, /not a public natural-language keyword/i);

    const state = JSON.parse(await readFile(
      join(cwd, '.codex', 'oh-my-ralpha', 'working-model', 'state', 'sessions', 'sess-plan-handoff', 'ralpha-state.json'),
      'utf-8',
    ));
    assert.equal(state.active, true);
    assert.equal(state.current_phase, 'starting');

    const skillState = JSON.parse(await readFile(
      join(cwd, '.codex', 'oh-my-ralpha', 'working-model', 'state', 'sessions', 'sess-plan-handoff', 'skill-active-state.json'),
      'utf-8',
    ));
    assert.equal(skillState.skill, 'ralpha');
    assert.equal(skillState.keyword, 'codex-plan-implementation');
    assert.equal(skillState.source, 'oh-my-ralpha-plan-implementation-bridge');
  });

  it('activates ralpha for localized Codex Plan implementation handoff prompts', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-plan-handoff-cn-');
    const output = await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      session_id: 'sess-plan-handoff-cn',
      prompt: '实施计划',
    });

    assert.match(output.hookSpecificOutput.additionalContext, /Codex Plan implementation handoff detected/i);
    assert.equal(existsSync(join(
      cwd,
      '.codex',
      'oh-my-ralpha',
      'working-model',
      'state',
      'sessions',
      'sess-plan-handoff-cn',
      'ralpha-state.json',
    )), true);
  });

  it('injects the interruption protocol for active ralpha work without $ralpha', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-active-interrupt-');
    await writeModeState({
      cwd,
      mode: 'ralpha',
      sessionId: 'sess-interrupt',
      patch: {
        active: true,
        current_phase: 'executing',
        state: {
          current_slice: 'P0-04',
          next_todo: 'P0-04',
        },
      },
    });

    const output = await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      session_id: 'sess-interrupt',
      prompt: 'also make the JSON failure path deterministic',
    });

    assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(output.hookSpecificOutput.additionalContext, /already active/i);
    assert.match(output.hookSpecificOutput.additionalContext, /User Interruption Protocol/i);
    assert.match(output.hookSpecificOutput.additionalContext, /current-slice correction/i);
    assert.match(output.hookSpecificOutput.additionalContext, /INT-\*/);
    assert.match(output.hookSpecificOutput.additionalContext, /return_to:P0-04/);
    assert.match(output.hookSpecificOutput.additionalContext, /workboard and rounds ledger/i);
    assert.match(output.hookSpecificOutput.additionalContext, /Do not use current_phase:"paused"/i);
  });

  it('blocks Stop for session-scoped active state without claiming verification', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-stop-hook-');
    await writeModeState({
      cwd,
      mode: 'ralpha',
      sessionId: 'sess-stop',
      patch: {
        active: true,
        current_phase: 'complete',
      },
    });

    const blocked = await dispatchNativeHook({
      hook_event_name: 'Stop',
      cwd,
      session_id: 'sess-stop',
    });

    assert.equal(blocked.decision, 'block');
    assert.match(blocked.reason, /session sess-stop/);
    assert.match(blocked.reason, /not a substitute/i);
    assert.match(blocked.reason, /fresh evidence/i);
    assert.match(blocked.reason, /bounded reviewer-only architect\/code-reviewer\/code-simplifier acceptance/i);
    assert.match(blocked.reason, /final deslop/i);
    assert.match(blocked.reason, /post-deslop regression/i);

    await writeModeState({
      cwd,
      mode: 'ralpha',
      sessionId: 'sess-stop',
      patch: {
        active: false,
        current_phase: 'complete',
      },
    });

    const allowed = await dispatchNativeHook({
      hook_event_name: 'Stop',
      cwd,
      session_id: 'sess-stop',
    });
    assert.equal(allowed, null);
  });

  it('blocks paused state even with resume target', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-stop-paused-');
    await writeModeState({
      cwd,
      mode: 'ralpha',
      sessionId: 'sess-paused',
      patch: {
        active: true,
        current_phase: 'paused',
        pause_reason: 'user_requested_pause',
        state: {
          next_todo: 'P0-04',
          current_slice: 'P0-04',
        },
      },
    });

    const output = await dispatchNativeHook({
      hook_event_name: 'Stop',
      cwd,
      session_id: 'sess-paused',
    });

    assert.equal(output.decision, 'block');
    assert.match(output.reason, /paused is resumable metadata/i);
    assert.match(output.reason, /not permission to stop/i);
    assert.match(output.reason, /Resume target is P0-04/);
  });

  it('allows awaiting_user state with resume target and reason', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-stop-awaiting-user-');
    await writeModeState({
      cwd,
      mode: 'ralpha',
      sessionId: 'sess-awaiting-user',
      patch: {
        active: true,
        current_phase: 'awaiting_user',
        state: {
          next_todo: 'P0-04',
          current_slice: 'P0-04',
          awaiting_user_reason: 'waiting for queued user insertion',
        },
      },
    });

    const output = await dispatchNativeHook({
      hook_event_name: 'Stop',
      cwd,
      session_id: 'sess-awaiting-user',
    });

    assert.equal(output, null);
  });

  it('blocks awaiting_user when it is only waiting on subagents', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-stop-awaiting-subagent-');
    await writeModeState({
      cwd,
      mode: 'ralpha',
      sessionId: 'sess-awaiting-subagent',
      patch: {
        active: true,
        current_phase: 'awaiting_user',
        state: {
          next_todo: 'P0-04',
          current_slice: 'P0-04',
          awaiting_user_reason: 'waiting for code-reviewer and code-simplifier acceptance',
        },
      },
    });

    const blocked = await dispatchNativeHook({
      hook_event_name: 'Stop',
      cwd,
      session_id: 'sess-awaiting-subagent',
    });

    assert.equal(blocked.decision, 'block');
    assert.match(blocked.reason, /awaiting_user is only for real user decisions/i);
    assert.match(blocked.reason, /subagent timeouts or host limits/i);
    assert.match(blocked.reason, /degraded acceptance evidence/i);
  });

  it('blocks awaiting_user state without resume reason', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-stop-awaiting-user-missing-reason-');
    await writeModeState({
      cwd,
      mode: 'ralpha',
      patch: {
        active: true,
        current_phase: 'awaiting_user',
        state: {
          next_todo: 'P0-04',
          current_slice: 'P0-04',
        },
      },
    });

    const blocked = await dispatchNativeHook({
      hook_event_name: 'Stop',
      cwd,
    });

    assert.equal(blocked.decision, 'block');
    assert.match(blocked.reason, /awaiting user input/i);
    assert.match(blocked.reason, /awaiting_user_reason/i);
  });

  it('blocks paused state without resume target', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-stop-paused-missing-resume-');
    await writeModeState({
      cwd,
      mode: 'ralpha',
      patch: {
        active: true,
        current_phase: 'paused',
        pause_reason: 'user_requested_pause',
      },
    });

    const blocked = await dispatchNativeHook({
      hook_event_name: 'Stop',
      cwd,
    });

    assert.equal(blocked.decision, 'block');
    assert.match(blocked.reason, /paused is resumable metadata/i);
    assert.match(blocked.reason, /state\.next_todo/i);
  });

  it('blocks blocker-paused state even with resume target', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-stop-paused-blocker-');
    await writeModeState({
      cwd,
      mode: 'ralpha',
      patch: {
        active: true,
        current_phase: 'paused',
        pause_reason: 'native_architect_acceptance_timeout',
        state: {
          next_todo: 'P0-04',
          current_slice: 'P0-04',
        },
      },
    });

    const blocked = await dispatchNativeHook({
      hook_event_name: 'Stop',
      cwd,
    });

    assert.equal(blocked.decision, 'block');
    assert.match(blocked.reason, /paused is resumable metadata/i);
    assert.match(blocked.reason, /Continue, fix the blocker/i);
  });

  it('blocks inactive non-terminal pseudo-pauses', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-stop-pseudo-pause-');
    await writeModeState({
      cwd,
      mode: 'ralpha',
      patch: {
        active: false,
        current_phase: 'paused_after_P0-03',
        state: {
          next_todo: 'P0-04',
        },
      },
    });

    const blocked = await dispatchNativeHook({
      hook_event_name: 'Stop',
      cwd,
    });

    assert.equal(blocked.decision, 'block');
    assert.match(blocked.reason, /inactive non-terminal state/i);
    assert.match(blocked.reason, /active:true/);
    assert.match(blocked.reason, /complete\/failed\/cancelled/);
  });

  it('doctor reports project-scope MCP visibility against the project .codex root', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-project-doctor-');
    const runtimeRoot = runtimeRootFromModule(import.meta.url);
    await setupCodexIntegration({
      cwd,
      runtimeRoot,
      scope: 'project',
      force: true,
    });

    const { doctorReport } = await import('../src/doctor.mjs');
    const report = doctorReport({
      runtimeRoot,
      cwd,
      scope: 'project',
    });

    assert.match(report.codexHome, /\.codex$/);
    assert.equal(report.scope, 'project');
    assert.equal(report.checks.mcpConfigured, true);
  });
});
