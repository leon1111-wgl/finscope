"""Comparable fiscal YTD evidence, separate from the annual model and scenarios."""
from datetime import date, timedelta

from finscope.fundamentals import candidates, divide
from finscope.cash_bridge import bridge_candidates, cash_bridge

KEYS = ('revenue', 'net_income', 'operating_income', 'operating_cash_flow')


def rank(fact):
    return fact['filed'], -fact['priority'], fact['accession']


def period(pool, anchor, day):
    metrics = {}
    for key in KEYS:
        matches = [f for f in pool[key] if f['filed'] <= day
                   and (f['start'], f['end']) == (anchor['start'], anchor['end'])]
        metrics[key] = max(matches, key=rank) if matches else None
    return {'period_start': anchor['start'], 'period_end': anchor['end'],
            'known_at': max(f['filed'] for f in metrics.values() if f), 'metrics': metrics}


def value(row, key):
    fact = row['metrics'].get(key) if row else None
    return fact['value'] if fact else None


def interim_snapshots(payload, as_of):
    """Match YTD start to the last annual end + 1 day, never to a standalone Q2/Q3.

    Quarter filings contain multiple durations. Prior YTD must start at the
    preceding annual start, with a comparable duration (allow a 53-week year).
    Every snapshot independently filters current and comparative facts by filing
    day. Later amendments therefore cannot rewrite an earlier saved snapshot.
    """
    annual = candidates(payload, 'revenue', as_of)
    pool = {key: candidates(payload, key, as_of, forms=('10-Q', '10-Q/A'),
                            duration_bounds=(60, 310)) for key in KEYS}
    adjustment_pool = bridge_candidates(payload, as_of)
    dates = sorted({f['filed'] for rows in [annual, *pool.values()] for f in rows
                    if f['filed'] >= '2018-01-01'})
    result = []
    for day in dates:
        eligible = [f for f in annual if f['filed'] <= day]
        if not eligible:
            continue
        base = max(eligible, key=lambda f: (f['end'], *rank(f)))
        start = (date.fromisoformat(base['end']) + timedelta(days=1)).isoformat()
        anchors = [f for f in pool['revenue'] if f['filed'] <= day and f['start'] == start]
        if not anchors:
            continue
        anchor = max(anchors, key=lambda f: (f['end'], *rank(f)))
        current = period(pool, anchor, day)
        duration = (date.fromisoformat(anchor['end']) - date.fromisoformat(start)).days
        prior_anchors = [f for f in pool['revenue'] if f['filed'] <= day
                         and f['start'] == base['start']
                         and 350 <= (date.fromisoformat(anchor['end']) - date.fromisoformat(f['end'])).days <= 380
                         and abs((date.fromisoformat(f['end']) - date.fromisoformat(f['start'])).days - duration) <= 8]
        prior = period(pool, max(prior_anchors, key=rank), day) if prior_anchors else None
        current['cash_bridge'] = cash_bridge(adjustment_pool, current, day)
        if prior:
            prior['cash_bridge'] = cash_bridge(adjustment_pool, prior, day)
        changes = {}
        for key in KEYS:
            a, b = value(current, key), value(prior, key)
            growth = divide(a, b)
            changes[key] = {'absolute': a - b if a is not None and b is not None else None,
                            'growth': growth - 1 if growth is not None else None}
        row = {'as_of': day, 'annual_baseline_end': base['end'],
               'current': current, 'prior': prior, 'changes': changes}
        for name, key in [('cash_margin', 'operating_cash_flow'), ('operating_margin', 'operating_income')]:
            a = divide(value(current, key), value(current, 'revenue'))
            b = divide(value(prior, key), value(prior, 'revenue'))
            row['current_' + name], row['prior_' + name] = a, b
            row[name + '_change_pp'] = (a - b) * 100 if a is not None and b is not None else None
        result.append(row)
    return result
