import {
  escapeHTML as e
} from './workbench.js';
import {
  selectSnapshot,
  stressCompany,
  bondScenario,
  reviewQuestions,
  buildBrief,
  briefMarkdown
} from './research-math.js';
const $ = s => document.querySelector(s);
const money = v => Number.isFinite(v) ? `${v<0?'−':''}$${(Math.abs(v)/1e9).toFixed(2)}B` : 'Unavailable';
const pct = v => Number.isFinite(v) ? `${(v*100).toFixed(1)}%` : 'Unavailable';
const ratio = v => Number.isFinite(v) ? `${v.toFixed(2)}×` : 'Unavailable';
const names = {
  revenue: 'Revenue',
  net_income: 'Net income',
  operating_income: 'Operating income',
  operating_cash_flow: 'Operating cash flow',
  assets: 'Total assets',
  liabilities: 'Total liabilities',
  current_assets: 'Current assets',
  current_liabilities: 'Current liabilities',
  cash: 'Cash & equivalents',
  capex: 'Cash capital expenditure',
  operating_margin: 'Operating margin',
  net_margin: 'Net margin',
  cash_margin: 'Operating cash margin',
  current_ratio: 'Current ratio',
  liabilities_assets: 'Liabilities / assets',
  cash_coverage: 'Cash / current liabilities',
  accruals: 'Accrual ratio',
  revenue_growth: 'Revenue growth'
};
const ratioFormat = (key, value) => ['current_ratio', 'cash_coverage'].includes(key) ? ratio(value) : pct(value);
let bundle, snapshot, company, row, selectedDate, page = 'review';
let assumptions = {
  revenuePercent: 0,
  marginPoints: 0,
  refinanceBillions: 0,
  rateBps: 0,
  collectionDays: 0
};
const params = new URLSearchParams(location.search);
const panel = (title, body) => `<section class="panel"><h3>${title}</h3>${body}</section>`;
const kpi = (label, value, detail) => `<div class="kpi"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
const table = (heads, rows) => `<div class="table-wrap" tabindex="0" role="region" aria-label="${e(heads.join(', '))}"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const factsTable = metrics => table(['Reported metric', 'USD billions', 'Period end', 'Filed', 'Evidence'], Object.entries(metrics).map(([key, f]) => [names[key] || e(key), money(f?.value), f?.end || '—', f?.filed || '—', f ? `<a href="${e(f.url)}" target="_blank" rel="noopener noreferrer">${e(f.tag)} ↗</a>` : 'No matching standard USD fact']));

function updateURL() {
  const query = new URLSearchParams({
    company: company.ticker,
    date: selectedDate,
    view: page
  });
  for (const [key, value] of Object.entries(assumptions))
    if (value !== 0) query.set(key, value);
  history.replaceState(null, '', `${location.pathname}?${query}${location.hash}`);
}

function validScenarioDraft() {
  const form = $('#scenario-form');
  if (form && !form.checkValidity()) {
    $('#status').textContent = 'Correct the scenario inputs before changing the research view or exporting.';
    form.reportValidity();
    return false;
  }
  return true;
}

function useSelection() {
  if (!validScenarioDraft()) {
    $('#as-of').value = selectedDate;
    $('#company').value = company.ticker;
    return;
  }
  const day = $('#as-of').value;
  if (!day || day < bundle.snapshots[0].as_of || day > bundle.as_of) {
    $('#as-of').value = selectedDate;
    $('#status').textContent = `Choose a date from ${bundle.snapshots[0].as_of} through ${bundle.as_of}. Your previous valid selection is restored.`;
    return;
  }
  selectedDate = day;
  snapshot = selectSnapshot(bundle.snapshots, day);
  company = bundle.companies.find(c => c.ticker === $('#company').value);
  row = snapshot.companies[company.ticker].at(-1);
  $('#scope').textContent = `${company.name} · Annual period ended ${row.period_end} · Financial snapshot ${snapshot.as_of} (on or before your selected date) · Latest selected filing ${row.known_at}.`;
  $('#status').textContent = '';
  render();
}

function show(next) {
  if (!validScenarioDraft()) return;
  page = next;
  $('#status').textContent = '';
  render();
}

