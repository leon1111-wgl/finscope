// Intro, console routing, water line and theme: DOM checks only, no browser or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {waterlineSVG, waterlineYears, traceMarkup, renderWaterline} from '../web/waterline.js';
import {RESEARCH_KEYS, wantsConsole} from '../web/intro.js';
import {initThemeToggle} from '../web/theme.js';
const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const data=JSON.parse(fs.readFileSync(new URL('../web/data/research.json',import.meta.url)));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const fact=(value,tag)=>({value,tag,form:'10-K',filed:'2026-02-01',end:'2025-12-31',link_kind:'primary_document',url:'https://www.sec.gov/Archives/edgar/data/1/000000000126000001/a.htm'});
const year=(end,ni,ocf)=>({period_end:end,metrics:{net_income:ni===null?null:fact(ni,'NetIncomeLoss'),operating_cash_flow:ocf===null?null:fact(ocf,'NetCashProvidedByUsedInOperatingActivities')}});
const rows=[year('2023-12-31',5e9,8e9),year('2024-12-31',12e9,9e9),year('2025-12-31',-3e9,4e9),year('2026-12-31',null,6e9)];
let sequence=0;

test('water line hatches only the years where net income exceeds operating cash flow',()=>{
 assert.deepEqual(waterlineYears(rows).map(y=>y.above),[false,true,false,false]);
 const svg=waterlineSVG(rows,{width:600,ticker:'<b>EX</b>'});
 assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
 assert.equal(svg.match(/class="wl-gap"/g).length,1);
 assert.equal(svg.match(/class="wl-water"/g).length,4);
 assert.equal(svg.match(/class="wl-profit"/g).length,3,'a missing net income is not drawn as zero');
 assert.match(svg,/&lt;b&gt;EX/);assert.doesNotMatch(svg,/<b>/);
 assert.match(svg,/1 of 4 years/);
 assert.match(waterlineSVG([year('2025-12-31',null,null)]),/No matched annual history/);
});

test('trace lines keep official SEC links, mark missing facts and state the gap without a verdict',()=>{
 const flagged=traceMarkup(rows[1],'EX');
 assert.match(flagged,/Read 10-K/);assert.match(flagged,/Net<wbr>Income<wbr>Loss/);
 assert.match(flagged,/−\$3\.00B/);assert.match(flagged,/is-flag/);assert.match(flagged,/not a verdict/);
 const unsafe=traceMarkup({...rows[0],metrics:{net_income:{...fact(1,'X'),url:'https://evil.test/a.htm'},operating_cash_flow:null}},'EX');
 assert.match(unsafe,/Source unavailable/);assert.doesNotMatch(unsafe,/evil\.test/);
 assert.match(unsafe,/No matching standard USD fact/);assert.doesNotMatch(unsafe,/Cash minus profit/);
});

test('choosing a year traces that year and reports the selection',()=>{
 const dom=new JSDOM('<div id="w"></div>');const target=dom.window.document.getElementById('w');let picked=null;
 renderWaterline(target,rows,{ticker:'EX',onSelect:i=>{picked=i;}});
 assert.equal(target.querySelector('[aria-pressed="true"]').textContent,'2026');
 target.querySelector('button[data-wl-year="1"]').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
 assert.equal(picked,1);
 assert.equal(target.querySelector('[aria-pressed="true"]').dataset.wlYear,'1');
 assert.match(target.querySelector('.wl-trace').textContent,/2024-12-31/);
 assert.equal(dom.window.document.activeElement,target.querySelector('button[data-wl-year="1"]'));
 dom.window.close();
});

test('saved research links open the console; a bare address opens the intro',()=>{
 assert.equal(wantsConsole(new URL('https://example.test/finscope/')),false);
 assert.equal(wantsConsole(new URL('https://example.test/finscope/#workspace')),true);
 for(const key of RESEARCH_KEYS){
  assert.equal(wantsConsole(new URL(`https://example.test/finscope/?${key}=1`)),true,key);
  assert.ok(html.includes(`|${key}`)||html.includes(`(${key}`),`head script must know ${key}`);
 }
});

async function boot(t,query=''){
 const dom=new JSDOM(html,{url:'https://example.test/finscope/'+query});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,history:dom.window.history,location:dom.window.location,
  ResizeObserver:class{observe(){}},fetch:async url=>{assert.equal(url,'./data/research.json');return {ok:true,json:async()=>data};}});
 dom.window.scrollTo=()=>{};dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
 await import(`../web/research-app.js?ledgerTest=${++sequence}`);
 await tick();await tick();
 t.after(()=>dom.window.close());
 const $=s=>dom.window.document.querySelector(s);
 return {dom,$,mode:()=>dom.window.document.documentElement.dataset.mode};
}

