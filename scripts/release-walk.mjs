#!/usr/bin/env node
// Release walk: the whole visitor flow on the built site (web/ as GitHub Pages serves it), in a real browser.
//   node scripts/release-walk.mjs [--out walk-output]
// Desktop 1440 and phone 375, light and dark: intro, the Ask box (answers and refusals), every console tab.
// Failure paths: a missing bundle with retry, a stale bundle, a saved brief from an older data version,
// deep links (versioned, unknown view, unknown company, out-of-range date, repeated field) and reduced motion.
// 0.3.0: Financials (search, ten years, CSV), Compare (add, fiscal year, CSV), Screen (filter, sort, CSV) and Watch (SEC
// Submissions answered by a SYNTHETIC fixture in the walk; SEC unreachable), plus a missing shard, a missing index,
// an unknown company, a bank template and a missing tag.
// Fails on any console error, failed request, horizontal overflow at 375 px or missing expected content.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {buildBrief} from '../web/research-math.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const outArg = process.argv.indexOf('--out');
const out = path.resolve(outArg > 0 ? process.argv[outArg + 1] : path.join(root, 'walk-output'));
fs.mkdirSync(out, {recursive: true});
const pw = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, 'index.mjs')).href : 'playwright');
const bundle = JSON.parse(fs.readFileSync(path.join(web, 'data/research.json'), 'utf8'));

