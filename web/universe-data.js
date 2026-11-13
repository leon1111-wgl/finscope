// The 0.3.0 universe in the browser: figures, indicators, search, peer groups and exports.
// Pure functions over web/data/universe/{index,screen}.json and one shard per company (built on GitHub Actions by
// scripts/build_universe.py). No model, no network here; loading lives in universe-load.js.

export const FIGURES = {
  revenue: ['Revenue', '营收', 'USD'], cost_of_revenue: ['Cost of revenue', '营业成本', 'USD'], gross_profit: ['Gross profit', '毛利', 'USD'],
  operating_income: ['Operating income', '营业利润', 'USD'], rnd: ['Research and development', '研发费用', 'USD'],
  sga: ['Selling, general and administrative', '销售及管理费用', 'USD'], interest_expense: ['Interest expense', '利息支出', 'USD'],
  pretax_income: ['Income before income taxes', '税前利润', 'USD'], income_tax: ['Income tax expense', '所得税', 'USD'],
  net_income: ['Net income', '净利润', 'USD'], eps_diluted: ['Diluted EPS (reported)', '稀释每股收益（报告值）', 'USD/shares'],
  shares_diluted: ['Diluted weighted-average shares', '稀释加权平均股数', 'shares'], operating_cash_flow: ['Operating cash flow', '经营活动现金流', 'USD'],
  capex: ['Capital expenditure', '资本开支', 'USD'], dividends: ['Dividends paid', '支付的股息', 'USD'], buybacks: ['Share repurchases', '股票回购', 'USD'],
  cash: ['Cash and cash equivalents', '现金及现金等价物', 'USD'], cash_sti: ['Cash and short-term investments', '现金及短期投资', 'USD'],
  assets: ['Total assets', '总资产', 'USD'], liabilities: ['Total liabilities', '总负债', 'USD'], equity: ["Shareholders' equity", '股东权益', 'USD'],
  current_assets: ['Current assets', '流动资产', 'USD'], current_liabilities: ['Current liabilities', '流动负债', 'USD'], total_debt: ['Total debt', '总债务（有息负债）', 'USD'],
  net_interest_income: ['Net interest income', '净利息收入', 'USD'], noninterest_income: ['Noninterest income', '非利息收入', 'USD'],
  provision: ['Provision for credit losses', '信贷损失准备', 'USD'], deposits: ['Deposits', '存款', 'USD'], loans: ['Loans, net', '贷款净额', 'USD'],
  premiums: ['Premiums earned', '已赚保费', 'USD'], net_investment_income: ['Net investment income', '净投资收益', 'USD'],
  real_estate: ['Real estate investment property, net', '投资性房地产净值', 'USD']
};
const ALL = ['industrial', 'bank', 'insurance', 'reit'], NONFIN = ['industrial', 'reit'];
// id: [en, zh, format, formula en, formula zh, inputs, templates, needs prior year]
export const INDICATORS = {
  gross_margin: ['Gross margin', '毛利率', 'pct', 'gross profit ÷ revenue', '毛利 ÷ 营收', ['gross_profit', 'revenue'], ['industrial']],
  operating_margin: ['Operating margin', '营业利润率', 'pct', 'operating income ÷ revenue', '营业利润 ÷ 营收', ['operating_income', 'revenue'], ALL],
  net_margin: ['Net margin', '净利率', 'pct', 'net income ÷ revenue', '净利润 ÷ 营收', ['net_income', 'revenue'], ALL],
  rnd_intensity: ['R&D intensity', '研发费用率', 'pct', 'R&D ÷ revenue', '研发费用 ÷ 营收', ['rnd', 'revenue'], ['industrial']],
  cash_margin: ['Operating cash margin', '经营现金流利润率', 'pct', 'operating cash flow ÷ revenue', '经营活动现金流 ÷ 营收', ['operating_cash_flow', 'revenue'], NONFIN],
  free_cash_flow: ['Free cash flow', '自由现金流', 'money', 'operating cash flow − capital expenditure', '经营活动现金流 − 资本开支', ['operating_cash_flow', 'capex'], ['industrial']],
  fcf_margin: ['FCF margin', '自由现金流利润率', 'pct', '(operating cash flow − capital expenditure) ÷ revenue', '（经营活动现金流 − 资本开支）÷ 营收', ['operating_cash_flow', 'capex', 'revenue'], ['industrial']],
  cash_conversion: ['Cash conversion', '现金转化率', 'times', 'operating cash flow ÷ net income', '经营活动现金流 ÷ 净利润', ['operating_cash_flow', 'net_income'], NONFIN],
  accruals: ['Accrual ratio', '应计比率', 'pct', '(net income − operating cash flow) ÷ average total assets of this and the prior fiscal year', '（净利润 − 经营活动现金流）÷ 本年与上年总资产的平均值', ['net_income', 'operating_cash_flow', 'assets'], NONFIN, 'assets'],
  profit_cash_gap: ['Profit-to-cash gap', '利润与现金差距', 'money', 'net income − operating cash flow', '净利润 − 经营活动现金流', ['net_income', 'operating_cash_flow'], NONFIN],
  current_ratio: ['Current ratio', '流动比率', 'times', 'current assets ÷ current liabilities', '流动资产 ÷ 流动负债', ['current_assets', 'current_liabilities'], NONFIN],
  cash_coverage: ['Cash coverage', '现金覆盖率', 'times', 'cash and cash equivalents ÷ current liabilities', '现金及现金等价物 ÷ 流动负债', ['cash', 'current_liabilities'], NONFIN],
  liabilities_assets: ['Liabilities / assets', '资产负债率', 'pct', 'total liabilities ÷ total assets', '总负债 ÷ 总资产', ['liabilities', 'assets'], ALL],
  debt_to_equity: ['Debt to equity', '债务权益比', 'times', "total debt ÷ shareholders' equity", '总债务 ÷ 股东权益', ['total_debt', 'equity'], NONFIN],
  interest_coverage: ['Interest coverage', '利息保障倍数', 'times', 'operating income ÷ interest expense', '营业利润 ÷ 利息支出', ['operating_income', 'interest_expense'], NONFIN],
  roe: ['Return on equity', '净资产收益率', 'pct', "net income ÷ average shareholders' equity of this and the prior fiscal year", '净利润 ÷ 本年与上年股东权益的平均值', ['net_income', 'equity'], ALL, 'equity'],
  roa: ['Return on assets', '总资产收益率', 'pct', 'net income ÷ average total assets of this and the prior fiscal year', '净利润 ÷ 本年与上年总资产的平均值', ['net_income', 'assets'], ALL, 'assets'],
  revenue_growth: ['Revenue growth', '营收增长率', 'pct', 'revenue ÷ prior-year revenue − 1', '营收 ÷ 上年营收 − 1', ['revenue'], ALL, 'revenue'],
  payout: ['Shareholder payout', '股东回报（分红加回购）', 'money', 'dividends paid + share repurchases', '支付的股息 + 股票回购', ['dividends', 'buybacks'], ALL]
};
export const TEMPLATE_LABEL = {industrial: ['Industrial', '一般企业'], bank: ['Bank / other financial', '银行及其他金融'], insurance: ['Insurance', '保险'], reit: ['REIT', '房地产信托']};
export const STATEMENT_ORDER = ['revenue', 'cost_of_revenue', 'gross_profit', 'rnd', 'sga', 'operating_income', 'interest_expense', 'pretax_income', 'income_tax', 'net_income', 'eps_diluted', 'shares_diluted',
  'net_interest_income', 'noninterest_income', 'provision', 'premiums', 'net_investment_income',
  'operating_cash_flow', 'capex', 'dividends', 'buybacks',
  'cash', 'cash_sti', 'current_assets', 'assets', 'current_liabilities', 'liabilities', 'total_debt', 'equity', 'deposits', 'loans', 'real_estate'];
