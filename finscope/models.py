"""Chronological partitions and fixed, past-fitted Ridge variants."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .features import ALTERNATIVE_FEATURES, FILING_FEATURES, FRESHNESS_FEATURES, PRICE_FEATURES

MODEL_FEATURES = {
    "historical_volatility": [],
    "price": PRICE_FEATURES,
    "price_filing": PRICE_FEATURES + FILING_FEATURES,
    "price_filing_alternative": PRICE_FEATURES + FILING_FEATURES + ALTERNATIVE_FEATURES,
    "freshness_fusion": PRICE_FEATURES + FILING_FEATURES + ALTERNATIVE_FEATURES + FRESHNESS_FEATURES,
}


@dataclass(frozen=True)
class Partition:
    train_indices: np.ndarray
    calibration_indices: np.ndarray
    test_indices: np.ndarray


def rolling_partitions(dates: pd.DatetimeIndex, horizon: int, train_sessions: int = 360, calibration_sessions: int = 80, step_sessions: int = 20) -> list[Partition]:
    """Strictly mature labels: end < next stage's first date, with overlapping targets purged."""
    if horizon not in (5, 20) or min(train_sessions, calibration_sessions, step_sessions) <= 0:
        raise ValueError("invalid split configuration")
    if not dates.is_monotonic_increasing or dates.has_duplicates:
        raise ValueError("dates must be sorted and unique")
    first_test = train_sessions + calibration_sessions + 2 * horizon
    last_origin = len(dates) - horizon
    parts = []
    for start in range(first_test, last_origin, step_sessions):
        train_start = start - 2 * horizon - calibration_sessions - train_sessions
        train_end = train_start + train_sessions
        cal_start = train_end + horizon
        cal_end = cal_start + calibration_sessions
        test_start = cal_end + horizon
        test_end = min(test_start + step_sessions, last_origin)
        train = np.arange(train_start, train_end, dtype=int)
        cal = np.arange(cal_start, cal_end, dtype=int)
        test = np.arange(test_start, test_end, dtype=int)
        if not (dates[train[-1] + horizon] < dates[cal[0]] and dates[cal[-1] + horizon] < dates[test[0]]):
            raise AssertionError("non-mature label entered a later partition")
        parts.append(Partition(train, cal, test))
    return parts


def ridge_predictions(train: pd.DataFrame, calibration: pd.DataFrame, test: pd.DataFrame, features: list[str]) -> tuple[np.ndarray, np.ndarray]:
    """Fit transform and Ridge only on training rows; calibrate residual radius separately."""
    model = make_pipeline(SimpleImputer(strategy="median", keep_empty_features=True), StandardScaler(), Ridge(alpha=20.0))
    model.fit(train[features], train.label)
    cal_prediction = np.clip(model.predict(calibration[features]), 0, 3)
    test_prediction = np.clip(model.predict(test[features]), 0, 3)
    return cal_prediction, test_prediction