// A static server shaped like GitHub Pages: /finscope/ prefix, no directory listings, 404 for unknown paths.
const SEC_FIXTURE = {cik: '21344', name: 'SYNTHETIC walk fixture', filings: {recent: {
  accessionNumber: ['0000021344-26-900001', '0000021344-26-900002', '0000021344-26-900003', '0000021344-26-900004'],
  filingDate: [new Date().toISOString().slice(0, 10), new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10), new Date(Date.now() - 9 * 86400000).toISOString().slice(0, 10), '2020-01-02'],
  reportDate: ['', '2026-09-26', '', '2019-12-31'], form: ['8-K', '10-Q', '4', '10-K'], items: ['2.02,9.01', '', '', ''],
  primaryDocument: ['walk-8k.htm', 'walk-10q.htm', 'walk-form4.xml', 'walk-10k.htm'], primaryDocDescription: ['8-K (walk fixture)', '10-Q (walk fixture)', '4', '10-K']}}};
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.csv': 'text/csv', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/finscope/')) { res.writeHead(404); res.end('not found'); return; }
  let rel = decodeURIComponent(url.pathname.slice('/finscope/'.length)) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(web, rel));
  if (!file.startsWith(web) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/finscope/`;

const launch = process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {};
const browser = await pw.chromium.launch({headless: true, ...launch});
const report = {base, started: new Date().toISOString(), dataset_sha256: bundle.dataset_sha256, checks: [], screenshots: [], errors: []};
const fail = msg => { report.errors.push(msg); console.error('FAIL', msg); };
const check = (ok, msg) => { report.checks.push({ok: Boolean(ok), msg}); if (!ok) fail(msg); };

async function context({width, height, scheme, motion = 'no-preference'}) {
  const ctx = await browser.newContext({viewport: {width, height}, colorScheme: scheme, reducedMotion: motion, deviceScaleFactor: 1, acceptDownloads: true});
  const page = await ctx.newPage();
  page.allowedFailures = [];
  page.on('console', m => { if (m.type() === 'error' && !page.allowedFailures.some(re => re.test(m.text()))) fail(`${width}/${scheme} console error: ${m.text()}`); });
  page.on('pageerror', e => fail(`${width}/${scheme} page error: ${e.message}`));
  page.on('requestfailed', r => { if (!page.allowedFailures.some(re => re.test(r.url()))) fail(`${width}/${scheme} request failed: ${r.url()} ${r.failure()?.errorText}`); });
  page.on('response', r => { if (r.status() >= 400 && !page.allowedFailures.some(re => re.test(r.url()))) fail(`${width}/${scheme} HTTP ${r.status()}: ${r.url()}`); });
  // Only the site itself: block anything cross-origin so a walk never depends on, or calls, an outside host.
  page.sec = null; // null: fail the walk on any cross-origin request; 'fixture' or 'down': the Watch page's SEC request
  await ctx.route(url => !url.href.startsWith(base), route => {
    const url = route.request().url();
    if (page.sec && /^https:\/\/data\.sec\.gov\/submissions\/CIK\d{10}\.json$/.test(url)) {
      page.secRequests = (page.secRequests || 0) + 1;
      return page.sec === 'fixture' ? route.fulfill({status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify(SEC_FIXTURE)}) : route.abort();
    }
    if (!page.allowedFailures.some(re => re.test(url))) fail(`cross-origin request: ${url}`);
    route.abort();
  });
  return {ctx, page};
}
const shot = async (page, name) => {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({path: file, fullPage: true});
  report.screenshots.push(path.basename(file));
};
const noOverflow = async (page, label) => {
  const [sw, iw] = await page.evaluate(() => [document.scrollingElement.scrollWidth, window.innerWidth]);
  check(sw <= iw + 1, `${label}: no horizontal overflow (${sw} ≤ ${iw})`);
};
const ready = page => page.waitForFunction(() => document.querySelector('#company:not([disabled])') && document.querySelectorAll('#company option').length === 6, null, {timeout: 60000});
async function ask(page, q) {
  await page.fill('#ask-input', q);
  await page.press('#ask-input', 'Enter');
  await page.waitForFunction(text => document.querySelector('#answer-q')?.textContent.includes(text), q.slice(0, 20));
  return page.evaluate(() => ({status: document.querySelector('.answer').className, summary: document.querySelector('.answer-summary').textContent, stamp: document.querySelector('.engine-stamp')?.textContent, read: [...document.querySelectorAll('.answer .evidence-links a')].map(a => a.textContent)}));
}

const QUESTIONS = [
  ['NVDA 的利润有现金流支撑吗', 'answered', /1200\.67 亿美元/],
  ['六家公司里哪家利润和现金差距最大', 'answered', /NVDA/],
  ['半导体公司里现金转化最差的是哪家', 'not_in_bundle', /筛选/],
  ['Which company has the highest cash conversion?', 'not_in_bundle', /Screen/],
  ['MSFT 2024 年经营现金流是多少', 'answered', /1185\.48 亿美元/],
  ['compare AMZN and META cash conversion', 'answered', /AMZN .*META/],
  ['Should I buy NVDA now?', 'refused', /investment advice/],
  ['英伟达毛利率多少', 'answered', /毛利率/],
  ['TSLA revenue', 'answered', /Tesla/],
  ['Compare KO, PEP and MDLZ gross margin', 'answered', /KO .*PEP|PEP .*KO/],
  ['好市多的利润有现金流支撑吗', 'answered', /经营活动现金流/],
  ['JPM 的毛利率是多少', 'not_in_bundle', /银行/],
  ['Coca-Cola R&D 2024', 'not_in_bundle', /not reported/],
  ['Alibaba revenue 2024', 'not_in_bundle', /20-F/],
  ['Which tag is Walmart revenue from?', 'answered', /Revenues/],
  ['asdkjh qwe', 'clarify', /could not read/]
];
const TABS = ['ask', 'company', 'review', 'compare', 'screen', 'watch', 'stress', 'brief', 'method'];
const UNIVERSE_TABS = new Set(['company', 'compare', 'screen', 'watch']);

for (const [width, height] of [[1440, 900], [375, 812]]) for (const scheme of ['light', 'dark']) {
  const label = `${width}-${scheme}`;
  const {ctx, page} = await context({width, height, scheme});
  await page.goto(base);
  await page.waitForSelector('#intro-waterline svg', {timeout: 60000});
  check(await page.textContent('#intro-title') === 'FinScope', `${label}: intro headline is the project name`);
  check(/SEC EDGAR \/ XBRL/.test(await page.textContent('.hero-stack')), `${label}: tech-stack line under the headline`);
  await noOverflow(page, `${label} intro`);
  await shot(page, `${label}-01-intro`);
  // The intro box enters the console on Ask and answers.
  await page.fill('#intro-ask-input', QUESTIONS[0][0]);
  await page.press('#intro-ask-input', 'Enter');
  await page.waitForSelector('.answer', {timeout: 60000});
  check(await page.evaluate(() => document.documentElement.dataset.mode) === 'console', `${label}: intro question opens the console`);
  for (const [q, status, re] of QUESTIONS) {
    const a = await ask(page, q);
    check(a.status.includes(`answer-${status}`), `${label}: "${q}" → ${status}`);
    check(re.test(a.summary), `${label}: "${q}" summary states ${re}`);
    check(/tier 1/i.test(a.stamp || ''), `${label}: "${q}" names its engine`);
    if (status === 'answered') check(a.read.some(t => /Read 10-[KQ]/.test(t)), `${label}: "${q}" links its 10-K/10-Q`);
    else check(a.read.length === 0, `${label}: "${q}" states no sourced figures`);
  }
  await ask(page, QUESTIONS[0][0]);
  await noOverflow(page, `${label} ask`);
  await shot(page, `${label}-02-ask`);
  for (const [i, tab] of TABS.entries()) {
    await page.click(`.steps [data-page="${tab}"]`);
    await page.waitForFunction(t => document.body.dataset.page === t && document.querySelector('#content h2'), tab);
    check(await page.$eval('#content h2', h => h.textContent.trim().length > 0), `${label}: ${tab} tab renders`);
    if (tab === 'review') await page.waitForSelector('#profit-chart svg');
    if (tab === 'company') await page.waitForSelector('#universe-waterline svg, .fin-table', {timeout: 30000});
    if (tab === 'screen') await page.waitForSelector('.screen-table', {timeout: 30000});
    await noOverflow(page, `${label} ${tab}`);
    await shot(page, `${label}-${String(i + 3).padStart(2, '0')}-${tab}`);
  }
  // Financials for a visitor's own company: search by Chinese name, ten years, traced cells, CSV with sources.
  await page.click('.steps [data-page="company"]');
  await page.waitForSelector('#company-search:not([disabled])', {timeout: 30000});
  await page.fill('#company-search', '可口可乐');
  await page.waitForSelector('#company-options li[data-cik]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /COCA COLA/.test(document.querySelector('#company-title')?.textContent || ''), null, {timeout: 30000});
  check(await page.$$eval('.fin-table a.traced', as => as.length > 40 && as.every(a => /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/21344\//.test(a.href))), `${label}: KO cells link to KO's filings on sec.gov`);
  check(/Data-quality notes/.test(await page.textContent('#content')), `${label}: KO data-quality notes shown`);
  await page.click('[data-years="10"]');
  await page.waitForFunction(() => document.querySelectorAll('.fin-table thead th').length >= 11);
  await noOverflow(page, `${label} financials`);
  await shot(page, `${label}-20-financials-KO`);
  if (width === 1440 && scheme === 'light') {
    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#export-financials')]);
    const text = fs.readFileSync(await csv.path(), 'utf8');
    check(/^company,ticker,cik,template,fiscal_year/.test(text) && /source_url/.test(text.split('\n')[0]) && text.split('\n').length > 200, 'financials CSV carries source columns on every row');
    check(text.split('\n').slice(1).filter(l => l.includes(',revenue,Revenue,')).every(l => /https:\/\/www\.sec\.gov\//.test(l)), 'financials CSV: every revenue row has its filing URL');
  }
  // Compare: peers, a second company by search, a fiscal year, CSV.
  await page.click('#compare-peers');
  await page.waitForFunction(() => document.body.dataset.page === 'compare' && document.querySelectorAll('.compare-table thead th').length >= 3, null, {timeout: 30000});
  await page.fill('#compare-search', 'JPM');
  await page.waitForSelector('#compare-options li[data-cik]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.compare-table thead th')].some(th => /JPM/.test(th.textContent)), null, {timeout: 30000});
  check(/n\/a/.test(await page.textContent('.compare-table')), `${label}: compare marks bank-template figures n/a`);
  await noOverflow(page, `${label} compare`);
  await shot(page, `${label}-21-compare`);
  if (width === 1440 && scheme === 'light') {
    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#export-compare')]);
    check(/source_url/.test(fs.readFileSync(await csv.path(), 'utf8').split('\n')[0]), 'compare CSV carries source columns');
  }
  // Screen: sector filter, a threshold, sort, CSV.
  await page.click('.steps [data-page="screen"]');
  await page.waitForSelector('.screen-table');
  await page.selectOption('#screen-form select[name="peer"]', 'sic2:28');
  await page.waitForFunction(() => /of [\d,]+ companies/.test(document.querySelector('#content [role="status"]')?.textContent || ''));
  await page.fill('#screen-form input[name="cc"]', '1');
  await page.dispatchEvent('#screen-form input[name="cc"]', 'change');
  await page.click('[data-sort="accruals"]');
  await page.waitForFunction(() => document.querySelectorAll('.screen-table tbody tr').length > 0);
  check(/not a rating/.test(await page.textContent('#content')), `${label}: screen says it is not a rating`);
  await noOverflow(page, `${label} screen`);
  await shot(page, `${label}-22-screen`);
  if (width === 1440 && scheme === 'light') {
    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#export-screen')]);
    const head = fs.readFileSync(await csv.path(), 'utf8').split('\n')[0];
    check(/peer_group/.test(head) && /xbrl_tags/.test(head) && /source_url/.test(head), 'screen CSV carries peer group, tags and source');
  }
  // A sector ranking in Ask points to Screen and its link opens Screen filtered and sorted (probe of b12433a).
  await page.click('.steps [data-page="ask"]');
  const ranked = await ask(page, '半导体公司里现金转化最差的是哪家');
  check(ranked.status.includes('answer-not_in_bundle') && !/NVDA|英伟达/.test(ranked.summary), `${label}: a sector ranking points to Screen, not to the six`);
  await page.click('.answer-action a[data-screen]');
  await page.waitForSelector('.screen-table');
  check(await page.$eval('#screen-form select[name="peer"]', el => el.value) === 'ind:sic4:3674', `${label}: the Ask link opens Screen filtered to SIC 3674`);
  check(await page.$$eval('.screen-table tbody tr', rows => { const v = rows.map(r => parseFloat(r.cells[4].textContent)).filter(Number.isFinite); return v.length > 3 && v.every((x, i) => !i || v[i - 1] <= x); }), `${label}: the Ask link sorts by cash conversion, lowest first`);
  await noOverflow(page, `${label} screen from Ask`);
  await shot(page, `${label}-23-screen-from-ask`);
  // Watch: add KO, check the SEC (a SYNTHETIC fixture stands in for data.sec.gov in the walk).
  await page.click('.steps [data-page="watch"]');
  await page.fill('#watch-search', 'KO');
  await page.waitForSelector('#watch-options li[data-cik]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.watch-item');
  check(/Only one request per watched company|only one request per watched company/i.test(await page.textContent('.privacy-note')), `${label}: watch states what leaves the page`);
  page.sec = 'fixture';
  await page.click('#watch-check');
  await page.waitForFunction(() => document.querySelectorAll('.filings li').length >= 2, null, {timeout: 30000});
  const forms = await page.$$eval('.filings .form', els => els.map(e => e.textContent));
  check(forms.includes('8-K') && forms.includes('10-Q') && !forms.includes('4'), `${label}: watch lists new 8-K and 10-Q, not Form 4`);
  await noOverflow(page, `${label} watch`);
  await shot(page, `${label}-23-watch`);
  await page.click('#watch-seen');
  page.sec = 'down';
  page.allowedFailures = [/data\.sec\.gov/, /Failed to load resource|ERR_FAILED|CORS/];
  await page.click('#watch-check');
  await page.waitForFunction(() => /Could not reach the SEC/.test(document.querySelector('.watch-list')?.textContent || ''), null, {timeout: 30000});
  check(true, `${label}: SEC unreachable is stated per company`);
  await shot(page, `${label}-24-watch-sec-down`);
  page.sec = null;
  page.allowedFailures = [];
  // Downloads on the brief tab work without a server.
  if (width === 1440 && scheme === 'light') {
    await page.click('.steps [data-page="brief"]');
    const [md] = await Promise.all([page.waitForEvent('download'), page.click('#export-md')]);
    check(/finscope-MSFT-\d{4}-\d{2}-\d{2}\.md$/.test(md.suggestedFilename()), 'brief Markdown downloads');
  }
  await ctx.close();
}