export const KEY_INDICATORS = ['gross_margin', 'operating_margin', 'net_margin', 'rnd_intensity', 'free_cash_flow', 'fcf_margin', 'cash_conversion', 'accruals', 'current_ratio', 'debt_to_equity', 'interest_coverage', 'roe', 'roa', 'revenue_growth'];

export const isFigure = k => k in FIGURES;
export const isIndicator = k => k in INDICATORS;
export const label = (k, lang = 'en') => (FIGURES[k] || INDICATORS[k] || [k, k])[lang === 'zh' ? 1 : 0];
export const unitOf = k => FIGURES[k]?.[2] || (INDICATORS[k]?.[2] === 'money' ? 'USD' : null);

// ------------------------------------------------------------------ formatting
export function money(v, lang = 'en') {
  if (!Number.isFinite(v)) return lang === 'zh' ? '无' : '—';
  if (v === 0) return lang === 'zh' ? '0 美元' : '$0';
  const sign = v < 0 ? '−' : '', a = Math.abs(v);
  if (lang === 'zh') return a >= 1e8 ? `${sign}${(a / 1e8).toFixed(2)} 亿美元` : `${sign}${(a / 1e4).toFixed(1)} 万美元`;
  return a >= 1e12 ? `${sign}$${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${sign}$${(a / 1e9).toFixed(2)}B` : `${sign}$${(a / 1e6).toFixed(1)}M`;
}
export function show(k, v, lang = 'en') {
  if (!Number.isFinite(v)) return lang === 'zh' ? '无' : '—';
  const unit = FIGURES[k]?.[2], format = INDICATORS[k]?.[2];
  if (unit === 'USD/shares') return `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`;
  if (unit === 'shares') return lang === 'zh' ? `${(v / 1e8).toFixed(2)} 亿股` : `${(v / 1e6).toFixed(1)}M shares`;
  if (format === 'pct') return `${(v * 100).toFixed(1)}%`;
  if (format === 'times') return `${v.toFixed(2)}×`;
  return money(v, lang);
}
export const exact = v => Number.isFinite(v) ? `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US', {maximumFractionDigits: 4})}` : '—';

