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
 assert.match(flagged,/Read 10-K/);assert.match(flagged,/NetIncomeLoss/);
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
