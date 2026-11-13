"""One-off probe for the 0.3.0 universe build: which SEC endpoints answer an Actions runner, and how big the pool is.

Prints facts only; changes nothing. Run by .github/workflows/universe-probe.yml with vars.SEC_USER_AGENT.
"""
import gzip, json, os, sys, time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

UA = os.environ['SEC_USER_AGENT']
last = [0.0]

def get(url, method='GET'):
    wait = 0.15 - (time.monotonic() - last[0])
    if wait > 0:
        time.sleep(wait)
    last[0] = time.monotonic()
    req = Request(url, method=method, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip'})
    try:
        with urlopen(req, timeout=60) as r:
            raw = r.read() if method == 'GET' else b''
            enc = r.headers.get('Content-Encoding')
            body = gzip.decompress(raw) if enc == 'gzip' else raw
            return r.status, len(raw), body, dict(r.headers)
    except HTTPError as e:
        return e.code, 0, b'', dict(e.headers or {})

out = []
def say(*a):
    line = ' '.join(str(x) for x in a)
    print(line, flush=True)
    out.append(line)

s, n, body, h = get('https://www.sec.gov/files/company_tickers_exchange.json')
say('company_tickers_exchange', s, n)
tx = json.loads(body)
say('fields', tx['fields'], 'rows', len(tx['data']))
from collections import Counter
say('exchanges', Counter(r[3] for r in tx['data']).most_common())
listed = {}
for cik, name, ticker, exch in tx['data']:
    if exch in ('NYSE', 'Nasdaq'):
        listed.setdefault(int(cik), []).append(ticker)
say('listed CIKs', len(listed))

floats = {}
for period in ['CY2024Q3I', 'CY2024Q4I', 'CY2025Q1I', 'CY2025Q2I', 'CY2025Q3I', 'CY2025Q4I', 'CY2026Q1I', 'CY2026Q2I']:
    s, n, body, h = get(f'https://data.sec.gov/api/xbrl/frames/dei/EntityPublicFloat/USD/{period}.json')
    if s != 200:
        say('frames', period, s)
        continue
    d = json.loads(body)
    say('frames', period, s, n, 'facts', len(d['data']))
    for f in d['data']:
        floats.setdefault(f['cik'], []).append((f['end'], f['val'], f['accn']))
latest = {c: max(v) for c, v in floats.items()}
pool = [c for c in listed if c in latest and latest[c][1] >= 700_000_000]
say('listed with float', sum(1 for c in listed if c in latest), 'float>=700M', len(pool), '>=2B', sum(1 for c in listed if c in latest and latest[c][1] >= 2e9), '>=10B', sum(1 for c in listed if c in latest and latest[c][1] >= 1e10))

cats = Counter(); sizes = []; fye = Counter(); samples = []
for cik in sorted(pool, key=lambda c: -latest[c][1])[::max(1, len(pool) // 60)][:60]:
    s, n, body, h = get(f'https://data.sec.gov/submissions/CIK{cik:010d}.json')
    if s != 200:
        say('submissions', cik, s); continue
    d = json.loads(body)
    sizes.append(n)
    cats[d.get('category')] += 1
    fye[d.get('fiscalYearEnd')] += 1
    rec = d['filings']['recent']
    forms = Counter(rec['form'][:200])
    samples.append((cik, d.get('name'), d.get('sic'), d.get('sicDescription'), d.get('category'), d.get('fiscalYearEnd'), d.get('tickers'), d.get('exchanges'), forms.get('10-K', 0), forms.get('20-F', 0), forms.get('40-F', 0), rec.get('reportDate', [''])[0], len(rec['form']), list(d['filings'].get('files', []))[:1]))
say('submission keys', sorted(d.keys()))
say('recent keys', sorted(rec.keys()))
say('categories', cats.most_common())
say('fiscalYearEnd', fye.most_common(12))
say('submissions gzip bytes median', sorted(sizes)[len(sizes) // 2], 'max', max(sizes))
for row in samples[:60]:
    say('sample', row)

for cik in (320193, 19617, 1045810, 1067983, 72971):
    s, n, body, h = get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json')
    say('companyfacts', cik, s, 'gzip bytes', n, 'raw', len(body), h.get('Content-Encoding'))
for url in ['https://www.sec.gov/files/dera/data/financial-statement-data-sets/2025q3.zip',
            'https://www.sec.gov/files/dera/data/financial-statement-data-sets/2026q2.zip',
            'https://www.sec.gov/files/dera/data/financial-statement-data-sets/2026q3.zip',
            'https://www.sec.gov/files/dera/data/financial-statement-and-notes-data-sets/2026_09_notes.zip',
            'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/',
            'https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip',
            'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=10-K&output=atom',
            'https://efts.sec.gov/LATEST/search-index?q=%2210-K%22&forms=10-K']:
    s, n, body, h = get(url, method='HEAD')
    say('HEAD', url, s, h.get('Content-Length'), h.get('Last-Modified'))
summary = os.environ.get('GITHUB_STEP_SUMMARY')
if summary:
    with open(summary, 'a') as f:
        f.write('```\n' + '\n'.join(out) + '\n```\n')
