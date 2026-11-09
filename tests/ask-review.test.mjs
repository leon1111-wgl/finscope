// Classes from the independent (Fable) review at 09a54fd. Each must answer what was asked, or decline;
// never a different figure, company or period. Written failing-first.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {answerQuestion} from '../web/ask-engine.js';

const bundle = JSON.parse(fs.readFileSync(new URL('../web/data/research.json', import.meta.url)));
const ask = (q, opts) => answerQuestion(q, bundle, opts);
const NON = new Set(['not_in_bundle', 'refused', 'clarify']);
const declines = q => { const a = ask(q); assert.ok(NON.has(a.status), `${q} → ${a.status}/${a.topic}: ${a.summary}`); assert.equal(a.facts.length, 0, q); return a; };

test('two figures: a defined combination becomes its indicator; others are listed or declined, never one input', () => {
  for (const [q, metric] of [['Apple operating cash flow minus capex 2026', 'free_cash_flow'], ['苹果不包括资本开支的经营现金流', 'free_cash_flow'], ["Apple's net income divided by revenue 2026", 'net_margin'], ["Apple's net income minus operating cash flow 2026", 'profit_cash_gap'], ['NVDA operating income as a % of revenue', 'operating_margin'], ['Apple operating income margin 2026', 'operating_margin']]) {
    const a = ask(q);
    assert.equal(a.status, 'answered', q);
    assert.equal(a.plan.metric, metric, q);
  }
  for (const q of ["apple's capex as % of revenue 2026", 'NVDA revenue per share FY2026', 'Apple revenue CAGR', "Apple's free cash flow margin", '苹果的资本开支占营收比例']) declines(q);
  for (const q of ['苹果2025年的营收和净利润', 'NVDA revenue and operating income FY2026', 'Apple current ratio and cash coverage 2026']) {
    const a = ask(q);
    assert.equal(a.status, 'answered', q);
    assert.equal(a.topic, 'figures', q);
    assert.ok(a.plan.metrics.length >= 2, q);
  }
  for (const q of ["Apple's revenue vs Microsoft's net income", "Is Apple's revenue bigger than NVIDIA's profit?"]) declines(q);
});

test('growth and earnings-quality wording never resolves to a level figure', () => {
  const g = ask('哪家公司营收增长最快');
  assert.equal(g.status, 'answered');
  assert.equal(g.plan.metric, 'revenue_growth');
  for (const q of ['Which company has the worst earnings quality?', 'which has the best earnings quality', "Is Apple's or Microsoft's profit backed by cash?", 'Apple vs Microsoft earnings quality']) {
    const a = ask(q);
    assert.ok(a.status !== 'answered' || a.plan.metric === 'cash_conversion' || a.topic === 'cash_support', `${q} → ${a.plan.metric}`);
    assert.ok(!/best|worst|最好|最差/i.test(a.summary), `${q}: no quality verdict in the headline`);
  }
  declines('哪家公司净利润增长最快');
});

test('quarters, halves, calendar years and dates either match the period asked or decline', () => {
  for (const q of ["Apple's revenue in Q1 2026", 'MSFT Q1 2026 revenue', '苹果去年第四季度的营收', '苹果每个季度的营收', "Apple's revenue for the first half of fiscal 2026", 'Apple H1 FY2026 revenue', '苹果的半年报营收', "Apple's revenue in the September quarter", "Apple's FY2026 revenue by quarter", 'NVDA Q2 FY2027 revenue', '英伟达2025自然年营收', "Microsoft's revenue for calendar year 2025"]) declines(q);
  const amzn = ask('Amazon revenue calendar year 2024');
  assert.equal(amzn.status, 'answered', 'December year ends: the fiscal year is the calendar year');
  assert.equal(amzn.plan.period, 'FY2024');
  const dated = ask('Apple revenue 2025-09-27');
  assert.equal(dated.status, 'answered');
  assert.equal(dated.facts[0].period_end, '2025-09-27');
  declines('苹果2025年9月1日的现金');
  const ago = ask('NVDA revenue 2 years ago');
  assert.equal(ago.plan.period, 'FY2024');
  assert.equal(ask('英伟达两年前的营收').plan.period, 'FY2024');
  const pair = ask('Meta revenue in 2025 compared to Google in 2024');
  assert.equal(pair.status, 'answered');
  assert.deepEqual(pair.facts.map(f => [f.ticker, f.period_end.slice(0, 4)]), [['META', '2025'], ['GOOGL', '2024']]);
});

