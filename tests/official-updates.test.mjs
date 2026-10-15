// DOM checks only: no external network, layout engine or native browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {validateUpdates,initOfficialUpdates} from '../web/official-updates.js';
const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const capture='2026-10-15T12:00:00Z';
const now=()=>Date.parse('2026-10-15T12:05:00Z');
const companyIDs={AAPL:320193,MSFT:789019,NVDA:1045810,AMZN:1018724,GOOGL:1652044,META:1326801};
const hash='a'.repeat(64);
function fixture(){
 const companies=Object.entries(companyIDs).map(([ticker,cik])=>({ticker,cik,filings:[{
  accession:'0000789019-26-000002',form:'8-K',filed:'2026-10-14',accepted_at:'2026-10-14T12:00:00Z',report_date:'2026-10-13',
  document_url:`https://www.sec.gov/Archives/edgar/data/${cik}/000078901926000002/report.htm`,
  filing_index_url:`https://www.sec.gov/Archives/edgar/data/${cik}/000078901926000002/0000789019-26-000002-index.html`
 }]}));
 const sources=Object.values(companyIDs).map(cik=>({file:`CIK${String(cik).padStart(10,'0')}.json`,url:`https://data.sec.gov/submissions/CIK${String(cik).padStart(10,'0')}.json`,retrieved_at:capture,raw_sha256:hash}));
 for(const year of [2025,2026])sources.push({file:`treasury-${year}.xml`,url:`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`,retrieved_at:capture,raw_sha256:hash});
 return {schema_version:1,captured_at:capture,feed_sha256:hash,companies,sources,treasury:{observations:[{date:'2026-10-14','3m':3.8,'2y':null,'5y':4,'10y':4.1,'30y':4.5}]}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function boot(t,fetcher,research=()=>null){
 const dom=new JSDOM(html,{url:'https://example.test/finscope/?date=2021-10-15',pretendToBeVisual:true});
 const requests=[];let callback;let time=now();
 const cleanup=initOfficialUpdates(dom.window.document,{fetch:async(url,options)=>{requests.push(url);return fetcher?fetcher(url,options):{ok:true,text:async()=>JSON.stringify(fixture())};},now:()=>time,
  research,setInterval:cb=>{callback=cb;return 1;},clearInterval:()=>{},timeoutMs:15});
 t.after(()=>{cleanup();dom.window.close();});
 const $=s=>dom.window.document.querySelector(s);
 const open=async()=>{$('#official-updates').open=true;$('#official-updates').dispatchEvent(new dom.window.Event('toggle'));await tick();await tick();};
 return {dom,$,requests,open,poll:async()=>{time+=300001;callback();await tick();await tick();}};
}
test('validates official feed without changing it',()=>{const feed=fixture(),before=structuredClone(feed);assert.equal(validateUpdates(feed,now()),feed);assert.deepEqual(feed,before);});
for(const mutation of ['unsafe-link','wrong-company','duplicate-company','bad-date','future-acceptance','bad-yield','missing-source','future-capture']){
 test(`rejects ${mutation}`,()=>{const feed=fixture(),r=feed.companies[0].filings[0];
  if(mutation==='unsafe-link')r.document_url='https://evil.test/report.htm';
  if(mutation==='wrong-company')feed.companies[0].cik=1;
  if(mutation==='duplicate-company')feed.companies[1]=feed.companies[0];
  if(mutation==='bad-date')r.filed='2026-02-30';
  if(mutation==='future-acceptance')r.accepted_at='2026-10-15T13:00:00Z';
  if(mutation==='bad-yield')feed.treasury.observations[0]['10y']='4.1';
  if(mutation==='missing-source')feed.sources.pop();
  if(mutation==='future-capture')feed.captured_at='2026-10-16T12:00:00Z';
  assert.throws(()=>validateUpdates(feed,now()));
 });
}
test('loads only on opening and keeps historical research controls and URL unchanged',async t=>{
 const ui=await boot(t);assert.equal(ui.requests.length,0);
 const url=ui.dom.window.location.href,selection=ui.$('#selection').innerHTML;
 await ui.open();assert.deepEqual(ui.requests,['./data/updates.json']);
 assert.match(ui.$('#official-updates').textContent,/Current monitoring/);
 assert.match(ui.$('#updates-content').textContent,/8-K/);
 assert.match(ui.$('#updates-content').textContent,/2026-10-14/);
 assert.match(ui.$('#updates-content').textContent,/Unavailable/);
 assert.equal(ui.$('#selection').innerHTML,selection);assert.equal(ui.dom.window.location.href,url);
 assert.ok(ui.$('#official-updates').classList.contains('no-print'));
});
test('failed checks preserve valid previous data and surface the failure',async t=>{
 let fail=false;const ui=await boot(t,async()=>{if(fail)throw Error('offline');return{ok:true,text:async()=>JSON.stringify(fixture())};});
 await ui.open();const content=ui.$('#updates-content').innerHTML;fail=true;
 ui.$('#updates-check').click();await tick();await tick();
 assert.equal(ui.$('#updates-content').innerHTML,content);assert.match(ui.$('#updates-status').textContent,/failed/i);
 assert.match(ui.$('#updates-status').textContent,/previous/i);assert.equal(ui.$('#updates-check').disabled,false);
});
test('polling runs only while open and visible',async t=>{
 const ui=await boot(t);await ui.poll();assert.equal(ui.requests.length,0);await ui.open();
 Object.defineProperty(ui.dom.window.document,'visibilityState',{value:'hidden',configurable:true});
 await ui.poll();assert.equal(ui.requests.length,1);
 Object.defineProperty(ui.dom.window.document,'visibilityState',{value:'visible',configurable:true});
 await ui.poll();assert.equal(ui.requests.length,2);
 ui.$('#official-updates').open=false;await ui.poll();assert.equal(ui.requests.length,2);
});
test('a stalled fetch times out and permits retry without fabricating data',async t=>{
 const ui=await boot(t,()=>new Promise(()=>{}));await ui.open();
 await new Promise(resolve=>setTimeout(resolve,35));
 assert.match(ui.$('#updates-status').textContent,/failed/i);assert.equal(ui.$('#updates-check').disabled,false);
 assert.equal(ui.$('#updates-content').textContent,'');
});
test('stale capture and stale rate observation are both clearly marked',async t=>{
 const feed=fixture();feed.captured_at='2026-10-14T12:00:00Z';feed.sources.forEach(s=>s.retrieved_at=feed.captured_at);feed.treasury.observations[0].date='2026-10-01';
 const ui=await boot(t,async()=>({ok:true,text:async()=>JSON.stringify(feed)}));await ui.open();
 assert.match(ui.$('#updates-status').textContent,/over 3 hours old/);assert.match(ui.$('#updates-content').textContent,/over 7 days old/);
});
test('invalid newer feed cannot replace a previously valid feed',async t=>{
 let bad=false;const ui=await boot(t,async()=>{const feed=fixture();if(bad)feed.companies=[];return{ok:true,text:async()=>JSON.stringify(feed)};});
 await ui.open();const before=ui.$('#updates-content').innerHTML;bad=true;ui.$('#updates-check').click();await tick();await tick();
 assert.equal(ui.$('#updates-content').innerHTML,before);assert.match(ui.$('#updates-status').textContent,/failed/i);
});

test('coverage can arrive after the feed without a second fetch or changing the historical selection',async t=>{
 let research=null;
 const data=JSON.parse(fs.readFileSync(new URL('../web/data/research.json',import.meta.url)));
 const feed=fixture();feed.companies[1].filings[0]={...feed.companies[1].filings[0],form:'10-K'};
 const ui=await boot(t,async()=>({ok:true,text:async()=>JSON.stringify(feed)}),()=>research);
 await ui.open();assert.match(ui.$('.updates-coverage').textContent,/unavailable/i);
 const url=ui.dom.window.location.href,selection=ui.$('#selection').innerHTML;
 research=data;ui.dom.window.document.dispatchEvent(new ui.dom.window.Event('finscope-research-ready'));
 assert.match(ui.$('.updates-coverage').textContent,new RegExp(data.as_of));
 assert.match(ui.$('.filing-coverage').textContent,/Not referenced/);
 const link=ui.$('.updates-coverage a');assert.equal(new URL(link.href).searchParams.get('date'),data.as_of);
 assert.equal(link.target,'_blank');assert.equal(new URL(link.href).searchParams.get('dataset'),data.dataset_sha256);
 assert.equal(ui.dom.window.location.href,url);assert.equal(ui.$('#selection').innerHTML,selection);assert.equal(ui.requests.length,1);
});
