import {escapeHTML as e} from './workbench.js';

function officialURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.sec.gov' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
const label = f => f.link_kind === 'primary_document' ? `Read ${f.form || 'filing'}` : f.link_kind === 'filing_index' ? 'Filing index' : 'Filing directory';

export function evidenceLink(f, showTag = true) {
  const url = officialURL(f?.url), index = officialURL(f?.filing_index_url);
  if (!url) return 'Source unavailable';
  return `<span class="evidence-links"><a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label(f))} ↗</a>${index && index !== url ? ` <span aria-hidden="true">·</span> <a href="${e(index)}" target="_blank" rel="noopener noreferrer">Filing index ↗</a>` : ''}${showTag ? `<small>${e(f.tag)}</small>` : ''}</span>`;
}

export function evidenceMarkdown(f) {
  const url = officialURL(f?.url), index = officialURL(f?.filing_index_url);
  if (!url) return 'Source unavailable';
  return `[${label(f)}](${url})${index && index !== url ? ` · [Filing index](${index})` : ''}`;
}