function trend(rows, width) {
  const
    height = 260,
    left = 64,
    right = 15,
    top = 22,
    bottom = 54;
  const vals = rows.flatMap(r => ['net_income', 'operating_cash_flow'].map(k => r.metrics[k]?.value / 1e9)).filter(Number.isFinite);
  if (!vals.length) return '<p>No matched annual history.</p>';
  const lo = Math.min(0, ...vals),
    hi = Math.max(1, ...vals) * 1.15,
    y = v => top + (hi - v) / (hi - lo) * (height - top - bottom),
    step = (width - left - right) / rows.length;
  let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Annual net income and operating cash flow in USD billions. Exact values follow in the history table."><title>Profit and cash by fiscal period</title>`;
  for (let i = 0; i < 4; i++) {
    const v = lo + (hi - lo) * i / 3;
    svg += `<line x1="${left}" y1="${y(v)}" x2="${width-right}" y2="${y(v)}" stroke="#314558"/><text x="${left-10}" y="${y(v)+5}" fill="#b3c3d4" font-size="13" text-anchor="end">${v.toFixed(0)}B</text>`;
  }
  rows.forEach((r, i) => {
    ['net_income', 'operating_cash_flow'].forEach((k, j) => {
      const value = r.metrics[k]?.value / 1e9;
      if (!Number.isFinite(value)) return;
      const x = left + i * step + step * .16 + j * step * .32;
      svg += `<rect x="${x}" y="${Math.min(y(value),y(0))}" width="${step*.27}" height="${Math.max(1,Math.abs(y(value)-y(0)))}" fill="${j?'#8bb9ff':'#6fe1c5'}" rx="2"><title>${r.period_end}: ${names[k]} ${money(r.metrics[k].value)}</title></rect>`;
    });
    svg += `<text x="${left+(i+.5)*step}" y="${height-22}" fill="#b3c3d4" font-size="13" text-anchor="middle">${r.period_end.slice(0,4)}</text>`;
  });
  return svg + '</svg><div class="legend"><span>Net income</span><span>Operating cash flow</span></div>';
}

