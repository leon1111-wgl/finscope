import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildBrief, briefMarkdown, selectSnapshot} from '../web/research-math.js';
import {selectionFromBrief, selectionFromURL, approveSelection} from '../web/research-state.js';
const bundle=JSON.parse(fs.readFileSync(new URL('../web/data/research.json',import.meta.url)));
const inputs={revenuePercent:-10,marginPoints:-2.25,refinanceBillions:10,rateBps:100,collectionDays:15.5};
const fields=['company','requested_date','snapshot_date','annual_period','facts','ratios','interim','anomaly','training','assumptions','scenario','treasury','dataset_sha256'];

test('every saved company/date brief and reopening link reproduces sourced inputs and results',()=>{
 const cases=bundle.snapshots.flatMap(snapshot=>bundle.companies.map(company=>({snapshot,company,date:snapshot.as_of})));
 cases.push(...bundle.companies.map(company=>({snapshot:bundle.snapshots.at(-1),company,date:bundle.as_of})));
 for(const {snapshot,company,date} of cases){
  const original=buildBrief(bundle,snapshot,company,inputs,date);
  const file=selectionFromBrief(JSON.stringify(original),bundle);
  const link=selectionFromURL(new URL(original.reopen_url).searchParams,bundle);
  for(const selection of [file,link]) {
   const checked=approveSelection(selection,bundle);
   const restored=buildBrief(bundle,selectSnapshot(bundle.snapshots,checked.date),company,checked.assumptions,checked.date);
   for(const key of fields) assert.deepEqual(restored[key],original[key],`${company.ticker} ${date} ${key}`);
  }
  assert.ok(briefMarkdown(original).includes(original.reopen_url));
 }
 assert.ok(cases.length>=300);
});
test('the previous exported format can be reopened after a deliberate current-version choice',()=>{
 const original=buildBrief(bundle,bundle.snapshots.at(-1),bundle.companies[0],inputs,bundle.as_of);
 for(const key of ['brief_format','brief_version','calculation_version','reopen_url']) delete original[key];
 const selection=selectionFromBrief(JSON.stringify(original),bundle);
 assert.equal(selection.versionStatus,'unversioned');assert.throws(()=>approveSelection(selection,bundle));
 const restored=approveSelection(selection,bundle,{allowCurrentData:true});
 assert.deepEqual(restored.assumptions,inputs);
});
