"""Test that interim comparisons retain cash-flow-compatible YTD periods."""
import pytest

from finscope.interim import interim_snapshots


def fixture():
    facts = {}
    def add(tag, start, end, value, filed, form='10-Q'):
        rows = facts.setdefault(tag, {'units': {'USD': []}})['units']['USD']
        rows.append(dict(start=start, end=end, val=value, filed=filed, form=form, accn=filed.replace('-', '')+'-001'))
    for year in (2023, 2024):
        add('Revenues', f'{year}-01-01', f'{year}-12-31', 100, f'{year+1}-02-01', '10-K')
    for tag, prior, current in [('Revenues', 40, 60), ('NetIncomeLoss', 4, 9), ('OperatingIncomeLoss', 8, 15), ('NetCashProvidedByUsedInOperatingActivities', 5, 6)]:
        add(tag, '2024-01-01', '2024-06-30', prior, '2024-08-01')
        add(tag, '2025-01-01', '2025-06-30', current, '2025-08-01')
    # Distractors: standalone Q2 and a trailing year in the same filing.
    add('Revenues', '2025-04-01', '2025-06-30', 35, '2025-08-01')
    add('NetCashProvidedByUsedInOperatingActivities', '2025-04-01', '2025-06-30', 4, '2025-08-01')
    add('NetCashProvidedByUsedInOperatingActivities', '2024-07-01', '2025-06-30', 20, '2025-08-01')
    return {'cik': 1, 'facts': {'us-gaap': facts}}


def test_ytd_does_not_use_quarter_or_trailing_year():
    latest = interim_snapshots(fixture(), '2025-09-01')[-1]
    assert latest['current']['period_start'] == '2025-01-01'
    assert latest['current']['period_end'] == '2025-06-30'
    assert latest['current']['metrics']['revenue']['value'] == 60
    assert latest['current']['metrics']['operating_cash_flow']['value'] == 6
    assert latest['prior']['period_start'] == '2024-01-01'
    assert latest['changes']['revenue']['growth'] == pytest.approx(.5)
    assert latest['changes']['operating_cash_flow']['growth'] == pytest.approx(.2)
    assert latest['cash_margin_change_pp'] == pytest.approx(-2.5)


def test_interim_filing_is_unavailable_the_day_before_release():
    assert interim_snapshots(fixture(), '2025-07-31')[-1]['current']['period_end'] == '2024-06-30'
    rows = interim_snapshots(fixture(), '2025-09-01')
    assert all(f['filed'] <= r['as_of'] for r in rows for p in [r['current'], r['prior']] if p for f in p['metrics'].values() if f)


def test_future_amendment_cannot_change_past_but_updates_eligible_snapshot():
    p = fixture()
    facts = p['facts']['us-gaap']['NetIncomeLoss']['units']['USD']
    facts.append(dict(facts[-1], val=7, filed='2025-09-15', form='10-Q/A', accn='amended'))
    assert interim_snapshots(p, '2025-09-01') == interim_snapshots(fixture(), '2025-09-01')
    assert interim_snapshots(p, '2025-10-01')[-1]['current']['metrics']['net_income']['value'] == 7


def test_missing_ytd_cash_flow_is_missing_even_when_quarter_exists():
    p = fixture()
    p['facts']['us-gaap']['NetCashProvidedByUsedInOperatingActivities']['units']['USD'] = [r for r in p['facts']['us-gaap']['NetCashProvidedByUsedInOperatingActivities']['units']['USD'] if r['start'] != '2025-01-01']
    r = interim_snapshots(p, '2025-09-01')[-1]
    assert r['current']['metrics']['operating_cash_flow'] is None
    assert r['changes']['operating_cash_flow']['growth'] is None
    assert r['cash_margin_change_pp'] is None


def test_missing_or_nonpositive_prior_does_not_produce_growth_percentage():
    p = fixture()
    p['facts']['us-gaap']['NetIncomeLoss']['units']['USD'][0]['val'] = -4
    r = interim_snapshots(p, '2025-09-01')[-1]
    assert r['changes']['net_income']['growth'] is None
    assert r['changes']['net_income']['absolute'] == 13


def test_prior_ytd_must_have_matching_fiscal_start_and_coverage():
    p = fixture()
    p['facts']['us-gaap']['Revenues']['units']['USD'][2]['start'] = '2024-04-01'
    r = interim_snapshots(p, '2025-09-01')[-1]
    assert r['prior'] is None
    assert r['changes']['revenue']['growth'] is None


def test_annual_supersedes_earlier_interim_without_fabricating_new_quarter():
    p = fixture()
    p['facts']['us-gaap']['Revenues']['units']['USD'].append(dict(start='2025-01-01', end='2025-12-31', val=120, filed='2026-02-01', form='10-K', accn='annual'))
    result = interim_snapshots(p, '2026-03-01')
    assert result[-1]['current']['period_end'] == '2025-06-30'


def test_53_week_fiscal_calendar_keeps_a_comparable_ytd():
    p = fixture()
    for tag in p['facts']['us-gaap'].values():
        for r in tag['units']['USD']:
            if r['form'] == '10-K' and r['end'] == '2024-12-31':
                r['start'], r['end'] = '2024-01-07', '2025-01-04'
            elif r['start'] == '2024-01-01' and r['end'] == '2024-06-30':
                r['start'], r['end'] = '2024-01-07', '2024-07-06'
            elif r['start'] == '2025-01-01':
                r['start'], r['end'] = '2025-01-05', '2025-07-12'
    r = interim_snapshots(p, '2025-09-01')[-1]
    assert r['current']['period_start'] == '2025-01-05'
    assert r['prior']['period_end'] == '2024-07-06'
    assert r['changes']['revenue']['growth'] == pytest.approx(.5)


def test_nine_day_duration_mismatch_is_not_comparable():
    p = fixture()
    p['facts']['us-gaap']['Revenues']['units']['USD'][2]['end'] = '2024-06-20'
    assert interim_snapshots(p, '2025-09-01')[-1]['prior'] is None