function review() {
  const r = row.ratios,
    ai = snapshot.ai.scores[company.ticker],
    train = snapshot.ai.training;
  const historyRows = snapshot.companies[company.ticker];
  return `<p class="eyebrow">01 / UNDERSTAND BEFORE YOU SCORE</p><h2>${e(company.ticker)}: is profit turning into cash?</h2><p class="muted">Start with the reported numbers. Then use the model to decide where a closer reading may help.</p>
  <div class="kpis">${kpi('Annual revenue',money(row.metrics.revenue?.value),`Period ended ${row.period_end}`)}${kpi('Net income',money(row.metrics.net_income?.value),'Profit after reported expenses')}${kpi('Operating cash flow',money(row.metrics.operating_cash_flow?.value),'Cash generated by operations')}${kpi('Current ratio',ratio(r.current_ratio),'Current assets ÷ current liabilities')}</div>
  <div class="grid">${panel('Profit and cash over time',`<p class="note">A company can book profit before collecting cash. This chart helps you notice the gap; the filing explains its cause.</p><div id="profit-chart"></div><details><summary>Read the exact annual values</summary>${table(['Fiscal period end','Revenue','Net income','Operating cash flow'],historyRows.map(r=>[r.period_end,money(r.metrics.revenue?.value),money(r.metrics.net_income?.value),money(r.metrics.operating_cash_flow?.value)]))}</details>`)}
  ${panel('AI triage: what looks unusual?',ai?`<p class="score">${ai.percentile}<small> / 100</small></p><p>Historical anomaly percentile</p><meter min="0" max="100" value="${ai.percentile}" aria-label="Historical anomaly percentile"></meter><p class="note">Higher means this financial profile is less typical of the training history. It does not mean the company is worse or more likely to default.</p><h4>Context for your review</h4><ul class="question-list">${ai.context_deviations.map(d=>`<li>${names[d.feature]}: <strong>${ratioFormat(d.feature,d.value)}</strong> · training median ${ratioFormat(d.feature,d.training_median)}</li>`).join('')}</ul><p class="note">These are descriptive deviations, not causal explanations or model feature attributions. ${ai.imputed_features.length?`Missing model inputs filled with training medians: ${ai.imputed_features.map(k=>names[k]).join(', ')}.`:'All six current model inputs are observed.'}</p><details><summary>Inspect the training boundary</summary><p>${train.samples} earlier company-years. Period ends from ${train.first_period_end} to ${train.last_period_end}, strictly before ${train.period_end_before}. Latest eligible training filing: ${train.latest_filed}. Six selected companies; fixed seed 42; 128 trees.</p></details>`:'<p>There is not enough eligible history for a model score. The reported facts and scenarios remain available.</p>')}</div>
  ${panel('Questions to take into the filing',`<ul class="question-list">${reviewQuestions(row).map(q=>`<li>${q}</li>`).join('')}</ul><div class="question"><strong>Keep the conclusion proportional to the evidence.</strong><p>A cash-flow gap is a starting point. It can reflect working-capital timing, non-cash charges or a changing business model. Verify the explanation before drawing a risk conclusion.</p></div>`)}
  ${panel('Trace every reported input',`<p class="note">Annual flow metrics match the same start and end dates. Balance-sheet facts match that annual period end. Missing tags stay unavailable. Values are USD billions; filing links expose the original XBRL source.</p>${factsTable(row.metrics)}<details><summary>How the ratios are calculated</summary>${table(['Ratio','Value','Formula'],[['Operating margin',pct(r.operating_margin),'Operating income / revenue'],['Operating cash margin',pct(r.cash_margin),'Operating cash flow / revenue'],['Current ratio',ratio(r.current_ratio),'Current assets / current liabilities'],['Liabilities / assets',pct(r.liabilities_assets),'Total liabilities / total assets'],['Accrual ratio',pct(r.accruals),'(Net income − operating cash flow) / average assets'],['Revenue growth',pct(r.revenue_growth),'Revenue / previous annual revenue − 1']])}<p>Denominators must be positive. Accruals need two adjacent annual asset balances. Low or high ratios require business context.</p></details>`)}
  <div class="actions"><button class="primary" data-go="compare">Next: compare companies →</button><button data-go="stress">Test a downside scenario</button></div>`;
}

function compare() {
  const rows = bundle.companies.map(c => {
    const r = snapshot.companies[c.ticker].at(-1),
      a = snapshot.ai.scores[c.ticker];
    return [`<button class="table-button" data-company="${c.ticker}">${c.ticker} ↗</button>`, r.period_end, pct(r.ratios.operating_margin), pct(r.ratios.cash_margin), ratio(r.ratios.current_ratio), pct(r.ratios.liabilities_assets), a ? `${a.percentile} / 100` : 'Unavailable'];
  });
  return `<p class="eyebrow">02 / FIND CONTEXT</p><h2>Similar questions. Different businesses.</h2><p class="muted">Compare six selected technology and platform businesses. Their fiscal calendars, business models and capital needs differ.</p>${panel('Financial profiles',table(['Company','Period ended','Operating margin','Cash margin','Current ratio','Liabilities / assets','Anomaly percentile'],rows)+`<p class="note">This is a comparison set, not a sector benchmark or a ranking of investment quality. Some companies have newer fiscal periods. A high anomaly score can reflect exceptional growth or structural differences.</p>`)}${panel('How to use the comparison',`<div class="timeline"><div><strong>1. Start with the business</strong><p>A retailer, a chip designer and a software vendor have different inventory and working-capital needs.</p></div><div><strong>2. Compare the cash margin</strong><p>Ask how much operating cash is generated per dollar of revenue. Then inspect changes over time.</p></div><div><strong>3. Read the maturity note</strong><p>A current ratio gives a snapshot. Debt terms and cash generation determine when funds are needed.</p></div><div><strong>4. Follow the anomaly</strong><p>Use the score to prioritize reading. Confirm the reason in the filing and record uncertainty.</p></div></div>`)}<div class="actions"><button data-go="review">← Back to evidence</button><button class="primary" data-go="stress">Next: test assumptions →</button></div>`;
}
const input = (key, label, min, max, step, help) => `<label>${label}<input type="number" data-assumption="${key}" value="${assumptions[key]}" min="${min}" max="${max}" step="${step}" required><span class="field-help">${help}</span></label>`;

