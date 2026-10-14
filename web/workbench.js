/** Pure report operations shared by the UI and numeric regression tests. */
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
} [c]));
export function safeURL(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function netReturn(assetReturn, position, turnover, costBps) {
  return (assetReturn * position * 10000 - turnover * costBps) / 10000;
}
export const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length :
  null;
export const modelLabel = name => ({
  historical_volatility: 'Historical volatility',
  price: 'Price only',
  price_filing: 'Price + filings',
  price_filing_alternative: 'Price + filings + alternative',
  freshness_fusion: 'Freshness-aware fusion'
} [name] || name);
export function validateReport(report) {
  if (report?.schema_version !== '1.0.0' || !report.companies?.length || !report.experiments || !
    report.provenance || !report.config || !Array.isArray(report.evidence)) throw new Error(
    'Unsupported or incomplete report. Expected FinScope schema 1.0.0.');
  for (const exp of Object.values(report.experiments)) {
    if (!Array.isArray(exp.observations) || !exp.observations.length || !exp.models)
    throw new Error('Report has no experiment observations.');
    for (const model of Object.values(exp.models))
      if (!Array.isArray(model.series) || !model.series.length) throw new Error(
        'Report has no model series.');
  }
  return report;
}
export function selectRows(report, state) {
  const exp = report.experiments[String(state.horizon)];
  if (!exp?.models[state.model]) return [];
  const observations = new Map(exp.observations.map(r => [`${r.date}|${r.ticker}`, r]));
  return exp.models[state.model].series.filter(r => r.date <= state.asOf && (state.company ===
    'all' || r.ticker === state.company)).map(r => {
    const observed = observations.get(`${r.date}|${r.ticker}`);
    if (!observed) throw new Error('A forecast has no matching observation.');
    const matured = observed.label_end <= state.asOf;
    return {
      ...observed,
      ...r,
      actual: matured ? observed.actual : null,
      matured
    };
  });
}
export function forecastMetrics(rows) {
  const usable = rows.filter(r => Number.isFinite(r.actual));
  return {
    count: usable.length,
    mae: mean(usable.map(r => Math.abs(r.prediction - r.actual))),
    rmse: usable.length ? Math.sqrt(mean(usable.map(r => (r.prediction - r.actual) ** 2))) : null,
    bias: mean(usable.map(r => r.prediction - r.actual)),
    coverage: mean(usable.map(r => +(r.actual >= r.lower && r.actual <= r.upper))),
    mean_interval_width: mean(usable.map(r => r.upper - r.lower))
  };
}
export function groupDates(rows, fields) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.date)) groups.set(r.date, []);
    groups.get(r.date).push(r);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([date, rs]) => Object.fromEntries([
    ['date', date], ...fields.map(f => [f, mean(rs.map(r => r[f]).filter(Number.isFinite))])
  ]));
}
export function strategyView(rows, costBps) {
  if (!Number.isFinite(costBps) || costBps < 0 || costBps > 1000) throw new Error(
    'Total cost must be between 0 and 1,000 bps.');
  const adjusted = rows.map(r => ({
    ...r,
    net_return: r.gross_return - r.turnover * costBps / 10000
  }));
  const tickers = new Set(rows.map(r => r.ticker)),
    dates = new Map();
  for (const r of rows) {
    if (!dates.has(r.date)) dates.set(r.date, new Set());
    if (dates.get(r.date).has(r.ticker)) throw new Error('Duplicate ticker/date strategy rows.');
    dates.get(r.date).add(r.ticker);
  }
  if ([...dates.values()].some(t => t.size !== tickers.size)) throw new Error(
    'Strategy requires a complete common-date ticker panel.');
  const daily = groupDates(adjusted, ['net_return', 'turnover', 'position']);
  const buyHoldRows = [];
  for (const ticker of tickers) {
    let previous = null;
    for (const r of rows.filter(r => r.ticker === ticker).sort((a, b) => a.date.localeCompare(b
        .date))) {
      const gross = previous === null ? 0 : r.close / previous - 1;
      buyHoldRows.push({
        date: r.date,
        ticker,
        net_return: gross - (previous === null ? costBps / 10000 : 0)
      });
      previous = r.close;
    }
  }
  const buyHold = groupDates(buyHoldRows, ['net_return']);

  function compound(series) {
    let wealth = 1;
    for (const r of series) {
      if (!Number.isFinite(r.net_return) || r.net_return <= -1) throw new Error(
        'Cost-adjusted return exhausts capital or is non-finite.');
      wealth *= 1 + r.net_return;
      if (!Number.isFinite(wealth)) throw new Error(
        'Cumulative return exceeds the supported numeric range.');
      r.cumulative_return = wealth - 1;
    }
  }
  compound(daily);
  compound(buyHold);
  const values = daily.map(r => r.net_return),
    avg = mean(values);
  let peak = 1,
    drawdown = 0;
  for (const r of daily) {
    peak = Math.max(peak, 1 + r.cumulative_return);
    drawdown = Math.min(drawdown, (1 + r.cumulative_return) / peak - 1);
  }
  const vol = values.length ? Math.sqrt(mean(values.map(v => (v - avg) ** 2)) * 252) : null;
  return {
    rows: adjusted,
    daily,
    buyHold,
    metrics: {
      total_return: daily.length ? daily.at(-1).cumulative_return : null,
      annualized_volatility: vol,
      sharpe_zero_cash_rate: vol ? avg / vol * 252 : values.length ? 0 : null,
      maximum_drawdown: daily.length ? drawdown : null,
      mean_daily_turnover: mean(daily.map(r => r.turnover))
    }
  };
}
export function eligibleEvidence(events, state, cutoff = '16:00:00', kind = 'all') {
  const end = Date.parse(`${state.asOf}T${cutoff}Z`);
  return events.map(e => ({
    ...e,
    usable_at: new Date(Math.max(Date.parse(e.available_at), Date.parse(e.ingested_at)))
      .toISOString()
  })).filter(e => Date.parse(e.usable_at) <= end && (state.company === 'all' || e.ticker === state
    .company) && (kind === 'all' || e.kind === kind)).sort((a, b) => b.usable_at.localeCompare(a
    .usable_at));
}
export function selectedExport(report, state) {
  const rows = selectRows(report, state),
    strategy = strategyView(rows, state.costBps);
  const evidence = eligibleEvidence(report.evidence, state, report.config
    .event_information_cutoff_utc, state.kind || 'all');
  const networkEvidence = eligibleEvidence(report.evidence, state, report.config
    .event_information_cutoff_utc);
  return {
    schema_version: report.schema_version,
    export_kind: 'selected_view',
    selection: {
      ...state
    },
    provenance: report.provenance,
    config: {
      ...report.config,
      cost_bps: state.costBps
    },
    scope: 'Selected ticker sleeves, decision dates through as-of; realized labels only when label_end <= as-of. Buy-and-hold starts on first selected evaluation date, including entry cost.',
    forecast_metrics: forecastMetrics(rows),
    strategy_metrics: strategy.metrics,
    rows: strategy.rows,
    strategy_daily: strategy.daily,
    buy_hold_daily: strategy.buyHold,
    evidence,
    network: {
      kind: 'descriptive_supplied_relationships',
      scope: 'All evidence kinds eligible for the selected company and date, matching the relationship chart.',
      edges: networkEvidence.filter(e => e.relationship).map(e => ({
        source: e.ticker,
        target: e.relationship,
        usable_at: e.usable_at
      }))
    },
    audit: report.audit,
    limitations: ['Synthetic runs demonstrate behavior, not tradable alpha.',
      'User-supplied timestamps are unverified.',
      'Intervals have no guaranteed coverage under drift.',
      'Audit split metadata describes the original run, not a refit at the selected date.'
    ]
  };
}
export function toCSV(rows, fields) {
  const cell = v => {
    let s = String(v ?? '');
    if (typeof v === 'string' && /^[\s]*[=+\-@]/.test(s)) s = "'" + s;
    return `"${s.replaceAll('"','""')}"`;
  };
  return [fields.join(','), ...rows.map(r => fields.map(f => cell(r[f])).join(','))].join('\r\n');
}
