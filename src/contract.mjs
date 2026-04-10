export const OH_MY_RALPHA_STATE_DEFAULTS = Object.freeze({
  mode: 'oh-my-ralpha',
  iteration: 1,
  maxIterations: 40,
  currentPhase: 'executing',
});

export const OH_MY_RALPHA_TEAM_LANES = Object.freeze([
  'analyst',
  'architect',
  'team-executor',
  'code-simplifier',
  'code-reviewer',
]);

export const OH_MY_RALPHA_REQUIRED_TRUTH_SOURCES = Object.freeze([
  '.codex/oh-my-ralpha/working-model/context/{task-slug}-{timestamp}.md',
  '.codex/oh-my-ralpha/working-model/state/{task-slug}-todo.md',
  '.codex/oh-my-ralpha/working-model/state/{task-slug}-rounds.json',
]);

export function validateRoundsLedger(ledger) {
  if (!ledger || typeof ledger !== 'object') return false;
  if (ledger.task !== 'oh-my-ralpha') return false;
  if (!Array.isArray(ledger.completed_todos)) return false;
  if (!Array.isArray(ledger.remaining_todos)) return false;
  if (!ledger.verification_evidence || typeof ledger.verification_evidence !== 'object') return false;
  return true;
}
