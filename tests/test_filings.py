import copy
import pytest

from finscope.filings import filing_records, attach_filing_links, archive_names


def submission():
    return {'cik': 123, 'filings': {'recent': {
        'accessionNumber': ['0000000123-26-000001'], 'filingDate': ['2026-08-01'],
        'reportDate': ['2026-06-30'], 'form': ['10-Q'], 'primaryDocument': ['company-20260630.htm']},
        'files': [{'name': 'CIK0000000123-submissions-001.json', 'filingFrom':'2010-01-01','filingTo':'2020-01-01'}]}}


def fact():
    return {'accession':'0000000123-26-000001', 'form':'10-Q', 'filed':'2026-08-01',
            'start':'2025-01-01','end':'2025-06-30','url':'https://www.sec.gov/Archives/edgar/data/123/000000012326000001/'}


def test_official_primary_document_resolves_without_guessing_filename():
    records=filing_records(submission(),123)
    f=fact(); stats=attach_filing_links({'nested':[f]},records)
    assert f['url'].endswith('/123/000000012326000001/company-20260630.htm')
    assert f['archive_url'].endswith('/000000012326000001/')
    assert f['filing_index_url'].endswith('/0000000123-26-000001-index.html')
    assert stats['resolved']==1
    # Prior-period comparative facts may legitimately be sourced from a newer report.
    assert f['end']=='2025-06-30'


def test_mismatched_company_date_or_form_cannot_rewrite_source():
    with pytest.raises(ValueError): filing_records(submission(),999)
    records=filing_records(submission(),123)
    for key,val in [('filed','2026-09-01'),('form','10-K'),('url','https://www.sec.gov/Archives/edgar/data/999/000000012326000001/')]:
        f=fact();f[key]=val;before=copy.deepcopy(f)
        assert attach_filing_links(f,records)['resolved']==0
        assert f==before


@pytest.mark.parametrize('name',['../outside.htm','https://evil.test/x.htm','x.htm?query=1','x.htm#anchor','x%2f.htm'])
def test_unsafe_document_paths_keep_a_transparent_index_fallback(name):
    p=submission();p['filings']['recent']['primaryDocument']=[name]
    f=fact();attach_filing_links(f,filing_records(p,123))
    assert f['link_kind']=='filing_index'
    assert f['url'].endswith('-index.html')


def test_archived_columnar_records_and_missing_primary_document():
    p=submission()['filings']['recent'];p['primaryDocument']=['']
    f=fact();attach_filing_links(f,filing_records(p,123))
    assert f['link_kind']=='filing_index'
    assert 'document_url' not in f


def test_misaligned_columns_fail_instead_of_pairing_wrong_documents():
    p=submission();p['filings']['recent']['primaryDocument']=[]
    with pytest.raises(ValueError):filing_records(p,123)


def test_archives_are_official_same_cik_names_and_overlap_needed_dates():
    p=submission();p['filings']['files'] += [
        {'name':'CIK0000000999-submissions-001.json','filingFrom':'2010-01-01','filingTo':'2020-01-01'},
        {'name':'../outside.json','filingFrom':'2010-01-01','filingTo':'2020-01-01'},
        {'name':'CIK0000000123-submissions-002.json','filingFrom':'2000-01-01','filingTo':'2009-12-31'}]
    assert archive_names(p,123,{'2015-01-01'})==['CIK0000000123-submissions-001.json']


def test_unresolved_facts_retain_the_existing_source():
    f=fact();before=copy.deepcopy(f)
    assert attach_filing_links(f,{})=={'total':1,'resolved':0,'direct':0,'index':0}
    assert f==before


def test_repeated_resolution_clears_a_stale_primary_document():
    f = fact()
    attach_filing_links(f, filing_records(submission(), 123))
    p = submission()
    p['filings']['recent']['primaryDocument'] = ['']
    attach_filing_links(f, filing_records(p, 123))
    assert f['link_kind'] == 'filing_index'
    assert 'document_url' not in f


def test_offline_metadata_must_match_manifest_hash(tmp_path):
    import hashlib
    import json
    from finscope.filings import load_submission_file
    name = 'CIK0000000123.json'
    path = tmp_path / 'submissions' / name
    path.parent.mkdir()
    raw = json.dumps(submission()).encode()
    path.write_bytes(raw)
    sources = {'sec-submissions-CIK0000000123': {'raw_sha256': hashlib.sha256(raw).hexdigest()}}
    assert load_submission_file(123, name, tmp_path, sources, offline=True, user_agent='') == submission()
    path.write_bytes(raw + b' ')
    with pytest.raises(ValueError, match='hash mismatch'):
        load_submission_file(123, name, tmp_path, sources, offline=True, user_agent='')


def test_malformed_accession_is_ignored():
    p = submission()
    p['filings']['recent']['accessionNumber'] = [123]
    assert filing_records(p, 123) == {}


@pytest.mark.parametrize('fails', [True, False])
def test_metadata_refresh_promotes_cache_only_after_complete_success(tmp_path, monkeypatch, fails):
    import hashlib
    import json
    from io import BytesIO
    import finscope.filings as module
    name = 'CIK0000000123.json'
    path = tmp_path / 'submissions' / name
    path.parent.mkdir()
    old_raw = json.dumps(submission()).encode()
    path.write_bytes(old_raw)
    sources = {'sec-submissions-CIK0000000123': {'raw_sha256': hashlib.sha256(old_raw).hexdigest()}}
    before = copy.deepcopy(sources)
    changed = submission()
    changed['filings']['recent']['primaryDocument'] = ['changed.htm']
    new_raw = json.dumps(changed).encode()
    def response(request, timeout):
        if request.full_url.endswith('CIK0000000123.json'):
            return BytesIO(new_raw)
        raise OSError('Later metadata request failed')
    monkeypatch.setattr(module, 'urlopen', response)
    monkeypatch.setattr(module.time, 'sleep', lambda _: None)
    def refresh():
        with module.staged_filing_sources(tmp_path, sources, refresh=True) as staging:
            module.load_submission_file(123, name, staging, sources, offline=False, user_agent='test test@example.com')
            assert path.read_bytes() == old_raw
            if fails:
                module.load_submission_file(999, 'CIK0000000999.json', staging, sources, offline=False, user_agent='test test@example.com')
    if fails:
        with pytest.raises(OSError, match='Later metadata'):
            refresh()
        assert path.read_bytes() == old_raw
        assert sources == before
        assert module.load_submission_file(123, name, tmp_path, sources, offline=True, user_agent='') == submission()
    else:
        refresh()
        assert path.read_bytes() == new_raw
        assert module.load_submission_file(123, name, tmp_path, sources, offline=True, user_agent='') == changed
