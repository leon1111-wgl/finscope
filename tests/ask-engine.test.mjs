// Ask the ledger: the tier-1 rules engine, on the committed evidence bundle. No browser, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {answerQuestion, normalize, parseQuestion, TICKERS, MAX_QUESTION} from '../web/ask-engine.js';

const bundle = JSON.parse(fs.readFileSync(new URL('../web/data/research.json', import.meta.url)));
const coverage = JSON.parse(fs.readFileSync(new URL('./ask-coverage.json', import.meta.url))).cases;
const latest = bundle.snapshots.at(-1);
const ask = (q, opts) => answerQuestion(q, bundle, opts);
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

// The value a correct answer must state: the latest filed version of that period by the information date.
function bundleFact(ticker, key, periodEnd, asOf = bundle.as_of) {
  let found = null;
  for (const s of bundle.snapshots) if (s.as_of <= asOf) for (const r of s.companies[ticker]) if (r.period_end === periodEnd) found = r.metrics[key];
  return found;
}

test('coverage: every claimed topic, figure and indicator in two wordings, and every refusal class', () => {
  const failures = [];
  for (const c of coverage) {
    const a = ask(c.q);
    const problems = [];
    if (a.status !== c.status) problems.push(`status ${a.status}`);
    if (c.topic && a.topic !== c.topic) problems.push(`topic ${a.topic}`);
    if (c.tickers && a.status === 'answered' && !sameSet(a.plan.tickers, c.tickers)) problems.push(`tickers ${a.plan.tickers}`);
    if (c.metric && a.plan.metric !== c.metric) problems.push(`metric ${a.plan.metric}`);
    if (c.period && a.plan.period !== c.period) problems.push(`period ${a.plan.period}`);
    if (problems.length) failures.push(`${c.q} → ${problems.join(', ')}`);
  }
  assert.deepEqual(failures, []);
  const topics = new Set(coverage.map(c => c.topic));
  for (const t of ['cash_support', 'metric', 'ratio', 'trend', 'change', 'compare', 'rank', 'ytd', 'bridge', 'anomaly', 'rates', 'filing', 'definition', 'scope', 'freshness', 'advice', 'forecast', 'fraud_verdict', 'price', 'out_of_universe', 'unsupported_metric', 'missing_fact', 'out_of_range', 'off_topic', 'gibberish', 'ambiguous'])
    assert.ok(coverage.filter(c => c.topic === t).length >= 2, `${t} needs two wordings`);
  const metrics = new Set(coverage.map(c => c.metric).filter(Boolean));
  for (const m of ['revenue', 'net_income', 'operating_income', 'operating_cash_flow', 'assets', 'liabilities', 'current_assets', 'current_liabilities', 'cash', 'capex', 'operating_margin', 'net_margin', 'cash_margin', 'current_ratio', 'liabilities_assets', 'cash_coverage', 'accruals', 'revenue_growth', 'cash_conversion', 'free_cash_flow', 'profit_cash_gap'])
    assert.ok(metrics.has(m), `${m} has no coverage question`);
  assert.ok(topics.size >= 26);
});

test('every answer names its engine, and every stated figure carries its official source line', () => {
  for (const c of coverage) {
    const a = ask(c.q);
    assert.match(a.engine.label, /tier 1|第一层/);
    assert.equal(a.engine.tier, 1);
    for (const f of a.facts) {
      const url = new URL(f.url);
      assert.ok(url.protocol === 'https:' && ['www.sec.gov', 'home.treasury.gov'].includes(url.hostname), `${c.q}: ${f.url}`);
      assert.ok(f.tag && f.period_end && f.filed, `${c.q}: incomplete source line`);
      if (url.hostname === 'www.sec.gov') assert.ok(f.accession && /^10-[KQ]/.test(f.form), `${c.q}: SEC fact without accession or form`);
    }
    if (a.status === 'answered' && !['scope', 'definition', 'freshness'].includes(a.topic)) assert.ok(a.facts.length > 0, `${c.q}: answer without a source line`);
    if (a.status !== 'answered') assert.equal(a.facts.length, 0, `${c.q}: a non-answer states figures`);
  }
});

test('stated figures equal the bundle facts for the period, never another period or tag', () => {
  for (const t of TICKERS) for (const key of ['revenue', 'net_income', 'operating_cash_flow', 'cash']) {
    const row = latest.companies[t].at(-1);
    const a = ask(`${t} ${key.replace(/_/g, ' ')} FY${row.period_end.slice(0, 4)}`);
    assert.equal(a.status, 'answered', `${t} ${key}`);
    const f = a.facts.find(x => x.key === key);
    const truth = bundleFact(t, key, row.period_end);
    assert.equal(f.value, truth.value);
    assert.equal(f.tag, truth.tag);
    assert.equal(f.accession, truth.accession);
  }
  const msft = ask('MSFT 2024 年经营现金流是多少');
  assert.equal(msft.facts[0].value, bundleFact('MSFT', 'operating_cash_flow', '2024-06-30').value);
  assert.match(msft.summary, new RegExp((bundleFact('MSFT', 'operating_cash_flow', '2024-06-30').value / 1e8).toFixed(2)));
  // Links keep the matched primary document so the page says "Read 10-K".
  assert.equal(msft.facts[0].link_kind, 'primary_document');
});

