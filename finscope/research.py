"""Historical-profile anomaly triage; no return/default prediction claims."""
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.impute import SimpleImputer

FEATURES = ['operating_margin', 'cash_margin', 'current_ratio', 'liabilities_assets', 'cash_coverage', 'accruals']


def score_profiles(histories, as_of):
    eligible = {ticker: [r for r in rows if r['known_at'] <= as_of] for ticker, rows in histories.items()}
    latest = {ticker: rows[-1] for ticker, rows in eligible.items() if rows}
    if not latest:
        return {'status': 'insufficient_history', 'scores': {}, 'training': {'samples': 0}}
    boundary = min(row['period_end'] for row in latest.values())
    training = [(ticker, row) for ticker, rows in eligible.items() for row in rows
                if row['period_end'] < boundary and sum(row['ratios'][k] is not None for k in FEATURES) >= 4]
    meta = {'samples': len(training), 'period_end_before': boundary, 'features': FEATURES,
            'seed': 42, 'trees': 128, 'algorithm': 'IsolationForest', 'minimum_observed_features': 4}
    if len(training) < 30:
        return {'status': 'insufficient_history', 'scores': {}, 'training': meta}
    meta.update(first_period_end=min(r['period_end'] for _, r in training),
                last_period_end=max(r['period_end'] for _, r in training),
                latest_filed=max(r['known_at'] for _, r in training))
    X = np.array([[r['ratios'][k] if r['ratios'][k] is not None else np.nan for k in FEATURES] for _, r in training])
    if np.any(np.all(np.isnan(X), axis=0)):
        return {'status': 'insufficient_features', 'scores': {}, 'training': meta}
    imputer = SimpleImputer(strategy='median')
    X = imputer.fit_transform(X)
    model = IsolationForest(n_estimators=128, random_state=42, n_jobs=1).fit(X)
    reference = -model.score_samples(X)
    median = np.median(X, axis=0)
    mad = np.median(np.abs(X - median), axis=0)
    scores = {}
    for ticker, row in latest.items():
        values = [row['ratios'][k] if row['ratios'][k] is not None else np.nan for k in FEATURES]
        if np.count_nonzero(np.isfinite(values)) < 4:
            continue
        filled = imputer.transform([values])
        score = float(-model.score_samples(filled)[0])
        deviations = [{'feature': k, 'value': float(values[i]), 'training_median': float(median[i]),
                       'robust_deviation': float(abs(values[i] - median[i]) / max(mad[i], .01))}
                      for i, k in enumerate(FEATURES) if np.isfinite(values[i])]
        scores[ticker] = {'score': score, 'percentile': round(100 * float(np.mean(reference <= score)), 1),
                          'imputed_features': [k for i, k in enumerate(FEATURES) if not np.isfinite(values[i])],
                          'context_deviations': sorted(deviations, key=lambda d: -d['robust_deviation'])[:3],
                          'period_end': row['period_end']}
    return {'status': 'available', 'scores': scores, 'training': meta}
