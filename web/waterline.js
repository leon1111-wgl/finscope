// The water line: each fiscal year is a column of operating cash ("the water"), with reported
// net income marked across it. Where profit sits above the cash, the gap is hatched.
// Display only: values are the sourced annual facts already in the bundle; nothing is re-scored.
import {evidenceLink} from './evidence-links.js';
import {escapeHTML as e} from './workbench.js';

const money = v => Number.isFinite(v) ? `${v < 0 ? '−' : ''}$${(Math.abs(v) / 1e9).toFixed(2)}B` : 'Unavailable';
const short = (v, digits = Math.abs(v) >= 10 ? 0 : Math.abs(v) >= 1 ? 1 : 2) => v === 0 ? '$0' : `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(digits)}B`;
const value = (row, key) => row?.metrics?.[key]?.value;

export function waterlineYears(rows) {
  return rows.map(r => {
    const ni = value(r, 'net_income'), ocf = value(r, 'operating_cash_flow');
    return {period_end: r.period_end, ni, ocf, above: Number.isFinite(ni) && Number.isFinite(ocf) && ni > ocf};
  });
}

// A 1 / 2 / 2.5 / 5 step, with just enough decimals for its tick labels to stay distinct.
function niceStep(span) {
  const raw = span / 4, exponent = Math.floor(Math.log10(raw)), unit = raw / 10 ** exponent;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  const p = nice === 10 ? exponent + 1 : exponent;
  return {step: nice * 10 ** exponent, digits: Math.max(0, -p + (nice === 2.5 ? 1 : 0))};
}

export function waterlineSVG(rows, {width = 640, height = 280, selected = rows.length - 1, id = 'wl', ticker = ''} = {}) {
  const years = waterlineYears(rows);
  const vals = years.flatMap(y => [y.ni, y.ocf]).filter(Number.isFinite).map(v => v / 1e9);
  if (!vals.length) return '<p class="note">No matched annual history.</p>';
  const W = Math.max(280, Math.round(width)), H = height, m = {l: 54, r: 14, t: 26, b: 38};
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi === lo) hi = lo + 1;
  const {step, digits} = niceStep(hi - lo);
  hi = Math.ceil(hi * 1.08 / step) * step;
  lo = Math.floor(lo / step) * step;
  const col = (W - m.l - m.r) / years.length;
  const y = v => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);
  const flagged = years.filter(y => y.above).length;
  const label = `${e(ticker)} net income and operating cash flow by fiscal year, USD billions. ${flagged ? `Net income exceeded operating cash flow in ${flagged} of ${years.length} years (hatched).` : 'Operating cash flow covered net income in every year shown.'} Exact values and filing links follow.`;
  let svg = `<svg class="wl-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}"><title>Profit against operating cash</title>`;
  svg += `<defs><pattern id="${id}-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><rect class="wl-hatch-bg" width="7" height="7"/><line class="wl-hatch-line" x1="0" y1="0" x2="0" y2="7"/></pattern></defs>`;
  for (let k = 0, v = lo; v <= hi + step / 2; v = lo + ++k * step) {
    const at = y(v), zero = Math.abs(v) < step / 1e6;
    svg += `<line class="${zero ? 'wl-zero' : 'wl-rule'}" x1="${m.l}" x2="${W - m.r}" y1="${at}" y2="${at}"/><text class="wl-axis" x="${m.l - 8}" y="${at + 4}" text-anchor="end">${short(zero ? 0 : v, digits)}</text>`;
  }
  years.forEach((yr, i) => {
    const x0 = m.l + i * col, inner = col * .7, xs = x0 + (col - inner) / 2, mid = x0 + col / 2;
    const on = i === selected;
    svg += `<g class="wl-col${on ? ' is-selected' : ''}" data-wl-year="${i}"><title>${e(yr.period_end)}: net income ${money(yr.ni)}; operating cash flow ${money(yr.ocf)}</title>`;
    if (on) svg += `<rect class="wl-band" x="${x0 + 2}" y="${m.t - 18}" width="${col - 4}" height="${H - m.b - m.t + 18}" rx="3"/>`;
    else svg += `<rect class="wl-hit" x="${x0}" y="${m.t}" width="${col}" height="${H - m.t - m.b}"/>`;
    if (Number.isFinite(yr.ocf)) {
      const top = y(Math.max(0, yr.ocf / 1e9)), bottom = y(Math.min(0, yr.ocf / 1e9));
      svg += `<rect class="wl-water" x="${xs}" y="${top}" width="${inner}" height="${Math.max(1, bottom - top)}"/><line class="wl-waterline" x1="${xs}" x2="${xs + inner}" y1="${y(yr.ocf / 1e9)}" y2="${y(yr.ocf / 1e9)}"/>`;
    }
    if (yr.above) svg += `<rect class="wl-gap" fill="url(#${id}-hatch)" x="${xs}" y="${y(yr.ni / 1e9)}" width="${inner}" height="${Math.max(1, y(yr.ocf / 1e9) - y(yr.ni / 1e9))}"/>`;
    if (Number.isFinite(yr.ni)) {
      const at = y(yr.ni / 1e9);
      svg += `<line class="wl-profit" x1="${xs - 3}" x2="${xs + inner + 3}" y1="${at}" y2="${at}"/><circle class="wl-dot" cx="${mid}" cy="${at}" r="${on ? 4.5 : 3.5}"/>`;
      if (on) svg += `<text class="wl-value" x="${mid}" y="${Math.max(12, Math.min(at, Number.isFinite(yr.ocf) ? y(yr.ocf / 1e9) : at) - 9)}" text-anchor="middle">${short(yr.ni / 1e9)}</text>`;
    }
    svg += `<text class="wl-year-label" x="${mid}" y="${H - m.b + 20}" text-anchor="middle">${e(String(yr.period_end).slice(0, 4))}</text>`;
    if (on) svg += `<path class="wl-pointer" d="M${mid - 6} ${H - 4} L${mid + 6} ${H - 4} L${mid} ${H - 11} Z"/>`;
    svg += '</g>';
  });
  return svg + '</svg>';
}

