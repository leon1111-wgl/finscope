// Current monitoring can read published evidence, but never changes research selection or exports.
import {escapeHTML as esc} from './workbench.js';
import {publishedCoverage,filingCoverage} from './filing-coverage.js?v=20261020-facts2';
import {CALCULATION_VERSION} from './research-state.js';
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
// Show stored values without applying cash-bridge signs or silently rounding decimals.
function reportedValue(value){
 const [integer,decimal]=String(value).split('.');
 if(/[eE]/.test(integer))return String(value);
 return integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(decimal===undefined?'':'.'+decimal);
}
const filingID=(ticker,filing)=>`facts-${ticker}-${filing.accession}`;
function factDisclosure(filing,coverage,ticker){
 if(coverage.status!=='referenced')return '';
 const key=filingID(ticker,filing);
 const items=[...coverage.facts].sort((a,b)=>b.end.localeCompare(a.end)).map(f=>`<li><div><strong>${esc(f.label||f.tag)}</strong><small>XBRL tag: <code>${esc(f.tag)}</code></small></div><span class="fact-value">${esc(reportedValue(f.value))} ${esc(f.unit||'· Unit unavailable')}</span><span>${f.start?esc(f.start)+' to '+esc(f.end):'At '+esc(f.end)}</span></li>`).join('');
 return `<details class="filing-facts" id="${esc(key)}" data-filing="${esc(key)}"><summary>${esc(ticker)} ${esc(filing.form)} · Filed ${esc(filing.filed)} · ${coverage.count} referenced facts</summary><p>Stored reported values in the units shown, not cash-flow effects. Different periods are separate facts. Do not add them together.</p><p>Accession ${esc(filing.accession)} · <a href="${esc(filing.document_url||filing.filing_index_url)}" target="_blank" rel="noopener noreferrer">${filing.document_url?'Read full filing':'Open filing index'} ↗</a>. These selected facts do not cover the full report. Follow the source link to verify context; it does not locate an exact fact.</p><ol>${items}</ol></details>`;
}
function renderFeed(feed,ticker,now,research){
 const coverage=publishedCoverage(research,ticker);
 const company=feed.companies.find(c=>c.ticker===ticker),rates=feed.treasury.observations,latest=rates.at(-1);
 const oldRates=now-dateValue(latest.date)>7*DAY;
 const link=(url,label)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
 const coverageCell=r=>{const c=filingCoverage(r,coverage);return `<td class="filing-coverage" data-coverage="${c.status}"><strong>${esc(c.label)}</strong><small>${esc(c.detail)}</small>${c.status==='referenced'?`<button type="button" class="inspect-filing" data-inspect-filing="${esc(filingID(ticker,r))}" aria-controls="${esc(filingID(ticker,r))}">Inspect ${c.count} facts ↓</button>`:''}</td>`;};
 const query=coverage.status==='available'?new URLSearchParams({company:ticker,date:coverage.date,view:'review',dataset:coverage.dataset,calculation:CALCULATION_VERSION}):null;
 const context=query?`Research cutoff: <strong>${esc(coverage.date)}</strong> · Built ${esc(coverage.generatedAt.slice(0,10))} UTC. Compared with research loaded in this tab, independent of your selected historical date. ${link('?'+query+'#workspace','Open '+ticker+' at this cutoff in a new tab')}<details><summary>Coverage method and research version</summary><p>The research bundle loads once. Checking announcements does not refresh it. Open the research link in a new tab to check the published version. If versions differ, the workspace asks before recalculating.</p><p>Financial snapshot: ${esc(coverage.snapshotDate)}. Built: ${esc(coverage.generatedAt)}.</p><p>Matches company, accession, form and filing date against annual history and the latest eligible interim checkpoint, including its prior-period and cash-flow facts. Duplicate facts count once. Missing values do not count. Narrative, exhibits and other filings are not fully analyzed. A source match does not prove completeness or accuracy.</p><p>Research SHA-256: <code>${esc(coverage.dataset)}</code></p><p>The original research data was retrieved later than many historical filing dates. This check does not certify an archived point-in-time dataset. These monitoring statuses are not included in research exports.</p></details>`:'Research coverage unavailable. The evidence snapshot is still loading or could not be read. Announcements remain available below.';
 const table=company.filings.length?`<div class="table-wrap updates-scroll" tabindex="0" role="region" aria-label="Recent filing announcements"><table><thead><tr><th scope="col">Filed</th><th scope="col">Form</th><th scope="col">Report date</th><th scope="col">Research coverage</th><th scope="col">Original evidence</th></tr></thead><tbody>${company.filings.map(r=>`<tr><td>${esc(r.filed)}<small>Accepted: ${r.accepted_at?esc(utc(r.accepted_at)):'Unavailable'}</small></td><td>${esc(r.form)}</td><td>${esc(r.report_date||'Unavailable')}</td>${coverageCell(r)}<td>${link(r.document_url||r.filing_index_url,r.document_url?'Read filing':'Filing index')}<small>${esc(r.accession)} · ${link(r.filing_index_url,'Index')}</small></td></tr>`).join('')}</tbody></table></div>`:'<p>No supported filings in this 120-day window. This is not a complete disclosure history.</p>';
 return `<section aria-label="Recent company disclosures"><h3>${esc(ticker)} · Recent disclosures</h3><p>Up to 20 filings in the last 120 days. 10-K: annual report. 10-Q: quarterly report. 8-K: current report covering a range of company events. /A marks an amendment.</p><div class="updates-coverage">${context}</div>${table}${company.filings.map(r=>factDisclosure(r,filingCoverage(r,coverage),ticker)).join('')}</section>
 <section aria-label="Daily Treasury rates"><h3>US Treasury · Daily par yields</h3><p>Observation date: <strong>${esc(latest.date)}</strong>. Percent per year; these are daily observations, not intraday quotes.${oldRates?' <strong class="updates-warning">This observation is over 7 days old.</strong>':''}</p>
 <div class="updates-rates">${TENORS.map(t=>`<div><span>${esc(t.toUpperCase())}</span><strong>${yieldText(latest[t])}</strong></div>`).join('')}</div>
 <details><summary>Recent daily observations (up to 10)</summary><div class="table-wrap" tabindex="0" role="region" aria-label="Recent Treasury observations"><table><thead><tr><th scope="col">Date</th>${TENORS.map(t=>`<th scope="col">${t.toUpperCase()}</th>`).join('')}</tr></thead><tbody>${rates.slice(-10).reverse().map(r=>`<tr><td>${esc(r.date)}</td>${TENORS.map(t=>`<td>${yieldText(r[t])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details></section>
 <details class="updates-provenance"><summary>Sources and capture record</summary><p>Each raw source has a SHA-256 fingerprint. The feed fingerprint identifies this published capture; it is not proof of financial accuracy.</p><p>Feed SHA-256: <code>${esc(feed.feed_sha256)}</code></p><ul>${feed.sources.map(s=>`<li>${link(s.url,s.file)}<br>Retrieved ${esc(utc(s.retrieved_at))}<br><code>${esc(s.raw_sha256)}</code></li>`).join('')}</ul></details>`;
}
export function initOfficialUpdates(doc,{fetch:fetcher=globalThis.fetch,now=Date.now,setInterval:schedule,clearInterval:unschedule,timeoutMs=15000,research=()=>null}={}){
 const root=doc.querySelector('#official-updates');if(!root)return()=>{};
 const win=doc.defaultView,$=s=>root.querySelector(s),button=$('#updates-check'),status=$('#updates-status'),content=$('#updates-content'),company=$('#updates-company');
 schedule=schedule||win.setInterval.bind(win);unschedule=unschedule||win.clearInterval.bind(win);
 let feed=null,busy=false,disposed=false,lastAttempt=-Infinity,controller;
 const redraw=()=>{
  const disclosures=[...content.querySelectorAll('.filing-facts')];
  const open=new Set(disclosures.filter(d=>d.open).map(d=>d.dataset.filing));
  const focus=doc.activeElement?.matches('.filing-facts > summary')?doc.activeElement.parentElement.dataset.filing:null;
  const scroll=content.querySelector('.updates-scroll');
  const position=scroll?{top:scroll.scrollTop,left:scroll.scrollLeft}:null;
  content.innerHTML=renderFeed(feed,company.value,now(),research());
  for(const d of content.querySelectorAll('.filing-facts')){
   d.open=open.has(d.dataset.filing);
   if(d.dataset.filing===focus)d.querySelector('summary').focus({preventScroll:true});
  }
  const next=content.querySelector('.updates-scroll');
  if(next&&position){next.scrollTop=position.top;next.scrollLeft=position.left;}
 };
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
   feed=next;redraw();displayStatus();
  }catch{
   if(!disposed)displayStatus(feed?'Check failed. Showing the previous validated capture.':'Check failed. Official updates are unavailable. Please try again.');
  }finally{win.clearTimeout(timer);busy=false;if(!disposed)button.disabled=false;}
 }
 const maybeCheck=()=>{if(root.open&&doc.visibilityState!=='hidden'&&now()-lastAttempt>=INTERVAL)void check();};
 const inspect=event=>{
  const trigger=event.target.closest('[data-inspect-filing]');if(!trigger)return;
  const detail=doc.getElementById(trigger.dataset.inspectFiling);if(!detail||!content.contains(detail))return;
  detail.open=true;detail.scrollIntoView({block:'start'});detail.querySelector('summary').focus({preventScroll:true});
 };
 content.addEventListener('click',inspect);
 const change=()=>{if(feed)redraw();};
 doc.addEventListener('finscope-research-ready',change);root.addEventListener('toggle',maybeCheck);doc.addEventListener('visibilitychange',maybeCheck);button.addEventListener('click',check);company.addEventListener('change',change);
 const interval=schedule(maybeCheck,INTERVAL);maybeCheck();
 return()=>{content.removeEventListener('click',inspect);disposed=true;controller?.abort();unschedule(interval);doc.removeEventListener('finscope-research-ready',change);root.removeEventListener('toggle',maybeCheck);doc.removeEventListener('visibilitychange',maybeCheck);button.removeEventListener('click',check);company.removeEventListener('change',change);};
}
