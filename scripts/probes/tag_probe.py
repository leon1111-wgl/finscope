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
sub = {}
CHECK = {72971: r'^Loans|^FinancingReceivable.*(Allowance|Net)', 70858: r'^Loans|^FinancingReceivable.*(Allowance|Net)', 36104: r'^Loans|^FinancingReceivable.*(Allowance|Net)', 92122: r'^Loans|^FinancingReceivable.*(Allowance|Net)'}
for cik, pattern in CHECK.items():
    f = get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json')
    for tag, body in sorted(f.get('facts', {}).get('us-gaap', {}).items()):
        if not re.search(pattern, tag):
            continue
        for unit, rows in body.get('units', {}).items():
            annual = [r for r in rows if r.get('form') == '10-K' and r.get('fp') == 'FY']
            if annual:
                last = max(annual, key=lambda r: (r['end'], r['filed']))
                if last['end'] >= '2023-01-01': say(cik, tag, unit, last.get('start'), last['end'], last['val'], last['filed'], len(annual))
if os.environ.get('GITHUB_STEP_SUMMARY'):
    open(os.environ['GITHUB_STEP_SUMMARY'], 'a').write('```\n' + '\n'.join(out) + '\n```\n')
