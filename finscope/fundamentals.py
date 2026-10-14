"""Annual, filing-date-filtered SEC evidence. Never mix fiscal periods."""
from datetime import date
import math

METRICS = {
    'revenue': ('flow', ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet']),
    'net_income': ('flow', ['NetIncomeLoss']),
    'operating_income': ('flow', ['OperatingIncomeLoss']),
    'operating_cash_flow': ('flow', ['NetCashProvidedByUsedInOperatingActivities']),
    'assets': ('instant', ['Assets']),
    'liabilities': ('instant', ['Liabilities']),
    'current_assets': ('instant', ['AssetsCurrent']),
    'current_liabilities': ('instant', ['LiabilitiesCurrent']),
    'cash': ('instant', ['CashAndCashEquivalentsAtCarryingValue']),
    'capex': ('flow', ['PaymentsToAcquirePropertyPlantAndEquipment']),
}


def candidates(payload, key, as_of):
    cutoff = date.fromisoformat(as_of)
    kind, tags = METRICS[key]
    found = []
    for priority, tag in enumerate(tags):
        for row in payload.get('facts', {}).get('us-gaap', {}).get(tag, {}).get('units', {}).get('USD', []):
            try:
                end, filed = date.fromisoformat(row['end']), date.fromisoformat(row['filed'])
                start = date.fromisoformat(row['start']) if row.get('start') else None
                value = row['val']
                if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
                    continue
                if end > cutoff or filed > cutoff or filed < end or row.get('form') not in ('10-K', '10-K/A'):
                    continue
                if kind == 'flow' and (start is None or not 330 <= (end - start).days <= 400):
                    continue
                if kind == 'instant' and start is not None:
                    continue
                accession = row['accn']
                found.append({'tag': tag, 'priority': priority, 'value': value, 'unit': 'USD',
                              'start': start.isoformat() if start else None, 'end': end.isoformat(),
                              'filed': filed.isoformat(), 'accession': accession, 'form': row['form'],
                              'url': f"https://www.sec.gov/Archives/edgar/data/{int(payload['cik'])}/{accession.replace('-', '')}/"})
            except (ValueError, KeyError, TypeError):
                continue
    return found


def divide(a, b):
    return a / b if a is not None and b is not None and b > 0 else None


def annual_history(payload, as_of):
    """Latest eligible restatement of each annual period; every fact retains its source."""
    pool = {key: candidates(payload, key, as_of) for key in METRICS}
    # One annual revenue anchor per period end. Preferred tag breaks equal-date ties.
    anchors = {}
    for fact in sorted(pool['revenue'], key=lambda f: (f['filed'], -f['priority'], f['accession'])):
        anchors[fact['end']] = fact
    result = []
    for end, anchor in sorted(anchors.items()):
        metrics = {}
        for key, (kind, _) in METRICS.items():
            matches = [f for f in pool[key] if f['end'] == end and (kind == 'instant' or f['start'] == anchor['start'])]
            metrics[key] = max(matches, key=lambda f: (f['filed'], -f['priority'], f['accession'])) if matches else None
        values = {k: f['value'] if f else None for k, f in metrics.items()}
        previous = result[-1] if result and 300 <= (date.fromisoformat(end) - date.fromisoformat(result[-1]['period_end'])).days <= 430 else None
        prior_values = {k: f['value'] if f else None for k, f in previous['metrics'].items()} if previous else {}
        average_assets = (values['assets'] + prior_values['assets']) / 2 if values['assets'] is not None and prior_values.get('assets') is not None else None
        accrual = values['net_income'] - values['operating_cash_flow'] if values['net_income'] is not None and values['operating_cash_flow'] is not None else None
        growth_base = divide(values['revenue'], prior_values.get('revenue'))
        ratios = {
            'operating_margin': divide(values['operating_income'], values['revenue']),
            'net_margin': divide(values['net_income'], values['revenue']),
            'cash_margin': divide(values['operating_cash_flow'], values['revenue']),
            'current_ratio': divide(values['current_assets'], values['current_liabilities']),
            'liabilities_assets': divide(values['liabilities'], values['assets']),
            'cash_coverage': divide(values['cash'], values['current_liabilities']),
            'accruals': divide(accrual, average_assets),
            'revenue_growth': growth_base - 1 if growth_base is not None else None,
        }
        result.append({'period_start': anchor['start'], 'period_end': end,
                       'known_at': max(f['filed'] for f in metrics.values() if f),
                       'first_filed': min(f['filed'] for f in pool['revenue'] if f['end'] == end),
                       'metrics': metrics, 'ratios': ratios})
    return result
