"""Synthetic parser fixtures; never published as financial evidence."""
from datetime import datetime, timezone
import hashlib
import json
import pytest
from finscope.updates import recent_filings, collect_updates

NOW = datetime(2026, 10, 15, 12, tzinfo=timezone.utc)


def submissions(cik=789019):
    return {'cik': str(cik), 'filings': {'recent': {
        'accessionNumber': ['0000789019-26-000002', '0000789019-26-000001'],
        'filingDate': ['2026-10-14', '2026-09-15'],
        'acceptanceDateTime': ['2026-10-14T17:32:00.000Z', '2026-09-15T12:00:00Z'],
        'reportDate': ['2026-10-13', '2026-06-30'],
        'form': ['8-K', '10-K'], 'primaryDocument': ['msft-8k.htm', 'annual.htm']}}}


def xml(day='2026-10-14', ten='4.1'):
    return f'<feed><entry><properties><NEW_DATE>{day}T00:00:00</NEW_DATE><BC_3MONTH>3.8</BC_3MONTH><BC_10YEAR>{ten}</BC_10YEAR></properties></entry></feed>'.encode()


def fetch(url, user_agent):
    if 'submissions' in url:
        return json.dumps(submissions(int(url.split('CIK')[1].split('.')[0]))).encode()
    return xml('2025-12-31' if url.endswith('2025') else '2026-10-14')


def test_includes_current_reports_and_preserves_official_document_and_timestamps():
    rows = recent_filings(submissions(), 789019, NOW)
    assert [r['form'] for r in rows] == ['8-K', '10-K']
    assert rows[0]['accepted_at'] == '2026-10-14T17:32:00Z'
    assert rows[0]['document_url'] == 'https://www.sec.gov/Archives/edgar/data/789019/000078901926000002/msft-8k.htm'
    assert rows[0]['report_date'] == '2026-10-13'


@pytest.mark.parametrize('document', ['', '../other.htm', 'https://example.com/a.htm', 'bad".htm'])
def test_unsafe_document_falls_back_to_official_index(document):
    data = submissions(); data['filings']['recent']['primaryDocument'][0] = document
    row = recent_filings(data, 789019, NOW)[0]
    assert row['document_url'] is None
    assert row['filing_index_url'].endswith('/0000789019-26-000002-index.html')


@pytest.mark.parametrize('mutation', ['wrong-cik', 'no-cik', 'misaligned', 'bad-date', 'bad-acceptance', 'bad-report'])
def test_rejects_unusable_source_instead_of_publishing_partial_success(mutation):
    data = submissions(); rows = data['filings']['recent']
    if mutation == 'wrong-cik': data['cik'] = '123'
    if mutation == 'no-cik': del data['cik']
    if mutation == 'misaligned': rows['form'].pop()
    if mutation == 'bad-date': rows['filingDate'][0] = '2026-02-30'
    if mutation == 'bad-acceptance': rows['acceptanceDateTime'][0] = 'not-a-date'
    if mutation == 'bad-report': rows['reportDate'][0] = '2026-13-01'
    with pytest.raises(ValueError): recent_filings(data, 789019, NOW)


def test_filters_future_and_old_rows_and_deduplicates():
    data = submissions(); rows = data['filings']['recent']
    rows['filingDate'][0] = '2026-10-16'
    assert [r['form'] for r in recent_filings(data, 789019, NOW)] == ['10-K']
    rows['filingDate'][0] = '2026-10-15'; rows['acceptanceDateTime'][0] = '2026-10-15T13:00:00Z'
    assert len(recent_filings(data, 789019, NOW)) == 1
    rows['filingDate'][0] = '2026-01-01'; rows['acceptanceDateTime'][0] = ''
    assert len(recent_filings(data, 789019, NOW)) == 1
    for key in rows: rows[key] = [rows[key][1]] * 30
    assert len(recent_filings(data, 789019, NOW)) == 1
    rows['accessionNumber'] = [f'0000789019-26-{i:06d}' for i in range(30)]
    assert len(recent_filings(data, 789019, NOW)) == 20


