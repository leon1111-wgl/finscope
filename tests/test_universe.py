"""Universe pipeline rules on synthetic CompanyFacts payloads (no network)."""
import json

from finscope.universe import company_shard, fiscal_periods, name_aliases, template_for


def payload(rows, cik=99):
    facts = {}
    for tag, unit, val, start, end, filed, form, accn, fy in rows:
        entry = {'val': val, 'end': end, 'filed': filed, 'form': form, 'accn': accn, 'fy': fy, 'fp': 'FY'}
        if start:
            entry['start'] = start
        facts.setdefault(tag, {'units': {}})['units'].setdefault(unit, []).append(entry)
    return {'cik': cik, 'entityName': 'TEST CO', 'facts': {'us-gaap': facts}}


SUB = {'name': 'Test Co', 'tickers': ['TST'], 'exchanges': ['NYSE'], 'sic': '3571', 'sicDescription': 'Electronic Computers',
       'fiscalYearEnd': '1231', 'category': 'Large accelerated filer', 'filings': {'recent': {'accessionNumber': ['A-24', 'A-25'], 'form': ['10-K', '10-K'], 'primaryDocument': ['t-2023.htm', 't-2024.htm'], 'reportDate': ['2023-12-31', '2024-12-31']}}}
Y23 = ('2023-01-01', '2023-12-31')
Y24 = ('2024-01-01', '2024-12-31')


def two_years(extra=()):
    return [
        ('Revenues', 'USD', 900, *Y23, '2024-02-10', '10-K', 'A-24', 2023),
        ('RevenueFromContractWithCustomerExcludingAssessedTax', 'USD', 1000, *Y24, '2025-02-10', '10-K', 'A-25', 2024),
        ('RevenueFromContractWithCustomerExcludingAssessedTax', 'USD', 900, *Y23, '2025-02-10', '10-K', 'A-25', 2024),
        ('NetIncomeLoss', 'USD', 100, *Y23, '2024-02-10', '10-K', 'A-24', 2023),
        ('NetIncomeLoss', 'USD', 110, *Y23, '2025-02-10', '10-K', 'A-25', 2024),
        ('NetIncomeLoss', 'USD', 150, *Y24, '2025-02-10', '10-K', 'A-25', 2024),
        ('Assets', 'USD', 5000, None, '2023-12-31', '2024-02-10', '10-K', 'A-24', 2023),
        ('Assets', 'USD', 6000, None, '2024-12-31', '2025-02-10', '10-K', 'A-25', 2024),
        ('AssetsCurrent', 'USD', 2000, None, '2024-12-31', '2025-02-10', '10-K', 'A-25', 2024),
        *extra,
    ]


def test_periods_come_from_original_10k_with_company_labels():
    periods = fiscal_periods(payload(two_years()))
    assert [(p['fy'], p['start'], p['end'], p['accession']) for p in periods] == [(2023, *Y23, 'A-24'), (2024, *Y24, 'A-25')]
    retail = payload([('Revenues', 'USD', 1, '2024-02-04', '2025-02-01', '2025-03-12', '10-K', 'R-1', 2024)])
    assert fiscal_periods(retail)[0]['fy'] == 2024 and fiscal_periods(retail)[0]['fy_source'] == 'dei'
    implausible = payload([('Revenues', 'USD', 1, *Y24, '2025-03-01', '10-K', 'R-2', 2031)])
    assert fiscal_periods(implausible)[0]['fy'] == 2024 and fiscal_periods(implausible)[0]['fy_source'] == 'end_year'


def test_latest_filing_wins_restatement_and_fallback_are_recorded():
    shard = company_shard(payload(two_years()), SUB)
    ni = shard['values']['net_income']
    assert ni[0]['v'] == 110 and ni[0]['accn'] == 'A-25' and ni[0]['first'] == {'v': 100, 'tag': 'NetIncomeLoss', 'accn': 'A-24', 'filed': '2024-02-10'}
    rev = shard['values']['revenue']
    assert rev[0]['tag'] == 'RevenueFromContractWithCustomerExcludingAssessedTax' and rev[0]['via'] == 'primary'
    kinds = {(q['kind'], q.get('metric')) for q in shard['quality']}
    assert ('restated', 'net_income') in kinds
    only_old = company_shard(payload([r for r in two_years() if not (r[0].startswith('RevenueFrom') and r[4] == Y23[1])]), SUB)
    assert only_old['values']['revenue'][0]['tag'] == 'Revenues' and only_old['values']['revenue'][0]['via'] == 'fallback'
    assert any(q['kind'] == 'fallback' and q['metric'] == 'revenue' and q['fy'] == [2023] for q in only_old['quality'])


def test_missing_is_never_zero_and_template_drops_unsupported():
    shard = company_shard(payload(two_years()), SUB)
    assert shard['values']['gross_profit'] == [None, None]
    assert any(q['kind'] == 'missing' and q['metric'] == 'gross_profit' for q in shard['quality'])
    bank = company_shard(payload([r for r in two_years() if r[0] != 'AssetsCurrent']), {**SUB, 'sic': '6022'})
    assert bank['template'] == 'bank' and 'gross_profit' not in bank['values'] and 'gross_profit' in bank['unsupported']
    assert 'deposits' in bank['values'] and any(q['kind'] == 'template' for q in bank['quality'])
    assert template_for('6798', {}) == 'reit' and template_for('6331', {}) == 'insurance'
    assert template_for('6324', {'facts': {'us-gaap': {'AssetsCurrent': {'units': {}}}}}) == 'industrial'


