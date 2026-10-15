// Read-only source matching against the latest published research, never the user's draft.
import {validDate} from './research-state.js';
import {selectSnapshot,selectInterim} from './research-math.js';
const financialForms=new Set(['10-K','10-K/A','10-Q','10-Q/A']);
const sourceKey=f=>JSON.stringify([f.accession,f.form,f.filed]);

export function publishedCoverage(bundle,ticker){
 const unavailable={status:'unavailable'};
 try{
  if(bundle?.data_kind!=='real_official_financial_evidence'||!validDate(bundle.as_of)||
   !/^[a-f0-9]{64}$/.test(bundle.dataset_sha256)||!Number.isFinite(Date.parse(bundle.generated_at))||
   !bundle.companies?.some(c=>c.ticker===ticker)||!Array.isArray(bundle.interim?.[ticker]))return unavailable;
  const snapshot=selectSnapshot(bundle.snapshots,bundle.as_of),rows=snapshot?.companies?.[ticker];
  if(!validDate(snapshot?.as_of)||!Array.isArray(rows)||!rows.length||rows.some(r=>!r.metrics||!validDate(r.period_end)))return unavailable;
  const references=new Map();
  const visit=value=>{
   if(!value||typeof value!=='object')return;
   if(typeof value.accession==='string'&&/^\d{10}-\d{2}-\d{6}$/.test(value.accession)&&financialForms.has(value.form)&&
    validDate(value.filed)&&value.filed<=bundle.as_of&&validDate(value.end)&&value.end<=bundle.as_of&&
    typeof value.tag==='string'&&Number.isFinite(value.value)){
    const key=sourceKey(value),facts=references.get(key)||new Set();
    facts.add(JSON.stringify([value.tag,value.start||null,value.end,value.unit||null,value.value]));references.set(key,facts);
   }
   for(const child of Object.values(value))if(child&&typeof child==='object')visit(child);
  };
  visit(rows);
  visit(selectInterim(bundle,ticker,bundle.as_of,rows.at(-1)).checkpoint);
  return {status:'available',date:bundle.as_of,snapshotDate:snapshot.as_of,generatedAt:bundle.generated_at,dataset:bundle.dataset_sha256,references};
 }catch{return unavailable;}
}

export function filingCoverage(filing,coverage){
 if(['8-K','8-K/A'].includes(filing.form))return {status:'manual',label:'Read event report',detail:'Event reports and exhibits need manual reading.'};
 if(coverage?.status!=='available')return {status:'unavailable',label:'Coverage unavailable',detail:'Research data is not ready for comparison. No coverage conclusion is available.'};
 if(filing.filed>coverage.date)return {status:'after_cutoff',label:'After research cutoff',detail:'This filing is newer than the published research date. Read it before using the older analysis.'};
 const count=coverage.references.get(sourceKey(filing))?.size||0;
 if(count)return {status:'referenced',count,label:'Financial facts referenced',detail:`${count} distinct sourced fact${count===1?'':'s'}. Read the full filing for context.`};
 return {status:'not_referenced',label:'Not referenced',detail:'No selected facts matched. This may reflect an older report or unsupported metrics; it does not establish a failed refresh.'};
}
