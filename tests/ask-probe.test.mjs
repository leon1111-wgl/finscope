// The developer's own probe (read by hand), kept as a regression check. Not a measurement.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {answerQuestion} from '../web/ask-engine.js';

const bundle = JSON.parse(fs.readFileSync(new URL('../web/data/research.json', import.meta.url)));
const {cases} = JSON.parse(fs.readFileSync(new URL('./ask-probe.json', import.meta.url)));
test('own probe keeps its read-by-hand status and topic', () => {
  const changed = cases.map(c => [c, answerQuestion(c.q, bundle)]).filter(([c, a]) => a.status !== c.status || a.topic !== c.topic).map(([c, a]) => `${c.q}: ${a.status}/${a.topic}`);
  assert.deepEqual(changed, []);
});
