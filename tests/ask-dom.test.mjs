// Ask the ledger in the page: intro box, console tab, answer card, escaping and engine label. jsdom only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const html = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const data = fs.readFileSync(new URL('../web/data/research.json', import.meta.url), 'utf8');
let sequence = 0;
const tick = () => new Promise(resolve => setImmediate(resolve));
const universeFile = url => { const f = new URL('../web/' + url.slice(2), import.meta.url); return fs.existsSync(f) ? {ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8'))} : {ok: false, status: 404}; };


async function boot(t, query = '') {
  const dom = new JSDOM(html, {url: 'https://example.test/finscope/' + query});
  const calls = [];
  Object.assign(globalThis, {window: dom.window, document: dom.window.document, history: dom.window.history, location: dom.window.location,
    ResizeObserver: class { observe() {} },
    fetch: async url => { calls.push(url); if (url.startsWith('./data/universe/')) return universeFile(url); return {ok: true, json: async () => JSON.parse(data), text: async () => data}; }});
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.scrollTo = () => {};
  Object.defineProperty(globalThis, 'navigator', {value: {clipboard: {writeText: async () => {}}}, configurable: true});
  await import(`../web/research-app.js?askDom=${++sequence}`);
  await tick(); await tick();
  t.after(() => dom.window.close());
  const $ = s => dom.window.document.querySelector(s);
  const submit = async (form, input, text) => {
    $(input).value = text;
    $(form).dispatchEvent(new dom.window.Event('submit', {bubbles: true, cancelable: true}));
    await tick();
    // Ask may load the named companies' universe data first; wait for this question's answer (or a status message).
    for (let i = 0; i < 200 && !($('#answer-q')?.textContent.includes(text.trim().slice(0, 12))) && !/Type a question|could not/.test($('#status')?.textContent || ''); i++) await tick();
  };
  const openAsk = async () => { $('.steps [data-page="ask"]').click(); await tick(); };
  return {dom, $, submit, calls, openAsk};
}

test('the intro box opens the console on Ask and answers with the engine label and source links', async t => {
  const ui = await boot(t);
  assert.equal(ui.dom.window.document.documentElement.dataset.mode, 'intro');
  await ui.submit('#intro-ask', '#intro-ask-input', 'NVDA 的利润有现金流支撑吗');
  assert.equal(ui.dom.window.document.documentElement.dataset.mode, 'console');
  assert.equal(ui.$('.steps [aria-current="page"]').dataset.page, 'ask');
  const card = ui.$('.answer');
  assert.ok(card.classList.contains('answer-answered'));
  assert.match(ui.$('.engine-stamp').textContent, /tier 1/i);
  assert.match(ui.$('.engine-note').textContent, /第一层|tier 1/);
  assert.match(card.textContent, /1200\.67 亿美元/);
  const links = [...card.querySelectorAll('.evidence-links a')].map(a => a.textContent);
  assert.ok(links.some(l => /Read 10-K/.test(l)), 'facts link to the matched 10-K document');
  assert.equal(ui.$('#ask-input').value, 'NVDA 的利润有现金流支撑吗');
  assert.match(ui.$('#ask-live').textContent, /^Answered\./);
  assert.match(ui.dom.window.location.search, /view=ask/);
  assert.deepEqual(ui.calls.filter(u => !u.startsWith('./data/universe/')), ['./data/research.json']);
});

test('refusals and not-in-bundle answers state no figures; visitor text is escaped', async t => {
  const ui = await boot(t, '#workspace');
  await ui.openAsk();
  await ui.submit('#ask-form', '#ask-input', 'Should I buy NVDA now? <img src=x onerror="window.pwned=1">');
  const card = ui.$('.answer');
  assert.ok(card.classList.contains('answer-refused'));
  assert.equal(card.querySelector('img'), null);
  assert.equal(ui.dom.window.pwned, undefined);
  assert.match(card.querySelector('h3').textContent, /<img src=x/);
  assert.equal(card.querySelector('.answer-sources'), null);
  await ui.submit('#ask-form', '#ask-input', '英伟达的EBITDA是多少');
  assert.ok(ui.$('.answer').classList.contains('answer-not_in_bundle'));
  assert.match(ui.$('.answer-status').textContent, /Not in this bundle/);
  assert.equal(ui.$('.answer').querySelector('.answer-sources'), null);
});

test('example and follow-up chips ask through the same engine; empty input is not sent', async t => {
  const ui = await boot(t, '#workspace');
  await ui.openAsk();
  ui.$('[data-ask="好市多的利润有现金流支撑吗"]').click();
  for (let i = 0; i < 200 && !ui.$('.answer-summary'); i++) await tick();
  assert.match(ui.$('.answer-summary').textContent, /COST/);
  assert.equal(ui.dom.window.document.activeElement?.id, 'answer-q');
  const follow = ui.$('.ask-offers [data-ask]');
  const asked = follow.dataset.ask;
  follow.click();
  for (let i = 0; i < 200 && ui.$('#ask-input').value !== asked; i++) await tick();
  assert.equal(ui.$('#ask-input').value, asked);
  await ui.submit('#ask-form', '#ask-input', '   ');
  assert.equal(ui.$('#ask-input').value.trim(), '');
  assert.match(ui.$('#status').textContent, /Type a question/);
});

test('answers follow the information date chosen in the console', async t => {
  const ui = await boot(t, '#workspace');
  await ui.openAsk();
  const date = ui.$('#as-of');
  date.value = '2020-01-15';
  date.dispatchEvent(new ui.dom.window.Event('change', {bubbles: true}));
  await tick();
  await ui.submit('#ask-form', '#ask-input', 'MSFT revenue');
  assert.match(ui.$('.answer-summary').textContent, /FY2019/);
  assert.match(ui.$('.engine-note').textContent, /information date 2020-01-15/);
  await ui.submit('#ask-form', '#ask-input', 'MSFT 2024 revenue');
  assert.ok(ui.$('.answer').classList.contains('answer-refused'));
});

test('a sector ranking answers with a link that opens Screen filtered and sorted (probe of b12433a)', async t => {
  const ui = await boot(t, '#workspace');
  await ui.openAsk();
  await ui.submit('#ask-form', '#ask-input', '半导体公司里现金转化最差的是哪家');
  assert.ok(ui.$('.answer').classList.contains('answer-not_in_bundle'));
  assert.doesNotMatch(ui.$('.answer-summary').textContent, /NVDA|英伟达/);
  const link = ui.$('.answer-action a[data-screen]');
  assert.ok(link, 'Screen link');
  assert.equal(new URL(link.href).search, '?view=screen&peer=ind%3Asic4%3A3674&sort=cash_conversion&dir=asc');
  link.click();
  for (let i = 0; i < 200 && !ui.$('#screen-form'); i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.$('#screen-form select[name="peer"]').value, 'ind:sic4:3674');
  const rows = [...ui.dom.window.document.querySelectorAll('.screen-table tbody tr')];
  assert.ok(rows.length >= 5);
  const conv = rows.map(r => parseFloat(r.cells[4].textContent)).filter(Number.isFinite);
  assert.deepEqual(conv, [...conv].sort((a, b) => a - b));
  assert.ok(rows.every(r => /3674/.test(r.cells[1].textContent)), rows.map(r => r.cells[1].textContent).join(' | '));
});

for (const [query, peer] of [['?view=screen', ''], ['?view=screen&peer=ind%3Asic4%3A3674&sort=cash_conversion&dir=asc', 'ind:sic4:3674'], ['?view=screen&peer=%3Cscript%3E', '']]) {
  test(`a view-only link opens the view: ${query}`, async t => {
    const ui = await boot(t, query);
    for (let i = 0; i < 200 && !ui.$('#screen-form'); i++) await tick();
    assert.ok(ui.$('#screen-form'), 'Screen opened');
    assert.doesNotMatch(ui.dom.window.document.body.textContent, /incomplete|could not be opened/);
    assert.equal(ui.$('#screen-form select[name="peer"]').value, peer);
  });
}

test('every Screen sector option names its SIC group, not a bare code (0.3.1)', async t => {
  const ui = await boot(t, '?view=screen');
  for (let i = 0; i < 200 && !ui.$('#screen-form'); i++) await tick();
  const options = [...ui.dom.window.document.querySelectorAll('#screen-form select[name="peer"] option')].filter(o => o.value);
  assert.ok(options.length > 50);
  const bare = options.filter(o => !/·\s*\S/.test(o.textContent)).map(o => o.textContent);
  assert.deepEqual(bare, []);
  const o36 = options.find(o => o.value === 'sic2:36');
  assert.match(o36.textContent, /SIC 36xx · Electronic/);
  assert.match(options.find(o => /^ind:sic3:/.test(o.value)).textContent, /^SIC \d{3}x · .*\(major group \d\d\)/);
});
