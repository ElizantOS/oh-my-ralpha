---
name: tmux-cli-agent-harness
description: Use tmux to operate arbitrary CLI agents or REPL-style terminal tools, either directly or by handing a shared tmux session to a subagent for delegated terminal work.
---

# tmux CLI Agent Harness

Use this skill when the user wants to drive, observe, test, or delegate work inside a real terminal session. This includes CLI agents, REPL-style tools that repeatedly accept input and produce output, long-running TUI agents, command loops, or any terminal tool where the leader, a subagent, or the user may need to attach, inspect, or reclaim the session.

Do not use this skill for browser automation, OMX team orchestration, or a tool with a better first-class API. This skill is about terminal communication through tmux, not about a specific agent brand.

## Core Rules

- Treat tmux as the shared live control surface and the captured pane as evidence.
- Use the lightest control mode that fits: direct leader operation for simple work, subagent handoff for long-running or parallel interactive work, and user attach when human inspection matters.
- When using a subagent, the leader owns orchestration, evidence review, and final reporting. The subagent owns the delegated interactive tmux loop.
- Test the real interactive CLI/TUI unless the user explicitly asks for non-interactive mode. For Codex, launch plain `codex`; do not substitute `codex exec` for this harness.
- Keep the session inspectable while work is active. After successful completion and final evidence capture, clean up by default: close the CLI/Codex process, retire any spawned subagent, and kill the tmux session.
- Leave sessions open only when the user explicitly asks to inspect/attach, when debugging failed or blocked state, or when the task requires a long-running process to continue.
- Any agent can read retained tmux scrollback with `tmux capture-pane`, but it is limited by tmux `history-limit`, alternate-screen behavior, and any output that was never rendered in the pane. For long-running or user-inspected runs, also start a `tmux pipe-pane` transcript log before launching the CLI.
- Treat transcript logs as sensitive raw terminal output. They may include ANSI control sequences, service errors, auth/challenge noise, prompts, and secrets; summarize or scrub before final reports and delete logs after cleanup unless the user asked to keep them.
- Prefer deterministic shell commands for setup, then use tmux only for the interactive part.
- Prefer `tmux load-buffer` plus `tmux paste-buffer` for long prompts, repeated REPL inputs, multiline content, shell metacharacters, or non-ASCII text.
- Use `tmux send-keys ... Enter` only for short, simple commands or keys.
- For Codex TUI long-prompt submission, paste role prompts sequentially with
  named tmux buffers, then submit with a raw carriage return buffer:
  `printf '\r' | tmux load-buffer -b submit_<role> -` followed by
  `tmux paste-buffer -b submit_<role> -t <session>`. Plain `Enter`, `C-j`, or
  `M-Enter` may stay inside the multiline composer after a paste.
- Read the pane before and after each important action. After subagent work, the leader should independently capture the pane before accepting the report.
- If the agent is busy, do not blindly press Enter. Capture the screen and identify whether input should be queued, interrupted, or delayed.
- Keep final reports short: session name, attach command, what was sent, what was observed, and unresolved risks.

## Ralpha Integration Profile

Use this profile when `oh-my-ralpha` needs an inspectable tmux-backed reviewer,
test worker, or diagnostic worker. The ralpha leader keeps ownership of source
edits, `ralpha_state`, workboard updates, and rounds updates. tmux is the live
evidence and interaction layer; the ralpha MCP tools are the durable control
plane.

- Do not introduce a mailbox for ralpha v1. Use capture history and optional
  `pipe-pane` transcripts for live evidence, then write durable outcomes through
  `ralpha_acceptance` and `ralpha_trace`.
- Name sessions `ralpha-<slice>-<role>-<shortid>`, for example
  `ralpha-H0-03-code-reviewer-a1b2`.
- For reviewer lanes, stay read-only. Do not edit code, write `ralpha_state`,
  or edit `.codex/oh-my-ralpha/working-model/**`.
- Submit reviewer outcomes with:
  `ralpha_acceptance submit` or
  `ralpha verdict <slice> <role> <PASS|CHANGES|REJECT|COMMENT> "summary"`.
- Append operational evidence with `ralpha_trace append`: session name, attach
  command, capture excerpt, transcript path when retained, cleanup state, and
  timeout/recovery observations.
- Prefer `ralpha acceptance wait --slice <id> --role <role> --tmux <target> --log <path>`
  or `ralpha_acceptance command=wait` for long reviewer lanes. Treat `accepted`
  and `blocked` as durable outcomes; treat `activity_reset` as proof the reviewer
  is still moving; treat `idle_timeout` and `max_timeout` as the only timeout
  statuses that may trigger replacement/degraded handling.
- Do not close or degrade a reviewer while tmux pane output, transcript
  size/mtime, or acceptance records are still changing. New output resets the
  idle timer.
