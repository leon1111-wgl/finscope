import {
  escapeHTML as e
} from './workbench.js';
const colors = ['#58dac2', '#83aaff', '#edbd74', '#f5a99d'];
/** Responsive SVGs retain readable 12px labels even at mobile widths. */
export function lineChart(container, rows, series, {
  title,
  unit = '%',
  band = false,
  axisLabel = 'Annualized volatility (%)'
} = {}) {
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.hidden = true;

  function draw() {
    if (!rows.length) {
      container.innerHTML = '<div class="empty">No eligible observations for this selection.</div>';
      return;
    }
    const width = Math.max(260, container.clientWidth),
      height = 285,
      left = 49,
      right = 12,
      top = 24,
      bottom = 45;
    const values = rows.flatMap(r => [...series.map(s => r[s.key]), ...(band ? [r.lower, r.upper] :
      [])]).filter(Number.isFinite);
    if (!values.length) {
      container.innerHTML = '<div class="empty">No matured observations available.</div>';
      return;
    }
    let lo = Math.min(0, ...values),
      hi = Math.max(...values);
    if (lo === hi) hi = lo + 0.01;
    const pad = (hi - lo) * .1;
    hi += pad;
    if (lo < 0) lo -= pad;
    const x = i => left + i / Math.max(1, rows.length - 1) * (width - left - right),
      y = v => top + (hi - v) / (hi - lo) * (height - top - bottom);
    const format = v => ['%', 'pp'].includes(unit) ? `${(v*100).toFixed(0)}${unit}` : v.toFixed(2);
    let markup =
      `<svg viewBox="0 0 ${width} ${height}" tabindex="0" role="group" aria-label="${e(title)}. Use left and right arrows to inspect dates; Home and End jump to endpoints."><title>${e(title)}</title><desc>${e(unit)} by decision date. Detailed values are in the accompanying table. Realized values require matured labels.</desc>`;
    for (let i = 0; i < 4; i++) {
      const v = lo + (hi - lo) * i / 3;
      markup +=
        `<line x1="${left}" y1="${y(v)}" x2="${width-right}" y2="${y(v)}" stroke="#294053" stroke-dasharray="3 4"/><text x="${left-9}" y="${y(v)+4}" fill="#a5b7c8" font-size="12" text-anchor="end">${format(v)}</text>`;
    }
    if (band) {
      const eligible = rows.map((r, i) => ({
        r,
        i
      })).filter(({
        r
      }) => Number.isFinite(r.lower) && Number.isFinite(r.upper));
      const points = [...eligible.map(({
        r,
        i
      }) => `${x(i)},${y(r.upper)}`), ...eligible.slice().reverse().map(({
        r,
        i
      }) => `${x(i)},${y(r.lower)}`)];
      markup += `<polygon points="${points.join(' ')}" fill="#58dac2" opacity=".12"/>`;
    }
    for (const [index, s] of series.entries()) {
      let path = '',
        active = false;
      rows.forEach((r, i) => {
        const v = r[s.key];
        if (!Number.isFinite(v)) {
          active = false;
          return;
        }
        path += `${active?'L':'M'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;
        active = true;
      });
      markup +=
        `<path d="${path}" fill="none" stroke="${s.color||colors[index]}" stroke-width="2" ${s.dashed?'stroke-dasharray="5 4"':''}/>`;
    }
    const ticks = [0, Math.floor((rows.length - 1) / 2), rows.length - 1];
    for (const [idx, i] of [...new Set(ticks)].entries()) markup +=
      `<text x="${x(i)}" y="${height-20}" fill="#a5b7c8" font-size="12" text-anchor="${idx===0?'start':i===rows.length-1?'end':'middle'}">${e(rows[i].date)}</text>`;
    markup +=
      `<text x="${left}" y="13" fill="#a5b7c8" font-size="12">${e(axisLabel)}</text><rect class="chart-hit" x="${left}" y="${top}" width="${width-left-right}" height="${height-top-bottom}" fill="transparent"/></svg>`;
    container.innerHTML = markup;
    container.append(tooltip);
    const svg = container.querySelector('svg');
    let selectedIndex = 0;
    tooltip.setAttribute('role', 'status');
    tooltip.setAttribute('aria-live', 'polite');
    function inspect(index, px = x(index)) {
      selectedIndex = index;
      const r = rows[index];
      tooltip.textContent = `${r.date} · ${series.map(s => `${s.label}: ${Number.isFinite(r[s.key]) ? (['%', 'pp'].includes(unit) ? (r[s.key] * 100).toFixed(2) + unit : r[s.key].toFixed(2)) : 'unavailable'}`).join(' · ')}`;
      tooltip.hidden = false;
      tooltip.style.left = `${Math.max(0, Math.min(px + 8, width - 230))}px`;
      tooltip.style.top = '35px';
    }
    svg.addEventListener('pointermove', event => {
      const rect = svg.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width * width;
      const index = Math.max(0, Math.min(rows.length - 1, Math.round((px - left) / (width -
        left - right) * Math.max(1, rows.length - 1))));
      inspect(index, event.clientX - rect.left);
    });
    svg.addEventListener('pointerleave', () => tooltip.hidden = true);
    svg.addEventListener('focus', () => inspect(selectedIndex));
    svg.addEventListener('blur', () => tooltip.hidden = true);
    svg.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      inspect(event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 :
        Math.max(0, Math.min(rows.length - 1, selectedIndex + (event.key === 'ArrowRight' ? 1 : -1))));
    });
  }
  draw();
  const observer = new ResizeObserver(draw);
  observer.observe(container);
  return () => observer.disconnect();
}
export function networkChart(container, edges, companies) {
  if (!edges.length) {
    container.innerHTML = '<div class="empty">No usable supplied relationships at this date.</div>';
    return;
  }
  const nodes = [...new Set(edges.flatMap(edge => [edge.source, edge.target]))];
  const width = Math.max(260, container.clientWidth),
    height = 240,
    cx = width / 2,
    cy = height / 2;
  const pos = new Map(nodes.map((name, i) => [name, {
    x: cx + Math.cos(i / nodes.length * Math.PI * 2 - Math.PI / 2) * Math.min(100, width /
      3),
    y: cy + Math.sin(i / nodes.length * Math.PI * 2 - Math.PI / 2) * 80
  }]));
  container.innerHTML =
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Descriptive supplied relationship graph"><title>Descriptive supplied relationships</title><desc>${e(edges.map(r=>`${r.source} supplies or relates to ${r.target}`).join('; '))}. Available by selected event cutoff; no learned graph model.</desc>${edges.map(edge=>{const a=pos.get(edge.source),b=pos.get(edge.target);return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#456974" stroke-width="2"/>`;}).join('')}${nodes.map(name=>{const p=pos.get(name);return `<circle cx="${p.x}" cy="${p.y}" r="25" fill="#193b3d" stroke="#58dac2"/><text x="${p.x}" y="${p.y+5}" class="network-label" text-anchor="middle">${e(name)}</text>`;}).join('')}</svg>`;
}
