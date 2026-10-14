import numpy as np
import pandas as pd

from finscope.features import build_features
from finscope.fixtures import demo_data
from finscope.models import rolling_partitions


def test_future_price_and_event_mutations_leave_earlier_features_identical():
    prices, events = demo_data(sessions=260)
    first = build_features(prices, events)
    boundary = pd.Timestamp("2020-08-01")
    changed_prices = prices.copy()
    changed_prices.loc[changed_prices.date > boundary, "close"] *= 100
    changed_events = [dict(e) for e in events]
    for event in changed_events:
        if pd.Timestamp(event["available_at"]) > boundary.tz_localize("UTC"):
            event["text"] = "excellent excellent excellent delayed"
            event["delay_days"] = 999
    changed_events.append({"id": "future-only", "ticker": "ALTO", "kind": "social", "event_time": "2021-01-01T00:00:00Z", "available_at": "2021-01-01T00:00:00Z", "ingested_at": "2021-01-01T00:00:00Z", "text": "bad", "source": "test"})
    second = build_features(changed_prices, changed_events)
    early = first.loc[first.date <= boundary].reset_index(drop=True)
    pd.testing.assert_frame_equal(early, second.loc[second.date <= boundary].reset_index(drop=True))


def test_event_ingested_after_origin_is_excluded_even_if_occurred_earlier():
    prices, _ = demo_data(sessions=80)
    event = {"id": "late", "ticker": "ALTO", "kind": "social", "event_time": "2020-01-02T00:00:00Z", "available_at": "2020-01-02T00:00:00Z", "ingested_at": "2020-03-01T00:00:00Z", "text": "good strong", "source": "test"}
    features = build_features(prices, [event])
    early = features[(features.ticker == "ALTO") & (features.date < pd.Timestamp("2020-03-01"))]
    assert (early.social_count == 0).all()
    assert features[(features.ticker == "ALTO") & (features.date >= pd.Timestamp("2020-03-01"))].social_count.max() > 0


def test_us_summer_after_close_event_waits_until_next_daily_close():
    prices = pd.DataFrame([
        {"date": "2020-07-01", "ticker": "AAA", "close": 100, "volume": 10},
        {"date": "2020-07-02", "ticker": "AAA", "close": 101, "volume": 10},
    ])
    event = {"id": "summer", "ticker": "AAA", "kind": "social", "event_time": "2020-07-01T20:30:00Z", "available_at": "2020-07-01T20:30:00Z", "ingested_at": "2020-07-01T20:30:00Z", "text": "strong", "source": "test"}
    rows = build_features(prices, [event])
    assert rows.social_count.tolist() == [0.0, 1.0]


def test_us_early_close_event_after_information_cutoff_waits():
    prices = pd.DataFrame([
        {"date": "2020-11-27", "ticker": "AAA", "close": 100, "volume": 10},
        {"date": "2020-11-30", "ticker": "AAA", "close": 101, "volume": 10},
    ])
    event = {"id": "half-day", "ticker": "AAA", "kind": "filing", "event_time": "2020-11-27T17:30:00Z", "available_at": "2020-11-27T17:30:00Z", "ingested_at": "2020-11-27T17:30:00Z", "text": "Capacity improved", "source": "test"}
    rows = build_features(prices, [event])
    assert np.isnan(rows.filing_age.iloc[0])
    assert np.isfinite(rows.filing_age.iloc[1])


def test_all_training_and_calibration_labels_mature_before_next_partition():
    dates = pd.bdate_range("2020-01-01", periods=270)
    parts = rolling_partitions(dates, horizon=20, train_sessions=120, calibration_sessions=40, step_sessions=20)
    assert parts
    for part in parts:
        assert np.all(dates[part.train_indices + 20] < dates[part.calibration_indices[0]])
        assert np.all(dates[part.calibration_indices + 20] < dates[part.test_indices[0]])


def test_zero_volume_history_does_not_create_infinite_features():
    prices, events = demo_data(sessions=80)
    alto = prices[prices.ticker == "ALTO"].sort_values("date")
    prices.loc[alto.index[:25], "volume"] = 0
    features = build_features(prices, events)
    assert np.isfinite(features.loc[features.ticker == "ALTO", "volume_change_20"].dropna()).all()


def test_extreme_finite_volume_ratio_stays_finite_without_warnings():
    prices, events = demo_data(sessions=80)
    prices["volume"] = prices["volume"].astype(float)
    alto = prices[prices.ticker == "ALTO"].sort_values("date")
    prices.loc[alto.index[:25], "volume"] = 1e-300
    prices.loc[alto.index[25], "volume"] = 1e300
    with np.errstate(over="raise", invalid="raise", divide="raise"):
        features = build_features(prices, events)
    assert np.isfinite(features.loc[features.ticker == "ALTO", "volume_change_20"].dropna()).all()
