"""Features computed only from observations usable at each close."""

from __future__ import annotations

import re
from collections import Counter
from datetime import datetime, time, timedelta, timezone

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

from .data import validate_events, validate_prices

POSITIVE = {"strong", "strengthened", "positive", "expanded", "improved", "growth", "good"}
NEGATIVE = {"weak", "slowed", "negative", "delayed", "delay", "increased", "bad", "failure"}
PRICE_FEATURES = ["return_5", "return_20", "vol_5", "vol_20", "volume_change_20"]
FILING_FEATURES = ["filing_change", "filing_age", "revenue_growth"]
ALTERNATIVE_FEATURES = ["social_count", "social_lexical", "supply_delay"]
FRESHNESS_FEATURES = ["filing_freshness", "social_freshness", "supply_freshness"]
EVENT_INFORMATION_CUTOFF_UTC = time(16)


def _score(text: str) -> float:
    tokens = re.findall(r"[a-z]+", text.lower())
    if not tokens:
        return 0.0
    count = Counter(tokens)
    return float((sum(count[x] for x in POSITIVE) - sum(count[x] for x in NEGATIVE)) / len(tokens))


def _change(previous: str, current: str) -> float:
    if not previous:
        return 0.0
    try:
        vector = TfidfVectorizer(max_features=512, token_pattern=r"(?u)\b\w+\b").fit_transform([previous, current])
        return float(max(0.0, min(1.0, 1.0 - (vector[0] @ vector[1].T).toarray()[0, 0])))
    except ValueError:
        return 0.0


def build_features(prices: pd.DataFrame | str, events: list[dict] | str) -> pd.DataFrame:
    """Build a sorted table; a row uses prices through its date and usable events through that close."""
    px = validate_prices(prices)
    ev = validate_events(events)
    per_ticker: dict[str, list[dict]] = {}
    for item in ev:
        enriched = {**item, "_usable_dt": datetime.fromisoformat(item["usable_at"].replace("Z", "+00:00"))}
        per_ticker.setdefault(item["ticker"], []).append(enriched)
    pieces = []
    for ticker, group in px.groupby("ticker", sort=True):
        g = group.sort_values("date").copy()
        log_price = np.log(g.close)
        ret = log_price.diff()
        g["return_5"] = log_price.diff(5)
        g["return_20"] = log_price.diff(20)
        g["vol_5"] = ret.rolling(5, min_periods=5).std(ddof=0) * np.sqrt(252)
        g["vol_20"] = ret.rolling(20, min_periods=20).std(ddof=0) * np.sqrt(252)
        past_volume_median = g.volume.rolling(20, min_periods=20).median().replace(0, np.nan)
        # Approximate relative volume by log1p ratio, then cap the model feature.
        # Direct division can overflow for finite but extreme input volumes.
        log_volume_ratio = np.log1p(g.volume) - np.log1p(past_volume_median)
        g["volume_change_20"] = np.expm1(np.clip(log_volume_ratio, -30, np.log1p(1_000)))
        filings: list[dict] = []
        social: list[dict] = []
        supplies: list[dict] = []
        relevant = per_ticker.get(ticker, [])
        cursor = 0
        extra: list[dict] = []
        filing_change = 0.0
        for day in g.date:
            # This early event cutoff precedes even supported US early closes.
            # The close price itself becomes known only at that session's actual close.
            information_cutoff = datetime.combine(day.date(), EVENT_INFORMATION_CUTOFF_UTC, tzinfo=timezone.utc)
            while cursor < len(relevant) and relevant[cursor]["_usable_dt"] <= information_cutoff:
                item = relevant[cursor]
                {"filing": filings, "social": social, "supply": supplies}[item["kind"]].append(item)
                if item["kind"] == "filing":
                    filing_change = _change(filings[-2]["text"], filings[-1]["text"]) if len(filings) > 1 else 0.0
                cursor += 1
            recent_social = [x for x in social if information_cutoff - x["_usable_dt"] <= timedelta(days=30)]
            # Reposts with exactly the same normalized text count once per window.
            social_unique = list({x["text"].strip().lower(): x for x in recent_social}.values())
            recent_supply = [x for x in supplies if information_cutoff - x["_usable_dt"] <= timedelta(days=90)]
            last_filing = filings[-1] if filings else None
            filing_age = (information_cutoff - last_filing["_usable_dt"]).days if last_filing else None
            last_social_age = (information_cutoff - social[-1]["_usable_dt"]).days if social else None
            last_supply_age = (information_cutoff - supplies[-1]["_usable_dt"]).days if supplies else None
            extra.append({
                "filing_change": filing_change,
                "filing_age": float(filing_age) if filing_age is not None else np.nan,
                "revenue_growth": float(last_filing.get("revenue_growth", 0)) if last_filing else np.nan,
                "social_count": float(len(social_unique)),
                "social_lexical": float(np.mean([_score(x["text"]) for x in social_unique])) if social_unique else 0.0,
                "supply_delay": float(np.mean([x.get("delay_days", 0) for x in recent_supply])) if recent_supply else 0.0,
                "filing_freshness": float(np.exp(-filing_age / 90)) if filing_age is not None else 0.0,
                "social_freshness": float(np.exp(-last_social_age / 30)) if last_social_age is not None else 0.0,
                "supply_freshness": float(np.exp(-last_supply_age / 90)) if last_supply_age is not None else 0.0,
            })
        g = pd.concat([g.reset_index(drop=True), pd.DataFrame(extra)], axis=1)
        pieces.append(g)
    return pd.concat(pieces, ignore_index=True).sort_values(["date", "ticker"]).reset_index(drop=True)
