// DOM integration only: no browser, layout engine, external requests or real downloads.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {buildBrief} from '../web/research-math.js';
import {buildComparison} from '../web/comparison-export.js';
const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const data=JSON.parse(fs.readFileSync(new URL('../web/data/research.json',import.meta.url)));
const inputs={revenuePercent:-10,marginPoints:-2.25,refinanceBillions:10,rateBps:100,collectionDays:15.5};
const saved=()=>buildBrief(data,data.snapshots.at(-1),data.companies.find(c=>c.ticker==='NVDA'),inputs,data.as_of);
let sequence=0;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function boot(t,query='') {
 const dom=new JSDOM(html,{url:'https://example.test/finscope/'+query});
 const calls=[],downloads=[];
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,history:dom.window.history,location:dom.window.location,
  ResizeObserver:class{observe(){}},fetch:async url=>{calls.push(url);assert.equal(url,'./data/research.json');return {ok:true,json:async()=>data};}});
 const originalURL=URL.createObjectURL;
 URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:test';};
 dom.window.HTMLAnchorElement.prototype.click=function(){};
 dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
 await import(`../web/research-app.js?domTest=${++sequence}`);
 await tick();await tick();
 t.after(()=>{dom.window.close();URL.createObjectURL=originalURL;});
 const $=selector=>dom.window.document.querySelector(selector);
 const click=selector=>{assert.ok($(selector),selector);$(selector).click();};
 const upload=async text=>{const el=$('#brief-file');Object.defineProperty(el,'files',{value:[{size:Buffer.byteLength(text),text:async()=>text}],configurable:true});el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await tick();await tick();};
 const exportJSON=async()=>{click('#export-json');return JSON.parse(await downloads.at(-1).text());};
 return {dom,$,click,upload,exportJSON,calls,downloads};
}

test('saved JSON preview and cancel preserve the current company and do not send the file',async t=>{
 const ui=await boot(t);
 assert.equal(ui.$('#company').value,'MSFT');
 await ui.upload(JSON.stringify(saved()));
 assert.equal(ui.$('#company').disabled,true);
 assert.equal(ui.$('#export-json'),null);
 assert.match(ui.$('#restore-preview').textContent,/NVDA/);
 ui.click('#restore-cancel');
 assert.equal(ui.$('#company').value,'MSFT');assert.equal(ui.$('#company').disabled,false);
 assert.deepEqual(ui.calls,['./data/research.json']);
});
test('restored brief recomputes official facts and exports a versioned reopening link',async t=>{
 const ui=await boot(t);const edited=saved();edited.facts={revenue:{value:1}};edited.scenario={profitProxy:1e99};
 await ui.upload(JSON.stringify(edited));ui.click('#restore-apply');
 assert.equal(ui.$('#company').value,'NVDA');assert.equal(ui.$('#restore-preview').hidden,true);
 const exported=await ui.exportJSON();
 assert.deepEqual(exported.assumptions,inputs);
 assert.equal(exported.facts.revenue.value,data.snapshots.at(-1).companies.NVDA.at(-1).metrics.revenue.value);
 assert.notEqual(exported.scenario.profitProxy,1e99);
 assert.ok(exported.reopen_url.includes(`dataset=${data.dataset_sha256}`));
 assert.deepEqual(ui.calls,['./data/research.json']);
});
test('changed shared dataset blocks calculation until the explicit current-data choice',async t=>{
 const ui=await boot(t,`?company=NVDA&date=${data.as_of}&view=brief&revenuePercent=-10&dataset=${'0'.repeat(64)}`);
 assert.equal(ui.$('#company').disabled,true);assert.equal(ui.$('#export-json'),null);
 assert.match(ui.$('#restore-apply').textContent,/current data/);
 ui.click('#restore-apply');
 const exported=await ui.exportJSON();assert.equal(exported.company.ticker,'NVDA');assert.equal(exported.assumptions.revenuePercent,-10);
 assert.equal(new URL(ui.dom.window.location.href).searchParams.get('dataset'),data.dataset_sha256);
});
test('invalid shared input cannot silently display or export a baseline',async t=>{
 const ui=await boot(t,'?company=NVDA&rateBps=');
 assert.equal(ui.$('#restore-apply'),null);assert.equal(ui.$('#export-json'),null);
 assert.match(ui.$('#restore-preview').textContent,/invalid rateBps/);
 ui.click('#restore-cancel');assert.equal(ui.$('#company').value,'MSFT');
 ui.click('[data-page="brief"]');assert.equal((await ui.exportJSON()).assumptions.rateBps,0);
});
test('fractional restored assumptions remain valid and editable in the scenario form',async t=>{
 const ui=await boot(t,saved().reopen_url.replace('https://leon1111-wgl.github.io/finscope/',''));
 ui.click('[data-page="stress"]');
 assert.equal(ui.$('#scenario-form').checkValidity(),true);
 assert.equal(ui.$('[data-assumption="marginPoints"]').value,'-2.25');
 ui.click('[data-page="brief"]');assert.deepEqual((await ui.exportJSON()).assumptions,inputs);
});
test('blank draft assumptions block navigation and file restore until corrected',async t=>{
 const ui=await boot(t);ui.click('[data-page="stress"]');
 const field=ui.$('[data-assumption="rateBps"]');field.value='';field.dispatchEvent(new ui.dom.window.Event('input',{bubbles:true}));
 ui.click('[data-page="brief"]');assert.ok(ui.$('#scenario-form'));assert.equal(ui.$('#export-json'),null);
 await ui.upload(JSON.stringify(saved()));assert.equal(ui.$('#restore-preview').hidden,true);
 assert.equal(field.value,'');ui.click('#reset-scenario');ui.click('[data-page="brief"]');
 assert.equal((await ui.exportJSON()).assumptions.rateBps,0);
});
test('malformed files show a recoverable error and leave the existing review intact',async t=>{
 const ui=await boot(t,saved().reopen_url.replace('https://leon1111-wgl.github.io/finscope/',''));
 await ui.upload('{broken');assert.match(ui.$('#restore-preview').textContent,/not valid JSON/);
 ui.click('#restore-cancel');assert.equal(ui.$('#company').value,'NVDA');assert.deepEqual((await ui.exportJSON()).assumptions,inputs);
});
test('an invalid edit made during a file read is retained instead of replaced by preview',async t=>{
 const ui=await boot(t);ui.click('[data-page="stress"]');
 let finish;
 const delayed=new Promise(resolve=>{finish=resolve;});
 const file=ui.$('#brief-file');
 Object.defineProperty(file,'files',{value:[{size:100,text:()=>delayed}],configurable:true});
 file.dispatchEvent(new ui.dom.window.Event('change',{bubbles:true}));
 const field=ui.$('[data-assumption="rateBps"]');field.value='';field.dispatchEvent(new ui.dom.window.Event('input',{bubbles:true}));
 finish(JSON.stringify(saved()));await tick();await tick();
 assert.equal(ui.$('#restore-preview').hidden,true);
 assert.equal(ui.$('[data-assumption="rateBps"]').value,'');
 assert.equal(ui.$('#scenario-form').checkValidity(),false);
 assert.doesNotMatch(ui.$('#restore-message').textContent,/Reading/);
});

