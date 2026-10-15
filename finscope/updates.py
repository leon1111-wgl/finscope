"""Current official monitoring. Never an input to historical research calculations."""
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import time
from urllib.parse import urlparse
from urllib.error import HTTPError
from urllib.request import Request, HTTPRedirectHandler, build_opener
import xml.etree.ElementTree as ET

from .treasury import parse_treasury

COMPANIES = {'AAPL': 320193, 'MSFT': 789019, 'NVDA': 1045810,
             'AMZN': 1018724, 'GOOGL': 1652044, 'META': 1326801}
FORMS = {'10-K', '10-K/A', '10-Q', '10-Q/A', '8-K', '8-K/A'}
TREASURY_URL = ('https://home.treasury.gov/resource-center/data-chart-center/'
                'interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=')


def stamp(value):
    return value.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def day(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise ValueError('Invalid official date')
    return date.fromisoformat(value)


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError('Invalid acceptance timestamp') from exc
    if parsed.tzinfo is None:
        raise ValueError('Acceptance timestamp requires a timezone')
    return parsed.astimezone(timezone.utc)


def recent_filings(payload, cik, captured_at):
    try:
        if int(payload['cik']) != cik:
            raise ValueError('Submissions CIK mismatch')
        rows = payload['filings']['recent']
    except (KeyError, TypeError) as exc:
        raise ValueError('Missing company submissions metadata') from exc
    fields = ('accessionNumber', 'filingDate', 'form', 'primaryDocument', 'acceptanceDateTime', 'reportDate')
    if not isinstance(rows, dict) or any(not isinstance(rows.get(k), list) for k in fields):
        raise ValueError('Missing submissions columns')
    size = len(rows['accessionNumber'])
    if any(len(rows[k]) != size for k in fields):
        raise ValueError('Misaligned submissions columns')
    result = {}
    cutoff = captured_at.date() - timedelta(days=120)
    for accession, filed, form, document, accepted, report in zip(*(rows[k] for k in fields)):
        if form not in FORMS:
            continue
        if not isinstance(accession, str) or not re.fullmatch(r'\d{10}-\d{2}-\d{6}', accession):
            raise ValueError('Invalid filing accession')
        filed_day = day(filed)
        accepted_time = timestamp(accepted) if accepted else None
        report_day = day(report) if report else None
        if not cutoff <= filed_day <= captured_at.date() or (accepted_time and accepted_time > captured_at):
            continue
        if report_day and report_day > filed_day:
            raise ValueError('Report date follows filing date')
        archive = f'https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace("-", "")}/'
        safe_document = isinstance(document, str) and re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]*\.html?', document)
        record = {'accession': accession, 'form': form, 'filed': filed,
                  'accepted_at': stamp(accepted_time) if accepted_time else None,
                  'report_date': report or None,
                  'document_url': archive + document if safe_document else None,
                  'filing_index_url': archive + accession + '-index.html'}
        if accession in result and result[accession] != record:
            raise ValueError('Conflicting duplicate filing')
        result[accession] = record
    return sorted(result.values(), key=lambda r: (r['filed'], r['accepted_at'] or '', r['accession']), reverse=True)[:20]


class OfficialRedirect(HTTPRedirectHandler):
    """Check the destination before urllib forwards the identifying header."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        origin, target = urlparse(req.full_url), urlparse(newurl)
        if target.scheme != 'https' or target.netloc != origin.netloc:
            raise HTTPError(newurl, code, 'Unsafe official-source redirect', headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_official(url, user_agent):
    """Paced, identified requests; no credentials are written to the feed."""
    allowed = {'data.sec.gov', 'home.treasury.gov'}
    source = urlparse(url)
    if source.scheme != 'https' or source.netloc not in allowed:
        raise ValueError('Invalid official source URL')
    opener = build_opener(OfficialRedirect())
    identity = user_agent if source.hostname == 'data.sec.gov' else 'FinScope/1.0 https://github.com/leon1111-wgl/finscope'
    for attempt in range(3):
        time.sleep(.4 * (attempt + 1))
        try:
            with opener.open(Request(url, headers={'User-Agent': identity}), timeout=25) as response:
                target = urlparse(response.geturl())
                if target.scheme != 'https' or target.hostname not in allowed:
                    raise ValueError('Unexpected official-source redirect')
                raw = response.read(15_000_001)
            if len(raw) > 15_000_000:
                raise ValueError('Official source exceeds size limit')
            return raw
        except (OSError, ValueError):
            if attempt == 2:
                raise


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def collect_updates(output, user_agent, *, fetch=None, now=None, evidence_dir=None):
    if not user_agent or '@' not in user_agent:
        raise ValueError('An identifying SEC User-Agent is required')
    fetch = fetch or fetch_official
    clock = (lambda: now) if now is not None else (lambda: datetime.now(timezone.utc))
    started = clock()
    if started.tzinfo is None:
        raise ValueError('Capture clock requires a timezone')
    started = started.astimezone(timezone.utc)
    sources, captured, companies = [], {}, []

    def capture(url, filename):
        raw = fetch(url, user_agent)
        if not isinstance(raw, bytes) or not 0 < len(raw) <= 15_000_000:
            raise ValueError('Invalid official source size')
        sources.append({'url': url, 'file': filename, 'retrieved_at': stamp(clock()),
                        'raw_sha256': hashlib.sha256(raw).hexdigest()})
        captured[filename] = raw
        return raw

    for ticker, cik in COMPANIES.items():
        filename = f'CIK{cik:010d}.json'
        raw = capture('https://data.sec.gov/submissions/' + filename, filename)
        companies.append({'ticker': ticker, 'cik': cik,
                          'filings': recent_filings(json.loads(raw), cik, started)})
    observations = {}
    for year in (started.year - 1, started.year):
        raw = capture(TREASURY_URL + str(year), f'treasury-{year}.xml')
        root = ET.fromstring(raw)
        if root.tag.split('}')[-1] != 'feed':
            raise ValueError('Unexpected Treasury XML document')
        has_entries = any(e.tag.split('}')[-1] == 'entry' for e in root.iter())
        if not has_entries:
            metadata = {'title', 'id', 'updated', 'link', 'author', 'category'}
            new_year_grace = year == started.year and started.month == 1 and started.day <= 7
            if not new_year_grace or any(e.tag.split('}')[-1] not in metadata for e in root):
                raise ValueError('Unexpectedly empty Treasury year')
        rows = parse_treasury(raw) if has_entries else []
        for row in rows:
            observed = day(row['date'])
            if observed.year != year:
                raise ValueError('Treasury year mismatch')
            if observed <= started.date():
                observations[row['date']] = row
    if not observations or not any(row['10y'] is not None for row in observations.values()):
        raise ValueError('No eligible Treasury observations')
    feed = {'schema_version': 1, 'captured_at': stamp(clock()),
            'companies': companies, 'treasury': {'observations': [observations[k] for k in sorted(observations)[-60:]]},
            'sources': sources}
    feed['feed_sha256'] = hashlib.sha256(canonical(feed)).hexdigest()
    public = canonical(feed)
    # Stage all raw evidence only after every source has passed validation.
    if evidence_dir is not None:
        evidence_dir = Path(evidence_dir); evidence_dir.mkdir(parents=True, exist_ok=True)
        for name, raw in captured.items():
            (evidence_dir / name).write_bytes(raw)
        (evidence_dir / 'sources.json').write_bytes(canonical(sources))
    output = Path(output); output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    try:
        temporary.write_bytes(public)
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)
    return feed
