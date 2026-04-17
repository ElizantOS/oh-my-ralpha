import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stateMcpServer } from '../src/mcp/state-server.mjs';
import { traceMcpServer } from '../src/mcp/trace-server.mjs';
import { runtimeMcpServer } from '../src/mcp/runtime-server.mjs';
import { ralphaMcpServer } from '../src/mcp/server.mjs';

function unwrapTextResult(response) {
  assert.equal(response.jsonrpc, '2.0');
  assert.ok(response.result);
  const content = response.result.content;
  assert.ok(Array.isArray(content));
  assert.equal(content[0]?.type, 'text');
  return JSON.parse(content[0].text);
}

describe('oh-my-ralpha MCP integration', () => {
  it('lists the unified progressive command-group tools', async () => {
    const response = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    const toolNames = response.result.tools.map((tool) => tool.name);
    assert.deepEqual(toolNames, [
      'ralpha_state',
      'ralpha_trace',
      'ralpha_workflow',
      'ralpha_admin',
    ]);
  });

  it('reads and writes mode state through the unified state command group', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-unified-state-'));
    await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'ralpha_state',
        arguments: {
          command: 'write',
          cwd,
          mode: 'oh-my-ralpha',
          patch: { active: true, current_phase: 'executing' },
        },
      },
    });

    const response = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'ralpha_state',
        arguments: {
          command: 'read',
          cwd,
          mode: 'oh-my-ralpha',
        },
      },
    });

    const result = unwrapTextResult(response);
    assert.equal(result.ok, true);
    assert.equal(result.command, 'read');
    assert.equal(result.state.active, true);
    assert.ok(result.next);
  });

  it('routes prompts through the unified workflow command group', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-unified-workflow-'));
    const response = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'ralpha_workflow',
        arguments: {
          command: 'route',
          cwd,
          text: '$ralpha fix this',
        },
      },
    });

    const result = unwrapTextResult(response);
    assert.equal(result.ok, true);
    assert.equal(result.command, 'route');
    assert.equal(result.result.gateApplied, true);
    assert.equal(result.result.phase, 'planning');
    assert.equal(result.result.finalSkill, 'ralplan');
    assert.equal(result.result.planningArtifactsComplete, false);
    assert.ok(result.next);
  });

  it('validates command-specific workflow fields with structured errors', async () => {
    const response = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'ralpha_workflow',
        arguments: {
          command: 'route',
        },
      },
    });

    const result = unwrapTextResult(response);
    assert.equal(result.ok, false);
    assert.equal(result.command, 'route');
    assert.match(result.error, /text is required/i);
    assert.ok(result.expected);
  });

  it('dry-runs admin setup and uninstall by default through the unified admin group', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-unified-admin-'));
    const response = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'ralpha_admin',
        arguments: {
          command: 'setup',
          cwd,
          scope: 'project',
        },
      },
    });

    const result = unwrapTextResult(response);
    assert.equal(result.ok, true);
    assert.equal(result.command, 'setup');
    assert.equal(result.dryRun, true);
    assert.ok(Array.isArray(result.wouldChange));
    assert.ok(result.next);
  });

  it('executes admin setup and uninstall with explicit dryRun false in temp fixtures', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-unified-admin-exec-'));
    const setupResponse = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'ralpha_admin',
        arguments: {
          command: 'setup',
          cwd,
          scope: 'project',
          force: true,
          dryRun: false,
        },
      },
    });

    const setupResult = unwrapTextResult(setupResponse);
    assert.equal(setupResult.ok, true);
    assert.equal(setupResult.dryRun, false);
    assert.equal(existsSync(setupResult.result.configPath), true);

    const uninstallResponse = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'ralpha_admin',
        arguments: {
          command: 'uninstall',
          cwd,
          scope: 'project',
          dryRun: false,
        },
      },
    });

    const uninstallResult = unwrapTextResult(uninstallResponse);
    assert.equal(uninstallResult.ok, true);
    assert.equal(uninstallResult.dryRun, false);
    assert.equal(existsSync(uninstallResult.result.removedSkillDir), false);
  });

  it('lists state server tools', async () => {
    const response = await stateMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    const toolNames = response.result.tools.map((tool) => tool.name);
    assert.deepEqual(toolNames, ['state_read', 'state_write', 'state_clear']);
  });

  it('reads and writes mode state through MCP tool handlers', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-mcp-state-'));
    await stateMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'state_write',
        arguments: {
          cwd,
          mode: 'oh-my-ralpha',
          patch: { active: true, current_phase: 'executing' },
        },
      },
    });

    const response = await stateMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'state_read',
        arguments: {
          cwd,
          mode: 'oh-my-ralpha',
        },
      },
    });

    const result = unwrapTextResult(response);
    assert.equal(result.active, true);
    assert.equal(result.current_phase, 'executing');
  });

  it('appends and reads trace events through MCP tool handlers', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-mcp-trace-'));
    await traceMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'trace_append',
        arguments: {
          cwd,
          type: 'mcp-test',
          metadata: { ok: true },
        },
      },
    });

    const response = await traceMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'trace_show',
        arguments: {
          cwd,
          limit: 1,
        },
      },
    });

    const result = unwrapTextResult(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, 'mcp-test');
  });

  it('routes prompts through runtime MCP tool handlers', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-mcp-runtime-'));
    const response = await runtimeMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'route_prompt',
        arguments: {
          cwd,
          text: '$ralpha fix this',
        },
      },
    });

    const result = unwrapTextResult(response);
    assert.equal(result.gateApplied, true);
    assert.equal(result.phase, 'planning');
    assert.equal(result.finalSkill, 'ralplan');
    assert.equal(result.planningArtifactsComplete, false);
  });

  it('returns doctor status through runtime MCP tool handlers', async () => {
    const response = await runtimeMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'doctor_report',
        arguments: {},
      },
    });

    const result = unwrapTextResult(response);
    assert.ok(result.checks.packagedSkill);
    assert.ok(Array.isArray(result.companions));
  });

  it('does not expose removed session-log tools through the runtime MCP server', async () => {
    const response = await runtimeMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    const toolNames = response.result.tools.map((tool) => tool.name);
    assert.ok(!toolNames.includes('log_status'));
    assert.ok(!toolNames.includes('log_show'));
    assert.ok(!toolNames.includes('log_disable'));
  });
});
