"""The 0.3.0 company universe: standardized annual figures with tag lineage for every SEC large accelerated filer.

Pure functions over one company's CompanyFacts and Submissions payloads. No network access here; the fetching,
rate limiting and file writing live in scripts/build_universe.py. Every stated value keeps its XBRL tag, the
accession it came from and how it was chosen, so the page can link each number to its filing.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date
import math
import re

SCHEMA = 'finscope.universe.company/1'
TEMPLATES = ('industrial', 'bank', 'insurance', 'reit')
FLOW_DAYS = (330, 400)
ANNUAL_FORMS = ('10-K', '10-K/A')
MAX_YEARS = 10

# id: kind, unit, statement (IS/BS/CF), tag chain in fallback order, templates where it is meaningful.
# A chain is read per period: the latest filing that reports any tag in the chain wins; inside that filing the
# earlier tag wins (revenue has one documented exception, see choose_revenue).
ALL = set(TEMPLATES)
NONFIN = {'industrial', 'reit'}
METRICS = {
    'revenue': ('flow', 'USD', 'IS', ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet',
                                      'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueGoodsNet',
                                      'SalesRevenueServicesNet', 'RevenuesNetOfInterestExpense'], ALL),
    'cost_of_revenue': ('flow', 'USD', 'IS', ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold', 'CostOfServices',
                                              'CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization'], NONFIN),
    'gross_profit': ('flow', 'USD', 'IS', ['GrossProfit'], {'industrial'}),
    'operating_income': ('flow', 'USD', 'IS', ['OperatingIncomeLoss'], ALL),
    'rnd': ('flow', 'USD', 'IS', ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'], {'industrial'}),
    'sga': ('flow', 'USD', 'IS', ['SellingGeneralAndAdministrativeExpense'], NONFIN),
    'interest_expense': ('flow', 'USD', 'IS', ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt', 'InterestAndDebtExpense'], ALL),
    'pretax_income': ('flow', 'USD', 'IS', ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
                                            'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'], ALL),
    'income_tax': ('flow', 'USD', 'IS', ['IncomeTaxExpenseBenefit'], ALL),
    'net_income': ('flow', 'USD', 'IS', ['NetIncomeLoss', 'ProfitLoss'], ALL),
    'eps_diluted': ('flow', 'USD/shares', 'IS', ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted'], ALL),
    'shares_diluted': ('flow', 'shares', 'IS', ['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfShareOutstandingBasicAndDiluted'], ALL),
    'operating_cash_flow': ('flow', 'USD', 'CF', ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'], ALL),
    'capex': ('flow', 'USD', 'CF', ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'], NONFIN),
    'dividends': ('flow', 'USD', 'CF', ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'], ALL),
    'buybacks': ('flow', 'USD', 'CF', ['PaymentsForRepurchaseOfCommonStock', 'PaymentsForRepurchaseOfEquity'], ALL),
    'cash': ('instant', 'USD', 'BS', ['CashAndCashEquivalentsAtCarryingValue', 'CashAndDueFromBanks', 'Cash',
                                      'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'], ALL),
    'cash_sti': ('instant', 'USD', 'BS', ['CashCashEquivalentsAndShortTermInvestments'], {'industrial'}),
    'assets': ('instant', 'USD', 'BS', ['Assets'], ALL),
    'liabilities': ('instant', 'USD', 'BS', ['Liabilities'], ALL),
    'equity': ('instant', 'USD', 'BS', ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], ALL),
    'current_assets': ('instant', 'USD', 'BS', ['AssetsCurrent'], NONFIN),
    'current_liabilities': ('instant', 'USD', 'BS', ['LiabilitiesCurrent'], NONFIN),
    'total_debt': ('instant', 'USD', 'BS', [], ALL),  # composed, see choose_debt
    'net_interest_income': ('flow', 'USD', 'IS', ['InterestIncomeExpenseNet'], {'bank'}),
    'noninterest_income': ('flow', 'USD', 'IS', ['NoninterestIncome'], {'bank'}),
    'provision': ('flow', 'USD', 'IS', ['ProvisionForLoanLeaseAndOtherLosses', 'ProvisionForLoanAndLeaseLosses', 'FinancingReceivableCreditLossExpenseReversal'], {'bank'}),
    'deposits': ('instant', 'USD', 'BS', ['Deposits'], {'bank'}),
    'loans': ('instant', 'USD', 'BS', ['LoansAndLeasesReceivableNetReportedAmount', 'FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss'], {'bank'}),
    'premiums': ('flow', 'USD', 'IS', ['PremiumsEarnedNet'], {'insurance'}),
    'net_investment_income': ('flow', 'USD', 'IS', ['NetInvestmentIncome'], {'insurance'}),
    'real_estate': ('instant', 'USD', 'BS', ['RealEstateInvestmentPropertyNet'], {'reit'}),
}
# Fallbacks that combine two facts of the same filing. Each part is a tag chain; all parts must come from one filing.
SGA_PARTS = (['SellingAndMarketingExpense', 'SellingExpense'], ['GeneralAndAdministrativeExpense'])
STI_TAGS = ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent']
EQUITY_TOTAL = ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'StockholdersEquity']
TEMPORARY_EQUITY = ['TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterest', 'TemporaryEquityCarryingAmountAttributableToParent',
                    'RedeemableNoncontrollingInterestEquityCarryingAmount']
DEBT_TOTAL = ['DebtLongtermAndShorttermCombinedAmount']
DEBT_LONG_TOTAL = ['LongTermDebt']  # includes the current portion
DEBT_NONCURRENT = ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations']
DEBT_CURRENT_TOTAL = ['DebtCurrent']
DEBT_CURRENT_LTD = ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent']
DEBT_SHORT = ['ShortTermBorrowings', 'CommercialPaper']

LABELS = {
    'revenue': 'Revenue', 'cost_of_revenue': 'Cost of revenue', 'gross_profit': 'Gross profit', 'operating_income': 'Operating income',
    'rnd': 'Research and development', 'sga': 'Selling, general and administrative', 'interest_expense': 'Interest expense',
    'pretax_income': 'Income before income taxes', 'income_tax': 'Income tax expense', 'net_income': 'Net income',
    'eps_diluted': 'Diluted EPS (reported)', 'shares_diluted': 'Diluted weighted-average shares', 'operating_cash_flow': 'Operating cash flow',
    'capex': 'Capital expenditure', 'dividends': 'Dividends paid', 'buybacks': 'Share repurchases', 'cash': 'Cash and cash equivalents',
    'cash_sti': 'Cash and short-term investments', 'assets': 'Total assets', 'liabilities': 'Total liabilities', 'equity': "Shareholders' equity",
    'current_assets': 'Current assets', 'current_liabilities': 'Current liabilities', 'total_debt': 'Total debt',
    'net_interest_income': 'Net interest income', 'noninterest_income': 'Noninterest income', 'provision': 'Provision for credit losses',
    'deposits': 'Deposits', 'loans': 'Loans, net', 'premiums': 'Premiums earned', 'net_investment_income': 'Net investment income',
    'real_estate': 'Real estate investment property, net',
}

# ------------------------------------------------------------------ templates and sectors
def has_current_assets(payload):
    return bool(payload.get('facts', {}).get('us-gaap', {}).get('AssetsCurrent'))


def template_for(sic, payload):
    """Statement template by SIC code, with the balance-sheet shape deciding the edge cases."""
    code = int(sic) if str(sic or '').isdigit() else None
    classified = has_current_assets(payload)
    if code == 6798:
        return 'reit'
    if code is not None and (6311 <= code <= 6399 or code == 6411):
        return 'industrial' if classified else 'insurance'
    if code is None or 6000 <= code <= 6799:
        return 'industrial' if classified else 'bank'
    return 'industrial'


SIC_DIVISIONS = [((1, 9), 'A', 'Agriculture, forestry and fishing', '农林牧渔'), ((10, 14), 'B', 'Mining', '采矿'),
                 ((15, 17), 'C', 'Construction', '建筑'), ((20, 39), 'D', 'Manufacturing', '制造业'),
                 ((40, 49), 'E', 'Transportation, communications and utilities', '交通、通信与公用事业'),
                 ((50, 51), 'F', 'Wholesale trade', '批发'), ((52, 59), 'G', 'Retail trade', '零售'),
                 ((60, 67), 'H', 'Finance, insurance and real estate', '金融、保险与地产'), ((70, 89), 'I', 'Services', '服务业'),
                 ((90, 99), 'J', 'Public administration and other', '公共管理及其他')]


def sic_division(sic):
    if not str(sic or '').isdigit():
        return 'J'
    major = int(str(sic).zfill(4)[:2])
    for (lo, hi), code, _, _ in SIC_DIVISIONS:
        if lo <= major <= hi:
            return code
    return 'J'


# ------------------------------------------------------------------ fact access
def _facts(payload, tag, unit):
    return payload.get('facts', {}).get('us-gaap', {}).get(tag, {}).get('units', {}).get(unit, [])


def _clean(row, kind):
    """A usable annual-report fact, or None."""
    try:
        end = date.fromisoformat(row['end'])
        filed = date.fromisoformat(row['filed'])
        start = date.fromisoformat(row['start']) if row.get('start') else None
        value = row['val']
    except (KeyError, TypeError, ValueError):
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    if row.get('form') not in ANNUAL_FORMS or filed < end:
        return None
    if kind == 'flow' and (start is None or not FLOW_DAYS[0] <= (end - start).days <= FLOW_DAYS[1]):
        return None
    if kind == 'instant' and start is not None:
        return None
    return {'v': value, 'start': row.get('start'), 'end': row['end'], 'filed': row['filed'], 'accn': row['accn'], 'form': row['form'],
            'fy': row.get('fy'), 'fp': row.get('fp')}


def fiscal_periods(payload):
    """Annual periods from the original 10-K filings: (fy label, start, end, accession, filed).

    The current period of a 10-K is the latest annual duration it reports; the company's own fiscal-year label is the
    filing's DEI fiscal-year focus, carried on each CompanyFacts entry as `fy`. 10-K/A and comparatives never define a period.
    """
    by_accn = defaultdict(list)
    for tag, body in payload.get('facts', {}).get('us-gaap', {}).items():
        for row in body.get('units', {}).get('USD', []):
            if row.get('form') != '10-K' or not row.get('start'):
                continue
            fact = _clean(row, 'flow')
            if fact:
                by_accn[fact['accn']].append(fact)
    periods = {}
    for accn, facts in by_accn.items():
        end = max(f['end'] for f in facts)
        current = [f for f in facts if f['end'] == end]
        start = Counter(f['start'] for f in current).most_common(1)[0][0]
        labels = Counter(f['fy'] for f in current if isinstance(f.get('fy'), int))
        filed = min(f['filed'] for f in facts)
        candidate = {'end': end, 'start': start, 'accession': accn, 'filed': filed, 'form': '10-K',
                     'fy_reported': labels.most_common(1)[0][0] if labels else None}
        # The first original 10-K for an end date defines it (a re-filed duplicate does not).
        if end not in periods or filed < periods[end]['filed']:
            periods[end] = candidate
    ordered = [periods[e] for e in sorted(periods)]
    # Fiscal-year labels: the company's own label when it is plausible and strictly increasing, else the end year.
    for p in ordered:
        year = int(p['end'][:4])
        label = p['fy_reported']
        p['fy'], p['fy_source'] = (label, 'dei') if label in (year, year - 1) else (year, 'end_year')
    for a, b in zip(ordered, ordered[1:]):
        if b['fy'] <= a['fy']:
            b['fy'], b['fy_source'] = int(b['end'][:4]), 'end_year'
    seen = Counter(p['fy'] for p in ordered)
    for p in ordered:
        if seen[p['fy']] > 1:
            p['fy'], p['fy_source'] = int(p['end'][:4]), 'end_year'
    return ordered


def _period_facts(payload, tags, unit, kind, period):
    """Facts for this exact period in any 10-K or 10-K/A, each with its chain priority."""
    found = []
    for priority, tag in enumerate(tags):
        for row in _facts(payload, tag, unit):
            fact = _clean(row, kind)
            if not fact or fact['end'] != period['end']:
                continue
            if kind == 'flow' and fact['start'] != period['start']:
                continue
            found.append({**fact, 'tag': tag, 'priority': priority})
    return found


def _distinct(values):
    out = []
    for v in values:
        if not any(abs(v - w) <= 0.5 for w in out):
            out.append(v)
    return out


def _in_filing(facts, accn):
    """Facts of one filing, the best tag first; conflicting values for one tag are reported, not resolved."""
    chosen = [f for f in facts if f['accn'] == accn]
    if not chosen:
        return None
    best = min(f['priority'] for f in chosen)
    same = [f for f in chosen if f['priority'] == best]
    values = _distinct([f['v'] for f in same])
    fact = dict(same[0])
    if len(values) > 1:
        fact['conflict'] = values
    return fact


def _latest_accn(facts):
    return max(facts, key=lambda f: (f['filed'], f['accn']))['accn'] if facts else None


def _cell(fact, via, period, chain=None, parts=None, note=None):
    cell = {'v': fact['v'], 'tag': fact['tag'], 'accn': fact['accn'], 'filed': fact['filed'], 'form': fact['form'], 'via': via}
    if parts:
        cell['parts'] = parts
    if note:
        cell['note'] = note
    if fact.get('conflict'):
        cell = {'conflict': fact['conflict'], 'tag': fact['tag'], 'accn': fact['accn'], 'filed': fact['filed'], 'form': fact['form'], 'via': via}
    return cell


def _with_first(cell, original):
    """Record the value as first reported in the period's original 10-K when a later filing changed it."""
    if cell and original and 'v' in cell and original['accn'] != cell['accn'] and abs(original['v'] - cell['v']) > 0.5:
        cell['first'] = {'v': original['v'], 'tag': original['tag'], 'accn': original['accn'], 'filed': original['filed']}
    return cell


