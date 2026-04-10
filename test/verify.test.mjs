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
    assert.ok(checkNames.includes('mcp_state_handshake'));
    assert.ok(checkNames.includes('mcp_trace_handshake'));
    assert.ok(checkNames.includes('mcp_runtime_handshake'));
    assert.ok(checkNames.includes('notify_log_capture'));
    assert.ok(checkNames.includes('tool_hook_log_capture'));
    assert.equal(result.doctor.checks.mcpStateConfigured, true);
    assert.equal(result.doctor.checks.mcpTraceConfigured, true);
    assert.equal(result.doctor.checks.mcpRuntimeConfigured, true);
    assert.equal(result.doctor.checks.notifyConfigured, true);
  });
});
