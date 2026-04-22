# tmux Control Reference

## Minimal Commands

```bash
tmux has-session -t <session>
tmux new-session -d -s <session> -c <cwd>
tmux new-session -d -s <session> -c <cwd> '<command>'
tmux send-keys -t <session> 'command' Enter
tmux capture-pane -pt <session> -S -120
tmux capture-pane -pt <session> -S -
tmux attach -t <session>
tmux pipe-pane -o -t <session> "cat >> /tmp/<session>.log"
tmux pipe-pane -t <session>
tmux send-keys -t <session> C-d
tmux send-keys -t <session> C-c
tmux kill-session -t <session>
```

## Control Modes

- Direct: leader creates/reuses the tmux session and runs the observe-send-observe loop.
- Delegated leader-starts: leader creates/reuses the tmux session, captures baseline evidence, then hands the session name to a subagent.
- Delegated subagent-starts: subagent creates the tmux session, immediately returns the session name and attach command, then continues the terminal loop.
- User-inspection: session remains open so the user can attach and review.

Use direct mode for short smoke tests or narrow REPL checks. Use delegated mode when the interactive run is long, parallelizable, or likely to need a dedicated agent watching terminal state.

## Reuse Gate

Before reusing an existing session name, capture and validate it:

```bash
tmux has-session -t <session>
tmux capture-pane -pt <session> -S -80
```

Reuse only when the pane clearly belongs to the current task: expected working directory, prompt/command, and no unrelated active process. If ownership is unclear, choose a new unique session name.

## Subagent Handoff

Use tmux as the shared control surface when delegation is useful. The leader can create the session first and hand the session name to a subagent, or the subagent can create the session and return the name.

Minimum handoff packet:

```text
Session: <session>
Attach: tmux attach -t <session>
CWD: <cwd>
Command: <command already running, or command to launch>
Goal: <observable outcome>
Stop: <success/failure/timeout condition>
Input: <prompt or input sequence>
Capture: read before and after important actions
Cleanup: close CLI/Codex and kill tmux after verified completion unless explicitly told to leave open
```

The subagent should report checkpoints, not just a final summary. The leader should independently run `capture-pane` before trusting completion.

For delegated subagent-starts, the first checkpoint is mandatory: after `tmux new-session`, the subagent reports `Session` and `Attach` before sending substantive input.

## Ralpha Reviewer Handoff

For `oh-my-ralpha`, tmux should not replace the ralpha MCP control plane. Use
tmux for interactive observation and retained history, then write durable
outcomes through existing ralpha commands.

Example reviewer session:

```bash
SESSION=ralpha-H0-03-code-reviewer-a1b2
LOG=/tmp/${SESSION}.log
tmux new-session -d -s "$SESSION" -c "$REPO"
tmux set-option -w -t "$SESSION" history-limit 200000
tmux pipe-pane -o -t "$SESSION" "cat >> '$LOG'"
tmux capture-pane -pt "$SESSION" -S -120
```

Paste the reviewer prompt with `load-buffer`/`paste-buffer`. The prompt should
include the slice id, role, latest proof, review scope, and the required
writeback command:

```bash
ralpha verdict H0-03 code-reviewer CHANGES "system_routes return type needs narrowing"
```

Use `ralpha trace append` for operational checkpoints, such as session name,
attach command, capture excerpts, timeout observations, and cleanup status.

Do not add mailbox files in ralpha v1. If a reviewer is late or a native
subagent timed out, the leader should:

Activity from tmux, transcript logs, or acceptance records resets idle timeout
tracking; elapsed wait time alone is not failure evidence.

1. Capture the tmux pane and transcript checkpoint.
2. Run `ralpha_acceptance list` or `ralpha acceptance wait` for the slice.
3. Treat `activity_reset` as a sign of live reviewer progress and reset the
   idle timeout rather than closing the reviewer.
4. Treat `CHANGES` or `REJECT` as blocking, even if the verdict arrived after a
   wait timeout.
5. Launch one replacement reviewer only when no verdict exists and the wait
   result is `idle_timeout` or `max_timeout`.

## Safe Long Input

Use tmux buffers for prompts with quotes, newlines, shell metacharacters, or non-ASCII text:

```bash
printf '%s' "$PROMPT_TEXT" | tmux load-buffer -
tmux paste-buffer -t <session>
tmux send-keys -t <session> Enter
```