def choose_chain(payload, metric, period):
    kind, unit, _, tags, _ = METRICS[metric]
    facts = _period_facts(payload, tags, unit, kind, period)
    if not facts:
        return None
    fact = _in_filing(facts, _latest_accn(facts))
    via = 'primary' if fact['priority'] == 0 else 'fallback'
    cell = _cell(fact, via, period)
    return _with_first(cell, _in_filing(facts, period['accession']))


def choose_revenue(payload, period):
    """Revenue: the chain, except that inside one filing a larger total `Revenues` beats contract revenue alone.

    Some companies report both RevenueFromContractWithCustomer… (customer contracts only) and Revenues (all revenue,
    including leases or interest). Stating the subset as revenue would understate it, so the total wins.
    """
    kind, unit, _, tags, _ = METRICS['revenue']
    facts = _period_facts(payload, tags, unit, kind, period)
    if not facts:
        return None

    def pick(accn):
        fact = _in_filing(facts, accn)
        if fact is None:
            return None
        total = [f for f in facts if f['accn'] == accn and f['tag'] == 'Revenues']
        if fact['tag'] != 'Revenues' and total and len(_distinct([t['v'] for t in total])) == 1 and total[0]['v'] > fact['v'] + 0.5:
            subset = fact
            fact = {**total[0]}
            fact['note'] = f"Revenues (total) used; {subset['tag']} = {subset['v']:.0f} covers customer contracts only"
        return fact
    fact = pick(_latest_accn(facts))
    via = 'total' if fact.get('note') else 'primary' if fact['priority'] == 0 else 'fallback'
    cell = _cell(fact, via, period, note=fact.get('note'))
    return _with_first(cell, pick(period['accession']))


