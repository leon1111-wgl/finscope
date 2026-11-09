// The developer's own probe (read by hand), kept as a regression check. Not a measurement.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {answerQuestion} from '../web/ask-engine.js';

const bundle = JSON.parse(fs.readFileSync(new URL('../web/data/research.json', import.meta.url)));
const cases = ['./ask-probe.json', './ask-review-probe.json', './ask-main-probe.json'].flatMap(f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url))).cases);
test('own, reviewer and main-session probes keep their read-by-hand status, topic and figure', () => {
  const changed = cases.map(c => [c, answerQuestion(c.q, bundle)]).filter(([c, a]) => a.status !== c.status || a.topic !== c.topic || ('metric' in c && (a.plan.metric ?? null) !== c.metric)).map(([c, a]) => `${c.q}: ${a.status}/${a.topic}`);
  assert.deepEqual(changed, []);
});