test('comparison downloads carry every company at the selected date without carrying stress assumptions',async t=>{
 const ui=await boot(t,saved().reopen_url.replace('https://leon1111-wgl.github.io/finscope/',''));
 ui.click('[data-page="compare"]');
 ui.click('#export-comparison-json');
 const evidence=JSON.parse(await ui.downloads.at(-1).text());
 assert.deepEqual(evidence.companies.map(c=>c.ticker),['AAPL','MSFT','NVDA','AMZN','GOOGL','META']);
 assert.equal(evidence.requested_date,data.as_of);
 assert.deepEqual(evidence.companies.find(c=>c.ticker==='NVDA').annual.metrics.capex,data.snapshots.at(-1).companies.NVDA.at(-1).metrics.capex);
 assert.equal('assumptions' in evidence,false);
 ui.click('#export-comparison-csv');
 const csv=await ui.downloads.at(-1).text();
 assert.match(csv,/annual_period_end/);assert.match(csv,/NVDA/);assert.match(csv, /dataset_sha256/);
 assert.match(ui.$('#status').textContent,/comparison/);
 const date=ui.$('#as-of');date.value='2025-06-02';date.dispatchEvent(new ui.dom.window.Event('change',{bubbles:true}));
 ui.click('#export-comparison-json');
 const historical=JSON.parse(await ui.downloads.at(-1).text());
 assert.equal(historical.requested_date,'2025-06-02');
 assert.ok(historical.snapshot_date<='2025-06-02');
 for(const c of historical.companies) assert.ok(c.annual.known_at<='2025-06-02');
 date.value='1900-01-01';date.dispatchEvent(new ui.dom.window.Event('change',{bubbles:true}));
 assert.equal(date.value,'2025-06-02');ui.click('#export-comparison-json');
 assert.equal(JSON.parse(await ui.downloads.at(-1).text()).requested_date,'2025-06-02');
});

test('comparison evidence is distinguished from a single-company saved brief',async t=>{
 const ui=await boot(t);ui.click('[data-page="compare"]');
 await ui.upload(JSON.stringify(buildComparison(data,data.as_of)));
 assert.match(ui.$('#restore-preview').textContent,/comparison evidence/);
 assert.match(ui.$('#restore-preview').textContent,/reopen_url/);
 assert.equal(ui.$('#restore-apply'),null);
 ui.click('#restore-cancel');assert.ok(ui.$('#export-comparison-csv'));
});