def _part(payload, tags, unit, kind, period, accn):
    facts = [f for f in _period_facts(payload, tags, unit, kind, period) if f['accn'] == accn]
    return _in_filing(facts, accn) if facts else None


def _compose(payload, period, unit, kind, accn, terms):
    """Sum signed parts from one filing; every part must exist and be unambiguous."""
    parts, total = [], 0.0
    for sign, tags in terms:
        fact = _part(payload, tags, unit, kind, period, accn)
        if fact is None or fact.get('conflict'):
            return None, None
        parts.append({'tag': fact['tag'], 'v': fact['v'], 'sign': sign})
        total += sign * fact['v']
    return total, parts


def _filings_for(payload, tags, unit, kind, period):
    facts = _period_facts(payload, tags, unit, kind, period)
    return sorted({(f['filed'], f['accn']) for f in facts}, reverse=True)


def choose_sga(payload, period):
    direct = choose_chain(payload, 'sga', period)
    if direct:
        return direct
    for filed, accn in _filings_for(payload, SGA_PARTS[1], 'USD', 'flow', period):
        total, parts = _compose(payload, period, 'USD', 'flow', accn, [(1, SGA_PARTS[0]), (1, SGA_PARTS[1])])
        if parts:
            return {'v': total, 'tag': 'derived', 'accn': accn, 'filed': filed, 'form': _form(payload, accn), 'via': 'derived', 'parts': parts,
                    'note': 'Selling and marketing plus general and administrative, as reported separately in the same filing'}
    return None


