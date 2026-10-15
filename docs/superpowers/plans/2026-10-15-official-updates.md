# Official Updates Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. The user has authorized inline implementation and publication.

**Goal:** Deliver a small, usable official-announcement and daily-rate monitor, with independent historical research.

**Architecture:** Python collects and validates eight official sources into an atomic JSON snapshot. An isolated browser module loads that snapshot lazily. A scheduled GitHub workflow publishes it hourly using the existing Pages deployment lock.

**Tech Stack:** Existing Python dependencies, standard-library HTTP/XML, ES modules, jsdom, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-15-official-updates-design.md`

## Global constraints

- English UI and Leon Wang branding.
- Six companies, 120 days / 20 filings each, 60 daily Treasury observations.
- Current monitoring only; no changes to research.json, calculations or historical exports.
- Three-hour collection and seven-day rate warnings; five-minute visible/open client checks.
- Atomic failure behavior, official hosts, TLS verification, no private User-Agent in public output.

## Task 1: Official collector

Files: `finscope/updates.py`, `scripts/build_updates.py`, `tests/test_updates.py`.

Interfaces: `recent_filings(payload, cik, captured_at) -> list[dict]`; `collect_updates(output: Path, user_agent: str, *, fetch=None, now=None) -> dict`. Each filing has accession, form, filed, accepted_at, report_date, document_url and filing_index_url. Feed has schema_version=1, captured_at, feed_sha256, companies (ticker/cik/filings), treasury (observations), and sources (URL/retrieved_at/raw_sha256).

- [x] Write tests for 8-K inclusion, newest-first sorting, safe URL fallback, missing fields, CIK mismatch, invalid/future dates, bounds, rate nulls, source provenance and previous output preservation on failed refresh. Essential failure assertion:
  ```python
  before = output.read_bytes()
  with pytest.raises(ValueError):
      collect_updates(output, 'Test test@example.com', fetch=broken_source, now=now)
  assert output.read_bytes() == before
  ```
- [x] Run `.venv/bin/python -m pytest tests/test_updates.py -q` and observe missing feature failure.
- [x] Parse official records, fetch eight fixed URLs with bounded sizes/retries/pacing, reuse `parse_treasury`, build source manifests, hash canonical JSON, then replace output with `os.replace` only after every validation succeeds.
- [x] Run the focused tests, then collect real data with the repository SEC_USER_AGENT variable passed privately via environment.

## Task 2: Current monitoring UI

Files: `web/official-updates.js`, `web/index.html`, `web/research.css`, `tests/official-updates.test.mjs`.

Interfaces: `validateUpdates(data, now) -> data`; `initOfficialUpdates(document, options={}) -> cleanup`. Options may inject fetch, clock and interval scheduling for DOM checks; default browser dependencies are used in production.

- [x] Write failing tests for lazy loading, supported schema/official links, capture-time warnings, source/date display, network timeout/failure retention, open/visible-only checking and unchanged research controls. Essential flow:
  ```js
  assert.equal(requests.length, 0);
  details.open = true;
  details.dispatchEvent(new window.Event('toggle'));
  await tick();
  assert.match(details.textContent, /Current monitoring/);
  assert.equal(document.querySelector('#date').value, priorDate);
  ```
- [x] Run bundled `node --test tests/official-updates.test.mjs` to observe missing feature failure.
- [x] Implement strict validation and isolated rendering; use text escaping, fixed link hosts, browser timeout, failure retention, accessible status, responsive tables and no-print scope. Use separate module script initialization.
- [x] Verify focused DOM flows and all existing exports/regressions.

## Task 3: Operational release

Files: `.github/workflows/updates.yml`, `docs/OFFICIAL_UPDATES.md`, `docs/IMPROVEMENT_LOG.md`, `web/data/updates.json`.

- [x] Add hourly/manual workflow with `ref: main`, concurrency `pages`, existing pinned dependencies, focused collector/UI tests, bounded source artifact retention, feed commit and explicit Pages deployment.
- [x] Run full Python and JavaScript tests. Audit feed membership against captured raw sources. Verify research.json has no feature-branch diff.
- [x] Request independent read-only review, fix material findings, and attempt real browser usage and layout inspection.
- [x] Fast-forward authorized main and publish; check exact workflow SHAs and live asset bytes. Manually dispatch the scheduled workflow once to verify collection plus publication. Record evidence and any remaining browser limitations in the log.
