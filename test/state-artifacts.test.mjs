import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateRoundsLedger } from '../src/contract.mjs';

const contextSnapshot = readFileSync(
  join(process.cwd(), '.codex/oh-my-ralpha/examples/context/oh-my-ralpha-20260410T075348Z.md'),
  'utf-8',
);
const todoLedger = readFileSync(
  join(process.cwd(), '.codex/oh-my-ralpha/examples/state/oh-my-ralpha-todo.md'),
  'utf-8',
);
const roundsLedger = JSON.parse(
  readFileSync(join(process.cwd(), '.codex/oh-my-ralpha/examples/state/oh-my-ralpha-rounds.json'), 'utf-8'),
);

describe('oh-my-ralpha truth-source examples', () => {
  it('includes a usable context snapshot example', () => {
    assert.match(contextSnapshot, /Task statement:/);
    assert.match(contextSnapshot, /Desired outcome:/);
    assert.match(contextSnapshot, /Likely codebase touchpoints:/);
  });

  it('ships a completed workboard example', () => {
    for (const id of ['R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06']) {
      assert.match(todoLedger, new RegExp(`## \`${id}\``));
    }
    assert.doesNotMatch(todoLedger, /`status`: pending/);
    assert.doesNotMatch(todoLedger, /`status`: in_progress/);
  });

  it('ships a completed rounds ledger example', () => {
    assert.equal(validateRoundsLedger(roundsLedger), true);
    assert.equal(roundsLedger.final_verdict, 'APPROVED');
    assert.equal(roundsLedger.next_todo, null);
    assert.deepEqual(roundsLedger.remaining_todos, []);
    assert.match(roundsLedger.verification_evidence.skill_validation, /repo-skill-ok/);
    assert.match(roundsLedger.verification_evidence.runtime_assertions, /\$ralpha/);
    assert.match(roundsLedger.verification_evidence.runtime_assertions, /resolves to ralpha/);
    assert.match(roundsLedger.verification_evidence.runtime_assertions, /natural-language continuation phrases do not activate/);
  });
});
