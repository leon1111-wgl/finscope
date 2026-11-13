import {loadResearchEvidence} from './research-load.js';
import {initOfficialUpdates} from './official-updates.js?v=20261020-facts2';
import {buildComparison, comparisonCSV} from './comparison-export.js';
import {CALCULATION_VERSION, MAX_BRIEF_BYTES, validDate, selectionFromBrief, selectionFromURL, approveSelection, researchQuery} from './research-state.js';
import {evidenceLink} from './evidence-links.js';
import {answerQuestion, planQuestion, MAX_QUESTION} from './ask-engine.js?v=20261114-universe';
import {createUniverseUI} from './universe-ui.js?v=20261114-universe';
import {
  bridgeMarkup,
  cashBridgeSVG
} from './cash-bridge.js?v=20261101-ledger';
import {renderWaterline} from './waterline.js?v=20261101-ledger';
import {initShell, renderIntro, introUnavailable} from './intro.js?v=20261101-ledger';
import {initThemeToggle} from './theme.js?v=20261101-ledger';
import {
  escapeHTML as e
} from './workbench.js';
import {
  selectSnapshot,
  selectInterim,
  interimSummary,
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
let pendingRestore = null, restoreSequence = 0, ready = false;
let loadingEvidence = false, controlsBound = false, traceYear = null, shell, pendingEntry = null;
let askQuestion = '', askAnswer = null, pendingQuestion = null;
let assumptions = {
  revenuePercent: 0,
  marginPoints: 0,
  refinanceBillions: 0,
  rateBps: 0,
  collectionDays: 0
};
const params = new URLSearchParams(location.search);
let renderedVersion = -1;
const uni = createUniverseUI({
  $, e,
  download: (text, type, filename) => downloadFile(text, type, filename),
  status: message => { $('#status').textContent = message; },
  render: () => { if (ready && !pendingRestore) render(); },
  openCompanyDeep: (ticker, view) => {
    if (!ready || pendingRestore) return;
    if (ticker && ticker !== company.ticker && bundle.companies.some(c => c.ticker === ticker)) {
      if (!validScenarioDraft()) return;
      $('#company').value = ticker;
      if (view) page = view;
      useSelection();
    } else if (view && view !== page) show(view);
  }
});
const uniContext = () => uni.state.index ? {index: uni.state.index, shards: uni.state.shards, screen: uni.state.screen} : undefined;
function downloadFile(text, type, filename) {
  const url = URL.createObjectURL(new Blob([text], {type})), a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('#status').textContent = `Download prepared: ${filename}. Every value carries its XBRL tag, accession and filing link.`;
}
const panel = (title, body, kind = '') => `<section class="panel${kind ? ' ' + kind : ''}"><h3>${title}</h3>${body}</section>`;
const kpi = (label, value, detail) => `<div class="kpi"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
const table = (heads, rows) => `<div class="table-wrap" tabindex="0" role="region" aria-label="${e(heads.join(', '))}"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const factsTable = metrics => table(['Reported metric', 'USD billions', 'Period end', 'Filed', 'Evidence'], Object.entries(metrics).map(([key, f]) => [names[key] || e(key), money(f?.value), f?.end || '—', f?.filed || '—', f ? evidenceLink(f) : 'No matching standard USD fact']));

function updateURL() {
  // The intro keeps a clean address; the research query is written once the console is open.
  if (!ready || pendingRestore || shell?.mode() === 'intro') return;
  let query = researchQuery({ticker: company.ticker, date: selectedDate, view: page, assumptions}, bundle.dataset_sha256);
  const co = uni.state.entry?.t?.[0];
  if (co && co !== company.ticker) query += `&co=${encodeURIComponent(co)}`;
  history.replaceState(null, '', `${location.pathname}?${query}${location.hash}`);
}

function setResearchSelection(ticker, day) {
  company = bundle.companies.find(c => c.ticker === ticker);
  selectedDate = day;
  snapshot = selectSnapshot(bundle.snapshots, day);
  row = snapshot.companies[ticker].at(-1);
  traceYear = null;
  $('#company').value = ticker;
  $('#as-of').value = day;
  $('#scope').textContent = `Deep ledger: ${company.name} · Annual period ended ${row.period_end} · Financial snapshot ${snapshot.as_of} (on or before your selected date) · Latest selected annual filing ${row.known_at}.`;
}

function lockResearch(locked) {
  for (const el of document.querySelectorAll('#selection input, #selection select, #selection button, [data-page], #brief-file')) el.disabled = locked;
}

function applySavedSelection(selection, allowCurrentData = false) {
  const accepted = approveSelection(selection, bundle, {allowCurrentData});
  pendingRestore = null;
  $('#restore-preview').hidden = true;
  assumptions = accepted.assumptions;
  page = accepted.view;
  setResearchSelection(accepted.ticker, accepted.date);
  lockResearch(false);
  $('#status').textContent = '';
  render();
}

function previewSavedSelection(selection, error = null, source = 'file') {
  pendingRestore = {selection, source};
  lockResearch(true);
  const target = $('#restore-preview');
  target.hidden = false;
  const version = selection?.versionStatus;
  const heading = error ? 'Saved view could not be opened' : version === 'changed' ? 'The data or calculation version has changed' : version === 'unversioned' ? 'The saved version is incomplete' : 'Review the saved inputs';
  const detail = error ? `<p class="error">${e(error)}</p>` : `<p>${e(selection.ticker)} · Information date ${e(selection.date)}</p><p>${version === 'match' ? 'The recorded data and calculation versions match this site. Restore the inputs and recompute the results.' : 'The original calculations cannot be reproduced with this site’s current data and calculation rules with certainty. You can explicitly recalculate the saved inputs using current data, or cancel.'}</p><dl><dt>Saved dataset</dt><dd><code>${e(selection.dataset || 'Not recorded')}</code></dd><dt>Current dataset</dt><dd><code>${e(bundle.dataset_sha256)}</code></dd><dt>Calculation version</dt><dd>Saved: ${e(selection.calculation || 'Not recorded')} · Current: ${CALCULATION_VERSION}</dd></dl>${table(['Assumption','Saved input'],[['Revenue change',selection.assumptions.revenuePercent+'%'],['Margin change',selection.assumptions.marginPoints+' percentage points'],['Refinancing exposure',selection.assumptions.refinanceBillions+' USD billions'],['Rate change',selection.assumptions.rateBps+' basis points'],['Collection delay',selection.assumptions.collectionDays+' days']])}<p class="note">Only these inputs are restored. Saved financial values and model outputs are not trusted or imported. A matching identifier does not authenticate an edited file.</p>`;
  target.innerHTML = panel(heading, `${detail}<div class="actions">${selection ? `<button class="primary" id="restore-apply">${version === 'match' ? 'Restore these inputs' : 'Recalculate with current data'}</button>` : ''}<button id="restore-cancel">${source === 'link' ? 'Start a new review' : 'Cancel and keep my review'}</button></div>`);
  $('#scope').textContent = 'Saved inputs have not been applied.';
  $('#content').innerHTML = '<p class="empty">Review the saved inputs above before continuing. No recalculated result is shown yet.</p>';
  $('#restore-apply')?.addEventListener('click', () => {
    try {
      const original = pendingRestore.selection;
      applySavedSelection(original, original.versionStatus !== 'match');
      $('#restore-message').textContent = original.versionStatus === 'match' ? 'Inputs restored. Results were recomputed from this site’s data; saved financial values were not imported.' : 'Recalculated with current data and formulas. These results may differ from the original brief. New exports record both current versions.';
    } catch (err) { $('#status').textContent = err.message; }
  });
  $('#restore-cancel').addEventListener('click', () => {
    applySavedSelection({ticker: company.ticker, date: selectedDate, view: page, assumptions, dataset: bundle.dataset_sha256, calculation: CALCULATION_VERSION});
    $('#restore-message').textContent = 'Saved inputs were not applied. Your current review is available.';
  });
  const title = target.querySelector('h3');
  title.tabIndex = -1;
  title.focus();
}

async function openSavedBrief(event) {
  const file = event.target.files[0];
  if (!file || !validScenarioDraft()) { event.target.value = ''; return; }
  const sequence = ++restoreSequence;
  $('#restore-message').textContent = 'Reading the brief on your device…';
  try {
    if (file.size > MAX_BRIEF_BYTES) throw new Error('Choose a FinScope JSON brief smaller than 2 MB.');
    const text = await file.text();
    if (sequence !== restoreSequence) return;
    if (!validScenarioDraft()) { $('#restore-message').textContent = 'The file was not applied. Correct the current scenario, then choose the file again.'; return; }
    previewSavedSelection(selectionFromBrief(text, bundle));
    $('#restore-message').textContent = '';
  } catch (error) {
    if (sequence === restoreSequence) {
      if (!validScenarioDraft()) { $('#restore-message').textContent = 'The file was not applied. Correct the current scenario, then choose the file again.'; return; }
      previewSavedSelection(null, error.message);
      $('#restore-message').textContent = '';
    }
  } finally { if (sequence === restoreSequence) event.target.value = ''; }
}

function validScenarioDraft() {
  if (pendingRestore) { $('#status').textContent = 'Choose how to handle the saved view above before continuing.'; return false; }
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
  if (!validDate(day) || day < bundle.snapshots[0].as_of || day > bundle.as_of) {
    $('#as-of').value = selectedDate;
    $('#status').textContent = `Choose a date from ${bundle.snapshots[0].as_of} through ${bundle.as_of}. Your previous valid selection is restored.`;
    return;
  }
  setResearchSelection($('#company').value, day);
  const entry = uni.entryByTicker(company.ticker);
  if (entry) uni.pick(entry, {deep: false});
  $('#status').textContent = '';
  render();
}

function show(next) {
  if (!validScenarioDraft()) return;
  page = next;
  $('#status').textContent = '';
  render();
}

function interimMarkup(selection, includeSources = true) {
  const c = selection.checkpoint;
  if (!c) return `<p>${e(interimSummary(selection))}</p><p class="note">The annual baseline remains the basis of the AI score and stress scenario. Open the SEC source for other recent disclosures.</p>`;
  const pp = v => Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)} pp` : 'Unavailable';
  const period = p => p ? `${p.period_start} → ${p.period_end}` : 'No comparable prior period';
  return `<p class="eyebrow">AFTER THE ANNUAL REPORT / FISCAL YEAR TO DATE</p><div class="interim-periods"><div><span>Current YTD</span><strong>${period(c.current)}</strong></div><div><span>Prior YTD</span><strong>${period(c.prior)}</strong></div></div><p class="note">Checkpoint known by ${c.as_of}; filtered through your information date ${selectedDate}. These are cumulative fiscal-year flows, not standalone quarters or trailing-twelve-month totals.</p>
    ${table(['Matched YTD metric','Current','Prior','Change','Growth'],Object.entries(c.changes).map(([k,v])=>[names[k],money(c.current.metrics[k]?.value),money(c.prior?.metrics[k]?.value),money(v.absolute),pct(v.growth)]))}
    <div class="kpis">${kpi('Current cash margin',pct(c.current_cash_margin),'Operating cash flow ÷ revenue')}${kpi('Prior cash margin',pct(c.prior_cash_margin),'Same fiscal YTD last year')}${kpi('Cash-margin change',pp(c.cash_margin_change_pp),'Percentage points, not percent growth')}${kpi('Operating-margin change',pp(c.operating_margin_change_pp),'Operating income ÷ revenue')}</div>
    <div class="question"><strong>A question worth investigating</strong><p>${e(interimSummary(selection))}</p></div>
    <p class="note">Growth = current / prior − 1. A missing or nonpositive prior value makes percentage growth unavailable; absolute changes remain visible. The annual AI score and scenario do not use or annualize these interim values.</p>
    ${includeSources ? `<details><summary>Trace the matched YTD facts and formulas</summary><h4>Current YTD · ${period(c.current)}</h4>${factsTable(c.current.metrics)}${c.prior ? `<h4>Prior YTD · ${period(c.prior)}</h4>${factsTable(c.prior.metrics)}` : '<p>Prior matching revenue period unavailable; no growth comparison is made.</p>'}<p>Each flow must match both the fiscal start and end. Prior-year duration may differ by up to eight days to allow a 53-week fiscal calendar. Cash-margin change = (current cash flow / current revenue − prior cash flow / prior revenue) × 100. Operating-margin change uses operating income instead of cash flow.</p><p><a href="https://www.ecfr.gov/current/title-17/chapter-II/part-210/section-210.10-01" target="_blank" rel="noopener noreferrer">Why interim cash-flow comparisons use fiscal YTD ↗</a></p></details>` : `<p class="note">Interim source filings: ${[...new Map([c.current,c.prior].filter(Boolean).flatMap(p=>Object.values(p.metrics).filter(Boolean)).map(f=>[f.url,f])).values()].map(f=>`<a href="${e(f.url)}">${e(f.form)} · ${f.filed} · ${e(f.accession)}</a>`).join('; ')}. Exact metric-to-source mappings are in both downloads.</p>`}${bridgeMarkup(c.current,c.prior,company.ticker,!includeSources)}`;
}

const ASK_EXAMPLES = ['好市多的利润有现金流支撑吗', 'Compare KO, PEP and MDLZ gross margin', '摩根大通近五年的净利息收入', 'JPM 的毛利率是多少', 'Which tag is Walmart revenue from?', 'NVDA 的利润有现金流支撑吗', 'Should I buy NVDA now?'];
const ASK_STATUS = {answered: 'Answered', not_in_bundle: 'Not in this bundle', refused: 'Declined', clarify: 'Needs more detail'};
const chips = (list, label) => `<div class="ask-chips" role="group" aria-label="${e(label)}">${list.map(q => `<button type="button" class="chip" data-ask="${e(q)}">${e(q)}</button>`).join('')}</div>`;
function sourceLink(f) {
  if (f.accession) return evidenceLink(f);
  try {
    const url = new URL(f.url);
    if (url.protocol === 'https:' && url.hostname === 'home.treasury.gov') return `<span class="evidence-links"><a href="${e(url.href)}" target="_blank" rel="noopener noreferrer">Treasury source ↗</a><small>${e(f.form)}</small></span>`;
  } catch { /* fall through */ }
  return 'Source unavailable';
}
function noteMarkup(n) {
  return /^https:\/\/www\.sec\.gov\/[\w/.-]*$/.test(n) ? `<a href="${e(n)}" target="_blank" rel="noopener noreferrer">${n.includes('/edgar/search') ? 'SEC EDGAR company search' : 'SEC EDGAR APIs'} ↗</a>` : e(n);
}
function answerMarkup(a) {
  const facts = a.facts.map(f => [e(f.label), e(f.ticker || '—'), `${e(f.display)}${f.exact_usd && f.exact_usd !== '—' ? `<small class="exact">${e(f.exact_usd)} ${e(f.unit)}</small>` : ''}`, e(f.period_start ? `${f.period_start} → ${f.period_end}` : f.period_end), e(f.filed || '—'), sourceLink(f)]);
  return `<article class="answer answer-${e(a.status)}" lang="${a.lang === 'zh' ? 'zh-Hans' : 'en'}" aria-labelledby="answer-q">
  <header class="answer-head"><span class="engine-stamp">Rules · tier 1 · no model</span><span class="answer-status" lang="en">${e(ASK_STATUS[a.status] || a.status)}</span></header>
  <h3 id="answer-q" tabindex="-1"><span class="sr-only" lang="en">Your question: </span>${e(a.question)}</h3>
  <p class="answer-summary">${e(a.summary)}</p>
  ${a.table ? table(a.table.columns.map(e), a.table.rows.map(r => r.map(e))) : ''}
  ${a.calculations.length ? `<h4 lang="en">How the program calculated it</h4><ul class="calc-list">${a.calculations.map(c => `<li><strong>${e(c.label)}</strong> = ${e(c.formula)} → <span class="calc-result">${e(c.result)}</span></li>`).join('')}</ul>` : ''}
  ${facts.length ? `<details class="answer-sources"${facts.length <= 8 ? ' open' : ''}><summary lang="en">Source lines (${facts.length}) · every stated figure, with its SEC filing</summary>${table(['Figure', 'Company', 'Value', 'Period', 'Filed', 'Evidence'], facts)}</details>` : ''}
  ${a.notes.length ? `<ul class="answer-notes">${a.notes.map(n => `<li>${noteMarkup(n)}</li>`).join('')}</ul>` : ''}
  ${a.offers.length ? `<div class="ask-offers"><span lang="en">Try next</span>${chips(a.offers, 'Suggested questions')}</div>` : ''}
  <p class="engine-note">${e(a.engine.label)} · information date ${e(a.info_date)} · snapshot ${e(a.snapshot_date)}${a.dataset_sha256 ? ` · dataset ${e(a.dataset_sha256.slice(0, 12))}` : ''}</p>
