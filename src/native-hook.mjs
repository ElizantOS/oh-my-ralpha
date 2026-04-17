import { mkdir } from 'node:fs/promises';
import { initWorkspace } from './init.mjs';
import { readPlanningArtifacts, scaffoldPlan } from './planning.mjs';
import { workingModelContextDir, workingModelPlansDir, workingModelStateDir } from './paths.mjs';
import { routePrompt } from './router.mjs';
import { readModeState } from './state.mjs';

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function readHookEventName(payload) {
  return safeString(
    payload.hook_event_name
    ?? payload.hookEventName
    ?? payload.event
    ?? payload.name,
  ).trim();
}

function readPromptText(payload) {
  for (const candidate of [payload.prompt, payload.input, payload.user_prompt, payload.userPrompt, payload.text]) {
    const value = safeString(candidate).trim();
    if (value) return value;
  }
  return '';
}

function readSessionId(payload) {
  return safeString(payload.session_id || payload['session-id']).trim() || undefined;
}

function normalizePhase(value) {
  return safeString(value).trim().toLowerCase();
}

function readNestedState(state) {
  return state?.state && typeof state.state === 'object' && !Array.isArray(state.state)
    ? state.state
    : {};
}

function readResumeTarget(state) {
  const nested = readNestedState(state);
  for (const value of [
    nested.next_todo,
    nested.current_slice,
    state?.next_todo,
    state?.current_slice,
  ]) {
    const text = safeString(value).trim();
    if (text) return text;
  }
  return '';
}

function isTerminalPhase(phase) {
  return ['complete', 'failed', 'cancelled'].includes(phase);
}

function artifactStatusLine(label, entry) {
  const status = entry?.complete ? 'complete' : 'needs completion';
  const path = entry?.path ? ` (${entry.path})` : '';
  return `- ${label}: ${status}${path}`;
}

async function ensurePlanningArtifacts(cwd, task) {
  const init = await initWorkspace({ cwd, task });
  const plan = await scaffoldPlan({ cwd, task });
  return {
    init,
    plan,
    artifacts: await readPlanningArtifacts(cwd),
  };
}

function planningContext(result, ensuredPlanning) {
  if (result.phase !== 'planning') {
    return 'oh-my-ralpha detected. Read the existing .codex/oh-my-ralpha state/todo/rounds artifacts and continue from the active slice instead of restarting discovery.';
  }

  const artifacts = ensuredPlanning?.artifacts ?? result.planningArtifacts;
  const status = artifacts?.status;
  const lines = [
    result.gateApplied
      ? 'oh-my-ralpha detected an underspecified execution prompt and activated planning phase.'
      : 'oh-my-ralpha detected an execution-shaped prompt, but planning artifacts are not decision-complete; staying in planning phase.',
    'Work only on planning: inspect context, refine PRD/test-spec/workboard/rounds, and avoid product-code edits or implementation commands.',
    'Do not enter execution until planning artifacts are decision-complete and the next user prompt is execution-specific.',
  ];

  if (status) {
    lines.push('Planning artifact status:');
    lines.push(artifactStatusLine('context', status.context));
    lines.push(artifactStatusLine('todo', status.todo));
    lines.push(artifactStatusLine('rounds', status.rounds));
    lines.push(artifactStatusLine('PRD', status.prd));
    lines.push(artifactStatusLine('test spec', status.testSpec));
  }

  return lines.join('\n');
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  return raw ? JSON.parse(raw) : {};
}

async function buildSessionStartOutput(cwd) {
  await mkdir(workingModelContextDir(cwd), { recursive: true });
  await mkdir(workingModelStateDir(cwd), { recursive: true });
  await mkdir(workingModelPlansDir(cwd), { recursive: true });
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: 'oh-my-ralpha native SessionStart detected. Load AGENTS.md and the current .codex/oh-my-ralpha context/todo/rounds files before resuming work.',
    },
  };
}

async function buildPromptSubmitOutput(payload, cwd) {
  const text = readPromptText(payload);
  if (!text) return null;
  const sessionId = readSessionId(payload);
  const threadId = safeString(payload.thread_id || payload['thread-id']) || undefined;
  const turnId = safeString(payload.turn_id || payload['turn-id']) || undefined;

  const messages = [];

  const result = await routePrompt({
    cwd,
    text,
    sessionId,
    threadId,
    turnId,
    activate: true,
  });
  if (result.matched) {
    const ensuredPlanning = result.phase === 'planning'
      ? await ensurePlanningArtifacts(cwd, text)
      : null;
    messages.push(planningContext(result, ensuredPlanning));
  }

  if (messages.length === 0) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: messages.join('\n\n'),
    },
  };
}

async function readStopModeState(payload, cwd) {
  const sessionId = readSessionId(payload);
  if (sessionId) {
    const sessionState = await readModeState({ cwd, mode: 'oh-my-ralpha', sessionId });
    if (sessionState) {
      return {
        state: sessionState,
        scope: `session ${sessionId}`,
      };
    }
  }

  return {
    state: await readModeState({ cwd, mode: 'oh-my-ralpha' }),
    scope: 'workspace',
  };
}

async function buildStopOutput(payload, cwd) {
  const { state, scope } = await readStopModeState(payload, cwd);
  const phase = normalizePhase(state?.current_phase);

  if (state?.active === false && phase && !isTerminalPhase(phase)) {
    return {
      decision: 'block',
      reason: `oh-my-ralpha ${scope} mode has inactive non-terminal state (${phase}). Use active:true with current_phase:"paused" and resume state for pauses, or active:false only for complete/failed/cancelled terminal states.`,
    };
  }

  if (state?.active === true) {
    if (phase === 'paused') {
      const resumeTarget = readResumeTarget(state);
      const pauseReason = safeString(state.pause_reason).trim() || 'unspecified';
      if (!resumeTarget) {
        return {
          decision: 'block',
          reason: `oh-my-ralpha ${scope} mode is paused but missing resume state. Add state.next_todo or state.current_slice before stopping.`,
        };
      }
      return {
        hookSpecificOutput: {
          hookEventName: 'Stop',
          additionalContext: `oh-my-ralpha ${scope} mode is paused and resumable. resume_target: ${resumeTarget}. pause_reason: ${pauseReason}.`,
        },
      };
    }

    return {
      decision: 'block',
      reason: `oh-my-ralpha ${scope} mode is still active (${phase || 'executing'}). Stop protection only prevents uncleared active state; it is not a substitute for fresh evidence, architect/code-reviewer/code-simplifier slice acceptance, final deslop, or post-deslop regression.`,
    };
  }
  return null;
}

export async function dispatchNativeHook(payload) {
  const cwd = safeString(payload.cwd).trim() || process.cwd();
  const eventName = readHookEventName(payload);
  if (eventName === 'SessionStart') return buildSessionStartOutput(cwd);
  if (eventName === 'UserPromptSubmit') return buildPromptSubmitOutput(payload, cwd);
  if (eventName === 'Stop') return buildStopOutput(payload, cwd);
  return null;
}

export async function runNativeHookCli() {
  const payload = await readStdinJson();
  const output = await dispatchNativeHook(payload);
  if (output) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  }
}
