// Isolated current monitoring. This module never reads or writes research state.
import {escapeHTML as esc} from './workbench.js';
const COMPANIES={AAPL:320193,MSFT:789019,NVDA:1045810,AMZN:1018724,GOOGL:1652044,META:1326801};
const TENORS=['3m','2y','5y','10y','30y'];
const DAY=86400000,INTERVAL=300000;
const TREASURY='https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=';
const HASH=/^[a-f0-9]{64}$/;
function requireValue(value){if(!value)throw new Error('Official update data failed validation.');}
function dateValue(value){
 requireValue(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value));
 const ms=Date.parse(value+'T00:00:00Z');requireValue(Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value);return ms;
}
function timestamp(value){
 requireValue(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value));
 dateValue(value.slice(0,10));const ms=Date.parse(value);requireValue(Number.isFinite(ms)&&new Date(ms).toISOString().replace('.000Z','Z')===value);return ms;
}
export function validateUpdates(data,now=Date.now()){
 requireValue(data?.schema_version===1&&HASH.test(data.feed_sha256));
 const captured=timestamp(data.captured_at),cutoff=dateValue(data.captured_at.slice(0,10));
 requireValue(captured<=now+300000);
 requireValue(Array.isArray(data.companies)&&data.companies.length===6);
 const seen=new Set();
 for(const c of data.companies){
  requireValue(Object.hasOwn(COMPANIES,c.ticker)&&c.cik===COMPANIES[c.ticker]&&!seen.has(c.ticker));seen.add(c.ticker);
  requireValue(Array.isArray(c.filings)&&c.filings.length<=20);const accessions=new Set();let previous='~';
  for(const r of c.filings){
   requireValue(typeof r.accession==='string'&&/^\d{10}-\d{2}-\d{6}$/.test(r.accession)&&!accessions.has(r.accession));accessions.add(r.accession);
   requireValue(['10-K','10-K/A','10-Q','10-Q/A','8-K','8-K/A'].includes(r.form));
   const filed=dateValue(r.filed);requireValue(filed<=cutoff&&filed>=cutoff-120*DAY&&r.filed<=previous);previous=r.filed;
   requireValue(r.accepted_at===null||timestamp(r.accepted_at)<=captured);
   requireValue(r.report_date===null||dateValue(r.report_date)<=filed);
   const base=`https://www.sec.gov/Archives/edgar/data/${c.cik}/${r.accession.replaceAll('-','')}/`;
   requireValue(r.filing_index_url===base+r.accession+'-index.html');
   requireValue(r.document_url===null||(typeof r.document_url==='string'&&r.document_url.startsWith(base)&&/^[A-Za-z0-9_][A-Za-z0-9_.-]*\.html?$/.test(r.document_url.slice(base.length))));
  }
 }
 const rates=data.treasury?.observations;requireValue(Array.isArray(rates)&&rates.length>0&&rates.length<=60);
 let previous='';
 for(const r of rates){requireValue(dateValue(r.date)<=cutoff&&r.date>previous);previous=r.date;
  for(const tenor of TENORS)requireValue(r[tenor]===null||(typeof r[tenor]==='number'&&Number.isFinite(r[tenor])&&r[tenor]>=-10&&r[tenor]<=100));
 }
 requireValue(rates.some(r=>r['10y']!==null));
 const year=Number(data.captured_at.slice(0,4));
 const expected=new Map(Object.values(COMPANIES).map(cik=>{const file=`CIK${String(cik).padStart(10,'0')}.json`;return[file,'https://data.sec.gov/submissions/'+file];}));
 for(const y of [year-1,year])expected.set(`treasury-${y}.xml`,TREASURY+y);
 requireValue(Array.isArray(data.sources)&&data.sources.length===expected.size);
 for(const s of data.sources){requireValue(expected.get(s.file)===s.url&&HASH.test(s.raw_sha256)&&timestamp(s.retrieved_at)<=captured);expected.delete(s.file);}
 requireValue(expected.size===0);return data;
}
const utc=value=>value.replace('T',' ').replace('Z',' UTC');
const yieldText=value=>value===null?'Unavailable':value.toFixed(2)+'%';
function renderFeed(feed,ticker,now){
 const company=feed.companies.find(c=>c.ticker===ticker),rates=feed.treasury.observations,latest=rates.at(-1);
 const oldRates=now-dateValue(latest.date)>7*DAY;
 const link=(url,label)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
 const table=company.filings.length?`<div class="table-wrap updates-scroll" tabindex="0" role="region" aria-label="Recent filing announcements"><table><thead><tr><th scope="col">Filed</th><th scope="col">Form</th><th scope="col">Report date</th><th scope="col">Original evidence</th></tr></thead><tbody>${company.filings.map(r=>`<tr><td>${esc(r.filed)}<small>Accepted: ${r.accepted_at?esc(utc(r.accepted_at)):'Unavailable'}</small></td><td>${esc(r.form)}</td><td>${esc(r.report_date||'Unavailable')}</td><td>${link(r.document_url||r.filing_index_url,r.document_url?'Read filing':'Filing index')}<small>${esc(r.accession)} · ${link(r.filing_index_url,'Index')}</small></td></tr>`).join('')}</tbody></table></div>`:'<p>No supported filings in this 120-day window. This is not a complete disclosure history.</p>';
 return `<section aria-label="Recent company disclosures"><h3>${esc(ticker)} · Recent disclosures</h3><p>Up to 20 filings in the last 120 days. 10-K: annual report. 10-Q: quarterly report. 8-K: current report covering a range of company events. /A marks an amendment.</p>${table}</section>
 <section aria-label="Daily Treasury rates"><h3>US Treasury · Daily par yields</h3><p>Observation date: <strong>${esc(latest.date)}</strong>. Percent per year; these are daily observations, not intraday quotes.${oldRates?' <strong class="updates-warning">This observation is over 7 days old.</strong>':''}</p>
 <div class="updates-rates">${TENORS.map(t=>`<div><span>${esc(t.toUpperCase())}</span><strong>${yieldText(latest[t])}</strong></div>`).join('')}</div>
 <details><summary>Recent daily observations (up to 10)</summary><div class="table-wrap" tabindex="0" role="region" aria-label="Recent Treasury observations"><table><thead><tr><th scope="col">Date</th>${TENORS.map(t=>`<th scope="col">${t.toUpperCase()}</th>`).join('')}</tr></thead><tbody>${rates.slice(-10).reverse().map(r=>`<tr><td>${esc(r.date)}</td>${TENORS.map(t=>`<td>${yieldText(r[t])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details></section>
 <details class="updates-provenance"><summary>Sources and capture record</summary><p>Each raw source has a SHA-256 fingerprint. The feed fingerprint identifies this published capture; it is not proof of financial accuracy.</p><p>Feed SHA-256: <code>${esc(feed.feed_sha256)}</code></p><ul>${feed.sources.map(s=>`<li>${link(s.url,s.file)}<br>Retrieved ${esc(utc(s.retrieved_at))}<br><code>${esc(s.raw_sha256)}</code></li>`).join('')}</ul></details>`;
}
export function initOfficialUpdates(doc,{fetch:fetcher=globalThis.fetch,now=Date.now,setInterval:schedule,clearInterval:unschedule,timeoutMs=15000}={}){
 const root=doc.querySelector('#official-updates');if(!root)return()=>{};
 const win=doc.defaultView,$=s=>root.querySelector(s),button=$('#updates-check'),status=$('#updates-status'),content=$('#updates-content'),company=$('#updates-company');
 schedule=schedule||win.setInterval.bind(win);unschedule=unschedule||win.clearInterval.bind(win);
 let feed=null,busy=false,disposed=false,lastAttempt=-Infinity,controller;
 const displayStatus=(prefix='')=>{
  const age=feed&&now()-Date.parse(feed.captured_at)>3*3600000;
  status.classList.toggle('updates-warning',Boolean(prefix||age));
  status.textContent=(prefix?prefix+' ':'')+(feed?`Collected ${utc(feed.captured_at)}. ${age?'This capture is over 3 hours old. ':''}`:'')+`Browser checked ${utc(new Date(now()).toISOString().replace(/\.\d{3}Z$/,'Z'))}.`;
 };
 async function check(){
  if(busy||disposed||!root.open||doc.visibilityState==='hidden')return;
  busy=true;button.disabled=true;lastAttempt=now();status.textContent='Checking the published feed…';controller=new AbortController();let timer;
  try{
   const timeout=new Promise((_,reject)=>{timer=win.setTimeout(()=>{controller.abort();reject(new Error('timeout'));},timeoutMs);});
   const load=(async()=>{const response=await fetcher('./data/updates.json',{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error('unavailable');const text=await response.text();if(text.length>1000000)throw new Error('oversized');return validateUpdates(JSON.parse(text),now());})();
   const next=await Promise.race([load,timeout]);if(disposed)return;
   if(feed&&next.captured_at<feed.captured_at)throw new Error('older capture');
   feed=next;content.innerHTML=renderFeed(feed,company.value,now());displayStatus();
  }catch{
   if(!disposed)displayStatus(feed?'Check failed. Showing the previous validated capture.':'Check failed. Official updates are unavailable. Please try again.');
  }finally{win.clearTimeout(timer);busy=false;if(!disposed)button.disabled=false;}
 }
 const maybeCheck=()=>{if(root.open&&doc.visibilityState!=='hidden'&&now()-lastAttempt>=INTERVAL)void check();};
 const change=()=>{if(feed)content.innerHTML=renderFeed(feed,company.value,now());};
 root.addEventListener('toggle',maybeCheck);doc.addEventListener('visibilitychange',maybeCheck);button.addEventListener('click',check);company.addEventListener('change',change);
 const interval=schedule(maybeCheck,INTERVAL);maybeCheck();
 return()=>{disposed=true;controller?.abort();unschedule(interval);root.removeEventListener('toggle',maybeCheck);doc.removeEventListener('visibilitychange',maybeCheck);button.removeEventListener('click',check);company.removeEventListener('change',change);};
}
