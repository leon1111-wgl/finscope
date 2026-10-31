// Intro page and the switch into the research console. Both live on one page so saved
// reopen links (…/?company=…#workspace) keep working and the evidence loads once.
import {renderWaterline} from './waterline.js?v=20261101-ledger';
import {escapeHTML as e} from './workbench.js';

// Keep in sync with the inline head script in index.html, which picks the mode before first paint.
export const RESEARCH_KEYS = ['company', 'date', 'view', 'dataset', 'calculation', 'revenuePercent', 'marginPoints', 'refinanceBillions', 'rateBps', 'collectionDays'];
const INTRO_TICKER = 'NVDA';

export function wantsConsole(loc) {
  const params = new URLSearchParams(loc.search);
  return RESEARCH_KEYS.some(k => params.has(k)) || loc.hash === '#workspace';
}

export function initShell(doc, {onEnter} = {}) {
  const win = doc.defaultView, root = doc.documentElement;
  const set = mode => { root.dataset.mode = mode; };
  set(wantsConsole(win.location) ? 'console' : 'intro');
  const enter = ({view, ticker, focus = 'console-title'} = {}) => {
    if (root.dataset.mode !== 'console') {
      win.history.pushState(null, '', `${win.location.pathname}${win.location.search}#workspace`);
      set('console');
      win.scrollTo?.(0, 0);
    }
    onEnter?.({view, ticker});
    const target = doc.getElementById(focus);
    if (target) {
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus();
    }
  };
  const leave = () => {
    if (root.dataset.mode === 'intro') return;
    win.history.pushState(null, '', win.location.pathname);
    set('intro');
    win.scrollTo?.(0, 0);
    doc.getElementById('intro-title')?.focus();
  };
  doc.addEventListener('click', event => {
    const home = event.target.closest?.('[data-home]');
    if (home && !event.metaKey && !event.ctrlKey && !event.shiftKey) { event.preventDefault(); leave(); return; }
    const trigger = event.target.closest?.('[data-enter]');
    if (!trigger) return;
    event.preventDefault();
    const href = trigger.getAttribute('href');
    enter({view: trigger.dataset.enterView, ticker: trigger.dataset.enterTicker, focus: href?.startsWith('#') ? href.slice(1) : 'console-title'});
  });
  const sync = () => set(wantsConsole(win.location) ? 'console' : 'intro');
  win.addEventListener('popstate', sync);
  win.addEventListener('hashchange', sync);
  return {mode: () => root.dataset.mode, enter};
}

export function renderIntro(doc, bundle) {
  const snapshot = bundle.snapshots.at(-1);
  const tickers = doc.getElementById('intro-tickers'), chart = doc.getElementById('intro-waterline');
  const open = doc.getElementById('intro-open-company'), fresh = doc.getElementById('intro-freshness');
  if (!tickers || !chart) return;
  let ticker = snapshot.companies[INTRO_TICKER] ? INTRO_TICKER : bundle.companies[0].ticker;
  let selected = null;
  const draw = () => {
    const rows = snapshot.companies[ticker] || [];
    renderWaterline(chart, rows, {ticker, selected: selected ?? rows.length - 1, height: 300, id: 'intro-wl', onSelect: i => { selected = i; }});
    for (const b of tickers.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.ticker === ticker));
    if (open) {
      open.dataset.enterTicker = ticker;
      open.textContent = `Review ${ticker}'s evidence in the ledger →`;
    }
  };
  tickers.innerHTML = bundle.companies.map(c => `<button type="button" data-ticker="${e(c.ticker)}" aria-pressed="false" title="${e(c.name)}">${e(c.ticker)}</button>`).join('');
  tickers.onclick = event => {
    const b = event.target.closest?.('button[data-ticker]');
    if (!b || b.dataset.ticker === ticker) return;
    ticker = b.dataset.ticker;
    selected = null;
    draw();
  };
  if (fresh) fresh.textContent = `Snapshot built ${bundle.generated_at.slice(0, 10)} UTC from official SEC filings · Treasury yields through ${bundle.rates.at(-1)?.date ?? 'unavailable'} · no account, install or API key`;
  draw();
  if (typeof globalThis.ResizeObserver === 'function') {
    new globalThis.ResizeObserver(() => {
      if (chart.isConnected && chart.clientWidth && String(chart.clientWidth) !== chart.dataset.width) draw();
    }).observe(chart);
  }
}

export function introUnavailable(doc) {
  const chart = doc.getElementById('intro-waterline');
  if (chart) chart.innerHTML = '<p class="wl-loading">The evidence snapshot could not be loaded here. Open the ledger to retry; no figures are shown until it loads.</p>';
}
