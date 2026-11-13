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
    assert only_old['values']['revenue'][0]['tag'] == 'Revenues' and only_old['values']['revenue'][0]['via'] == 'primary', 'Revenues is a standard revenue tag'
    sales = company_shard(payload([('SalesRevenueNet', 'USD', 900, *Y23, '2024-02-10', '10-K', 'A-24', 2023)] + [r for r in two_years() if not (r[0] in ('Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax') and r[4] == Y23[1])]), SUB)
    assert sales['values']['revenue'][0]['tag'] == 'SalesRevenueNet' and sales['values']['revenue'][0]['via'] == 'fallback'
    assert any(q['kind'] == 'fallback' and q['metric'] == 'revenue' and q['fy'] == [2023] for q in sales['quality'])


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
    assert debt[1] is None and debt[0] is None, 'LongTermDebt plus short-term borrowings, or noncurrent debt alone, is not a total'
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
    assert [(p['fy'], p['end']) for p in periods] == [(2022, '2023-06-30'), (2023, '2023-12-31')]
    shard = company_shard(payload(rows), SUB)
    assert len({p['fy'] for p in shard['periods']}) == len(shard['periods'])
    assert any(q['kind'] == 'fiscal_shift' for q in shard['quality']) and any(q['kind'] == 'label' for q in shard['quality'])


def test_debt_from_the_combined_debt_and_lease_tag_is_a_noted_fallback():
    extra = [('DebtAndCapitalLeaseObligations', 'USD', 900, None, '2024-12-31', '2025-02-10', '10-K', 'A-25', 2024)]
    shard = company_shard(payload(two_years(extra)), SUB)
    cell = shard['values']['total_debt'][1]
    assert cell['v'] == 900 and cell['via'] == 'fallback' and 'finance lease' in cell['note']
    fallback = [q for q in shard['quality'] if q['kind'] == 'fallback' and q['metric'] == 'total_debt']
    assert fallback and 'DebtLongtermAndShorttermCombinedAmount' in fallback[0]['text']


