import { mkdir } from 'node:fs/promises';
import { initWorkspace } from './init.mjs';
import { readPlanningArtifacts, scaffoldPlan } from './planning.mjs';
import { workingModelContextDir, workingModelPlansDir, workingModelStateDir } from './paths.mjs';
import { recordSkillActivation, routePrompt } from './router.mjs';
import { readModeState } from './state.mjs';

const PLAN_IMPLEMENTATION_HANDOFF_PATTERNS = [
  /^implement (?:the|this) plan\.?$/i,
  /^execute (?:the|this) plan\.?$/i,
  /^apply (?:the|this) plan\.?$/i,
  /^yes,?\s+implement (?:the|this) plan\.?$/i,
  /^实施计划[。.!！]?$/u,
  /^执行计划[。.!！]?$/u,
  /^开始实施计划[。.!！]?$/u,
  /^开始执行计划[。.!！]?$/u,
];

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

function normalizePromptText(value) {
  return safeString(value).trim().replace(/\s+/g, ' ');
}

function isPlanImplementationHandoffPrompt(text) {
  const normalized = normalizePromptText(text);
  if (!normalized) return false;
  return PLAN_IMPLEMENTATION_HANDOFF_PATTERNS.some((pattern) => pattern.test(normalized));
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

function readAwaitingUserReason(state) {
  const nested = readNestedState(state);
  for (const value of [
    nested.awaiting_user_reason,
    nested.awaiting_user_prompt,
    nested.question,
    state?.awaiting_user_reason,
    state?.awaiting_user_prompt,
    state?.question,
  ]) {
    const text = safeString(value).trim();
    if (text) return text;
  }
  return '';
}

function isSubagentWaitReason(value) {
  const reason = safeString(value).trim();
  if (!reason) return false;
  const namesSubagentWork = /sub-?agent|native agent|acceptance agent|architect|code-reviewer|code-simplifier|reviewer|simplifier/i.test(reason);
  const namesWaiting = /wait|waiting|await|pending|timeout|timed out|capacity|limit|cap/i.test(reason);
  const namesUserDecision = /user.*(decision|input|approval|clarification)|human.*(decision|input|approval|clarification)|(decision|input|approval|clarification).*user/i.test(reason);
  return namesSubagentWork && namesWaiting && !namesUserDecision;
}

async function readRalphaModeState(payload, cwd) {
  const sessionId = readSessionId(payload);
  if (sessionId) {
    const sessionState = await readModeState({ cwd, mode: 'ralpha', sessionId });
    if (sessionState) {
      return {
        state: sessionState,
        scope: `session ${sessionId}`,
      };
    }
  }

  return {
    state: await readModeState({ cwd, mode: 'ralpha' }),
    scope: 'workspace',
  };
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
    return 'ralpha detected. Read the existing .codex/oh-my-ralpha state/todo/rounds artifacts and continue from the active slice instead of restarting discovery.';
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

function planImplementationHandoffContext(artifacts) {
  const status = artifacts?.status;
  const lines = [
    'Codex Plan implementation handoff detected. Treat this as explicit approval to enter ralpha execution; ralpha mode state has been activated by the native hook.',
    'Before editing product code, sync the latest Plan-mode report from conversation into .codex/oh-my-ralpha/working-model context/todo/rounds artifacts when they are missing or incomplete.',
    'Then continue one active slice at a time with ralpha gates: fresh proof, bounded reviewer-only acceptance when warranted, final deslop, post-deslop regression, and artifact sync.',
    'This handoff is a native hook bridge for the Codex Plan button, not a public natural-language keyword.',
  ];

  if (status) {
    lines.push('Planning artifact status at handoff:');
    lines.push(artifactStatusLine('context', status.context));
    lines.push(artifactStatusLine('todo', status.todo));
    lines.push(artifactStatusLine('rounds', status.rounds));
    lines.push(artifactStatusLine('PRD', status.prd));
    lines.push(artifactStatusLine('test spec', status.testSpec));
  }

  return lines.join('\n');
}

async function activatePlanImplementationHandoff({
  cwd,
  text,
  sessionId,
  threadId,
  turnId,
}) {
  const artifacts = await readPlanningArtifacts(cwd);
  const activation = await recordSkillActivation({
    cwd,
    text,
    sessionId,
    threadId,
    turnId,
    phase: 'execution',
    source: 'oh-my-ralpha-plan-implementation-bridge',
    matchOverride: {
      keyword: 'codex-plan-implementation',
      skill: 'ralpha',
      priority: 8,
    },
  });

  return { artifacts, activation };
}

function userInterruptionContext({ state, scope }) {
  const current = readResumeTarget(state) || 'unknown';
  return [
    `ralpha is already active in ${scope}. Treat this user message as an insertion into the active workflow, even though it does not repeat $ralpha.`,
    'User Interruption Protocol:',
    '- First classify the insertion as one of: current-slice correction, interrupt slice, independent side task, or backlog item.',
    '- Current-slice correction: fold it into the active slice, update the workboard and rounds ledger, then continue the same slice.',
    `- Interrupt slice: create the next INT-* item in the workboard, set state.current_slice to that INT item, record interrupts:${current} and return_to:${current}, complete it with evidence, then return to ${current}.`,
    '- Independent side task: delegate only if it has a disjoint write scope and can run safely in parallel; otherwise record it as INT-* or BACKLOG-* before continuing.',
    '- Backlog item: record BACKLOG-* in the workboard and rounds ledger, then continue the current slice.',
    '- Do not use current_phase:"paused" as a response to this insertion. Pause metadata is not permission to stop; keep active:true and keep moving.',
  ].join('\n');
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
  } else {
    const { state, scope } = await readRalphaModeState(payload, cwd);
    if (state?.active === true) {
      messages.push(userInterruptionContext({ state, scope }));
    } else if (isPlanImplementationHandoffPrompt(text)) {
      const handoff = await activatePlanImplementationHandoff({
        cwd,
        text,
        sessionId,
        threadId,
        turnId,
      });
      if (handoff.activation) {
        messages.push(planImplementationHandoffContext(handoff.artifacts));
      }
    }
  }

  if (messages.length === 0) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: messages.join('\n\n'),
    },
  };
}

