"""Strict, as-of aware user-data contracts."""

from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import numpy as np

MAX_PRICE_ROWS = 250_000
MAX_EVENTS = 25_000
MAX_TEXT = 4_000
KINDS = {"filing", "social", "supply"}


def validate_prices(data: pd.DataFrame | str | Path) -> pd.DataFrame:
    """Return date-sorted prices, preserving missing sessions rather than filling them."""
    frame = pd.read_csv(data, float_precision="round_trip") if isinstance(data, (str, Path)) else data.copy()
    required = {"date", "ticker", "close", "volume"}
    if not required.issubset(frame.columns):
        raise ValueError(f"prices require {sorted(required)}")
    frame = frame[list(sorted(required))]
    if frame.empty or len(frame) > MAX_PRICE_ROWS:
        raise ValueError("prices row count outside 1..250000")
    if frame[["date", "ticker", "close", "volume"]].isna().any().any():
        raise ValueError("prices contain missing values")
    if not frame["date"].astype(str).str.fullmatch(r"\d{4}-\d{2}-\d{2}").all():
        raise ValueError("prices date must be YYYY-MM-DD")
    frame["date"] = pd.to_datetime(frame["date"], errors="raise", format="%Y-%m-%d")
    if not frame["ticker"].map(lambda x: isinstance(x, str) and bool(re.fullmatch(r"[A-Za-z0-9._-]{1,16}", x))).all():
        raise ValueError("ticker must be a short ASCII identifier")
    for col in ("close", "volume"):
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
        if not frame[col].map(math.isfinite).all():
            raise ValueError(f"{col} must be finite")
    if (frame.close <= 0).any():
        raise ValueError("close must be positive")
    if (frame.volume < 0).any():
        raise ValueError("volume must be nonnegative")
    if frame.duplicated(["ticker", "date"]).any():
        raise ValueError("duplicate ticker/date price rows")
    frame = frame.sort_values(["date", "ticker"]).reset_index(drop=True)
    for ticker, group in frame.groupby("ticker", sort=False):
        # Check in log space, before any gross-return division can overflow.
        log_differences = np.diff(np.log(group.close.to_numpy(dtype=float)))
        if not np.isfinite(log_differences).all() or (np.abs(log_differences) > 700).any():
            raise ValueError(f"{ticker} close-to-close ratio exceeds safe floating-point range")
    return frame


def _utc_time(value: str, field: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be UTC-aware ISO string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{field} must be UTC-aware ISO string") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{field} must be UTC-aware ISO string")
    return parsed.astimezone(timezone.utc)


def validate_events(data: list[dict] | str | Path) -> list[dict]:
    """Normalize event timestamps and reject duplicated IDs, including identical copies."""
    events = json.loads(Path(data).read_text()) if isinstance(data, (str, Path)) else data
    if not isinstance(events, list) or len(events) > MAX_EVENTS:
        raise ValueError("events must be a JSON array with at most 25000 records")
    out: list[dict] = []
    seen: set[str] = set()
    for raw in events:
        if not isinstance(raw, dict):
            raise ValueError("each event must be an object")
        item = dict(raw)
        for field in ("id", "ticker", "kind", "text", "source"):
            if not isinstance(item.get(field), str) or not item[field].strip():
                raise ValueError(f"event {field} must be nonempty text")
        if item["id"] in seen:
            raise ValueError(f"duplicate event id {item['id']}")
        seen.add(item["id"])
        if item["kind"] not in KINDS:
            raise ValueError("event kind must be filing, social or supply")
        if len(item["text"]) > MAX_TEXT:
            raise ValueError("event text exceeds 4000 characters")
        times = {field: _utc_time(item.get(field), field) for field in ("event_time", "available_at", "ingested_at")}
        if times["available_at"] < times["event_time"]:
            raise ValueError("available_at cannot precede event_time")
        for field, parsed in times.items():
            item[field] = parsed.isoformat().replace("+00:00", "Z")
        item["usable_at"] = max(times["available_at"], times["ingested_at"]).isoformat().replace("+00:00", "Z")
        for metric in ("delay_days", "revenue_growth"):
            if metric in item:
                value = item[metric]
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                    raise ValueError(f"{metric} must be a finite number")
                if metric == "delay_days" and value < 0:
                    raise ValueError("delay_days must be nonnegative")
        if "relationship" in item and not isinstance(item["relationship"], str):
            raise ValueError("relationship must be text")
        out.append(item)
    return sorted(out, key=lambda e: (_utc_time(e["usable_at"], "usable_at"), e["id"]))