// ------------------------------------------------------------------ cells and sources
export function filingUrl(cik, accn, doc) {
  const folder = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(accn).replace(/-/g, '')}/`;
  return doc && /^[\w.-]+$/.test(doc) ? folder + doc : folder;
}
export function filingIndexUrl(cik, accn) {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(accn).replace(/-/g, '')}/${accn}-index.htm`;
}
export const periodIndex = (shard, fy) => shard.periods.findIndex(p => p.fy === fy);
export const latestIndex = shard => shard.periods.length - 1;
export const supported = (shard, k) => isFigure(k) ? k in shard.values : (INDICATORS[k]?.[6] || []).includes(shard.template) && INDICATORS[k][5].every(m => m in shard.values);

// One stated value with everything needed for its source line.
export function sourceOf(shard, metric, i, role = null) {
  const cell = shard.values[metric]?.[i];
  if (!cell || !('v' in cell)) return null;
  const period = shard.periods[i], filing = shard.filings[cell.accn] || {};
  const flow = !['cash', 'cash_sti', 'assets', 'liabilities', 'equity', 'current_assets', 'current_liabilities', 'total_debt', 'deposits', 'loans', 'real_estate'].includes(metric);
  return {
    metric, role, value: cell.v, unit: FIGURES[metric][2], fy: period.fy, period_start: flow ? period.start : null, period_end: period.end,
    tag: cell.tag, via: cell.via, parts: cell.parts || null, note: cell.note || null, first: cell.first || null,
    accession: cell.accn, form: cell.form || filing.form, filed: cell.filed,
    url: filingUrl(shard.cik, cell.accn, filing.doc), filing_index_url: filingIndexUrl(shard.cik, cell.accn), link_kind: filing.doc ? 'primary_document' : 'filing_directory'
  };
}

function priorIndex(shard, i) {
  if (i < 1) return -1;
  const gap = (Date.parse(shard.periods[i].end) - Date.parse(shard.periods[i - 1].end)) / 86400000;
  return gap >= 300 && gap <= 430 ? i - 1 : -1;
}

// An indicator for period i: {value, sources, missing, reason}. reason: unsupported | missing | conflict | nonpositive | no_prior.
export function indicator(shard, key, i) {
  if (isFigure(key)) {
    if (!(key in shard.values)) return {value: null, sources: [], missing: [key], reason: 'unsupported'};
    const cell = shard.values[key][i];
    if (cell?.conflict) return {value: null, sources: [], missing: [key], reason: 'conflict'};
    const s = sourceOf(shard, key, i);
    return s ? {value: s.value, sources: [s], missing: [], reason: null} : {value: null, sources: [], missing: [key], reason: 'missing'};
  }
  const spec = INDICATORS[key];
  if (!spec) throw new Error(`Unknown figure ${key}`);
  if (!spec[6].includes(shard.template) || spec[5].some(m => !(m in shard.values))) return {value: null, sources: [], missing: spec[5].filter(m => !(m in shard.values)), reason: 'unsupported'};
  const sources = [], missing = [], v = {};
  for (const m of spec[5]) {
    const s = sourceOf(shard, m, i);
    if (s) { sources.push(s); v[m] = s.value; } else missing.push(m);
  }
  let prior = null;
  if (spec[7]) {
    const j = priorIndex(shard, i);
    const s = j >= 0 ? sourceOf(shard, spec[7], j, 'prior_year') : null;
    if (s) { sources.push(s); prior = s.value; } else missing.push(`${spec[7]}_prior`);
  }
  if (key === 'payout' && missing.length) return {value: null, sources, missing, reason: 'missing'};  // never a missing part as zero
  if (key === 'payout') return {value: v.dividends + v.buybacks, sources, missing: [], reason: null};
  if (missing.length) return {value: null, sources, missing, reason: missing.some(m => m.endsWith('_prior')) && missing.length === 1 ? 'no_prior' : 'missing'};
  const pos = x => Number.isFinite(x) && x > 0;
  const div = (a, b) => pos(b) ? a / b : null;
  let value = null;
  switch (key) {
    case 'gross_margin': value = div(v.gross_profit, v.revenue); break;
    case 'operating_margin': value = div(v.operating_income, v.revenue); break;
    case 'net_margin': value = div(v.net_income, v.revenue); break;
    case 'rnd_intensity': value = div(v.rnd, v.revenue); break;
    case 'cash_margin': value = div(v.operating_cash_flow, v.revenue); break;
    case 'free_cash_flow': value = v.operating_cash_flow - v.capex; break;
    case 'fcf_margin': value = div(v.operating_cash_flow - v.capex, v.revenue); break;
    case 'cash_conversion': value = div(v.operating_cash_flow, v.net_income); break;
    case 'accruals': value = div(v.net_income - v.operating_cash_flow, (v.assets + prior) / 2); break;
    case 'profit_cash_gap': value = v.net_income - v.operating_cash_flow; break;
    case 'current_ratio': value = div(v.current_assets, v.current_liabilities); break;
    case 'cash_coverage': value = div(v.cash, v.current_liabilities); break;
    case 'liabilities_assets': value = div(v.liabilities, v.assets); break;
    case 'debt_to_equity': value = div(v.total_debt, v.equity); break;
    case 'interest_coverage': value = div(v.operating_income, v.interest_expense); break;
    case 'roe': value = pos(v.equity) && pos(prior) ? v.net_income / ((v.equity + prior) / 2) : null; break;
    case 'roa': value = div(v.net_income, (v.assets + prior) / 2); break;
    case 'revenue_growth': value = pos(prior) ? v.revenue / prior - 1 : null; break;
  }
  return value === null ? {value: null, sources, missing: [], reason: 'nonpositive'} : {value, sources, missing: [], reason: null};
}

