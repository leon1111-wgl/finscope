// The universe in the console: company search, Financials, the universe side of Compare, Screen and Watch.
// Every stated number links to its SEC filing; every export carries source columns. Nothing here gives advice.
import {FIGURES, INDICATORS, TEMPLATE_LABEL, STATEMENT_ORDER, KEY_INDICATORS, SCREEN_KEYS, label, show, exact, indicator, sourceOf, prepareIndex, searchCompanies, primary,
  buildScreen, peerLabel, shardRows, screenCSV, toCSV, CSV_HEADER, filingUrl, filingIndexUrl, sicGroupName} from './universe-data.js';
import {loadIndex, loadShard, loadScreen} from './universe-load.js';
import {renderWaterline} from './waterline.js?v=20261101-ledger';

const SIX = new Set(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META']);
const WATCH_KEY = 'finscope.watch';
const WATCH_FORMS = new Set(['10-K', '10-K/A', '10-Q', '10-Q/A', '8-K', '8-K/A']);
const MAX_WATCH = 12, MAX_COMPARE = 8, PAGE = 50;
const COMPARE_ROWS = ['revenue', 'revenue_growth', 'gross_margin', 'operating_margin', 'net_margin', 'rnd_intensity', 'operating_cash_flow', 'free_cash_flow', 'fcf_margin', 'cash_conversion', 'accruals',
  'total_debt', 'debt_to_equity', 'interest_coverage', 'roe', 'eps_diluted', 'dividends', 'buybacks', 'net_interest_income', 'premiums'];
const bi = (en, zh) => `${en} <span class="zh" lang="zh-Hans">${zh}</span>`;
const FLAG = {fallback: ['f', 'Fallback tag'], derived: ['Σ', 'Composed from parts in one filing'], total: ['t', 'Total revenue beats contract revenue'], restated: ['r', 'Changed in a later filing']};

export function readWatch(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage?.getItem(WATCH_KEY) || '[]');
    return Array.isArray(list) ? list.filter(w => Number.isInteger(w?.cik) && typeof w.ticker === 'string').slice(0, MAX_WATCH) : [];
  } catch { return []; }
}
export function writeWatch(list, storage = globalThis.localStorage) {
  try { storage?.setItem(WATCH_KEY, JSON.stringify(list.slice(0, MAX_WATCH))); return true; } catch { return false; }
}

// New filings in one Submissions payload since a date (exclusive), newest first.
export function newFilings(submissions, cik, since) {
  const r = submissions?.filings?.recent || {};
  const out = [];
  (r.form || []).forEach((form, i) => {
    if (!WATCH_FORMS.has(form)) return;
    const filed = r.filingDate[i];
    if (since && filed < since) return;  // the day marked seen is shown again: a repeat beats a missed filing
    const accn = r.accessionNumber[i], doc = r.primaryDocument?.[i];
    out.push({form, filed, accn, report: r.reportDate?.[i] || '', items: r.items?.[i] || '', description: r.primaryDocDescription?.[i] || '', url: filingUrl(cik, accn, doc), index: filingIndexUrl(cik, accn)});
  });
  return out.sort((a, b) => b.filed.localeCompare(a.filed));
}
const ITEM_8K = {'1.01': 'Material agreement', '1.02': 'Agreement terminated', '2.01': 'Acquisition or disposition', '2.02': 'Results of operations', '2.03': 'New obligation', '2.05': 'Exit costs', '2.06': 'Impairment',
  '3.01': 'Listing notice', '4.01': 'Auditor change', '4.02': 'Non-reliance on prior statements', '5.02': 'Officer or director change', '5.03': 'Bylaws or fiscal year', '5.07': 'Shareholder vote', '7.01': 'Regulation FD', '8.01': 'Other events', '9.01': 'Exhibits'};

