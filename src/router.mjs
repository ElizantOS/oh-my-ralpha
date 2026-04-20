import { join } from 'node:path';
import { detectPrimaryKeyword, detectRalpha, isUnderspecifiedForExecution } from './keywords.mjs';
import { readPlanningArtifacts } from './planning.mjs';
import { writeJson } from './json-file.mjs';
import { workingModelStateDir } from './paths.mjs';
import { writeModeState } from './state.mjs';
import { appendTraceEvent } from './trace.mjs';

export function getSkillActiveStatePath(cwd, sessionId) {
  if (sessionId) {
    return join(workingModelStateDir(cwd), 'sessions', sessionId, 'skill-active-state.json');
  }
  return join(workingModelStateDir(cwd), 'skill-active-state.json');
}

export async function recordSkillActivation({
  cwd,
  text,
  sessionId,
  threadId,
  turnId,
  phase = 'execution',
  nowIso = new Date().toISOString(),
}) {
  const match = detectPrimaryKeyword(text);
  if (!match) return null;

  const state = {
    version: 1,
    active: true,
    skill: match.skill,
    keyword: match.keyword,
    phase,
    activated_at: nowIso,
    updated_at: nowIso,
    source: 'oh-my-ralpha-router',
    session_id: sessionId,
    thread_id: threadId,
    turn_id: turnId,
    active_skills: [{
      skill: match.skill,
      phase,
      active: true,
      activated_at: nowIso,
      updated_at: nowIso,
      session_id: sessionId,
      thread_id: threadId,
      turn_id: turnId,
    }],
  };

  await writeJson(getSkillActiveStatePath(cwd, sessionId), state);

  if (match.skill === 'ralpha' && phase === 'execution') {
    await writeModeState({
      cwd,
      mode: 'ralpha',
      sessionId,
      patch: {
        active: true,
        iteration: 1,
        max_iterations: 40,
        current_phase: 'starting',
        started_at: nowIso,
      },
    });
  }

  await appendTraceEvent({
    cwd,
    type: 'skill-activation',
    metadata: {
      skill: match.skill,
      keyword: match.keyword,
      phase,
      sessionId,
      threadId,
      turnId,
    },
    nowIso,
  });

  return state;
}

export async function routePrompt({
  cwd = process.cwd(),
  text,
  sessionId,
  threadId,
  turnId,
  activate = false,
}) {
  const match = detectRalpha(text);
  if (!match) {
    return {
      matched: false,
      gateApplied: false,
      finalSkill: null,
      phase: null,
      planningArtifactsComplete: false,
      planningArtifacts: null,
    };
  }

  const planningArtifacts = await readPlanningArtifacts(cwd);
  const planningComplete = planningArtifacts.complete;
  const gateApplied = isUnderspecifiedForExecution(text);
  const phase = !gateApplied && planningComplete ? 'execution' : 'planning';
  const finalSkill = phase === 'execution' ? 'ralpha' : 'ralplan';

  let activation = null;
  if (activate) {
    activation = await recordSkillActivation({
      cwd,
      text,
      sessionId,
      threadId,
      turnId,
      phase,
    });
  }

  return {
    matched: true,
    detected: match,
    planningComplete,
    planningArtifactsComplete: planningComplete,
    planningArtifacts,
    gateApplied,
    finalSkill,
    phase,
    activation,
  };
}
