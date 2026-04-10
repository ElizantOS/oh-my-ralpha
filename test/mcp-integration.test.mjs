import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stateMcpServer } from '../src/mcp/state-server.mjs';
import { traceMcpServer } from '../src/mcp/trace-server.mjs';
import { runtimeMcpServer } from '../src/mcp/runtime-server.mjs';
import { dispatchNativeHook } from '../src/native-hook.mjs';

function unwrapTextResult(response) {
  assert.equal(response.jsonrpc, '2.0');
  assert.ok(response.result);
  const content = response.result.content;
  assert.ok(Array.isArray(content));
  assert.equal(content[0]?.type, 'text');
  return JSON.parse(content[0].text);
}

describe('oh-my-ralpha MCP integration', () => {
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
    assert.equal(result.finalSkill, 'ralplan');
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

  it('exposes session-log tools through the runtime MCP server', async () => {
    const response = await runtimeMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    const toolNames = response.result.tools.map((tool) => tool.name);
    assert.ok(toolNames.includes('log_status'));
    assert.ok(toolNames.includes('log_show'));
    assert.ok(toolNames.includes('log_disable'));
  });

  it('reads session-log state and entries through runtime MCP tools', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-mcp-log-'));
    await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      session_id: 'mcp-log-session',
      thread_id: 'mcp-log-thread',
      turn_id: 'turn-1',
      prompt: '@LOG capture this session',
    });

    const statusResponse = await runtimeMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'log_status',
        arguments: {
          cwd,
          sessionId: 'mcp-log-session',
        },
      },
    });

    const status = unwrapTextResult(statusResponse);
    assert.equal(status.active, true);

    const entriesResponse = await runtimeMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'log_show',
        arguments: {
          cwd,
          sessionId: 'mcp-log-session',
          limit: 10,
        },
      },
    });

    const entries = unwrapTextResult(entriesResponse);
    assert.ok(entries.some((entry) => entry.event_name === 'logging-enabled'));
  });
});
