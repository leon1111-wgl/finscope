"""Fetch public official evidence; publish one validated, atomic research bundle."""
from __future__ import annotations

import argparse
from datetime import date, datetime, timezone, timedelta
import hashlib
import json
import os
from pathlib import Path
import platform
import time
from urllib.request import Request, urlopen

import sklearn
from finscope.fundamentals import annual_history
from finscope.filings import evidence_facts, resolve_company_filings, attach_filing_links, staged_filing_sources
from finscope.interim import interim_snapshots
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
    for records in bundle['interim'].values():
        for record in records:
            assert record['as_of'] <= bundle['as_of']
            assert record['current']['period_start'] == (date.fromisoformat(record['annual_baseline_end']) + timedelta(days=1)).isoformat()
            for period in (record['current'], record['prior']):
                if period:
                    for fact in period['metrics'].values():
                        if fact:
                            assert fact['filed'] <= record['as_of']
                            assert (fact['start'], fact['end']) == (period['period_start'], period['period_end'])
                    bridge = period.get('cash_bridge', {})
                    if bridge.get('status') == 'available':
                        assert abs(bridge['net_income'] + bridge['selected_adjustments'] + bridge['residual'] - bridge['operating_cash_flow']) < .01
                        for component in bridge['components']:
                            fact = component['fact']
                            if fact:
                                assert fact['filed'] <= record['as_of']
                                assert fact['accession'] == bridge['accession']
                                assert (fact['start'], fact['end']) == (period['period_start'], period['period_end'])
    latest = bundle['snapshots'][-1]
    for rows in latest['companies'].values():
        assert (date.fromisoformat(bundle['as_of']) - date.fromisoformat(rows[-1]['period_end'])).days < 600, 'Annual data unexpectedly stale'
    assert (date.fromisoformat(bundle['as_of']) - date.fromisoformat(bundle['rates'][-1]['date'])).days < 10, 'Treasury data unexpectedly stale'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true', help='Rebuild from saved raw sources and their original metadata')
    parser.add_argument('--refresh-filings', action='store_true', help='Refresh filing-document metadata even when financial sources use --offline')
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
        'schema_version': '2.3.0', 'data_kind': 'real_official_financial_evidence',
        'as_of': args.as_of, 'generated_at': stamp(), 'sources': sources,
        'companies': [{'ticker': t, 'cik': cik, 'name': payloads[t]['entityName']} for t, cik in COMPANIES.items()],
        'snapshots': snapshots, 'rates': [rates[d] for d in sorted(rates)],
        'interim': {t: interim_snapshots(p, args.as_of) for t, p in payloads.items()},
        'runtime': {'python': platform.python_version(), 'sklearn': sklearn.__version__},
        'limitations': ['Filing-day reconstruction from currently retrieved CompanyFacts, not an archived point-in-time database.',
                        'Annual model and scenarios; separate fiscal YTD checkpoints cover matched standard 10-Q facts only, not every quarterly disclosure or trailing-twelve-month results.',
                        'Six selected surviving technology/platform businesses are not a market-representative sample.',
                        'The cash-flow bridge maps selected standard-tag adjustments; its residual includes other and unmapped items, not a verified causal explanation.',
                        'Anomaly percentiles describe unusual profiles, not fraud/default probabilities or investment returns.',
                        'All stress results are user assumptions, not company forecasts.']}
    records = {}
    facts = list(evidence_facts(bundle))
    refresh_filings = not args.offline or args.refresh_filings
    with staged_filing_sources(cache, sources, refresh=refresh_filings) as filing_cache:
        for ticker, cik in COMPANIES.items():
            company_facts = {f['accession']: f for f in facts if f'/data/{cik}/' in f['url']}
            records.update(resolve_company_filings(cik, list(company_facts.values()), filing_cache, sources,
                           offline=not refresh_filings, user_agent=os.environ.get('SEC_USER_AGENT', '')))
            print(f'Filing metadata {ticker}: loaded', flush=True)
        bundle['filing_links'] = attach_filing_links(bundle, records)
        bundle['filing_links']['unique_accessions'] = len({f['accession'] for f in facts})
        bundle['filing_links']['resolved_accessions'] = len({f['accession'] for f in facts if f.get('link_kind')})
        validate(bundle)
    if refresh_filings:
        atomic_json(manifest_path, sources)
    bundle['dataset_sha256'] = hashlib.sha256(json.dumps(bundle, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()
    target = ROOT / 'web/data/research.json'
    atomic_json(target, bundle)
    print(json.dumps({'path': str(target), 'bytes': target.stat().st_size, 'snapshots': len(snapshots),
                      'rates_through': bundle['rates'][-1]['date'], 'dataset_sha256': bundle['dataset_sha256'],
                      'latest_annual_periods': {t: rows[-1]['period_end'] for t, rows in latest.items()}}, indent=2))


if __name__ == '__main__':
    main()
