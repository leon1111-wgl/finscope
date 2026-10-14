"""Resolve evidence to official filing documents using SEC submissions metadata."""
from contextlib import contextmanager
from datetime import date, datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
from tempfile import TemporaryDirectory
import time
from urllib.request import Request, urlopen


@contextmanager
def staged_filing_sources(cache, sources, *, refresh):
    """Keep the prior metadata cache intact if a fetch or validation fails."""
    cache = Path(cache)
    if not refresh:
        yield cache
        return
    cache.mkdir(parents=True, exist_ok=True)
    before = dict(sources)
    with TemporaryDirectory(prefix='filing-refresh-', dir=cache) as temporary:
        staging = Path(temporary)
        try:
            yield staging
        except BaseException:
            sources.clear()
            sources.update(before)
            raise
        target = cache / 'submissions'
        target.mkdir(exist_ok=True)
        for path in (staging / 'submissions').glob('CIK*.json'):
            os.replace(path, target / path.name)


def filing_records(payload, cik):
    if 'cik' in payload and int(payload['cik']) != cik:
        raise ValueError('Submissions CIK mismatch')
    rows = payload.get('filings', {}).get('recent', payload)
    fields = ('accessionNumber', 'filingDate', 'form', 'primaryDocument')
    size = len(rows.get('accessionNumber', []))
    if any(not isinstance(rows.get(k), list) or len(rows[k]) != size for k in fields):
        raise ValueError('Misaligned submissions columns')
    result = {}
    for accession, filed, form, document in zip(*(rows[k] for k in fields)):
        if not isinstance(accession, str) or not re.fullmatch(r'\d{10}-\d{2}-\d{6}', accession) or form not in ('10-K', '10-K/A', '10-Q', '10-Q/A'):
            continue
        try:
            date.fromisoformat(filed)
        except (TypeError, ValueError):
            continue
        archive = f'https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace("-", "")}/'
        row = {'accession': accession, 'filed': filed, 'form': form, 'archive_url': archive,
               'filing_index_url': archive + accession + '-index.html'}
        if isinstance(document, str) and re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]*\.html?', document):
            row['document_url'] = archive + document
        result[accession] = row
    return result


def archive_names(payload, cik, needed_dates):
    names = []
    for row in payload.get('filings', {}).get('files', []):
        name = row.get('name', '')
        if re.fullmatch(rf'CIK{cik:010d}-submissions-\d+\.json', name) and any(
                row.get('filingFrom', '9999') <= d <= row.get('filingTo', '') for d in needed_dates):
            names.append(name)
    return sorted(set(names))


def evidence_facts(value):
    if isinstance(value, dict):
        if all(k in value for k in ('accession', 'filed', 'form', 'url')):
            yield value
        for v in value.values():
            yield from evidence_facts(v)
    elif isinstance(value, list):
        for v in value:
            yield from evidence_facts(v)


def attach_filing_links(value, records):
    stats = dict(total=0, resolved=0, direct=0, index=0)
    for fact in evidence_facts(value):
        stats['total'] += 1
        record = records.get(fact['accession'])
        if not record or any(fact[k] != record[k] for k in ('filed', 'form')):
            continue
        if fact.get('archive_url', fact['url']) != record['archive_url']:
            continue
        fact.update({k: record[k] for k in ('archive_url', 'filing_index_url')})
        direct = record.get('document_url')
        if direct:
            fact['document_url'] = direct
        else:
            fact.pop('document_url', None)
        fact['url'] = direct or record['filing_index_url']
        fact['link_kind'] = 'primary_document' if direct else 'filing_index'
        stats['resolved'] += 1
        stats['direct' if direct else 'index'] += 1
    return stats


def load_submission_file(cik, name, cache, sources, *, offline, user_agent):
    if not re.fullmatch(rf'CIK{cik:010d}(?:-submissions-\d+)?\.json', name):
        raise ValueError('Invalid submissions filename')
    path = Path(cache) / 'submissions' / name
    key = 'sec-submissions-' + name[:-5]
    if offline:
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != sources[key]['raw_sha256']:
            raise ValueError('Submissions cache hash mismatch')
    else:
        if not user_agent or '@' not in user_agent:
            raise ValueError('An identifying SEC User-Agent is required')
        url = 'https://data.sec.gov/submissions/' + name
        for attempt in range(3):
            time.sleep(.3 * (attempt + 1))
            try:
                with urlopen(Request(url, headers={'User-Agent': user_agent, 'Accept':'application/json'}), timeout=20) as r:
                    raw = r.read(15_000_001)
                if len(raw) > 15_000_000:
                    raise ValueError('Submissions source exceeds 15 MB')
                payload = json.loads(raw)
                filing_records(payload, cik)
                break
            except (OSError, ValueError):
                if attempt == 2:
                    raise
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix('.tmp')
        temporary.write_bytes(raw)
        os.replace(temporary, path)
        sources[key] = {'url': url, 'raw_sha256': hashlib.sha256(raw).hexdigest(),
                        'retrieved_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}
    return json.loads(raw)


def resolve_company_filings(cik, facts, cache, sources, *, offline, user_agent):
    primary = load_submission_file(cik, f'CIK{cik:010d}.json', cache, sources, offline=offline, user_agent=user_agent)
    records = filing_records(primary, cik)
    missing_dates = {f['filed'] for f in facts if f['accession'] not in records}
    for name in archive_names(primary, cik, missing_dates):
        older = filing_records(load_submission_file(cik, name, cache, sources, offline=offline, user_agent=user_agent), cik)
        for accession, record in older.items():
            records.setdefault(accession, record)
    return {a:r for a,r in records.items() if any(f['accession'] == a for f in facts)}
