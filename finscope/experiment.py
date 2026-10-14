"""Reproducible, purged rolling evaluation and versioned report assembly."""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone
from importlib.metadata import version

import numpy as np
import pandas as pd

from .data import validate_events, validate_prices
from .features import EVENT_INFORMATION_CUTOFF_UTC, build_features
from .fixtures import COMPANIES
from .metrics import drift_psi, forecast_metrics, strategy_metrics, strategy_series
from .models import MODEL_FEATURES, ridge_predictions, rolling_partitions

SCHEMA_VERSION = "1.0.0"


def _labels(features: pd.DataFrame, horizon: int) -> pd.DataFrame:
    pieces = []
    for _, group in features.groupby("ticker", sort=True):
        g = group.sort_values("date").copy()
        ret = np.diff(np.log(g.close.to_numpy(dtype=float)))
        label = np.full(len(g), np.nan)
        end = [pd.NaT] * len(g)
        for i in range(len(g) - horizon):
            label[i] = float(np.std(ret[i:i + horizon], ddof=0) * np.sqrt(252))
            end[i] = g.date.iloc[i + horizon]
        g["label"] = label
        g["label_end"] = end
        pieces.append(g)
    return pd.concat(pieces, ignore_index=True).sort_values(["date", "ticker"]).reset_index(drop=True)