export function traceMarkup(row, ticker = '') {
  if (!row) return '';
  const ni = row.metrics?.net_income, ocf = row.metrics?.operating_cash_flow;
  const gap = Number.isFinite(ni?.value) && Number.isFinite(ocf?.value) ? ocf.value - ni.value : null;
  const line = (name, f) => `<div class="wl-line"><span class="wl-line-name">${name}</span><strong class="wl-fig">${money(f?.value)}</strong><span class="wl-line-source">${f ? `${evidenceLink(f)}<span class="wl-filed">${e(f.form || 'Filing')} · filed ${e(f.filed || '—')}</span>` : 'No matching standard USD fact'}</span></div>`;
  return `<p class="wl-trace-head">The filing lines behind ${e(ticker)} · fiscal year ended ${e(row.period_end)}</p><div class="wl-lines">${line('Net income', ni)}${line('Operating cash flow', ocf)}${gap === null ? '' : `<div class="wl-line wl-total${gap < 0 ? ' is-flag' : ''}"><span class="wl-line-name">Cash minus profit</span><strong class="wl-fig">${gap < 0 ? '−' : '+'}${money(Math.abs(gap))}</strong><span class="wl-line-source">${gap < 0 ? 'Net income ran ahead of operating cash flow. That is a reason to read the cash-flow statement, not a verdict.' : 'Operating cash flow covered net income this year.'}</span></div>`}</div>`;
}

// Year buttons and the trace live region persist across selections, so focus stays on the
// pressed year and screen readers announce the new filing lines.
export function renderWaterline(target, rows, {ticker = '', selected = rows.length - 1, height = 280, id = 'wl', onSelect} = {}) {
  if (!target) return;
  const years = waterlineYears(rows);
  let index = Math.max(0, Math.min(rows.length - 1, selected));
  const width = target.clientWidth || 640;
  target.innerHTML = `<div class="wl-chart">${waterlineSVG(rows, {width, height, selected: index, id, ticker})}</div>
    <div class="wl-legend" aria-hidden="true"><span><i class="wl-key wl-key-water"></i>Operating cash flow (the water line)</span><span><i class="wl-key wl-key-profit"></i>Net income</span><span><i class="wl-key wl-key-gap"></i>Profit above cash</span></div>
    <div class="wl-years" role="group" aria-label="Trace a fiscal year to its filing">${years.map((yr, i) => `<button type="button" class="wl-year" data-wl-year="${i}" aria-pressed="${i === index}">${e(String(yr.period_end).slice(0, 4))}${yr.above ? '<span class="wl-flag" aria-hidden="true"></span><span class="sr-only"> (profit above cash)</span>' : ''}</button>`).join('')}</div>
    <div class="wl-trace" aria-live="polite">${traceMarkup(rows[index], ticker)}</div>`;
  target.dataset.width = String(width);
  const chart = target.querySelector('.wl-chart'), trace = target.querySelector('.wl-trace');
  target.onclick = event => {
    const hit = event.target.closest?.('[data-wl-year]');
    if (!hit) return;
    index = Number(hit.dataset.wlYear);
    chart.innerHTML = waterlineSVG(rows, {width, height, selected: index, id, ticker});
    for (const b of target.querySelectorAll('button[data-wl-year]')) b.setAttribute('aria-pressed', String(Number(b.dataset.wlYear) === index));
    trace.innerHTML = traceMarkup(rows[index], ticker);
    if (hit.tagName === 'BUTTON') hit.focus();
    onSelect?.(index);
  };
}