function stress() {
  const rates = bundle.rates.filter(r => r.date <= selectedDate),
    latest = rates.at(-1);
  return `<p class="eyebrow">03 / MAKE THE ASSUMPTIONS EXPLICIT</p><h2>What if the next year is weaker?</h2><p class="muted">Change one assumption at a time. Calculations run here in your browser. Inputs describe your scenario; they are not company guidance.</p>
  <div class="grid equal">${panel('Operating and funding scenario',`<form id="scenario-form" class="fields">${input('revenuePercent','Revenue change (%)',-100,100,1,'Relative to the reported annual revenue.')}${input('marginPoints','Operating-margin change (percentage points)',-50,50,.5,'−2 moves a 20% margin to 18%.')}${input('refinanceBillions','Assumed refinancing exposure (USD billions)',0,1000,1,'Enter an exposure you want to test; not an extracted debt balance.')}${input('rateBps','Incremental financing rate (basis points)',-500,1000,25,'100 basis points = 1 percentage point.')}${input('collectionDays','Extra collection time (days)',0,180,1,'Approximate extra cash tied up in receivables.')}<div class="full actions"><button type="button" id="downside">Try a downside case</button><button type="button" id="reset-scenario">Reset to reported baseline</button></div></form>`)}${panel('Scenario result',`<div id="scenario-results" aria-live="polite"></div><details><summary>Read the formulas and assumptions</summary><div class="formula">R′ = R × (1 + revenue change / 100)<br>Operating income′ = R′ × (operating margin + margin change / 100)<br>Extra interest = assumed exposure × rate shock / 10,000<br>Profit proxy = operating income′ − extra interest<br>Extra cash tied up = R′ / 365 × extra collection days</div><p class="note">Exposure is converted from billions to USD. The profit proxy omits existing interest, taxes and other income. The cash proxy subtracts only delayed collections from reported cash. It is not a full cash-flow forecast or a solvency test. No interactions, financing actions or tax offsets are modeled.</p></details>`)}</div>
  ${panel('A rate shock needs context',latest?`<p>Official Treasury curve observed <strong>${latest.date}</strong>. Rates are percentages per year. This is the latest observation at or before your information date, separate from the annual filing snapshot.</p><div class="kpis">${kpi('3-month Treasury',Number.isFinite(latest['3m'])?latest['3m'].toFixed(2)+'%':'Unavailable','Short-term reference')}${kpi('2-year Treasury',Number.isFinite(latest['2y'])?latest['2y'].toFixed(2)+'%':'Unavailable','Rate expectations context')}${kpi('10-year Treasury',Number.isFinite(latest['10y'])?latest['10y'].toFixed(2)+'%':'Unavailable','Longer-term reference')}${kpi('10-year minus 2-year',Number.isFinite(latest['10y'])&&Number.isFinite(latest['2y'])?((latest['10y']-latest['2y'])*100).toFixed(0)+' bp':'Unavailable','Curve slope')}</div><p class="note">Treasury rates are reference yields, not company borrowing rates. Credit spreads, maturity and hedges matter. <a href="https://home.treasury.gov/treasury-daily-interest-rate-xml-feed" target="_blank" rel="noopener noreferrer">Official source ↗</a></p>`:'<p>No Treasury observation is available for this date.</p>')}
  ${panel('Optional: price a hypothetical bond',`<p class="note">An additional rate-sensitivity check. A fixed-rate bond pays semiannual coupons; this simplified model uses a flat yield, no accrued interest and no credit or option effects.</p><form id="bond-form" class="fields"><label>Coupon (% annually)<input name="couponPercent" type="number" min="0" max="30" step=".25" value="4" required></label><label>Maturity (years)<input name="years" type="number" min=".5" max="50" step=".5" value="10" required></label><label>Starting annual yield (%)<input name="yieldPercent" type="number" min="0" max="30" step=".01" value="${latest?.['10y']??4}" required><span class="field-help">Defaults to the selected 10-year Treasury observation when available.</span></label><label>Yield shock (basis points)<input name="shockBps" type="number" min="-500" max="1000" step="25" value="100" required></label></form><div id="bond-results" aria-live="polite"></div><div class="formula">Price = Σ coupon / (1 + yield / 2)ᵗ + face value / (1 + yield / 2)ᴺ<br>N = 2 × years; face value = $100; coupon per period = face × annual coupon rate / 2.</div><p class="note">This separate bond exercise is not included in the company brief. The exported brief contains the corporate scenario and observed Treasury context.</p>`)}
  <div class="actions"><button data-go="compare">← Back to comparison</button><button class="primary" data-go="brief">Next: export your brief →</button></div>`;
}