# ---- Fable review classes (failing first) ----
def test_an_older_year_keeps_its_first_choice_tag_from_an_earlier_filing():
    extra = [('StockholdersEquity', 'USD', 100, None, '2023-12-31', '2024-02-10', '10-K', 'A-24', 2023),
             ('StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'USD', 110, None, '2023-12-31', '2025-02-10', '10-K', 'A-25', 2024),
             ('StockholdersEquity', 'USD', 120, None, '2024-12-31', '2025-02-10', '10-K', 'A-25', 2024),
             ('CashAndCashEquivalentsAtCarryingValue', 'USD', 30, None, '2023-12-31', '2024-02-10', '10-K', 'A-24', 2023),
             ('CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'USD', 45, None, '2023-12-31', '2025-02-10', '10-K', 'A-25', 2024)]
    shard = company_shard(payload(two_years(extra)), SUB)
    eq, cash = shard['values']['equity'][0], shard['values']['cash'][0]
    assert (eq['v'], eq['tag'], eq['via']) == (100, 'StockholdersEquity', 'primary') and 'first' not in eq
    assert (cash['v'], cash['tag']) == (30, 'CashAndCashEquivalentsAtCarryingValue')
    assert not any(q['kind'] == 'restated' and q['metric'] in ('equity', 'cash') for q in shard['quality'])


def test_cash_and_short_term_investments_is_never_cash_alone():
    extra = [('CashAndCashEquivalentsAtCarryingValue', 'USD', 30, None, '2023-12-31', '2024-02-10', '10-K', 'A-24', 2023),
             ('ShortTermInvestments', 'USD', 20, None, '2023-12-31', '2024-02-10', '10-K', 'A-24', 2023),
             ('CashAndCashEquivalentsAtCarryingValue', 'USD', 30, None, '2023-12-31', '2025-02-10', '10-K', 'A-25', 2024),
             ('CashAndCashEquivalentsAtCarryingValue', 'USD', 40, None, '2024-12-31', '2025-02-10', '10-K', 'A-25', 2024)]
    shard = company_shard(payload(two_years(extra)), SUB)
    assert shard['values']['cash_sti'][0]['v'] == 50, 'an earlier filing with both parts is used'
    assert shard['values']['cash_sti'][1] is None, 'no short-term investment line anywhere: not reported'


def test_total_debt_is_withheld_when_it_cannot_be_right():
    years = [(str(y), f'{y}-01-01', f'{y}-12-31', f'{y + 1}-02-10', f'D-{y}') for y in range(2019, 2025)]
    rows = []
    for y, s, e, f, a in years:
        rows += [('Revenues', 'USD', 1000, s, e, f, '10-K', a, int(y)), ('Liabilities', 'USD', 5000, None, e, f, '10-K', a, int(y)),
                 ('DebtLongtermAndShorttermCombinedAmount', 'USD', 26 if y == '2022' else 3000, None, e, f, '10-K', a, int(y))]
    shard = company_shard(payload(rows), SUB)
    debt = shard['values']['total_debt']
    assert debt[3] is None and all(c and c['v'] == 3000 for i, c in enumerate(debt) if i != 3), 'a stray value far from the other years is withheld'
    assert any(q['kind'] == 'withheld' and q['metric'] == 'total_debt' for q in shard['quality'])
    over = company_shard(payload([r if r[0] != 'Liabilities' else (r[0], r[1], 2000, *r[3:]) for r in rows]), SUB)
    assert all(c is None for c in over['values']['total_debt']), 'debt above total liabilities is withheld'


def test_long_term_debt_plus_short_term_borrowings_is_not_double_counted():
    extra = [('LongTermDebt', 'USD', 800, None, '2024-12-31', '2025-02-10', '10-K', 'A-25', 2024),
             ('ShortTermBorrowings', 'USD', 50, None, '2024-12-31', '2025-02-10', '10-K', 'A-25', 2024)]
    shard = company_shard(payload(two_years(extra)), SUB)
    assert shard['values']['total_debt'][1] is None, 'without LongTermDebtCurrent the split of borrowings is unknown'


def test_share_count_jumps_mark_a_split_and_eps_uses_its_own_tolerance():
    rows = two_years([('WeightedAverageNumberOfDilutedSharesOutstanding', 'shares', 100, *Y23, '2024-02-10', '10-K', 'A-24', 2023),
                      ('WeightedAverageNumberOfDilutedSharesOutstanding', 'shares', 400, *Y24, '2025-02-10', '10-K', 'A-25', 2024),
                      ('EarningsPerShareDiluted', 'USD/shares', 1.10, *Y23, '2024-02-10', '10-K', 'A-24', 2023),
                      ('EarningsPerShareDiluted', 'USD/shares', 1.30, *Y23, '2025-02-10', '10-K', 'A-25', 2024)])
    shard = company_shard(payload(rows), SUB)
    assert shard['values']['eps_diluted'][0]['first']['v'] == 1.10, 'a 0.20 change in EPS is a change, not rounding'
    assert any(q['kind'] == 'split' and q['fy'] == [2024] for q in shard['quality'])
    assert shard['splits'] == [2024]
    note = next(q['text'] for q in shard['quality'] if q['kind'] == 'restated' and q['metric'] == 'eps_diluted')
    assert '1.10' in note and '1.30' in note


def test_labels_count_back_from_the_latest_10k():
    rows = [('Revenues', 'USD', 1, '2022-12-31', '2023-12-30', '2024-02-20', '10-K', 'L-1', 2024),
            ('Revenues', 'USD', 1, '2023-12-31', '2024-12-28', '2025-02-20', '10-K', 'L-2', 2024),
            ('Revenues', 'USD', 1, '2024-12-29', '2026-01-03', '2026-02-20', '10-K', 'L-3', 2025)]
    labels = [(p['fy'], p['end']) for p in fiscal_periods(payload(rows))]
    assert labels == [(2023, '2023-12-30'), (2024, '2024-12-28'), (2025, '2026-01-03')]


def test_negative_payments_are_shown_as_payments_with_a_note():
    shard = company_shard(payload(two_years([('PaymentsToAcquirePropertyPlantAndEquipment', 'USD', -70, *Y24, '2025-02-10', '10-K', 'A-25', 2024)])), SUB)
    cell = shard['values']['capex'][1]
    assert cell['v'] == 70 and 'negative sign' in cell['note']


# ------------------------------------------------------------------ fiscal-year labels (probe of b12433a)
def years(ends, owns, filed_after=60):
    """One 10-K per period: (start, end, own DEI label); each filing also reports the prior year as a comparative."""
    from datetime import date, timedelta
    rows = []
    for k, (end, own) in enumerate(zip(ends, owns)):
        e = date.fromisoformat(end)
        start = date.fromisoformat(ends[k - 1]) + timedelta(days=1) if k else e - timedelta(days=364)
        start = (start if (e - start).days <= 380 else e - timedelta(days=364)).isoformat()
        rows.append(('Revenues', 'USD', 100 + k, start, end, (e + timedelta(days=filed_after)).isoformat(), '10-K', f'Y-{k}', own))
    return payload(rows)


def labels_of(ends, owns):
    return [p['fy'] for p in fiscal_periods(years(ends, owns))]


DEC = [f'{y}-12-31' for y in range(2016, 2026)]
SEP = [f'{y}-09-30' for y in range(2016, 2026)]
JAN = [f'{y}-01-31' for y in range(2017, 2027)]


def test_one_mistyped_latest_label_does_not_shift_the_history():
    # FRT and HUN: the 10-K for the year ended 2025-12-31 says FY2024; every earlier 10-K labels by end year.
    assert labels_of(DEC, list(range(2016, 2025)) + [2024]) == list(range(2016, 2026))
    # POST and IESC: the same with a September year end.
    assert labels_of(SEP, list(range(2016, 2025)) + [2024]) == list(range(2016, 2026))
    # CRM: January year end labelled by end year; two filings (2021 and 2026) carry one less.
    owns = [2017, 2018, 2019, 2020, 2020, 2022, 2023, 2024, 2025, 2025]
    assert labels_of(JAN, owns) == list(range(2017, 2027))
    shard = company_shard(years(JAN, owns), SUB)
    note = next(q['text'] for q in shard['quality'] if q['kind'] == 'label')
    assert 'the year ended 2026-01-31 is FY2026 here (its own filing says FY2025)' in note
    assert 'the year ended 2021-01-31 is FY2021 here (its own filing says FY2020)' in note
    assert not any('starts' in q['text'] or 'one less than the calendar year' in q['text'] for q in shard['quality'])
    assert [p['fy_reported'] for p in shard['periods']] == owns


def test_companies_that_name_the_year_before_keep_their_labels():
    # Roivant: March year end; older 10-Ks label by end year, the three latest by start year (FY2025 ended 2026-03-31).
    roiv = ['2022-03-31', '2023-03-31', '2024-03-31', '2025-03-31', '2026-03-31']
    assert labels_of(roiv, [2022, 2023, 2023, 2024, 2025]) == [2021, 2022, 2023, 2024, 2025]
    # Target and Home Depot: the year ended around 1 February 2026 is fiscal 2025.
    tgt = ['2022-01-29', '2023-01-28', '2024-02-03', '2025-02-01', '2026-01-31']
    assert labels_of(tgt, [2021, 2022, 2023, 2024, 2025]) == [2021, 2022, 2023, 2024, 2025]
    hd = ['2022-01-30', '2023-01-29', '2024-01-28', '2025-02-02', '2026-02-01']
    shard = company_shard(years(hd, [2021, 2022, 2023, 2024, 2025]), SUB)
    assert [p['fy'] for p in shard['periods']] == [2021, 2022, 2023, 2024, 2025]
    note = next(q['text'] for q in shard['quality'] if q['kind'] == 'label')
    assert 'one less than the calendar year in which they end' in note and 'FY2025 ended 2026-02-01' in note and 'starts' not in note
    # Walmart: the year ended 2026-01-31 is fiscal 2026.
    assert labels_of(JAN[-5:], [2022, 2023, 2024, 2025, 2026]) == [2022, 2023, 2024, 2025, 2026]


def test_label_majority_edge_cases():
    # 52/53-week years ending in the first days of January belong to the year before (ONTO, WWW, AAP, HLIO).
    ends = ['2021-01-02', '2022-01-01', '2022-12-31', '2023-12-30', '2024-12-28', '2026-01-03']
    assert labels_of(ends, [2020, 2021, 2022, 2023, 2024, 2026]) == [2020, 2021, 2022, 2023, 2024, 2025]
    # Core & Main: the two latest labels are neither the end year nor one less, so they do not vote.
    cnm = ['2022-01-30', '2023-01-29', '2024-01-28', '2025-02-02', '2026-02-01']
    assert labels_of(cnm, [2021, 2022, 2023, 2023, 2023]) == [2021, 2022, 2023, 2024, 2025]
    # A tie goes to the latest 10-K's labelling.
    assert labels_of(DEC[-2:], [2024, 2024]) == [2023, 2024]
    assert labels_of(JAN[-2:], [2025, 2025]) == [2024, 2025]
    # A change of fiscal year end starts a new run (Royal Gold: June to December via a transition period).
    rgld = ['2020-06-30', '2021-06-30', '2022-06-30', '2023-12-31', '2024-12-31', '2025-12-31']
    assert labels_of(rgld, [2020, 2021, 2022, 2023, 2024, 2025]) == [2020, 2021, 2022, 2023, 2024, 2025]
    # A hole of more than a year starts a new run (CSWC: 2012-2013 labelled by start year, 2023 on by end year).
    cswc = ['2012-03-31', '2013-03-31', '2023-03-31', '2024-03-31', '2025-03-31', '2026-03-31']
    assert labels_of(cswc, [2011, 2012, 2023, 2024, 2025, 2026]) == [2011, 2012, 2023, 2024, 2025, 2026]
    # Kroger: two 10-Ks say end year; the convention note cites only filings that agree with the label shown.
    kr = ['2022-01-29', '2023-01-28', '2024-02-03', '2025-02-01', '2026-01-31']
    shard = company_shard(years(kr, [2021, 2022, 2024, 2025, 2025]), SUB)
    assert [p['fy'] for p in shard['periods']] == [2021, 2022, 2023, 2024, 2025]
    note = next(q['text'] for q in shard['quality'] if q['kind'] == 'label' and 'one less' in q['text'])
    assert 'FY2022 ended 2023-01-28, FY2025 ended 2026-01-31' in note
    # No label at all: end year.
    assert labels_of(DEC[-3:], [None, None, None]) == [2023, 2024, 2025]


def test_committed_universe_labels_follow_the_companies_own_filings():
    from pathlib import Path
    data = Path(__file__).resolve().parents[1] / 'web' / 'data' / 'universe'
    index = json.loads((data / 'index.json').read_text())
    screen = {r['c']: r for r in json.loads((data / 'screen.json').read_text())['rows']}
    by = {t: e for e in index['companies'] for t in e['t']}
    expect = {'FRT': ('2025-12-31', 2025), 'HUN': ('2025-12-31', 2025), 'POST': ('2025-09-30', 2025), 'IESC': ('2025-09-30', 2025),
              'CRM': ('2026-01-31', 2026), 'ROIV': ('2026-03-31', 2025), 'TGT': ('2026-01-31', 2025), 'HD': ('2026-02-01', 2025), 'WMT': ('2026-01-31', 2026)}
    for ticker, (end, fy) in expect.items():
        shard = json.loads((data / 'c' / f"{by[ticker]['c']}.json").read_text())
        assert (shard['periods'][-1]['end'], shard['periods'][-1]['fy']) == (end, fy), ticker
        assert by[ticker]['fy'] == fy and (by[ticker]['c'] not in screen or screen[by[ticker]['c']]['fy'] == fy), ticker
    for entry in index['companies']:
        shard = json.loads((data / 'c' / f"{entry['c']}.json").read_text())
        labels = [p['fy'] for p in shard['periods']]
        assert labels == sorted(set(labels)) and all('fy_reported' in p for p in shard['periods']), entry['t']
        assert not any('in which it starts' in q['text'] or 'count back one year' in q['text'] for q in shard['quality']), entry['t']
