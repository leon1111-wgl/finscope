import test from 'node:test';
import assert from 'node:assert/strict';
import {validDate, validateAssumptions, selectionFromBrief, selectionFromURL, researchQuery, approveSelection} from '../web/research-state.js';

const hash='a'.repeat(64), other='b'.repeat(64);
const bundle={as_of:'2026-10-14',dataset_sha256:hash,snapshots:[{as_of:'2018-02-01'}],companies:[{ticker:'MSFT'},{ticker:'NVDA'}]};
const assumptions={revenuePercent:-10,marginPoints:-2,refinanceBillions:10,rateBps:100,collectionDays:15};
const saved=()=>({author:'FinScope by Leon Wang',company:{ticker:'NVDA'},requested_date:'2026-08-27',snapshot_date:'2026-08-01',dataset_sha256:hash,calculation_version:'1',assumptions:{...assumptions},facts:{revenue:{value:999}},scenario:{profitProxy:123}});

test('calendar dates reject rollover and preserve valid leap days',()=>{
 for(const day of ['2026-02-30','2026-02-29','2026-13-01','2026-01-00','2026-1-01','',null]) assert.equal(validDate(day),false);
 assert.equal(validDate('2024-02-29'),true);
});
test('a saved brief restores only validated selection and assumptions',()=>{
 const r=selectionFromBrief(JSON.stringify(saved()),bundle);
 assert.deepEqual(r,{ticker:'NVDA',date:'2026-08-27',view:'brief',assumptions,dataset:hash,calculation:'1',versionStatus:'match'});
 assert.equal('facts' in r,false);assert.equal('scenario' in r,false);
 assert.deepEqual(approveSelection(r,bundle).assumptions,assumptions);
});
test('edited saved financial values never become restored inputs',()=>{
 const s=saved();s.facts={revenue:{value:-999999}};s.scenario={profitProxy:1e99};s.company.name='<img src=x>';
 assert.equal(selectionFromBrief(JSON.stringify(s),bundle).ticker,'NVDA');
 assert.equal(selectionFromBrief(JSON.stringify(s),bundle).facts,undefined);
});
test('a different data version requires explicit current-data approval',()=>{
 const s=saved();s.dataset_sha256=other;
 const selection=selectionFromBrief(JSON.stringify(s),bundle);
 assert.equal(selection.versionStatus,'changed');
 assert.throws(()=>approveSelection(selection,bundle),/version|data/i);
 assert.equal(approveSelection(selection,bundle,{allowCurrentData:true}).dataset,hash);
});
test('older links without a dataset identifier need an explicit choice',()=>{
 const r=selectionFromURL(new URLSearchParams('company=NVDA&date=2026-08-27'),bundle);
 assert.equal(r.versionStatus,'unversioned');
 assert.throws(()=>approveSelection(r,bundle),/version|data/i);
 assert.equal(approveSelection(r,bundle,{allowCurrentData:true}).ticker,'NVDA');
});
test('shared URL preserves fractional scenario values and dataset identity',()=>{
 const s={ticker:'NVDA',date:'2026-08-27',view:'stress',dataset:hash,assumptions:{...assumptions,marginPoints:-2.25,collectionDays:15.5}};
 const query=researchQuery(s,hash),r=selectionFromURL(new URLSearchParams(query),bundle);
 assert.ok(query.includes(`dataset=${hash}`));assert.deepEqual(r.assumptions,s.assumptions);assert.equal(r.date,s.date);assert.equal(r.view,'stress');
});
test('invalid URL parameters cannot silently become a baseline',()=>{
 for(const q of ['rateBps=','rateBps=Infinity','rateBps=0x10','rateBps=1001','rateBps=1&rateBps=2','company=NOPE','company=','date=2026-02-30','date=2010-01-01','date=2027-01-01','dataset=broken','view=unknown']) {
  assert.throws(()=>selectionFromURL(new URLSearchParams(q),bundle),undefined,q);
 }
});
test('a plain landing URL has no saved-state confirmation',()=>{
 assert.equal(selectionFromURL(new URLSearchParams('v=release'),bundle),null);
});
test('bad and oversized JSON files fail without importing partial state',()=>{
 for(const s of ['{broken','[]','null',' '.repeat(2000001),JSON.stringify({...saved(),author:'Other'})]) assert.throws(()=>selectionFromBrief(s,bundle));
});
test('missing, blank and out-of-range assumptions are rejected, but zero is real',()=>{
 for(const v of [null,'',undefined,'100',NaN,Infinity,1001]) assert.throws(()=>validateAssumptions({...assumptions,rateBps:v}));
 const zero=Object.fromEntries(Object.keys(assumptions).map(k=>[k,0]));assert.deepEqual(validateAssumptions(zero),zero);
});
test('unsupported formats and impossible saved temporal boundaries fail',()=>{
 for(const changed of [{brief_format:'other'},{brief_format:'finscope-company-review',brief_version:99},{requested_date:'2026-02-30'},{snapshot_date:'2026-09-01'},{dataset_sha256:''},{company:{ticker:'NOPE'}}]) assert.throws(()=>selectionFromBrief(JSON.stringify({...saved(),...changed}),bundle));
});
test('approval revalidates instead of trusting a modified preview object',()=>{
 const s=selectionFromBrief(JSON.stringify(saved()),bundle);s.assumptions.rateBps=1001;
 assert.throws(()=>approveSelection(s,bundle,{allowCurrentData:true}));
});
test('matching data cannot silently use a different calculation version',()=>{
 const s=saved();s.calculation_version='999';
 const r=selectionFromBrief(JSON.stringify(s),bundle);
 assert.equal(r.versionStatus,'changed');assert.throws(()=>approveSelection(r,bundle));
 assert.equal(approveSelection(r,bundle,{allowCurrentData:true}).calculation,'1');
});
test('older briefs with no calculation version require explicit recalculation',()=>{
 const s=saved();delete s.calculation_version;
 const r=selectionFromBrief(JSON.stringify(s),bundle);
 assert.equal(r.versionStatus,'unversioned');assert.throws(()=>approveSelection(r,bundle));
});