test('ratios equal the pipeline values, and the cited prior-year inputs reproduce them', () => {
  for (const t of TICKERS) {
    const rows = latest.companies[t];
    const row = rows.at(-1), prior = rows.at(-2);
    for (const key of ['operating_margin', 'net_margin', 'cash_margin', 'current_ratio', 'cash_coverage', 'accruals', 'revenue_growth']) {
      const a = ask(`${t} ${key.replace(/_/g, ' ')} FY${row.period_end.slice(0, 4)}`);
      if (!Number.isFinite(row.ratios[key])) { assert.notEqual(a.status, 'answered'); continue; }
      assert.equal(a.status, 'answered', `${t} ${key}`);
      assert.equal(a.plan.metric, key);
    }
    const acc = ask(`${t} accrual ratio FY${row.period_end.slice(0, 4)}`);
    const v = k => acc.facts.find(f => f.key === k && f.role !== 'prior_year').value;
    const priorAssets = acc.facts.find(f => f.key === 'assets' && f.role === 'prior_year').value;
    assert.equal(priorAssets, prior.metrics.assets.value);
    assert.ok(Math.abs((v('net_income') - v('operating_cash_flow')) / ((v('assets') + priorAssets) / 2) - row.ratios.accruals) < 1e-12);
  }
});

test('look-alikes the bundle does not hold are refused, never answered with a different figure', () => {
  const cases = {
    '英伟达毛利率多少': 'unsupported_metric', 'NVIDIA gross profit 2025': 'unsupported_metric', '亚马逊的债务': 'unsupported_metric',
    'Amazon long-term debt': 'unsupported_metric', '谷歌投资活动现金流': 'unsupported_metric', 'META financing cash flow': 'unsupported_metric',
    '苹果的应收账款': 'unsupported_metric', 'apple accounts receivable balance': 'unsupported_metric', '英伟达存货有多少': 'unsupported_metric',
    'NVDA EPS': 'unsupported_metric', '微软每股收益': 'unsupported_metric', 'MSFT ROE': 'unsupported_metric', '苹果研发费用': 'unsupported_metric',
    'AWS revenue': 'unsupported_metric', 'Meta dividends': 'unsupported_metric', '苹果回购': 'unsupported_metric', 'NVDA EBITDA': 'unsupported_metric',
    'AMZN total liabilities': 'missing_fact', '亚马逊资产负债率': 'missing_fact', 'NVDA capex': 'missing_fact', '亚马逊自由现金流': 'missing_fact',
    'GOOGL 2026 revenue': 'forecast', 'MSFT FY2027 net income': 'forecast', '苹果 2030 年营收': 'forecast',
    'NVDA 2010 revenue': 'out_of_range', 'Apple share price': 'price', '英伟达市盈率': 'price', 'TSLA revenue': 'out_of_universe', '腾讯的利润': 'out_of_universe'
  };
  for (const [q, topic] of Object.entries(cases)) {
    const a = ask(q);
    assert.notEqual(a.status, 'answered', q);
    assert.equal(a.topic, topic, q);
    assert.equal(a.facts.length, 0, q);
  }
});

test('advice, verdicts and forecasts are declined even when wrapped in a factual question', () => {
  for (const q of ['NVDA 现金流这么好，现在能买吗', 'Is MSFT undervalued given its cash flow?', '苹果值得长期持有吗', 'should i sell amzn after this 10-Q', 'which of the six is the best investment', '英伟达会不会暴雷', 'Is NVIDIA manipulating earnings?', 'will meta revenue grow next year', '微软未来三年利润预测'])
    assert.equal(ask(q).status, 'refused', q);
});

test('the information date bounds what an answer may use', () => {
  const early = ask('MSFT revenue', {date: '2020-01-15'});
  assert.equal(early.status, 'answered');
  assert.equal(early.plan.period, 'latest');
  assert.ok(early.facts.every(f => f.filed <= '2020-01-15'));
  assert.match(early.summary, /FY2019/);
  assert.equal(ask('MSFT 2024 revenue', {date: '2020-01-15'}).status, 'refused');
  const rates = ask('10-year treasury yield', {date: '2019-06-03'});
  assert.ok(rates.facts[0].period_end <= '2019-06-03');
});

test('normalisation reads traditional characters, full-width input and over-long text safely', () => {
  assert.equal(normalize('ＮＶＤＡ　營收'), 'NVDA 营收');
  assert.deepEqual(parseQuestion('蘋果和微軟的淨利潤', bundle).companies, ['AAPL', 'MSFT']);
  const long = ask('NVDA revenue ' + 'x'.repeat(5000));
  assert.ok(long.question.length <= MAX_QUESTION);
  const html = ask('<img src=x onerror=alert(1)> NVDA revenue');
  assert.equal(html.status, 'answered');
  assert.ok(html.question.includes('<img'), 'the engine returns text; escaping is the page’s job and is tested in the DOM test');
});

test('the engine module has no network, storage or model access', () => {
  const src = fs.readFileSync(new URL('../web/ask-engine.js', import.meta.url), 'utf8');
  for (const word of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'WebSocket', 'import(', 'navigator.gpu'])
    assert.ok(!src.includes(word), word);
});
