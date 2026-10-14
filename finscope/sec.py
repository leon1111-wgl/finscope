"""Official SEC CompanyFacts snapshot with accession-level as-of evidence."""

from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

CIKS = {"AAPL": 320193, "MSFT": 789019, "NVDA": 1045810}
_last_request = 0.0


def select_companyfacts(payload: dict, tag: str, unit: str, as_of: str, duration: str = "annual") -> dict | None:
    """Return latest eligible period and filing, retaining a later eligible restatement."""
    cutoff = date.fromisoformat(as_of)
    candidates = []
    for taxonomy in ("us-gaap", "dei"):
        facts = payload.get("facts", {}).get(taxonomy, {}).get(tag, {}).get("units", {}).get(unit, [])
        for fact in facts:
            try:
                filed = date.fromisoformat(fact["filed"])
                end = date.fromisoformat(fact["end"])
                start = date.fromisoformat(fact["start"]) if "start" in fact else None
                value = fact["val"]
            except (KeyError, TypeError, ValueError):
                continue
            if filed > cutoff or end > cutoff or not isinstance(value, (int, float)):
                continue
            if duration == "annual":
                if start is None or not 330 <= (end - start).days <= 400 or fact.get("form") not in ("10-K", "10-K/A"):
                    continue
            elif duration == "instant":
                if start is not None:
                    continue
            else:
                raise ValueError("duration must be annual or instant")
            candidates.append((end, filed, fact.get("accn", ""), taxonomy, fact))
    if not candidates:
        return None
    end, filed, accession, taxonomy, fact = max(candidates, key=lambda x: x[:3])
    return {"tag": tag, "taxonomy": taxonomy, "unit": unit, "value": fact["val"], "start": fact.get("start"), "end": end.isoformat(), "filed": filed.isoformat(), "accession": accession, "form": fact.get("form"), "fiscal_year": fact.get("fy"), "fiscal_period": fact.get("fp")}


def fetch_companyfacts(cik: int, user_agent: str, cache_dir: str | Path = "local-data/sec") -> tuple[dict, dict]:
    """Fetch with SEC-identifying header, bounded retries and local raw snapshot."""
    global _last_request
    if not user_agent or "@" not in user_agent or len(user_agent) < 12:
        raise ValueError("SEC requires an identifying User-Agent with contact email")
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
    error = None
    for attempt in range(3):
        remaining = 0.25 - (time.monotonic() - _last_request)
        if remaining > 0:
            time.sleep(remaining)
        _last_request = time.monotonic()
        try:
            req = Request(url, headers={"User-Agent": user_agent, "Accept": "application/json"})
            with urlopen(req, timeout=20) as response:
                raw = response.read(40_000_001)
            if len(raw) > 40_000_000:
                raise ValueError("SEC response exceeds 40 MB")
            payload = json.loads(raw)
            if int(payload.get("cik", -1)) != cik:
                raise ValueError("SEC CIK response mismatch")
            folder = Path(cache_dir)
            folder.mkdir(parents=True, exist_ok=True)
            destination = folder / f"CIK{cik:010d}.json"
            temporary = destination.with_suffix(".tmp")
            temporary.write_bytes(raw)
            os.replace(temporary, destination)
            return payload, {"url": url, "raw_sha256": hashlib.sha256(raw).hexdigest(), "retrieved_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "cache_path": str(destination)}
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            error = exc
            if attempt < 2:
                time.sleep(0.5 * 2**attempt)
    raise RuntimeError(f"SEC fetch failed for CIK {cik}: {error}")


def build_sec_snapshot(user_agent: str, as_of: str | None = None, with_edgartools: bool = True) -> dict:
    """Keep real SEC evidence separate from the fictional experiment report."""
    as_of = as_of or date.today().isoformat()
    date.fromisoformat(as_of)
    companies = []
    for ticker, cik in CIKS.items():
        payload, provenance = fetch_companyfacts(cik, user_agent)
        selected = {}
        for label, tags, unit, duration in (
            ("revenue", ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"], "USD", "annual"),
            ("net_income", ["NetIncomeLoss"], "USD", "annual"),
            ("assets", ["Assets"], "USD", "instant"),
        ):
            facts = [select_companyfacts(payload, tag, unit, as_of, duration) for tag in tags]
            eligible = [fact for fact in facts if fact]
            selected[label] = max(eligible, key=lambda fact: (fact["end"], fact["filed"])) if eligible else None
            if selected[label] and selected[label]["accession"]:
                accession = selected[label]["accession"].replace("-", "")
                selected[label]["accession_url"] = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/"
        parser = {"executed": False, "tool": "EdgarTools", "reason": "not requested"}
        if with_edgartools:
            try:
                import edgar
                edgar.set_identity(user_agent)
                parsed = edgar.Company(cik).get_facts()
                parser = {"executed": True, "tool": "EdgarTools", "version": getattr(edgar, "__version__", "unknown"), "fact_count": len(parsed.get_all_facts()) if parsed else 0, "use": "independent CompanyFacts parsing check; official JSON drives selected evidence"}
            except Exception as exc:
                parser = {"executed": False, "tool": "EdgarTools", "reason": f"{type(exc).__name__}: {exc}"[:240]}
        companies.append({"ticker": ticker, "cik": cik, "name": payload.get("entityName", ticker), "facts": selected, "source": provenance, "edgartools": parser})
    return {"schema_version": "1.0.0", "data_kind": "real_sec_companyfacts", "as_of": as_of, "companies": companies, "limitations": ["CompanyFacts are revised filings selected by filed date; retrieval today cannot prove the same raw bytes were available historically.", "This snapshot contains SEC facts only, never fictional prices or model performance."]}