function currentBrief() {
  return buildBrief(bundle, snapshot, company, assumptions, selectedDate);
}

function brief() {
  const b = currentBrief();
  return `<div class="no-print"><p class="eyebrow">04 / A RESULT YOU CAN TAKE AWAY</p><h2>Your research brief, with an audit trail.</h2><p class="muted">Use this as an initial review memo, a classroom case or a handoff to another analyst. Add your own conclusion after reading the linked disclosures.</p><div class="actions"><button class="primary" id="export-md">Download brief (.md)</button><button id="export-json">Download evidence (.json)</button><button id="print-brief">Print / save PDF</button><button id="copy-link">Copy this research view</button></div></div>
  <article class="panel brief-paper"><p class="eyebrow">FINSCOPE RESEARCH BRIEF / LEON WANG</p><h2>${e(company.ticker)} · earnings quality and financial resilience</h2><dl><dt>Research question</dt><dd>Does reported profit have cash-flow support, and what changes under a weaker operating scenario?</dd><dt>Information date</dt><dd>${b.requested_date} · financial snapshot ${b.snapshot_date}</dd><dt>Annual period end</dt><dd>${b.annual_period}</dd><dt>Dataset version</dt><dd><code>${b.dataset_sha256}</code></dd><dt>Snapshot built</dt><dd>${e(bundle.generated_at)}</dd></dl><h3>1. What the accounts report</h3>${factsTable(b.facts)}<h4>Ratios and prior-year inputs</h4>${table(['Ratio','Value'],Object.entries(b.ratios).map(([k,v])=>[names[k]||k,ratioFormat(k,v)]))}${b.prior_annual_period?`<p class="note">Growth and average-assets denominators use prior period ${b.prior_annual_period.period_end}. Prior revenue: ${money(b.prior_annual_period.metrics.revenue?.value)}; prior assets: ${money(b.prior_annual_period.metrics.assets?.value)}. Their sourced facts and formulas are included in both downloads.</p>`:''}<h3>2. What deserves follow-up</h3><ul class="question-list">${b.follow_up.map(q=>`<li>${q}</li>`).join('')}</ul><p>${b.anomaly?`Anomaly percentile: <strong>${b.anomaly.percentile}/100</strong>, using ${b.training.samples} earlier company-years. This measures unusualness, not financial distress. Training period ends are strictly before ${b.training.period_end_before}. Latest training filing: ${b.training.latest_filed}.`:'No eligible anomaly score for this selection.'}</p><h3>3. What you assumed</h3>${table(['Assumption','Input'],[['Revenue change',assumptions.revenuePercent+'%'],['Margin change',assumptions.marginPoints+' percentage points'],['Refinancing exposure','$'+assumptions.refinanceBillions+'B (assumed)'],['Incremental financing rate',assumptions.rateBps+' basis points'],['Collection delay',assumptions.collectionDays+' days']])}<h3>4. What changes under those assumptions</h3>${scenarioMarkup(b.scenario,b.scenario_error)}<p class="note">Scenario operating income = reported revenue × (1 + revenue change) × (reported margin + margin-point change). Extra interest = assumed refinancing exposure × rate shock. Cash tied up = scenario revenue / 365 × extra collection days. The profit proxy excludes existing interest and taxes; the cash proxy excludes all other cash movements.</p><h3>5. What this review cannot establish</h3><ul class="question-list">${b.limitations.map(l=>`<li>${e(l)}</li>`).join('')}</ul><h3>6. Your next step</h3><p>Open the latest quarterly filing and annual management discussion. Check the cash-flow bridge and debt maturities. Write whether the evidence supports your initial claim, what remains uncertain, and what additional source would resolve it.</p><p class="note">The downloadable Markdown and JSON include ratio values, model inputs, selected Treasury observation and all source retrieval hashes.</p></article>`;
}

