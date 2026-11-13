// The universe path of Ask the ledger (0.3.0): coverage, sources, exactness against the shards, and the matcher.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {answerQuestion, planQuestion, NOT_TICKERS} from '../web/ask-engine.js';
import {universeFromDisk} from '../scripts/universe-disk.mjs';
import {prepareIndex, matchCompanies, entryOf, primary, FIGURES} from '../web/universe-data.js';

const bundle = JSON.parse(fs.readFileSync(new URL('../web/data/research.json', import.meta.url), 'utf8'));
const disk = universeFromDisk(new URL('../web/data/universe', import.meta.url).pathname);
const ask = (q, opts = {}) => answerQuestion(q, bundle, {universe: disk.contextFor(planQuestion(q, bundle, {universe: disk.base})), ...opts});
const coverage = JSON.parse(fs.readFileSync(new URL('./universe-coverage.json', import.meta.url), 'utf8'));
const SEC = /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d{18}\//;

test('coverage: every claimed topic, figure family and refusal, in plain and colloquial wording', () => {
  const bad = [];
  for (const c of coverage) {
    const a = ask(c.q);
    const why = [];
    if (a.status !== c.status) why.push(`status ${a.status}`);
    if (c.topic && a.topic !== c.topic) why.push(`topic ${a.topic}`);
    if (c.tickers && JSON.stringify(a.plan.tickers) !== JSON.stringify(c.tickers)) why.push(`tickers ${a.plan.tickers}`);
    if (c.metric && a.plan.metric !== c.metric) why.push(`metric ${a.plan.metric}`);
    if (c.period && !(a.plan.period === c.period || (c.period === 'latest' && a.plan.period === 'latest'))) why.push(`period ${a.plan.period}`);
    if (why.length) bad.push(`${c.q} → ${why.join(', ')}`);
  }
  assert.deepEqual(bad, []);
  assert.ok(coverage.length >= 90);
});

test('every stated universe figure has an SEC source line; a non-answer states none', () => {
  for (const c of coverage) {
    const a = ask(c.q);
    if (a.status === 'answered' && a.engine.data === 'universe' && !['definition', 'data_quality'].includes(a.topic)) {
      assert.ok(a.facts.length, `${c.q}: no source lines`);
      for (const f of a.facts) {
        assert.match(f.url, SEC, `${c.q}: ${f.url}`);
        assert.match(f.accession, /^\d{10}-\d{2}-\d{6}$/);
        assert.ok(f.tag && f.filed && f.period_end, `${c.q}: incomplete source`);
      }
    }
    if (a.status !== 'answered') assert.equal(a.facts.length, 0, `${c.q}: a non-answer states ${a.facts.length} facts`);
  }
});

const WORDS = {revenue: 'revenue', cost_of_revenue: 'cost of revenue', gross_profit: 'gross profit', operating_income: 'operating income', rnd: 'r&d expense', sga: 'sg&a',
  interest_expense: 'interest expense', pretax_income: 'pretax income', income_tax: 'income tax expense', net_income: 'net income', eps_diluted: 'diluted eps', shares_diluted: 'diluted shares',
  operating_cash_flow: 'operating cash flow', capex: 'capex', dividends: 'dividends paid', buybacks: 'share repurchases', cash: 'cash and cash equivalents', cash_sti: 'cash and short-term investments',
  assets: 'total assets', liabilities: 'total liabilities', equity: 'total equity', current_assets: 'current assets', current_liabilities: 'current liabilities', total_debt: 'total debt',
  net_interest_income: 'net interest income', noninterest_income: 'noninterest income', provision: 'provision for credit losses', deposits: 'total deposits', loans: 'net loans',
  premiums: 'premiums earned', net_investment_income: 'net investment income', real_estate: 'real estate investments'};
