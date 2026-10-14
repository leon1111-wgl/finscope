"""Deterministic, entirely fictional demonstration observations."""

from __future__ import annotations

import numpy as np
import pandas as pd
from datetime import datetime, time, timedelta, timezone

COMPANIES = [
    {"ticker": "ALTO", "name": "Alto Devices", "sector": "Electronics", "fictional": True},
    {"ticker": "BRYN", "name": "Bryn Cloud", "sector": "Software", "fictional": True},
    {"ticker": "COVA", "name": "Cova Markets", "sector": "Retail", "fictional": True},
    {"ticker": "DARA", "name": "Dara Components", "sector": "Industrial", "fictional": True},
]


def demo_data(sessions: int = 900, seed: int = 42) -> tuple[pd.DataFrame, list[dict]]:
    """Generate repeatable prices and authored events; no empirical alpha is implied."""
    if not 80 <= sessions <= 2_000:
        raise ValueError("sessions must be between 80 and 2000")
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range("2020-01-01", periods=sessions)
    common = rng.normal(size=sessions)
    regime = np.where(np.arange(sessions) < sessions * 0.36, 0.008, np.where(np.arange(sessions) < sessions * 0.68, 0.025, 0.012))
    rows: list[dict] = []
    events: list[dict] = []
    for index, company in enumerate(COMPANIES):
        ticker = company["ticker"]
        shocks = 0.45 * common + np.sqrt(1 - 0.45**2) * rng.normal(size=sessions)
        returns = 0.00012 + regime * (0.7 + index * 0.18) * shocks
        close = 75.0 * (1 + index * 0.33) * np.exp(np.cumsum(returns))
        volume = rng.integers(100_000, 2_000_000, size=sessions)
        rows.extend({"date": d, "ticker": ticker, "close": float(c), "volume": int(v)} for d, c, v in zip(dates, close, volume))
        for n, pos in enumerate(range(30, sessions, 28)):
            day = dates[pos]
            event_dt = datetime.combine(day.date(), time(22), tzinfo=timezone.utc)
            stamp = event_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            later = (event_dt + timedelta(hours=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
            filing_text = ("Demand strengthened and capacity expanded" if n % 3 else "Demand slowed and costs increased") + f" in {ticker}'s fictional operations."
            events.append({"id": f"{ticker}-filing-{n}", "ticker": ticker, "kind": "filing", "event_time": stamp, "available_at": stamp, "ingested_at": later, "text": filing_text, "source": "FinScope authored synthetic filing", "revenue_growth": float(np.sin(n + index) * 0.08)})
            social_text = ("strong delivery and positive service" if n % 2 else "delayed delivery and weak service") + f" for {ticker} fictional products"
            events.append({"id": f"{ticker}-social-{n}", "ticker": ticker, "kind": "social", "event_time": stamp, "available_at": stamp, "ingested_at": later, "text": social_text, "source": "FinScope authored synthetic social scenario"})
            events.append({"id": f"{ticker}-supply-{n}", "ticker": ticker, "kind": "supply", "event_time": stamp, "available_at": stamp, "ingested_at": later, "text": "Fictional supplier shipment update", "source": "FinScope authored synthetic supply log", "delay_days": float((n + index) % 5), "relationship": "DARA" if ticker != "DARA" else "ALTO"})
    prices = pd.DataFrame(rows)
    prices.attrs["finscope_data_kind"] = "synthetic"
    return prices, events
