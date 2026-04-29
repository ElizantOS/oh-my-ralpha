import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  FINAL_CLOSEOUT_ROLES,
  FINAL_CLOSEOUT_SLICE_ID,
  summarizeAcceptance,
} from './acceptance.mjs';
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

async function listLatestStateFile(cwd, pattern) {
  const stateDir = workingModelStateDir(cwd);
  try {
    const entries = await readdir(stateDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && pattern.test(entry.name))
      .map((entry) => join(stateDir, entry.name))
      .sort((a, b) => a.localeCompare(b))
      .at(-1) ?? null;
  } catch {
    return null;
  }
}

function todoHasOpenStatus(content) {
  return /`status`:\s*(?:pending|in_progress)\b/i.test(content);
}

function todoHasCompletedStatus(content) {
  return /`status`:\s*completed\b/i.test(content);
}

function roundsHasOpenWork(rounds) {
  const nextTodo = safeString(rounds?.next_todo).trim();
  return Boolean(nextTodo) || (Array.isArray(rounds?.remaining_todos) && rounds.remaining_todos.length > 0);
}

function roundsIsFinalComplete(rounds) {
  return rounds?.next_todo === null
    && Array.isArray(rounds?.remaining_todos)
    && rounds.remaining_todos.length === 0;
}

async function readFinalCloseoutArtifacts(cwd) {
  const todoPath = await listLatestStateFile(cwd, /-todo\.md$/i);
  const roundsPath = await listLatestStateFile(cwd, /-rounds\.json$/i);
  if (!todoPath || !roundsPath) {
    return { status: 'unknown', todoPath, roundsPath };
  }

  const todoContent = await readFile(todoPath, 'utf-8').catch(() => '');
  const roundsContent = await readFile(roundsPath, 'utf-8').catch(() => '');
  let rounds = null;
  try {
    rounds = JSON.parse(roundsContent);
  } catch {
    return { status: 'unknown', todoPath, roundsPath };
  }

  if (todoHasOpenStatus(todoContent) || roundsHasOpenWork(rounds)) {
    return { status: 'open_work', todoPath, roundsPath, rounds };
  }

  if (todoHasCompletedStatus(todoContent) && roundsIsFinalComplete(rounds)) {
    return { status: 'final_closeout', todoPath, roundsPath, rounds };
  }

  return { status: 'unknown', todoPath, roundsPath, rounds };
}

function finalCloseoutAccepted(acceptance) {
  const latest = acceptance?.gate?.latest_by_role ?? {};
  return !acceptance?.gate?.has_blocking_reviewer_verdict
    && FINAL_CLOSEOUT_ROLES.every((role) => latest[role]?.verdict === 'PASS');
}

function finalCloseoutRoleList() {
  return FINAL_CLOSEOUT_ROLES.join(', ');
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
    'Then continue one active slice at a time with ralpha gates: fresh proof, mandatory architect/code-reviewer/code-simplifier acceptance, final deslop, post-deslop regression, FINAL-CLOSEOUT read-only review including workflow-auditor, and artifact sync.',
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
      return {
        decision: 'block',
        reason: `oh-my-ralpha ${scope} mode uses unsupported current_phase:"awaiting_user". Use current_phase:"awaiting_plan_review" only for decision-complete planning artifacts awaiting user review; otherwise keep current_phase:"executing" and continue execution.`,
      };
    }

    if (phase === 'awaiting_plan_review') {
      const resumeTarget = readResumeTarget(state);
      if (resumeTarget) {
        return {
          decision: 'block',
          reason: `oh-my-ralpha ${scope} mode is awaiting plan review but already has execution resume target ${resumeTarget}. Plan-review waiting is only before execution slices start; keep current_phase:"executing" and continue that slice/TODO.`,
        };
      }
      const planningArtifacts = await readPlanningArtifacts(cwd);
      if (!planningArtifacts.complete) {
        return {
          decision: 'block',
          reason: `oh-my-ralpha ${scope} mode is awaiting plan review, but planning artifacts are not decision-complete. Finish the context, PRD, test spec, workboard, and rounds artifacts before stopping for user review.`,
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

    if (!readResumeTarget(state)) {
      const closeout = await readFinalCloseoutArtifacts(cwd);
      if (closeout.status === 'final_closeout') {
        const acceptance = await summarizeAcceptance({
          cwd,
          sliceId: FINAL_CLOSEOUT_SLICE_ID,
          roles: FINAL_CLOSEOUT_ROLES,
        });
        if (finalCloseoutAccepted(acceptance)) {
          return {
            decision: 'block',
            reason: `oh-my-ralpha ${scope} mode has completed workboard/rounds artifacts and ${FINAL_CLOSEOUT_SLICE_ID} already has four independent PASS verdicts (${finalCloseoutRoleList()}). Do not rerun review or edit code. The leader/main thread should only record terminal completion with active:false,current_phase:"complete" and then clear ralpha state after final artifacts are synced.`,
          };
        }

        const blockerHint = acceptance.gate.has_blocking_reviewer_verdict
          ? ' Existing FINAL-CLOSEOUT reviewer CHANGES/REJECT verdicts are blocking; fix them, rerun fresh proof, then rerun all four final lanes.'
          : ' FINAL-CLOSEOUT is not accepted yet.';
        return {
          decision: 'block',
          reason: `oh-my-ralpha ${scope} mode has no active slice or next_todo, and the latest workboard/rounds show all TODOs complete (${closeout.todoPath}; ${closeout.roundsPath}). Start the final-closeout gate instead of continuing normal TODO work: run four independent read-only deep reviews for ${FINAL_CLOSEOUT_SLICE_ID} with roles ${finalCloseoutRoleList()}. All four latest verdicts must be PASS before clearing state.${blockerHint}`,
        };
      }
    }

    return {
      decision: 'block',
      reason: `oh-my-ralpha ${scope} mode is still active (${phase || 'executing'}). Continue working. Only decision-complete planning may stop with current_phase:"awaiting_plan_review"; execution slices must continue, fix blockers, use approved degraded paths, or finish closeout. Stop protection is not a substitute for fresh evidence, mandatory architect/code-reviewer/code-simplifier acceptance, final deslop, or post-deslop regression.`,
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
