import json
import pytest
import pandas as pd

from finscope.experiment import run_experiment
from finscope.fixtures import demo_data


def test_report_contains_all_fixed_models_and_finite_json_with_aligned_dates():
    prices, events = demo_data(sessions=270)
    report = run_experiment(prices, events, horizon=5, seed=42)
    assert report["schema_version"] == "1.0.0"
    assert report["provenance"]["data_kind"] == "synthetic"
    assert set(report["experiments"]["5"]["models"]) == {"historical_volatility", "price", "price_filing", "price_filing_alternative", "freshness_fusion"}
    series = [model["series"] for model in report["experiments"]["5"]["models"].values()]
    assert all(s for s in series)
    assert all([(row["date"], row["ticker"]) for row in s] == [(row["date"], row["ticker"]) for row in series[0]] for s in series)
    observations = report["experiments"]["5"]["observations"]
    assert [(x["date"], x["ticker"]) for x in observations] == [(x["date"], x["ticker"]) for x in series[0]]
    assert "actual" in observations[0] and "close" in observations[0]
    assert "close" not in series[0][0] and "actual" not in series[0][0]
    json.dumps(report, allow_nan=False)


def test_future_event_mutation_does_not_change_past_predictions():
    prices, events = demo_data(sessions=270)
    baseline = run_experiment(prices, events, horizon=5)
    future = {"id": "last-event", "ticker": "ALTO", "kind": "social", "event_time": "2020-12-31T00:00:00Z", "available_at": "2020-12-31T00:00:00Z", "ingested_at": "2020-12-31T00:00:00Z", "text": "terrible failure", "source": "test"}
    altered = run_experiment(prices, [*events, future], horizon=5)
    first = baseline["experiments"]["5"]["models"]["price_filing_alternative"]["series"]
    second = altered["experiments"]["5"]["models"]["price_filing_alternative"]["series"]
    assert [(x["date"], x["prediction"]) for x in first if x["date"] < "2020-12-31"] == [(x["date"], x["prediction"]) for x in second if x["date"] < "2020-12-31"]


def test_future_price_mutation_does_not_rewrite_prior_predictions():
    prices, events = demo_data(sessions=270)
    baseline = run_experiment(prices, events, horizon=5)
    altered_prices = prices.copy()
    altered_prices.loc[altered_prices.date >= "2020-12-01", "close"] *= 1.5
    changed = run_experiment(altered_prices, events, horizon=5)
    for name in baseline["experiments"]["5"]["models"]:
        first = baseline["experiments"]["5"]["models"][name]["series"]
        second = changed["experiments"]["5"]["models"][name]["series"]
        assert [(x["date"], x["ticker"], x["prediction"]) for x in first if x["date"] < "2020-11-23"] == [(x["date"], x["ticker"], x["prediction"]) for x in second if x["date"] < "2020-11-23"]


def test_horizon_20_splits_are_strict_and_repeated_run_is_deterministic():
    prices, events = demo_data(sessions=270)
    first = run_experiment(prices, events, horizon=20)
    second = run_experiment(prices, events, horizon=20)
    first["provenance"].pop("generated_at")
    second["provenance"].pop("generated_at")
    assert first == second
    for split in first["audit"]["splits"]:
        assert split["train_last_label_end"] < split["calibration_start"]
        assert split["calibration_last_label_end"] < split["test_start"]


def test_user_import_does_not_claim_verified_point_in_time():
    prices, events = demo_data(sessions=270)
    prices.attrs.clear()
    report = run_experiment(prices, events)
    assert report["provenance"]["data_kind"] == "user_import"
    assert report["provenance"]["availability_claim"] == "user_reported_unverified"
    assert "cannot prove historical point-in-time" in report["audit"]["warnings"][0]


def test_imported_fictional_symbol_does_not_inherit_demo_company_name():
    prices, events = demo_data(sessions=270)
    prices.attrs.clear()
    company = next(c for c in run_experiment(prices, events)["companies"] if c["ticker"] == "ALTO")
    assert company == {"ticker": "ALTO", "name": "ALTO", "sector": "Unknown", "fictional": False}


def test_report_calls_16utc_an_information_cutoff_and_audits_late_event():
    prices, events = demo_data(sessions=270)
    last_day = prices.date.max().strftime("%Y-%m-%d")
    late = {"id": "late-final", "ticker": "ALTO", "kind": "social", "event_time": f"{last_day}T17:00:00Z", "available_at": f"{last_day}T17:00:00Z", "ingested_at": f"{last_day}T17:00:00Z", "text": "strong", "source": "test"}
    report = run_experiment(prices, [*events, late])
    assert report["config"]["event_information_cutoff_utc"] == "16:00:00"
    assert "actual close" in report["config"]["decision_time"]
    assert report["audit"]["quality"]["event_after_last_information_cutoff"] == 1


def test_missing_ticker_on_evaluation_date_fails_portfolio_valuation():
    prices, events = demo_data(sessions=270)
    evaluation_date = sorted(prices.date.unique())[200]
    prices = prices[~((prices.ticker == "ALTO") & (prices.date == evaluation_date))]
    with pytest.raises(ValueError, match="complete common-date panel"):
        run_experiment(prices, events)


def test_short_ticker_cannot_hide_behind_long_peers():
    prices, events = demo_data(sessions=270)
    prices = prices[(prices.ticker != "ALTO") | (prices.date < "2020-03-01")]
    with pytest.raises(ValueError, match="ALTO.*insufficient"):
        run_experiment(prices, events)


def test_report_audits_missing_sessions_and_zero_volume():
    prices, events = demo_data(sessions=270)
    prices = prices[~((prices.ticker == "ALTO") & (prices.date == pd.Timestamp("2020-07-01")))].copy()
    prices.loc[prices.ticker == "BRYN", "volume"] = 0
    report = run_experiment(prices, events)
    assert report["audit"]["quality"]["missing_ticker_dates"] == 1
    assert report["audit"]["quality"]["zero_volume_rows"] == 270
