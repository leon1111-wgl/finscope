import {selectSnapshot, selectInterim} from './research-math.js';
import {CALCULATION_VERSION, validDate, researchQuery} from './research-state.js';

// This package carries reported profiles only. Corporate scenario inputs belong
// to a single-company brief and must not become implied peer assumptions.
export function buildComparison(bundle, requestedDate) {
  if (!validDate(requestedDate) || requestedDate > bundle.as_of) throw new Error('Choose an information date within the dataset coverage.');
  const snapshot = selectSnapshot(bundle.snapshots, requestedDate);
  if (!snapshot) throw new Error('No financial snapshot is available for this information date.');
  const companies = bundle.companies.map(company => {
    const history = snapshot.companies[company.ticker];
    const annual = history.at(-1);
    return {
      ticker: company.ticker,
      name: company.name,
      annual,
      prior_annual_period: history.at(-2) || null,
      interim: selectInterim(bundle, company.ticker, requestedDate, annual),
      anomaly: snapshot.ai.scores[company.ticker] || null
    };
  });
  const assumptions = {revenuePercent: 0, marginPoints: 0, refinanceBillions: 0, rateBps: 0, collectionDays: 0};
  return {
    format: 'finscope-company-comparison',
    format_version: 1,
    author: 'FinScope by Leon Wang',
    exported_at: new Date().toISOString(),
    requested_date: requestedDate,
    snapshot_date: snapshot.as_of,
    data_retrieved_build: bundle.generated_at,
    dataset_sha256: bundle.dataset_sha256,
    calculation_version: CALCULATION_VERSION,
    reopen_url: 'https://leon1111-wgl.github.io/finscope/?' + researchQuery({ticker: companies[0].ticker, date: requestedDate, view: 'compare', assumptions}, bundle.dataset_sha256) + '#workspace',
    field_guide: {
      financial_facts: 'Reported values in USD; null is missing, never zero. Each fact retains its period, filing date, accession, tag and source link.',
      operating_margin: 'Operating income / revenue (decimal; 0.20 means 20%).',
      cash_margin: 'Operating cash flow / revenue (decimal).',
      current_ratio: 'Current assets / current liabilities (multiple).',
      liabilities_assets: 'Liabilities / assets (decimal).',
      interim_cash_margin_change_pp: '(Current YTD cash flow / revenue - prior matched YTD cash flow / revenue) * 100 (percentage points).',
      anomaly_percentile: '0 to 100 historical anomaly percentile; not a default probability or investment ranking. See training and imputed_features.',
      annual_snapshot: 'Annual facts and model use snapshot_date. Interim eligibility uses requested_date. Fiscal calendars differ.',
      csv_missing: 'Empty numeric cells are unavailable. Consult annual_missing_metrics, interim_status and model_status. CSV is a summary; this JSON contains the fact-level evidence.',
      reopening: 'Use reopen_url to open the comparison view. Version mismatches require an explicit current-data choice. This evidence JSON is not a single-company brief for file restoration.'
    },
    companies,
    model_status: snapshot.ai.status,
    training: snapshot.ai.training,
    sources: bundle.sources,
    limitations: [...bundle.limitations, 'This comparison is a curated set, not a sector benchmark. Fiscal periods and business models differ. No corporate stress assumptions are applied.']
  };
}

function csvCell(value) {
  if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) return '';
  let text = String(value);
  // Preserve numeric negatives. Treat formula-like text as text in spreadsheets.
  if (typeof value === 'string' && /^\s*[=+@-]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

export function comparisonCSV(pack) {
  const headers = [
    'ticker', 'company_name', 'requested_date', 'annual_snapshot_date',
    'annual_period_start', 'annual_period_end', 'annual_latest_selected_filing',
    'operating_margin_decimal', 'cash_margin_decimal', 'current_ratio_multiple', 'liabilities_assets_decimal',
    'model_status', 'anomaly_percentile_0_100', 'model_imputed_features', 'annual_missing_metrics',
    'interim_status', 'interim_known_by', 'interim_period_start', 'interim_period_end',
    'prior_interim_period_start', 'prior_interim_period_end', 'interim_cash_margin_change_pp',
    'annual_filing_urls', 'interim_filing_urls', 'dataset_sha256', 'calculation_version', 'data_retrieved_build',
    'interpretation_note'
  ];
  const links = periods => [...new Set(periods.filter(Boolean).flatMap(p => Object.values(p.metrics).filter(Boolean).map(f => f.url).filter(Boolean)))].join(' | ');
  const rows = pack.companies.map(c => {
    const r = c.annual, i = c.interim.checkpoint;
    return [
      c.ticker, c.name, pack.requested_date, pack.snapshot_date, r.period_start, r.period_end, r.known_at,
      r.ratios.operating_margin, r.ratios.cash_margin, r.ratios.current_ratio, r.ratios.liabilities_assets,
      c.anomaly ? 'available' : 'unavailable', c.anomaly?.percentile,
      c.anomaly ? c.anomaly.imputed_features.join(' | ') || 'none' : 'unavailable',
      Object.entries(r.metrics).filter(([, fact]) => !fact).map(([key]) => key).join(' | ') || 'none',
      c.interim.status, i?.as_of, i?.current.period_start, i?.current.period_end,
      i?.prior?.period_start, i?.prior?.period_end, i?.cash_margin_change_pp,
      links([r]), links(i ? [i.current, i.prior] : []), pack.dataset_sha256, pack.calculation_version, pack.data_retrieved_build,
      'Different fiscal calendars; no investment ranking; empty numbers are missing; save the companion JSON for exact source facts.'
    ];
  });
  return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
