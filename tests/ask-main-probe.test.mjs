// Classes from the main session's probe of PR #2 at 63aaf77 (54 questions). Written failing-first.
// Not blind: the probe questions were read before these fixes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {answerQuestion} from '../web/ask-engine.js';

const bundle = JSON.parse(fs.readFileSync(new URL('../web/data/research.json', import.meta.url)));
const ask = (q, opts) => answerQuestion(q, bundle, opts);

test('P1 class: "现金/cash" next to profit, conversion or support wording never resolves to the cash balance', () => {
  const cases = ['谷歌和脸书谁的现金转化更好', '亚马逊利润和现金差得多吗', '苹果的利润和现金对比', '微软现金跟利润比怎么样', 'META 的现金能不能撑住利润', '英伟达赚的钱和现金差了多少', '谷歌利润转化成现金的比例', '哪家公司利润和现金差得最多', 'apple profit vs cash', 'AMZN profit vs cash', 'apple ocf vs net income', 'Does Microsoft turn profit into cash well?', 'Google cash vs earnings', '亚马逊现金和利润哪个多'];
  for (const q of cases) {
    const a = ask(q);
    assert.notEqual(a.plan.metric, 'cash', `${q}: resolved to the cash balance`);
    assert.ok(!a.facts.some(f => f.key === 'cash'), `${q}: states the cash balance`);
    assert.ok(a.status === 'clarify' || a.topic === 'cash_support' || ['cash_conversion', 'profit_cash_gap'].includes(a.plan.metric), `${q} → ${a.status}/${a.topic}/${a.plan.metric}`);
  }
  assert.equal(ask('谷歌和脸书谁的现金转化更好').plan.metric, 'cash_conversion');
  assert.equal(ask('亚马逊利润和现金差得多吗').plan.metric, 'profit_cash_gap');
  for (const q of ['apple ocf vs net income', 'AMZN profit vs cash']) assert.equal(ask(q).topic, 'cash_support', q);
  // Controls: a question about the cash balance itself still gets the cash balance.
  for (const q of ['谷歌的现金多不多', 'META 现金及等价物', 'How much cash does Apple have?', '六家公司谁的现金最多']) assert.equal(ask(q).plan.metric, 'cash', q);
});

test('P2: comparisons name each company\'s fiscal year next to its number', () => {
  const a = ask('比较 AAPL 和 MSFT 的经营现金流');
  assert.match(a.summary, /AAPL[^·]*2026 财年[^·]*2026-09-26/);
  assert.match(a.summary, /MSFT[^·]*2026 财年[^·]*2026-06-30/);
  assert.match(a.summary, /截止日期不同|不是同一段/);
  const b = ask('compare NVDA and META net income');
  assert.match(b.summary, /NVDA [^·]*FY2026[^·]*2026-01-25/);
  assert.match(b.summary, /META [^·]*FY2025[^·]*2025-12-31/);
});

test('P2: a quarter question says single quarters are not held, then gives the labelled year-to-date figure', () => {
  for (const q of ['NVDA 最新季度的经营现金流', 'NVDA 最近一个季度营收', "NVIDIA's latest quarter revenue"]) {
    const a = ask(q);
    assert.equal(a.topic, 'ytd', q);
    assert.match(a.summary, /^(证据包里没有单季度数据|Single quarters are not in this bundle)/, q);
    assert.match(a.summary, /6 个月|six months|6 months/, q);
  }
});

