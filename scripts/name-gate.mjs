#!/usr/bin/env node
// The all-company name gate (0.3.2, pre-registered in docs/validation/NAME_GATE.md before any fix):
// for every company in the universe, ask "<natural name> revenue" and check which company the answer resolves to.
//   node scripts/name-gate.mjs [--out report.json] [--label "first run at <commit>"]
import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {answerQuestion, planQuestion} from '../web/ask-engine.js';
import {universeFromDisk} from './universe-disk.mjs';
import {primary} from '../web/universe-data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGAL = /[,.]?\s+(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|l\.l\.c|lp|l\.p|nv|n\.v|sa|s\.a)\.?$/i;
const STATE = /\s*(\/[A-Za-z]{2,4}\/?|\\[A-Za-z]{2}\\|\([A-Z]{2}\)|\/)\s*$/;
const cap = w => w.split('-').map(p => p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p).join('-');

// The SEC name without "/TX", "/DE/", "/NEW/", "(DE)" and the legal suffix; an all-caps name is title-cased, and also
// tried with its words of three letters or fewer kept as acronyms ("RPM International"). Both forms must resolve.
export function naturalNames(sec) {
  let n = String(sec || '').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 6; i++) {
    const m = n.replace(STATE, '').replace(LEGAL, '').replace(/[\s,.]+$/, '').trim();
    if (m === n) break;
    n = m;
  }
  if (!/[A-Z]/.test(n) || n !== n.toUpperCase()) return [n];
  const words = n.split(' ');
  const title = words.map(cap).join(' ');
  const acronym = words.map(w => /^[A-Z]{1,3}$/.test(w) ? w : cap(w)).join(' ');
  return [...new Set([title, acronym])];
}

// Named probes: words in company names that once hit a topic route, and the refusals that must still hold.
export const PROBES = [
  ['T Rowe Price net income', {ticker: 'TROW'}], ['T. Rowe Price revenue', {ticker: 'TROW'}], ['Best Buy revenue', {ticker: 'BBY'}],
  ['Weatherford revenue', {ticker: 'WFRD'}], ['MoonLake revenue', {ticker: 'MLTX'}], ['TTM Technologies revenue', {ticker: 'TTMI'}],
  ['Q2 Holdings revenue', {ticker: 'QTWO'}], ['Burlington revenue', {ticker: 'BURL'}],
  ['Is Best Buy a buy?', {status: 'refused'}], ['should I buy Target stock', {status: 'refused'}], ['Best Buy stock price', {status: 'refused'}],
  ['Will Best Buy revenue grow next year?', {status: 'refused'}]
];

export function nameGate({label = 'name gate run', disk = universeFromDisk(path.join(root, 'web/data/universe')),
  bundle = JSON.parse(fs.readFileSync(path.join(root, 'web/data/research.json'), 'utf8'))} = {}) {
  const ask = q => answerQuestion(q, bundle, {universe: disk.contextFor(planQuestion(q, bundle, {universe: disk.base}))});
  const companies = disk.index.companies.map(e => ({entry: e, ticker: primary(e), names: naturalNames(disk.shard(e.c).name)}));
  // A natural name that two companies share may clarify instead, if the clarification lists the company.
  const owners = new Map();
  for (const c of companies) for (const n of c.names) { const k = n.toLowerCase(); owners.set(k, new Set([...(owners.get(k) || []), c.entry.c])); }
  const judge = (c, name) => {
    const a = ask(`${name} revenue`);
    const got = a.plan?.tickers || [];
    const ambiguous = owners.get(name.toLowerCase()).size > 1;
    let outcome;
    if (got.length === 1 && got[0] === c.ticker) outcome = 'correct';
    else if (a.topic === 'out_of_universe') outcome = 'false_outside';
    else if (got.length && (!got.includes(c.ticker) || got.length > 1)) outcome = 'wrong_company';
    else if (ambiguous && a.status === 'clarify' && (a.candidates || []).includes(c.ticker)) outcome = 'clarify_listed';
    else outcome = 'miss';
    return {name, outcome, ambiguous, status: a.status, topic: a.topic, got, candidates: a.candidates || null, summary: (a.summary || '').slice(0, 160)};
  };
  const rows = companies.map(c => {
    const tries = c.names.map(n => judge(c, n));
    const worst = ['wrong_company', 'false_outside', 'miss', 'clarify_listed', 'correct'].find(o => tries.some(t => t.outcome === o));
    return {cik: c.entry.c, ticker: c.ticker, outcome: worst, tries};
  });
  const probes = PROBES.map(([q, want]) => {
    const a = ask(q);
    const ok = want.ticker ? (a.plan?.tickers || []).length === 1 && a.plan.tickers[0] === want.ticker && a.status !== 'refused' : a.status === want.status;
    return {q, want, ok, status: a.status, topic: a.topic, got: a.plan?.tickers || []};
  });
  const count = o => rows.filter(r => r.outcome === o).length;
  const totals = {companies: rows.length, correct: count('correct'), clarify_listed: count('clarify_listed'), wrong_company: count('wrong_company'), false_outside: count('false_outside'), miss: count('miss')};
  const bar = {wrong_company_zero: totals.wrong_company === 0, false_outside_zero: totals.false_outside === 0, misses_at_most_1pct: totals.miss <= Math.floor(rows.length * 0.01),
    named_probes_all_hold: probes.every(p => p.ok)};
  let commit = null, dataCommit = null;
  try {
    commit = execSync('git rev-parse --short HEAD', {cwd: root}).toString().trim();
    dataCommit = execSync('git log -1 --format=%h -- web/data/universe/index.json', {cwd: root}).toString().trim();
  } catch { /* not a checkout */ }
  return {label, protocol: 'docs/validation/NAME_GATE.md', engine_commit: commit, universe_data_commit: dataCommit, universe_built: disk.index.built, totals, pass_bar: bar,
    passed: Object.values(bar).every(Boolean), probes, failures: rows.filter(r => !['correct', 'clarify_listed'].includes(r.outcome)), rows};
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
  const report = nameGate({label: opt('--label') || 'name gate run'});
  if (opt('--out')) fs.writeFileSync(opt('--out'), JSON.stringify(report, null, 1) + '\n');
  const {rows: _, failures, probes, ...head} = report;
  process.stdout.write(JSON.stringify({...head, probes_failed: probes.filter(p => !p.ok).map(p => `${p.q} → ${p.status}/${p.topic} ${p.got}`), failures: failures.length}, null, 1) + '\n');
}
