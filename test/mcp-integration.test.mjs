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
      'ralpha_acceptance',
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
          mode: 'ralpha',
          patch: { active: true, current_phase: 'executing' },
          actorRole: 'leader',
          mutationReason: 'test leader starts execution',
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
          mode: 'ralpha',
        },
      },
    });

    const result = unwrapTextResult(response);
    assert.equal(result.ok, true);
    assert.equal(result.command, 'read');
    assert.equal(result.state.active, true);
    assert.ok(result.next);
  });

  it('rejects unified state writes from acceptance subagents', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-unified-state-guard-'));
    const blockedResponse = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'ralpha_state',
        arguments: {
          command: 'write',
          cwd,
          mode: 'ralpha',
          actorRole: 'architect',
          mutationReason: 'waiting for code-reviewer acceptance',
          patch: {
            active: true,
            current_phase: 'awaiting_user',
            state: {
              current_slice: 'P0-03',
              awaiting_user_reason: 'waiting for code-reviewer acceptance',
            },
          },
        },
      },
    });

    const blocked = unwrapTextResult(blockedResponse);
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /read-only for ralpha state/i);

    const readResponse = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'ralpha_state',
        arguments: {
          command: 'read',
          cwd,
          mode: 'ralpha',
        },
      },
    });
    assert.equal(unwrapTextResult(readResponse).state, null);
  });

  it('allows acceptance subagents to append information without mutating state', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-unified-append-only-'));
    const appendResponse = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'ralpha_acceptance',
        arguments: {
          command: 'submit',
          cwd,
          sliceId: 'P0-02',
          role: 'architect',
          verdict: 'PASS',
          summary: 'Architecture acceptance passed.',
          suggestedLedgerText: 'Architect accepted P0-02; no state transition requested.',
          evidence: { openedFiles: 2 },
        },
      },
    });

    const appended = unwrapTextResult(appendResponse);
    assert.equal(appended.ok, true);
    assert.equal(appended.record.role, 'architect');
    assert.equal(appended.record.slice_id, 'P0-02');
    assert.equal(appended.record.verdict, 'PASS');
    assert.equal(appended.record.append_only, true);

    const listResponse = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'ralpha_acceptance',
        arguments: {
          command: 'list',
          cwd,
          sliceId: 'P0-02',
        },
      },
    });
    const listed = unwrapTextResult(listResponse);
    assert.equal(listed.ok, true);
    assert.equal(listed.records.length, 1);
    assert.equal(listed.records[0].suggested_ledger_text, 'Architect accepted P0-02; no state transition requested.');
    assert.equal(listed.gate.has_blocking_reviewer_verdict, false);
    assert.match(listed.next.instruction, /must inspect gate\.has_blocking_reviewer_verdict/);

    const readResponse = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'ralpha_state',
        arguments: {
          command: 'read',
          cwd,
          mode: 'ralpha',
        },
      },
    });
    assert.equal(unwrapTextResult(readResponse).state, null);
  });

  it('allows workflow-auditor acceptance metadata through unified MCP', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-unified-workflow-auditor-'));
    const appendResponse = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'ralpha_acceptance',
        arguments: {
          command: 'submit',
          cwd,
          sliceId: 'FINAL-CLOSEOUT',
          role: 'workflow-auditor',
          verdict: 'PASS',
          summary: 'Workflow artifacts are aligned.',
          reviewRound: 3,
          reviewLens: 'workflow-state',
          reviewCycleId: 'final-cycle',
        },
      },
    });

    const appended = unwrapTextResult(appendResponse);
    assert.equal(appended.ok, true);
    assert.equal(appended.record.role, 'workflow-auditor');
    assert.equal(appended.record.review_round, 3);
    assert.equal(appended.record.review_lens, 'workflow-state');
    assert.equal(appended.record.review_cycle_id, 'final-cycle');
  });

  it('surfaces blocking reviewer verdicts through acceptance list', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-unified-acceptance-blocking-'));
    await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'ralpha_acceptance',
        arguments: {
          command: 'submit',
          cwd,
          sliceId: 'H0-03',
          role: 'code-reviewer',
          verdict: 'CHANGES',
          summary: 'Return type needs narrowing.',
        },
      },
    });
    await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'ralpha_acceptance',
        arguments: {
          command: 'submit',
          cwd,
          sliceId: 'H0-03',
          role: 'leader',
          verdict: 'PASS',
          summary: 'Manual acceptance after timeout.',
        },
      },
    });

    const listResponse = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'ralpha_acceptance',
        arguments: {
          command: 'list',
          cwd,
          sliceId: 'H0-03',
        },
      },
    });

    const listed = unwrapTextResult(listResponse);
    assert.equal(listed.gate.has_blocking_reviewer_verdict, true);
    assert.equal(listed.gate.can_record_manual_pass, false);
    assert.equal(listed.gate.blocking_records[0].role, 'code-reviewer');
    assert.equal(listed.gate.blocking_records[0].verdict, 'CHANGES');
  });

  it('scopes acceptance list gates to requested roles', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-unified-acceptance-list-roles-'));
    await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'ralpha_acceptance',
        arguments: {
          command: 'submit',
          cwd,
          sliceId: 'TEAM-02',
          role: 'architect',
          verdict: 'CHANGES',
          summary: 'Architect wants boundary cleanup.',
        },
      },
    });
    await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'ralpha_acceptance',
        arguments: {
          command: 'submit',
          cwd,
          sliceId: 'TEAM-02',
          role: 'code-reviewer',
          verdict: 'PASS',
          summary: 'Reviewer accepted.',
        },
      },
    });

    const listResponse = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'ralpha_acceptance',
        arguments: {
          command: 'list',
          cwd,
          sliceId: 'TEAM-02',
          roles: ['code-reviewer'],
        },
      },
    });

    const listed = unwrapTextResult(listResponse);
    assert.deepEqual(listed.gate.roles, ['code-reviewer']);
    assert.equal(listed.gate.has_blocking_reviewer_verdict, false);
    assert.equal(listed.gate.latest_by_role['code-reviewer'].verdict, 'PASS');
  });

  it('waits for reviewer acceptance through the unified acceptance command group', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-unified-acceptance-wait-'));
    await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'ralpha_acceptance',
        arguments: {
          command: 'submit',
          cwd,
          sliceId: 'TEAM-01',
          role: 'architect',
          verdict: 'PASS',
          summary: 'Architecture accepted.',
        },
      },
    });
    await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'ralpha_acceptance',
        arguments: {
          command: 'submit',
          cwd,
          sliceId: 'TEAM-01',
          role: 'code-reviewer',
          verdict: 'PASS',
          summary: 'Review accepted.',
        },
      },
    });

    const waitResponse = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'ralpha_acceptance',
        arguments: {
          command: 'wait',
          cwd,
          sliceId: 'TEAM-01',
          roles: ['architect', 'code-reviewer'],
          idleMs: 10,
          maxMs: 100,
          pollMs: 5,
        },
      },
    });

    const waited = unwrapTextResult(waitResponse);
    assert.equal(waited.ok, true);
    assert.equal(waited.command, 'wait');
    assert.equal(waited.status, 'accepted');
    assert.deepEqual(waited.roles, ['architect', 'code-reviewer']);
    assert.equal(waited.gate.has_blocking_reviewer_verdict, false);
  });

  it('waits for four final-closeout acceptance lanes through unified MCP', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-unified-final-closeout-'));
    for (const [id, role] of [
      [1, 'architect'],
      [2, 'code-reviewer'],
      [3, 'code-simplifier'],
      [4, 'workflow-auditor'],
    ]) {
      await ralphaMcpServer.handleRequest({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: 'ralpha_acceptance',
          arguments: {
            command: 'submit',
            cwd,
            sliceId: 'FINAL-CLOSEOUT',
            role,
            verdict: 'PASS',
            summary: `${role} accepted.`,
          },
        },
      });
    }

    const waitResponse = await ralphaMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'ralpha_acceptance',
        arguments: {
          command: 'wait',
          cwd,
          sliceId: 'FINAL-CLOSEOUT',
          roles: ['architect', 'code-reviewer', 'code-simplifier', 'workflow-auditor'],
          idleMs: 10,
          maxMs: 100,
          pollMs: 5,
        },
      },
    });

    const waited = unwrapTextResult(waitResponse);
    assert.equal(waited.status, 'accepted');
    assert.deepEqual(waited.roles, ['architect', 'code-reviewer', 'code-simplifier', 'workflow-auditor']);
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
          mode: 'ralpha',
          patch: { active: true, current_phase: 'executing' },
          actorRole: 'leader',
          mutationReason: 'test leader starts execution',
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
          mode: 'ralpha',
        },
      },
    });

    const result = unwrapTextResult(response);
    assert.equal(result.active, true);
    assert.equal(result.current_phase, 'executing');
  });

  it('rejects legacy state server awaiting_user writes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'oh-my-ralpha-mcp-state-guard-'));
    const response = await stateMcpServer.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'state_write',
        arguments: {
          cwd,
          mode: 'ralpha',
          actorRole: 'leader',
          mutationReason: 'waiting for code-simplifier acceptance',
          patch: {
            active: true,
            current_phase: 'awaiting_user',
            state: {
              current_slice: 'P0-03',
              awaiting_user_reason: 'waiting for code-simplifier acceptance',
            },
          },
        },
      },
    });

    const result = unwrapTextResult(response);
    assert.equal(result.ok, false);
    assert.match(result.error, /not supported/i);
    assert.match(result.error, /awaiting_plan_review/i);
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
