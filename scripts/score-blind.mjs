#!/usr/bin/env node
// Score the answer engine on the blind question set (tests/ask-blind/blind-set.json).
//   node scripts/score-blind.mjs [--out report.json] [--label "first run at <commit>"]
// Outcomes per question:
//   correct   — expected an answer and got one about the gold companies, figure and period
//               (or expected a non-answer and got one);
//   partial   — the right companies, figure and period, but a different presentation (for example a single
//               year where a change was asked); never a different figure;
//   wrong     — answered about other companies, another figure or another period, or answered when the gold
//               says it must not (off-target is worse than not found);
//   abstained — expected an answer and got a non-answer.
import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {answerQuestion} from '../web/ask-engine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const out = opt('--out'), label = opt('--label');
const set = JSON.parse(fs.readFileSync(path.join(root, 'tests/ask-blind/blind-set.json'), 'utf8'));
const bundle = JSON.parse(fs.readFileSync(path.join(root, 'web/data/research.json'), 'utf8'));
const STATUS = {answered: 'answer', not_in_bundle: 'not_in_bundle', refused: 'refuse', clarify: 'clarify'};
const IDS = new Set(['revenue', 'net_income', 'operating_income', 'operating_cash_flow', 'assets', 'liabilities', 'current_assets', 'current_liabilities', 'cash', 'capex', 'operating_margin', 'net_margin', 'cash_margin', 'current_ratio', 'liabilities_assets', 'cash_coverage', 'accruals', 'revenue_growth', 'cash_conversion', 'free_cash_flow', 'profit_cash_gap', 'anomaly_score']);
const NUMBER_TOPICS = new Set(['metric', 'ratio', 'trend', 'change', 'compare', 'rank']);
const latestFY = t => `FY${bundle.snapshots.at(-1).companies[t].at(-1).period_end.slice(0, 4)}`;

function judge(g) {
  const a = answerQuestion(g.q, bundle);
  const got = STATUS[a.status];
  const expect = Array.isArray(g.expect) ? g.expect : [g.expect];
  const why = [];
  if (!expect.includes('answer')) {
    if (got === 'answer') return {outcome: 'wrong', why: ['answered a question that must not be answered'], a};
    return {outcome: 'correct', strict: expect.includes(got), a, why};
  }
  if (got !== 'answer') return {outcome: expect.includes(got) ? 'correct' : 'abstained', a, why: [`${a.status}/${a.topic}`]};
  // Answered: same companies, figure and period?
  const gt = g.tickers || [], pt = a.plan.tickers || [];
  if (gt.length && !(gt.length === pt.length && gt.every(t => pt.includes(t)))) why.push(`tickers ${pt.join(',') || '—'} ≠ ${gt.join(',')}`);
  if (!gt.length && pt.length && !['anomaly'].includes(g.topic)) why.push(`tickers ${pt.join(',')} ≠ all six`);
  if (g.metric && IDS.has(g.metric) && a.plan.metric !== g.metric && !(g.topic === 'cash_support' && a.topic === 'cash_support')) why.push(`metric ${a.plan.metric} ≠ ${g.metric}`);
  const gp = g.period, pp = a.plan.period;
  if (gp && !['trend'].includes(g.topic) && !['trend'].includes(a.topic)) {
    const fyOk = /^FY\d{4}$/.test(gp) && (pp === gp || (pp === 'latest' && gt.length === 1 && latestFY(gt[0]) === gp));
    const latestOk = gp === 'latest' && (pp === 'latest' || pp == null || (gt.length === 1 && pp === latestFY(gt[0])));
    const ytdOk = gp === 'ytd' && pp === 'ytd';
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(gp) && pp === gp;
    if (!(fyOk || latestOk || ytdOk || dateOk || pp === gp)) why.push(`period ${pp} ≠ ${gp}`);
  }
  if (why.length) return {outcome: 'wrong', a, why};
  const sameTopic = a.topic === g.topic || (NUMBER_TOPICS.has(g.topic) && ['metric', 'ratio'].includes(g.topic) && ['metric', 'ratio'].includes(a.topic));
  if (!sameTopic) {
    const family = (NUMBER_TOPICS.has(g.topic) && NUMBER_TOPICS.has(a.topic)) || (['ytd', 'bridge', 'change'].includes(g.topic) && ['ytd', 'bridge', 'change'].includes(a.topic) && pp === 'ytd');
    return {outcome: family ? 'partial' : 'wrong', a, why: [`topic ${a.topic} ≠ ${g.topic}`]};
  }
  return {outcome: 'correct', a, why};
}

const rows = set.map(g => { const j = judge(g); return {id: g.id, q: g.q, lang: g.lang, style: g.style, expect: g.expect, topic: g.topic, gold: {tickers: g.tickers, metric: g.metric, period: g.period}, got: {status: j.a.status, topic: j.a.topic, plan: j.a.plan}, outcome: j.outcome, strict_status: j.strict ?? null, why: j.why, summary: j.a.summary}; });
const count = list => list.reduce((m, r) => (m[r.outcome] = (m[r.outcome] || 0) + 1, m), {correct: 0, partial: 0, wrong: 0, abstained: 0});
const shouldAnswer = rows.filter(r => (Array.isArray(r.expect) ? r.expect : [r.expect]).includes('answer') && !Array.isArray(r.expect));
const mustNot = rows.filter(r => !(Array.isArray(r.expect) ? r.expect : [r.expect]).includes('answer'));
const ambiguous = rows.filter(r => Array.isArray(r.expect) && r.expect.includes('answer'));
const byTopic = {};
for (const r of rows) (byTopic[r.topic] ||= []).push(r);
let commit = null, setCommit = null;
try { commit = execSync('git rev-parse --short HEAD', {cwd: root}).toString().trim(); setCommit = execSync('git log -1 --format=%h -- tests/ask-blind/blind-set.json', {cwd: root}).toString().trim(); } catch { /* not a checkout */ }
const report = {
  label: label || 'blind-set run', engine_commit: commit, set_commit: setCommit, dataset_sha256: bundle.dataset_sha256, bundle_as_of: bundle.as_of,
  set: {records: rows.length, written_by: 'a separate model (Sonnet) from tests/ask-blind/BLIND_SCOPE.md only', synthetic: true},
  totals: count(rows),
  should_answer: {records: shouldAnswer.length, ...count(shouldAnswer)},
  must_not_answer: {records: mustNot.length, ...count(mustNot), strict_status_match: mustNot.filter(r => r.strict_status).length},
  ambiguous: {records: ambiguous.length, ...count(ambiguous)},
  by_topic: Object.fromEntries(Object.entries(byTopic).map(([k, v]) => [k, count(v)])),
  by_style: {plain: count(rows.filter(r => r.style === 'plain')), colloquial: count(rows.filter(r => r.style === 'colloquial'))},
  rows
};
const text = JSON.stringify(report, null, 2) + '\n';
if (out) fs.writeFileSync(out, text);
const {rows: _, ...head} = report;
process.stdout.write(JSON.stringify(head, null, 2) + '\n');