async function buildStopOutput(payload, cwd) {
  const { state, scope } = await readRalphaModeState(payload, cwd);
  const phase = normalizePhase(state?.current_phase);

  if (state?.active === false && phase && !isTerminalPhase(phase)) {
    return {
      decision: 'block',
      reason: `oh-my-ralpha ${scope} mode has inactive non-terminal state (${phase}). Use active:true with current_phase:"paused" and resume state for pauses, or active:false only for complete/failed/cancelled terminal states.`,
    };
  }

  if (state?.active === true) {
    if (phase === 'awaiting_user') {
      const resumeTarget = readResumeTarget(state);
      const awaitingReason = readAwaitingUserReason(state);
      if (!resumeTarget) {
        return {
          decision: 'block',
          reason: `oh-my-ralpha ${scope} mode is awaiting user input but missing resume state. Add state.next_todo or state.current_slice before ending the turn.`,
        };
      }
      if (!awaitingReason) {
        return {
          decision: 'block',
          reason: `oh-my-ralpha ${scope} mode is awaiting user input for ${resumeTarget} but missing state.awaiting_user_reason or state.awaiting_user_prompt. Record why the next user message is needed before ending the turn.`,
        };
      }
      if (isSubagentWaitReason(awaitingReason)) {
        return {
          decision: 'block',
          reason: `oh-my-ralpha ${scope} mode uses awaiting_user for a subagent wait (${awaitingReason}). awaiting_user is only for real user decisions or missing user input. For subagent timeouts or host limits, record degraded acceptance evidence in the workboard/rounds ledger and continue.`,
        };
      }
      return null;
    }

    if (phase === 'paused') {
      const resumeTarget = readResumeTarget(state);
      const resumeHint = resumeTarget
        ? ` Resume target is ${resumeTarget}.`
        : ' Add state.next_todo or state.current_slice before any external interruption so the task can resume cleanly.';
      return {
        decision: 'block',
        reason: `oh-my-ralpha ${scope} mode is paused, but paused is resumable metadata, not permission to stop.${resumeHint} Continue, fix the blocker, use an approved degraded path, or mark the mode terminal only for an explicit cancel/complete decision.`,
      };
    }

    return {
      decision: 'block',
      reason: `oh-my-ralpha ${scope} mode is still active (${phase || 'executing'}). Continue working. If the task truly needs the next user message, write current_phase:"awaiting_user" with state.next_todo or state.current_slice plus state.awaiting_user_reason before ending the turn. Do not use awaiting_user for subagent timeouts or capacity limits. Stop protection is not a substitute for fresh evidence, bounded reviewer-only architect/code-reviewer/code-simplifier acceptance, final deslop, or post-deslop regression.`,
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