// ------------------------------------------------------------------ search and question matching
export const SINGLE_LETTER_OK = new Set(['C', 'F', 'T', 'V', 'O', 'K', 'D', 'L']);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isLatin = a => /^[\x20-\x7e]+$/.test(a);

export function prepareIndex(index) {
  if (index.__prepared) return index.__prepared;
  const byTicker = new Map(), byCik = new Map(), latin = new Map(), cjk = new Map();
  for (const entry of index.companies) {
    byCik.set(entry.c, entry);
    for (const t of entry.t) byTicker.set(t.toUpperCase(), entry);
    for (const a of entry.a) if (isLatin(a)) latin.set(a, entry);
    for (const z of entry.z) (isLatin(z) ? latin : cjk).set(isLatin(z) ? z.toLowerCase() : z, entry);
  }
  const outside = new Map();
  for (const [reason, list] of Object.entries(index.outside || {})) for (const n of list) if (!latin.has(n) && !cjk.has(n)) outside.set(n, reason);
  // Names two companies share (First Bancorp): the box asks which one is meant instead of matching a shorter name.
  const shared = new Map(Object.entries(index.shared || {}).filter(([a]) => !latin.has(a)));
  const prepared = {index, byTicker, byCik, latin, cjk, outside, shared, maxLatinWords: 6};
  Object.defineProperty(index, '__prepared', {value: prepared, enumerable: false});
  return prepared;
}
export const entryOf = (prepared, ticker) => prepared.byTicker.get(String(ticker).toUpperCase().replace('.', '-')) || null;
export const primary = entry => entry.t[0];