function method() {
  return `<p class="eyebrow">THE PRODUCT STORY / THE ENGINEERING</p><h2>From an interesting chart to a usable review.</h2><div class="grid equal">${panel('The missing step',`<p>The original FinScope lab made model timing and experiments inspectable. Its fictional scenario could teach a method, but it could not answer a real-company financial question or produce a ready-to-share annual review.</p><p>The new workspace fills that gap: reported evidence, interpretation prompts, explicit scenarios and a portable memo belong to the same workflow.</p>`)}${panel('Who can use it today?',`<p><strong>Students:</strong> practice a source-backed financial review with real accounts.</p><p><strong>Independent researchers:</strong> make a first pass across six selected companies.</p><p><strong>Junior analysts:</strong> prepare an initial evidence pack and stress assumptions before deeper diligence.</p><p class="note">This curated universe is small. It does not cover banks, the whole market, real-time prices or every quarterly development.</p>`)}</div>${panel('What we designed',`<div class="timeline"><div><strong>01 · Evidence</strong><p>Period-matched SEC facts. Filing-date filters. Visible missing values and source links.</p></div><div><strong>02 · AI triage</strong><p>Unsupervised Isolation Forest compares six ratios with earlier company-years.</p></div><div><strong>03 · Scenarios</strong><p>Browser calculations connect operating assumptions, financing costs and cash needs.</p></div><div><strong>04 · A deliverable</strong><p>Markdown, JSON and print capture facts, assumptions, formulas and source records.</p></div></div>`)}${panel('Why this is AI + finance',`<p>Financial reasoning defines six comparable ratios. An Isolation Forest uses random partitions to identify profiles that are easier to isolate from the training history. Training-only median imputation handles a limited number of missing features. The model scores current profiles against earlier fiscal periods.</p><p>A deterministic percentile places the anomaly score within the training score distribution. It is a descriptive in-sample reference, not an out-of-sample accuracy estimate. There are no labeled distress outcomes, so the project makes no fraud-detection, default-prediction or return claims.</p><p>Simple ratios remain visible beside the model. Descriptive deviations from training medians help a reader inspect the numbers; they do not claim to explain the forest’s decisions.</p><p><a href="https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html">scikit-learn implementation ↗</a> · <a href="https://github.com/leon1111-wgl/finscope/blob/main/docs/RESEARCH_MODEL.md">Model card and limitations ↗</a></p>`)}${panel('Time, revisions and changing markets',`<p>Historical choices use the nearest saved annual-filing snapshot at or before your date. Each fact must have been filed by that snapshot. Annual flows share a fiscal start and end; balance facts share the period end. Later filings cannot enter an earlier snapshot.</p><p>However, the current SEC API is not a historical raw-data archive. This is filing-day reconstruction, not proof of exact historical information availability. Fiscal calendars differ. The six surviving companies create selection bias. Accounting changes, business-model shifts and nonstationarity can all raise anomaly scores.</p><p>The scheduled build refreshes source data and validates it before deployment. Failed builds leave the last good site available. The banner reports real source dates and warns when the build is older than four days.</p><p><a href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces">Official SEC API ↗</a> · <a href="https://catalog.data.gov/dataset/interest-rate-statistics-daily-treasury-yield-curve-rates">Treasury data and CC0 license ↗</a></p>`)}${panel('Original engineering, clear foundations',`<p>Leon Wang’s contribution is the integrated research workflow: fiscal-period matching, historical selection, evidence provenance, training-boundary checks, transparent stress math and a reproducible brief. It uses established open-source estimators and public official datasets. The contribution is the useful system and its validation, not a new financial theory or a renamed model.</p><div class="actions"><a class="button" href="https://github.com/leon1111-wgl/finscope/blob/main/docs/CASE_STUDY.md">Read the worked case ↗</a><a class="button" href="https://github.com/leon1111-wgl/finscope/blob/main/docs/PRODUCT.md">Product rationale ↗</a><a class="button" href="./lab.html">Open the synthetic forecasting lab ↗</a></div>`)}`;
}