export function createUniverseUI({$, e, download, status, openCompanyDeep, render, fetcher = globalThis.fetch, storage = globalThis.localStorage, today = () => new Date().toISOString().slice(0, 10)}) {
  const s = {index: null, prepared: null, indexError: null, entry: null, years: 5, compare: [], compareFy: 'latest', compareError: null,
    screen: null, screenError: null, filters: {peer: '', text: '', template: '', cc: '', acc: '', fcf: '', sort: 'revenue', dir: 'desc'}, shown: PAGE,
    watch: readWatch(storage), watchResults: {}, watchBusy: false, shardErrors: {}, version: 0};
  const shardOf = cik => s.shards?.[cik];
  s.shards = {};

  async function ensureIndex() {
    if (s.index) return s.prepared;
    try {
      s.index = await loadIndex({fetch: fetcher});
      s.prepared = prepareIndex(s.index);
      s.indexError = null;
    } catch (error) { s.indexError = error.message; }
    s.version++;
    return s.prepared;
  }
  async function ensureShard(cik) {
    if (s.shards[cik]) return s.shards[cik];
    try {
      s.shards[cik] = await loadShard(cik, {fetch: fetcher});
      delete s.shardErrors[cik];
    } catch (error) { s.shardErrors[cik] = error.message; }
    s.version++;
    return s.shards[cik] || null;
  }
  async function ensureScreen() {
    if (s.screen || !s.prepared) return s.screen;
    try { s.screen = buildScreen(await loadScreen({fetch: fetcher}), s.prepared); s.screenError = null; } catch (error) { s.screenError = error.message; }
    s.version++;
    return s.screen;
  }
  const entryByTicker = t => s.prepared?.byTicker.get(String(t).toUpperCase().replace('.', '-')) || null;

  function pick(entry, {focus = false, deep = true} = {}) {
    if (s.entry?.c === entry.c) return;
    s.entry = entry;
    if (!s.compare.includes(entry.c)) s.compare = [entry.c, ...s.compare].slice(0, MAX_COMPARE);
    s.version++;
    ensureShard(entry.c).then(() => render());
    if (deep && SIX.has(primary(entry))) openCompanyDeep?.(primary(entry));
    if (focus) status(`Selected ${entry.n} (${primary(entry)}).`);
  }

  // ---------------------------------------------------------------- company search (combobox)
  function searchMarkup() {
    const label = s.index ? `Company <small>${s.index.count.toLocaleString('en-US')} US companies · 公司</small>` : 'Company <small>loading the universe…</small>';
    return `<div class="company-search" role="search"><label for="company-search">${label}</label><input id="company-search" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="company-options" autocomplete="off" spellcheck="false" maxlength="60" placeholder="Ticker, name or 中文名 — e.g. KO, Costco, 摩根大通" value="${s.entry ? e(primary(s.entry)) : ''}"${s.index ? '' : ' disabled'}><ul id="company-options" role="listbox" aria-label="Matching companies" class="company-options" hidden></ul><p id="company-search-note" class="note" role="status" aria-live="polite">${s.indexError ? `The company list could not be loaded: ${e(s.indexError)} <button type="button" class="link-button" id="retry-universe">Retry</button>` : ''}</p></div>`;
  }
  function bindSearch(root) {
    const input = root.querySelector('#company-search'), list = root.querySelector('#company-options');
    root.querySelector('#retry-universe')?.addEventListener('click', async () => { await ensureIndex(); render(); });
    if (!input || !list || !s.prepared) return;
    let active = -1, results = [];
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    const paint = () => {
      list.innerHTML = results.length ? results.map((r, i) => `<li role="option" id="co-opt-${i}" data-cik="${r.c}" aria-selected="${i === active}"><strong>${e(primary(r))}</strong> ${e(r.n)}${r.z.length ? ` <span lang="zh-Hans">${e(r.z[0])}</span>` : ''}<small>${e(TEMPLATE_LABEL[r.tp][0])} · SIC ${e(r.s || '—')} · FY${r.fy}</small></li>`).join('')
        : `<li class="no-match" role="option" aria-disabled="true">No company in the universe matches “${e(input.value)}”. FinScope covers US companies that are SEC large accelerated filers and file 10-Ks; foreign companies filing 20-F are not included.</li>`;
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      if (active >= 0) input.setAttribute('aria-activedescendant', `co-opt-${active}`);
      list.querySelectorAll('[data-cik]').forEach(li => li.addEventListener('mousedown', ev => { ev.preventDefault(); choose(Number(li.dataset.cik)); }));
    };
    const choose = cik => { const entry = s.prepared.byCik.get(cik); if (!entry) return; close(); input.value = primary(entry); pick(entry, {focus: true}); };
    input.addEventListener('input', () => { results = searchCompanies(s.prepared, input.value, 8); active = results.length ? 0 : -1; input.value.trim() ? paint() : close(); });
    input.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowDown' && results.length) { ev.preventDefault(); active = (active + 1) % results.length; paint(); }
      else if (ev.key === 'ArrowUp' && results.length) { ev.preventDefault(); active = (active - 1 + results.length) % results.length; paint(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); if (active >= 0 && results[active]) choose(results[active].c); else if (input.value.trim()) { results = searchCompanies(s.prepared, input.value, 8); if (results.length === 1) choose(results[0].c); else { active = results.length ? 0 : -1; paint(); } } }
      else if (ev.key === 'Escape') close();
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
  }

  // ---------------------------------------------------------------- cells
  function cellMarkup(shard, key, i) {
    if (key in FIGURES) {
      const cell = shard.values[key]?.[i];
      if (!(key in shard.values)) return '<span class="na" title="Not supported for this template">n/a</span>';
      if (cell?.conflict) return `<span class="flag-red" title="${e(`The filing ${cell.accn} reports conflicting values for ${cell.tag}; no value is stated`)}">conflict</span>`;
      const src = sourceOf(shard, key, i);
      if (!src) return '<span class="missing" title="Not reported under the tags FinScope reads">—</span>';
      const marks = [cell.via !== 'primary' && FLAG[cell.via], cell.first && FLAG.restated].filter(Boolean);
      const title = `${src.parts ? src.parts.map(p => `${p.sign < 0 ? '−' : '+'}${p.tag} ${exact(p.v)}`).join(' ') : src.tag} · ${src.form} ${src.accession} · filed ${src.filed}${cell.first ? ` · first reported ${exact(cell.first.v)} (${cell.first.accn})` : ''}${cell.note ? ` · ${cell.note}` : ''}`;
      return `<a class="traced" href="${e(src.url)}" target="_blank" rel="noopener noreferrer" title="${e(title)}">${e(show(key, src.value))}${marks.map(m => `<sup title="${e(m[1])}">${m[0]}</sup>`).join('')}</a>`;
    }
    const res = indicator(shard, key, i);
    if (res.reason === 'unsupported') return '<span class="na" title="Not supported for this template">n/a</span>';
    if (res.value === null) return `<span class="missing" title="${e(res.reason === 'nonpositive' ? 'Not meaningful: the denominator is zero or negative' : res.reason === 'no_prior' ? 'Needs the prior fiscal year' : 'An input is not reported')}">—</span>`;
    const first = res.sources[0];
    return `<a class="traced calc" href="${e(first.url)}" target="_blank" rel="noopener noreferrer" title="${e(`${INDICATORS[key][3]} · inputs: ${res.sources.map(x => `${x.metric}${x.role ? ' (prior)' : ''} ${exact(x.value)} ${x.accession}`).join('; ')}`)}">${e(show(key, res.value))}</a>`;
  }
  const yearsShown = shard => shard.periods.map((_, i) => i).slice(-s.years);

  // ---------------------------------------------------------------- Financials
  function financialsView() {
    const head = `<p class="eyebrow">01 / ANY US LARGE ACCELERATED FILER · 任意一家公司</p><h2>Financials, traced to the filing <span class="zh" lang="zh-Hans">标准化财务，逐项可追溯</span></h2><p class="muted">Pick any of the universe's companies. Each figure is read from the company's 10-K XBRL with a documented tag order; every cell links to its filing, and the hover text names the tag and accession. Annual figures only, the latest ten fiscal years.</p>${searchMarkup()}`;
    if (s.indexError) return head;
    if (!s.entry) return `${head}<p class="empty">Search for a company above. The deep ledger's six companies are here too.</p>`;
    const entry = s.entry, shard = shardOf(entry.c);
    if (s.shardErrors[entry.c]) return `${head}<div class="error"><h3>${e(entry.n)} could not be loaded</h3><p class="error-detail">${e(s.shardErrors[entry.c])}</p><div class="actions"><button type="button" id="retry-shard">Retry</button></div></div>`;
    if (!shard) return `${head}<p class="empty" aria-busy="true">Loading ${e(entry.n)}…</p>`;
    const t = primary(entry), idx = yearsShown(shard), last = shard.periods.at(-1), tpl = TEMPLATE_LABEL[shard.template];
    const statement = (title, keys) => {
      const rows = keys.filter(k => k in shard.values).map(k => [`${e(label(k))}<small lang="zh-Hans">${e(label(k, 'zh'))}</small>`, ...idx.map(i => cellMarkup(shard, k, i))]);
      return rows.length ? `<h4>${title}</h4>${tableHTML(['', ...idx.map(i => `FY${shard.periods[i].fy}<small>${e(shard.periods[i].end)}</small>`)], rows, 'fin-table')}` : '';
    };
    const IS = STATEMENT_ORDER.slice(0, 17), CF = ['operating_cash_flow', 'capex', 'dividends', 'buybacks'], BS = STATEMENT_ORDER.slice(21);
    const indicators = KEY_INDICATORS.filter(k => INDICATORS[k][6].includes(shard.template));
    const indRows = indicators.map(k => [`${e(label(k))}<small lang="zh-Hans">${e(label(k, 'zh'))}</small><small class="formula">${e(INDICATORS[k][3])}</small>`, ...idx.map(i => cellMarkup(shard, k, i))]);
    const watching = s.watch.some(w => w.cik === entry.c);
    const order = ['template', 'conflict', 'restated', 'amended', 'fiscal_shift', 'fiscal_gap', 'label', 'derived', 'fallback', 'note', 'missing'];
    const notes = [...shard.quality].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    const catalog = s.index.catalog || {};
    const rows = shard.periods.map(p => ({period_end: p.end, metrics: {net_income: sourceOf(shard, 'net_income', shard.periods.indexOf(p)), operating_cash_flow: sourceOf(shard, 'operating_cash_flow', shard.periods.indexOf(p))}}))
      .map(r => ({...r, metrics: Object.fromEntries(Object.entries(r.metrics).map(([k, v]) => [k, v && {...v, end: v.period_end, start: v.period_start}]))}));
    return `${head}
    <section class="panel company-card" aria-labelledby="company-title"><h3 id="company-title" tabindex="-1">${e(entry.n)} <span class="tick">${e(shard.tickers.join(' · ') || t)}</span>${entry.z.length ? ` <span lang="zh-Hans" class="zh">${e(entry.z[0])}</span>` : ''}</h3>
      <dl class="facts-line"><div><dt>Template</dt><dd>${e(tpl[0])} · <span lang="zh-Hans">${e(tpl[1])}</span></dd></div><div><dt>Industry</dt><dd>SIC ${e(shard.sic || '—')} ${e(shard.sic_description)}</dd></div><div><dt>Fiscal year ends</dt><dd>${e(shard.fiscal_year_end ? `${shard.fiscal_year_end.slice(0, 2)}-${shard.fiscal_year_end.slice(2)}` : '—')}</dd></div><div><dt>Latest 10-K</dt><dd>FY${last.fy} (${e(last.start)} → ${e(last.end)}), filed ${e(last.filed)}</dd></div><div><dt>Exchange</dt><dd>${e([...new Set(shard.exchanges)].join(', ') || '—')}</dd></div></dl>
      <div class="actions"><a class="button" href="${e(filingUrl(shard.cik, last.accession, shard.filings[last.accession]?.doc))}" target="_blank" rel="noopener noreferrer">Read the latest 10-K ↗</a><a class="button" href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=${shard.cik}&amp;type=10-K" target="_blank" rel="noopener noreferrer">All filings on EDGAR ↗</a><button type="button" id="watch-toggle" aria-pressed="${watching}">${watching ? 'Watching filings ✓' : 'Watch new filings'}</button><button type="button" id="compare-peers">Compare with peers</button><button type="button" class="primary" id="export-financials">Download CSV with sources</button>${SIX.has(t) ? '<button type="button" id="open-deep">Open the deep ledger →</button>' : ''}</div>
    </section>
    ${shard.template === 'industrial' || shard.template === 'reit' ? `<section class="panel"><h3>${bi('Profit against operating cash', '利润与经营现金')}</h3><p class="note">Each column is a fiscal year's operating cash, labelled with the same FY as the table; the mark across it is net income. Hatching shows profit above cash: a question for the filing, not a verdict.</p><div id="universe-waterline" class="waterline" data-rows="${e(JSON.stringify(rows.length))}"></div></section>` : ''}
    <section class="panel"><div class="panel-head"><h3>${bi('Standardized statements', '标准化报表')}</h3><div class="seg" role="group" aria-label="Years shown"><button type="button" data-years="5" aria-pressed="${s.years === 5}">5 years</button><button type="button" data-years="10" aria-pressed="${s.years === 10}">10 years</button></div></div>
      <p class="note">USD. Gold underlined values are traced: open one to read its filing. <sup>f</sup> fallback tag · <sup>Σ</sup> composed from parts in one filing · <sup>t</sup> total revenue used · <sup>r</sup> changed by a later filing · — not reported · n/a not supported for this template.</p>
      ${statement(bi('Income statement', '利润表'), IS)}${statement(bi('Cash flow', '现金流量'), CF)}${statement(bi('Balance sheet', '资产负债表'), BS)}
      <h4>${bi('Indicators', '指标')}</h4>${tableHTML(['', ...idx.map(i => `FY${shard.periods[i].fy}`)], indRows, 'fin-table')}
      <details><summary>How each figure is chosen (tag order)</summary>${tableHTML(['Figure', 'Statement', 'Tags, in fallback order'], Object.entries(catalog).filter(([k]) => k in shard.values).map(([k, c]) => [e(label(k)), e(c.statement), e(c.rule || c.chain.join(' → '))]))}<p class="note">The best tag any 10-K reports for a period wins, then the latest filing with that tag. Missing values are never treated as zero; an implausible total debt is withheld. Indicators are computed in your browser from the traced figures.</p></details>
    </section>
    <section class="panel"><h3>${bi(`Data-quality notes (${notes.length})`, '数据质量说明')}</h3>${notes.length ? `<ul class="quality-list">${notes.slice(0, 60).map(q => `<li class="q-${e(q.kind)}"><span class="q-kind">${e(q.kind.replace('_', ' '))}</span> ${e(q.text)}</li>`).join('')}</ul>` : '<p>No notes: every supported figure came from its first-choice tag, with no restatement, conflict or fiscal-year change.</p>'}</section>`;
  }

  // ---------------------------------------------------------------- Compare (universe side)
  function compareView() {
    const head = `<p class="eyebrow">03 / SIDE BY SIDE · 并排比较</p><h2>Compare up to eight companies <span class="zh" lang="zh-Hans">最多八家并排</span></h2><p class="muted">Each company is shown with its own fiscal year and period end. Fiscal calendars differ; the column header says which year each value belongs to.</p>`;
    if (s.indexError) return `${head}${searchMarkup()}`;
    if (!s.prepared) return `${head}<p class="empty">Loading the company list…</p>`;
    const entries = s.compare.map(c => s.prepared.byCik.get(c)).filter(Boolean);
    const add = `<div class="compare-add">${searchMarkup().replace('id="company-search"', 'id="compare-search"').replace('aria-controls="company-options"', 'aria-controls="compare-options"').replace('id="company-options"', 'id="compare-options"').replace('id="company-search-note"', 'id="compare-search-note"').replace('for="company-search"', 'for="compare-search"').replace(/value="[^"]*"/, 'value=""').replace(/Company <small>/, 'Add a company <small>')}</div>`;
    const chips = entries.map(en => `<span class="chip-company">${e(primary(en))}<button type="button" data-remove="${en.c}" aria-label="Remove ${e(en.n)}">×</button></span>`).join('');
    const fys = [...new Set(entries.flatMap(en => shardOf(en.c)?.periods.map(p => p.fy) || []))].sort((a, b) => b - a);
    const controls = `<div class="compare-controls"><div class="chips" aria-label="Companies in the comparison">${chips || '<span class="muted">No companies yet.</span>'}</div><label>Fiscal year<select id="compare-fy"><option value="latest">Latest of each</option>${fys.map(y => `<option value="${y}"${String(s.compareFy) === String(y) ? ' selected' : ''}>FY${y}</option>`).join('')}</select></label>${s.entry ? `<button type="button" id="compare-peers">Fill with ${e(primary(s.entry))}'s peers</button>` : ''}<button type="button" id="compare-clear">Clear</button><button type="button" class="primary" id="export-compare"${entries.length ? '' : ' disabled'}>Download CSV with sources</button></div>`;
    if (!entries.length) return `${head}${add}${controls}`;
    const missing = entries.filter(en => !shardOf(en.c));
    if (missing.length) return `${head}${add}${controls}${missing.some(en => s.shardErrors[en.c]) ? `<p class="error">Could not load ${missing.map(en => e(primary(en))).join(', ')}. <button type="button" id="retry-compare">Retry</button></p>` : '<p class="empty" aria-busy="true">Loading…</p>'}`;
    const cols = entries.map(en => {
      const shard = shardOf(en.c), i = s.compareFy === 'latest' ? shard.periods.length - 1 : shard.periods.findIndex(p => String(p.fy) === String(s.compareFy));
      return {en, shard, i};
    });
    const rows = COMPARE_ROWS.filter(k => cols.some(({shard}) => (k in FIGURES ? k in shard.values : INDICATORS[k][6].includes(shard.template)))).map(k => [`${e(label(k))}<small lang="zh-Hans">${e(label(k, 'zh'))}</small>`, ...cols.map(({shard, i}) => i < 0 ? '<span class="missing" title="No such fiscal year">—</span>' : cellMarkup(shard, k, i))]);
    const header = ['', ...cols.map(({en, shard, i}) => `<button type="button" class="table-button" data-open="${en.c}">${e(primary(en))} ↗</button><small>${i < 0 ? 'no FY' + e(s.compareFy) : `FY${shard.periods[i].fy} · ${e(shard.periods[i].end)}`}</small><small>${e(TEMPLATE_LABEL[shard.template][0])}</small>`)];
    return `${head}${add}${controls}${tableHTML(header, rows, 'fin-table compare-table')}<p class="note">A comparison of reported figures and their ratios, not a ranking of investment quality. n/a: not supported for that company's template (for example gross margin for a bank). —: not reported, or not meaningful.</p>`;
  }

  // ---------------------------------------------------------------- Screen
  function screenRows() {
    const f = s.filters, built = s.screen;
    let rows = built.rows;
    if (f.peer.startsWith('sic2:')) rows = rows.filter(r => r.sic.padStart(4, '0').slice(0, 2) === f.peer.slice(5));
    else if (f.peer) rows = rows.filter(r => (s.screen.members.get(f.peer) || []).includes(r));
    if (f.template) rows = rows.filter(r => r.entry.tp === f.template);
    if (f.text) { const q = f.text.toLowerCase(); rows = rows.filter(r => r.entry.t.some(t => t.toLowerCase() === q) || r.entry.n.toLowerCase().includes(q) || r.entry.z.some(z => z.includes(f.text))); }
    const num = v => v === '' ? null : Number(v);
    if (num(f.cc) !== null) rows = rows.filter(r => Number.isFinite(r.values.cash_conversion) && r.values.cash_conversion < num(f.cc));
    if (num(f.acc) !== null) rows = rows.filter(r => Number.isFinite(r.values.accruals) && r.values.accruals * 100 > num(f.acc));
    if (num(f.fcf) !== null) rows = rows.filter(r => Number.isFinite(r.values.fcf_margin) && r.values.fcf_margin * 100 < num(f.fcf));
    const key = r => f.sort === 'revenue' ? r.revenue?.[0] : f.sort === 'name' ? r.entry.n : r.values[f.sort];
    return [...rows].sort((a, b) => {
      const x = key(a), y = key(b);
      if (f.sort === 'name') return (f.dir === 'asc' ? 1 : -1) * String(x).localeCompare(String(y));
      if (!Number.isFinite(x)) return 1; if (!Number.isFinite(y)) return -1;
      return f.dir === 'asc' ? x - y : y - x;
    });
  }
  function screenView() {
    const head = `<p class="eyebrow">04 / EARNINGS-QUALITY SCREEN · 盈利质量筛选</p><h2>Screen the universe by cash behind profit</h2><p class="muted">Cash conversion, the accrual ratio and FCF margin for every industrial company and REIT, from each company's latest 10-K, with its percentile among sector peers. A screen sorts and filters reported ratios; it is not a rating, a recommendation or a fraud signal. Banks and insurers are left out because these ratios do not describe their statements.</p>`;
    if (s.indexError || s.screenError) return `${head}<div class="error"><h3>The screen could not be loaded</h3><p class="error-detail">${e(s.screenError || s.indexError)}</p><div class="actions"><button type="button" id="retry-screen">Retry</button></div></div>`;
    if (!s.screen) return `${head}<p class="empty" aria-busy="true">Loading the screen…</p>`;
    const f = s.filters, rows = screenRows();
    // A filter opened from Ask may be a classification level no company uses as its own peer group; it is listed so the select shows it.
    const peers = [...new Set([...s.screen.rows.map(r => r.peer), ...(f.peer && !f.peer.startsWith('sic2:') && s.screen.members.has(f.peer) ? [f.peer] : [])])].sort();
    const sic2 = [...new Set(s.screen.rows.map(r => r.sic.padStart(4, '0').slice(0, 2)).filter(x => /^\d\d$/.test(x)))].sort();
    const pctCell = (r, k) => Number.isFinite(r.values[k]) ? `<span class="v">${k === 'cash_conversion' ? `${r.values[k].toFixed(2)}×` : `${(r.values[k] * 100).toFixed(1)}%`}</span><small class="pct" title="Percentile among ${r.peerN?.[k] ?? 0} companies with this indicator in ${e(peerLabel(r.peerFor?.[k] || r.peer, s.screen.rows))}">p${r.pct[k]}</small>` : '<span class="missing">—</span>';
    const body = rows.slice(0, s.shown).map(r => [`<button type="button" class="table-button" data-open="${r.c}">${e(primary(r.entry))}</button><small>${e(r.entry.n)}</small>`, `<small>${e(peerLabel(r.peer, s.screen.rows))}</small>`, `FY${r.fy}<small>${e(r.end)}</small>`,
      r.revenue ? `<a class="traced" href="${e(filingUrl(r.c, r.revenue[2]))}" target="_blank" rel="noopener noreferrer" title="${e(`${r.revenue[1]} · ${r.revenue[2]}`)}">${e(show('revenue', r.revenue[0]))}</a>` : '—', pctCell(r, 'cash_conversion'), pctCell(r, 'accruals'), pctCell(r, 'fcf_margin')]);
    const sortBtn = (key, text) => `<button type="button" class="sort" data-sort="${key}" aria-label="Sort by ${text}">${text}${f.sort === key ? (f.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button>`;
    return `${head}<form id="screen-form" class="screen-filters" aria-label="Screen filters">
      <label>Sector<select name="peer"><option value="">All sectors</option><optgroup label="SIC major group">${sic2.map(c => `<option value="sic2:${c}"${f.peer === `sic2:${c}` ? ' selected' : ''}>SIC ${c}xx · ${e(sicGroupName(c))}</option>`).join('')}</optgroup><optgroup label="Peer groups used for percentiles">${peers.map(pg => `<option value="${e(pg)}"${f.peer === pg ? ' selected' : ''}>${e(peerLabel(pg, s.screen.rows))}</option>`).join('')}</optgroup></select></label>
      <label>Template<select name="template"><option value="">Industrial and REIT</option><option value="industrial"${f.template === 'industrial' ? ' selected' : ''}>Industrial</option><option value="reit"${f.template === 'reit' ? ' selected' : ''}>REIT</option></select></label>
      <label>Company<input name="text" type="search" value="${e(f.text)}" placeholder="Ticker or name"></label>
      <label>Cash conversion below<input name="cc" type="number" step="0.1" value="${e(f.cc)}" placeholder="e.g. 1"></label>
      <label>Accrual ratio above (%)<input name="acc" type="number" step="0.5" value="${e(f.acc)}" placeholder="e.g. 5"></label>
      <label>FCF margin below (%)<input name="fcf" type="number" step="1" value="${e(f.fcf)}" placeholder="e.g. 0"></label>
      <div class="actions"><button type="button" id="screen-reset">Reset</button><button type="button" class="primary" id="export-screen">Download CSV with sources (${rows.length})</button></div></form>
      <p class="note" role="status" aria-live="polite">${rows.length.toLocaleString('en-US')} of ${s.screen.rows.length.toLocaleString('en-US')} companies. p = percentile among sector peers: the most specific SIC level where at least 10 screened companies have that ratio (hover a p-value for its group and size); REITs are compared with REITs only. Cash conversion = operating cash flow ÷ net income (net income above zero only); accrual ratio = (net income − operating cash flow) ÷ average total assets; FCF margin = (operating cash flow − capital expenditure) ÷ revenue; not computed for REITs, whose property spending is not in the capex tags (they report FFO and AFFO, which are non-GAAP and not in SEC XBRL).</p>
      ${tableHTML([sortBtn('name', 'Company'), 'Peer group', 'Fiscal year', sortBtn('revenue', 'Revenue'), sortBtn('cash_conversion', 'Cash conversion'), sortBtn('accruals', 'Accrual ratio'), sortBtn('fcf_margin', 'FCF margin')], body, 'fin-table screen-table')}
      ${rows.length > s.shown ? `<div class="actions"><button type="button" id="screen-more">Show ${Math.min(PAGE, rows.length - s.shown)} more</button></div>` : ''}`;
  }

  // ---------------------------------------------------------------- Watch
  async function checkWatch() {
    if (s.watchBusy || !s.watch.length) return;
    s.watchBusy = true;
    render();
    for (const w of s.watch) {
      try {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
        const response = await fetcher(`https://data.sec.gov/submissions/CIK${String(w.cik).padStart(10, '0')}.json`, {signal: controller.signal, cache: 'no-cache', credentials: 'omit', referrerPolicy: 'no-referrer'});
        clearTimeout(timer);
        if (!response.ok) throw new Error(`SEC answered ${response.status}`);
        const data = await response.json();
        if (Number(data?.cik) !== w.cik) throw new Error('SEC returned a different company');
        const since = w.seen || null;
        s.watchResults[w.cik] = {ok: true, since, filings: newFilings(data, w.cik, since || addDays(today(), -30)), checked: today()};
        w.checkedFirst = w.checkedFirst || today();
      } catch (error) {
        s.watchResults[w.cik] = {ok: false, error: error.name === 'AbortError' ? 'the request timed out' : error.message || 'network error'};
      }
      await new Promise(r => setTimeout(r, 250));
    }
    s.watchBusy = false;
    render();
  }
  function markSeen() {
    for (const w of s.watch) if (s.watchResults[w.cik]?.ok) w.seen = s.watchResults[w.cik].checked;
    writeWatch(s.watch, storage);
    status('Marked as seen. Next time, only filings after today are listed as new.');
    render();
  }
  function watchView() {
    const head = `<p class="eyebrow">05 / FILING WATCH · 关注新文件</p><h2>New 10-K, 10-Q and 8-K filings for companies you follow</h2><p class="privacy-note"><strong>What leaves this page:</strong> only one request per watched company, from your browser straight to the SEC (<code>data.sec.gov/submissions</code>), for its public filing list. Nothing is sent to FinScope. Your watchlist is kept in this browser's local storage; clearing site data removes it.</p>`;
    const list = s.watch.length ? `<ul class="watch-list">${s.watch.map(w => {
      const res = s.watchResults[w.cik];
      const body = !res ? '<p class="muted">Not checked yet.</p>' : !res.ok ? `<p class="error">Could not reach the SEC for ${e(w.ticker)}: ${e(res.error)}. The list stays as it was; retry later.</p>`
        : res.filings.length ? `<ul class="filings">${res.filings.slice(0, 15).map(f => `<li><span class="form">${e(f.form)}</span> <a href="${e(f.url)}" target="_blank" rel="noopener noreferrer">${e(f.description || f.form)} ↗</a> <small>filed ${e(f.filed)}${f.report ? ` · period ${e(f.report)}` : ''}${f.items ? ` · items ${e(f.items.split(',').map(i => `${i}${ITEM_8K[i] ? ` ${ITEM_8K[i]}` : ''}`).join(', '))}` : ''}</small></li>`).join('')}</ul>`
        : `<p class="muted">No new 10-K, 10-Q or 8-K since ${e(res.since || 'the last 30 days')}.</p>`;
      return `<li class="watch-item"><div class="watch-head"><strong>${e(w.ticker)}</strong> ${e(w.name)}<small>${w.seen ? `last marked seen ${e(w.seen)}` : 'new to your list: showing the last 30 days'}</small><button type="button" class="link-button" data-open="${w.cik}">Financials</button><button type="button" class="link-button" data-unwatch="${w.cik}" aria-label="Stop watching ${e(w.name)}">Remove</button></div>${body}</li>`;
    }).join('')}</ul>` : '<p class="empty">No companies yet. Search below, or use “Watch new filings” on a company’s Financials page.</p>';
    return `${head}<div class="compare-add">${searchMarkup().replace('id="company-search"', 'id="watch-search"').replace('aria-controls="company-options"', 'aria-controls="watch-options"').replace('id="company-options"', 'id="watch-options"').replace('id="company-search-note"', 'id="watch-search-note"').replace('for="company-search"', 'for="watch-search"').replace(/value="[^"]*"/, 'value=""').replace(/Company <small>/, 'Add a company <small>')}</div>
      <div class="actions"><button type="button" class="primary" id="watch-check"${s.watch.length && !s.watchBusy ? '' : ' disabled'}>${s.watchBusy ? 'Checking the SEC…' : 'Check for new filings'}</button><button type="button" id="watch-seen"${Object.values(s.watchResults).some(r => r.ok) ? '' : ' disabled'}>Mark all as seen</button></div>
      <p id="watch-live" class="sr-only" role="status" aria-live="polite">${s.watchBusy ? 'Checking the SEC for new filings.' : ''}</p>${list}
      <p class="note">Up to ${MAX_WATCH} companies. Requests are spaced a quarter of a second apart, within the SEC's fair-access limit of ten per second. FinScope does not alert you by email or keep a server copy; the SEC also offers EDGAR full-text search and RSS feeds for alerts.</p>`;
  }
  const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  function toggleWatch(entry) {
    const i = s.watch.findIndex(w => w.cik === entry.c);
    if (i >= 0) s.watch.splice(i, 1);
    else if (s.watch.length >= MAX_WATCH) { status(`The watchlist holds up to ${MAX_WATCH} companies. Remove one first.`); return; }
    else s.watch.push({cik: entry.c, ticker: primary(entry), name: entry.n, seen: null});
    if (!writeWatch(s.watch, storage)) status('This browser does not allow local storage, so the watchlist lasts only until you leave the page.');
    render();
  }

  // ---------------------------------------------------------------- shared
  function tableHTML(heads, rows, cls = '') {
    return `<div class="table-wrap" tabindex="0" role="region" aria-label="${e(heads.map(h => String(h).replace(/<[^>]+>/g, ' ')).join(', ').slice(0, 160))}"><table class="${cls}"><thead><tr>${heads.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function peersOf(entry, n = MAX_COMPARE) {
    const sic = String(entry.s || '');
    const pool = s.index.companies.filter(x => x.c !== entry.c && x.tp === entry.tp);
    for (const len of [4, 3, 2]) {
      const same = pool.filter(x => String(x.s || '').padStart(4, '0').slice(0, len) === sic.padStart(4, '0').slice(0, len));
      if (same.length >= 3 || len === 2) return [entry.c, ...same.sort((a, b) => a.r - b.r).slice(0, n - 1).map(x => x.c)];
    }
    return [entry.c];
  }

  function bind(root, page) {
    if (page === 'company') {
      bindSearch(root);
      root.querySelector('#retry-shard')?.addEventListener('click', async () => { await ensureShard(s.entry.c); render(); });
      root.querySelectorAll('[data-years]').forEach(b => b.addEventListener('click', () => { s.years = Number(b.dataset.years); render(); }));
      root.querySelector('#watch-toggle')?.addEventListener('click', () => toggleWatch(s.entry));
      root.querySelector('#open-deep')?.addEventListener('click', () => openCompanyDeep?.(primary(s.entry), 'review'));
      root.querySelector('#compare-peers')?.addEventListener('click', () => { s.compare = peersOf(s.entry); s.compareFy = 'latest'; Promise.all(s.compare.map(ensureShard)).then(render); openCompanyDeep?.(null, 'compare'); });
      root.querySelector('#export-financials')?.addEventListener('click', () => {
        const shard = shardOf(s.entry.c);
        const figures = STATEMENT_ORDER.filter(k => k in shard.values), inds = KEY_INDICATORS.concat(['cash_margin', 'profit_cash_gap', 'payout', 'liabilities_assets', 'current_ratio']).filter(k => INDICATORS[k][6].includes(shard.template));
        download(toCSV(CSV_HEADER, shardRows(shard, figures, inds)), 'text/csv;charset=utf-8', `finscope-${primary(s.entry)}-financials.csv`);
      });
      const target = root.querySelector('#universe-waterline'), shard = s.entry && shardOf(s.entry.c);
      if (target && shard) {
        const rows = shard.periods.map((p, i) => ({period_end: p.end, period_start: p.start, fy: p.fy, metrics: Object.fromEntries(['net_income', 'operating_cash_flow'].map(k => { const v = sourceOf(shard, k, i); return [k, v && {...v, end: v.period_end, start: v.period_start}]; }))}));
        renderWaterline(target, rows, {ticker: primary(s.entry), selected: rows.length - 1, id: 'universe-wl'});
      }
    }
    if (page === 'compare') {
      const input = root.querySelector('#compare-search'), list = root.querySelector('#compare-options');
      if (input && list && s.prepared) bindPicker(input, list, entry => { if (s.compare.includes(entry.c)) return; if (s.compare.length >= MAX_COMPARE) { status(`Compare at most ${MAX_COMPARE} companies. Remove one first.`); return; } s.compare.push(entry.c); ensureShard(entry.c).then(render); render(); });
      root.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { s.compare = s.compare.filter(c => c !== Number(b.dataset.remove)); render(); }));
      root.querySelector('#compare-fy')?.addEventListener('change', ev => { s.compareFy = ev.target.value; render(); });
      root.querySelector('#compare-clear')?.addEventListener('click', () => { s.compare = []; render(); });
      root.querySelector('#compare-peers')?.addEventListener('click', () => { s.compare = peersOf(s.entry); Promise.all(s.compare.map(ensureShard)).then(render); render(); });
      root.querySelector('#retry-compare')?.addEventListener('click', () => Promise.all(s.compare.map(ensureShard)).then(render));
      root.querySelector('#export-compare')?.addEventListener('click', () => {
        const rows = s.compare.flatMap(c => { const shard = shardOf(c); if (!shard) return []; const years = s.compareFy === 'latest' ? [shard.periods.at(-1).fy] : [Number(s.compareFy)]; return shardRows(shard, COMPARE_ROWS.filter(k => k in FIGURES), COMPARE_ROWS.filter(k => k in INDICATORS), years); });
        download(toCSV(CSV_HEADER, rows), 'text/csv;charset=utf-8', `finscope-compare-${s.compare.map(c => primary(s.prepared.byCik.get(c))).join('-')}.csv`);
      });
    }
    if (page === 'screen') {
      root.querySelector('#retry-screen')?.addEventListener('click', async () => { await ensureIndex(); await ensureScreen(); render(); });
      const form = root.querySelector('#screen-form');
      form?.addEventListener('submit', ev => ev.preventDefault());
      form?.addEventListener('change', () => { const data = new FormData(form); for (const k of ['peer', 'template', 'text', 'cc', 'acc', 'fcf']) s.filters[k] = String(data.get(k) ?? ''); s.shown = PAGE; render(); });
      root.querySelector('#screen-reset')?.addEventListener('click', () => { s.filters = {peer: '', text: '', template: '', cc: '', acc: '', fcf: '', sort: 'revenue', dir: 'desc'}; s.shown = PAGE; render(); });
      root.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.sort; s.filters.dir = s.filters.sort === k && s.filters.dir === 'desc' ? 'asc' : 'desc'; s.filters.sort = k; render(); }));
      root.querySelector('#screen-more')?.addEventListener('click', () => { s.shown += PAGE; render(); });
      root.querySelectorAll('[data-sort]').forEach(b => { const th = b.closest('th'); if (th) th.setAttribute('aria-sort', s.filters.sort === b.dataset.sort ? (s.filters.dir === 'asc' ? 'ascending' : 'descending') : 'none'); });
      root.querySelector('#export-screen')?.addEventListener('click', () => download(screenCSV(s.screen, screenRows()), 'text/csv;charset=utf-8', 'finscope-screen.csv'));
    }
    if (page === 'watch') {
      const input = root.querySelector('#watch-search'), list = root.querySelector('#watch-options');
      if (input && list && s.prepared) bindPicker(input, list, entry => { if (!s.watch.some(w => w.cik === entry.c)) toggleWatch(entry); });
      root.querySelector('#watch-check')?.addEventListener('click', checkWatch);
      root.querySelector('#watch-seen')?.addEventListener('click', markSeen);
      root.querySelectorAll('[data-unwatch]').forEach(b => b.addEventListener('click', () => { const entry = s.prepared?.byCik.get(Number(b.dataset.unwatch)) || {c: Number(b.dataset.unwatch)}; toggleWatch(entry); }));
    }
    root.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { const entry = s.prepared?.byCik.get(Number(b.dataset.open)); if (entry) { pick(entry); openCompanyDeep?.(null, 'company'); } }));
  }
  function bindPicker(input, list, onPick) {
    let active = -1, results = [];
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
    const paint = () => {
      list.innerHTML = results.map((r, i) => `<li role="option" id="${list.id}-${i}" data-cik="${r.c}" aria-selected="${i === active}"><strong>${e(primary(r))}</strong> ${e(r.n)}</li>`).join('') || `<li class="no-match" aria-disabled="true">No match in the universe.</li>`;
      list.hidden = false; input.setAttribute('aria-expanded', 'true');
      if (active >= 0) input.setAttribute('aria-activedescendant', `${list.id}-${active}`); else input.removeAttribute('aria-activedescendant');
      list.querySelectorAll('[data-cik]').forEach(li => li.addEventListener('mousedown', ev => { ev.preventDefault(); const en = s.prepared.byCik.get(Number(li.dataset.cik)); close(); input.value = ''; onPick(en); }));
    };
    input.addEventListener('input', () => { results = searchCompanies(s.prepared, input.value, 8); active = results.length ? 0 : -1; input.value.trim() ? paint() : close(); });
    input.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowDown' && results.length) { ev.preventDefault(); active = (active + 1) % results.length; paint(); }
      else if (ev.key === 'ArrowUp' && results.length) { ev.preventDefault(); active = (active - 1 + results.length) % results.length; paint(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); const en = results[active]; if (en) { close(); input.value = ''; onPick(en); } }
      else if (ev.key === 'Escape') close();
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
  }

  return {
    state: s, ensureIndex, ensureShard, ensureScreen, entryByTicker, pick, peersOf,
    // Opens Screen with a filter and sort (from an Ask answer or a ?view=screen link); unknown values are dropped.
    openScreen(f = {}) {
      const ok = {peer: /^(sic2:\d\d|(ind|reit):(sic[234]:\d{2,4}|div:[A-J]))$/, template: /^(industrial|reit)$/, sort: /^(revenue|name|cash_conversion|accruals|fcf_margin)$/, dir: /^(asc|desc)$/};
      s.filters = {peer: '', text: '', template: '', cc: '', acc: '', fcf: '', sort: 'revenue', dir: 'desc'};
      for (const [k, re] of Object.entries(ok)) if (typeof f[k] === 'string' && re.test(f[k])) s.filters[k] = f[k];
      s.shown = PAGE;
    },
    views: {company: financialsView, compare: compareView, screen: screenView, watch: watchView},
    bind,
    // Loads what a view needs; resolves true when new data or a new error arrived (so the caller renders again).
    async prepare(page) {
      const before = s.version;
      if (!s.index && !s.indexError) await ensureIndex();
      if (page === 'company' && s.entry && !s.shards[s.entry.c] && !s.shardErrors[s.entry.c]) await ensureShard(s.entry.c);
      if (page === 'compare') await Promise.all(s.compare.filter(c => !s.shards[c] && !s.shardErrors[c]).map(ensureShard));
      if (page === 'screen' && !s.screen && !s.screenError) await ensureScreen();
      return s.version !== before;
    },
    askContext: async (ciks, needScreen) => {
      const shards = {};
      for (const c of ciks) { const shard = await ensureShard(c); if (shard) shards[c] = shard; }
      if (needScreen) await ensureScreen();
      return {index: s.index, shards, screen: s.screen};
    }
  };
}