</article>`;
}
function askView() {
  if (askQuestion && (!askAnswer || askAnswer.info_date !== selectedDate)) askAnswer = answerQuestion(askQuestion, bundle, {date: selectedDate, universe: uniContext()});
  const count = uni.state.index?.count;
  return `<p class="eyebrow">ASK THE LEDGER / RULES, NOT A MODEL</p><h2>Ask a question of your own. <span class="zh" lang="zh-Hans">问账本</span></h2><p class="muted">Ask in Chinese or English about ${count ? `any of ${count.toLocaleString('en-US')} US companies (SEC large accelerated filers) or the six deep-ledger companies` : 'AAPL, MSFT, NVDA, AMZN, GOOGL or META'}. Fixed rules read the saved SEC data in your browser and state every number with the filing line it came from. No language model, no API key, and nothing you type leaves this page. It gives no investment advice or forecasts, and says so when the data does not hold what you asked.</p>${uni.state.indexError ? `<p class="error">The company universe could not be loaded (${e(uni.state.indexError)}), so answers cover only the six deep-ledger companies.</p>` : ''}
  <form id="ask-form" class="ask-form" role="search" aria-labelledby="ask-label"><label id="ask-label" for="ask-input">Your question</label><div class="ask-row"><input id="ask-input" type="search" maxlength="${MAX_QUESTION}" autocomplete="off" enterkeyhint="search" value="${e(askQuestion)}" placeholder="NVDA 的利润有现金流支撑吗？" required><button class="primary" type="submit">Ask</button></div><p class="note">Answers use evidence filed by your information date, ${e(selectedDate)}. Change it above to ask about an earlier view.</p></form>
  ${chips(ASK_EXAMPLES, 'Example questions')}
  <p id="ask-live" class="sr-only" role="status" aria-live="polite"></p>
  <div id="ask-answer" class="ask-answer">${askAnswer ? answerMarkup(askAnswer) : ''}</div>
  <details class="ask-scope"><summary>What this box can and cannot answer</summary><p>For any universe company: one figure or ratio for a fiscal year (revenue, margins, R&amp;D, SG&amp;A, interest, tax, net income, diluted EPS, cash flows, capex, free cash flow, dividends, buybacks, cash, debt, equity, ROE and more, plus bank, insurance and REIT lines); trends over up to ten years; year-over-year changes; up to eight companies side by side; whether profit is backed by operating cash; a company's percentile among sector peers on cash conversion, the accrual ratio or FCF margin; which XBRL tag and filing a figure came from; data-quality notes; the latest 10-K link. For the six deep-ledger companies also: the fiscal year-to-date checkpoint and its profit-to-cash bridge, the AI triage percentile, rankings among the six and earlier information dates; and Treasury yields.</p><p>It does not answer: buy, sell or hold questions, price targets, forecasts or unfiled years, share prices and valuation, quarterly figures outside the six, segments, EBITDA or non-GAAP figures, or companies outside the universe (for example foreign companies that file 20-F). A figure that is not reported, or not meaningful for the company's template (gross margin for a bank), is said to be missing; it is never replaced by a different figure.</p><p>The question is read by fixed rules with a closed vocabulary, so unfamiliar wording gets “needs more detail” rather than a guess. <a href="https://github.com/leon1111-wgl/finscope/blob/main/docs/ASK.md">How it works and how it was tested ↗</a></p></details>`;
}
let askSequence = 0;
async function runAsk(text, {focusAnswer = false} = {}) {
  const question = String(text ?? '').trim().slice(0, MAX_QUESTION);
  const input = $('#ask-input');
  if (!question) { $('#status').textContent = 'Type a question first.'; input?.focus(); return; }
  if (!validScenarioDraft()) return;
  askQuestion = question;
  const sequence = ++askSequence;
  try {
    await uni.ensureIndex();
    const plan = planQuestion(question, bundle, {universe: uniContext()});
    if (plan.ciks.length || plan.screen) {
      $('#status').textContent = 'Loading the companies’ saved SEC data…';
      await uni.askContext(plan.ciks, plan.screen);
    }
    if (sequence !== askSequence) return;
    askAnswer = answerQuestion(question, bundle, {date: selectedDate, universe: uniContext()});
  } catch (error) {
    askAnswer = null;
    $('#status').textContent = `The question could not be answered: ${error.message}`;
    return;
  }
  if (input) input.value = question;
  const target = $('#ask-answer');
  if (!target) return;
  target.innerHTML = answerMarkup(askAnswer);
  bindAskChips(target);
  $('#ask-live').textContent = `${ASK_STATUS[askAnswer.status]}. ${askAnswer.summary}`;
  $('#status').textContent = '';
  if (focusAnswer) {
    // Keep the engine stamp clear of the sticky section tabs.
    $('#answer-q')?.focus({preventScroll: true});
    target.querySelector('.answer')?.scrollIntoView({block: 'start'});
  }
}
function notePendingQuestion() {
  const note = $('#pending-question');
  if (note) note.textContent = pendingQuestion === null ? '' : `Your question “${pendingQuestion}” is kept and will be answered once the evidence loads.`;
}
function bindAskChips(scope = document) {
  scope.querySelectorAll('[data-ask]').forEach(b => b.addEventListener('click', () => runAsk(b.dataset.ask, {focusAnswer: true})));
}

function review() {
  const r = row.ratios,
    ai = snapshot.ai.scores[company.ticker],
    train = snapshot.ai.training;
  const historyRows = snapshot.companies[company.ticker];
  return `<p class="eyebrow">02 / DEEP LEDGER · UNDERSTAND BEFORE YOU SCORE</p><h2>${e(company.ticker)}: is profit turning into cash?</h2><p class="muted">Start with the reported numbers. Then use the model to decide where a closer reading may help.</p>
  <div class="kpis">${kpi('Annual revenue',money(row.metrics.revenue?.value),`Period ended ${row.period_end}`)}${kpi('Net income',money(row.metrics.net_income?.value),'Profit after reported expenses')}${kpi('Operating cash flow',money(row.metrics.operating_cash_flow?.value),'Cash generated by operations')}${kpi('Current ratio',ratio(r.current_ratio),'Current assets ÷ current liabilities')}</div>
  ${panel('Has the picture changed since the annual report?',interimMarkup(selectInterim(bundle,company.ticker,selectedDate,row)))}
  <div class="grid">${panel('Profit and cash over time',`<p class="note">A company can book profit before collecting cash. Each column is a fiscal year’s operating cash; the mark across it is net income. Hatching shows profit above cash. The chart helps you notice the gap; the filing explains its cause.</p><div id="profit-chart" class="waterline"></div><details><summary>Read the exact annual values</summary>${table(['Fiscal period end','Revenue','Net income','Operating cash flow'],historyRows.map(r=>[r.period_end,money(r.metrics.revenue?.value),money(r.metrics.net_income?.value),money(r.metrics.operating_cash_flow?.value)]))}</details>`)}
  ${panel('AI triage: what looks unusual?',ai?`<p class="ink-tag ink-tag-ai">AI triage · an investigation cue, not a verified finding</p><p class="score">${ai.percentile}<small> / 100</small></p><p>Historical anomaly percentile</p><meter min="0" max="100" value="${ai.percentile}" aria-label="Historical anomaly percentile"></meter><p class="note">Higher means this financial profile is less typical of the training history. It does not mean the company is worse or more likely to default.</p><h4>Context for your review</h4><ul class="question-list">${ai.context_deviations.map(d=>`<li>${names[d.feature]}: <strong>${ratioFormat(d.feature,d.value)}</strong> · training median ${ratioFormat(d.feature,d.training_median)}</li>`).join('')}</ul><p class="note">These are descriptive deviations, not causal explanations or model feature attributions. ${ai.imputed_features.length?`Missing model inputs filled with training medians: ${ai.imputed_features.map(k=>names[k]).join(', ')}.`:'All six current model inputs are observed.'}</p><details><summary>Inspect the training boundary</summary><p>${train.samples} earlier company-years. Period ends from ${train.first_period_end} to ${train.last_period_end}, strictly before ${train.period_end_before}. Latest eligible training filing: ${train.latest_filed}. Six selected companies; fixed seed 42; 128 trees.</p></details>`:'<p>There is not enough eligible history for a model score. The reported facts and scenarios remain available.</p>','ai-triage')}</div>
  ${panel('Questions to take into the filing',`<ul class="question-list">${reviewQuestions(row).map(q=>`<li>${q}</li>`).join('')}</ul><div class="question"><strong>Keep the conclusion proportional to the evidence.</strong><p>A cash-flow gap is a starting point. It can reflect working-capital timing, non-cash charges or a changing business model. Verify the explanation before drawing a risk conclusion.</p></div>`)}
  ${panel('Trace every reported input',`<p class="note">Annual flow metrics match the same start and end dates. Balance-sheet facts match that annual period end. Missing tags stay unavailable. Values are USD billions. Read the matched filing directly, or open its filing index. The XBRL tag identifies the reported concept; document links do not jump to an exact fact location.</p>${factsTable(row.metrics)}<details><summary>How the ratios are calculated</summary>${table(['Ratio','Value','Formula'],[['Operating margin',pct(r.operating_margin),'Operating income / revenue'],['Operating cash margin',pct(r.cash_margin),'Operating cash flow / revenue'],['Current ratio',ratio(r.current_ratio),'Current assets / current liabilities'],['Liabilities / assets',pct(r.liabilities_assets),'Total liabilities / total assets'],['Accrual ratio',pct(r.accruals),'(Net income − operating cash flow) / average assets'],['Revenue growth',pct(r.revenue_growth),'Revenue / previous annual revenue − 1']])}<p>Denominators must be positive. Accruals need two adjacent annual asset balances. Low or high ratios require business context.</p></details>`)}
  <div class="actions"><button class="primary" data-go="compare">Next: compare companies →</button><button data-go="stress">Test a downside scenario</button></div>`;
}

// Evidence is the six-company deep ledger; when Financials shows another company, say which company this is.
function reviewOrNote() {
  const entry = uni.state.entry;
  const note = entry && entry.t[0] !== company.ticker ? `<p class="deep-note" role="note"><strong>Deep ledger · ${e(company.ticker)}.</strong> The year-to-date checkpoint, cash-flow bridge, AI triage, scenarios and brief are built for six companies (AAPL, MSFT, NVDA, AMZN, GOOGL, META). ${e(entry.n)}’s standardized financials are on <button type="button" class="link-button" data-go="company">Financials</button>.</p>` : '';
  return note + review();
}

function compare() {
  const comparison = buildComparison(bundle, selectedDate);
  const rows = comparison.companies.map(c => {
    const r = c.annual,
      a = c.anomaly;
    return [`<button class="table-button" data-company="${c.ticker}">${c.ticker} ↗</button>`, r.period_end, pct(r.ratios.operating_margin), pct(r.ratios.cash_margin), ratio(r.ratios.current_ratio), pct(r.ratios.liabilities_assets), a ? `${a.percentile} / 100` : 'Unavailable'];
  });
  return `<p class="eyebrow">THE SIX DEEP-LEDGER COMPANIES · ON YOUR INFORMATION DATE</p><h2>Similar questions. Different businesses.</h2><p class="muted">Compare six selected technology and platform businesses. Their fiscal calendars, business models and capital needs differ.</p><div class="actions"><button class="primary" id="export-comparison-csv">Download comparison (.csv)</button><button id="export-comparison-json">Download comparison evidence (.json)</button></div><p class="note">CSV keeps full numeric precision: margins are decimals (0.20 means 20%); cash-margin changes are percentage points. Empty numeric cells mean unavailable. Save the JSON alongside it for exact facts, filing links and model boundaries. These files contain reported profiles, without your corporate stress assumptions.</p>${panel('Financial profiles',table(['Company','Period ended','Operating margin','Cash margin','Current ratio','Liabilities / assets','Anomaly percentile'],rows)+`<p class="note">This is a comparison set, not a sector benchmark or a ranking of investment quality. Some companies have newer fiscal periods. A high anomaly score can reflect exceptional growth or structural differences.</p>`)}${panel('Newer interim coverage',`<p class="note">Choose a company to inspect matched YTD inputs. Fiscal periods differ, so these changes are context rather than a league table.</p>${table(['Company','Newer YTD period','Cash-margin change'],comparison.companies.map(c=>{const i=c.interim;const v=i.checkpoint;return [`<button class="table-button" data-company="${c.ticker}">${c.ticker} ↗</button>`,v?`${v.current.period_start} → ${v.current.period_end}`:i.status==='covered_by_annual'?'Covered by annual accounts':'Unavailable',Number.isFinite(v?.cash_margin_change_pp)?v.cash_margin_change_pp.toFixed(2)+' pp':'—'];}))}`)}${panel('How to use the comparison',`<div class="timeline"><div><strong>1. Start with the business</strong><p>A retailer, a chip designer and a software vendor have different inventory and working-capital needs.</p></div><div><strong>2. Compare the cash margin</strong><p>Ask how much operating cash is generated per dollar of revenue. Then inspect changes over time.</p></div><div><strong>3. Read the maturity note</strong><p>A current ratio gives a snapshot. Debt terms and cash generation determine when funds are needed.</p></div><div><strong>4. Follow the anomaly</strong><p>Use the score to prioritize reading. Confirm the reason in the filing and record uncertainty.</p></div></div>`)}<div class="actions"><button data-go="review">← Back to evidence</button><button class="primary" data-go="stress">Next: test assumptions →</button></div>`;
}
const input = (key, label, min, max, step, help) => `<label>${label}<input type="number" data-assumption="${key}" value="${assumptions[key]}" min="${min}" max="${max}" step="any" required><span class="field-help">${help}</span></label>`;

function stress() {
  const rates = bundle.rates.filter(r => r.date <= selectedDate),
    latest = rates.at(-1);
  return `<p class="eyebrow">06 / DEEP LEDGER · MAKE THE ASSUMPTIONS EXPLICIT</p><h2>What if the next year is weaker?</h2><p class="muted">Change one assumption at a time. Calculations run here in your browser. Inputs describe your scenario; they are not company guidance.</p>
  <div class="grid equal">${panel('Operating and funding scenario',`<p class="ink-tag ink-tag-pencil">Your assumptions · written in pencil, never mixed with reported facts</p><form id="scenario-form" class="fields">${input('revenuePercent','Revenue change (%)',-100,100,1,'Relative to the reported annual revenue.')}${input('marginPoints','Operating-margin change (percentage points)',-50,50,.5,'−2 moves a 20% margin to 18%.')}${input('refinanceBillions','Assumed refinancing exposure (USD billions)',0,1000,1,'Enter an exposure you want to test; not an extracted debt balance.')}${input('rateBps','Incremental financing rate (basis points)',-500,1000,25,'100 basis points = 1 percentage point.')}${input('collectionDays','Extra collection time (days)',0,180,1,'Approximate extra cash tied up in receivables.')}<div class="full actions"><button type="button" id="downside">Try a downside case</button><button type="button" id="reset-scenario">Reset to reported baseline</button></div></form>`)}${panel('Scenario result',`<div id="scenario-results" aria-live="polite"></div><details><summary>Read the formulas and assumptions</summary><div class="formula">R′ = R × (1 + revenue change / 100)<br>Operating income′ = R′ × (operating margin + margin change / 100)<br>Extra interest = assumed exposure × rate shock / 10,000<br>Profit proxy = operating income′ − extra interest<br>Extra cash tied up = R′ / 365 × extra collection days</div><p class="note">Exposure is converted from billions to USD. The profit proxy omits existing interest, taxes and other income. The cash proxy subtracts only delayed collections from reported cash. It is not a full cash-flow forecast or a solvency test. No interactions, financing actions or tax offsets are modeled.</p></details>`)}</div>
  ${panel('A rate shock needs context',latest?`<p>Official Treasury curve observed <strong>${latest.date}</strong>. Rates are percentages per year. This is the latest observation at or before your information date, separate from the annual filing snapshot.</p><div class="kpis">${kpi('3-month Treasury',Number.isFinite(latest['3m'])?latest['3m'].toFixed(2)+'%':'Unavailable','Short-term reference')}${kpi('2-year Treasury',Number.isFinite(latest['2y'])?latest['2y'].toFixed(2)+'%':'Unavailable','Rate expectations context')}${kpi('10-year Treasury',Number.isFinite(latest['10y'])?latest['10y'].toFixed(2)+'%':'Unavailable','Longer-term reference')}${kpi('10-year minus 2-year',Number.isFinite(latest['10y'])&&Number.isFinite(latest['2y'])?((latest['10y']-latest['2y'])*100).toFixed(0)+' bp':'Unavailable','Curve slope')}</div><p class="note">Treasury rates are reference yields, not company borrowing rates. Credit spreads, maturity and hedges matter. <a href="https://home.treasury.gov/treasury-daily-interest-rate-xml-feed" target="_blank" rel="noopener noreferrer">Official source ↗</a></p>`:'<p>No Treasury observation is available for this date.</p>')}
  ${panel('Optional: price a hypothetical bond',`<p class="note">An additional rate-sensitivity check. A fixed-rate bond pays semiannual coupons; this simplified model uses a flat yield, no accrued interest and no credit or option effects.</p><form id="bond-form" class="fields"><label>Coupon (% annually)<input name="couponPercent" type="number" min="0" max="30" step=".25" value="4" required></label><label>Maturity (years)<input name="years" type="number" min=".5" max="50" step=".5" value="10" required></label><label>Starting annual yield (%)<input name="yieldPercent" type="number" min="0" max="30" step=".01" value="${latest?.['10y']??4}" required><span class="field-help">Defaults to the selected 10-year Treasury observation when available.</span></label><label>Yield shock (basis points)<input name="shockBps" type="number" min="-500" max="1000" step="25" value="100" required></label></form><div id="bond-results" aria-live="polite"></div><div class="formula">Price = Σ coupon / (1 + yield / 2)ᵗ + face value / (1 + yield / 2)ᴺ<br>N = 2 × years; face value = $100; coupon per period = face × annual coupon rate / 2.</div><p class="note">This separate bond exercise is not included in the company brief. The exported brief contains the corporate scenario and observed Treasury context.</p>`)}
  <div class="actions"><button data-go="compare">← Back to comparison</button><button class="primary" data-go="brief">Next: export your brief →</button></div>`;
}

function currentBrief() {
  return buildBrief(bundle, snapshot, company, assumptions, selectedDate);
}

function brief() {
  const b = currentBrief();
  return `<div class="no-print"><p class="eyebrow">07 / DEEP LEDGER · A RESULT YOU CAN TAKE AWAY</p><h2>Your research brief, with an audit trail.</h2><p class="muted">Use this as an initial review memo, a classroom case or a handoff to another analyst. Add your own conclusion after reading the linked disclosures.</p><div class="actions"><button class="primary" id="export-md">Download brief (.md)</button><button id="export-json">Download evidence (.json)</button><button id="print-brief">Print / save PDF</button><button id="copy-link">Copy this research view</button></div></div>
  <article class="panel brief-paper"><p class="eyebrow">FINSCOPE RESEARCH BRIEF / LEON WANG</p><h2>${e(company.ticker)} · earnings quality and financial resilience</h2><dl><dt>Research question</dt><dd>Does reported profit have cash-flow support, and what changes under a weaker operating scenario?</dd><dt>Information date</dt><dd>${b.requested_date} · financial snapshot ${b.snapshot_date}</dd><dt>Annual period end</dt><dd>${b.annual_period}</dd><dt>Dataset version</dt><dd><code>${b.dataset_sha256}</code></dd><dt>Snapshot built</dt><dd>${e(bundle.generated_at)}</dd></dl><h3>1. What the accounts report</h3>${factsTable(b.facts)}<h4>Ratios and prior-year inputs</h4>${table(['Ratio','Value'],Object.entries(b.ratios).map(([k,v])=>[names[k]||k,ratioFormat(k,v)]))}${b.prior_annual_period?`<p class="note">Growth and average-assets denominators use prior period ${b.prior_annual_period.period_end}. Prior revenue: ${money(b.prior_annual_period.metrics.revenue?.value)}; prior assets: ${money(b.prior_annual_period.metrics.assets?.value)}. Their sourced facts and formulas are included in both downloads.</p>`:''}<h3>Newer interim checkpoint</h3>${interimMarkup(b.interim,false)}<h3>2. What deserves follow-up</h3><ul class="question-list">${b.follow_up.map(q=>`<li>${q}</li>`).join('')}</ul><p>${b.anomaly?`Anomaly percentile: <strong>${b.anomaly.percentile}/100</strong>, using ${b.training.samples} earlier company-years. This measures unusualness, not financial distress. Training period ends are strictly before ${b.training.period_end_before}. Latest training filing: ${b.training.latest_filed}.`:'No eligible anomaly score for this selection.'}</p><h3>3. What you assumed</h3>${table(['Assumption','Input'],[['Revenue change',assumptions.revenuePercent+'%'],['Margin change',assumptions.marginPoints+' percentage points'],['Refinancing exposure','$'+assumptions.refinanceBillions+'B (assumed)'],['Incremental financing rate',assumptions.rateBps+' basis points'],['Collection delay',assumptions.collectionDays+' days']])}<h3>4. What changes under those assumptions</h3>${scenarioMarkup(b.scenario,b.scenario_error)}<p class="note">Scenario operating income = reported revenue × (1 + revenue change) × (reported margin + margin-point change). Extra interest = assumed refinancing exposure × rate shock. Cash tied up = scenario revenue / 365 × extra collection days. The profit proxy excludes existing interest and taxes; the cash proxy excludes all other cash movements.</p><h3>5. What this review cannot establish</h3><ul class="question-list">${b.limitations.map(l=>`<li>${e(l)}</li>`).join('')}</ul><h3>6. Your next step</h3><p>Open the latest quarterly filing and annual management discussion. Check the cash-flow bridge and debt maturities. Write whether the evidence supports your initial claim, what remains uncertain, and what additional source would resolve it.</p><p class="note">The downloadable Markdown and JSON include annual and interim sourced facts, prior-period inputs, ratio formulas, model inputs, selected Treasury observation and source retrieval hashes.</p></article>`;
}

function method() {
  return `<p class="eyebrow">THE PRODUCT STORY / THE ENGINEERING</p><h2>From an interesting chart to a usable review.</h2><div class="grid equal">${panel('The missing step',`<p>The original FinScope lab made model timing and experiments inspectable. Its fictional scenario could teach a method, but it could not answer a real-company financial question or produce a ready-to-share company review.</p><p>The new workspace fills that gap: reported evidence, interpretation prompts, explicit scenarios and a portable memo belong to the same workflow.</p>`)}${panel('Who can use it today?',`<p><strong>Students:</strong> practice a source-backed financial review with real accounts.</p><p><strong>Independent researchers:</strong> pull ten years of standardized figures for a company of their own, compare it with up to seven others and screen its sector, every number one click from its filing.</p><p><strong>Junior analysts:</strong> prepare an initial evidence pack with a CSV that keeps the source of every cell, watch new filings, and stress assumptions for the six deep-ledger companies.</p><p class="note">The universe is US large accelerated filers with XBRL 10-Ks: annual figures only. It does not cover foreign filers on Form 20-F, smaller companies, quarterly figures outside the six, segments, real-time prices or forecasts.</p>`)}</div>${panel('The universe: how it is built and checked',`<p>Every week a GitHub Actions job reads SEC Submissions and CompanyFacts for every company that reports itself as a large accelerated filer and files 10-Ks with XBRL (${uni.state.index ? uni.state.index.count.toLocaleString('en-US') : 'about 1,900'} companies in the current build), at most 8 requests per second under a declared user agent. For each figure a documented chain of XBRL tags is read: the best tag any 10-K reports for a period wins, then the latest filing with that tag; a missing value stays missing; implausible totals are withheld; and every value keeps its tag, accession and filing link. Banks, insurers and REITs get their own templates. Fallback tags, compositions, restatements, conflicting values and fiscal-year changes are written into each company's data-quality notes.</p><p>Accuracy is measured, not assumed: a salted random sample of figures is compared with the SEC's Financial Statement Data Sets for the same filing, by a protocol committed before the first run. <a href="https://github.com/leon1111-wgl/finscope/blob/main/docs/UNIVERSE.md">How the universe is built ↗</a> · <a href="https://github.com/leon1111-wgl/finscope/blob/main/docs/validation/ACCURACY_PROTOCOL.md">Accuracy protocol ↗</a></p>`)}${panel('What we designed',`<div class="timeline"><div><strong>01 · Evidence</strong><p>Period-matched SEC facts. Filing-date filters. Visible missing values and source links.</p></div><div><strong>02 · AI triage</strong><p>Unsupervised Isolation Forest compares six ratios with earlier company-years.</p></div><div><strong>03 · Scenarios</strong><p>Browser calculations connect operating assumptions, financing costs and cash needs.</p></div><div><strong>04 · A deliverable</strong><p>Markdown, JSON and print capture facts, assumptions, formulas and source records.</p></div></div>`)}${panel('Why this is AI + finance',`<p>Financial reasoning defines six comparable ratios. An Isolation Forest uses random partitions to identify profiles that are easier to isolate from the training history. Training-only median imputation handles a limited number of missing features. The model scores current profiles against earlier fiscal periods.</p><p>A deterministic percentile places the anomaly score within the training score distribution. It is a descriptive in-sample reference, not an out-of-sample accuracy estimate. There are no labeled distress outcomes, so the project makes no fraud-detection, default-prediction or return claims.</p><p>Simple ratios remain visible beside the model. Descriptive deviations from training medians help a reader inspect the numbers; they do not claim to explain the forest’s decisions.</p><p><a href="https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html">scikit-learn implementation ↗</a> · <a href="https://github.com/leon1111-wgl/finscope/blob/main/docs/RESEARCH_MODEL.md">Model card and limitations ↗</a></p>`)}${panel('Time, revisions and changing markets',`<p>Historical choices use the nearest saved annual-filing snapshot at or before your date. Each fact must have been filed by that snapshot. Annual flows share a fiscal start and end; balance facts share the period end. A separate interim selection uses the information date to find newer fiscal YTD evidence. It compares matched YTD periods, keeps missing values visible and never feeds partial-year flows into the annual model. Later filings cannot enter an earlier snapshot. SEC submissions metadata matches source accessions to their primary filing documents. If no safe primary document is available, the filing index or original directory remains visible. These links identify documents, not verified paragraph anchors.</p><p>However, the current SEC API is not a historical raw-data archive. This is filing-day reconstruction, not proof of exact historical information availability. Fiscal calendars differ. The six surviving companies create selection bias. Accounting changes, business-model shifts and nonstationarity can all raise anomaly scores.</p><p>The scheduled build refreshes source data and validates it before deployment. Failed builds leave the last good site available. The banner reports real source dates and warns when the build is older than four days.</p><p><a href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces">Official SEC API ↗</a> · <a href="https://catalog.data.gov/dataset/interest-rate-statistics-daily-treasury-yield-curve-rates">Treasury data and CC0 license ↗</a></p>`)}${panel('Ask the ledger: rules, not a model',`<p>The Ask tab reads a typed question, in Chinese or English, with a closed vocabulary of figures, periods and topics, and finds any company in the universe by ticker, name or common Chinese name. The program then answers from the saved data: every number is a tagged SEC fact or a stated formula over such facts, shown with its filing line. It declines investment advice, forecasts and fraud verdicts, and says “not in this bundle” for share prices, other companies and figures it does not hold, rather than answering with a different number. Unfamiliar wording gets a request for more detail, not a guess.</p><p>On a second blind set of 212 SYNTHETIC questions about the universe, written by another model from a scope note before the rules were tuned, the first run (commit <code>9a2f1e3</code>) answered 171 of 211 correctly, 22 wrongly and abstained on 18; all 53 questions that must not be answered were declined. Wrong answers were then fixed as classes, so later reruns are not blind. These numbers measure how well the rules read questions; figure accuracy is checked separately against the SEC Financial Statement Data Sets for the same filing (798 of 798 verifiable sampled cells in the latest two years and 679 of 679 in older years match; three pre-registered criteria are still missed, listed in the changelog). <a href="https://github.com/leon1111-wgl/finscope/blob/main/docs/ASK.md">How it works and how it was tested ↗</a></p>`)}${panel('Original engineering, clear foundations',`<p>Leon Wang’s contribution is the integrated research workflow: fiscal-period matching, historical selection, evidence provenance, training-boundary checks, transparent stress math and a reproducible brief. It uses established open-source estimators and public official datasets. The contribution is the useful system and its validation, not a new financial theory or a renamed model.</p><div class="actions"><a class="button" href="https://github.com/leon1111-wgl/finscope/blob/main/docs/CASE_STUDY.md">Read the worked case ↗</a><a class="button" href="https://github.com/leon1111-wgl/finscope/blob/main/docs/PRODUCT.md">Product rationale ↗</a><a class="button" href="./lab.html">Open the synthetic forecasting lab ↗</a></div>`)}`;
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

function download(text, type, extension, comparison = false) {
  const blob = new Blob([text], {
    type
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `finscope-${comparison ? 'comparison' : company.ticker}-${selectedDate}.${extension}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('#status').textContent = comparison ? 'All-company comparison prepared for the selected information date. Save the CSV and evidence JSON together.' : 'Download prepared with this company, date and scenario.';
}

