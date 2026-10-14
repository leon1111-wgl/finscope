import test from 'node:test';
import assert from 'node:assert/strict';
import {stressCompany, bondScenario, selectSnapshot, buildBrief, briefMarkdown} from '../web/research-math.js';

const row={period_end:'2025-12-31',known_at:'2026-02-01',metrics:{
  revenue:{value:1000,url:'https://www.sec.gov/example',filed:'2026-02-01',end:'2025-12-31',unit:'USD',tag:'Revenues'},
  operating_income:{value:200},cash:{value:100},net_income:{value:100},operating_cash_flow:{value:150}
},ratios:{operating_margin:.2,cash_margin:.15,current_ratio:2}};
const inputs={revenuePercent:0,marginPoints:0,refinanceBillions:0,rateBps:0,collectionDays:0};
test('zero shock reproduces observed operating income',()=>{
  assert.equal(stressCompany(row,inputs).operatingIncome,200);
  assert.equal(stressCompany(row,inputs).cashTiedUp,0);
});
test('basis points and margin percentage points have distinct units',()=>{
  const r=stressCompany(row,{...inputs,revenuePercent:-10,marginPoints:-2,refinanceBillions:1,rateBps:100,collectionDays:10});
  assert.ok(Math.abs(r.operatingIncome-162)<1e-10);
  assert.equal(r.extraInterest,10000000);
  assert.equal(r.cashTiedUp,900/365*10);
  assert.equal(r.profitProxy,162-10000000);
});
test('missing or nonfinite inputs cannot become fabricated output',()=>{
  assert.throws(()=>stressCompany(row,{...inputs,rateBps:Infinity}));
  assert.throws(()=>stressCompany({...row,metrics:{...row.metrics,operating_income:null}},inputs));
  assert.throws(()=>stressCompany(row,{...inputs,revenuePercent:-101}));
});
test('zero coupon PV and coupon par independently match finance identities',()=>{
  const zero=bondScenario({face:100,couponPercent:0,years:2,yieldPercent:4,shockBps:100});
  assert.ok(Math.abs(zero.price-100/(1.02**4))<1e-10);
  assert.ok(Math.abs(zero.shockedPrice-100/(1.025**4))<1e-10);
  const par=bondScenario({face:100,couponPercent:4,years:10,yieldPercent:4,shockBps:0});
  assert.ok(Math.abs(par.price-100)<1e-10);
  assert.equal(par.changePercent,0);
  const up=bondScenario({face:100,couponPercent:4,years:10,yieldPercent:4,shockBps:1});
  assert.ok(up.changePercent<0);
  assert.ok(Math.abs(up.changePercent/100 + par.modifiedDuration*.0001)<.000001);
});
test('selects only snapshots known by requested date',()=>{
  const snaps=[{as_of:'2024-01-01'},{as_of:'2025-01-01'}];
  assert.equal(selectSnapshot(snaps,'2024-06-01'),snaps[0]);
  assert.equal(selectSnapshot(snaps,'2023-01-01'),null);
});
test('brief preserves evidence, inputs, dataset and selection without stale future snapshot',()=>{
  const bundle={dataset_sha256:'abc',generated_at:'2026-10-15',limitations:['Annual only'],sources:{},rates:[]};
  const snapshot={as_of:'2026-02-01',companies:{EX:[row]},ai:{scores:{},training:{samples:0}}};
  const brief=buildBrief(bundle,snapshot,{ticker:'EX',name:'Example'},inputs,'2026-03-01');
  assert.equal(brief.requested_date,'2026-03-01');
  assert.equal(brief.snapshot_date,'2026-02-01');
  assert.equal(brief.dataset_sha256,'abc');
  assert.deepEqual(brief.assumptions,inputs);
  assert.match(briefMarkdown(brief),/https:\/\/www.sec.gov\/example/);
  assert.match(briefMarkdown(brief),/operating_cash_flow/);
  assert.match(briefMarkdown(brief),/Annual only/);
});
test('brief refuses an information date before its financial snapshot',()=>{
  const b={as_of:'2026-03-01',rates:[]};
  const s={as_of:'2026-02-01',companies:{EX:[row]},ai:{scores:{},training:{}}};
  assert.throws(()=>buildBrief(b,s,{ticker:'EX'},inputs,'2017-01-01'),/date/i);
});
test('brief includes prior sourced denominators and formulas for growth and accruals',()=>{
  const prior={...row,period_end:'2024-12-31',metrics:{revenue:{value:800,url:'https://www.sec.gov/prior',tag:'Revenues'},assets:{value:2000,url:'https://www.sec.gov/prior',tag:'Assets'}}};
  const b={rates:[],sources:{},limitations:[]};
  const s={as_of:'2026-02-01',companies:{EX:[prior,row]},ai:{scores:{},training:{}}};
  const brief=buildBrief(b,s,{ticker:'EX'},inputs,'2026-03-01');
  assert.equal(brief.prior_annual_period.metrics.revenue.value,800);
  assert.equal(brief.prior_annual_period.metrics.assets.value,2000);
  assert.match(brief.ratio_formulas.accruals,/previous-year total assets/);
  assert.match(briefMarkdown(brief),/https:\/\/www.sec.gov\/prior/);
});
test('brief refuses a nonexistent calendar day instead of normalizing it',()=>{
  const b={as_of:'2026-03-01',rates:[]};
  const s={as_of:'2026-02-01',companies:{EX:[row]},ai:{scores:{},training:{}}};
  assert.throws(()=>buildBrief(b,s,{ticker:'EX'},inputs,'2026-02-30'),/date/i);
});
