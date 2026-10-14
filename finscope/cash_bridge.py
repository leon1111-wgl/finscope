"""Partial, source-consistent reconciliation of net income to operating cash flow."""
import math

from finscope.fundamentals import fact_candidates

# Alternatives within a group are exclusive. Never sum a subtotal with its parts.
COMPONENTS = {
    'depreciation': ('Depreciation and amortization', 1,
                     ['DepreciationDepletionAndAmortization', 'DepreciationAmortizationAndAccretionNet'],
                     'Non-cash expense added back; this is not a new cash receipt.'),
    'share_based_compensation': ('Share-based compensation', 1, ['ShareBasedCompensation'],
                                 'Non-cash expense added back; review dilution separately.'),
    'receivables': ('Accounts receivable change', -1, ['IncreaseDecreaseInAccountsReceivable'],
                    'An increase uses cash in this reconciliation; a decrease releases cash.'),
    'inventory': ('Inventory change', -1, ['IncreaseDecreaseInInventories'],
                  'Inventory build-up uses cash; a reduction releases cash.'),
    'payables': ('Accounts payable change', 1,
                 ['IncreaseDecreaseInAccountsPayable', 'IncreaseDecreaseInAccountsPayableTrade'],
                 'An increase preserves cash temporarily; a decrease uses cash to pay suppliers.'),
}


def bridge_candidates(payload, day):
    return {key: fact_candidates(payload, definition[2], day, forms=('10-Q', '10-Q/A'),
                                  duration_bounds=(60, 310)) for key, definition in COMPONENTS.items()}


def cash_bridge(pool, period, day):
    """Only use the same accession, USD, start and end as the CFO endpoint.

    Missing mapped lines remain null. The residual is an arithmetic remainder,
    not a sourced line or a claim that all operating adjustments were identified.
    """
    ni, cfo = (period['metrics'].get(k) for k in ('net_income', 'operating_cash_flow'))
    unavailable = {'status': 'unavailable', 'components': [], 'residual': None,
                   'reason': 'Net income and operating cash flow need matching fiscal dates and the same filing.'}
    for f in (ni, cfo):
        if (not f or not isinstance(f.get('value'), (int, float)) or isinstance(f['value'], bool)
                or not math.isfinite(f['value']) or f.get('filed', '9999') > day
                or (f.get('start'), f.get('end')) != (period['period_start'], period['period_end'])):
            return unavailable
    if not ni.get('accession') or ni['accession'] != cfo.get('accession'):
        return unavailable
    components = []
    for key, (label, sign, _, explanation) in COMPONENTS.items():
        matches = [f for f in pool[key] if f['filed'] <= day and f['accession'] == cfo['accession']
                   and (f['start'], f['end']) == (period['period_start'], period['period_end'])]
        fact = max(matches, key=lambda f: (-f['priority'], f['filed'])) if matches else None
        components.append({'key': key, 'label': label, 'sign': sign, 'fact': fact,
                           'effect': fact['value'] * sign if fact else None, 'explanation': explanation})
    selected = sum(c['effect'] for c in components if c['effect'] is not None)
    return {'status': 'available', 'net_income': ni['value'], 'operating_cash_flow': cfo['value'],
            'accession': cfo['accession'], 'components': components, 'selected_adjustments': selected,
            'residual': cfo['value'] - ni['value'] - selected,
            'missing_components': [c['key'] for c in components if c['effect'] is None]}