test('the intro keeps a clean address until the reader opens the ledger',async t=>{
 const ui=await boot(t);
 assert.equal(ui.mode(),'intro');
 assert.equal(ui.dom.window.location.search,'');
 assert.equal(ui.$('#intro-tickers [aria-pressed="true"]').textContent,'NVDA');
 assert.match(ui.$('#intro-waterline .wl-trace').textContent,/NVDA/);
 ui.$('#intro-tickers [data-ticker="AAPL"]').click();
 assert.match(ui.$('#intro-waterline .wl-trace').textContent,/AAPL/);
 assert.equal(ui.$('#intro-open-company').dataset.enterTicker,'AAPL');
 assert.equal(ui.$('#company').value,'MSFT','the intro figure never changes the research selection');
 ui.$('.hero-actions [data-enter]').click();
 assert.equal(ui.mode(),'console');
 const url=new URL(ui.dom.window.location.href);
 assert.equal(url.searchParams.get('dataset'),data.dataset_sha256);assert.equal(url.hash,'#workspace');
 assert.equal(ui.dom.window.document.activeElement,ui.$('#console-title'));
});

test('an intro section link opens that section for the chosen company',async t=>{
 const ui=await boot(t);
 ui.$('#intro-tickers [data-ticker="AMZN"]').click();
 ui.$('#intro-open-company').click();
 assert.equal(ui.$('#company').value,'AMZN');
 assert.equal(ui.$('.steps [aria-current="page"]').dataset.page,'review');
 assert.match(ui.$('#profit-chart .wl-trace').textContent,/AMZN/);
 ui.$('[data-home]').click();
 assert.equal(ui.mode(),'intro');assert.equal(ui.dom.window.location.search,'');
 ui.$('.ix[data-section="compare"] button').click();
 assert.equal(ui.mode(),'console');
 assert.equal(ui.$('.steps [aria-current="page"]').dataset.page,'compare');
 assert.equal(new URL(ui.dom.window.location.href).searchParams.get('view'),'compare');
 assert.equal(ui.dom.window.document.body.hasAttribute('aria-current'),false);
});

test('a shared reopen link goes straight to the console',async t=>{
 const ui=await boot(t,`?company=NVDA&date=${data.as_of}&view=compare&dataset=${data.dataset_sha256}&calculation=1#workspace`);
 assert.equal(ui.mode(),'console');
 assert.equal(ui.$('#company').value,'NVDA');
 assert.equal(ui.$('.steps [aria-current="page"]').dataset.page,'compare');
});

test('theme cycles system, light and dark and remembers the choice',()=>{
 const dom=new JSDOM('<button id="t"><span data-theme-label></span></button>',{url:'https://example.test/'});
 const doc=dom.window.document,button=doc.getElementById('t');
 initThemeToggle(doc,button,dom.window.localStorage);
 assert.equal(doc.documentElement.dataset.theme,undefined);assert.match(button.getAttribute('aria-label'),/System\. Switch to Light/);
 button.click();assert.equal(doc.documentElement.dataset.theme,'light');
 button.click();assert.equal(doc.documentElement.dataset.theme,'dark');assert.equal(dom.window.localStorage.getItem('finscope.theme'),'dark');
 button.click();assert.equal(doc.documentElement.dataset.theme,undefined);
 initThemeToggle(doc,button,{getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}});
 assert.equal(button.dataset.choice,'system');
 dom.window.close();
});

test('a new year updates the same live trace region and keeps focus on the pressed year',()=>{
 const dom=new JSDOM('<div id="w"></div>');const target=dom.window.document.getElementById('w');
 renderWaterline(target,rows,{ticker:'EX'});
 const trace=target.querySelector('.wl-trace'),button=target.querySelector('button[data-wl-year="0"]');
 button.focus();button.click();
 assert.equal(target.querySelector('.wl-trace'),trace,'screen readers announce changes inside an existing live region');
 assert.equal(target.querySelector('button[data-wl-year="0"]'),button);
 assert.equal(dom.window.document.activeElement,button);
 assert.match(trace.textContent,/2023-12-31/);
 dom.window.close();
});

