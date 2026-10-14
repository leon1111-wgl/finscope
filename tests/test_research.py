"""Independent small-number checks for the real-company research pipeline."""
import copy
import math

import pytest

from finscope.fundamentals import annual_history
from finscope.research import score_profiles
from finscope.treasury import parse_treasury


def payload():
    tags = {
        'RevenueFromContractWithCustomerExcludingAssessedTax': (100, True),
        'NetIncomeLoss': (12, True), 'OperatingIncomeLoss': (20, True),
        'NetCashProvidedByUsedInOperatingActivities': (15, True),
        'Assets': (200, False), 'Liabilities': (80, False),
        'AssetsCurrent': (60, False), 'LiabilitiesCurrent': (30, False),
        'CashAndCashEquivalentsAtCarryingValue': (25, False),
    }
    facts = {}
    for tag, (value, flow) in tags.items():
        rows = []
        for year in range(2010, 2026):
            row = dict(val=value + year - 2010, end=f'{year}-12-31',
                       filed=f'{year+1}-02-01', form='10-K', accn=f'{year}-000001')
            if flow:
                row['start'] = f'{year}-01-01'
            rows.append(row)
        facts[tag] = {'units': {'USD': rows}}
    return {'cik': 1, 'entityName': 'Example', 'facts': {'us-gaap': facts}}


def test_asof_excludes_future_filings_and_aligns_balances():
    result = annual_history(payload(), '2025-01-15')
    latest = result[-1]
    assert latest['period_end'] == '2023-12-31'
    assert latest['metrics']['revenue']['value'] == 113
    assert latest['metrics']['assets']['end'] == latest['period_end']
    assert all(f['filed'] <= '2025-01-15' for row in result for f in row['metrics'].values() if f)


def test_restatement_only_applies_after_filing_and_quarter_is_not_annual():
    p = payload()
    rows = p['facts']['us-gaap']['NetIncomeLoss']['units']['USD']
    rows.append(dict(rows[-2], val=999, filed='2026-03-01', form='10-K/A'))
    rows.append(dict(rows[-2], val=777, start='2024-10-01', filed='2025-03-01'))
    assert annual_history(p, '2025-06-01')[-1]['metrics']['net_income']['value'] == 26
    assert annual_history(p, '2026-04-01')[-2]['metrics']['net_income']['value'] == 999


def test_missing_and_nonfinite_facts_do_not_become_zero():
    p = payload()
    p['facts']['us-gaap']['LiabilitiesCurrent']['units']['USD'] = []
    p['facts']['us-gaap']['Assets']['units']['USD'][-2]['val'] = math.inf
    row = annual_history(p, '2025-06-01')[-1]
    assert row['metrics']['assets'] is None
    assert row['ratios']['current_ratio'] is None
    assert row['ratios']['liabilities_assets'] is None


def test_ratio_units_and_accruals_have_small_number_oracle():
    row = annual_history(payload(), '2012-03-01')[-1]
    assert row['ratios']['operating_margin'] == pytest.approx(21/101)
    assert row['ratios']['cash_margin'] == pytest.approx(16/101)
    assert row['ratios']['accruals'] == pytest.approx((13-16)/200.5)
    assert row['ratios']['revenue_growth'] == pytest.approx(101/100-1)


def test_anomaly_training_excludes_scored_period_and_future_information():
    histories = {str(i): annual_history(payload(), '2026-04-01') for i in range(3)}
    result = score_profiles(histories, '2025-06-01')
    assert result['training']['last_period_end'] < '2024-12-31'
    assert result['training']['latest_filed'] <= '2025-06-01'
    assert result['training']['samples'] >= 30
    assert 0 <= result['scores']['0']['percentile'] <= 100
    assert result == score_profiles(histories, '2025-06-01')
    altered = copy.deepcopy(histories)
    for rows in altered.values():
        rows[-1]['ratios']['operating_margin'] = 1e9
    assert result == score_profiles(altered, '2025-06-01')


def test_insufficient_history_disables_ai():
    result = score_profiles({'A': annual_history(payload(), '2011-03-01')}, '2011-03-01')
    assert result['scores'] == {}
    assert result['status'] == 'insufficient_history'


def test_treasury_xml_keeps_percentage_units_and_missing_values():
    raw = b'''<feed xmlns:m="urn:m" xmlns:d="urn:d"><entry><m:properties>
    <d:NEW_DATE>2026-10-13T00:00:00</d:NEW_DATE><d:BC_2YEAR>4.79</d:BC_2YEAR>
    <d:BC_10YEAR>5.21</d:BC_10YEAR><d:BC_30YEAR m:null="true"/>
    </m:properties></entry></feed>'''
    rows = parse_treasury(raw)
    assert rows == [{'date': '2026-10-13', '3m': None, '2y': 4.79, '5y': None, '10y': 5.21, '30y': None}]
    with pytest.raises(ValueError):
        parse_treasury(b'<feed/>')


def test_committed_public_bundle_has_valid_boundaries_and_hash():
    import hashlib
    import json
    from pathlib import Path
    from scripts.build_research import validate
    bundle = json.loads((Path(__file__).resolve().parents[1] / 'web/data/research.json').read_text())
    validate(bundle)
    expected = bundle.pop('dataset_sha256')
    actual = hashlib.sha256(json.dumps(bundle, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()
    assert expected == actual
    for snapshot in bundle['snapshots']:
        training = snapshot['ai']['training']
        if 'latest_filed' in training:
            assert training['latest_filed'] <= snapshot['as_of']
