import {
  escapeHTML as e,
  safeURL,
  mean,
  modelLabel,
  validateReport,
  selectRows,
  forecastMetrics,
  groupDates,
  strategyView,
  eligibleEvidence,
  selectedExport,
  toCSV
} from './workbench.js';
import {
  lineChart,
  networkChart
} from './charts.js';

const $ = id => document.getElementById(id);
const state = {
  page: 'overview',
  company: 'ALTO',
  horizon: '5',
  model: 'freshness_fusion',
  asOf: '',
  costBps: 10,
  fee: 5,
  slippage: 5,
  kind: 'all',
  secCompany: 'AAPL',
  secDate: ''
};
let report, sec, local = false,
  disposers = [];
const localRun = { pending: false, message: '', error: false };
const titles = {
  overview: ['Overview', 'Risk, in context.',
    'Trace historical forecasts back to their information set.'
  ],
  evidence: ['Evidence', 'Follow the information.',
    'Inspect disclosures, social signals and supply-chain events.'
  ],
  risk: ['Risk Lab', 'Test the simple baseline.',
    'Compare every model on the same matured observations.'
  ],
  strategy: ['Strategy', 'Account for the cost.',
    'Explore a simplified long/cash risk-targeting rule.'
  ],
  audit: ['Data & Audit', 'Make the run inspectable.',
    'Check provenance, chronological splits and local experiments.'
  ],
  research: ['Research', 'Read. Question. Test.',
    'Primary sources behind the evaluation choices.']
};
const fmt = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : 'Unavailable';
const pct = v => Number.isFinite(v) ? `${(v*100).toFixed(2)}%` : 'Unavailable';
const pp = v => Number.isFinite(v) ? `${(v*100).toFixed(2)} pp` : 'Unavailable';
const link = (url, label) => safeURL(url) ?
  `<a href="${e(safeURL(url))}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>` : e(
    label);
const card = (title, body, note = '') =>
  `<article class="card"><div class="card-head"><div><h2>${e(title)}</h2>${note?`<p>${e(note)}</p>`:''}</div></div>${body}</article>`;
const kpi = (label, value, note, teal = false) =>
  `<div class="kpi ${teal?'teal':''}"><div class="kpi-label">${e(label)}</div><div class="kpi-value">${e(value)}</div><small>${e(note)}</small></div>`;