test('axis labels stay distinct for small companies',()=>{
 const svg=waterlineSVG([year('2024-12-31',2e7,3e7),year('2025-12-31',4e7,-1e7)],{width:600});
 const labels=[...svg.matchAll(/class="wl-axis"[^>]*>([^<]+)</g)].map(m=>m[1]);
 assert.equal(new Set(labels).size,labels.length,labels.join(' '));
 assert.ok(labels.includes('$0'));
});

test('the head script picks the same mode as the shell before first paint',()=>{
 for(const [query,mode] of [['','intro'],['?company','console'],['?company=NVDA','console'],['?view=brief&x=1','console'],['?companyX=1','intro'],['#workspace','console']]){
  const dom=new JSDOM(html,{url:'https://example.test/finscope/'+query,runScripts:'dangerously'});
  assert.equal(dom.window.document.documentElement.dataset.mode??'intro',mode,query);
  assert.equal(wantsConsole(new URL('https://example.test/finscope/'+query))?'console':'intro',mode,query);
  dom.window.close();
 }
});

test('Back to the intro moves focus to its heading',async t=>{
 const ui=await boot(t);
 ui.$('.hero-actions [data-enter]').click();
 ui.dom.window.history.replaceState(null,'','/finscope/');
 ui.dom.window.dispatchEvent(new ui.dom.window.PopStateEvent('popstate'));
 assert.equal(ui.mode(),'intro');
 assert.equal(ui.dom.window.document.activeElement,ui.$('#intro-title'));
});

test('leaving and reopening the ledger keeps a shared link that still awaits a decision',async t=>{
 const ui=await boot(t,`?company=NVDA&date=${data.as_of}&view=brief&dataset=${'0'.repeat(64)}&calculation=1#workspace`);
 assert.ok(ui.$('#restore-apply'));
 ui.$('[data-home]').click();assert.equal(ui.mode(),'intro');
 ui.$('.hero-actions [data-enter]').click();
 assert.equal(new URL(ui.dom.window.location.href).searchParams.get('company'),'NVDA');
 assert.ok(ui.$('#restore-apply'),'the saved-input decision is still offered');
});

test('a manual theme also paints the browser chrome colour',()=>{
 const dom=new JSDOM(html,{url:'https://example.test/finscope/'});
 const doc=dom.window.document,metas=[...doc.querySelectorAll('meta[name="theme-color"]')];
 initThemeToggle(doc,doc.getElementById('theme-toggle'),dom.window.localStorage);
 assert.deepEqual(metas.map(m=>m.content),['#f5f0e3','#0e1612']);
 doc.getElementById('theme-toggle').click();assert.deepEqual(metas.map(m=>m.content),['#f5f0e3','#f5f0e3']);
 doc.getElementById('theme-toggle').click();assert.deepEqual(metas.map(m=>m.content),['#0e1612','#0e1612']);
 dom.window.close();
});

test('narrowing the workspace reveals the active tab without changing the research',async t=>{
 const ui=await boot(t,`?company=NVDA&date=${data.as_of}&view=brief&dataset=${data.dataset_sha256}&calculation=1&rateBps=125`);
 const tabs=ui.$('.steps'), current=tabs.querySelector('[aria-current="page"]');
 const content=ui.$('#content').innerHTML, url=ui.dom.window.location.href;
 Object.defineProperties(tabs,{clientWidth:{value:360,configurable:true},scrollWidth:{value:1000}});
 Object.defineProperties(current,{offsetLeft:{value:700},offsetWidth:{value:120}});
 tabs.scrollLeft=0;
 ui.dom.window.dispatchEvent(new ui.dom.window.Event('resize'));
 assert.ok(tabs.scrollLeft<=700 && tabs.scrollLeft+360>=820,'active tab is fully visible after narrowing');
 assert.equal(ui.$('#content').innerHTML,content,'resize does not recalculate or replace the research');
 assert.equal(ui.dom.window.location.href,url);
 tabs.scrollLeft=600;
 ui.dom.window.dispatchEvent(new ui.dom.window.Event('resize'));
 assert.equal(tabs.scrollLeft,600,'a fully visible selection does not jump');
 Object.defineProperty(tabs,'clientWidth',{value:0,configurable:true});
 tabs.scrollLeft=0;
 ui.dom.window.dispatchEvent(new ui.dom.window.Event('resize'));
 assert.equal(tabs.scrollLeft,0,'hidden navigation does not move');
});