def _form(payload, accn):
    forms = payload.get('__forms')
    if forms is None:
        forms = {}
        for body in payload.get('facts', {}).get('us-gaap', {}).values():
            for rows in body.get('units', {}).values():
                for row in rows:
                    forms.setdefault(row.get('accn'), row.get('form'))
        payload['__forms'] = forms
    return forms.get(accn)


def choose_liabilities(payload, period):
    direct = choose_chain(payload, 'liabilities', period)
    if direct:
        return direct
    for filed, accn in _filings_for(payload, ['LiabilitiesAndStockholdersEquity'], 'USD', 'instant', period):
        total, parts = _compose(payload, period, 'USD', 'instant', accn, [(1, ['LiabilitiesAndStockholdersEquity']), (-1, EQUITY_TOTAL)])
        if not parts:
            continue
        temporary = _part(payload, TEMPORARY_EQUITY, 'USD', 'instant', period, accn)
        if temporary and not temporary.get('conflict'):
            parts.append({'tag': temporary['tag'], 'v': temporary['v'], 'sign': -1})
            total -= temporary['v']
        return {'v': total, 'tag': 'derived', 'accn': accn, 'filed': filed, 'form': _form(payload, accn), 'via': 'derived', 'parts': parts,
                'note': 'Total liabilities are not tagged; derived as total liabilities and equity minus total equity (and temporary equity where tagged)'}
    return None


