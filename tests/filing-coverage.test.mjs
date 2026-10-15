import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as coverage from '../web/filing-coverage.js';
const data=JSON.parse(fs.readFileSync(new URL('../web/data/research.json',import.meta.url)));
const fact={accession:'0000000001-26-000001',form:'10-K',filed:'2026-07-29',tag:'Revenue',start:'2025-07-01',end:'2026-06-30',value:0,unit:'USD'};
const filing={accession:fact.accession,form:fact.form,filed:fact.filed};
function bundle(){return {data_kind:'real_official_financial_evidence',as_of:'2026-10-15',generated_at:'2026-10-15T04:00:00Z',dataset_sha256:'a'.repeat(64),companies:[{ticker:'MSFT'}],snapshots:[{as_of:'2026-10-15',companies:{MSFT:[{period_end:'2026-06-30',metrics:{revenue:fact}}]}}],interim:{MSFT:[]}};}
test('a matching source means referenced facts, not full report analysis; counts zero and deduplicates',()=>{
 const b=bundle();b.snapshots[0].companies.MSFT.push(structuredClone(b.snapshots[0].companies.MSFT[0]));const before=structuredClone(b);
 const c=coverage.publishedCoverage(b,'MSFT');assert.equal(c.status,'available');assert.equal(c.date,'2026-10-15');
 assert.equal(coverage.filingCoverage(filing,c).status,'referenced');assert.equal(coverage.filingCoverage(filing,c).count,1);assert.deepEqual(b,before);
});
test('matching requires the company, accession, form and filed date; absent is not claimed missing ingestion',()=>{
 const c=coverage.publishedCoverage(bundle(),'MSFT');
 for(const f of [{...filing,form:'10-K/A'},{...filing,filed:'2026-07-30'},{...filing,accession:'0000000001-26-000002'}])assert.equal(coverage.filingCoverage(f,c).status,'not_referenced');
 assert.equal(coverage.filingCoverage(filing,coverage.publishedCoverage(bundle(),'NVDA')).status,'unavailable');
});
test('new filings and event reports remain separate from incorporated financial facts',()=>{
 const c=coverage.publishedCoverage(bundle(),'MSFT');
 assert.equal(coverage.filingCoverage({...filing,filed:'2026-10-16'},c).status,'after_cutoff');
 assert.equal(coverage.filingCoverage({...filing,form:'8-K'},c).status,'manual');
 assert.equal(coverage.filingCoverage({...filing,form:'8-K/A'},null).status,'manual');
});
test('missing research, invalid dates and incomplete company coverage do not become false absence',()=>{
 for(const b of [null,{}, {...bundle(),as_of:'2026-02-30'},{...bundle(),dataset_sha256:null},{...bundle(),interim:{}}])assert.equal(coverage.filingCoverage(filing,coverage.publishedCoverage(b,'MSFT')).status,'unavailable');
});
test('future-dated and missing-value facts cannot establish coverage',()=>{
 const b=bundle();b.snapshots[0].companies.MSFT[0].metrics={nullFact:{...fact,value:null},future:{...fact,filed:'2026-10-16',value:12}};
 const c=coverage.publishedCoverage(b,'MSFT');assert.equal(coverage.filingCoverage(filing,c).status,'not_referenced');
 assert.equal(coverage.filingCoverage({...filing,filed:'2026-10-16'},c).status,'after_cutoff');
});
test('latest eligible interim evidence is included but a superseded checkpoint is not',()=>{
 const b=bundle();const q={...fact,accession:'0000000001-26-000003',form:'10-Q',filed:'2026-10-14',end:'2026-09-30'};
 b.interim.MSFT=[{as_of:'2026-10-15',annual_baseline_end:'2026-06-30',current:{period_end:'2026-09-30',metrics:{revenue:q}},prior:{metrics:{revenue:fact}}}];
 assert.equal(coverage.filingCoverage(q,coverage.publishedCoverage(b,'MSFT')).status,'referenced');
 b.interim.MSFT[0].current.period_end='2026-03-31';
 assert.equal(coverage.filingCoverage(q,coverage.publishedCoverage(b,'MSFT')).status,'not_referenced');
});
test('a current sourced annual fact in the real bundle can be traced without freezing an accession across data refreshes',()=>{
 const f=Object.values(data.snapshots.at(-1).companies.MSFT.at(-1).metrics).find(f=>Number.isFinite(f?.value));
 assert.ok(f);assert.equal(coverage.filingCoverage(f,coverage.publishedCoverage(data,'MSFT')).status,'referenced');
});