function scenarioMarkup(result, error) {
  if (!result) return `<p class="error">${e(error||'Scenario unavailable')}</p>`;
  return table(['Scenario output', 'USD billions'], [
    ['Scenario revenue', money(result.stressedRevenue)],
    ['Scenario operating income', money(result.operatingIncome)],
    ['Change in operating income', money(result.operatingChange)],
    ['Incremental annual interest', money(result.extraInterest)],
    ['Operating income minus extra interest (proxy)', money(result.profitProxy)],
    ['Additional cash tied up in collections', money(result.cashTiedUp)],
    ['Reported cash minus collection delay (proxy)', money(result.cashRemainingProxy)]
  ]);
}

function updateScenario() {
  const form = $('#scenario-form');
  if (!form) return;
  if (!form.checkValidity()) {
    $('#scenario-results').innerHTML = '<p class="error">Enter a valid number within each field’s range. The current scenario cannot be exported until corrected.</p>';
    return;
  }
  for (const el of form.querySelectorAll('[data-assumption]')) assumptions[el.dataset.assumption] = el.valueAsNumber;
  try {
    $('#scenario-results').innerHTML = scenarioMarkup(stressCompany(row, assumptions));
    updateURL();
  } catch (error) {
    $('#scenario-results').innerHTML = scenarioMarkup(null, error.message);
  }
}

function updateBond() {
  const form = $('#bond-form');
  if (!form) return;
  if (!form.checkValidity()) {
    $('#bond-results').innerHTML = '<p class="error">Use valid numbers within the shown ranges.</p>';
    return;
  }
  try {
    const args = {
      face: 100
    };
    for (const el of form.elements)
      if (el.name) args[el.name] = el.valueAsNumber;
    const r = bondScenario(args);
    $('#bond-results').innerHTML = `<div class="kpis">${kpi('Initial price','$'+r.price.toFixed(2),'Per $100 face value')}${kpi('Shocked price','$'+r.shockedPrice.toFixed(2),'Exact discounted cash flows')}${kpi('Price change',r.changePercent.toFixed(2)+'%','Holding promised cash flows fixed')}${kpi('Modified duration',r.modifiedDuration.toFixed(2),'First-order rate sensitivity')}</div><p class="note">Duration approximation: ${r.durationApproxPercent.toFixed(2)}% price change. The exact calculation also captures curvature.</p>`;
  } catch (error) {
    $('#bond-results').innerHTML = `<p class="error">${e(error.message)}</p>`;
  }
}