def _fingerprint(prices: pd.DataFrame, events: list[dict]) -> str:
    prices_json = prices.assign(date=prices.date.dt.strftime("%Y-%m-%d")).to_json(orient="records", double_precision=15)
    payload = json.dumps({"prices": json.loads(prices_json), "events": events}, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(payload.encode()).hexdigest()


def _quantile_radius(actual: np.ndarray, prediction: np.ndarray) -> float:
    residual = np.abs(actual - prediction)
    q = min(1.0, math.ceil((len(residual) + 1) * 0.9) / len(residual))
    return float(np.quantile(residual, q, method="higher"))


def _breakdown(rows: pd.DataFrame) -> dict:
    bins = [-np.inf, 0.15, 0.30, np.inf]
    names = ["low_past_vol", "medium_past_vol", "high_past_vol"]
    regime = pd.cut(rows.vol_20.fillna(0), bins=bins, labels=names)
    return {name: {"count": int(mask.sum()), "mae": float(np.mean(np.abs(rows.loc[mask, "prediction"] - rows.loc[mask, "actual"]))) if mask.any() else None} for name in names for mask in [(regime == name).to_numpy()]}


def _series_records(rows: pd.DataFrame) -> list[dict]:
    output = []
    for row in rows.itertuples():
        output.append({
            "date": row.date.strftime("%Y-%m-%d"), "ticker": row.ticker,
            "prediction": float(row.prediction),
            "lower": float(row.lower), "upper": float(row.upper),
            "position": float(row.position), "turnover": float(row.turnover),
            "gross_return": float(row.gross_return), "net_return": float(row.net_return),
        })
    return output


def _observations(rows: pd.DataFrame) -> list[dict]:
    return [{
        "date": row.date.strftime("%Y-%m-%d"), "ticker": row.ticker,
        "close": float(row.close), "actual": float(row.actual),
        "past_volatility": float(row.vol_20) if np.isfinite(row.vol_20) else None,
        "label_end": row.label_end.strftime("%Y-%m-%d"),
    } for row in rows.itertuples()]


def run_experiment(prices: pd.DataFrame | str, events: list[dict] | str, horizon: int = 5, seed: int = 42) -> dict:
    """Run fixed ablations with rolling fits. Existing cached inputs are not independently PIT verified."""
    if horizon not in (5, 20):
        raise ValueError("horizon must be 5 or 20 sessions")
    data_kind = prices.attrs.get("finscope_data_kind", "user_import") if isinstance(prices, pd.DataFrame) else "user_import"
    px = validate_prices(prices)
    ev = validate_events(events)
    features = _labels(build_features(px, ev), horizon)
    dates = pd.DatetimeIndex(sorted(px.date.unique()))
    train_sessions = 360 if len(dates) >= 530 else 120
    calibration_sessions = 80 if len(dates) >= 530 else 40
    minimum_sessions = train_sessions + calibration_sessions + 3 * horizon + 1
    for ticker, count in px.groupby("ticker").size().items():
        if count < minimum_sessions:
            raise ValueError(f"{ticker} has insufficient history: {count} sessions; require at least {minimum_sessions}")
    partitions = rolling_partitions(dates, horizon, train_sessions, calibration_sessions, 20)
    if not partitions:
        raise ValueError(f"insufficient history for purged evaluation: require at least {minimum_sessions} distinct sessions")
    records: dict[str, list[pd.DataFrame]] = {name: [] for name in MODEL_FEATURES}
    split_audit = []
    drift_items: dict[str, list[float]] = {name: [] for name in MODEL_FEATURES}
    for part in partitions:
        train_start = dates[part.train_indices[0]]
        cal_start = dates[part.calibration_indices[0]]
        test_start = dates[part.test_indices[0]]
        train = features[features.date.isin(dates[part.train_indices]) & (features.label_end < cal_start) & features.label.notna()]
        calibration = features[features.date.isin(dates[part.calibration_indices]) & (features.label_end < test_start) & features.label.notna()]
        test = features[features.date.isin(dates[part.test_indices]) & features.label.notna()]
        if len(train) < 50 or len(calibration) < 20 or test.empty:
            raise ValueError("insufficient mature labels for one rolling partition")
        split_audit.append({
            "train_start": train_start.strftime("%Y-%m-%d"),
            "train_last_origin": train.date.max().strftime("%Y-%m-%d"),
            "train_last_label_end": train.label_end.max().strftime("%Y-%m-%d"),
            "calibration_start": cal_start.strftime("%Y-%m-%d"),
            "calibration_last_origin": calibration.date.max().strftime("%Y-%m-%d"),
            "calibration_last_label_end": calibration.label_end.max().strftime("%Y-%m-%d"),
            "test_start": test_start.strftime("%Y-%m-%d"),
            "test_end": test.date.max().strftime("%Y-%m-%d"),
        })
        for name, columns in MODEL_FEATURES.items():
            if name == "historical_volatility":
                cal_pred = calibration.vol_20.fillna(0).to_numpy(dtype=float)
                test_pred = test.vol_20.fillna(0).to_numpy(dtype=float)
                drift_columns = ["vol_20"]
            else:
                cal_pred, test_pred = ridge_predictions(train, calibration, test, columns)
                drift_columns = columns
            radius = _quantile_radius(calibration.label.to_numpy(), cal_pred)
            result = test[["date", "ticker", "close", "vol_20", "label_end"]].copy()
            result["actual"] = test.label.to_numpy(dtype=float)
            result["prediction"] = test_pred
            result["lower"] = np.maximum(0, test_pred - radius)
            result["upper"] = test_pred + radius
            records[name].append(result)
            drift_items[name].append(float(np.mean([drift_psi(train[col].to_numpy(), test[col].to_numpy()) for col in drift_columns])))
    models = {}
    shared_rows = pd.concat(records["historical_volatility"], ignore_index=True).sort_values(["date", "ticker"]).reset_index(drop=True)
    observations = _observations(shared_rows)
    for name, batches in records.items():
        rows = pd.concat(batches, ignore_index=True).sort_values(["date", "ticker"]).reset_index(drop=True)
        strategy = strategy_series(rows)
        rolling = []
        for _, window in rows.groupby(pd.Grouper(key="date", freq="20B")):
            if not window.empty:
                rolling.append({"end": window.date.max().strftime("%Y-%m-%d"), "mae": float(np.mean(np.abs(window.prediction - window.actual)))})
        models[name] = {
            "features": ["vol_20"] if name == "historical_volatility" else list(MODEL_FEATURES[name]),
            "forecast_metrics": forecast_metrics(rows),
            "strategy_metrics": strategy_metrics(strategy),
            "regime_errors": _breakdown(rows),
            "rolling_error": rolling,
            "mean_input_psi": float(np.mean(drift_items[name])),
            "series": _series_records(strategy),
        }
    tickers = sorted(px.ticker.unique())
    last_information_cutoff = datetime.combine(dates[-1].date(), EVENT_INFORMATION_CUTOFF_UTC, tzinfo=timezone.utc)
    quality = {
        "ticker_sessions": {ticker: int(count) for ticker, count in px.groupby("ticker").size().items()},
        "missing_ticker_dates": int(len(dates) * len(tickers) - len(px)),
        "zero_volume_rows": int((px.volume == 0).sum()),
        "event_after_last_information_cutoff": int(sum(datetime.fromisoformat(item["usable_at"].replace("Z", "+00:00")) > last_information_cutoff for item in ev)),
    }
    # Retained for version-1 consumers; this legacy key means the information cutoff, not the exchange close.
    quality["event_usable_after_last_close"] = quality["event_after_last_information_cutoff"]
    companies = ([next((dict(c) for c in COMPANIES if c["ticker"] == t), {"ticker": t, "name": t, "sector": "Unknown", "fictional": True}) for t in tickers]
                 if data_kind == "synthetic" else
                 [{"ticker": t, "name": t, "sector": "Unknown", "fictional": False} for t in tickers])
    evidence = [{key: item[key] for key in ("id", "ticker", "kind", "event_time", "available_at", "ingested_at", "usable_at", "text", "source", "delay_days", "relationship", "revenue_growth") if key in item} for item in ev]
    edges = sorted({(e["ticker"], e["relationship"]) for e in ev if e.get("relationship") and e["ticker"] in tickers and e["relationship"] in tickers})
    warning = "Synthetic observations and lexical event scores do not establish real-world predictive performance." if data_kind == "synthetic" else "User-reported availability and ingestion timestamps are unverified; a later cached import cannot prove historical point-in-time access. Use adjusted close prices and account for survivorship/revisions."
    quality_warnings = []
    if quality["missing_ticker_dates"]:
        quality_warnings.append("Some ticker/session rows are absent; no interpolation was performed.")
    if quality["zero_volume_rows"]:
        quality_warnings.append("Zero-volume rows are present; volume-ratio features use missing values when the past median is zero.")
    if quality["event_after_last_information_cutoff"]:
        quality_warnings.append("Some events become usable only after the final 16:00 UTC information cutoff and cannot affect features.")
    return {
        "schema_version": SCHEMA_VERSION,
        "provenance": {
            "data_kind": data_kind, "dataset_sha256": _fingerprint(px, ev),
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "seed": int(seed), "package_versions": {p: version(p) for p in ("numpy", "pandas", "scikit-learn")},
            "availability_claim": "authored_synthetic_timestamps" if data_kind == "synthetic" else "user_reported_unverified",
        },
        "config": {"horizon": horizon, "annualization_sessions": 252, "train_sessions": train_sessions, "calibration_sessions": calibration_sessions, "step_sessions": 20, "ridge_alpha": 20.0, "interval_nominal_coverage": 0.9, "cost_bps": 10.0, "target_vol": 0.2, "signal_execution_lag_closes": 2, "event_information_cutoff_utc": "16:00:00", "market_scope": "US listed equities daily adjusted closes", "decision_time": "after each supplied US session's actual close, including early closes", "portfolio_weight_policy": "fixed equal ticker sleeves; complete common-date evaluation panel required", "model_order": list(MODEL_FEATURES)},
        "companies": companies,
        "experiments": {str(horizon): {"horizon": horizon, "observations": observations, "models": models}},
        "evidence": evidence,
        "audit": {"warnings": [warning, "Event features use a 16:00 UTC information cutoff for supported US daily sessions, sacrificing later same-day information before the actual close.", "Intervals are past-residual diagnostics, with no coverage guarantee under drift; hyperparameters were fixed and every ablation is reported.", "No pretrained LLM is used; any future historical LLM study must audit checkpoint knowledge dates and pretraining contamination.", *quality_warnings], "quality": quality, "splits": split_audit, "price_rows": len(px), "event_rows": len(ev), "psi_heuristic": {"moderate": 0.1, "large": 0.25}},
        "network": {"kind": "descriptive_supplied_relationships", "edges": [{"source": a, "target": b} for a, b in edges]},
    }