test('Treasury answers use the year and tenor asked, and decline tenors or dates they do not hold', () => {
  for (const q of ['what was the 10-year treasury yield in 2024', '国债收益率 2022年']) {
    const a = ask(q);
    assert.equal(a.status, 'answered', q);
    assert.ok(a.facts.length && a.facts.every(f => f.period_end.startsWith(q.includes('2024') ? '2024' : '2022')), q);
  }
  const last = ask('10 year yield last year');
  assert.ok(last.facts.every(f => f.period_end.startsWith('2025')));
  for (const q of ['20年期国债收益率', '7-year treasury yield', 'treasury yield on 2024-02-30']) declines(q);
});

test('a narrower or broader scope than the bundle holds is declined', () => {
  for (const q of ['NVDA revenue excluding China FY2026', '苹果大中华区2026年营收', 'Apple revenue outside the United States', "Apple's cash and marketable securities 2026", '苹果的现金及短期投资']) declines(q);
  assert.match(ask('Apple cash 2026').notes.join(' '), /marketable securities/);
});

test('harmless factual questions are answered, not refused as advice or forecasts', () => {
  for (const q of ['英伟达持有多少现金', '苹果持有的现金有多少', "Did Apple's revenue go up last year?", "Did NVDA's net income go down in FY2023?"]) {
    const a = ask(q);
    assert.equal(a.status, 'answered', `${q} → ${a.status}/${a.topic}`);
  }
  for (const q of ['What does NVDA sell?', 'Does Amazon sell more than Apple?']) assert.notEqual(ask(q).topic, 'advice', q);
  for (const q of ['Should I sell NVDA?', 'sell AAPL now?', '苹果还值得继续持有吗']) assert.equal(ask(q).topic, 'advice', q);
  const r = ask('哪家公司2026年营收最高');
  assert.equal(r.status, 'answered');
  assert.match(r.notes.join(' '), /AMZN/);
});

test('one company at a time where only one can be shown; the year asked is honoured', () => {
  declines('Apple vs Microsoft year-to-date revenue');
  declines('why do AAPL and MSFT cash flows differ from profit');
  const link = ask("link to Apple's 2024 10-K");
  assert.equal(link.status, 'answered');
  assert.ok(link.facts[0].period_end.startsWith('2024') && link.facts[0].accession !== '0000320193-26-000026');
  const anomaly = ask('META anomaly score 2023');
  assert.ok(anomaly.status !== 'answered' || anomaly.plan.period === 'FY2023', anomaly.summary);
});

test('relative years follow the information date; notes and names do not mislead', () => {
  assert.equal(ask('苹果去年的营收', {date: '2025-12-31'}).plan.period, 'FY2024');
  assert.match(ask('英伟达2023年营收').notes.join(' '), /FY2023|2023 财年/);
  assert.doesNotMatch(ask('英伟达2023年营收').notes.join(' '), /2026/);
  assert.notEqual(ask('NVDA GPU revenue').topic, 'out_of_universe');
  assert.notEqual(ask("Who is Apple's CFO?").status, 'answered');
});

test('product lines, currency conversion and "so far" are not answered with the annual total', () => {
  for (const q of ['NVDA GPU revenue', 'Apple 2025 revenue in RMB', '苹果2025年营收折合人民币多少']) declines(q);
  assert.equal(ask('NVDA revenue 2026 so far').topic, 'ytd');
  assert.equal(ask("Is NVDA's profit real?").topic, 'cash_support');
});
