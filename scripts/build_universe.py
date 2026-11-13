"""Build the 0.3.0 universe on GitHub Actions: every SEC large accelerated filer with XBRL 10-Ks listed on NYSE or Nasdaq.

    SEC_USER_AGENT="Name contact@example.com" python scripts/build_universe.py [--limit N] [--ciks 320193,21344]

Selection, in order (docs/UNIVERSE.md):
  1. Candidates: every company whose latest 10-K cover (data.sec.gov frames of dei:EntityPublicFloat, last eight
     quarter ends) reports a public float of at least $560M, the level below which a large accelerated filer loses
     that status; plus every company with a NYSE or Nasdaq ticker in www.sec.gov/files/company_tickers_exchange.json
     that reports no float in those frames. This only narrows the requests.
  2. Submissions: keep `category` starting with "Large accelerated filer" and a 10-K filed in the last 15 months.
     Large accelerated filer status already requires a public equity float, so no listing test is applied; the
     ticker file supplies tickers (with Submissions and a curated list as fallbacks).
  3. CompanyFacts: keep companies with at least one annual USD period from a 10-K.
Writes web/data/universe/{index,screen,manifest}.json and one shard per company under web/data/universe/c/.
SEC fair access: one declared User-Agent, at most 8 requests per second across threads, retries with backoff.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import threading
import time
import traceback
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def _load(name):
    # Load the pure modules by path so the build needs no numpy/pandas (finscope/__init__ imports the lab).
    spec = importlib.util.spec_from_file_location(name, ROOT / 'finscope' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


universe = _load('universe')
names = _load('universe_names')
OUT = ROOT / 'web' / 'data' / 'universe'
SIX = {320193, 789019, 1045810, 1018724, 1652044, 1326801}
FLOAT_FLOOR = 560_000_000
RATE = 8.0


class SEC:
    def __init__(self, user_agent, rate=RATE):
        if not user_agent or '@' not in user_agent:
            raise SystemExit('SEC_USER_AGENT must name the requester with a contact email (SEC fair-access policy).')
        self.ua, self.gap, self.lock, self.next = user_agent, 1.0 / rate, threading.Lock(), 0.0
        self.requests = 0
        self.bytes = 0

    def _slot(self):
        with self.lock:
            now = time.monotonic()
            wait = self.next - now
            self.next = max(now, self.next) + self.gap
        if wait > 0:
            time.sleep(wait)

    def get(self, url, attempts=5):
        error = None
        for attempt in range(attempts):
            self._slot()
            try:
                req = Request(url, headers={'User-Agent': self.ua, 'Accept-Encoding': 'gzip', 'Accept': 'application/json'})
                with urlopen(req, timeout=60) as response:
                    raw = response.read()
                    body = gzip.decompress(raw) if response.headers.get('Content-Encoding') == 'gzip' else raw
                with self.lock:
                    self.requests += 1
                    self.bytes += len(raw)
                return json.loads(body)
            except HTTPError as exc:
                error = exc
                if exc.code == 404:
                    return None
                if exc.code not in (403, 429, 500, 502, 503, 504):
                    raise
            except (URLError, TimeoutError, ConnectionError, json.JSONDecodeError, gzip.BadGzipFile) as exc:
                error = exc
            time.sleep(min(60, 2 ** attempt + 1))
        raise RuntimeError(f'SEC request failed after {attempts} attempts: {url}: {error}')


def quarter_ends(today, count=8):
    out, year, quarter = [], today.year, (today.month - 1) // 3 + 1
    for _ in range(count):
        quarter -= 1
        if quarter == 0:
            year, quarter = year - 1, 4
        out.append(f'CY{year}Q{quarter}I')
    return out


def stable(data):
    return json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False, sort_keys=False)


def write_if_changed(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text() == text:
        return False
    tmp = path.with_suffix('.tmp')
    tmp.write_text(text)
    os.replace(tmp, path)
    return True


def recent_10k(submissions, cutoff):
    recent = submissions.get('filings', {}).get('recent', {})
    return any(form in ('10-K', '10-K/A') and filed >= cutoff for form, filed in zip(recent.get('form', []), recent.get('filingDate', [])))


def common_tickers(tickers, exchanges=None):
    """A company's tickers with the common stock first, as Submissions lists them otherwise (share classes keep their order).

    Preferred, warrant, unit and right symbols written with a dash (SPG-PJ, NE-WTA) are dropped. A ticker with no exchange
    or traded OTC goes after the exchange-listed ones (SPGJ, RLJ-A, ELMES), and one that is another listed ticker plus a
    warrant, unit or right letter goes after it (HTZWW after HTZ).
    """
    exchanges = list(exchanges or [])
    pairs = [(t, exchanges[i] if i < len(exchanges) else 'listed') for i, t in enumerate(tickers) if not re.search(r'-(P|WT|WS|U|R)', t)]
    if not pairs:
        return list(tickers)
    names = {t for t, _ in pairs}
    unlisted = lambda x: x in (None, '', 'OTC')
    some_listed = any(not unlisted(x) for _, x in pairs)
    derived = lambda t: any(t != base and t.startswith(base) and t[len(base):] in ('W', 'WW', 'WS', 'U', 'R') for base in names)
    order = sorted(range(len(pairs)), key=lambda i: (some_listed and unlisted(pairs[i][1]), derived(pairs[i][0]), i))
    return [pairs[i][0] for i in order]


def curated_ticker(name, curated):
    """When SEC's ticker file and Submissions both omit a company's ticker, take it from the curated name list."""
    aliases = set(universe.name_aliases(name))
    hits = [t for t, (en, _) in curated.items() if aliases & {a.lower() for a in en}]
    return hits[:1]


def clean_name(name):
    """The SEC conformed name without its state or 'new' suffix: 'PROGRESSIVE CORP/OH/' -> 'PROGRESSIVE CORP'."""
    out = re.sub(r'\s*(/[A-Za-z]{2,4}/?|\\[A-Za-z]{2}\\|/NEW/?)\s*$', '', name or '').strip()
    out = re.sub(r'\s*(/[A-Za-z]{2,4}/?|/NEW/?)\s*$', '', out).strip()
    return out or name


def index_entry(shard, rank, curated):
    tickers = common_tickers(shard['tickers'], shard.get('exchanges')) or curated_ticker(shard['name'], curated) or [f"CIK{shard['cik']}"]
    aliases = set(universe.name_aliases(shard['name']))
    zh = []
    for t in tickers:
        en, cn = curated.get(t, ([], []))
        aliases |= {a.lower() for a in en}
        zh += [z for z in cn if z not in zh]
    latest = shard['periods'][-1] if shard['periods'] else None
    curated_en = {a.lower() for t in tickers for a in curated.get(t, ([], []))[0]}
    # Derived one-word names (Target, Block, Ball) match only when written with a capital; curated names always match.
    single = sorted(a for a in aliases if ' ' not in a and a not in curated_en)
    entry = {'c': shard['cik'], 't': tickers, 'n': clean_name(shard['name']), 'a': sorted(aliases), 'z': zh, 's': shard['sic'],
            'd': shard['sic_description'], 'v': shard['division'], 'tp': shard['template'], 'fye': shard['fiscal_year_end'],
            'fy': latest['fy'] if latest else None, 'e': latest['end'] if latest else None, 'r': rank}
    if single:
        entry['lw'] = single
    if any(t in names.LOWER_OK for t in tickers):
        entry['l'] = 1
    return entry


def index_entries(shards, rank, curated=None, shared=None):
    """The search index's company entries, in rank order. A derived alias shared by two companies is ambiguous and is
    dropped from both; curated names stay. Used by the build and by scripts/reindex_universe.py (offline).
    A full name (from the SEC name itself) outranks a short name (its leading words): a short name that is another
    company's full name, or a one-word short name that begins another company's name, is not used."""
    curated = names.CURATED if curated is None else curated
    entries = sorted((index_entry(s, rank[s['cik']], curated) for s in shards), key=lambda e: e['r'])
    shorts = {s['cik']: set(universe.name_aliases(s['name'])) - set(universe.name_aliases(s['name'], short=False)) for s in shards}
    owners, strong, first_words = {}, {}, {}
    for e in entries:
        for a in e['a']:
            owners.setdefault(a, set()).add(e['c'])
            if a not in shorts[e['c']]:
                strong.setdefault(a, set()).add(e['c'])
                if ' ' in a:
                    first_words.setdefault(a.split()[0], set()).add(e['c'])
    kept = {a.lower() for en, _ in curated.values() for a in en}

    def keep(e, a):
        if a in kept:
            return True
        if a not in shorts[e['c']]:
            return strong[a] == {e['c']}
        # A short name: nobody else's name of any kind, and (one word) not the first word of another company's name.
        return owners[a] == {e['c']} and (' ' in a or first_words.get(a, set()) <= {e['c']})
    # A full name of two words or more that two companies share is kept aside, so the box can ask which one is meant.
    if shared is not None:
        for a, ciks in strong.items():
            if len(ciks) > 1 and ' ' in a and a not in kept:
                shared[a] = sorted(ciks, key=lambda c: rank[c])
    for e in entries:
        e['a'] = [a for a in e['a'] if keep(e, a)]
        if 'lw' in e:
            lw = [a for a in e['lw'] if a not in shorts[e['c']] or a in e['a']]
            if lw:
                e['lw'] = lw
            else:
                del e['lw']
    return entries


COMPOSED = {
    'sga': 'SellingGeneralAndAdministrativeExpense; else SellingAndMarketingExpense or SellingExpense, plus GeneralAndAdministrativeExpense, from the same filing',
    'liabilities': 'Liabilities; else LiabilitiesAndStockholdersEquity minus total equity (including noncontrolling interest) and temporary equity, from the same filing',
    'cash_sti': 'CashCashEquivalentsAndShortTermInvestments; else CashAndCashEquivalentsAtCarryingValue plus ShortTermInvestments, MarketableSecuritiesCurrent or AvailableForSaleSecuritiesDebtSecuritiesCurrent (cash only when none is tagged), from the same filing',
    'total_debt': 'DebtLongtermAndShorttermCombinedAmount; else LongTermDebt plus ShortTermBorrowings or CommercialPaper; else LongTermDebtNoncurrent or LongTermDebtAndCapitalLeaseObligations plus DebtCurrent, or plus LongTermDebtCurrent and ShortTermBorrowings or CommercialPaper; an untagged current part counts as zero; all parts from one filing',
    'revenue': 'In the chain order, except that a larger total Revenues in the same filing beats contract revenue alone',
}


def catalog():
    out = {}
    for metric, (kind, unit, statement, chain, templates) in universe.METRICS.items():
        out[metric] = {'kind': kind, 'unit': unit, 'statement': statement, 'chain': chain, 'templates': sorted(templates)}
        if metric in COMPOSED:
            out[metric]['rule'] = COMPOSED[metric]
    return out


SCREEN_INPUTS = ('revenue', 'net_income', 'operating_cash_flow', 'capex', 'assets')


def screen_row(shard):
    if shard['template'] not in ('industrial', 'reit') or not shard['periods']:
        return None
    last = len(shard['periods']) - 1
    period = shard['periods'][last]
    row = {'c': shard['cik'], 'fy': period['fy'], 'end': period['end']}
    for key in SCREEN_INPUTS:
        cell = shard['values'].get(key, [None])[last] if shard['values'].get(key) else None
        row[key] = [cell['v'], cell['tag'], cell['accn']] if cell and 'v' in cell else None
    prior = shard['values']['assets'][last - 1] if last >= 1 else None
    gap = last >= 1 and 300 <= (date.fromisoformat(period['end']) - date.fromisoformat(shard['periods'][last - 1]['end'])).days <= 430
    row['assets_prior'] = [prior['v'], prior['tag'], prior['accn']] if gap and prior and 'v' in prior else None
    return row


def validate_shard(shard):
    assert shard['template'] in universe.TEMPLATES
    ends = [p['end'] for p in shard['periods']]
    assert ends == sorted(ends) and len(set(ends)) == len(ends)
    assert len({p['fy'] for p in shard['periods']}) == len(ends)
    for metric, row in shard['values'].items():
        assert len(row) == len(ends), metric
        for period, cell in zip(shard['periods'], row):
            if not cell:
                continue
            assert cell['accn'] in shard['filings'], (metric, cell['accn'])
            assert cell['filed'] >= period['end'], (metric, period)
            if 'v' in cell:
                assert isinstance(cell['v'], (int, float))
            if cell.get('parts'):
                total = sum(p['sign'] * p['v'] for p in cell['parts'])
                assert abs(total - cell['v']) < 1, (metric, period)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--limit', type=int, help='Build only the N largest candidates (for a quick check)')
    parser.add_argument('--ciks', help='Comma-separated CIKs to build instead of the selection (for a check)')
    parser.add_argument('--workers', type=int, default=6)
    args = parser.parse_args()
    sec = SEC(os.environ.get('SEC_USER_AGENT', ''))
    today = datetime.now(timezone.utc).date()
    started = time.monotonic()

    listing = sec.get('https://www.sec.gov/files/company_tickers_exchange.json')
    listed = {}
    file_tickers = {}
    for cik, name, ticker, exchange in listing['data']:
        file_tickers.setdefault(int(cik), []).append(ticker)
        if exchange in ('NYSE', 'Nasdaq'):
            listed.setdefault(int(cik), []).append(ticker)
    floats = {}
    for period in quarter_ends(today):
        frame = sec.get(f'https://data.sec.gov/api/xbrl/frames/dei/EntityPublicFloat/USD/{period}.json')
        for fact in (frame or {}).get('data', []):
            if fact['end'] > floats.get(fact['cik'], ('', 0))[0]:
                floats[fact['cik']] = (fact['end'], fact['val'])
    if args.ciks:
        candidates = [int(c) for c in args.ciks.split(',')]
    else:
        pool = {c for c, (_, v) in floats.items() if v >= FLOAT_FLOOR} | {c for c in listed if c not in floats} | SIX
        candidates = sorted(pool, key=lambda c: (-floats.get(c, ('', 0))[1], c))
        if args.limit:
            candidates = candidates[:args.limit]
    print(f'listed CIKs {len(listed)}; public-float candidates {len(candidates)}', flush=True)

    cutoff = (today - timedelta(days=456)).isoformat()
    excluded = {}

    def screen_candidate(cik):
        sub = sec.get(f'https://data.sec.gov/submissions/CIK{cik:010d}.json')
        if not sub:
            return cik, None, 'no submissions record'
        if not str(sub.get('category', '')).startswith('Large accelerated filer'):
            return cik, None, 'not a large accelerated filer'
        if not recent_10k(sub, cutoff):
            return cik, None, 'no 10-K filed in the last 15 months'
        return cik, sub, None

    with ThreadPoolExecutor(args.workers) as pool:
        screened = list(pool.map(screen_candidate, candidates))
    members = []
    for cik, sub, reason in screened:
        if reason:
            excluded[reason] = excluded.get(reason, 0) + 1
        else:
            members.append((cik, sub))
    print(f'large accelerated filers with a recent 10-K: {len(members)}', flush=True)

    failures = []

    def build(member):
        cik, sub = member
        facts = sec.get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json')
        if not facts or not facts.get('facts', {}).get('us-gaap'):
            return cik, None, 'no US-GAAP XBRL facts'
        if not sub.get('tickers') and file_tickers.get(cik):
            sub = {**sub, 'tickers': file_tickers[cik]}
        try:
            shard = universe.company_shard(facts, sub)
            if not shard['periods']:
                return cik, None, 'no annual USD period in a 10-K'
            validate_shard(shard)
        except Exception as exc:  # one malformed company must not stop the universe; it is counted and named
            where = traceback.extract_tb(exc.__traceback__)[-1]
            print(f'excluded CIK {cik}: {type(exc).__name__}: {exc} at {Path(where.filename).name}:{where.lineno}', flush=True)
            failures.append({'cik': cik, 'name': sub.get('name'), 'error': f'{type(exc).__name__}: {exc} at {Path(where.filename).name}:{where.lineno}'[:240]})
            return cik, None, 'failed validation'
        return cik, shard, None

    with ThreadPoolExecutor(args.workers) as pool:
        built = list(pool.map(build, members))
    shards = []
    for cik, shard, reason in built:
        if reason:
            excluded[reason] = excluded.get(reason, 0) + 1
        else:
            shards.append(shard)
    rank = {cik: i + 1 for i, cik in enumerate(sorted((s['cik'] for s in shards), key=lambda c: -floats.get(c, ('', 0))[1]))}
    changed = 0
    keep = set()
    for shard in shards:
        path = OUT / 'c' / f"{shard['cik']}.json"
        keep.add(path.name)
        changed += write_if_changed(path, stable(shard) + '\n')
    removed = 0
    if not args.ciks and not args.limit:
        for old in (OUT / 'c').glob('*.json'):
            if old.name not in keep:
                old.unlink()
                removed += 1
    shared = {}
    entries = index_entries(shards, rank, shared=shared)
    screen = [row for row in (screen_row(s) for s in sorted(shards, key=lambda s: rank[s['cik']])) if row]
    data_as_of = max((p['filed'] for s in shards for p in s['periods']), default=None)
    index = {'schema': 'finscope.universe.index/1', 'built': today.isoformat(), 'data_as_of': data_as_of, 'count': len(entries),
             'selection': 'SEC large accelerated filers with a 10-K filed in the last 15 months and XBRL financial data',
             'outside': names.OUTSIDE, 'shared': dict(sorted(shared.items())), 'catalog': catalog(), 'companies': entries}
    write_if_changed(OUT / 'index.json', stable(index) + '\n')
    write_if_changed(OUT / 'screen.json', stable({'schema': 'finscope.universe.screen/1', 'built': today.isoformat(), 'rows': screen}) + '\n')
    sizes = sorted((OUT / 'c' / f"{s['cik']}.json").stat().st_size for s in shards)
    manifest = {
        'schema': 'finscope.universe.manifest/1', 'built': today.isoformat(), 'built_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'companies': len(shards), 'templates': {t: sum(1 for s in shards if s['template'] == t) for t in universe.TEMPLATES},
        'funnel': {'listed_ciks': len(listed), 'candidates': len(candidates), 'large_accelerated_with_recent_10k': len(members), 'built': len(shards)},
        'excluded': excluded, 'validation_failures': sorted(failures, key=lambda f: f['cik']), 'shards_changed': changed, 'shards_removed': removed,
        'bytes': {'index': (OUT / 'index.json').stat().st_size, 'screen': (OUT / 'screen.json').stat().st_size,
                  'shards_total': sum(sizes), 'shard_median': sizes[len(sizes) // 2] if sizes else 0, 'shard_max': sizes[-1] if sizes else 0},
        'sec': {'requests': sec.requests, 'compressed_bytes': sec.bytes, 'rate_limit_per_second': RATE, 'seconds': round(time.monotonic() - started)},
        'sources': ['https://www.sec.gov/files/company_tickers_exchange.json', 'https://data.sec.gov/api/xbrl/frames/dei/EntityPublicFloat/USD/{quarter}.json',
                    'https://data.sec.gov/submissions/CIK##########.json', 'https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json'],
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    assert manifest['bytes']['shards_total'] < 200_000_000, 'Universe shards exceed the 200 MB budget'
    assert len(failures) <= max(10, len(members) // 100), f'Too many companies failed validation: {len(failures)}'
    print(json.dumps(manifest, indent=1))


if __name__ == '__main__':
    main()
