import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dispatchNativeHook } from '../src/native-hook.mjs';
import { handleNotifyPayload } from '../src/notify.mjs';
import { clearSessionLogState, readSessionLogEntries, readSessionLogState } from '../src/session-log.mjs';

function makeTempWorkspace(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

describe('oh-my-ralpha session logging', () => {
  it('enables session logging when @LOG appears in UserPromptSubmit', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-log-enable-');
    const output = await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      session_id: 'sess-log-1',
      thread_id: 'thread-log-1',
      turn_id: 'turn-log-1',
      prompt: '@LOG continue with debugging',
    });

    assert.match(output.hookSpecificOutput.additionalContext, /session logging enabled/i);
    const state = await readSessionLogState({
      cwd,
      sessionId: 'sess-log-1',
    });
    assert.equal(state.active, true);
    assert.equal(existsSync(state.log_file_path), true);
  });

  it('uses a stable non-global scope when @LOG is enabled without session/thread ids', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-log-scope-');
    await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      transcript_path: '/tmp/fake-transcript.json',
      prompt: '@LOG continue with debugging',
    });

    const state = await readSessionLogState({ cwd });
    assert.equal(state.active, true);
    assert.notEqual(state.scope_id, 'global');
    assert.equal(state.scope_kind, 'transcript');
  });

  it('captures notify payloads after logging is enabled', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-log-notify-');
    await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      session_id: 'sess-log-2',
      thread_id: 'thread-log-2',
      turn_id: 'turn-log-1',
      prompt: '@LOG capture the next turn',
    });

    await handleNotifyPayload({
      cwd,
      session_id: 'sess-log-2',
      thread_id: 'thread-log-2',
      type: 'agent-turn-complete',
      'turn-id': 'turn-log-2',
      'input-messages': ['do the next thing'],
      'last-assistant-message': 'I did the next thing',
    });

    const entries = await readSessionLogEntries({
      cwd,
      sessionId: 'sess-log-2',
    });
    assert.ok(entries.some((entry) => entry.channel === 'notify' && entry.summary.last_assistant_message === 'I did the next thing'));
  });

  it('captures notify payloads even when notify omits session/thread identifiers', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-log-notify-fallback-');
    await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      session_id: 'sess-log-2b',
      thread_id: 'thread-log-2b',
      turn_id: 'turn-log-1',
      prompt: '@LOG capture the next turn',
    });

    await handleNotifyPayload({
      cwd,
      type: 'agent-turn-complete',
      'turn-id': 'turn-log-2',
      'input-messages': ['hello'],
      'last-assistant-message': 'world',
    });

    const entries = await readSessionLogEntries({
      cwd,
      sessionId: 'sess-log-2b',
    });
    assert.ok(entries.some((entry) => entry.channel === 'notify' && entry.summary.last_assistant_message === 'world'));
  });

  it('does not misattribute missing-id notify payloads when multiple active sessions exist', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-log-ambiguous-');
    await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      session_id: 'sess-log-a',
      thread_id: 'thread-log-a',
      turn_id: 'turn-log-a1',
      prompt: '@LOG first session',
    });
    await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      session_id: 'sess-log-b',
      thread_id: 'thread-log-b',
      turn_id: 'turn-log-b1',
      prompt: '@LOG second session',
    });

    await handleNotifyPayload({
      cwd,
      type: 'agent-turn-complete',
      'turn-id': 'turn-log-x',
      'input-messages': ['ambiguous'],
      'last-assistant-message': 'should not be misattributed',
    });

    const entriesA = await readSessionLogEntries({ cwd, sessionId: 'sess-log-a' });
    const entriesB = await readSessionLogEntries({ cwd, sessionId: 'sess-log-b' });
    assert.ok(!entriesA.some((entry) => entry.summary.last_assistant_message === 'should not be misattributed'));
    assert.ok(!entriesB.some((entry) => entry.summary.last_assistant_message === 'should not be misattributed'));
  });

  it('captures PreToolUse and PostToolUse while logging is active', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-log-tools-');
    await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      session_id: 'sess-log-3',
      thread_id: 'thread-log-3',
      turn_id: 'turn-log-1',
      prompt: '@LOG trace tool usage',
    });

    await dispatchNativeHook({
      hook_event_name: 'PreToolUse',
      cwd,
      session_id: 'sess-log-3',
      thread_id: 'thread-log-3',
      tool_name: 'Bash',
      tool_use_id: 'tool-1',
      tool_input: { command: 'echo hi' },
    });

    await dispatchNativeHook({
      hook_event_name: 'PostToolUse',
      cwd,
      session_id: 'sess-log-3',
      thread_id: 'thread-log-3',
      tool_name: 'Bash',
      tool_use_id: 'tool-1',
      tool_input: { command: 'echo hi' },
      tool_response: { stdout: 'hi', stderr: '', exit_code: 0 },
    });

    const entries = await readSessionLogEntries({
      cwd,
      sessionId: 'sess-log-3',
    });
    assert.ok(entries.some((entry) => entry.event_name === 'PreToolUse'));
    assert.ok(entries.some((entry) => entry.event_name === 'PostToolUse'));
  });

  it('captures Stop and supports @UNLOG', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-log-stop-');
    await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      session_id: 'sess-log-4',
      thread_id: 'thread-log-4',
      turn_id: 'turn-log-1',
      prompt: '@LOG trace stop behavior',
    });

    await dispatchNativeHook({
      hook_event_name: 'Stop',
      cwd,
      session_id: 'sess-log-4',
      thread_id: 'thread-log-4',
      turn_id: 'turn-log-2',
    });

    await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      session_id: 'sess-log-4',
      thread_id: 'thread-log-4',
      turn_id: 'turn-log-3',
      prompt: '@UNLOG',
    });

    const state = await readSessionLogState({
      cwd,
      sessionId: 'sess-log-4',
    });
    const entries = await readSessionLogEntries({
      cwd,
      sessionId: 'sess-log-4',
    });
    assert.equal(state.active, false);
    assert.ok(entries.some((entry) => entry.event_name === 'Stop'));
    assert.ok(entries.some((entry) => entry.event_name === 'logging-disabled'));
  });

  it('clears thread-scoped log state correctly', async () => {
    const cwd = await makeTempWorkspace('oh-my-ralpha-log-clear-');
    await dispatchNativeHook({
      hook_event_name: 'UserPromptSubmit',
      cwd,
      thread_id: 'thread-clear',
      turn_id: 'turn-log-1',
      prompt: '@LOG clear by thread',
    });

    const cleared = await clearSessionLogState({
      cwd,
      threadId: 'thread-clear',
    });
    const state = await readSessionLogState({
      cwd,
      threadId: 'thread-clear',
    });
    assert.equal(cleared, true);
    assert.equal(state, null);
  });
});
