"""Universe accuracy check against the SEC Financial Statement Data Sets (docs/validation/ACCURACY_PROTOCOL.md).

Runs on GitHub Actions only: the quarterly zips are downloaded there and never kept on a workstation.

    SEC_USER_AGENT="Name contact@example.com" python scripts/accuracy_check.py --out accuracy.json

The sample, figures, tolerance and pass bar are fixed by the protocol committed before the first run.
"""
from __future__ import annotations

import argparse
import calendar
from collections import defaultdict
from datetime import date, datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import zipfile

ROOT = Path(__file__).resolve().parents[1]
UNIVERSE = ROOT / 'web' / 'data' / 'universe'
SALT = 'finscope-0.3.0-accuracy-2026-11-14'
COMPANIES = 40
FIGURES = ['revenue', 'gross_profit', 'operating_income', 'net_income', 'eps_diluted', 'operating_cash_flow', 'capex', 'cash', 'assets', 'liabilities', 'equity', 'total_debt']
INSTANT = {'cash', 'cash_sti', 'assets', 'liabilities', 'equity', 'total_debt'}
UNIT = {'eps_diluted': 'USD/shares'}
TOLERANCE = {'USD': 0.5, 'USD/shares': 0.005}
FACE = {'revenue': {'IS', 'CI'}, 'gross_profit': {'IS', 'CI'}, 'operating_income': {'IS', 'CI'}, 'net_income': {'IS', 'CI'}, 'eps_diluted': {'IS', 'CI'},
        'operating_cash_flow': {'CF'}, 'capex': {'CF'}, 'cash': {'BS'}, 'assets': {'BS'}, 'liabilities': {'BS'}, 'equity': {'BS'}}
BASE = 'https://www.sec.gov/files/dera/data/financial-statement-data-sets/'


def sample(index):
    ranked = sorted(index['companies'], key=lambda e: hashlib.sha256(f"{SALT}:{e['c']}".encode()).hexdigest())
    out = []
    for entry in ranked:
        shard = json.loads((UNIVERSE / 'c' / f"{entry['c']}.json").read_text())
        if len(shard['periods']) >= 2:
            out.append(shard)
        if len(out) == COMPANIES:
            break
    return out


def month_end(day):
    """FS Data Sets round ddate to the nearest month end."""
    d = date.fromisoformat(day)
    last = calendar.monthrange(d.year, d.month)[1]
    if d.day >= 15:
        return f'{d.year:04d}{d.month:02d}{last:02d}'
    year, month = (d.year, d.month - 1) if d.month > 1 else (d.year - 1, 12)
    return f'{year:04d}{month:02d}{calendar.monthrange(year, month)[1]:02d}'


def quarter_of(day):
    d = date.fromisoformat(day)
    return f'{d.year}q{(d.month - 1) // 3 + 1}'


def fetch(url, ua, attempts=4):
    for attempt in range(attempts):
        try:
            with urlopen(Request(url, headers={'User-Agent': ua}), timeout=300) as response:
                return response.read()
        except HTTPError as exc:
            if exc.code == 404:
                return None
            if attempt == attempts - 1:
                raise
        time.sleep(5 * (attempt + 1))
    return None


def read_rows(z, name, keep):
    """Rows of a tab-separated member whose adsh is wanted, as dicts keyed by the header."""
    stem = name.split('.')[0]
    name = next((m for m in z.namelist() if m.split('/')[-1].split('.')[0] == stem), name)
    with z.open(name) as handle:
        text = io.TextIOWrapper(handle, encoding='utf-8', errors='replace')
        header = text.readline().rstrip('\n').split('\t')
        at = header.index('adsh')
        for line in text:
            parts = line.rstrip('\n').split('\t')
            if len(parts) > at and parts[at] in keep:
                yield dict(zip(header, parts))