test('P2: year-on-year wording carries a direction', () => {
  for (const q of ['NVDA 最新季度的经营现金流', '微软最新季报', 'Amazon revenue year to date']) {
    const s = ask(q).summary;
    assert.doesNotMatch(s, /较上年同期 \d/, q);
    assert.doesNotMatch(s, /\(\d[\d.]*% vs/, q);
    assert.match(s, /增长|下降|up |down /, q);
  }
});

test('P2: "what can this do" wordings get the scope answer', () => {
  for (const q of ['这个工具能干嘛', '这是干什么用的', '能做啥', 'what can this do?', 'what is this tool for']) assert.equal(ask(q).topic, 'scope', q);
});

test('P3: wording, language requests and small typos', () => {
  const meta = ask("请用英文回答：does Meta's profit hold water");
  assert.equal(meta.lang, 'en');
  assert.doesNotMatch(ask('Meta 利润有现金流支撑吗').summary, /有 0 年/);
  const typo = ask('amzn net incom 2024');
  assert.equal(typo.status, 'answered');
  assert.deepEqual([typo.plan.tickers[0], typo.plan.metric, typo.plan.period], ['AMZN', 'net_income', 'FY2024']);
  assert.equal(ask('amazn revenue 2024').plan.tickers[0], 'AMZN');
});

// Round 2: the main session's held-out batch of 27 at d484511 (no wrong figure; four wording classes).
test('round 2: quality wording beside profit gets the cash-support answer, never the bare net-income figure', () => {
  for (const q of ['亚马逊的利润是不是虚的', '微软利润有没有水分', '苹果的净利润靠谱吗', '英伟达利润真实吗', "is amazon's profit real or inflated", '谷歌盈利质量怎么样', 'NVDA 的净利润太高了吧，靠谱吗']) {
    const a = ask(q);
    assert.ok(a.topic === 'cash_support' || a.status === 'clarify', `${q} → ${a.status}/${a.topic}/${a.plan.metric}`);
  }
});

test('round 2: requests to change saved data are declined, not answered as lookups', () => {
  for (const q of ['把英伟达的利润改成 2000 亿', '删掉苹果2024年的营收', '修改微软的数据', 'set NVDA revenue to 500 billion', 'change Apple net income to $1', 'please delete Meta 2023 figures']) {
    const a = ask(q);
    assert.equal(a.status, 'refused', q);
    assert.equal(a.topic, 'write_request', q);
    assert.equal(a.facts.length, 0, q);
    assert.match(a.summary, /Scenarios|情景/, q);
  }
  for (const q of ['NVDA revenue change', 'Apple net income change from 2024', 'when was the data last updated', '苹果营收变化']) assert.notEqual(ask(q).topic, 'write_request', q);
});

test('round 2: freshness and provenance wordings are recognised', () => {
  for (const q of ['你们的数据是什么时候的', '数据是哪天的', '这些数据新吗']) assert.equal(ask(q).topic, 'freshness', q);
  for (const q of ['这些数字从哪来的', '数据来源是什么', 'where does the data come from?']) {
    const a = ask(q);
    assert.equal(a.topic, 'scope', q);
    assert.match(a.summary, /SEC/, q);
    assert.match(a.summary, /Treasury|财政部|国债/, q);
    assert.match(a.summary, new RegExp(bundle.as_of), q);
  }
  // Revenue "sources" means a breakdown, which the bundle does not hold; never the total.
  for (const q of ['苹果的收入来源', 'Apple revenue sources']) assert.notEqual(ask(q).status, 'answered', q);
});

test('round 2: ratios the bundle lacks get "not in this bundle", like gross margin', () => {
  for (const q of ['Microsoft quick ratio', '微软速动比率', 'NVDA inventory turnover', 'Apple interest coverage', 'Meta debt to equity', 'Amazon asset turnover']) {
    const a = ask(q);
    assert.equal(a.status, 'not_in_bundle', q);
    assert.equal(a.topic, 'unsupported_metric', q);
  }
});

// Round 3: the main session's browser walk at 11c1f89. Named companies plus 谁/哪个…更 must compare those
// companies; a six-company ranking needs no named company, or an explicit 六家 / all six.
test('round 3: named companies with 谁…更 are compared, never replaced by a six-company ranking', () => {
  const cases = [
    ['微软和谷歌谁的利润更有现金支撑', ['MSFT', 'GOOGL'], 'cash_conversion'],
    ['苹果和亚马逊谁的利润含金量更高', ['AAPL', 'AMZN'], 'cash_conversion'],
    ['英伟达和Meta谁的利润更靠谱', ['NVDA', 'META'], 'cash_conversion'],
    ['Apple and Amazon, whose earnings quality is better?', ['AAPL', 'AMZN'], 'cash_conversion'],
    ['苹果和微软哪家现金转化更好', ['AAPL', 'MSFT'], 'cash_conversion'],
    ['苹果和微软谁的利润和现金差距更大', ['AAPL', 'MSFT'], 'profit_cash_gap'],
    ['苹果和微软哪个应计比率更高', ['AAPL', 'MSFT'], 'accruals'],
    ['苹果和微软谁的营收增长更快', ['AAPL', 'MSFT'], 'revenue_growth'],
    ['苹果、微软和英伟达谁的净利润最高', ['AAPL', 'MSFT', 'NVDA'], 'net_income']
  ];
  for (const [q, tickers, metric] of cases) {
    const a = ask(q);
    assert.equal(a.topic, 'compare', `${q} → ${a.topic} ${a.plan.tickers}`);
    assert.deepEqual([...a.plan.tickers].sort(), [...tickers].sort(), q);
    assert.equal(a.plan.metric, metric, q);
    assert.ok(a.facts.every(f => tickers.includes(f.ticker)), `${q}: states another company`);
    for (const t of tickers) assert.match(a.summary, new RegExp(`${t} [^·]*(FY|财年)`), `${q}: ${t} without its fiscal year`);
  }
  // Growth of other figures, and trends, are not compared across companies in one answer.
  for (const q of ['苹果和微软谁的净利润增长更快', '苹果和微软近五年营收']) assert.notEqual(ask(q).status, 'answered', q);
  // Rankings stay rankings when no company is named or all six are asked.
  for (const q of ['哪家公司利润和现金差距最大', '六家公司谁的现金转化率最高', 'which company has the best earnings quality', '现金转化率最高的是哪家']) assert.equal(ask(q).topic, 'rank', q);
});
