"""One-off: which XBRL tags a few companies use for figures FinScope reported as missing, and why a company left the
selection. Prints facts only. Run by .github/workflows/universe-probe.yml."""
import gzip, json, os, re, time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

UA = os.environ['SEC_USER_AGENT']

def get(url):
    time.sleep(0.2)
    try:
        with urlopen(Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip'}), timeout=60) as r:
            raw = r.read()
            return json.loads(gzip.decompress(raw) if r.headers.get('Content-Encoding') == 'gzip' else raw)
    except HTTPError as e:
        return {'error': e.code}

out = []
say = lambda *a: (print(*a, flush=True), out.append(' '.join(map(str, a))))
sub = get('https://data.sec.gov/submissions/CIK0000034088.json')
say('XOM submissions', sub.get('category'), sub.get('tickers'), sub.get('exchanges'), sub.get('fiscalYearEnd'))
facts = get('https://data.sec.gov/api/xbrl/companyfacts/CIK0000034088.json')
for unit, rows in facts.get('facts', {}).get('dei', {}).get('EntityPublicFloat', {}).get('units', {}).items():
    say('XOM float', unit, [(r['end'], r['val'], r.get('frame'), r['form']) for r in rows[-4:]])
tx = get('https://www.sec.gov/files/company_tickers_exchange.json')
say('XOM in tickers file', [r for r in tx['data'] if r[0] == 34088])
CHECK = {78003: r'Dividend', 27904: r'Interest', 37996: r'Debt|Borrowing', 1067983: r'Premium', 34088: r'Revenue'}
for cik, pattern in CHECK.items():
    f = get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json')
    for tag, body in sorted(f.get('facts', {}).get('us-gaap', {}).items()):
        if not re.search(pattern, tag):
            continue
        for unit, rows in body.get('units', {}).items():
            annual = [r for r in rows if r.get('form') == '10-K' and r.get('fp') == 'FY']
            if annual:
                last = max(annual, key=lambda r: (r['end'], r['filed']))
                say(cik, tag, unit, last.get('start'), last['end'], last['val'], last['filed'], len(annual))
if os.environ.get('GITHUB_STEP_SUMMARY'):
    open(os.environ['GITHUB_STEP_SUMMARY'], 'a').write('```\n' + '\n'.join(out) + '\n```\n')
