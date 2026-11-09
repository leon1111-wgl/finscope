// The blind set has been read (first run kept at docs/validation/ask-blind-first-run-ac0afc4.json).
// This guards the recorded seen rerun: the engine must reproduce every outcome, and never answer a must-not question.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scoreBlind} from '../scripts/score-blind.mjs';

test('the engine reproduces the recorded seen rerun of the blind set', () => {
  const recorded = JSON.parse(fs.readFileSync(new URL('../docs/validation/ask-blind-seen-rerun.json', import.meta.url)));
  const now = scoreBlind();
  const view = r => [r.id, r.outcome, r.got.status, r.got.topic, JSON.stringify(r.got.plan)];
  assert.deepEqual(now.rows.map(view), recorded.rows.map(view));
  assert.equal(now.must_not_answer.wrong, 0);
  const first = JSON.parse(fs.readFileSync(new URL('../docs/validation/ask-blind-first-run-ac0afc4.json', import.meta.url)));
  assert.equal(first.engine_commit, 'ac0afc4');
  assert.deepEqual(first.totals, {correct: 127, partial: 3, wrong: 7, abstained: 8});
});
