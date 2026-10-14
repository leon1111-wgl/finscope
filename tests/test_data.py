import pandas as pd
import pytest

from finscope.data import validate_events, validate_prices


def test_prices_reject_duplicate_and_invalid_rows():
    rows = pd.DataFrame([
        {"date": "2022-01-03", "ticker": "AAA", "close": 100, "volume": 10},
        {"date": "2022-01-03", "ticker": "AAA", "close": 101, "volume": 10},
    ])
    with pytest.raises(ValueError, match="duplicate"):
        validate_prices(rows)
    rows.loc[1, "date"] = "2022-01-04"
    rows["close"] = rows["close"].astype(float)
    rows.loc[1, "close"] = float("inf")
    with pytest.raises(ValueError, match="finite"):
        validate_prices(rows)
    rows.loc[1, "close"] = 0
    with pytest.raises(ValueError, match="positive"):
        validate_prices(rows)


def test_events_reject_conflicting_ids_and_naive_timestamps():
    event = {"id": "e1", "ticker": "AAA", "kind": "filing", "event_time": "2022-01-01T00:00:00Z", "available_at": "2022-01-02T00:00:00Z", "ingested_at": "2022-01-03T00:00:00Z", "text": "Revenue rose", "source": "test"}
    with pytest.raises(ValueError, match="duplicate"):
        validate_events([event, {**event, "text": "Revenue fell"}])
    with pytest.raises(ValueError, match="UTC-aware"):
        validate_events([{**event, "event_time": "2022-01-01T00:00:00"}])


def test_price_csv_roundtrip_preserves_reproducible_float_values(tmp_path):
    source = pd.DataFrame([{"date": "2022-01-03", "ticker": "AAA", "close": 126.59324674623241, "volume": 10}])
    path = tmp_path / "prices.csv"
    source.to_csv(path, index=False, float_format="%.17g")
    assert validate_prices(path).close.iloc[0] == validate_prices(source).close.iloc[0]


def test_fractional_event_timestamps_use_chronological_not_string_order():
    event = {"id": "fraction", "ticker": "AAA", "kind": "filing", "event_time": "2022-01-01T00:00:00Z", "available_at": "2022-01-01T00:00:00.500Z", "ingested_at": "2022-01-01T00:00:00Z", "text": "A", "source": "test"}
    assert validate_events([event])[0]["usable_at"] == "2022-01-01T00:00:00.500000Z"
    with pytest.raises(ValueError, match="available_at cannot precede"):
        validate_events([{**event, "event_time": "2022-01-01T00:00:00.500Z", "available_at": "2022-01-01T00:00:00Z"}])


def test_extreme_finite_closes_fail_before_return_overflow():
    rows = pd.DataFrame([
        {"date": "2022-01-03", "ticker": "AAA", "close": 1., "volume": 1},
        {"date": "2022-01-04", "ticker": "AAA", "close": 1e-300, "volume": 1},
        {"date": "2022-01-05", "ticker": "AAA", "close": 1e300, "volume": 1},
    ])
    with pytest.raises(ValueError, match="close-to-close ratio"):
        validate_prices(rows)
