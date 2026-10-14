import {
  escapeHTML as e,
  safeURL
} from './workbench.js';

const valid = p => p?.cash_bridge?.status === 'available';
const num = v => Number.isFinite(v) ? v.toLocaleString('en-US', {
  maximumFractionDigits: 2
}) : 'Unavailable';
const money = v => Number.isFinite(v) ? `${v < 0 ? '−' : ''}$${(Math.abs(v) / 1e9).toFixed(2)}B` : 'Unavailable';
const short = {
  depreciation: 'D&A',
  share_based_compensation: 'Stock pay',
  receivables: 'Receivables',
  inventory: 'Inventory',
  payables: 'Payables'
};

export function bridgeSteps(period) {
  if (!valid(period)) return [];
  const b = period.cash_bridge,
    steps = [{
      label: 'Net income',
      value: b.net_income,
      from: 0,
      to: b.net_income,
      total: true
    }];
  let running = b.net_income;
  for (const c of b.components.filter(c => Number.isFinite(c.effect))) {
    steps.push({
      label: short[c.key] || c.label,
      fullLabel: c.label,
      value: c.effect,
      from: running,
      to: running + c.effect
    });
    running += c.effect;
  }
  steps.push({
    label: 'Other',
    fullLabel: 'Other and unmapped adjustments',
    value: b.residual,
    from: running,
    to: b.operating_cash_flow,
    residual: true
  });
  steps.push({
    label: 'Cash flow',
    value: b.operating_cash_flow,
    from: 0,
    to: b.operating_cash_flow,
    total: true
  });
  return steps;
}

export function bridgeRows(current, prior) {
  if (!valid(current)) return [];
  const b = current.cash_bridge,
    old = valid(prior) ? prior.cash_bridge : null;
  const rows = [{
    label: 'Net income',
    current: b.net_income,
    prior: old?.net_income ?? null
  }];
  for (const c of b.components) rows.push({
    label: c.label,
    current: c.effect,
    prior: old?.components.find(x => x.key === c.key)?.effect ?? null
  });
  rows.push({
    label: 'Other and unmapped adjustments',
    current: b.residual,
    prior: old?.residual ?? null
  });
  rows.push({
    label: 'Operating cash flow',
    current: b.operating_cash_flow,
    prior: old?.operating_cash_flow ?? null
  });
  return rows.map(r => ({
    ...r,
    change: Number.isFinite(r.current) && Number.isFinite(r.prior) ? r.current - r.prior : null
  }));
}

function bridgeQuestion(period) {
  const b = period.cash_bridge;
  const drains = b.components.filter(c => c.sign && ['receivables', 'inventory', 'payables'].includes(c.key) && c.effect < 0).sort((a, b) => a.effect - b.effect);
  if (!drains.length) return 'No negative cash effect appears among the mapped working-capital lines. Read the remaining operating adjustments before concluding that cash conversion is strong.';
  const c = drains[0];
  const prompt = {
    receivables: 'Compare credit sales, collection timing and the receivables note.',
    inventory: 'Compare inventory build-up with demand, production plans and inventory provisions.',
    payables: 'Check supplier-payment timing and whether prior payment terms changed.'
  } [c.key];
  return `${c.label} is the largest cash use among the mapped working-capital lines (${money(c.effect)}). ${prompt} This identifies a reported adjustment, not its business cause.`;
}

export function cashBridgeSVG(period, ticker = '') {
  const steps = bridgeSteps(period);
  if (!steps.length) return '';
  const width = 920,
    height = 400,
    left = 70,
    right = 24,
    top = 95,
    bottom = 112;
  const vals = steps.flatMap(s => [s.from, s.to]);
  const low = Math.min(0, ...vals),
    high = Math.max(0, ...vals),
    span = Math.max(high - low, 1);
  const lo = low - span * .12,
    hi = high + span * .12;
  const y = v => top + (hi - v) / (hi - lo) * (height - top - bottom),
    dx = (width - left - right) / steps.length;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" class="cash-waterfall" viewBox="0 0 ${width} ${height}" role="img" aria-label="Net income to operating cash flow, with selected disclosed adjustments and a calculated remainder"><title>${e(ticker)} · net income to operating cash flow</title><rect width="920" height="400" fill="#142230"/><g font-family="Arial, sans-serif" fill="#e8f0f7"><text x="24" y="31" font-size="20" font-weight="bold">${e(ticker)} · From profit to operating cash</text><text x="24" y="57" font-size="15">Fiscal YTD ${e(period.period_start)} to ${e(period.period_end)} · USD billions</text>`;
  for (let i = 0; i <= 3; i++) {
    const v = low + (high - low) * i / 3;
    svg += `<line x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}" stroke="#35495b"/><text x="${left-10}" y="${y(v)+5}" font-size="14" text-anchor="end">${(v/1e9).toFixed(1)}</text>`;
  }
  steps.forEach((s, i) => {
    const x = left + dx * i + 10,
      barWidth = dx - 20;
    const fill = s.total ? '#8bbcff' : s.residual ? '#a5b5c6' : s.value >= 0 ? '#6bdfc1' : '#f2ad79';
    svg += `<g><title>${e(s.fullLabel || s.label)}: ${money(s.value)}</title><rect x="${x}" y="${Math.min(y(s.from),y(s.to))}" width="${barWidth}" height="${Math.max(2,Math.abs(y(s.from)-y(s.to)))}" fill="${fill}" rx="3"/><text x="${x+barWidth/2}" y="${Math.min(y(s.from),y(s.to))-9}" font-size="14" text-anchor="middle">${s.value > 0 && !s.total ? '+' : ''}${(s.value/1e9).toFixed(2)}</text><text x="${x+barWidth/2}" y="${height-bottom+25}" font-size="14" text-anchor="middle">${e(s.label)}</text></g>`;
    if (i < steps.length - 2) svg += `<line x1="${x+barWidth}" x2="${x+dx}" y1="${y(s.to)}" y2="${y(s.to)}" stroke="#b3c3d4" stroke-dasharray="3 4"/>`;
  });
  return svg + `<text x="24" y="349" font-size="14">Blue: reported totals · Teal/orange: signed adjustments · Gray: calculated remainder</text><text x="24" y="373" font-size="13">Partial mapping. Missing lines stay in the remainder. Non-cash add-backs are not cash receipts.</text><text x="24" y="393" font-size="12">FinScope · Leon Wang · SEC filing ${e(period.cash_bridge.accession || '')}</text></g></svg>`;
}