When generating the prompt programmatically, write to stdout and pipe into `tmux load-buffer -` rather than embedding the whole prompt in a shell command.

For Codex TUI long prompts, use named buffers and submit with a raw carriage
return. Plain `Enter`, `C-j`, and `M-Enter` can remain inside the multiline
composer after paste.

```bash
printf '%s' "$ARCHITECT_PROMPT" | tmux load-buffer -b architect_prompt -
tmux paste-buffer -b architect_prompt -t ralpha-CODEX-architect
printf '\r' | tmux load-buffer -b submit_architect -
tmux paste-buffer -b submit_architect -t ralpha-CODEX-architect

printf '%s' "$CODE_REVIEWER_PROMPT" | tmux load-buffer -b code_reviewer_prompt -
tmux paste-buffer -b code_reviewer_prompt -t ralpha-CODEX-code-reviewer
printf '\r' | tmux load-buffer -b submit_code_reviewer -
tmux paste-buffer -b submit_code_reviewer -t ralpha-CODEX-code-reviewer
```

Do not paste to multiple reviewer panes in parallel with the default tmux
buffer; use per-role buffer names to avoid cross-pane prompt mix-ups.

## Observation Loop

```bash
tmux capture-pane -pt <session> -S -200
tmux capture-pane -pt <session> -S -
tail -200 /tmp/<session>.log
rg -n "<marker>|ERROR|Reconnecting|tokens used" /tmp/<session>.log
```

Check for:

- ready prompt
- trust/login/setup prompt
- working/busy indicator
- queued message indicator
- test pass/fail summary
- stack trace or command-not-found error
- final agent summary
- `activity_reset`, `idle_timeout`, and `max_timeout` when using
  `ralpha acceptance wait`

## History Capture

`tmux capture-pane -pt <session> -S -` reads the retained pane history from the beginning of tmux scrollback. This is usually enough for leader review, but it is not an infinite transcript.

Limits:

- tmux only retains up to its configured `history-limit`
- alternate-screen TUIs may not leave all prior content in scrollback
- content written to files, subprocess logs, or cleared screens may not be recoverable from the pane
- text that was never rendered in the pane cannot be captured by tmux

For long runs, capture checkpoints during the run and summarize them in the subagent report. If full logs matter, start the target command with explicit logging in addition to tmux capture.

## Transcript Logging

For user-inspected, long-running, or audit-sensitive runs, start logging before launching the interactive CLI:

```bash
LOG=/tmp/<session>.log
touch "$LOG"
tmux set-option -w -t <session> history-limit 200000
tmux pipe-pane -o -t <session> "cat >> '$LOG'"
```

Then launch the real interactive tool in tmux. For Codex harness tests, use plain `codex` unless the user explicitly asks for `codex exec`:

```bash
tmux send-keys -t <session> codex Enter
```

Observed behavior from live testing:

- `tmux capture-pane -pt <session> -S -` can see the live Codex TUI prompt and final answer.
- `pipe-pane` captures the same TUI flow, including prompts and answers, but with raw ANSI control sequences.
- Codex may emit noisy service responses, retries, analytics warnings, or challenge HTML into the transcript.

Treat transcript logs as sensitive. Scrub or summarize before reporting, and delete them after cleanup unless the user asked to retain the log.

## Cleanup And Reclaim

Keep tmux inspectable while work is active. After successful completion, reclaim resources by default:

```bash
tmux capture-pane -pt <session> -S -
tmux send-keys -t <session> 'exit' Enter
tmux pipe-pane -t <session>
tmux has-session -t <session>
tmux kill-session -t <session>
tmux has-session -t <session>
```

Use the target tool's visible/documented quit flow when known:

- `/quit` or `exit` for REPL-style tools that accept text commands
- `C-d` for shells and EOF-driven REPLs
- the UI's quit key for TUI tools
- `C-c` only after evidence capture when the process is stuck or interrupt is appropriate

If the session is intentionally left open, report why and provide `tmux attach -t <session>`. If cleanup is expected, verify `tmux has-session -t <session>` no longer finds it.

## Interactive Keys

```bash
tmux send-keys -t <session> Enter
tmux send-keys -t <session> Escape
tmux send-keys -t <session> C-c
tmux send-keys -t <session> Tab
```

Use these only when the current screen supports the action.