// Failure paths, desktop light.
{
  const {ctx, page} = await context({width: 1440, height: 900, scheme: 'light'});
  // 1. Missing bundle: honest error, retry works, the Ask box does not invent answers.
  page.allowedFailures = [/data\/research\.json/, /Failed to load resource/];
  let missing = true;
  await page.route('**/data/research.json', route => missing ? route.fulfill({status: 404, body: 'gone'}) : route.continue());
  await page.goto(base);
  await page.waitForSelector('#intro-waterline .wl-loading');
  await page.waitForFunction(() => /could not be loaded/.test(document.querySelector('#intro-waterline').textContent));
  await page.fill('#intro-ask-input', 'NVDA revenue');
  await page.press('#intro-ask-input', 'Enter');
  await page.waitForSelector('#retry-evidence');
  check(!(await page.$('.answer')), 'missing bundle: no answer is shown');
  check(/could not be loaded/.test(await page.textContent('#content')), 'missing bundle: the console says the evidence could not be loaded');
  check(/NVDA revenue/.test(await page.textContent('#content')), 'missing bundle: the queued question is kept and named');
  await shot(page, 'failure-01-missing-bundle');
  missing = false;
  await page.click('#retry-evidence');
  await ready(page);
  await page.waitForSelector('.answer');
  check(/NVIDIA/.test(await page.textContent('.answer-summary')), 'missing bundle: after retry, the queued question is answered');
  await page.unroute('**/data/research.json');
  page.allowedFailures = [];
  // 2. Stale bundle: the overdue banner.
  const stale = {...bundle, generated_at: new Date(Date.now() - 10 * 86400000).toISOString()};
  await page.route('**/data/research.json', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(stale)}));
  await page.goto(base + '#workspace');
  await ready(page);
  check(/Refresh overdue/.test(await page.textContent('#freshness')), 'stale bundle: banner marks the refresh overdue');
  await shot(page, 'failure-02-stale-bundle');
  await page.unroute('**/data/research.json');
  // 3. A saved brief from an older data version asks before recalculating.
  await page.goto(base + '#workspace');
  await ready(page);
  const old = buildBrief(bundle, bundle.snapshots.at(-1), bundle.companies.find(c => c.ticker === 'NVDA'), {revenuePercent: -10, marginPoints: -2, refinanceBillions: 10, rateBps: 100, collectionDays: 15}, bundle.as_of);
  old.dataset_sha256 = 'a'.repeat(64);
  const briefFile = path.join(out, 'old-brief.json');
  fs.writeFileSync(briefFile, JSON.stringify(old));
  await page.click('#saved-brief summary');
  await page.setInputFiles('#brief-file', briefFile);
  await page.waitForSelector('#restore-apply');
  check(/version has changed/.test(await page.textContent('#restore-preview')), 'old brief: version change is stated before any result');
  check(!(await page.$('#export-json')), 'old brief: no export until the visitor decides');
  await shot(page, 'failure-03-old-brief');
  await page.click('#restore-apply');
  await page.waitForFunction(() => document.querySelector('#company').value === 'NVDA');
  check(/Recalculated with current data/.test(await page.textContent('#restore-message')), 'old brief: recalculated only after the explicit choice');
  fs.rmSync(briefFile);
  // 4. The current-updates feed fails on its own; research keeps working.
  page.allowedFailures = [/data\/updates\.json/, /Failed to load resource/];
  await page.route('**/data/updates.json', route => route.fulfill({status: 503, body: 'down'}));
  await page.goto(base + '#workspace');
  await ready(page);
  await page.click('#official-updates summary');
  await page.waitForFunction(() => /Check failed/.test(document.querySelector('#updates-status').textContent), null, {timeout: 30000});
  check(/Official updates are unavailable/.test(await page.textContent('#updates-status')), 'updates feed down: the monitor says so');
  check(await page.$eval('#company', el => !el.disabled), 'updates feed down: research still works');
  await shot(page, 'failure-05-updates-feed');
  await page.unroute('**/data/updates.json');
  page.allowedFailures = [];
  // 4b. Universe failures: an unknown company, a missing shard (with retry), a missing index (Ask falls back to six).
  await page.goto(base + '?co=KO');
  await ready(page);
  await page.waitForSelector('#company-search:not([disabled])');
  await page.fill('#company-search', 'zzqx');
  await page.waitForSelector('#company-options .no-match');
  check(/20-F/.test(await page.textContent('#company-options')), 'unknown company: the search says what the universe covers');
  await shot(page, 'failure-06-unknown-company');
  page.allowedFailures = [/universe\/c\/21344\.json/, /Failed to load resource/];
  let shardDown = true;
  await page.route('**/data/universe/c/21344.json', route => shardDown ? route.fulfill({status: 404, body: 'gone'}) : route.continue());
  await page.goto(base + '?co=KO');
  await ready(page);
  await page.waitForSelector('#retry-shard', {timeout: 30000});
  check(/could not be loaded/.test(await page.textContent('#content')) && !(await page.$('.fin-table')), 'missing shard: says so, shows no figures');
  await shot(page, 'failure-07-missing-shard');
  shardDown = false;
  await page.click('#retry-shard');
  await page.waitForSelector('.fin-table', {timeout: 30000});
  check(true, 'missing shard: retry loads the company');
  await page.unroute('**/data/universe/c/21344.json');
  page.allowedFailures = [/universe\/index\.json/, /Failed to load resource/];
  await page.route('**/data/universe/index.json', route => route.fulfill({status: 503, body: 'down'}));
  await page.goto(base + '#workspace');
  await ready(page);
  await page.click('.steps [data-page="ask"]');
  const fallback = await ask(page, 'NVDA 的利润有现金流支撑吗');
  check(fallback.status.includes('answer-answered'), 'missing index: the six-company deep ledger still answers');
  check(/could not be loaded/.test(await page.textContent('#content')), 'missing index: Ask says the universe is unavailable');
  await page.click('.steps [data-page="company"]');
  check(/could not be loaded/.test(await page.textContent('#content')), 'missing index: Financials says so');
  await shot(page, 'failure-08-missing-index');
  await page.unroute('**/data/universe/index.json');
  page.allowedFailures = [];
  // 5. Deep links.
  const q = `company=NVDA&date=${bundle.as_of}&view=ask&dataset=${bundle.dataset_sha256}&calculation=1`;
  await page.goto(`${base}?${q}#workspace`);
  await ready(page);
  check(await page.evaluate(() => document.body.dataset.page) === 'ask' && Boolean(await page.$('#ask-form')), 'deep link: a versioned link opens the Ask tab directly');
  for (const [link, re, name] of [
    ['?view=bogus#workspace', /not recognized/, 'unknown view'],
    ['?company=TSLA#workspace', /not supported/, 'unknown deep-ledger company'],
    ['?date=2031-01-01#workspace', /Choose a real calendar date/, 'future date'],
    ['?company=NVDA&company=MSFT#workspace', /repeats company/, 'repeated field']
  ]) {
    await page.goto(base + link);
    await page.waitForSelector('#restore-preview:not([hidden])');
    check(re.test(await page.textContent('#restore-preview')), `deep link: ${name} is refused with a reason`);
    check(!(await page.$('#export-json')) && !(await page.$('.answer')), `deep link: ${name} shows no results`);
  }
  await shot(page, 'failure-04-bad-link');
  // A view-only link opens that view (probe of b12433a: a bare ?view=screen said the saved version was incomplete).
  await page.goto(`${base}?view=screen&peer=ind%3Asic4%3A3674&sort=cash_conversion&dir=asc`);
  await page.waitForSelector('.screen-table', {timeout: 30000});
  check(await page.$eval('#screen-form select[name="peer"]', el => el.value) === 'ind:sic4:3674' && !(await page.isVisible('#restore-preview')), 'deep link: a Screen link with a filter opens Screen filtered');
  await page.goto(`${base}?view=screen`);
  await page.waitForSelector('.screen-table', {timeout: 30000});
  check(!(await page.isVisible('#restore-preview')) && !/incomplete/.test(await page.textContent('#content')), 'deep link: a bare ?view=screen opens Screen');
  await page.goto(base + '#workspace');
  await ready(page);
  check(await page.evaluate(() => document.documentElement.dataset.mode) === 'console', 'deep link: #workspace opens the console');
  await ctx.close();
}
// 6. The synthetic forecasting lab loads at both widths.
for (const [width, height] of [[1440, 900], [375, 812]]) {
  const {ctx, page} = await context({width, height, scheme: 'light'});
  // On a loopback host only, the lab looks for the optional local API (web/app.js); Pages never makes this request.
  page.allowedFailures = [/\/api\/health$/, /Failed to load resource/];
  await page.goto(base + 'lab.html');
  await page.waitForLoadState('networkidle');
  check(/SYNTHETIC|fictional|synthetic/i.test(await page.textContent('body')), `lab ${width}: synthetic label visible`);
  await noOverflow(page, `lab ${width}`);
  await shot(page, `lab-${width}`);
  await ctx.close();
}
// 7. Reduced motion removes transitions.
{
  const {ctx, page} = await context({width: 375, height: 812, scheme: 'dark', motion: 'reduce'});
  await page.goto(base);
  await page.waitForSelector('#intro-waterline svg', {timeout: 60000});
  const durations = await page.evaluate(() => [...document.querySelectorAll('button, a, .steps button')].slice(0, 30).map(el => getComputedStyle(el).transitionDuration));
  check(durations.every(d => d.split(',').every(x => parseFloat(x) === 0)), 'reduced motion: no transitions');
  await ctx.close();
}

await browser.close();
server.close();
report.finished = new Date().toISOString();
report.passed = report.errors.length === 0;
fs.writeFileSync(path.join(out, 'walk-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.checks.filter(c => c.ok).length}/${report.checks.length} checks passed, ${report.screenshots.length} screenshots, ${report.errors.length} errors → ${out}`);
process.exit(report.passed ? 0 : 1);