// Company spans in a question: names (longest first), common Chinese names, and tickers.
// Upper-case tickers match anywhere; lower-case tickers only where the index marks them safe (`l`), because
// many tickers are ordinary words (cost, low, now, well).
export function matchCompanies(prepared, text, low, notTickers = new Set()) {
  const hits = [];
  const words = [...low.matchAll(/[a-z0-9][a-z0-9&.'!-]*/g)];
  for (let i = 0; i < words.length; i++) {
    for (let n = Math.min(prepared.maxLatinWords, words.length - i); n >= 1; n--) {
      const start = words[i].index, last = words[i + n - 1], end = last.index + last[0].length;
      let phrase = low.slice(start, end).replace(/\s+/g, ' ');
      const bare = phrase.replace(/[.,!?']+$/, '');
      // Periods inside a name are spaces in the index: T. Rowe Price, U.S. Physical Therapy, D.R. Horton.
      const undotted = bare.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
      for (const [cand, span] of [[phrase, phrase.length], [bare, bare.length], [phrase.replace(/'s$/, ''), phrase.length - 2], [undotted, bare.length]]) {
        const entry = prepared.latin.get(cand);
        if (entry) {
          // A single common word needs capitals in the original (Target, Block) unless it is a curated alias.
          // (any capital in the word counts: nCino, uniQure).
          if (!cand.includes(' ') && entry.lw?.includes(cand) && text.slice(start, start + span) === text.slice(start, start + span).toLowerCase()) continue;
          hits.push({start, end: start + span, cik: entry.c, alias: cand, kind: 'name'});
          break;
        }
        const ciks = prepared.shared?.get(cand);
        if (ciks) { hits.push({start, end: start + span, ciks, alias: cand, kind: 'shared'}); break; }
      }
    }
  }
  for (let i = 0; i < low.length; i++) {
    if (!/[㐀-鿿]/.test(low[i])) continue;
    for (let n = Math.min(12, low.length - i); n >= 2; n--) {
      const entry = prepared.cjk.get(low.slice(i, i + n));
      if (entry) { hits.push({start: i, end: i + n, cik: entry.c, alias: low.slice(i, i + n), kind: 'zh'}); break; }
    }
  }
  const rejected = [];
  // A question in capitals throughout (two Latin words or more, none in lower case) gives capitals no meaning.
  const shouting = (text.match(/[A-Za-z]{2,}/g) || []).length >= 2 && !/[a-z]/.test(text);
  for (const m of text.matchAll(/(?<![A-Za-z0-9$&\/'])\$?([A-Za-z]{1,5}(?:[.-][A-Za-z]{1,2})?)(?![A-Za-z0-9&\/'])/g)) {
    const raw = m[1], upper = raw.toUpperCase().replace('.', '-'), dollar = m[0].startsWith('$');
    const entry = prepared.byTicker.get(upper);
    if (!entry) continue;
    const isUpper = raw === raw.toUpperCase();
    // A ticker typed in capitals (in a question that is not all capitals) or with $ is meant as a ticker.
    const capital = isUpper && /[A-Z]/.test(raw) && !shouting;
    const start = m.index + (dollar ? 1 : 0), hit = {start, end: start + raw.length, cik: entry.c, alias: raw, kind: 'ticker', capital, dollar};
    if (!dollar && raw.length === 1 && (/^\.\s?[A-Za-z]/.test(text.slice(start + 1)) || /[A-Za-z]\.\s?$/.test(text.slice(0, start)) || /(class|series|类|级)\s*$/i.test(text.slice(0, start)))) continue;
    // A capital ticker that is also the name of a company outside the universe (BYD) asks which is meant; lower case stays outside.
    if (!dollar && prepared.outside.has(raw.toLowerCase())) { if (capital) hits.push({...hit, outside: raw.toLowerCase()}); continue; }
    if ((!dollar && isUpper && (notTickers.has(upper) || (upper.length === 1 && !SINGLE_LETTER_OK.has(upper)))) || (!dollar && !isUpper && !(entry.l && raw.length >= 2 && raw === raw.toLowerCase()))) { rejected.push(hit); continue; }
    hits.push(hit);
  }
  // Inside a list of tickers ("jpm bac wfc c gs ms"), a short or lower-case ticker next to an accepted one is a ticker too.
  const SEP = /^[\s,，、;；/]*(?:and|和|与|及|跟|vs\.?|versus)?[\s,，、;；/]*$/i;
  for (let changed = true; changed;) {
    changed = false;
    for (const r of [...rejected].filter(r => !notTickers.has(r.alias.toUpperCase()))) {
      if (hits.some(h => h.kind === 'ticker' && ((h.end <= r.start && SEP.test(text.slice(h.end, r.start))) || (r.end <= h.start && SEP.test(text.slice(r.end, h.start)))))) {
        hits.push(r); rejected.splice(rejected.indexOf(r), 1); changed = true;
      }
    }
  }
  // A ticker typed with $ beats a name over the same words; one typed in capitals that is also another company's name
  // (COKE for Coca-Cola, HP for HP Inc.) asks which is meant. Otherwise, on a tie, a name beats a ticker.
  for (const t of hits.filter(h => h.kind === 'ticker' && (h.dollar || h.capital) && !h.outside)) {
    const same = hits.filter(h => h.kind === 'name' && h.start === t.start && h.end === t.end && h.cik !== t.cik);
    if (!same.length) continue;
    for (const n of same) hits.splice(hits.indexOf(n), 1);
    if (!t.dollar) { hits.splice(hits.indexOf(t), 1); hits.push({start: t.start, end: t.end, alias: t.alias, kind: 'shared', via: 'ticker_name', ciks: [t.cik, ...same.map(n => n.cik)]}); }
  }
  const rankKind = h => h.kind === 'ticker' ? 1 : 0;
  hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || rankKind(a) - rankKind(b) || a.start - b.start);
  const taken = [];
  for (const h of hits) if (!taken.some(t => h.start < t.end && t.start < h.end)) taken.push(h);
  taken.sort((a, b) => a.start - b.start);
  // Tickers that are also ordinary words (PM, SO, IT, A) are not read as tickers unless written $PM; the caller may say so.
  taken.rejected = rejected.filter(r => r.capital && !taken.some(t => r.start < t.end && t.start < r.end));
  return taken;
}

export function matchOutside(prepared, low) {
  const out = [];
  for (const [name, reason] of prepared.outside) {
    const re = isLatin(name) ? new RegExp(`(?<![a-z0-9])${esc(name)}(?![a-z0-9])`) : new RegExp(esc(name));
    const m = low.match(re);
    if (m) out.push({name, reason, start: m.index, end: m.index + name.length});
  }
  // Keep the longest of overlapping names (Coca-Cola Europacific Partners, not also Europacific Partners).
  return out.sort((a, b) => (b.end - b.start) - (a.end - a.start)).filter((o, i, all) => !all.slice(0, i).some(x => o.start < x.end && x.start < o.end)).sort((a, b) => a.start - b.start);
}

// The company search box: ranked matches for what the visitor typed.
export function searchCompanies(prepared, query, limit = 8) {
  const q = String(query || '').trim();
  if (!q) return [];
  const low = q.toLowerCase(), up = q.toUpperCase().replace('.', '-');
  const scored = [];
  for (const e of prepared.index.companies) {
    let s = 0;
    if (e.t.some(t => t === up)) s = 100;
    else if (e.z.some(z => z === q)) s = 95;
    else if (e.a.includes(low)) s = 90;
    else if (e.t.some(t => t.startsWith(up)) && q.length <= 5) s = 70;
    else if (e.z.some(z => z.includes(q))) s = 65;
    else if (e.a.some(a => a.startsWith(low)) || e.n.toLowerCase().startsWith(low)) s = 60;
    else if (low.length >= 3 && (e.n.toLowerCase().includes(low) || e.a.some(a => a.includes(low)))) s = 40;
    if (s) scored.push([s, e.r, e]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, limit).map(x => x[2]);
}
export const lc = text => /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
export const displayName = (entry, lang = 'en') => lang === 'zh' && entry.z?.length ? `${entry.z[0]}（${primary(entry)}）` : `${entry.n} (${primary(entry)})`;

// ------------------------------------------------------------------ screen and peer groups
export const SCREEN_KEYS = ['cash_conversion', 'accruals', 'fcf_margin'];
export const PEER_MIN = 10;
const DIVISION = {A: ['Agriculture, forestry and fishing', '农林牧渔'], B: ['Mining', '采矿'], C: ['Construction', '建筑'], D: ['Manufacturing', '制造业'], E: ['Transportation, communications and utilities', '交通、通信与公用事业'], F: ['Wholesale trade', '批发'], G: ['Retail trade', '零售'], H: ['Finance, insurance and real estate', '金融、保险与地产'], I: ['Services', '服务业'], J: ['Other', '其他']};

// FCF margin is left out for REITs: their property spending is not in the capex tags (see TEMPLATE_WHY in universe-ask.js).
// SIC major groups (two-digit codes), shortened from the SIC Manual (1987) as published by OSHA and used by SEC EDGAR.
export const SIC_MAJOR = {'01': 'Agricultural production: crops', '02': 'Agricultural production: livestock', '07': 'Agricultural services', '08': 'Forestry', '09': 'Fishing, hunting and trapping', '10': 'Metal mining', '12': 'Coal mining', '13': 'Oil and gas extraction', '14': 'Nonmetallic minerals mining', '15': 'Building construction, general contractors', '16': 'Heavy construction', '17': 'Construction, special trade contractors', '20': 'Food and kindred products', '21': 'Tobacco products', '22': 'Textile mill products', '23': 'Apparel and other textile products', '24': 'Lumber and wood products', '25': 'Furniture and fixtures', '26': 'Paper and allied products', '27': 'Printing and publishing', '28': 'Chemicals and allied products', '29': 'Petroleum refining and related industries', '30': 'Rubber and plastics products', '31': 'Leather and leather products', '32': 'Stone, clay, glass and concrete products', '33': 'Primary metal industries', '34': 'Fabricated metal products', '35': 'Industrial and commercial machinery and computer equipment', '36': 'Electronic and other electrical equipment', '37': 'Transportation equipment', '38': 'Measuring, analyzing and controlling instruments; medical and optical goods', '39': 'Miscellaneous manufacturing', '40': 'Railroad transportation', '41': 'Local and interurban passenger transit', '42': 'Motor freight transportation and warehousing', '43': 'US Postal Service', '44': 'Water transportation', '45': 'Transportation by air', '46': 'Pipelines, except natural gas', '47': 'Transportation services', '48': 'Communications', '49': 'Electric, gas and sanitary services', '50': 'Wholesale trade: durable goods', '51': 'Wholesale trade: nondurable goods', '52': 'Building materials, hardware and garden supply stores', '53': 'General merchandise stores', '54': 'Food stores', '55': 'Automotive dealers and gasoline service stations', '56': 'Apparel and accessory stores', '57': 'Home furniture and furnishings stores', '58': 'Eating and drinking places', '59': 'Miscellaneous retail', '60': 'Depository institutions', '61': 'Nondepository credit institutions', '62': 'Security and commodity brokers and services', '63': 'Insurance carriers', '64': 'Insurance agents and brokers', '65': 'Real estate', '67': 'Holding and other investment offices', '70': 'Hotels and other lodging places', '72': 'Personal services', '73': 'Business services', '75': 'Automotive repair, services and parking', '76': 'Miscellaneous repair services', '78': 'Motion pictures', '79': 'Amusement and recreation services', '80': 'Health services', '81': 'Legal services', '82': 'Educational services', '83': 'Social services', '84': 'Museums, galleries and gardens', '86': 'Membership organizations', '87': 'Engineering, accounting, research and management services', '88': 'Private households', '89': 'Services, not elsewhere classified', '91': 'Executive, legislative and general government', '92': 'Justice, public order and safety', '93': 'Public finance and taxation', '94': 'Human resource programs', '95': 'Environmental quality and housing programs', '96': 'Economic programs', '97': 'National security and international affairs', '99': 'Nonclassifiable establishments'};
// A code is a prefix of the four-digit (zero-padded) SIC: '36', '367' or '3674'.
export const sicGroupName = code => SIC_MAJOR[String(code).slice(0, 2)] || '';

export function screenValues(row, template = 'industrial') {
  const v = k => row[k]?.[0];
  const out = {cash_conversion: null, accruals: null, fcf_margin: null};
  if (Number.isFinite(v('operating_cash_flow')) && v('net_income') > 0) out.cash_conversion = v('operating_cash_flow') / v('net_income');
  if (Number.isFinite(v('net_income')) && Number.isFinite(v('operating_cash_flow')) && Number.isFinite(v('assets')) && Number.isFinite(row.assets_prior?.[0]) && v('assets') + row.assets_prior[0] > 0)
    out.accruals = (v('net_income') - v('operating_cash_flow')) / ((v('assets') + row.assets_prior[0]) / 2);
  if (template !== 'reit' && Number.isFinite(v('operating_cash_flow')) && Number.isFinite(v('capex')) && v('revenue') > 0) out.fcf_margin = (v('operating_cash_flow') - v('capex')) / v('revenue');
  return out;
}

// Peer group: the most specific of 4-digit SIC, 3-digit, 2-digit or SIC division with at least PEER_MIN companies.
export function buildScreen(screen, prepared) {
  const rows = screen.rows.map(r => {
    const entry = prepared.byCik.get(r.c);
    return entry ? {...r, entry, sic: String(entry.s || ''), values: screenValues(r, entry.tp)} : null;
  }).filter(Boolean);
  const counts = new Map();
  // REITs are peers of REITs only, so an operating company in SIC division H is not ranked against property trusts.
  const keysOf = row => {
    const s = row.sic.padStart(4, '0'), tp = row.entry.tp === 'reit' ? 'reit' : 'ind';
    return (/^\d{4}$/.test(row.sic) ? [`sic4:${s}`, `sic3:${s.slice(0, 3)}`, `sic2:${s.slice(0, 2)}`, `div:${row.entry.v}`] : [`div:${row.entry.v}`]).map(k => `${tp}:${k}`);
  };
  const fallbackKey = row => `${row.entry.tp === 'reit' ? 'reit' : 'ind'}:div:${row.entry.v}`;
  // Membership is by classification: a company's peers are every screened company that shares its peer key.
  // The level is chosen per indicator: the most specific one where at least PEER_MIN companies have that indicator.
  const members = new Map(), finite = new Map();
  for (const row of rows) for (const k of keysOf(row)) {
    if (!members.has(k)) members.set(k, []);
    members.get(k).push(row);
    for (const key of SCREEN_KEYS) if (Number.isFinite(row.values[key])) finite.set(`${k}|${key}`, (finite.get(`${k}|${key}`) || 0) + 1);
    if (Object.values(row.values).some(Number.isFinite)) counts.set(k, (counts.get(k) || 0) + 1);
  }
  const groups = new Map(), sorted = new Map();
  for (const row of rows) {
    row.peer = keysOf(row).find(k => (counts.get(k) || 0) >= PEER_MIN) || fallbackKey(row);
    row.peerFor = {}; row.pct = {}; row.peerN = {};
    for (const key of SCREEN_KEYS) {
      const peer = keysOf(row).find(k => (finite.get(`${k}|${key}`) || 0) >= PEER_MIN) || fallbackKey(row);
      row.peerFor[key] = peer;
      const id = `${peer}|${key}`;
      if (!sorted.has(id)) sorted.set(id, (members.get(peer) || [row]).map(m => m.values[key]).filter(Number.isFinite).sort((a, b) => a - b));
      const vals = sorted.get(id), x = row.values[key];
      if (!Number.isFinite(x)) { row.pct[key] = null; continue; }
      const below = vals.filter(v => v < x).length, ties = vals.filter(v => v === x).length;
      row.pct[key] = Math.round(((below + 0.5 * ties) / vals.length) * 100);
      row.peerN[key] = vals.length;
    }
    if (!groups.has(row.peer)) groups.set(row.peer, members.get(row.peer) || [row]);
  }
  return {rows, groups, members};
}
export function peerLabel(peer, rows, lang = 'en') {
  const [tp, kind, code] = peer.split(':');
  const label = peerLabelPlain(`${kind}:${code}`, rows.filter(r => r.peer.startsWith(`${tp}:`)), lang);
  return tp === 'reit' ? `${label} (REITs)` : label;
}
// A Screen filter's label from the index alone (Ask points to Screen before the screen data is loaded).
export function sectorLabel(peer, companies, lang = 'en') {
  const [tp, kind, code] = peer.split(':');
  if (kind === 'div') return `${lang === 'zh' ? 'SIC 门类' : 'SIC division'} ${code} · ${DIVISION[code]?.[lang === 'zh' ? 1 : 0] || ''}`;
  const sample = kind === 'sic4' && companies.find(c => String(c.s).padStart(4, '0') === code && c.d);
  const desc = kind === 'sic4' ? (sample ? ` · ${sample.d}` : '') : kind === 'sic3' ? ` · ${sicGroupName(code)} (major group ${code.slice(0, 2)})` : ` · ${sicGroupName(code)}`;
  return `SIC ${code}${kind === 'sic4' ? '' : kind === 'sic3' ? 'x' : 'xx'}${desc}${tp === 'reit' ? ' (REITs)' : ''}`;
}
function peerLabelPlain(peer, rows, lang) {
  const [kind, code] = peer.split(':');
  if (kind === 'div') return `${lang === 'zh' ? 'SIC 门类' : 'SIC division'} ${code} · ${DIVISION[code]?.[lang === 'zh' ? 1 : 0] || ''}`;
  const sample = rows.find(r => r.peer.endsWith(peer) && r.entry.d);
  const desc = kind === 'sic4' ? (sample ? ` · ${sample.entry.d}` : '') : kind === 'sic3' ? ` · ${sicGroupName(code)} (major group ${code.slice(0, 2)})` : ` · ${sicGroupName(code)}`;
  return `SIC ${code}${kind === 'sic4' ? '' : kind === 'sic3' ? 'x' : 'xx'}${desc}`;
}

// ------------------------------------------------------------------ exports (every cell carries its source)
// Text cells a spreadsheet would read as a formula (= + - @) get a leading apostrophe; numbers stay numbers.
const csvSafe = v => typeof v === 'string' && /^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? `'${v}` : v;
const csvCellRaw = v => v === null || v === undefined ? '' : /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
const csvCell = v => csvCellRaw(csvSafe(v));
export const toCSV = (header, rows) => [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
export const CSV_HEADER = ['company', 'ticker', 'cik', 'template', 'fiscal_year', 'period_start', 'period_end', 'figure_id', 'figure', 'value', 'unit', 'how',
  'xbrl_tag_or_formula', 'accession', 'form', 'filed', 'source_url', 'first_reported_value', 'first_reported_accession', 'note'];

export function shardRows(shard, figures, indicators = [], years = null) {
  const out = [];
  const ticker = shard.tickers[0] || '';
  shard.periods.forEach((p, i) => {
    if (years && !years.includes(p.fy)) return;
    for (const k of figures) {
      if (!(k in shard.values)) continue;
      const cell = shard.values[k][i];
      const s = sourceOf(shard, k, i);
      const how = cell?.conflict ? 'conflict: not stated' : cell ? cell.via : 'not reported';
      const tag = cell ? (cell.parts ? cell.parts.map(x => `${x.sign < 0 ? '−' : '+'}${x.tag}`).join(' ') : cell.tag) : '';
      out.push([shard.name, ticker, shard.cik, shard.template, p.fy, s?.period_start ?? (k in FIGURES && FIGURES[k][2] !== 'USD' ? p.start : ''), p.end, k, FIGURES[k][0], s ? s.value : '', FIGURES[k][2], how, tag,
        cell?.accn || '', s?.form || '', cell?.filed || '', s?.url || '', cell?.first?.v ?? '', cell?.first?.accn || '', cell?.note || '']);
    }
    for (const k of indicators) {
      const res = indicator(shard, k, i);
      if (res.reason === 'unsupported') continue;
      const formula = `${INDICATORS[k][3]} [inputs: ${res.sources.map(s => `${s.metric}${s.role ? ' (prior year)' : ''} ${s.accession}`).join('; ')}]`;
      out.push([shard.name, ticker, shard.cik, shard.template, p.fy, p.start, p.end, k, INDICATORS[k][0], res.value ?? '', INDICATORS[k][2] === 'money' ? 'USD' : INDICATORS[k][2] === 'pct' ? 'ratio (0.20 = 20%)' : 'times',
        res.value === null ? `not computed: ${res.reason}` : 'computed', formula, '', '', '', '', '', '', res.note || '']);
    }
  });
  return out;
}

export function screenCSV(built, filterRows = built.rows) {
  const header = ['company', 'ticker', 'cik', 'sic', 'peer_group', 'fiscal_year', 'period_end', 'cash_conversion', 'cash_conversion_peer_percentile', 'accrual_ratio', 'accrual_ratio_peer_percentile',
    'fcf_margin', 'fcf_margin_peer_percentile', 'net_income', 'operating_cash_flow', 'capex', 'revenue', 'total_assets', 'prior_total_assets', 'xbrl_tags', 'accessions', 'source_urls'];
  const rows = filterRows.map(r => [r.entry.n, primary(r.entry), r.c, r.sic, r.peer, r.fy, r.end, r.values.cash_conversion ?? '', r.pct?.cash_conversion ?? '', r.values.accruals ?? '', r.pct?.accruals ?? '',
    r.values.fcf_margin ?? '', r.pct?.fcf_margin ?? '', r.net_income?.[0] ?? '', r.operating_cash_flow?.[0] ?? '', r.capex?.[0] ?? '', r.revenue?.[0] ?? '', r.assets?.[0] ?? '', r.assets_prior?.[0] ?? '',
    ['net_income', 'operating_cash_flow', 'capex', 'revenue', 'assets'].map(k => r[k] ? `${k}=${r[k][1]}` : `${k}=not reported`).join('; '),
    ['net_income', 'operating_cash_flow', 'capex', 'revenue', 'assets', 'assets_prior'].filter(k => r[k]).map(k => `${k}=${r[k][2]}`).join('; '),
    ['net_income', 'operating_cash_flow', 'capex', 'revenue', 'assets', 'assets_prior'].filter(k => r[k]).map(k => `${k}=${filingUrl(r.c, r[k][2])}`).join('; ')]);
  return toCSV(header, rows);
}