const table = (headers, rows, caption) =>
  `<div class="table-wrap" tabindex="0" role="region" aria-label="${e(caption)}"><table><caption>${e(caption)}</caption><thead><tr>${headers.map(h=>`<th scope="col">${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">No eligible observations.</td></tr>`}</tbody></table></div>`;
const detailsTable = (headers, rows, caption) =>
  `<details><summary>View data table · ${rows.length} rows</summary>${table(headers,rows,caption)}</details>`;
const draw = (id, rows, series, options) => disposers.push(lineChart($(id), rows, series, options));
const cutoff = () => report.config.event_information_cutoff_utc || '16:00:00';
const events = kind => eligibleEvidence(report.evidence, state, cutoff(), kind || state.kind);

function download(value, name, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(
    value, null, 2)], {
    type
  }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function viewExport() {
  return selectedExport(report, state);
}

function exportCSV() {
  const fields = ['date', 'ticker', 'prediction', 'lower', 'upper', 'actual', 'label_end',
    'position', 'turnover', 'gross_return', 'net_return'
  ];
  download(toCSV(viewExport().rows, fields),
    `finscope-${state.company}-${state.horizon}d-${state.asOf}-${state.costBps}bps.csv`,
    'text/csv;charset=utf-8');
}

function forecastPanel(rows) {
  const series = groupDates(rows, ['prediction', 'actual', 'lower', 'upper']);
  const label = state.company === 'all' ? 'Mean ticker volatility' : 'Ticker volatility';
  return {
    series,
    html: card('Historical risk forecast',
      `<div class="legend"><span>Prediction</span><span style="--c:var(--blue)">Later observed, if matured</span></div><div id="forecast-chart" class="chart"></div><p class="chart-summary">${e(label)} · annualized % · ${state.horizon}-session horizon. Shading shows a past-residual interval, not a guaranteed confidence level.</p>${detailsTable(['Decision date','Prediction','Observed','Lower','Upper'],series.map(r=>[e(r.date),pct(r.prediction),pct(r.actual),pct(r.lower),pct(r.upper)]),'Annualized volatility by decision date')}`,
      'Only labels ending on or before the selected date are revealed.')
  };
}

function eventList(items, limit = 15) {
  if (!items.length) return '<div class="empty">No events were usable for this selection.</div>';
  return `<div class="evidence-list">${items.slice(0,limit).map(x=>`<article class="event"><div class="event-meta"><span class="kind">${e(x.kind)} · ${e(x.ticker)}</span><time>${e(x.usable_at.slice(0,10))}</time></div><p>${e(x.text)}</p><div class="note">${link(x.source,x.source)}</div><details><summary>Inspect timestamps and fields</summary><p>Occurred: ${e(x.event_time)}<br>Public: ${e(x.available_at)}<br>Ingested: ${e(x.ingested_at)}<br>Usable: ${e(x.usable_at)}<br>ID: ${e(x.id)}${x.delay_days!==undefined?`<br>Supplied delay: ${e(x.delay_days)} days`:''}${x.revenue_growth!==undefined?`<br>Supplied revenue growth: ${pct(x.revenue_growth)}`:''}${x.relationship?`<br>Reported relationship: ${e(x.relationship)}`:''}</p></details></article>`).join('')}</div>${items.length>limit?`<p class="note">Showing ${limit} of ${items.length} eligible events. The selected JSON export includes all of them.</p>`:''}`;
}

function overview(rows) {
  const metrics = forecastMetrics(rows),
    plot = forecastPanel(rows);
  const latestDate = rows.at(-1)?.date,
    latest = rows.filter(r => r.date === latestDate);
  $('content').innerHTML =
    `<div class="kpis">${kpi('Latest historical forecast',pct(mean(latest.map(r=>r.prediction))),latestDate||'No date',true)}${kpi('Mean absolute error',pp(metrics.mae),`${metrics.count} matured ticker labels`)}${kpi('Observed interval coverage',pct(metrics.coverage),'Nominal level 90%; coverage can change')}${kpi('Usable evidence',String(events('all').length),`Available and ingested by ${cutoff()} UTC`)}</div><div class="grid">${plot.html}${card('Read the result in three steps',`<div class="audit-step"><span>01 / INFORMATION</span><h3>What was known?</h3><p>Events enter only after both publication and ingestion. The early event cutoff is separate from the market close.</p></div><div class="audit-step"><span>02 / FORECAST</span><h3>What did the model expect?</h3><p>The target is future volatility, not the stock price. A higher value means a larger expected range of daily returns.</p></div><div class="audit-step"><span>03 / EVALUATION</span><h3>What happened later?</h3><p>Compare only labels that have finished. Then inspect costs and failure periods before drawing a conclusion.</p></div><button class="button" data-go="risk">Compare model variants →</button>`)}</div>${card('Latest usable evidence',eventList(events('all'),3),'Authored fictional events in the demo; user-supplied text in local imports.')}`;
  draw('forecast-chart', plot.series, [{
    key: 'prediction',
    label: 'Prediction'
  }, {
    key: 'actual',
    label: 'Observed'
  }], {
    title: 'Historical annualized volatility',
    band: true
  });
}

function evidenceView() {
  const usable = events(),
    relations = events('all').filter(x => x.relationship).map(x => ({
      source: x.ticker,
      target: x.relationship
    }));
  const edges = [...new Map(relations.map(x => [`${x.source}|${x.target}`, x])).values()];
  $('content').innerHTML =
    `<div class="grid">${card('Information timeline',`<div class="controls"><label class="field">Evidence type<select id="evidence-kind">${['all','filing','social','supply'].map(k=>`<option value="${k}" ${state.kind===k?'selected':''}>${k==='all'?'All events':k}</option>`).join('')}</select></label></div><p class="note">Usability = later of public availability and ingestion. Cutoff: ${e(state.asOf)} at ${e(cutoff())} UTC. This early information cutoff is not the market close.</p>${eventList(usable,30)}`)}${card('Supplied relationships',`<div id="network-chart" class="chart"></div>${detailsTable(['Source','Related ticker'],edges.map(x=>[e(x.source),e(x.target)]),'Eligible supplied relationships')}<p class="note">Descriptive connections from usable supplied events. This is not a trained graph model or proof of economic causality.</p><h3>What these signals mean</h3><p class="note">Social text uses a small English word list. Zero can mean no matched words. Supply delays are reported fields. Neither source is independently verified.</p>`)}</div>${secPanel()}`;
  networkChart($('network-chart'), edges, report.companies);
  $('evidence-kind').onchange = ev => {
    state.kind = ev.target.value;
    render();
  };
  bindSEC();
}

function secPanel() {
  if (!sec) return card('Real SEC financial facts',
    '<p class="empty">SEC snapshot unavailable. Forecast exploration remains available.</p>');
  const company = sec.companies.find(c => c.ticker === state.secCompany) || sec.companies[0];
  const facts = Object.entries(company.facts).filter(([, f]) => f && f.filed <= state.secDate);
  return card('Real SEC financial facts',
    `<p class="note warning">Separate dataset. These facts are not joined to fictional prices or forecasts. SEC filters below are independent of the experiment filters.</p><div class="controls"><label class="field">SEC company<select id="sec-company">${sec.companies.map(c=>`<option value="${e(c.ticker)}" ${c.ticker===company.ticker?'selected':''}>${e(c.ticker)} · ${e(c.name)}</option>`).join('')}</select></label><label class="field">SEC filed by (end of day)<input id="sec-date" type="date" value="${e(state.secDate)}" max="${e(sec.as_of)}"></label></div>${table(['Concept','Value','Unit','Fact period','Filed','Filing'],facts.map(([name,f])=>[e(name.replaceAll('_',' ')),e(Number(f.value).toLocaleString('en-US')),e(f.unit),e(f.start?`${f.start} to ${f.end}`:`At ${f.end}`),e(f.filed),link(f.accession_url,f.accession)]),'Selected real facts, each with its own period')}<p class="note">Retrieved ${e(company.source.retrieved_at)}. This snapshot stores selected facts, not every historical vintage. An earlier date may have no matching facts. Current retrieval cannot prove historically archived bytes.</p><details><summary>Source and parser provenance</summary><p>${link(company.source.url,'Official CompanyFacts')} · EdgarTools ${e(company.edgartools.version)}: ${company.edgartools.executed?'executed':'not executed'} (${e(company.edgartools.fact_count)} facts parsed).</p><p class="hash">SHA-256 ${e(company.source.raw_sha256)}</p></details>`
    );
}

function bindSEC() {
  if (!sec) return;
  $('sec-company').onchange = ev => {
    state.secCompany = ev.target.value;
    render();
  };
  $('sec-date').onchange = ev => {
    state.secDate = ev.target.value || sec.as_of;
    render();
  };
}

function riskView(rows) {
  const exp = report.experiments[state.horizon],
    variants = Object.keys(exp.models).map(model => {
      const metrics = forecastMetrics(selectRows(report, {
        ...state,
        model
      }));
      return {
        model,
        ...metrics
      };
    });
  const baseline = variants.find(v => v.model === 'historical_volatility')?.mae;
  const matured = rows.filter(r => Number.isFinite(r.actual));
  const daily = groupDates(matured.map(r => ({
    ...r,
    error: Math.abs(r.prediction - r.actual)
  })), ['error']);
  const rolling = daily.map((r, i) => ({
    date: r.date,
    error: mean(daily.slice(Math.max(0, i - 19), i + 1).map(x => x.error))
  }));
  const regimes = [
    ['Low', r => r.past_volatility < .15],
    ['Medium', r => r.past_volatility >= .15 && r.past_volatility < .30],
    ['High', r => r.past_volatility >= .30]
  ];
  $('content').innerHTML = card('Factor ablation', table(['Model', 'Matured labels', 'MAE', 'RMSE',
        'Coverage', 'MAE vs baseline'
      ], variants.map(v => [e(modelLabel(v.model)), String(v.count), pp(v.mae), pp(v.rmse), pct(v
          .coverage), Number.isFinite(v.mae) && Number.isFinite(baseline) ?
        `${(100*(v.mae-baseline)).toFixed(2)} pp` : 'Unavailable'
      ]), 'Same selected company, horizon and matured date range') +
      '<p class="note">Lower error is better. A positive delta means worse than the simple baseline. These differences are comparisons, not causal feature attribution. All predetermined variants remain visible.</p>'
      ) +
    `<div class="grid">${card('Rolling forecast error',`<div id="error-chart" class="chart"></div>${detailsTable(['Decision date','Rolling MAE'],rolling.map(r=>[e(r.date),pp(r.error)]),'Trailing 20 available decision-date errors')}<p class="note">Uses matured labels only. The x-axis is the forecast origin, not the later date when the outcome became known. The first windows contain fewer than 20 observations.</p>`)}${card('Error by past volatility',table(['Past-vol regime','Labels','MAE'],regimes.map(([name,predicate])=>{const m=forecastMetrics(matured.filter(predicate));return [name,String(m.count),pp(m.mae)];}),'Regimes use past volatility: below 15%, 15–30%, at least 30%')+'<p class="note">These are diagnostic groups. They do not identify a causal market regime.</p>')}</div>` +
    card('Input drift · complete-run context', table(['Model', 'Mean input PSI'], Object.entries(exp
          .models).map(([name, m]) => [e(modelLabel(name)), fmt(m.mean_input_psi, 3)]),
        'Full retrospective experiment, all companies and dates; not filtered by selected decision date'
        ) +
      `<p class="note">PSI compares input distributions with training-fitted bins. Values near 0.10 and 0.25 are discussion heuristics. They are not statistical tests or automatic deployment triggers. A change in inputs and a change in prediction error are different observations.</p><h3>What this model uses</h3><p class="formula">${exp.models[state.model].features.map(e).join(' · ')}</p><p class="note">Rolling refits use fixed hyperparameters. This is not a DoubleAdapt implementation. Repeated exploration of this dataset does not create an untouched final holdout.</p>`
      );
  draw('error-chart', rolling, [{
    key: 'error',
    label: 'Rolling MAE'
  }], {
    title: 'Rolling mean absolute error',
    unit: 'pp',
    axisLabel: 'Annualized volatility error (percentage points)'
  });
}

function strategyPage(rows) {
  const view = strategyView(rows, state.costBps),
    m = view.metrics;
  $('content').innerHTML =
    `<div class="kpis">${kpi('Net cumulative return',pct(m.total_return),`${state.costBps} bps per unit turnover`,true)}${kpi('Maximum drawdown',pct(m.maximum_drawdown),'From the running wealth peak')}${kpi('Annualized volatility',pct(m.annualized_volatility),'252 observed sessions per year')}${kpi('Sharpe ratio',fmt(m.sharpe_zero_cash_rate),'Cash and risk-free rate assumed zero')}</div>${card('Cost assumptions',`<div class="controls"><label class="field">Fee: ${state.fee} bps<input id="fee" type="range" min="0" max="50" step="1" value="${state.fee}"></label><label class="field">Slippage: ${state.slippage} bps<input id="slippage" type="range" min="0" max="100" step="1" value="${state.slippage}"></label><button id="export-csv" class="button">Export selected CSV ↓</button></div><p class="formula">net return = executed gross return − turnover × (fee + slippage) / 10,000</p><p class="note">One basis point is 0.01%. Costs apply to entry and position changes. Buy-and-hold pays an initial entry cost. This simplified calculation omits market impact and price-induced rebalancing turnover.</p>`)}${card('Growth after costs',`<div class="legend"><span>Selected strategy</span><span style="--c:var(--blue)">Buy-and-hold comparison</span></div><div id="strategy-chart" class="chart"></div>${detailsTable(['Date','Net daily return','Strategy growth','Buy-and-hold growth'],view.daily.map((r,i)=>[e(r.date),pct(r.net_return),pct(r.cumulative_return),pct(view.buyHold[i]?.cumulative_return)]),'Cumulative returns from the first selected evaluation date')}<p class="note">Same evaluation dates and ticker set. All-company returns use equal weights reset each day. Signal changes first affect returns two close indices later. Positions remain marked to market at the end; no forced liquidation is simulated.</p>`)}${card('Understand the rule',`<p class="formula">target position = min(1, 20% / predicted annualized volatility)</p><p>If predicted volatility rises, this rule holds less of the asset. The remaining allocation earns zero in cash. It does not predict whether prices will rise.</p><p class="note">Synthetic returns demonstrate accounting behavior. They do not establish real trading performance, capacity or executable fills.</p>`)}`;
  const chart = view.daily.map((r, i) => ({
    ...r,
    buy_hold: view.buyHold[i]?.cumulative_return
  }));
  draw('strategy-chart', chart, [{
    key: 'cumulative_return',
    label: 'Strategy'
  }, {
    key: 'buy_hold',
    label: 'Buy and hold'
  }], {
    title: 'Net cumulative returns',
    axisLabel: 'Cumulative return (%)'
  });
  for (const key of ['fee', 'slippage']) $(key).onchange = ev => {
    state[key] = Number(ev.target.value);
    state.costBps = state.fee + state.slippage;
    render();
    $(key).focus();
  };
  $('export-csv').onclick = exportCSV;
}

function auditPage() {
  const splits = report.audit.splits_by_horizon?.[state.horizon] || report.audit.splits || [];
  const quality = report.audit.quality || {};
  $('content').innerHTML = card('Run provenance',
      `<div class="metric-row"><span>Data origin</span><strong>${e(report.provenance.data_kind)}</strong></div><div class="metric-row"><span>Availability claim</span><strong>${e(report.provenance.availability_claim)}</strong></div><div class="metric-row"><span>Generated</span><strong>${e(report.provenance.generated_at)}</strong></div><div class="metric-row"><span>Rows / events</span><strong>${e(report.audit.price_rows)} / ${e(report.audit.event_rows)}</strong></div><p class="hash">Dataset SHA-256: ${e(report.provenance.dataset_sha256)}</p><details><summary>Versions and quality counters</summary><pre class="formula">${e(JSON.stringify({versions:report.provenance.package_versions,seed:report.provenance.seed,quality},null,2))}</pre></details><div class="controls"><button class="button" id="raw-report">Download original run JSON</button><a href="./data/demo-prices.csv" id="demo-prices">Demo prices CSV ↓</a><a href="./data/demo-events.json" id="demo-events">Demo events JSON ↓</a></div><p class="note">Original run download retains its default costs and full retrospective metadata. Use Export selected view for the current filters and costs.</p>`
      ) + card('Chronological partitions', table(['Train origins', 'Last train label',
          'Calibration origins', 'Last calibration label', 'Test origins'
        ], splits.map(s => [e(`${s.train_start} → ${s.train_last_origin}`), e(s
          .train_last_label_end), e(`${s.calibration_start} → ${s.calibration_last_origin}`), e(
          s.calibration_last_label_end), e(`${s.test_start} → ${s.test_end}`)]),
        'Original full-run splits; not a simulated retraining at the selected date') +
      '<p class="formula">last training label &lt; calibration start<br>last calibration label &lt; test start</p><p class="note">Preprocessing fits training rows only. Separate calibration labels set residual intervals. Overlapping future labels are purged between stages.</p>'
      ) + card('Known limits',
      `<ul class="readable-list">${report.audit.warnings.map(w=>`<li>${e(w)}</li>`).join('')}</ul>`
      ) + card('Run your own local experiment',
      `<p>${local?'Local engine connected. Files are processed on this computer.':'This GitHub-compatible snapshot cannot train models. Start the local service from the repository to enable these controls.'}</p><p class="note">Prices: date, ticker, adjusted close, volume. Events: timestamped JSON; optional when no text/log data is available. Imported historical timestamps remain unverified.</p><form id="upload-form" class="upload-grid"><label class="field">Prices CSV<input id="prices-file" type="file" accept=".csv,text/csv" required ${local?'':'disabled'}></label><label class="field">Events JSON (optional)<input id="events-file" type="file" accept=".json,application/json" ${local?'':'disabled'}></label><label class="field">Forecast horizon<select id="run-horizon" ${local?'':'disabled'}><option value="5">5 sessions</option><option value="20">20 sessions</option></select></label><label class="field">Seed<input id="seed" type="number" value="42" min="0" max="2147483647" ${local?'':'disabled'}></label><button class="button primary" id="run-button" ${local?'':'disabled'}>Run local experiment</button><button class="button" type="button" id="load-demo">Restore synthetic snapshot</button></form><div id="upload-status" role="status" aria-live="polite"></div><p>${link('https://github.com/leon1111-wgl/finscope#run-locally','Local setup and input documentation')}</p><div id="run-history" class="history"></div>`
      );
  $('raw-report').onclick = () => download(report, 'finscope-original-run.json');
  $('load-demo').onclick = () => loadDemo().catch(showError);
  $('upload-form').onsubmit = runLocal;
  renderRunState();
  if (local) loadHistory();
}

function renderRunState() {
  for (const id of ['prices-file', 'events-file', 'run-horizon', 'seed', 'run-button']) {
    if ($(id)) $(id).disabled = !local || localRun.pending;
  }
  if ($('load-demo')) $('load-demo').disabled = localRun.pending;
  if ($('upload-status')) $('upload-status').textContent = localRun.message;
  if (localRun.message) {
    $('status').textContent = localRun.message;
    $('status').className = localRun.error ? 'status error' : 'status';
  }
}

function researchPage() {
  const papers = [
    ['Lopez-Lira & Tang', 'Can ChatGPT Forecast Stock Price Movements?',
      'arXiv, cited revision v6 · 2025', 'https://arxiv.org/abs/2304.07619v6',
      'Distinguish a price reaction from a trade you could actually execute.',
      'Implemented: availability clocks and delayed execution. No LLM result is reproduced.'
    ],
    ['Kong et al., including Lopez-Lira',
      'Evaluating LLMs in Finance Requires Explicit Bias Consideration',
      'Preprint / position paper · 2026', 'https://arxiv.org/abs/2602.14233',
      'Look-ahead, survivorship, narrative, objective and cost biases need separate checks.',
      'Implemented: provenance, full ablations and cost controls. These checks do not certify imported timestamps.'
    ],
    ['Zhao, Kong & Shen', 'DoubleAdapt', 'KDD · 2023', 'https://arxiv.org/abs/2306.09862',
      'Data adaptation and model adaptation address different parts of changing markets.',
      'Inspired: rolling refits and drift diagnostics. The learned adapters are not implemented.'
    ],
    ['Das, Kong, Sen & Zhou', 'A decoder-only foundation model for time-series forecasting',
      'ICML · 2024', 'https://proceedings.mlr.press/v235/das24c.html',
      'Pretrained time-series models motivate a useful future comparison.',
      'Not implemented: TimesFM. Any future baseline needs a checkpoint-date and dataset-overlap audit.'
    ],
    ['Xu & Xie', 'Conformal prediction interval for dynamic time-series', 'ICML · 2021',
      'https://proceedings.mlr.press/v139/xu21h.html',
      'Time-series uncertainty must account for dependence and changing data.',
      'Inspired: separate past-residual calibration. This implementation is not EnbPI and inherits no guarantee.'
    ],
    ['Chen et al.', 'Does Training on Future Data Pay?', 'Preprint · 2026',
      'https://arxiv.org/abs/2609.20554',
      'Temporal exposure can invalidate an information set even when the resulting score gets worse.',
      'Design rule: audit information timing independently of performance. Recent findings are not settled consensus.'
    ]
  ];
  $('content').innerHTML = card('From research to a testable workflow',
      '<p>Imagine a supplier reports a delay on Monday, but your data feed receives it on Tuesday. A Monday forecast must not use it. Start with that small rule, then apply the same question to filings, model training, retrieval indexes and revised datasets.</p><p class="note">FinScope is an original application built on scikit-learn and an executed EdgarTools parsing integration. Ridge regression, TF-IDF and point-in-time research are established methods, not inventions claimed by this project.</p>'
      ) +
    `<div class="papers">${papers.map(([authors,title,venue,url,lesson,status])=>`<article class="paper"><small>${e(venue)}</small><h3>${link(url,title)}</h3><p>${e(authors)}</p><p>${e(lesson)}</p><p>${e(status)}</p></article>`).join('')}</div>` +
    card('Before claiming real-world performance',
      '<ol class="readable-list"><li>Use a historically valid universe, including failures and delistings when relevant.</li><li>Track source release, ingestion, revisions and pretrained-model knowledge dates.</li><li>Choose the target and experiment settings before opening the final holdout.</li><li>Compare simple baselines on the same dates. Preserve unsuccessful variants.</li><li>Check costs, latency, regime shifts and prospective results.</li></ol><p class="note">This public synthetic benchmark supports development and explanation. It is not an untouched economic validation set. No high-frequency execution, learned graph network or pretrained financial language model is delivered in this version.</p>'
      );
}

function showError(error) {
  $('status').className = 'status error';
  $('status').textContent = error.message || String(error);
}

function syncFilters(reset = false) {
  const horizons = Object.keys(report.experiments);
  if (!horizons.includes(state.horizon)) state.horizon = horizons[0];
  if (!report.companies.some(c => c.ticker === state.company) && state.company !== 'all') state
    .company = report.companies[0].ticker;
  const exp = report.experiments[state.horizon],
    models = Object.keys(exp.models);
  if (!models.includes(state.model)) state.model = models[0];
  const dates = exp.observations.map(r => r.date).sort();
  if (reset || !state.asOf || state.asOf > dates.at(-1)) state.asOf = dates.at(-1);
  if (state.asOf < dates[0]) state.asOf = dates[0];
  $('company').innerHTML =
    `<option value="all">All companies · equal sleeves</option>${report.companies.map(c=>`<option value="${e(c.ticker)}">${e(c.ticker)} · ${e(c.name)}</option>`).join('')}`;
  $('horizon').innerHTML = horizons.map(h => `<option value="${e(h)}">${e(h)} sessions</option>`)
    .join('');
  $('model').innerHTML = models.map(m => `<option value="${e(m)}">${e(modelLabel(m))}</option>`)
    .join('');
  for (const id of ['company', 'horizon', 'model']) {
    $(id).value = state[id];
    $(id).disabled = false;
  }
  Object.assign($('as-of'), {
    min: dates[0],
    max: dates.at(-1),
    value: state.asOf,
    disabled: false
  });
  $('export-json').disabled = false;
}

function render() {
  if (!report) return;
  disposers.forEach(dispose => dispose());
  disposers = [];
  $('status').textContent = '';
  $('status').className = 'status';
  const [name, title, subtitle] = titles[state.page];
  $('page-name').textContent = name;
  $('page-title').textContent = title;
  $('page-subtitle').textContent = subtitle;
  document.querySelectorAll('[data-page]').forEach(button => {
    if (button.dataset.page === state.page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('data-badge').textContent = report.provenance.data_kind === 'synthetic' ? 'Synthetic demo' :
    'User import · unverified';
  $('mode-badge').textContent = local ? 'Local engine' : 'Snapshot explorer';
  $('origin-note').textContent = report.provenance.data_kind === 'synthetic' ?
    'Fictional companies and authored events. This historical scenario demonstrates the workflow; it is not evidence of market alpha.' :
    'User-supplied data. Historical availability, corporate actions and universe coverage are not independently verified.';
  $('scope').textContent =
    `${state.company==='all'?'All companies · mean ticker forecasts':state.company} / ${state.horizon} sessions / ${modelLabel(state.model)} / through ${state.asOf}. Matured outcomes only. Full-run audit and independent SEC views are labelled separately.`;
  try {
    const rows = selectRows(report, state);
    ({
      overview: () => overview(rows),
      evidence: evidenceView,
      risk: () => riskView(rows),
      strategy: () => strategyPage(rows),
      audit: auditPage,
      research: researchPage
    })[state.page]();
    document.querySelectorAll('[data-go]').forEach(button => button.onclick = () => navigate(button
      .dataset.go));
    renderRunState();
  } catch (error) {
    $('content').innerHTML = '';
    showError(error);
  }
}

function navigate(page) {
  if (!titles[page]) return;
  state.page = page;
  history.replaceState(null, '', `#${page}`);
  render();
  $('main').focus({
    preventScroll: true
  });
}
async function requestJSON(url, options = {}, timeout = 60000) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeout)
  });
  const body = await response.json().catch(() => ({
    detail: `HTTP ${response.status}`
  }));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail :
    `Request failed (${response.status}). Check the input schema and local service logs.`);
  return body;
}
async function loadDemo() {
  report = validateReport(await requestJSON('./data/report.json'));
  localRun.message = '';
  localRun.error = false;
  state.costBps = report.config.cost_bps;
  state.fee = state.costBps / 2;
  state.slippage = state.costBps / 2;
  syncFilters(true);
  render();
}
async function runLocal(event) {
  event.preventDefault();
  if (!local || localRun.pending) return;
  const prices = $('prices-file').files[0],
    eventFile = $('events-file').files[0],
    horizon = Number($('run-horizon').value),
    seed = Number($('seed').value);
  localRun.pending = true;
  localRun.error = false;
  localRun.message = 'Running on this computer. Validating inputs and fitting chronological windows…';
  renderRunState();
  try {
    if (!prices) throw new Error('Choose a prices CSV first.');
    if (prices.size + (eventFile?.size || 0) > 8 * 1024 * 1024) throw new Error(
      'Selected files exceed the 8 MiB local upload limit.');
    const body = {
      prices_csv: await prices.text(),
      events_json: eventFile ? await eventFile.text() : '[]',
      horizon,
      seed
    };
    const result = validateReport(await requestJSON('/api/experiments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }, 90000));
    report = result;
    state.horizon = String(body.horizon);
    syncFilters(true);
    localRun.message =
      `Run ${result.run_id||''} completed. User-supplied provenance remains unverified.`;
  } catch (error) {
    localRun.error = true;
    localRun.message = `Experiment failed: ${error.message}`;
  } finally {
    localRun.pending = false;
    render();
  }
}
async function loadHistory() {
  const container = $('run-history');
  try {
    const response = await requestJSON('/api/runs');
    const runs = Array.isArray(response) ? response : response.runs;
    if (!Array.isArray(runs)) throw new Error('Invalid run history response.');
    container.innerHTML =
      `<h3>Saved local runs</h3>${runs.length?runs.map(r=>`<button class="button" data-run="${e(r.run_id||r.id)}">${e(r.generated_at)} · ${e(r.data_kind)} · ${e(r.run_id||r.id)}</button>`).join(''):'<p class="note">No saved local runs.</p>'}`;
    if (response.unreadable_runs) container.insertAdjacentHTML('beforeend',
      `<p class="note warning">${e(response.unreadable_runs)} saved run(s) could not be read. Inspect the local runs directory.</p>`);
    container.querySelectorAll('[data-run]').forEach(button => button.onclick = async () => {
      if (localRun.pending) return;
      try {
        report = validateReport(await requestJSON(
          `/api/runs/${encodeURIComponent(button.dataset.run)}`));
        localRun.message = '';
        localRun.error = false;
        syncFilters(true);
        render();
      } catch (error) {
        showError(error);
      }
    });
  } catch (error) {
    container.textContent = `Run history unavailable: ${error.message}`;
  }
}
for (const id of ['company', 'horizon', 'model']) $(id).onchange = event => {
  state[id] = event.target.value;
  syncFilters();
  render();
};
$('as-of').onchange = event => {
  state.asOf = event.target.value;
  syncFilters();
  render();
};
$('filters').onsubmit = event => event.preventDefault();
$('export-json').onclick = () => {
  try {
    download(viewExport(), `finscope-view-${state.asOf}-${state.costBps}bps.json`);
  } catch (error) {
    showError(error);
  }
};
document.querySelectorAll('[data-page]').forEach(button => button.onclick = () => navigate(button
  .dataset.page));
async function start() {
  const hash = location.hash.slice(1);
  if (titles[hash]) state.page = hash;
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
  const [snapshotResult, secResult, healthResult] = await Promise.allSettled([
    requestJSON('./data/report.json'), requestJSON('./data/sec.json'),
    loopback ? requestJSON('/api/health', {}, 2000) : Promise.resolve(null)
  ]);
  if (snapshotResult.status === 'rejected') {
    showError(new Error(
      'The research snapshot could not load. Refresh the page or serve web/ through a local HTTP server.'
      ));
    return;
  }
  if (secResult.status === 'fulfilled') {
    sec = secResult.value;
    state.secDate = sec.as_of;
  }
  local = healthResult.status === 'fulfilled' && healthResult.value?.status === 'ok' &&
    healthResult.value?.mode === 'local';
  try {
    report = validateReport(snapshotResult.value);
    syncFilters(true);
    render();
  } catch (error) {
    showError(error);
  }
}
start();
