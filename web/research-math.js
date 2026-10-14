export function selectSnapshot(snapshots, day) {
  return snapshots.filter(s => s.as_of <= day).at(-1) || null;
}

function bounded(value, lo, hi, name) {
  if (!Number.isFinite(value) || value < lo || value > hi) throw new Error(`${name} must be between ${lo} and ${hi}.`);
  return value;
}
export function stressCompany(row, input) {
  const revenue = row.metrics.revenue?.value,
    operating = row.metrics.operating_income?.value;
  if (!Number.isFinite(revenue) || revenue <= 0 || !Number.isFinite(operating)) throw new Error('Revenue and operating income are required for this scenario.');
  const r = bounded(input.revenuePercent, -100, 100, 'Revenue change') / 100;
  const m = bounded(input.marginPoints, -50, 50, 'Margin change') / 100;
  const debt = bounded(input.refinanceBillions, 0, 1000, 'Refinancing exposure') * 1e9;
  const rate = bounded(input.rateBps, -500, 1000, 'Rate shock') / 10000;
  const days = bounded(input.collectionDays, 0, 180, 'Collection delay');
  const stressedRevenue = revenue * (1 + r),
    operatingIncome = stressedRevenue * (operating / revenue + m);
  const extraInterest = debt * rate,
    cashTiedUp = stressedRevenue / 365 * days;
  return {
    stressedRevenue,
    operatingIncome,
    extraInterest,
    profitProxy: operatingIncome - extraInterest,
    operatingChange: operatingIncome - operating,
    cashTiedUp,
    cashRemainingProxy: Number.isFinite(row.metrics.cash?.value) ? row.metrics.cash.value - cashTiedUp : null
  };
}
export function bondScenario({
  face,
  couponPercent,
  years,
  yieldPercent,
  shockBps
}) {
  bounded(face, 1, 1e9, 'Face value');
  bounded(couponPercent, 0, 30, 'Coupon');
  bounded(years, .5, 50, 'Years');
  if (!Number.isInteger(years * 2)) throw new Error('Use half-year maturity steps.');
  bounded(yieldPercent, 0, 30, 'Yield');
  bounded(shockBps, -500, 1000, 'Rate shock');
  const y = yieldPercent / 100,
    delta = shockBps / 10000,
    n = years * 2;
  const flows = Array.from({
    length: n
  }, (_, i) => ({
    t: i + 1,
    cash: face * couponPercent / 100 / 2 + (i === n - 1 ? face : 0)
  }));
  const pv = rate => flows.reduce((sum, f) => sum + f.cash / (1 + rate / 2) ** f.t, 0);
  const price = pv(y),
    shockedPrice = pv(y + delta);
  const modifiedDuration = flows.reduce((s, f) => s + (f.t / 2) * f.cash / (1 + y / 2) ** f.t, 0) / price / (1 + y / 2);
  return {
    price,
    shockedPrice,
    modifiedDuration,
    changePercent: 100 * (shockedPrice / price - 1),
    durationApproxPercent: -100 * modifiedDuration * delta
  };
}
export function reviewQuestions(row) {
  const r = row.ratios,
    questions = [];
  const cash = row.metrics.operating_cash_flow?.value,
    profit = row.metrics.net_income?.value;
  if (Number.isFinite(cash) && Number.isFinite(profit)) questions.push(cash < profit ?
    'Operating cash flow is below net income. Inspect receivables, inventory, deferred revenue and other working-capital movements.' :
    'Operating cash flow exceeds net income. Check how much comes from recurring operations, non-cash charges and working-capital timing.');
  if (Number.isFinite(r.current_ratio)) questions.push(r.current_ratio < 1 ?
    'Current assets are below current liabilities. Read the liquidity note, debt maturity schedule and operating cash cycle before judging funding pressure.' :
    'Current assets exceed current liabilities. Check asset liquidity and the timing of obligations; the ratio alone cannot establish resilience.');
  questions.push('Read the latest quarterly filing and management discussion. This workspace uses annual accounts and does not cover every recent development.');
  return questions;
}
export function buildBrief(bundle, snapshot, company, assumptions, requestedDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || !Number.isFinite(Date.parse(requestedDate)) || requestedDate < snapshot.as_of || (bundle.as_of && requestedDate > bundle.as_of)) throw new Error('Information date must include the selected snapshot and remain within the dataset range.');
  const row = snapshot.companies[company.ticker].at(-1);
  let scenario = null,
    scenarioError = null;
  try {
    scenario = stressCompany(row, assumptions);
  } catch (error) {
    scenarioError = error.message;
  }
  return {
    title: `${company.ticker} · earnings quality and financial resilience`,
    author: 'FinScope by Leon Wang',
    exported_at: new Date().toISOString(),
    requested_date: requestedDate,
    snapshot_date: snapshot.as_of,
    data_retrieved_build: bundle.generated_at,
    dataset_sha256: bundle.dataset_sha256,
    company,
    annual_period: row.period_end,
    facts: row.metrics,
    ratios: row.ratios,
    prior_annual_period: snapshot.companies[company.ticker].at(-2) || null,
    ratio_formulas: {
      operating_margin: 'Operating income / revenue',
      net_margin: 'Net income / revenue',
      cash_margin: 'Operating cash flow / revenue',
      current_ratio: 'Current assets / current liabilities',
      liabilities_assets: 'Liabilities / assets',
      cash_coverage: 'Cash and equivalents / current liabilities',
      accruals: '(Net income - operating cash flow) / ((current-year total assets + previous-year total assets) / 2)',
      revenue_growth: 'Current annual revenue / previous annual revenue - 1'
    },
    anomaly: snapshot.ai.scores[company.ticker] || null,
    training: snapshot.ai.training,
    assumptions: {
      ...assumptions
    },
    scenario,
    scenario_error: scenarioError,
    treasury: bundle.rates.filter(r => r.date <= requestedDate).at(-1) || null,
    follow_up: reviewQuestions(row),
    limitations: bundle.limitations,
    sources: bundle.sources
  };
}
const num = v => Number.isFinite(v) ? v.toLocaleString('en-US', {
  maximumFractionDigits: 4
}) : 'Unavailable';
export function briefMarkdown(b) {
  return `# ${b.title}\n\nPrepared with ${b.author}.\n\nRequested date: ${b.requested_date}. Financial snapshot: ${b.snapshot_date}. Annual period end: ${b.annual_period}.\n\nDataset SHA-256: ${b.dataset_sha256}\nBuilt: ${b.data_retrieved_build}. Exported: ${b.exported_at}.\n\n## Question\n\nDoes reported profit have cash-flow support, and what changes under a weaker operating scenario?\n\n## Reported evidence (USD)\n\n| Metric | Value | Period end | Filed | Source |\n| --- | ---: | --- | --- | --- |\n` +
    Object.entries(b.facts).map(([k, f]) => `| ${k} | ${num(f?.value)} | ${f?.end||'—'} | ${f?.filed||'—'} | ${f?.url?`[${f.tag||'Filing'}](${f.url})`:'Unavailable'} |`).join('\n') +
    `\n\n## Prior annual inputs for growth and average assets\n\n` + (b.prior_annual_period ? `Prior period end: ${b.prior_annual_period.period_end}.\n\n` + ['revenue', 'assets'].map(k => {
      const f = b.prior_annual_period.metrics[k];
      return `- ${k}: ${num(f?.value)} USD · filed ${f?.filed||'unavailable'} · ${f?.url||'source unavailable'}`;
    }).join('\n') : 'No eligible prior annual period.') +
    `\n\n## Ratios (decimal unless named ratio)\n\n` + Object.entries(b.ratios).map(([k, v]) => `- ${k}: ${num(v)}. Formula: ${b.ratio_formulas[k]}.`).join('\n') +
    `\n\n## AI triage\n\n${b.anomaly?`Historical anomaly percentile: ${b.anomaly.percentile}. Higher means more unusual, not greater default probability. ${b.training.samples} earlier company-years; period ends strictly before ${b.training.period_end_before}. Latest training filing: ${b.training.latest_filed}. Imputed target features: ${b.anomaly.imputed_features.join(', ')||'none'}.`:'AI unavailable for this selection.'}\n\n## Scenario assumptions\n\n` +
    Object.entries(b.assumptions).map(([k, v]) => `- ${k}: ${num(v)}`).join('\n') +
    `\n\n## Scenario results (USD)\n\n` + (b.scenario ? Object.entries(b.scenario).map(([k, v]) => `- ${k}: ${num(v)}`).join('\n') : b.scenario_error) +
    `\n\nRevenue = reported revenue × (1 + revenue change / 100). Operating income = scenario revenue × (reported operating margin + margin-point change / 100). Incremental interest = assumed refinancing exposure in billions × 1e9 × rate shock / 10000. Profit proxy = scenario operating income − incremental interest; it omits existing interest, tax and other income. Cash tied up = scenario revenue / 365 × extra collection days. These are mechanical assumptions, not a forecast.\n\n## Follow-up work\n\n` +
    b.follow_up.map(q => `- ${q}`).join('\n') +
    `\n\n## Treasury context\n\n${b.treasury?`Observation ${b.treasury.date}; 2-year ${b.treasury['2y']}%, 10-year ${b.treasury['10y']}%. These are Treasury rates, not this company's borrowing rates.`:'No eligible rate observation.'}\n\n## Limits\n\n` +
    b.limitations.map(l => `- ${l}`).join('\n') +
    `\n\n## Source retrieval records\n\n` + Object.entries(b.sources).map(([k, s]) => `- ${k}: ${s.url} · retrieved ${s.retrieved_at} · SHA-256 ${s.raw_sha256}`).join('\n') + '\n';
}
