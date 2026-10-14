import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildComparison, comparisonCSV} from '../web/comparison-export.js';
const bundle=JSON.parse(fs.readFileSync(new URL('../web/data/research.json',import.meta.url)));

test('comparison evidence keeps all six fiscal calendars, missing facts and original provenance',()=>{
 const p=buildComparison(bundle,bundle.as_of);
 assert.equal(p.format,'finscope-company-comparison');
 assert.equal(p.author,'FinScope by Leon Wang');
 assert.equal(p.dataset_sha256,bundle.dataset_sha256);
 assert.deepEqual(p.companies.map(c=>c.ticker),['AAPL','MSFT','NVDA','AMZN','GOOGL','META']);
 const n=p.companies.find(c=>c.ticker==='NVDA'), m=p.companies.find(c=>c.ticker==='MSFT');
 assert.equal(n.annual.period_end,bundle.snapshots.at(-1).companies.NVDA.at(-1).period_end);
 assert.equal(m.annual.period_end,bundle.snapshots.at(-1).companies.MSFT.at(-1).period_end);
 assert.ok(new Set(p.companies.map(c=>c.annual.period_end)).size>1);
 assert.equal(n.annual.metrics.capex,bundle.snapshots.at(-1).companies.NVDA.at(-1).metrics.capex);
 assert.deepEqual(n.annual.metrics.revenue,bundle.snapshots.at(-1).companies.NVDA.at(-1).metrics.revenue);
 assert.deepEqual(p.training,bundle.snapshots.at(-1).ai.training);
 assert.deepEqual(p.sources,bundle.sources);
 assert.equal('assumptions' in p,false);
 const link=new URL(p.reopen_url);assert.equal(link.searchParams.has('revenuePercent'),false);
 assert.equal(new URL(p.reopen_url).searchParams.get('view'),'compare');
 assert.equal(new URL(p.reopen_url).searchParams.get('dataset'),bundle.dataset_sha256);
});

test('historical comparison is cut off at the requested date for annual, YTD and model evidence',()=>{
 const p=buildComparison(bundle,'2025-06-02');
 assert.equal(p.requested_date,'2025-06-02');assert.ok(p.snapshot_date<='2025-06-02');
 for(const c of p.companies){
  assert.ok(c.annual.known_at<='2025-06-02');
  assert.equal(c.annual.period_end,bundle.snapshots.filter(s=>s.as_of<='2025-06-02').at(-1).companies[c.ticker].at(-1).period_end);
  for(const f of Object.values(c.annual.metrics).filter(Boolean)) assert.ok(f.filed<='2025-06-02');
  if(c.interim.checkpoint) assert.ok(c.interim.checkpoint.as_of<='2025-06-02');
 }
 assert.ok(p.training.latest_filed<='2025-06-02');
});

test('comparison export rejects impossible, absent and outside-coverage dates',()=>{
 for(const day of ['2026-02-30','','2030-01-01','1900-01-01',undefined]) assert.throws(()=>buildComparison(bundle,day),/date/i);
});

test('CSV keeps precision, units, negative values and zero distinct from missing',()=>{
 const p=buildComparison(bundle,bundle.as_of);
 p.companies=p.companies.slice(0,1);
 const c=p.companies[0];
 c.annual=structuredClone(c.annual);
 c.annual.ratios={operating_margin:0,cash_margin:-0.123456789,current_ratio:1.23456789,liabilities_assets:null};
 c.anomaly={percentile:0,imputed_features:['liabilities_assets']};
 c.interim={status:'unavailable',checkpoint:null};
 const lines=comparisonCSV(p).replace(/^\uFEFF/,'').trimEnd().split('\r\n');
 assert.equal(lines.length,2);
 const heads=lines[0].split(','),cells=lines[1].split(',');
 const v=Object.fromEntries(heads.map((key,i)=>[key,cells[i]]));
 assert.equal(v.operating_margin_decimal,'0');assert.equal(v.cash_margin_decimal,'-0.123456789');
 assert.equal(v.current_ratio_multiple,'1.23456789');assert.equal(v.liabilities_assets_decimal,'');
 assert.equal(v.anomaly_percentile_0_100,'0');assert.equal(v.model_imputed_features,'liabilities_assets');
 assert.equal(v.interim_status,'unavailable');assert.equal(v.interim_cash_margin_change_pp,'');
 assert.equal(v.dataset_sha256,p.dataset_sha256);assert.equal(v.requested_date,bundle.as_of);
 assert.ok(v.annual_filing_urls.startsWith('https://www.sec.gov/Archives/'));
 c.anomaly=null;
 const missingCells=comparisonCSV(p).replace(/^\uFEFF/,'').trimEnd().split('\r\n')[1].split(',');
 const missing=Object.fromEntries(heads.map((key,i)=>[key,missingCells[i]]));
 assert.equal(missing.model_status,'unavailable');assert.equal(missing.anomaly_percentile_0_100,'');assert.equal(missing.model_imputed_features,'unavailable');
});

test('CSV safely encodes commas, quotes, line breaks and spreadsheet formula-like names',()=>{
 const p=buildComparison(bundle,bundle.as_of);p.companies=p.companies.slice(0,1);
 p.companies[0].name='Example, "quoted"\nname';
 assert.ok(comparisonCSV(p).includes('"Example, ""quoted""\nname"'));
 for(const name of ['=1+2','+1+2','@SUM(A1)','-formula',' \t=1+2']){
  p.companies[0].name=name;
  assert.ok(comparisonCSV(p).includes("'"+name));
 }
});

test('every saved date can export a complete comparison with an explicit model status',()=>{
 for(const snapshot of bundle.snapshots){
  const p=buildComparison(bundle,snapshot.as_of);
  assert.equal(p.companies.length,6);
  const csv=comparisonCSV(p);
  assert.equal(csv.trimEnd().split('\r\n').length,7);
  for(const c of p.companies){
   assert.equal(c.annual.known_at<=p.requested_date,true);
   assert.equal(c.anomaly!==null,Boolean(snapshot.ai.scores[c.ticker]));
   if(c.anomaly) assert.ok(c.anomaly.period_end===c.annual.period_end);
  }
 }
});