def choose_cash_sti(payload, period):
    direct = choose_chain(payload, 'cash_sti', period)
    if direct:
        return direct
    cash_tags = ['CashAndCashEquivalentsAtCarryingValue']
    for filed, accn in _filings_for(payload, cash_tags, 'USD', 'instant', period):
        cash = _part(payload, cash_tags, 'USD', 'instant', period, accn)
        if not cash or cash.get('conflict'):
            continue
        sti = _part(payload, STI_TAGS, 'USD', 'instant', period, accn)
        if sti and not sti.get('conflict'):
            return {'v': cash['v'] + sti['v'], 'tag': 'derived', 'accn': accn, 'filed': filed, 'form': cash['form'], 'via': 'derived',
                    'parts': [{'tag': cash['tag'], 'v': cash['v'], 'sign': 1}, {'tag': sti['tag'], 'v': sti['v'], 'sign': 1}],
                    'note': 'Cash and cash equivalents plus short-term investments, as reported separately in the same filing'}
        return {'v': cash['v'], 'tag': 'derived', 'accn': accn, 'filed': filed, 'form': cash['form'], 'via': 'derived',
                'parts': [{'tag': cash['tag'], 'v': cash['v'], 'sign': 1}],
                'note': 'No short-term investment line is tagged in this filing, so this is cash and cash equivalents only'}
    return None