def cells_for(shard, older=False):
    out = []
    n = len(shard['periods'])
    for i in ([n - 7, n - 4] if older else [n - 2, n - 1]):
        if i < 0:
            continue
        period = shard['periods'][i]
        for metric in FIGURES + (['cash_sti'] if older else []):
            base = {'cik': shard['cik'], 'ticker': (shard['tickers'] or [''])[0], 'template': shard['template'], 'fy': period['fy'], 'period_end': period['end'],
                    'period_start': period['start'], 'figure': metric, 'original_accession': period['accession'], 'original_filed': period['filed']}
            if metric not in shard['values']:
                out.append({**base, 'outcome': 'not_applicable'})
                continue
            cell = shard['values'][metric][i]
            if not cell or 'v' not in cell:
                out.append({**base, 'outcome': 'not_stated', 'reason': 'conflict' if cell else 'not reported'})
                continue
            parts = cell.get('parts') or [{'tag': cell['tag'], 'v': cell['v'], 'sign': 1}]
            out.append({**base, 'value': cell['v'], 'accession': cell['accn'], 'filed': cell['filed'], 'via': cell['via'], 'parts': parts})
    return out


units_seen = set()


def unit_matches(found, expected):
    # The data sets record per-share facts with the unit 'USD' (the only unit seen in the second run), where
    # CompanyFacts says 'USD/shares'; the value comparison and its 0.005 tolerance still apply.
    norm = lambda u: u.lower().replace(' ', '').replace('per', '/').replace('_', '/').rstrip('s')
    return norm(found) == norm(expected) or (expected == 'USD/shares' and found == 'USD')


def judge(cell, num, pre, available_until):
    # The data sets document ddate as the period end rounded to the nearest month end; the exact date is accepted too.
    key_dates = {month_end(cell['period_end']), cell['period_end'].replace('-', '')}
    qtrs = '0' if cell['figure'] in INSTANT else '4'
    uom = UNIT.get(cell['figure'], 'USD')
    tol = TOLERANCE[uom]
    rows = num.get(cell['accession'])
    if rows is None:
        lag = cell['filed'] > available_until
        return {'outcome': 'unverifiable', 'reason': 'publication lag' if lag else 'accession absent'}
    results = []
    for part in cell['parts']:
        # A tag is present when any undimensioned row carries it; the unit is then matched loosely, because the data sets
        # spell per-share units differently from CompanyFacts (the first run required the exact string 'USD/shares').
        tagged = [r for r in rows if r['tag'] == part['tag'] and r.get('coreg', '') == '' and r.get('segments', '') == '']
        same_tag = [r for r in tagged if unit_matches(r['uom'], uom)]
        units_seen.update(r['uom'] for r in tagged)
        if tagged and not same_tag:
            results.append(('unit mismatch', sorted({r['uom'] for r in tagged})))
            continue
        exact = [r for r in same_tag if r['ddate'] in key_dates and r['qtrs'] == qtrs]
        values = sorted({float(r['value']) for r in exact if r['value'] != ''})
        if not same_tag:
            results.append(('tag absent', None))
        elif not exact:
            results.append(('period mismatch', [(r['ddate'], r['qtrs'], r['value']) for r in same_tag[:4]]))
        elif len(values) > 1:
            results.append(('duplicate context', values))
        else:
            ref = values[0]
            ours = part['v']
            if abs(ref - ours) <= tol:
                results.append(('match', ref))
            elif ours and abs(ref + ours) <= tol:
                results.append(('sign', ref))
            elif ours and ref and any(abs(ref / ours - k) < 1e-9 for k in (1e3, 1e6, 1e-3, 1e-6)):
                results.append(('scale', ref))
            else:
                results.append(('wrong value', ref))
    kinds = [k for k, _ in results]
    if all(k == 'match' for k in kinds):
        outcome = {'outcome': 'match'}
    elif 'tag absent' in kinds and set(kinds) <= {'tag absent', 'match'}:
        outcome = {'outcome': 'unverifiable', 'reason': 'tag absent'}
    else:
        outcome = {'outcome': next(k for k in kinds if k != 'match'), 'reference': [v for _, v in results]}
    if cell['figure'] in FACE and cell['via'] in ('primary', 'fallback', 'total'):
        statements = {r['stmt'] for r in pre.get(cell['accession'], []) if r['tag'] == cell['parts'][0]['tag']}
        outcome['statements'] = sorted(statements)
        outcome['on_expected_statement'] = bool(statements & FACE[cell['figure']])
    return outcome