function revealCurrentStep() {
  const tabs = $('.steps'), current = tabs?.querySelector('[aria-current="page"]');
  if (!tabs?.clientWidth || !current || tabs.scrollWidth <= tabs.clientWidth) return;
  const left = current.offsetLeft - tabs.scrollLeft;
  // Leave room for the narrow-screen edge fade, without moving an already visible tab.
  if (left < 24 || left + current.offsetWidth > tabs.clientWidth - 28) {
    tabs.scrollLeft = Math.max(0, current.offsetLeft - 24);
  }
}

function render() {
  document.body.dataset.page = page;
  document.querySelectorAll('.steps [data-page]').forEach(b => {
    if (b.dataset.page === page) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  revealCurrentStep();
  renderedVersion = uni.state.version;
  // Re-rendering a view keeps the visitor's place: the focused control (by id, or by its data attribute) is focused again.
  const focused = document.activeElement && $('#content').contains(document.activeElement) ? document.activeElement : null;
  const focusKey = focused ? (focused.id ? `#${focused.id}` : ['data-sort', 'data-years', 'data-remove', 'data-open', 'data-unwatch'].map(a => focused.hasAttribute(a) ? `[${a}="${focused.getAttribute(a)}"]` : null).find(Boolean) || (focused.name ? `[name="${focused.name}"]` : null)) : null;
  $('#content').innerHTML = ({
    ask: askView,
    company: uni.views.company,
    review: reviewOrNote,
    compare: () => `${uni.views.compare()}<div class="six-profiles">${compare()}</div>`,
    screen: uni.views.screen,
    watch: uni.views.watch,
    stress,
    brief,
    method
  } [page] || review)();
  uni.bind($('#content'), page);
  if (focusKey) { try { $('#content').querySelector(focusKey)?.focus({preventScroll: true}); } catch { /* the control is gone */ } }
  if (['company', 'compare', 'screen', 'watch', 'ask'].includes(page)) uni.prepare(page).then(changed => { if (changed && renderedVersion !== uni.state.version && ready && !pendingRestore) render(); });
  $('#ask-form')?.addEventListener('submit', ev => { ev.preventDefault(); runAsk($('#ask-input').value); });
  bindAskChips($('#content'));
  if (pendingQuestion !== null && page === 'ask') { const q = pendingQuestion; pendingQuestion = null; runAsk(q, {focusAnswer: true}); }
  $('#export-cash-svg')?.addEventListener('click', () => {
    const selected = selectInterim(bundle, company.ticker, selectedDate, row);
    if (selected.checkpoint) download(cashBridgeSVG(selected.checkpoint.current, company.ticker), 'image/svg+xml', 'svg');
  });
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
  $('#export-comparison-csv')?.addEventListener('click', () => download(comparisonCSV(buildComparison(bundle, selectedDate)), 'text/csv;charset=utf-8', 'csv', true));
  $('#export-comparison-json')?.addEventListener('click', () => download(JSON.stringify(buildComparison(bundle, selectedDate), null, 2), 'application/json', 'json', true));
  $('#export-md')?.addEventListener('click', () => download(briefMarkdown(currentBrief()), 'text/markdown;charset=utf-8', 'md'));
  $('#export-json')?.addEventListener('click', () => download(JSON.stringify(currentBrief(), null, 2), 'application/json', 'json'));
  $('#print-brief')?.addEventListener('click', () => window.print());
  $('#copy-link')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      $('#status').textContent = 'Link copied with company, date, scenario, data and calculation versions. A version change will require a new choice.';
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
  if (target.dataset.width && target.dataset.width === String(target.clientWidth || 640)) return;
  const rows = snapshot.companies[company.ticker];
  renderWaterline(target, rows, {ticker: company.ticker, selected: traceYear ?? rows.length - 1, id: 'evidence-wl', onSelect: i => { traceYear = i; }});
}

function enterConsole({view, ticker} = {}) {
  if (!ready) { pendingEntry = {view, ticker}; notePendingQuestion(); return; }
  if (pendingRestore) return;
  if (ticker && ticker !== company.ticker && bundle.companies.some(c => c.ticker === ticker)) {
    if (!validScenarioDraft()) return;
    if (view) page = view;
    $('#company').value = ticker;
    useSelection();
  } else if (view && view !== page) show(view);
  if (pendingQuestion !== null && page === 'ask' && $('#ask-form')) { const q = pendingQuestion; pendingQuestion = null; runAsk(q, {focusAnswer: true}); }
  updateURL();
}
async function init() {
  if (loadingEvidence || ready) return;
  const retrying = Boolean($('#retry-evidence'));
  loadingEvidence = true;
  lockResearch(true);
  $('#content').setAttribute('aria-busy', 'true');
  $('#content').innerHTML = '<p class="empty">Loading the evidence snapshot. Large downloads may take a moment.</p>';
  $('#freshness').textContent = 'Loading official financial evidence…';
  $('#freshness').classList.remove('stale');
  $('#status').textContent = 'Loading evidence…';
  $('#status').classList.remove('sr-only');
  if (retrying) { $('#status').tabIndex = -1; $('#status').focus(); }
  try {
    const universeReady = uni.ensureIndex();
    bundle = await loadResearchEvidence();
    await universeReady;
    $('#company').innerHTML = bundle.companies.map(c => `<option value="${c.ticker}">${c.ticker} · ${e(c.name)}</option>`).join('');
    const dateInput = $('#as-of');
    dateInput.min = bundle.snapshots[0].as_of;
    dateInput.max = bundle.as_of;
    setResearchSelection('MSFT', bundle.as_of);
    renderIntro(document, bundle);
    const age = Math.floor((Date.now() - Date.parse(bundle.generated_at)) / 86400000),
      lastRate = bundle.rates.at(-1).date;
    const uIndex = uni.state.index;
    $('#freshness').innerHTML = `<strong>Official-source snapshot</strong> · Deep ledger built ${e(bundle.generated_at.slice(0,10))} UTC · Treasury observations through ${lastRate} · ${uIndex ? `Universe: ${uIndex.count.toLocaleString('en-US')} companies, built ${e(uIndex.built)}, filings through ${e(uIndex.data_as_of)}` : 'Company universe unavailable'}${age>4?` · Refresh overdue: build is ${age} days old.`:''}`;
    if (age > 4) $('#freshness').classList.add('stale');
    $('#company').disabled = false;
    dateInput.disabled = false;
    $('#latest').disabled = false;
    if (!controlsBound) {
      $('#selection').addEventListener('submit', ev => ev.preventDefault());
      $('#company').addEventListener('change', useSelection);
      dateInput.addEventListener('change', useSelection);
      $('#latest').addEventListener('click', () => {
        dateInput.value = bundle.as_of;
        useSelection();
      });
      document.querySelectorAll('.steps [data-page]').forEach(b => b.addEventListener('click', () => {
        show(b.dataset.page);
        // With the tabs stuck to the top, start the new section at its first line, not mid-page.
        const sheet = $('.sheet-body'), top = sheet ? sheet.getBoundingClientRect().top + window.scrollY - $('.steps').offsetHeight : 0;
        if (window.scrollY > top + 1) window.scrollTo(0, top);
      }));
      $('#brief-file').addEventListener('change', openSavedBrief);
      window.addEventListener('resize', revealCurrentStep);
      controlsBound = true;
    }
    ready = true;
    lockResearch(false);
    $('#status').textContent = '';
    const startCo = (params.get('co') && uni.entryByTicker(params.get('co'))) || uni.entryByTicker(params.get('company') || company.ticker);
    if (startCo) uni.pick(startCo, {deep: false});
    let saved, linkError;
    // A company link (?co=KO, optionally with a universe view) needs no saved-version check: it carries no deep-ledger inputs.
    const universeLink = params.has('co') && [...params.keys()].every(k => ['co', 'view'].includes(k)) && ['company', 'compare', 'screen', 'watch', 'ask', null].includes(params.get('view'));
    if (universeLink) { page = params.get('view') || 'company'; render(); }
    else try { saved = selectionFromURL(params, bundle); } catch (error) { linkError = error.message; }
    if (universeLink) { /* rendered above */ }
    else if (linkError) previewSavedSelection(null, linkError, 'link');
    else if (saved && saved.versionStatus !== 'match') previewSavedSelection(saved, null, 'link');
    else if (saved) {
      applySavedSelection(saved);
      $('#restore-message').textContent = 'Saved link restored with a matching data and calculation versions. Results are recomputed from this site’s evidence.';
    } else {
      render();
      if (pendingEntry) { const entry = pendingEntry; pendingEntry = null; enterConsole(entry); }
    }
    new ResizeObserver(drawTrend).observe($('#content'));
    document.dispatchEvent(new window.Event('finscope-research-ready'));
    if (retrying && !pendingRestore) {
      const title = $('#content h2');
      title.tabIndex = -1;
      title.focus();
    }
  } catch (error) {
    ready = false;
    bundle = null;
    pendingRestore = null;
    lockResearch(true);
    $('#restore-preview').hidden = true;
    $('#scope').textContent = '';
    $('#restore-message').textContent = '';
    // Announced through the status region; shown once, inside the error panel.
    $('#status').textContent = error.message;
    $('#status').classList.add('sr-only');
    $('#content').innerHTML = `<div class="error"><h3>The evidence snapshot could not be loaded</h3><p>Your link has been kept. Retry to load the published evidence before reviewing the company, date and assumptions. No financial results are available yet.</p><p id="pending-question"></p><p class="error-detail">Details: ${e(error.message)}</p><div class="actions"><button type="button" id="retry-evidence">Retry loading evidence</button><a href="https://github.com/leon1111-wgl/finscope">Read the project guide ↗</a></div></div>`;
    $('#retry-evidence').addEventListener('click', init);
    notePendingQuestion();
    $('#freshness').textContent = 'Evidence snapshot unavailable.';
    introUnavailable(document);
  } finally {
    loadingEvidence = false;
    $('#content').setAttribute('aria-busy', 'false');
  }
}
shell = initShell(document, {onEnter: enterConsole});
$('#intro-ask')?.addEventListener('submit', ev => {
  ev.preventDefault();
  const question = $('#intro-ask-input').value.trim();
  if (!question) return;
  pendingQuestion = question.slice(0, MAX_QUESTION);
  shell.enter({view: 'ask', focus: 'answer-q'});
});
initThemeToggle(document, $('#theme-toggle'));
initOfficialUpdates(document,{research:()=>ready?bundle:null});
init();