def choose_debt(payload, period):
    """Total debt (borrowings), always from one filing, in a documented order of compositions.

    1. DebtLongtermAndShorttermCombinedAmount.
    2. LongTermDebt (which includes its current portion) + short-term borrowings or commercial paper.
    3. Noncurrent long-term debt + DebtCurrent, or + current long-term debt + short-term borrowings or commercial paper.
    A current component that is not tagged counts as zero and the cell says so; operating leases are never included.
    """
    unit, kind = 'USD', 'instant'
    candidates = sorted({x for tags in (DEBT_TOTAL, DEBT_LONG_TOTAL, DEBT_NONCURRENT) for x in _filings_for(payload, tags, unit, kind, period)}, reverse=True)
    for filed, accn in candidates:
        form = _form(payload, accn)
        whole = _part(payload, DEBT_TOTAL, unit, kind, period, accn)
        if whole and not whole.get('conflict'):
            return {'v': whole['v'], 'tag': whole['tag'], 'accn': accn, 'filed': filed, 'form': form, 'via': 'primary'}
        short = _part(payload, DEBT_SHORT, unit, kind, period, accn)
        short = short if short and not short.get('conflict') else None
        long_total = _part(payload, DEBT_LONG_TOTAL, unit, kind, period, accn)
        if long_total and not long_total.get('conflict'):
            parts = [{'tag': long_total['tag'], 'v': long_total['v'], 'sign': 1}] + ([{'tag': short['tag'], 'v': short['v'], 'sign': 1}] if short else [])
            note = 'Long-term debt including its current portion' + (' plus short-term borrowings' if short else '; no short-term borrowings tagged (counted as zero)')
            return {'v': sum(p['v'] for p in parts), 'tag': 'derived', 'accn': accn, 'filed': filed, 'form': form, 'via': 'derived', 'parts': parts, 'note': note}
        noncurrent = _part(payload, DEBT_NONCURRENT, unit, kind, period, accn)
        if noncurrent and not noncurrent.get('conflict'):
            parts = [{'tag': noncurrent['tag'], 'v': noncurrent['v'], 'sign': 1}]
            current = _part(payload, DEBT_CURRENT_TOTAL, unit, kind, period, accn)
            if current and not current.get('conflict'):
                parts.append({'tag': current['tag'], 'v': current['v'], 'sign': 1})
                note = 'Noncurrent long-term debt plus current debt'
            else:
                ltd = _part(payload, DEBT_CURRENT_LTD, unit, kind, period, accn)
                for extra in (ltd, short):
                    if extra and not extra.get('conflict'):
                        parts.append({'tag': extra['tag'], 'v': extra['v'], 'sign': 1})
                note = 'Noncurrent long-term debt' + ('' if len(parts) > 1 else '; no current debt tagged (counted as zero)') + \
                       (' plus current maturities' if ltd else '') + (' plus short-term borrowings' if short else '')
            return {'v': sum(p['v'] for p in parts), 'tag': 'derived', 'accn': accn, 'filed': filed, 'form': form, 'via': 'derived', 'parts': parts, 'note': note}
    return None


CHOOSERS = {'revenue': choose_revenue, 'sga': choose_sga, 'liabilities': choose_liabilities, 'cash_sti': choose_cash_sti, 'total_debt': choose_debt}


# ------------------------------------------------------------------ one company
def _gap_days(a, b):
    return (date.fromisoformat(b['start']) - date.fromisoformat(a['end'])).days