- If a native reviewer times out, capture the tmux pane and check
  `ralpha_acceptance list` before launching a replacement or recording degraded
  acceptance. `CHANGES` and `REJECT` remain blocking until fixed or explicitly
  scheduled with fresh proof.

Ralpha handoff packet for a tmux reviewer:

```text
Session: ralpha-<slice>-<role>-<shortid>
Attach: tmux attach -t <session>
CWD: <repo>
Slice: <slice id>
Role: <architect|code-reviewer|code-simplifier|workflow-auditor>
Proof: <latest command and summarized output>
Scope: <paths or behavior to review>
Verdict command: ralpha verdict <slice> <role> <PASS|CHANGES|REJECT|COMMENT> "<summary>"
Trace command: ralpha trace append --type tmux-reviewer-checkpoint ...
Wait command: ralpha acceptance wait --slice <slice> --role <role> --tmux <session> --log <transcript>
Readonly: do not edit files, ralpha_state, workboard, or rounds
Cleanup: capture final pane, stop transcript, then kill session unless debugging/inspection is requested
```

For inspectable Codex reviewers, do not use native subagents. Create one tmux
session per reviewer, launch plain `codex --no-alt-screen`, paste the
role-specific prompt with a named buffer, submit with raw carriage return, and
leave the session attachable until the human has inspected it. The final report
must list every session intentionally left open and the exact cleanup commands;
after inspection is complete, kill the reviewer sessions and verify they are
gone with `tmux list-sessions`.

Ralpha evidence packet returned to the leader:

```text
Session: <session>
Attach: tmux attach -t <session>
Capture: <short excerpt or checkpoint summary>
Transcript: <path or "none">
Verdict: <record id/verdict or "not submitted">
Trace: <event id/type or "not submitted">
Cleanup: <killed|left-open-with-reason|failed>
Risks: <remaining uncertainty>
```

## References

- Use `references/tmux-control.md` for exact tmux command patterns, safe input handling, history capture, and cleanup examples.
- Use `references/test-prompts.json` as regression/eval prompts when checking this skill's behavior.

## Standard Workflow

1. **Choose the control mode**
   - Direct: the leader creates/reuses tmux and performs the observe-send-observe loop.
   - Delegated leader-starts: the leader creates/reuses tmux, captures the baseline, then hands the session name to a subagent.
   - Delegated subagent-starts: the leader gives the subagent the command, working directory, session naming rule, and evidence requirements. The subagent must return the created session name and attach command immediately after creating tmux, before sending substantive input.
   - User-inspection: leave the session open and provide `tmux attach -t <session>` so the user can watch or take over.
   - Prefer direct mode for short smoke tests and narrow REPL checks. Prefer delegated mode when the run is long, interrupt-prone, parallelizable, or benefits from a separate agent staying with the terminal.

2. **Name the session**
   - Use a stable descriptive name such as `agent-repl-smoke`, `cli-agent-run`, or a user-provided name.
   - If the user wants to inspect the run, tell them the attach command before or immediately after starting:
     `tmux attach -t <session>`.

3. **Start or reuse the session**
   - Check whether the session exists:
     `tmux has-session -t <session>`.
   - Before reusing an existing session, capture it and verify it belongs to this task: expected working directory, command/prompt, naming intent, and no unrelated active process.
   - If ownership or current state is unclear, choose a new unique session name instead of sending input to a stale session.
   - Start a new session when needed:
     `tmux new-session -d -s <session> -c <cwd> '<command>'`.
   - If starting without the agent command, create a shell first and launch the command with `send-keys`.
   - For long-running or audit-sensitive runs, increase tmux history and start a transcript before the noisy work starts:
     `tmux set-option -w -t <session> history-limit 200000`
     `tmux pipe-pane -o -t <session> "cat >> /tmp/<session>.log"`
   - Tell the user the session name and log path before continuing when they want to attach and inspect.

4. **Capture the baseline**
   - Use:
     `tmux capture-pane -pt <session> -S -120`.
   - Confirm the working directory, prompt, trust screen, login prompt, or initial ready marker.

5. **Delegate only when useful**
   - Skip this step in direct mode.
   - In delegated mode, give the subagent a compact handoff packet:
     - session name and `tmux attach -t <session>`
     - working directory and command already launched, or command to launch
     - user goal, expected observable result, and stop condition
     - inputs to send, with any secrets redacted from reports
     - capture policy: read before/after each important action and summarize checkpoints
     - cleanup policy: close CLI/Codex and kill tmux after verified completion unless explicitly told to leave open
   - Tell the subagent not to hide blocked states. It should report whether it is waiting, queued, interrupted, complete, or failed.

