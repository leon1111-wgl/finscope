"""Independent small-number reconciliation checks, including provenance boundaries."""
import copy

from finscope.cash_bridge import cash_bridge, bridge_candidates


def fixture():
    raw = {'cik': 1, 'facts': {'us-gaap': {}}}
    def add(tag, val, **overrides):
        fact = dict(start='2025-01-01', end='2025-06-30', filed='2025-08-01',
                    form='10-Q', accn='same-filing', val=val)
        fact.update(overrides)
        raw['facts']['us-gaap'].setdefault(tag, {'units': {'USD': []}})['units']['USD'].append(fact)
    for tag, val in [('DepreciationDepletionAndAmortization', 20), ('ShareBasedCompensation', 10),
                     ('IncreaseDecreaseInAccountsReceivable', 30), ('IncreaseDecreaseInInventories', -5),
                     ('IncreaseDecreaseInAccountsPayable', 15)]:
        add(tag, val)
    # Overlapping subtotal, not an additional cash-flow contribution.
    add('DepreciationAmortizationAndAccretionNet', 21)
    def endpoint(value):
        return dict(value=value, start='2025-01-01', end='2025-06-30', filed='2025-08-01', accession='same-filing', url='https://www.sec.gov/example')
    row = {'period_start': '2025-01-01', 'period_end': '2025-06-30',
           'metrics': {'net_income': endpoint(100), 'operating_cash_flow': endpoint(130)}}
    return raw, row, add


def build(raw, row, day='2025-09-01'):
    return cash_bridge(bridge_candidates(raw, day), row, day)


def test_signs_and_residual_reconcile_without_overlapping_depreciation():
    raw, row, _ = fixture()
    b = build(raw, row)
    assert b['status'] == 'available'
    assert [v['effect'] for v in b['components']] == [20, 10, -30, 5, 15]
    assert b['selected_adjustments'] == 20
    assert b['residual'] == 10
    assert b['net_income'] + b['selected_adjustments'] + b['residual'] == b['operating_cash_flow']
    assert b['components'][0]['fact']['tag'] == 'DepreciationDepletionAndAmortization'


def test_quarter_ttm_and_other_accession_facts_cannot_fill_ytd_gap():
    raw, row, add = fixture()
    raw['facts']['us-gaap'].pop('IncreaseDecreaseInAccountsReceivable')
    add('IncreaseDecreaseInAccountsReceivable', 800, start='2025-04-01')
    add('IncreaseDecreaseInAccountsReceivable', 900, start='2024-07-01')
    add('IncreaseDecreaseInAccountsReceivable', 700, accn='different-filing')
    b = build(raw, row)
    assert b['components'][2]['fact'] is None
    assert b['components'][2]['effect'] is None
    assert 'receivables' in b['missing_components']
    assert b['residual'] == -20


def test_future_amendment_does_not_rewrite_source_filing():
    raw, row, add = fixture()
    expected = build(raw, row)
    add('ShareBasedCompensation', 999, filed='2025-10-01', form='10-Q/A', accn='amendment')
    assert build(raw, row) == expected
    assert build(raw, row, '2025-10-02') == expected


def test_missing_or_incompatible_endpoints_do_not_invent_reconciliation():
    raw, row, _ = fixture()
    for mutate in [lambda r: r['metrics'].__setitem__('operating_cash_flow', None),
                   lambda r: r['metrics']['net_income'].__setitem__('accession', 'other'),
                   lambda r: r['metrics']['net_income'].__setitem__('start', '2025-04-01')]:
        r = copy.deepcopy(row); mutate(r)
        b = build(raw, r)
        assert b['status'] == 'unavailable'
        assert b['residual'] is None


def test_missing_all_components_is_visible_and_zero_is_observed():
    raw, row, add = fixture()
    raw['facts']['us-gaap'] = {}
    b = build(raw, row)
    assert len(b['missing_components']) == 5
    assert b['residual'] == 30
    add('ShareBasedCompensation', 0)
    b = build(raw, row)
    assert b['components'][1]['effect'] == 0
    assert 'share_based_compensation' not in b['missing_components']


def test_nonfinite_value_and_future_endpoint_are_rejected():
    raw, row, _ = fixture()
    raw['facts']['us-gaap']['ShareBasedCompensation']['units']['USD'][0]['val'] = float('nan')
    assert build(raw, row)['components'][1]['effect'] is None
    assert build(raw, row, '2025-07-31')['status'] == 'unavailable'
