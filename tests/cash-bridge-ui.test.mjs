import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeSteps, bridgeRows, bridgeMarkdown, bridgeMarkup, cashBridgeSVG} from '../web/cash-bridge.js';

const source={value:20,start:'2025-01-01',end:'2025-06-30',filed:'2025-08-01',accession:'same',tag:'DepreciationDepletionAndAmortization',url:'https://www.sec.gov/example'};
const component=(key,effect)=>({key,label:key,sign:1,effect,fact:effect===null?null:source,explanation:'A disclosed adjustment.'});
const bridge={status:'available',net_income:100,operating_cash_flow:130,selected_adjustments:20,residual:10,missing_components:[],components:[component('depreciation',20),component('share_based_compensation',10),component('receivables',-30),component('inventory',5),component('payables',15)]};
const current={period_start:'2025-01-01',period_end:'2025-06-30',cash_bridge:bridge};
const prior={...current,period_start:'2024-01-01',period_end:'2024-06-30',cash_bridge:{...bridge,net_income:80,operating_cash_flow:110}};

test('waterfall reaches the sourced total and preserves signed steps',()=>{
 const s=bridgeSteps(current);assert.equal(s[0].to,100);assert.equal(s[3].from,130);assert.equal(s[3].to,100);
 assert.equal(s.at(-2).to,130);assert.equal(s.at(-1).value,130);
});
test('unmapped components remain unavailable in table and are absent from chart arithmetic',()=>{
 const p={...current,cash_bridge:{...bridge,components:[component('depreciation',null)],selected_adjustments:0,residual:30,missing_components:['depreciation']}};
 assert.equal(bridgeRows(p,null)[1].current,null);
 assert.equal(bridgeSteps(p).length,3);
 assert.match(bridgeMarkup(p,null),/Unavailable/);
 assert.match(bridgeMarkup(p,null),/not zero/);
});
test('Markdown contains both signed comparisons, residual, raw source and sign formula',()=>{
 const md=bridgeMarkdown(current,prior);
 assert.match(md,/2025-01-01 to 2025-06-30/);assert.match(md,/2024-01-01 to 2024-06-30/);
 assert.match(md,/Net income \| 100 \| 80 \| 20/);
 assert.match(md,/Other and unmapped adjustments/);assert.match(md,/https:\/\/www.sec.gov\/example/);
 assert.match(md,/raw value × sign/);
});
test('chart handles loss, zero and escaped labels without invalid coordinates',()=>{
 for(const income of [-100,0,100]){
  const p={...current,cash_bridge:{...bridge,net_income:income,operating_cash_flow:0,selected_adjustments:0,residual:-income,components:[]}};
  const svg=cashBridgeSVG(p,'<img onerror=x>');
  assert.doesNotMatch(svg,/NaN|Infinity|<img/);assert.match(svg,/&lt;img/);assert.match(svg,/Leon Wang/);
 }
});
test('unavailable bridge never produces a made-up chart or delta',()=>{
 const p={...current,cash_bridge:{status:'unavailable',reason:'Source mismatch'}};
 assert.equal(cashBridgeSVG(p,'EX'),'');assert.deepEqual(bridgeRows(p,prior),[]);
 assert.match(bridgeMarkup(p,prior),/Source mismatch/);
});