def company_shard(payload, submissions, ticker_rows=None):
    """Standardized annual figures, lineage and data-quality notes for one company."""
    cik = int(payload['cik'])
    sic = str(submissions.get('sic') or '')
    template = template_for(sic, payload)
    periods = fiscal_periods(payload)[-MAX_YEARS:]
    recent = submissions.get('filings', {}).get('recent', {})
    docs = {a: (f, d, r) for a, f, d, r in zip(recent.get('accessionNumber', []), recent.get('form', []), recent.get('primaryDocument', []), recent.get('reportDate', []))}
    supported = [m for m, spec in METRICS.items() if template in spec[4]]
    values, quality = {}, []
    for metric in supported:
        row = []
        for period in periods:
            chooser = CHOOSERS.get(metric)
            cell = chooser(payload, period) if chooser else choose_chain(payload, metric, period)
            row.append(cell)
        values[metric] = row
    years = [p['fy'] for p in periods]
    # Data-quality notes, one per metric and kind, naming the fiscal years.
    for metric, row in values.items():
        missing = [y for y, c in zip(years, row) if c is None]
        if missing and len(missing) < len(years):
            quality.append({'kind': 'missing', 'metric': metric, 'fy': missing, 'text': f"{LABELS[metric]}: not reported under the tags FinScope reads for FY{', FY'.join(map(str, missing))}."})
        elif missing:
            quality.append({'kind': 'missing', 'metric': metric, 'fy': missing, 'text': f"{LABELS[metric]}: not reported under any tag FinScope reads ({', '.join(METRICS[metric][3]) or 'composed from debt tags'})."})
        by_tag = defaultdict(list)
        for y, c in zip(years, row):
            if c and c.get('via') == 'fallback':
                by_tag[c['tag']].append(y)
        for tag, ys in by_tag.items():
            quality.append({'kind': 'fallback', 'metric': metric, 'fy': ys, 'tag': tag,
                            'text': f"{LABELS[metric]}: FY{', FY'.join(map(str, ys))} use the fallback tag {tag} (first choice {METRICS[metric][3][0]} not reported)."})
        derived = [y for y, c in zip(years, row) if c and c.get('via') == 'derived']
        if derived:
            notes = sorted({c['note'] for c in row if c and c.get('via') == 'derived'})
            quality.append({'kind': 'derived', 'metric': metric, 'fy': derived, 'text': f"{LABELS[metric]}: FY{', FY'.join(map(str, derived))} composed from reported parts. " + ' '.join(notes)})
        for y, c in zip(years, row):
            if c and c.get('first'):
                quality.append({'kind': 'restated', 'metric': metric, 'fy': [y],
                                'text': f"{LABELS[metric]} FY{y}: first reported as {c['first']['v']:,.0f} ({c['first']['accn']}); a later filing ({c['accn']}, {c['filed']}) reports {c['v']:,.0f}. The later figure is shown."})
            if c and c.get('conflict'):
                quality.append({'kind': 'conflict', 'metric': metric, 'fy': [y],
                                'text': f"{LABELS[metric]} FY{y}: the filing {c['accn']} reports more than one value for {c['tag']} ({', '.join(f'{v:,.0f}' for v in c['conflict'])}); no value is stated."})
            if c and c.get('form') == '10-K/A':
                quality.append({'kind': 'amended', 'metric': metric, 'fy': [y], 'text': f"{LABELS[metric]} FY{y} comes from an amended 10-K/A ({c['accn']})."})
            if c and c.get('note') and c.get('via') != 'derived':
                quality.append({'kind': 'note', 'metric': metric, 'fy': [y], 'text': f"{LABELS[metric]} FY{y}: {c['note']}."})
    for a, b in zip(periods, periods[1:]):
        drift = (date.fromisoformat(b['end']).timetuple().tm_yday - date.fromisoformat(a['end']).timetuple().tm_yday) % 365
        if min(drift, 365 - drift) > 10:
            quality.append({'kind': 'fiscal_shift', 'fy': [b['fy']], 'text': f"Fiscal year end moved from {a['end'][5:]} (FY{a['fy']}) to {b['end'][5:]} (FY{b['fy']})."})
        gap = _gap_days(a, b)
        if gap > 7:
            quality.append({'kind': 'fiscal_gap', 'fy': [b['fy']], 'text': f"{gap - 1} days between FY{a['fy']} (ended {a['end']}) and FY{b['fy']} (started {b['start']}) are not covered by an annual period (a transition period or a missing 10-K)."})
    relabelled = [p for p in periods if p['fy_source'] == 'end_year' and p['fy_reported'] is not None]
    if relabelled:
        quality.append({'kind': 'label', 'fy': [p['fy'] for p in relabelled],
                        'text': 'Fiscal-year label taken from the period end year for ' + ', '.join(f"the year ended {p['end']} (the filing says FY{p['fy_reported']})" for p in relabelled) + '.'})
    unusual = [p for p in periods if p['fy_source'] == 'dei' and p['fy'] != int(p['end'][:4])]
    if unusual:
        quality.append({'kind': 'label', 'fy': [p['fy'] for p in unusual],
                        'text': 'The company labels each fiscal year by the year in which it starts: ' + ', '.join(f"FY{p['fy']} ended {p['end']}" for p in unusual[-2:]) + '.'})
    if template != 'industrial':
        dropped = [m for m, spec in METRICS.items() if template not in spec[4]]
        quality.append({'kind': 'template', 'text': f"Template: {template} (SIC {sic or 'not assigned'}). Not supported for this template: {', '.join(LABELS[m] for m in dropped)}."})
    filings = {}
    for p in periods:
        filings[p['accession']] = None
    for row in values.values():
        for c in row:
            if c:
                filings[c['accn']] = None
                if c.get('first'):
                    filings[c['first']['accn']] = None
    filing_meta = {}
    for accn in sorted(filings):
        form, doc, report = docs.get(accn, (None, None, None))
        filing_meta[accn] = {'form': form or _form(payload, accn), 'doc': doc or None}
    return {
        'schema': SCHEMA, 'cik': cik, 'name': submissions.get('name') or payload.get('entityName'),
        'tickers': list(submissions.get('tickers') or []), 'exchanges': list(submissions.get('exchanges') or []),
        'sic': sic, 'sic_description': submissions.get('sicDescription') or '', 'division': sic_division(sic),
        'template': template, 'fiscal_year_end': submissions.get('fiscalYearEnd') or '', 'category': submissions.get('category') or '',
        'periods': [{k: p[k] for k in ('fy', 'fy_source', 'start', 'end', 'accession', 'filed')} for p in periods],
        'values': values, 'unsupported': [m for m in METRICS if m not in values], 'quality': quality, 'filings': filing_meta,
    }


