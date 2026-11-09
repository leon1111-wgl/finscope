#!/usr/bin/env node
// Release walk: the whole visitor flow on the built site (web/ as GitHub Pages serves it), in a real browser.
//   node scripts/release-walk.mjs [--out walk-output]
// Desktop 1440 and phone 375, light and dark: intro, the Ask box (answers and refusals), every console tab.
// Failure paths: a missing bundle with retry, a stale bundle, a saved brief from an older data version,
// deep links (versioned, unknown view, unknown company, out-of-range date, repeated field) and reduced motion.
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
  await ctx.route(url => !url.href.startsWith(base), route => { if (!page.allowedFailures.some(re => re.test(route.request().url()))) fail(`cross-origin request: ${route.request().url()}`); route.abort(); });
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
  ['哪家公司利润和现金差距最大', 'answered', /NVDA/],
  ['MSFT 2024 年经营现金流是多少', 'answered', /1185\.48 亿美元/],
  ['compare AMZN and META cash conversion', 'answered', /AMZN .*META/],
  ['Should I buy NVDA now?', 'refused', /investment advice/],
  ['英伟达毛利率多少', 'not_in_bundle', /毛利/],
  ['TSLA revenue', 'not_in_bundle', /TSLA is not in this bundle/],
  ['asdkjh qwe', 'clarify', /could not read/]
];
const TABS = ['ask', 'review', 'compare', 'stress', 'brief', 'method'];

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
    await noOverflow(page, `${label} ${tab}`);
    await shot(page, `${label}-${String(i + 3).padStart(2, '0')}-${tab}`);
  }
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
  // 5. Deep links.
  const q = `company=NVDA&date=${bundle.as_of}&view=ask&dataset=${bundle.dataset_sha256}&calculation=1`;
  await page.goto(`${base}?${q}#workspace`);
  await ready(page);
  check(await page.evaluate(() => document.body.dataset.page) === 'ask' && Boolean(await page.$('#ask-form')), 'deep link: a versioned link opens the Ask tab directly');
  for (const [link, re, name] of [
    ['?view=bogus#workspace', /not recognized/, 'unknown view'],
    ['?company=TSLA#workspace', /not supported/, 'unknown company'],
    ['?date=2031-01-01#workspace', /Choose a real calendar date/, 'future date'],
    ['?company=NVDA&company=MSFT#workspace', /repeats company/, 'repeated field']
  ]) {
    await page.goto(base + link);
    await page.waitForSelector('#restore-preview:not([hidden])');
    check(re.test(await page.textContent('#restore-preview')), `deep link: ${name} is refused with a reason`);
    check(!(await page.$('#export-json')) && !(await page.$('.answer')), `deep link: ${name} shows no results`);
  }
  await shot(page, 'failure-04-bad-link');
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