def identity_checks(index):
    """Addendum A: cash + short-term investments >= cash, total debt <= liabilities, equity <= assets, over every stated year."""
    rules = [('cash_sti', 'cash', '>='), ('total_debt', 'liabilities', '<='), ('equity', 'assets', '<=')]
    checked, found = 0, []
    for entry in index['companies']:
        shard = json.loads((UNIVERSE / 'c' / f"{entry['c']}.json").read_text())
        for a, b, op in rules:
            if a not in shard['values'] or b not in shard['values']:
                continue
            for i, (x, y) in enumerate(zip(shard['values'][a], shard['values'][b])):
                if not (x and y and 'v' in x and 'v' in y):
                    continue
                checked += 1
                ok = x['v'] >= y['v'] - 0.5 if op == '>=' else x['v'] <= y['v'] * 1.001 + 0.5
                if not ok:
                    found.append({'cik': shard['cik'], 'ticker': (shard['tickers'] or [''])[0], 'fy': shard['periods'][i]['fy'], 'rule': f'{a} {op} {b}', 'values': [x['v'], y['v']]})
    return {'checked': checked, 'violations': len(found), 'examples': found[:50]}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', default='accuracy.json')
    parser.add_argument('--older', action='store_true', help='Addendum A: the 4th and 7th most recent fiscal years, plus identity checks')
    args = parser.parse_args()
    ua = os.environ.get('SEC_USER_AGENT', '')
    if '@' not in ua:
        raise SystemExit('SEC_USER_AGENT with a contact email is required (SEC fair-access policy).')
    index = json.loads((UNIVERSE / 'index.json').read_text())
    shards = sample(index)
    cells = [c for s in shards for c in cells_for(s, args.older)]
    stated = [c for c in cells if 'outcome' not in c]
    wanted = {c['accession'] for c in stated} | {c['original_accession'] for c in cells}
    quarters = sorted({quarter_of(c['filed']) for c in stated} | {quarter_of(c['original_filed']) for c in cells})
    num, pre, sub = defaultdict(list), defaultdict(list), {}
    downloaded, available = [], []
    with tempfile.TemporaryDirectory() as tmp:
        for q in quarters:
            raw = fetch(BASE + f'{q}.zip', ua)
            if raw is None:
                downloaded.append({'quarter': q, 'status': 'not published'})
                continue
            path = Path(tmp) / f'{q}.zip'
            path.write_bytes(raw)
            downloaded.append({'quarter': q, 'status': 'ok', 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
            available.append(q)
            with zipfile.ZipFile(path) as z:
                for r in read_rows(z, 'sub.txt', wanted):
                    sub[r['adsh']] = {k: r.get(k) for k in ('cik', 'form', 'period', 'fy', 'fp', 'filed')}
                for r in read_rows(z, 'num.txt', wanted):
                    num[r['adsh']].append(r)
                for r in read_rows(z, 'pre.txt', wanted):
                    pre[r['adsh']].append({'stmt': r['stmt'], 'tag': r['tag']})
            path.unlink()
    last_q = max(available) if available else '2000q1'
    year, qn = int(last_q[:4]), int(last_q[-1])
    available_until = date(year, qn * 3, calendar.monthrange(year, qn * 3)[1]).isoformat()
    for c in stated:
        c.update(judge(c, num, pre, available_until))
    # Fiscal labels: FinScope's label against sub.txt fy of the original 10-K for that period.
    labels = []
    for c in {(x['cik'], x['fy']): x for x in cells}.values():
        s = sub.get(c['original_accession'])
        if not s:
            labels.append({'cik': c['cik'], 'fy': c['fy'], 'outcome': 'unverifiable', 'reason': 'publication lag' if c['original_filed'] > available_until else 'accession absent'})
            continue
        period_ok = s['period'] == month_end(c['period_end']) or s['period'] == c['period_end'].replace('-', '')
        labels.append({'cik': c['cik'], 'fy': c['fy'], 'reference_fy': s['fy'], 'reference_period': s['period'], 'form': s['form'],
                       'outcome': 'match' if str(c['fy']) == str(s['fy']) else 'fiscal mislabel', 'period_matches': period_ok})
    verifiable = [c for c in stated if c['outcome'] != 'unverifiable']
    matches = [c for c in verifiable if c['outcome'] == 'match']
    face = [c for c in stated if 'on_expected_statement' in c]
    lag = [c for c in stated if c['outcome'] == 'unverifiable' and c.get('reason') == 'publication lag']
    other_unverifiable = [c for c in stated if c['outcome'] == 'unverifiable' and c.get('reason') != 'publication lag']
    label_ok = [l for l in labels if l['outcome'] == 'match']
    label_checked = [l for l in labels if l['outcome'] != 'unverifiable']
    classes = defaultdict(int)
    for c in stated:
        classes[c['outcome'] if c['outcome'] != 'unverifiable' else f"unverifiable: {c['reason']}"] += 1
    summary = {
        'cells': len(cells), 'stated': len(stated), 'not_applicable': sum(c.get('outcome') == 'not_applicable' for c in cells), 'not_stated': sum(c.get('outcome') == 'not_stated' for c in cells),
        'verifiable': len(verifiable), 'match': len(matches), 'match_rate': round(len(matches) / len(verifiable), 4) if verifiable else None,
        'classes': dict(sorted(classes.items())),
        'sign_errors': classes.get('sign', 0), 'scale_errors': classes.get('scale', 0),
        'face_cells': len(face), 'off_statement': sum(not c['on_expected_statement'] for c in face),
        'fiscal_labels_checked': len(label_checked), 'fiscal_labels_match': len(label_ok),
        'unverifiable_publication_lag': len(lag), 'unverifiable_other': len(other_unverifiable),
    }
    bar = {
        'match_rate_at_least_99pct': bool(verifiable) and len(matches) / len(verifiable) >= 0.99,
        'zero_sign_and_scale_errors': classes.get('sign', 0) == 0 and classes.get('scale', 0) == 0,
        'fiscal_label_at_least_98pct': bool(label_checked) and len(label_ok) / len(label_checked) >= 0.98,
        'off_statement_at_most_2pct': bool(face) and sum(not c['on_expected_statement'] for c in face) / len(face) <= 0.02,
        'other_unverifiable_at_most_10pct': bool(stated) and len(other_unverifiable) / len(stated) <= 0.10,
    }
    try:
        commit = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        data_commit = subprocess.run(['git', 'log', '-1', '--format=%h', '--', 'web/data/universe/index.json'], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except OSError:
        commit = data_commit = None
    identity = identity_checks(index) if args.older else None
    if identity is not None:
        bar['identity_violations_zero'] = identity['violations'] == 0
    report = {'protocol': 'docs/validation/ACCURACY_PROTOCOL.md' + (' (Addendum A)' if args.older else ''), 'salt': SALT, 'units_seen': sorted(units_seen), 'identity': identity, 'run_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
              'code_commit': commit, 'data_commit': data_commit, 'universe_built': index['built'], 'reference': BASE, 'quarters': downloaded,
              'reference_available_through': available_until, 'sample': [{'cik': s['cik'], 'ticker': (s['tickers'] or [''])[0], 'name': s['name'], 'template': s['template']} for s in shards],
              'summary': summary, 'pass_bar': bar, 'passed': all(bar.values()), 'cells': cells, 'fiscal_labels': labels}
    Path(args.out).write_text(json.dumps(report, indent=1) + '\n')
    print(json.dumps({k: report[k] for k in ('code_commit', 'data_commit', 'summary', 'pass_bar', 'passed')}, indent=1))


if __name__ == '__main__':
    main()