const SIX = new Set(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META']);

test('exactness: every figure for a fixed sample of companies states the shard value, or declines when it is missing', () => {
  const sample = disk.index.companies.filter((e, i) => i % 23 === 0 && !SIX.has(e.t[0]) && /^[A-Z]{1,5}$/.test(e.t[0]));
  assert.ok(Object.keys(WORDS).length === Object.keys(FIGURES).length);
  let checked = 0, declined = 0;
  for (const e of sample) {
    const shard = disk.shard(e.c), t = e.t[0];
    for (const i of [shard.periods.length - 1, shard.periods.length - 2].filter(i => i >= 0)) {
      const fy = shard.periods[i].fy;
      for (const [key, words] of Object.entries(WORDS)) {
        // Tickers that are ordinary abbreviations (SO, ON, IT) are read only as a cashtag.
        const a = ask(`${NOT_TICKERS.has(t) || t.length === 1 ? '$' : ''}${t} ${words} FY${fy}`);
        if (!(key in shard.values)) { assert.notEqual(a.status, 'answered', `${t} ${key}`); continue; }
        const cell = shard.values[key][i];
        if (!cell || !('v' in cell)) { assert.notEqual(a.status, 'answered', `${t} ${key} FY${fy} should decline`); declined++; continue; }
        assert.equal(a.status, 'answered', `${t} ${key} FY${fy}: ${a.topic} ${a.summary}`);
        assert.deepEqual([a.plan.tickers[0], a.plan.metric, a.plan.period], [t, key, `FY${fy}`], `${t} ${key} FY${fy}`);
        const f = a.facts.find(x => x.key === key);
        assert.deepEqual([f.value, f.period_end, f.accession], [cell.v, shard.periods[i].end, cell.accn], `${t} ${key} FY${fy}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 1500, `checked ${checked}, declined ${declined}`);
});

test('an earlier information date never answers from the universe (its figures are the latest filings)', () => {
  const early = bundle.snapshots[Math.floor(bundle.snapshots.length / 2)].as_of;
  for (const q of ['KO revenue 2024', 'Apple gross margin', 'Which tag is Walmart revenue from?']) {
    const a = ask(q, {date: early});
    assert.equal(a.status, 'not_in_bundle', q);
    assert.equal(a.topic, 'info_date', q);
    assert.equal(a.facts.length, 0);
  }
});

test('ticker matching: ordinary words are not tickers; lists and capitals are', () => {
  const prepared = prepareIndex(disk.index);
  const tickers = q => matchCompanies(prepared, q, q.toLowerCase()).map(h => primary(prepared.byCik.get(h.cik)));
  assert.deepEqual(tickers('cost of revenue for the company'), []);
  assert.deepEqual(tickers('low margin and now all of it'), []);
  assert.deepEqual(tickers('what is the target price'), []);
  assert.deepEqual(tickers('Target revenue'), ['TGT']);
  assert.deepEqual(tickers('jpm bac wfc c gs ms'), ['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS']);
  assert.deepEqual(tickers('R&D at KO'), ['KO']);
  const ad = ask('AD revenue FY2025');
  if (entryOf(prepared, 'AD')) assert.deepEqual([ad.status, ad.plan.tickers[0], ad.plan.metric], ['answered', 'AD', 'revenue'], 'a capitalised ticker beats the figure phrase it starts');
  assert.equal(ask('Meta ad revenue').status, 'not_in_bundle', 'lower-case ad revenue is still the unsupported figure');
  assert.deepEqual(tickers('$cost revenue'), ['COST']);
  assert.ok(entryOf(prepared, 'brk.b'), 'class tickers with a dot resolve');
});

test('the universe modules have no network, storage or model access', () => {
  for (const file of ['../web/universe-ask.js', '../web/universe-data.js']) {
    const src = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const word of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'WebSocket', 'import(', 'navigator.gpu']) assert.ok(!src.includes(word), `${file}: ${word}`);
  }
});

test('fiscal-year labels follow the company\'s own 10-Ks, not one mistyped filing (probe of b12433a)', () => {
  const crm26 = ask('Salesforce 2026财年营收');
  assert.equal(crm26.status, 'answered');
  assert.equal(crm26.plan.period, 'FY2026');
  assert.match(crm26.summary, /415\.25 亿美元/);
  assert.ok(crm26.notes.some(n => /10-K 自己标为 2025 财年/.test(n)), crm26.notes.join(' | '));
  const crm25 = ask('Salesforce fiscal 2025 revenue');
  assert.equal(crm25.plan.period, 'FY2025');
  assert.match(crm25.summary, /\$37\.90B/);
  assert.ok(!crm25.notes.some(n => /labels this year/.test(n)));
  for (const [q, end] of [['FRT FY2025 net income', '2025-12-31'], ['Huntsman FY2025 revenue', '2025-12-31'], ['Post Holdings FY2025 revenue', '2025-09-30'], ['IESC FY2025 revenue', '2025-09-30'],
    ['ROIV FY2025 net income', '2026-03-31'], ['Target FY2025 revenue', '2026-01-31'], ['Home Depot FY2025 revenue', '2026-02-01'], ['Walmart FY2026 revenue', '2026-01-31']]) {
    const a = ask(q);
    assert.equal(a.status, 'answered', q);
    assert.ok(a.sources?.length ? a.sources.every(s => s.period.endsWith(end)) : a.summary.includes(end), `${q}: ${a.summary}`);
  }
});