6. **Send input safely**
   - For simple commands:
     `tmux send-keys -t <session> 'short command' Enter`.
   - For long prompts, repeated REPL cases, or content with quoting risk:
     generate or read the prompt from a safe source and pipe stdout into `tmux load-buffer -`, such as:
     `printf '%s' "$PROMPT_TEXT" | tmux load-buffer -`
     then paste:
     `tmux paste-buffer -t <session>`
     and send `Enter` if the target expects it.
   - Do not embed arbitrary prompt text directly inside a shell-quoted command. If constructing the prompt programmatically, write it to stdout and pipe that output to `tmux load-buffer -`.
   - For TUI queue behavior, use the key shown by the UI, such as `Tab`, only after the screen says it is the right action.
   - In full-screen TUIs such as Codex, paste the prompt into the live input box and submit with the visible submit key. Do not use a non-interactive subcommand as a shortcut unless the user asked for that mode.

7. **Observe and loop**
   - Poll with `capture-pane`.
   - If a transcript log is active, grep or tail the log for checkpoints and final markers as a second evidence source.
   - Look for success markers, test summaries, prompts, error traces, blocked states, or “working” indicators.
   - Repeat input/capture cycles for REPL loops.
   - Record enough screen evidence to explain pass/fail without dumping the whole transcript.

8. **Interrupt only with evidence**
   - Use `Escape` for TUI interrupt prompts when the screen indicates it is supported.
   - Use `C-c` for command interruption when a process is stuck or the user explicitly asks.
   - After interruption, capture the screen and report the exact resulting state.

9. **Return or reclaim control**
   - The subagent reports the session name, final/current state, inputs sent, checkpoints observed, and unresolved risks.
   - The leader independently captures the pane, preferably with retained history:
     `tmux capture-pane -pt <session> -S -`
   - If `pipe-pane` logging was active, inspect the log for the same checkpoint/final marker and note whether the log contains raw ANSI/noisy service output.
   - In direct mode, this step is just the leader's final evidence capture.
   - If more work remains, the leader can continue directly or hand the same session to a subagent.

10. **Close or leave open**
   - Default after verified completion: close the terminal program and reclaim tmux.
   - Capture final evidence first:
     `tmux capture-pane -pt <session> -S -`
   - Gracefully exit the CLI/REPL/agent using its visible quit command when known, such as `/quit`, `exit`, `logout`, `C-d`, or the UI's quit key. For Codex-like CLIs, prefer the tool's documented quit flow before interrupting.
   - If graceful exit fails or the process is stuck after evidence capture, use `C-c` with a post-interrupt capture.
   - Stop transcript logging before killing the session:
     `tmux pipe-pane -t <session>`
   - Kill the tmux session after the process has exited or when no further inspection is needed:
     `tmux kill-session -t <session>`.
   - Verify cleanup:
     `tmux has-session -t <session>`.
   - If using a native Codex subagent outside the tmux pane, close/retire it after its final report rather than leaving it running.
   - Leave the session open only when the user explicitly asks, the process must keep running, or failure evidence needs live inspection. In that case, provide:
     `tmux attach -t <session>`.
   - Delete transcript logs after cleanup unless the user requested a retained audit artifact.

## Evidence Checklist

- Session name and attach command.
- Working directory.
- Agent/REPL command launched.
- Control mode: direct, delegated leader-starts, delegated subagent-starts, or user-inspection.
- Subagent handoff details, if delegated.
- Inputs sent, summarized when long.
- Important screen excerpts.
- Transcript log path, if enabled, and whether it was retained or deleted.
- Exit or current state.
- Cleanup result: CLI/Codex exited, subagent closed if applicable, tmux session killed or intentionally left open.
- Any history-limit or alternate-screen caveat that affects evidence completeness.

## Common Failure Handling

- **tmux socket permission failure**: rerun the tmux command with the required permission path or ask for permission if the environment blocks socket creation.
- **Command not found**: capture the error, check PATH, and stop unless the user asked to install tools.
- **Input pasted but not submitted**: send `Enter` only after confirming the target expects a submit key.
- **Message queued instead of processed**: capture the queue state and wait for the active turn to finish, unless the user asks to interrupt.
- **Long prompt corrupted**: switch to `load-buffer` and paste-buffer. Avoid raw `send-keys -l` for complex content.
- **Agent stuck in setup/trust/login**: capture the prompt and follow only the visible choices or the user's explicit instruction.
- **Delegation would add overhead**: stay in direct mode and operate tmux from the leader.
- **Subagent report is incomplete**: the leader captures the tmux pane directly before asking for another subagent update.
- **History is missing**: use the retained pane history if available, but do not claim full transcript recovery beyond the configured tmux scrollback or alternate-screen contents.
- **Cleanup fails**: capture the post-exit or post-interrupt pane, report the remaining session/process state, and do not claim cleanup completed.
