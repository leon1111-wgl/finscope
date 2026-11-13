// The all-company name gate (docs/validation/NAME_GATE.md) as a regression guard: every bar must keep holding.
import test from 'node:test';
import assert from 'node:assert/strict';
import {nameGate, tickerGate} from '../scripts/name-gate.mjs';

test('every universe company is found by its natural name; no wrong company, no false "not in the universe"', () => {
  const report = nameGate({label: 'ci guard'});
  assert.deepEqual(report.failures.map(r => `${r.ticker}: ${r.outcome}`), []);
  assert.deepEqual(report.probes.filter(p => !p.ok).map(p => p.q), []);
  assert.equal(report.passed, true);
});

test('every company with a ticker is found by it, or asked about by name; no wrong company, no false "not in the universe"', () => {
  const report = tickerGate({label: 'ci guard'});
  assert.deepEqual(report.failures.map(r => `${r.ticker}: ${r.outcome} ${r.status}/${r.topic}`), []);
  assert.equal(report.passed, true);
});
