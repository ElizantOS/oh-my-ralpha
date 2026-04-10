import { join } from 'node:path';
import { detectOhMyRalpha, detectPrimaryKeyword, isUnderspecifiedForExecution } from './keywords.mjs';
import { isPlanningComplete } from './planning.mjs';
import { writeJson } from './json-file.mjs';
import { omxStateDir } from './paths.mjs';
import { writeModeState } from './state.mjs';
import { appendTraceEvent } from './trace.mjs';

export function getSkillActiveStatePath(cwd, sessionId) {
  if (sessionId) {
    return join(omxStateDir(cwd), 'sessions', sessionId, 'skill-active-state.json');
  }
  return join(omxStateDir(cwd), 'skill-active-state.json');
}

export async function recordSkillActivation({
  cwd,
  text,
  sessionId,
  threadId,
  turnId,
  nowIso = new Date().toISOString(),
}) {
  const match = detectPrimaryKeyword(text);
  if (!match) return null;

  const state = {
    version: 1,
    active: true,
    skill: match.skill,
    keyword: match.keyword,
    phase: 'planning',
    activated_at: nowIso,
    updated_at: nowIso,
    source: 'oh-my-ralpha-router',
    session_id: sessionId,
    thread_id: threadId,
    turn_id: turnId,
    active_skills: [{
      skill: match.skill,
      phase: 'planning',
      active: true,
      activated_at: nowIso,
      updated_at: nowIso,
      session_id: sessionId,
      thread_id: threadId,
      turn_id: turnId,
    }],
  };

  await writeJson(getSkillActiveStatePath(cwd, sessionId), state);

  if (match.skill === 'oh-my-ralpha') {
    await writeModeState({
      cwd,
      mode: 'oh-my-ralpha',
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
  const match = detectOhMyRalpha(text);
  if (!match) {
    return { matched: false, gateApplied: false, finalSkill: null };
  }

  const planningComplete = await isPlanningComplete(cwd);
  const gateApplied = isUnderspecifiedForExecution(text);
  const finalSkill = gateApplied ? 'ralplan' : 'oh-my-ralpha';

  let activation = null;
  if (activate && !gateApplied) {
    activation = await recordSkillActivation({
      cwd,
      text,
      sessionId,
      threadId,
      turnId,
    });
  }

  return {
    matched: true,
    detected: match,
    planningComplete,
    gateApplied,
    finalSkill,
    activation,
  };
}
