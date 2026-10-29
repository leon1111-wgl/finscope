import test from 'node:test';
import assert from 'node:assert/strict';
import {loadResearchEvidence} from '../web/research-load.js';
const evidence = {data_kind:'real_official_financial_evidence',dataset_sha256:'a'.repeat(64)};
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));

for (const stalledStage of ['headers','body']) {
 test(`stalled evidence ${stalledStage} times out and aborts the request`,async()=>{
  let signal;
  const pending=loadResearchEvidence({timeoutMs:15,fetch:async(_url,options)=>{
   signal=options?.signal;
   return stalledStage==='headers'?new Promise(()=>{}):{ok:true,json:()=>new Promise(()=>{})};
  }}).then(()=>null,error=>error);
  const outcome=await Promise.race([pending,delay(150).then(()=>null)]);
  assert.match(outcome?.message||'',/timed out/i,'a stalled response must produce a recovery error');
  assert.equal(signal.aborted,true);
 });
}

test('late completion of an expired attempt cannot replace a new result',async()=>{
 let finish;
 const first=loadResearchEvidence({timeoutMs:15,fetch:()=>new Promise(resolve=>{finish=resolve;})}).then(()=>null,error=>error);
 const failure=await Promise.race([first,delay(150).then(()=>null)]);
 assert.match(failure?.message||'',/timed out/i);
 const recovered=await loadResearchEvidence({fetch:async()=>({ok:true,json:async()=>evidence})});
 finish({ok:true,json:async()=>({...evidence,dataset_sha256:'b'.repeat(64)})});
 await delay(1);
 assert.equal((await first),failure);
 assert.equal(recovered.dataset_sha256,'a'.repeat(64));
});

test('network, HTTP, malformed JSON and unexpected payloads reject without fabricated data',async()=>{
 for(const fetcher of [async()=>{throw new Error('offline');},async()=>({ok:false,status:503}),async()=>({ok:true,json:async()=>{throw new SyntaxError('broken JSON');}}),async()=>({ok:true,json:async()=>({data_kind:'synthetic'})})]){
  await assert.rejects(loadResearchEvidence({fetch:fetcher}));
 }
});
