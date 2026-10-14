"""Forecast, drift, and executable-strategy diagnostics."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd


def drift_psi(train: np.ndarray, observed: np.ndarray, bins: int = 10) -> float:
    """PSI with edges fixed from training only; >0.25 is a heuristic alert."""
    left = np.asarray(train, dtype=float)
    right = np.asarray(observed, dtype=float)
    left = left[np.isfinite(left)]
    right = right[np.isfinite(right)]
    if not len(left) or not len(right):
        return 0.0
    if np.min(left) == np.max(left):
        return 0.0 if np.all(right == left[0]) else 10.0
    edges = np.unique(np.quantile(left, np.linspace(0, 1, bins + 1)[1:-1]))
    a = np.bincount(np.digitize(left, edges), minlength=len(edges) + 1).astype(float)
    b = np.bincount(np.digitize(right, edges), minlength=len(edges) + 1).astype(float)
    a = (a + 0.5) / (a.sum() + 0.5 * len(a))
    b = (b + 0.5) / (b.sum() + 0.5 * len(b))
    return float(np.sum((b - a) * np.log(b / a)))


def _require_complete_panel(frame: pd.DataFrame) -> None:
    """Keep equal ticker sleeves present on every evaluated date."""
    if frame.empty:
        raise ValueError("strategy requires observations")
    if frame.duplicated(["date", "ticker"]).any():
        raise ValueError("strategy requires unique ticker/date rows")
    count = frame.ticker.nunique()
    if (frame.groupby("date").ticker.nunique() != count).any():
        raise ValueError("strategy requires a complete common-date panel; missing ticker/date rows cannot be valued")


def strategy_series(frame: pd.DataFrame, cost_bps: float = 10.0, target_vol: float = 0.2) -> pd.DataFrame:
    """A signal at close t first owns close(t+1)->close(t+2); cash yield is zero."""
    if not 0 <= cost_bps <= 1000 or not 0 < target_vol <= 2:
        raise ValueError("cost_bps or target_vol outside supported range")
    out = frame.sort_values(["ticker", "date"]).copy()
    _require_complete_panel(out)
    results = []
    for _, group in out.groupby("ticker", sort=False):
        g = group.copy()
        pred = g.prediction.to_numpy(dtype=float)
        close = g.close.to_numpy(dtype=float)
        if not np.isfinite(pred).all() or not np.isfinite(close).all() or (close <= 0).any():
            raise ValueError("strategy predictions and positive closes must be finite")
        log_differences = np.diff(np.log(close))
        if not np.isfinite(log_differences).all() or (np.abs(log_differences) > 700).any():
            raise ValueError("strategy close-to-close ratio exceeds safe floating-point range")
        signal = np.clip(target_vol / np.maximum(pred, 1e-6), 0, 1)
        position = np.r_[0., 0., signal[:-2]] if len(signal) >= 2 else np.zeros(len(signal))
        gross = np.r_[0., np.expm1(log_differences)] * position
        turnover = np.abs(position - np.r_[0., position[:-1]])
        g["position"] = position
        g["turnover"] = turnover
        g["gross_return"] = gross
        g["net_return"] = gross - turnover * cost_bps / 10_000
        results.append(g)
    return pd.concat(results, ignore_index=True).sort_values(["date", "ticker"]).reset_index(drop=True)


def forecast_metrics(rows: pd.DataFrame) -> dict:
    actual = rows.actual.to_numpy(dtype=float)
    prediction = rows.prediction.to_numpy(dtype=float)
    lower = rows.lower.to_numpy(dtype=float)
    upper = rows.upper.to_numpy(dtype=float)
    if not len(rows) or not all(np.isfinite(x).all() for x in (actual, prediction, lower, upper)):
        raise ValueError("forecast metrics require finite observations and intervals")
    try:
        with np.errstate(over="raise", invalid="raise"):
            errors = prediction - actual
            result = {
                "count": int(len(rows)),
                "mae": float(np.mean(np.abs(errors))),
                "rmse": float(np.sqrt(np.mean(errors**2))),
                "bias": float(np.mean(errors)),
                "coverage": float(np.mean((actual >= lower) & (actual <= upper))),
                "mean_interval_width": float(np.mean(upper - lower)),
            }
    except FloatingPointError as exc:
        raise ValueError("forecast metrics exceed safe floating-point range") from exc
    if not all(math.isfinite(value) for value in result.values()):
        raise ValueError("forecast metrics exceed safe floating-point range")
    return result


def strategy_metrics(rows: pd.DataFrame) -> dict:
    _require_complete_panel(rows)
    daily = rows.groupby("date").net_return.mean().to_numpy(dtype=float)
    if not np.isfinite(daily).all() or (daily <= -1).any():
        raise ValueError("strategy daily returns are non-finite or exhaust capital")
    try:
        with np.errstate(over="raise", invalid="raise"):
            wealth = np.cumprod(1 + daily)
            volatility = float(np.std(daily, ddof=0) * math.sqrt(252))
    except FloatingPointError as exc:
        raise ValueError("strategy cumulative return exceeds safe floating-point range") from exc
    if not np.isfinite(wealth).all() or not math.isfinite(volatility) or (wealth <= 0).any():
        raise ValueError("strategy cumulative return exceeds safe floating-point range")
    try:
        with np.errstate(over="raise", invalid="raise", divide="raise"):
            peak = np.maximum.accumulate(np.r_[1., wealth])[1:]
            result = {
                "total_return": float(wealth[-1] - 1),
                "annualized_volatility": volatility,
                "sharpe_zero_cash_rate": float((np.mean(daily) / volatility) * 252) if volatility > 0 else 0.0,
                "maximum_drawdown": float(np.min(wealth / peak - 1)),
                "mean_daily_turnover": float(rows.groupby("date").turnover.mean().mean()),
            }
    except FloatingPointError as exc:
        raise ValueError("strategy metrics exceed safe floating-point range") from exc
    if not all(math.isfinite(value) for value in result.values()):
        raise ValueError("strategy metrics exceed safe floating-point range")
    return result