function download(text, type, extension) {
  const blob = new Blob([text], {
    type
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `finscope-${company.ticker}-${selectedDate}.${extension}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('#status').textContent = 'Download prepared with this company, date and scenario.';
}

function render() {
  document.body.dataset.page = page;
  document.querySelectorAll('[data-page]').forEach(b => {
    if (b.dataset.page === page) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  $('#content').innerHTML = ({
    review,
    compare,
    stress,
    brief,
    method
  } [page] || review)();
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    show(b.dataset.go);
    $('#workspace').scrollIntoView();
  }));
  document.querySelectorAll('[data-company]').forEach(b => b.addEventListener('click', () => {
    $('#company').value = b.dataset.company;
    page = 'review';
    useSelection();
  }));
  $('#scenario-form')?.addEventListener('submit', ev => ev.preventDefault());
  $('#scenario-form')?.addEventListener('input', updateScenario);
  $('#bond-form')?.addEventListener('submit', ev => ev.preventDefault());
  $('#bond-form')?.addEventListener('input', updateBond);
  $('#downside')?.addEventListener('click', () => {
    assumptions = {
      revenuePercent: -10,
      marginPoints: -2,
      refinanceBillions: 10,
      rateBps: 100,
      collectionDays: 15
    };
    render();
  });
  $('#reset-scenario')?.addEventListener('click', () => {
    assumptions = {
      revenuePercent: 0,
      marginPoints: 0,
      refinanceBillions: 0,
      rateBps: 0,
      collectionDays: 0
    };
    render();
  });
  $('#export-md')?.addEventListener('click', () => download(briefMarkdown(currentBrief()), 'text/markdown;charset=utf-8', 'md'));
  $('#export-json')?.addEventListener('click', () => download(JSON.stringify(currentBrief(), null, 2), 'application/json', 'json'));
  $('#print-brief')?.addEventListener('click', () => window.print());
  $('#copy-link')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      $('#status').textContent = 'Link copied. It includes your company, date and corporate scenario.';
    } catch {
      $('#status').textContent = 'Copy the current browser address; it includes this research view.';
    }
  });
  drawTrend();
  updateScenario();
  updateBond();
  updateURL();
}

function drawTrend() {
  const target = $('#profit-chart');
  if (!target || !snapshot || !company) return;
  const width = Math.max(260, Math.round(target.clientWidth));
  if (target.dataset.width === String(width)) return;
  target.innerHTML = trend(snapshot.companies[company.ticker], width);
  target.dataset.width = String(width);
}
async function init() {
  try {
    const response = await fetch('./data/research.json');
    if (!response.ok) throw new Error(`Evidence request failed (${response.status})`);
    bundle = await response.json();
    if (bundle.data_kind !== 'real_official_financial_evidence') throw new Error('Unexpected data type');
    $('#company').innerHTML = bundle.companies.map(c => `<option value="${c.ticker}">${c.ticker} · ${e(c.name)}</option>`).join('');
    $('#company').value = bundle.companies.some(c => c.ticker === params.get('company')) ? params.get('company') : 'MSFT';
    const dateInput = $('#as-of');
    dateInput.min = bundle.snapshots[0].as_of;
    dateInput.max = bundle.as_of;
    const requested = params.get('date');
    dateInput.value = requested && requested >= dateInput.min && requested <= dateInput.max ? requested : bundle.as_of;
    selectedDate = dateInput.value;
    page = ['review', 'compare', 'stress', 'brief', 'method'].includes(params.get('view')) ? params.get('view') : 'review';
    const proposed = {
      ...assumptions
    };
    for (const k of Object.keys(proposed))
      if (params.has(k)) proposed[k] = Number(params.get(k));
    const first = selectSnapshot(bundle.snapshots, dateInput.value).companies[$('#company').value].at(-1);
    try {
      stressCompany(first, proposed);
      assumptions = proposed;
    } catch {
      /* Invalid shared assumptions fall back to zero-shock baseline. */
    }
    const age = Math.floor((Date.now() - Date.parse(bundle.generated_at)) / 86400000),
      lastRate = bundle.rates.at(-1).date;
    $('#freshness').innerHTML = `<strong>Official-source snapshot</strong> · Built ${e(bundle.generated_at.slice(0,10))} UTC · Treasury observations through ${lastRate} · Six companies · Annual accounts${age>4?` · Refresh overdue: build is ${age} days old.`:''}`;
    if (age > 4) $('#freshness').classList.add('stale');
    $('#company').disabled = false;
    dateInput.disabled = false;
    $('#latest').disabled = false;
    $('#selection').addEventListener('submit', ev => ev.preventDefault());
    $('#company').addEventListener('change', useSelection);
    dateInput.addEventListener('change', useSelection);
    $('#latest').addEventListener('click', () => {
      dateInput.value = bundle.as_of;
      useSelection();
    });
    document.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => show(b.dataset.page)));
    useSelection();
    new ResizeObserver(drawTrend).observe($('#content'));
  } catch (error) {
    $('#status').textContent = error.message;
    $('#content').innerHTML = '<div class="error">The evidence snapshot could not be loaded. Reload the page or <a href="https://github.com/leon1111-wgl/finscope">read the project guide</a>. No placeholder financial values are shown.</div>';
    $('#freshness').textContent = 'Evidence snapshot unavailable.';
  }
}
init();
