// Light / dark / system theme. The inline head script applies a saved choice before first paint.
const KEY = 'finscope.theme';
const ORDER = ['system', 'light', 'dark'];
const LABEL = {system: 'System', light: 'Light', dark: 'Dark'};

function saved(storage) {
  try {
    const value = storage?.getItem(KEY);
    return ORDER.includes(value) ? value : 'system';
  } catch { return 'system'; }
}

export function applyTheme(doc, choice) {
  if (choice === 'light' || choice === 'dark') doc.documentElement.dataset.theme = choice;
  else delete doc.documentElement.dataset.theme;
  // Each theme-color meta answers one system scheme; a manual choice paints both with that theme.
  for (const meta of doc.querySelectorAll('meta[name="theme-color"][data-light]')) {
    const scheme = (meta.getAttribute('media') || '').includes('dark') ? 'dark' : 'light';
    meta.content = meta.dataset[choice === 'system' ? scheme : choice];
  }
}

export function initThemeToggle(doc, button, storage = globalThis.localStorage) {
  if (!button) return;
  let choice = saved(storage);
  const paint = () => {
    const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    button.querySelector('[data-theme-label]').textContent = LABEL[choice];
    button.setAttribute('aria-label', `Colour theme: ${LABEL[choice]}. Switch to ${LABEL[next]}.`);
    button.dataset.choice = choice;
  };
  applyTheme(doc, choice);
  paint();
  button.addEventListener('click', () => {
    choice = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    try { storage?.setItem(KEY, choice); } catch { /* Private windows can refuse storage; the choice still applies to this page. */ }
    applyTheme(doc, choice);
    paint();
  });
}