def test_conflicting_values_in_one_filing_are_not_stated():
    shard = company_shard(payload(two_years([('OperatingIncomeLoss', 'USD', 70, *Y24, '2025-02-10', '10-K', 'A-25', 2024),
                                              ('OperatingIncomeLoss', 'USD', 75, *Y24, '2025-02-10', '10-K', 'A-25', 2024)])), SUB)
    cell = shard['values']['operating_income'][1]
    assert 'v' not in cell and cell['conflict'] == [70, 75]
    assert any(q['kind'] == 'conflict' for q in shard['quality'])


def test_total_revenue_beats_a_contract_subset_in_the_same_filing():
    shard = company_shard(payload(two_years([('Revenues', 'USD', 1100, *Y24, '2025-02-10', '10-K', 'A-25', 2024)])), SUB)
    cell = shard['values']['revenue'][1]
    assert cell['v'] == 1100 and cell['tag'] == 'Revenues' and cell['via'] == 'total' and 'customer contracts only' in cell['note']


def test_compositions_keep_their_parts_from_one_filing():
    extra = [('LiabilitiesAndStockholdersEquity', 'USD', 6000, None, '2024-12-31', '2025-02-10', '10-K', 'A-25', 2024),
             ('StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'USD', 2500, None, '2024-12-31', '2025-02-10', '10-K', 'A-25', 2024),
             ('LongTermDebt', 'USD', 800, None, '2024-12-31', '2025-02-10', '10-K', 'A-25', 2024),
             ('ShortTermBorrowings', 'USD', 50, None, '2024-12-31', '2025-02-10', '10-K', 'A-25', 2024),
             ('LongTermDebtNoncurrent', 'USD', 700, None, '2023-12-31', '2024-02-10', '10-K', 'A-24', 2023),
             ('SellingAndMarketingExpense', 'USD', 30, *Y24, '2025-02-10', '10-K', 'A-25', 2024),
             ('GeneralAndAdministrativeExpense', 'USD', 20, *Y24, '2025-02-10', '10-K', 'A-25', 2024)]
    shard = company_shard(payload(two_years(extra)), SUB)
    liab = shard['values']['liabilities'][1]
    assert liab['v'] == 3500 and liab['via'] == 'derived' and [p['sign'] for p in liab['parts']] == [1, -1]
    debt = shard['values']['total_debt']
    assert debt[1]['v'] == 850 and [p['tag'] for p in debt[1]['parts']] == ['LongTermDebt', 'ShortTermBorrowings']
    assert debt[0]['v'] == 700 and 'counted as zero' in debt[0]['note']
    sga = shard['values']['sga'][1]
    assert sga['v'] == 50 and sga['via'] == 'derived'


def test_amended_filing_and_fiscal_year_change_are_noted():
    extra = [('NetIncomeLoss', 'USD', 151, *Y24, '2025-06-01', '10-K/A', 'A-25A', 2024),
             ('Revenues', 'USD', 600, '2025-01-01', '2025-06-30', '2025-08-01', '10-KT', 'T-1', 2025),
             ('Revenues', 'USD', 1300, '2025-07-01', '2026-06-30', '2026-08-20', '10-K', 'A-26', 2026)]
    shard = company_shard(payload(two_years(extra)), SUB)
    assert shard['values']['net_income'][1]['form'] == '10-K/A'
    kinds = [q['kind'] for q in shard['quality']]
    assert 'amended' in kinds and 'fiscal_shift' in kinds and 'fiscal_gap' in kinds
    assert [p['fy'] for p in shard['periods']] == [2023, 2024, 2026]


def test_shards_are_deterministic_and_link_every_accession():
    a = json.dumps(company_shard(payload(two_years()), SUB), sort_keys=True)
    b = json.dumps(company_shard(payload(two_years()), SUB), sort_keys=True)
    assert a == b
    shard = company_shard(payload(two_years()), SUB)
    for row in shard['values'].values():
        for cell in row:
            if cell:
                assert cell['accn'] in shard['filings']
    assert shard['filings']['A-25']['doc'] == 't-2024.htm'


def test_name_aliases():
    assert 'coca cola' in name_aliases('COCA COLA CO')
    assert 'home depot' in name_aliases('HOME DEPOT, INC.')
    assert 'horton d r' in name_aliases('HORTON D R INC /DE/')
    assert 'apple' in name_aliases('Apple Inc.')


def test_two_periods_with_one_label_never_share_it():
    rows = [('Revenues', 'USD', 10, '2022-07-01', '2023-06-30', '2023-08-20', '10-K', 'J-1', 2023),
            ('Revenues', 'USD', 12, '2023-01-01', '2023-12-31', '2024-02-20', '10-K', 'D-1', 2023)]
    periods = fiscal_periods(payload(rows))
    assert [p['end'] for p in periods] == ['2023-12-31'] and periods[0]['replaces'][0]['end'] == '2023-06-30'
    shard = company_shard(payload(rows), SUB)
    assert len({p['fy'] for p in shard['periods']}) == len(shard['periods'])
    assert any(q['kind'] == 'fiscal_shift' and 'not shown' in q['text'] for q in shard['quality'])
