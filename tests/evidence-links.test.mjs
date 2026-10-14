import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceLink,evidenceMarkdown} from '../web/evidence-links.js';

const f={url:'https://www.sec.gov/Archives/edgar/data/123/000000012326000001/company.htm',filing_index_url:'https://www.sec.gov/Archives/edgar/data/123/000000012326000001/0000000123-26-000001-index.html',link_kind:'primary_document',form:'10-Q',tag:'RevenueTag',filed:'2026-08-01',accession:'0000000123-26-000001'};
test('reader gets a named primary document, index fallback and exact tag',()=>{
 const html=evidenceLink(f);assert.match(html,/Read 10-Q/);assert.match(html,/Filing index/);assert.match(html,/RevenueTag/);
 assert.ok(html.includes(f.url));assert.ok(html.includes(f.filing_index_url));
});
test('fallback labels never imply a verified primary document',()=>{
 assert.doesNotMatch(evidenceLink({...f,url:f.filing_index_url,link_kind:'filing_index'}),/Read 10-Q/);
 assert.match(evidenceLink({...f,link_kind:null}),/Filing directory/);
});
test('unsafe links and source text cannot inject markup',()=>{
 const h=evidenceLink({...f,url:'javascript:alert(1)',filing_index_url:'https://evil.example/',tag:'<img src=x onerror=alert(1)>'});
 assert.doesNotMatch(h,/href=|<img|javascript:/);
});
test('Markdown keeps document and backup links for a portable handoff',()=>{
 const m=evidenceMarkdown(f);assert.ok(m.includes(f.url));assert.ok(m.includes(f.filing_index_url));assert.match(m,/Read 10-Q/);
});
