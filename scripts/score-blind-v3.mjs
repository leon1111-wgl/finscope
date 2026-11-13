#!/usr/bin/env node
// Score Ask the ledger on the 0.3.0 blind set (tests/ask-blind-v3/blind-set.json) by the rules fixed in
// tests/ask-blind-v3/SCORING.md before the set was written. Answers come from the page's engine with the universe
// loaded from disk, exactly as the page loads it.
//   node scripts/score-blind-v3.mjs [--out report.json] [--label "first run at <commit>"]
import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {answerQuestion, planQuestion} from '../web/ask-engine.js';
import {universeFromDisk} from './universe-disk.mjs';
import {entryOf, primary, indicator, periodIndex, isFigure} from '../web/universe-data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATUS = {answered: 'answer', not_in_bundle: 'not_in_bundle', refused: 'refuse', clarify: 'clarify'};
const FAMILY = new Set(['metric', 'ratio', 'compare', 'trend', 'change', 'figures']);
const SAME = {ratio: 'metric', rank: 'rank_six'};
const topicOf = t => SAME[t] || t;

export function scoreBlindV3({label = 'blind-set v3 run', set = JSON.parse(fs.readFileSync(path.join(root, 'tests/ask-blind-v3/blind-set.json'), 'utf8')),
  bundle = JSON.parse(fs.readFileSync(path.join(root, 'web/data/research.json'), 'utf8')), disk = universeFromDisk(path.join(root, 'web/data/universe'))} = {}) {
  const prepared = disk.prepared;
  const mapTicker = t => { const e = entryOf(prepared, String(t || '').replace('.', '-')); return e ? primary(e) : null; };
  const shardOf = t => { const e = entryOf(prepared, t); return e ? disk.shard(e.c) : null; };
  // Does the data hold the gold figure for the gold company and period? (Rule 2.)
  function available(g, tickers) {
    if (!g.metric || !['metric', 'figures', 'trend', 'change', 'compare'].includes(g.topic)) return true;
    const known = isFigure(g.metric) || ['gross_margin', 'operating_margin', 'net_margin', 'rnd_intensity', 'cash_margin', 'free_cash_flow', 'fcf_margin', 'cash_conversion', 'accruals', 'profit_cash_gap', 'current_ratio', 'cash_coverage',
      'liabilities_assets', 'debt_to_equity', 'interest_coverage', 'roe', 'roa', 'revenue_growth', 'payout'].includes(g.metric);
    if (!known) return true;
    return tickers.some(t => {
      const shard = shardOf(t);
      if (!shard) return false;
      let idx = [shard.periods.length - 1];
      if (/^FY\d{4}$/.test(g.period || '')) { const i = periodIndex(shard, Number(g.period.slice(2))); idx = i >= 0 ? [i] : []; }
      if (/^last\d+$/.test(g.period || '')) idx = shard.periods.map((_, i) => i).slice(-Number(g.period.slice(4)));
      return idx.some(i => indicator(shard, g.metric, i).value !== null);
    });
  }
  function judge(g) {
    const expect0 = Array.isArray(g.expect) ? g.expect : [g.expect];
    const gold = (g.tickers || []).map(t => ({raw: t, mapped: mapTicker(t)}));
    const outside = gold.some(x => !x.mapped);
    const tickers = gold.map(x => x.mapped).filter(Boolean);
    let expect = expect0, adjusted = null;
    if (outside && expect0.includes('answer')) { expect = ['not_in_bundle']; adjusted = 'outside the universe at scoring time'; }
    else if (expect0.length === 1 && expect0[0] === 'answer' && !available(g, tickers)) { expect = ['not_in_bundle', 'answer']; adjusted = 'figure not held for the gold company and period'; }
    const universe = disk.contextFor(planQuestion(g.q, bundle, {universe: disk.base}));
    const a = answerQuestion(g.q, bundle, {universe});
    const got = STATUS[a.status];
    const why = [];
    const planOk = () => {
      const pt = a.plan.tickers || [];
      if (tickers.length && !(tickers.length === pt.length && tickers.every(t => pt.includes(t)))) why.push(`tickers ${pt.join(',') || '—'} ≠ ${tickers.join(',')}`);
      const gm = g.metric, pm = a.plan.metric;
      if (gm && pm !== gm && !(g.topic === 'cash_support' && a.topic === 'cash_support') && !(gm === 'revenue_growth' && pm === 'revenue' && a.topic === 'change')) why.push(`metric ${pm} ≠ ${gm}`);
      const gp = g.period, pp = a.plan.period;
      if (gp && !['ytd', 'bridge', 'rates', 'anomaly'].includes(g.topic)) {
        const one = tickers.length === 1 ? shardOf(tickers[0]) : null;
        const latestFy = one ? `FY${one.periods.at(-1).fy}` : null;
        const ok = pp === gp || (gp === 'latest' && (pp === 'latest' || pp == null || pp === latestFy)) || (/^FY\d{4}$/.test(gp) && pp === 'latest' && latestFy === gp) ||
          (/^last\d+$/.test(gp) && (pp === gp || (a.plan.years && (a.plan.years.length === Number(gp.slice(4)) || (one && a.plan.years.length === one.periods.length)))));
        if (!ok) why.push(`period ${pp} ≠ ${gp}`);
      }
    };
    if (!expect.includes('answer')) {
      if (got === 'answer') return {outcome: 'wrong', why: ['answered a question that must not be answered'], a, expect, adjusted};
      if (adjusted === null && expect0.length === 1 && got === 'not_in_bundle' && g.metric) planOk();
      return {outcome: 'correct', strict: expect.includes(got), a, expect, adjusted, why};
    }
    if (got !== 'answer') {
      if (expect.includes(got)) {
        if (adjusted === 'figure not held for the gold company and period') { planOk(); if (why.length) return {outcome: 'abstained', a, expect, adjusted, why}; }
        return {outcome: 'correct', a, expect, adjusted, why};
      }
      return {outcome: 'abstained', a, expect, adjusted, why: [`${a.status}/${a.topic}`]};
    }
    planOk();
    if (why.length) return {outcome: 'wrong', a, expect, adjusted, why};
    const gt = topicOf(g.topic), at = topicOf(a.topic);
    if (gt && gt !== at && !(gt === 'metric' && at === 'metric')) {
      const fam = FAMILY.has(gt) && FAMILY.has(at);
      const cash = gt === 'cash_support' && ['metric', 'compare'].includes(at) && ['cash_conversion', 'net_income', 'operating_cash_flow'].includes(a.plan.metric);
      return {outcome: fam || cash ? 'partial' : 'wrong', a, expect, adjusted, why: [`topic ${a.topic} ≠ ${g.topic}`]};
    }
    return {outcome: 'correct', a, expect, adjusted, why};
  }
  const rows = set.map(g => {
    const j = judge(g);
    return {id: g.id, q: g.q, lang: g.lang, style: g.style, pair: g.pair, expect: g.expect, scored_expect: j.expect, adjusted: j.adjusted, topic: g.topic,
      gold: {tickers: g.tickers, metric: g.metric, period: g.period}, got: {status: j.a.status, topic: j.a.topic, plan: j.a.plan, engine: j.a.engine?.data || 'deep'},
      outcome: j.outcome, strict_status: j.strict ?? null, why: j.why, summary: j.a.summary};
  });
  const count = list => list.reduce((m, r) => (m[r.outcome] = (m[r.outcome] || 0) + 1, m), {correct: 0, partial: 0, wrong: 0, abstained: 0});
  const ambiguous = rows.filter(r => Array.isArray(r.expect) && r.expect.length > 1);
  const plain = rows.filter(r => !ambiguous.includes(r));
  const shouldAnswer = plain.filter(r => r.scored_expect.includes('answer') && r.scored_expect.length === 1);
  const heldOut = plain.filter(r => r.adjusted === 'figure not held for the gold company and period');
  const mustNot = plain.filter(r => !r.scored_expect.includes('answer'));
  const by = key => Object.fromEntries([...new Set(rows.map(r => r[key]))].map(k => [k, count(rows.filter(r => r[key] === k))]));
  let commit = null, setCommit = null, dataCommit = null;
  try {
    commit = execSync('git rev-parse --short HEAD', {cwd: root}).toString().trim();
    setCommit = execSync('git log -1 --format=%h -- tests/ask-blind-v3/blind-set.json', {cwd: root}).toString().trim();
    dataCommit = execSync('git log -1 --format=%h -- web/data/universe/index.json', {cwd: root}).toString().trim();
  } catch { /* not a checkout */ }
  return {
    label, engine_commit: commit, set_commit: setCommit, universe_data_commit: dataCommit, universe_built: disk.index.built, rules: 'tests/ask-blind-v3/SCORING.md',
    set: {records: rows.length, written_by: 'a separate model (Sonnet) from tests/ask-blind-v3/BLIND_SCOPE.md only', synthetic: true},
    totals: count(plain),
    should_answer: {records: shouldAnswer.length, ...count(shouldAnswer)},
    figure_not_held: {records: heldOut.length, ...count(heldOut)},
    must_not_answer: {records: mustNot.length, ...count(mustNot), strict_status_match: mustNot.filter(r => r.strict_status).length},
    outside_universe_at_scoring: rows.filter(r => r.adjusted === 'outside the universe at scoring time').map(r => r.id),
    ambiguous: {records: ambiguous.length, ...count(ambiguous)},
    by_topic: by('topic'), by_style: by('style'), by_lang: by('lang'),
    wrong: rows.filter(r => r.outcome === 'wrong').map(r => ({id: r.id, q: r.q, why: r.why, got: r.got})),
    rows
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
  const report = scoreBlindV3({label: opt('--label') || 'blind-set v3 run'});
  if (opt('--out')) fs.writeFileSync(opt('--out'), JSON.stringify(report, null, 2) + '\n');
  const {rows: _, wrong, ...head} = report;
  process.stdout.write(JSON.stringify({...head, wrong_count: wrong.length}, null, 2) + '\n');
}