def test_successful_capture_has_reproducible_hashes_and_null_yields(tmp_path):
    out = tmp_path / 'updates.json'; evidence = tmp_path / 'evidence'
    feed = collect_updates(out, 'Test test@example.com', fetch=fetch, now=NOW, evidence_dir=evidence)
    assert len(feed['companies']) == 6
    assert feed['treasury']['observations'][-1] == {'date':'2026-10-14', '3m':3.8, '2y':None, '5y':None, '10y':4.1, '30y':None}
    assert len(feed['sources']) == 8
    for source in feed['sources']:
        assert source['raw_sha256'] == hashlib.sha256((evidence / source['file']).read_bytes()).hexdigest()
    actual = json.loads(out.read_text()); digest = actual.pop('feed_sha256')
    assert digest == hashlib.sha256(json.dumps(actual, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()
    assert 'test@example.com' not in out.read_text()


@pytest.mark.parametrize('failure', ['network', 'wrong-company', 'broken-rates', 'future-rates', 'empty-rates'])
def test_failed_refresh_preserves_previous_public_feed(tmp_path, failure):
    out = tmp_path / 'updates.json'; out.write_bytes(b'previous good snapshot')
    def broken_source(url, user_agent):
        if 'CIK0001326801' in url:
            if failure == 'network': raise OSError('offline')
            if failure == 'wrong-company': return json.dumps(submissions(1)).encode()
        if 'treasury.gov' in url:
            if failure == 'broken-rates': return xml(ten='NaN')
            if failure == 'future-rates': return xml('2026-10-16')
            if failure == 'empty-rates': return b'<feed />'
        return fetch(url, user_agent)
    with pytest.raises((ValueError, OSError)):
        collect_updates(out, 'Test test@example.com', fetch=broken_source, now=NOW)
    assert out.read_bytes() == b'previous good snapshot'


def test_year_boundary_accepts_no_new_year_rates_and_keeps_previous_business_day(tmp_path):
    def year_fetch(url, user_agent):
        if url.endswith('2026'): return b'<feed />'
        if url.endswith('2025'): return xml('2025-12-31')
        return fetch(url, user_agent)
    result = collect_updates(tmp_path/'feed.json', 'Test test@example.com', fetch=year_fetch,
                             now=datetime(2026, 1, 1, 12, tzinfo=timezone.utc))
    assert result['treasury']['observations'][-1]['date'] == '2025-12-31'


@pytest.mark.parametrize('target', ['http://data.sec.gov/submissions/new.json',
                                  'https://other.example/submissions/new.json',
                                  'https://home.treasury.gov/redirect'])
def test_redirect_is_rejected_before_contact_headers_can_leave_the_source(target):
    from urllib.request import Request
    from finscope.updates import OfficialRedirect
    request = Request('https://data.sec.gov/submissions/CIK0000789019.json',
                      headers={'User-Agent': 'Test test@example.com'})
    with pytest.raises(OSError):
        OfficialRedirect().redirect_request(request, None, 302, 'redirect', {}, target)


def test_same_host_https_redirect_can_proceed():
    from urllib.request import Request
    from finscope.updates import OfficialRedirect
    request = Request('https://data.sec.gov/submissions/old.json')
    redirected = OfficialRedirect().redirect_request(request, None, 302, 'redirect', {},
                                                     'https://data.sec.gov/submissions/new.json')
    assert redirected.full_url == 'https://data.sec.gov/submissions/new.json'


@pytest.mark.parametrize('empty', [b'<feed />', b'<feed><unexpected>upstream unavailable</unexpected></feed>'])
def test_empty_current_year_outside_new_year_preserves_prior_feed(tmp_path, empty):
    output = tmp_path/'updates.json'; output.write_bytes(b'previous validated feed')
    def empty_current_year(url, user_agent):
        return empty if url.endswith('2026') else fetch(url, user_agent)
    with pytest.raises(ValueError):
        collect_updates(output, 'Test test@example.com', fetch=empty_current_year, now=NOW)
    assert output.read_bytes() == b'previous validated feed'


def test_empty_previous_year_is_not_a_complete_source_capture(tmp_path):
    def empty_previous_year(url, user_agent):
        return b'<feed />' if url.endswith('2025') else fetch(url, user_agent)
    with pytest.raises(ValueError):
        collect_updates(tmp_path/'updates.json', 'Test test@example.com', fetch=empty_previous_year, now=NOW)