const link = f => safeURL(f?.url) ? `<a href="${e(safeURL(f.url))}" target="_blank" rel="noopener noreferrer">${e(f.tag)} · ${f.filed} ↗</a>` : 'No matching source';
export function bridgeMarkup(current, prior, ticker = '', compact = false) {
  if (!valid(current)) return `<p class="note">Cash-flow reconciliation unavailable: ${e(current?.cash_bridge?.reason || 'No matched source facts.')}</p>`;
  const b = current.cash_bridge,
    rows = bridgeRows(current, prior);
  const table = `<div class="table-wrap" tabindex="0" role="region" aria-label="Cash-flow adjustments in USD billions"><table><thead><tr><th>Signed contribution</th><th>Current YTD</th><th>Prior YTD</th><th>Change</th></tr></thead><tbody>${rows.map(r=>`<tr><th scope="row">${e(r.label)}</th><td>${money(r.current)}</td><td>${money(r.prior)}</td><td>${money(r.change)}</td></tr>`).join('')}</tbody></table></div>`;
  const sources = [current, prior].filter(valid).map(p => `<h5>${e(p.period_start)} → ${e(p.period_end)}</h5><ul class="question-list">${p.cash_bridge.components.map(c=>`<li><strong>${e(c.label)}:</strong> ${c.fact ? `raw ${money(c.fact.value)} × ${c.sign} = ${money(c.effect)}. ${link(c.fact)}` : 'Unavailable; no matching standard fact in the same filing.'}<br>${e(c.explanation)}</li>`).join('')}</ul>`).join('');
  return `<section class="cash-bridge"><h4>What connects profit to operating cash?</h4><p>Start with net income. Add the selected non-cash and working-capital adjustments. Keep the remaining difference visible.</p>${compact ? '' : `<div class="bridge-scroll" tabindex="0" role="region" aria-label="Cash-flow waterfall; scroll horizontally on a small screen">${cashBridgeSVG(current,ticker)}</div><p class="note">On a small screen, swipe the chart horizontally. The table below contains every value.</p><button id="export-cash-svg" type="button">Download this chart (.svg)</button>`}<p class="note">Current: ${e(current.period_start)} → ${e(current.period_end)}. Prior: ${prior ? `${e(prior.period_start)} → ${e(prior.period_end)}` : 'Unavailable'}.</p>${table}<div class="question"><strong>Follow the cash, then verify the cause</strong><p>${e(bridgeQuestion(current))}</p></div><p class="note">${b.components.length-b.missing_components.length} of ${b.components.length} selected adjustment groups are mapped. This is a count, not a percentage of cash flow explained. Unavailable means missing, not zero. “Other and unmapped adjustments” = operating cash flow − net income − selected signed adjustments. It can include taxes, gains, other operating balances and mapping gaps. A changing remainder can also reflect changing coverage.</p><details><summary>Check sources, signs and missing items</summary>${sources}<p>Asset increases use sign −1. Payable increases use sign +1. Non-cash expense add-backs use sign +1. Negative reported changes reverse the effect. All matched facts share the cash-flow endpoint's filing and fiscal dates.</p><a href="https://www.sec.gov/about/reports-publications/investorpubsbegfinstmtguide">SEC guide to reading a cash-flow statement ↗</a></details></section>`;
}

export function bridgeMarkdown(current, prior) {
  if (!valid(current)) return `\n\n### Cash-flow reconciliation\n\nUnavailable: ${current?.cash_bridge?.reason || 'No matched source facts.'}\n`;
  let text = `\n\n### Net income to operating cash flow (USD)\n\nCurrent: ${current.period_start} to ${current.period_end}. Prior: ${prior ? prior.period_start+' to '+prior.period_end : 'Unavailable'}.\n\n| Signed contribution | Current | Prior | Change |\n| --- | ---: | ---: | ---: |\n`;
  text += bridgeRows(current, prior).map(r => `| ${r.label} | ${num(r.current)} | ${num(r.prior)} | ${num(r.change)} |`).join('\n');
  text += `\n\n${bridgeQuestion(current)}\n\nOther and unmapped adjustments = operating cash flow − net income − selected signed adjustments. This remainder includes unmapped items and is not a sourced causal explanation. Missing values are not zero. Mapping coverage can change across periods. Non-cash add-backs are not cash receipts.\n`;
  for (const p of [current, prior].filter(valid)) {
    text += `\nSource inputs for ${p.period_start} to ${p.period_end}; ${p.cash_bridge.components.length-p.cash_bridge.missing_components.length}/${p.cash_bridge.components.length} selected groups mapped. Effect = raw value × sign.\n\n`;
    text += p.cash_bridge.components.map(c => `- ${c.label}: ${c.fact ? `${num(c.fact.value)} × ${c.sign} = ${num(c.effect)} USD; [${c.fact.tag}](${safeURL(c.fact.url) || ''}); filed ${c.fact.filed}; accession ${c.fact.accession}` : 'Unavailable'}; ${c.explanation}`).join('\n') + '\n';
  }
  return text;
}
