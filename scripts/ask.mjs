#!/usr/bin/env node
// Run visitors' questions through exactly the page's answer engine (web/ask-engine.js), without a browser.
//
//   node scripts/ask.mjs questions.json            # a JSON array of strings or {"id","q"} objects
//   node scripts/ask.mjs questions.txt             # one question per line
//   node scripts/ask.mjs --q "NVDA 的利润有现金流支撑吗"
//   node scripts/ask.mjs questions.json --date 2024-06-30 --full
//
//   node scripts/ask.mjs --q "可口可乐 2024 年的毛利率"      # any company in the universe
//   node scripts/ask.mjs questions.json --no-universe            # the six-company deep ledger only (0.2.0 behaviour)
//
// Prints a JSON array: each answer's status, engine, summary, table, calculations and cited sources.
// No model loads and nothing leaves this machine; the data is web/data/research.json and web/data/universe/.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {answerQuestion, answerSources, planQuestion} from '../web/ask-engine.js';
import {universeFromDisk} from './universe-disk.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const single = opt('--q'), date = opt('--date'), bundlePath = opt('--bundle') || path.join(root, 'web/data/research.json');
const full = flag('--full'), noUniverse = flag('--no-universe');
if (!single && !args.length) {
  console.error('Usage: node scripts/ask.mjs <questions.json|questions.txt> [--date YYYY-MM-DD] [--full] | --q "question"');
  process.exit(2);
}
let questions;
if (single) questions = [{id: 'q1', q: single}];
else {
  const raw = fs.readFileSync(args[0], 'utf8');
  if (/\.json$/i.test(args[0])) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('The JSON file must hold an array of questions.');
    questions = parsed.map((x, i) => typeof x === 'string' ? {id: `q${i + 1}`, q: x} : {id: x.id ?? `q${i + 1}`, q: x.q ?? x.question});
  } else questions = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map((q, i) => ({id: `q${i + 1}`, q}));
}
const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
const disk = noUniverse ? null : universeFromDisk(path.join(root, 'web/data/universe'));
const out = questions.map(({id, q}) => {
  const universe = disk ? disk.contextFor(planQuestion(q, bundle, {universe: disk.base})) : undefined;
  const a = answerQuestion(q, bundle, {date: date || undefined, universe});
  const row = {
    id, question: q, status: a.status, topic: a.topic, engine: a.engine.label, info_date: a.info_date,
    plan: a.plan, answer: a.summary,
    calculations: a.calculations.map(c => `${c.label}: ${c.formula} = ${c.result}`),
    sources: a.facts.map(f => ({figure: f.label, ticker: f.ticker, value: f.display, exact: f.exact_usd ?? f.display, period: f.period_start ? `${f.period_start} → ${f.period_end}` : f.period_end, fiscal_year: f.fiscal_year ?? null, form: f.form, tag: f.tag, how: f.via ?? null, filed: f.filed, accession: f.accession, url: f.url})),
    notes: a.notes, offers: a.offers
  };
  if (a.table) row.table = full ? a.table : {columns: a.table.columns, rows: a.table.rows.length};
  if (full) row.documents = answerSources(a);
  return row;
});
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
