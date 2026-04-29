import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runtimeRootFromModule } from '../src/paths.mjs';
import { setupCodexIntegration } from '../src/setup.mjs';
import { verifyInstallation } from '../src/verify.mjs';

function makeTempWorkspace(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

describe('oh-my-ralpha verify command surface', () => {
  it('runs release-style verification for a project-scoped install', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-verify-');
    const runtimeRoot = runtimeRootFromModule(import.meta.url);

    await setupCodexIntegration({
      cwd,
      runtimeRoot,
      scope: 'project',
      force: true,
    });

    const result = await verifyInstallation({
      runtimeRoot,
      cwd,
      scope: 'project',
    });

    assert.equal(result.ok, true);
    const checkNames = result.checks.map((entry) => entry.name);
    assert.ok(checkNames.includes('installed_cli'));
    assert.ok(checkNames.includes('native_hook_prompt_submit'));
    assert.ok(checkNames.includes('required_native_agents'));
    assert.ok(checkNames.includes('mcp_handshake'));
    const nativeAgents = result.checks.find((entry) => entry.name === 'required_native_agents');
    assert.deepEqual(nativeAgents.detail, [
      'architect',
      'code-reviewer',
      'code-simplifier',
      'workflow-auditor',
    ]);
    assert.equal(result.doctor.checks.mcpConfigured, true);
  });
});