# ------------------------------------------------------------------ names and aliases
SUFFIXES = re.compile(r"(,?\s+(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|lp|l\.p|n\.v|s\.a|sa|ag|se|nv|holdings?|group|the|trust|reit|bancorp(oration)?|financial|technologies|international|\/[a-z]{2}\/|\\[a-z]{2}\\))+\.?$")


def name_aliases(name):
    """Lower-case search names derived from the SEC company name; curated aliases are added separately."""
    low = re.sub(r'\s+', ' ', (name or '').lower().replace('&amp;', '&')).strip()
    low = re.sub(r'\s*/[a-z]{2}/\s*$|\s*\\[a-z]{2}\\\s*$', '', low)
    out = {low}
    base = low
    for _ in range(4):
        trimmed = re.sub(r"[,.]?\s+(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|lp|l\.p|n\.v|s\.a|ag|se|holdings?|group)\.?$", '', base).strip(' ,.')
        if trimmed == base:
            break
        base = trimmed
    if base:
        out.add(base)
    if base.startswith('the '):
        out.add(base[4:])
    out |= {a.replace('-', ' ') for a in list(out)} | {a.replace(' ', '-') for a in list(out) if ' ' in a and len(a.split()) == 2}
    return sorted(a for a in out if len(a) >= 3)
