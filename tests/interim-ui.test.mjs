import test from 'node:test';
import assert from 'node:assert/strict';
import {selectInterim, interimSummary, buildBrief, briefMarkdown} from '../web/research-math.js';

const fact = (value, start, end) => ({value, start, end, filed:'2026-07-30', url:'https://www.sec.gov/Archives/example', tag:'Revenues'});
const current = {period_start:'2026-01-01',period_end:'2026-06-30',metrics:{revenue:fact(60,'2026-01-01','2026-06-30'), operating_cash_flow:fact(6,'2026-01-01','2026-06-30')}};
const prior = {period_start:'2025-01-01',period_end:'2025-06-30',metrics:{revenue:fact(40,'2025-01-01','2025-06-30'), operating_cash_flow:fact(5,'2025-01-01','2025-06-30')}};
const checkpoint = {as_of:'2026-07-30',annual_baseline_end:'2025-12-31',current,prior,changes:{revenue:{growth:.5,absolute:20},operating_cash_flow:{growth:.2,absolute:1}},current_cash_margin:.1,prior_cash_margin:.125,cash_margin_change_pp:-2.5};
const bundle = {interim:{EX:[checkpoint]},rates:[],sources:{},limitations:[],as_of:'2026-10-14'};
const annual = {period_end:'2025-12-31',metrics:{revenue:{value:100},operating_income:{value:20}},ratios:{}};
test('interim uses the requested date and excludes not-yet-filed information',()=>{
  assert.equal(selectInterim(bundle,'EX','2026-07-29',annual).status,'unavailable');
  assert.equal(selectInterim(bundle,'EX','2026-07-30',annual).checkpoint,checkpoint);
});
test('annual supersedes earlier quarters and mismatched fiscal baselines stay unavailable',()=>{
  assert.equal(selectInterim(bundle,'EX','2027-02-01',{period_end:'2026-12-31'}).status,'covered_by_annual');
  assert.equal(selectInterim(bundle,'EX','2026-08-01',{period_end:'2025-09-30'}).status,'unavailable');
});
test('cash margin decline prompts a specific question without a distress claim',()=>{
  const text=interimSummary({status:'available',checkpoint});
  assert.match(text,/fell 2.50 percentage points/);
  assert.match(text,/working-capital/);
  assert.doesNotMatch(text,/default probability/);
});
test('brief carries the matched comparison, sourced inputs and annual scenario basis',()=>{
  const snapshot={as_of:'2026-02-01',companies:{EX:[annual]},ai:{scores:{},training:{}}};
  const assumptions={revenuePercent:0,marginPoints:0,refinanceBillions:0,rateBps:0,collectionDays:0};
  const b=buildBrief(bundle,snapshot,{ticker:'EX'},assumptions,'2026-08-01');
  assert.equal(b.interim.checkpoint,checkpoint);
  assert.equal(b.scenario.stressedRevenue,100);
  const md=briefMarkdown(b);
  assert.match(md,/2026-01-01 to 2026-06-30/);
  assert.match(md,/2025-01-01 to 2025-06-30/);
  assert.match(md,/https:\/\/www.sec.gov\/Archives\/example/);
  assert.match(md,/annual baseline/);
  assert.match(md,/Current cash margin: 10%/);
  assert.match(md,/Operating-margin change:/);
  assert.match(md,/Operating margin = operating income \/ revenue/);
});
