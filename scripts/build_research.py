"""Fetch public official evidence; publish one validated, atomic research bundle."""
from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import time
from urllib.request import Request, urlopen

import sklearn
from finscope.fundamentals import annual_history
from finscope.research import score_profiles
from finscope.sec import fetch_companyfacts
from finscope.treasury import parse_treasury

ROOT = Path(__file__).resolve().parents[1]
COMPANIES = {'AAPL': 320193, 'MSFT': 789019, 'NVDA': 1045810,
             'AMZN': 1018724, 'GOOGL': 1652044, 'META': 1326801}


def stamp():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def atomic_json(path, data):
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_bytes(raw)
    os.replace(temporary, path)


def validate(bundle):
    assert bundle['snapshots'], 'No research snapshots'
    for snapshot in bundle['snapshots']:
        assert set(snapshot['companies']) == set(COMPANIES)
        for rows in snapshot['companies'].values():
            assert rows, 'Missing company history'
            for row in rows:
                assert row['known_at'] <= snapshot['as_of']
                for fact in row['metrics'].values():
                    if fact:
                        assert fact['filed'] <= snapshot['as_of']
                        assert fact['end'] == row['period_end']
        ai = snapshot['ai']
        if ai['scores']:
            assert ai['training']['last_period_end'] < min(r[-1]['period_end'] for r in snapshot['companies'].values())
    assert bundle['rates'] and bundle['rates'][-1]['date'] <= bundle['as_of']
    latest = bundle['snapshots'][-1]
    for rows in latest['companies'].values():
        assert (date.fromisoformat(bundle['as_of']) - date.fromisoformat(rows[-1]['period_end'])).days < 600, 'Annual data unexpectedly stale'
    assert (date.fromisoformat(bundle['as_of']) - date.fromisoformat(bundle['rates'][-1]['date'])).days < 10, 'Treasury data unexpectedly stale'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true', help='Rebuild from saved raw sources and their original metadata')
    parser.add_argument('--as-of', default=datetime.now(timezone.utc).date().isoformat())
    args = parser.parse_args()
    cutoff = date.fromisoformat(args.as_of)
    cache = ROOT / 'local-data'
    cache.mkdir(exist_ok=True)
    manifest_path = cache / 'research-sources.json'
    sources = json.loads(manifest_path.read_text()) if args.offline else {}
    payloads = {}
    for ticker, cik in COMPANIES.items():
        path = cache / 'sec' / f'CIK{cik:010d}.json'
        if args.offline:
            raw = path.read_bytes()
            assert hashlib.sha256(raw).hexdigest() == sources[ticker]['raw_sha256']
            payload = json.loads(raw)
        else:
            payload, provenance = fetch_companyfacts(cik, os.environ.get('SEC_USER_AGENT', ''), cache / 'sec')
            provenance.pop('cache_path', None)
            sources[ticker] = provenance
        assert int(payload['cik']) == cik
        payloads[ticker] = payload
        print(f"SEC {ticker}: {payload['entityName']}", flush=True)
    rates = {}
    for year in range(2018, cutoff.year + 1):
        key = f'treasury-{year}'
        path = cache / f'{key}.xml'
        if args.offline:
            raw = path.read_bytes()
            assert hashlib.sha256(raw).hexdigest() == sources[key]['raw_sha256']
        else:
            url = f'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value={year}'
            for attempt in range(3):
                try:
                    with urlopen(Request(url, headers={'User-Agent': 'FinScope public financial research'}), timeout=30) as response:
                        raw = response.read(4_000_001)
                    if len(raw) > 4_000_000:
                        raise ValueError('Treasury XML exceeds 4 MB')
                    parse_treasury(raw)
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(attempt + 1)
            path.write_bytes(raw)
            sources[key] = {'url': url, 'raw_sha256': hashlib.sha256(raw).hexdigest(), 'retrieved_at': stamp()}
        for row in parse_treasury(raw):
            if row['date'] <= args.as_of:
                rates[row['date']] = row
        print(f'Treasury {year}: parsed', flush=True)
    if not args.offline:
        atomic_json(manifest_path, sources)
    latest = {ticker: annual_history(p, args.as_of) for ticker, p in payloads.items()}
    dates = {row['first_filed'] for rows in latest.values() for row in rows if row['first_filed'] >= '2018-01-01'} | {args.as_of}
    snapshots = []
    for day in sorted(dates):
        histories = {ticker: annual_history(p, day) for ticker, p in payloads.items()}
        if not all(histories.values()):
            continue
        ai = score_profiles(histories, day)
        snapshots.append({'as_of': day, 'companies': {t: rows[-6:] for t, rows in histories.items()}, 'ai': ai})
    bundle = {
        'schema_version': '2.0.0', 'data_kind': 'real_official_financial_evidence',
        'as_of': args.as_of, 'generated_at': stamp(), 'sources': sources,
        'companies': [{'ticker': t, 'cik': cik, 'name': payloads[t]['entityName']} for t, cik in COMPANIES.items()],
        'snapshots': snapshots, 'rates': [rates[d] for d in sorted(rates)],
        'runtime': {'python': platform.python_version(), 'sklearn': sklearn.__version__},
        'limitations': ['Filing-day reconstruction from currently retrieved CompanyFacts, not an archived point-in-time database.',
                        'Annual accounts only; subsequent quarterly results are outside this review.',
                        'Six selected surviving technology/platform businesses are not a market-representative sample.',
                        'Anomaly percentiles describe unusual profiles, not fraud/default probabilities or investment returns.',
                        'All stress results are user assumptions, not company forecasts.']}
    validate(bundle)
    bundle['dataset_sha256'] = hashlib.sha256(json.dumps(bundle, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()
    target = ROOT / 'web/data/research.json'
    atomic_json(target, bundle)
    print(json.dumps({'path': str(target), 'bytes': target.stat().st_size, 'snapshots': len(snapshots),
                      'rates_through': bundle['rates'][-1]['date'], 'dataset_sha256': bundle['dataset_sha256'],
                      'latest_annual_periods': {t: rows[-1]['period_end'] for t, rows in latest.items()}}, indent=2))


if __name__ == '__main__':
    main()
