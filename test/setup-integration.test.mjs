import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runtimeRootFromModule } from '../src/paths.mjs';
import { setupCodexIntegration, uninstallCodexIntegration } from '../src/setup.mjs';
import { dispatchNativeHook } from '../src/native-hook.mjs';

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
    assert.match(config, /^notify = \["node", ".*oh-my-ralpha\.js", "notify"\]$/m);
    assert.match(config, /\[mcp_servers\.oh_my_ralpha_state\]/);
    assert.match(config, /\[mcp_servers\.oh_my_ralpha_trace\]/);
    assert.match(config, /\[mcp_servers\.oh_my_ralpha_runtime\]/);
    assert.ok(hooks.hooks.SessionStart);
    assert.ok(hooks.hooks.PreToolUse);
    assert.equal(hooks.hooks.PreToolUse[0].matcher, undefined);
    assert.ok(hooks.hooks.PostToolUse);
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

    await uninstallCodexIntegration({ cwd, codexHome, scope: 'user' });

    const nextHooks = JSON.parse(await readFile(hooksPath, 'utf-8'));
    const nextConfig = await readFile(join(codexHome, 'config.toml'), 'utf-8');
    const sessionHooks = nextHooks.hooks.SessionStart.flatMap((entry) => entry.hooks ?? []);
    assert.ok(sessionHooks.some((hook) => hook.command === 'echo user-hook'));
    assert.ok(!sessionHooks.some((hook) => typeof hook.command === 'string' && hook.command.includes('oh-my-ralpha.js" hook native')));
    assert.match(nextConfig, /codex_hooks = true/);
    assert.doesNotMatch(nextConfig, /^notify = \["node", ".*oh-my-ralpha\.js", "notify"\]$/m);
    assert.doesNotMatch(nextConfig, /\[mcp_servers\.oh_my_ralpha_state\]/);
    assert.doesNotMatch(nextConfig, /\[mcp_servers\.oh_my_ralpha_trace\]/);
    assert.doesNotMatch(nextConfig, /\[mcp_servers\.oh_my_ralpha_runtime\]/);
    assert.equal(existsSync(join(codexHome, 'skills', 'oh-my-ralpha')), false);
    assert.equal(existsSync(join(codexHome, 'bin', 'oh-my-ralpha')), false);
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

    assert.equal(existsSync(join(codexHome, 'skills', 'oh-my-ralpha')), false);
    assert.equal(existsSync(join(codexHome, 'bin', 'oh-my-ralpha')), false);
    assert.equal(existsSync(join(codexHome, 'config.toml')), false);
  });

  it('preserves and chains a pre-existing non-managed notify entry', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-invalid-notify-');
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
    const chain = JSON.parse(await readFile(join(result.targetSkillDir, 'notify-chain.json'), 'utf-8'));

    assert.match(config, /^notify = \["node", ".*oh-my-ralpha\.js", "notify"\]$/m);
    assert.deepEqual(chain.command, ['node', '/tmp/custom-notify.js']);
  });

  it('returns native hook additional context for routed prompts', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-native-hook-');
    const output = await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      prompt: '$ralpha fix this',
    });

    assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(output.hookSpecificOutput.additionalContext, /Do planning first/i);
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
    assert.equal(report.checks.notifyConfigured, true);
    assert.equal(report.checks.mcpStateConfigured, true);
    assert.equal(report.checks.mcpTraceConfigured, true);
    assert.equal(report.checks.mcpRuntimeConfigured, true);
  });
});
