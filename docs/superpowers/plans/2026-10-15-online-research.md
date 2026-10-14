# Online Research Implementation Plan

> **For agentic workers:** Use executing-plans for inline implementation and requesting-code-review before release. Track the steps below.

**Goal:** Make FinScope useful for an evidence-backed first-pass financial review entirely in the browser.

**Architecture:** Python builds public SEC/Treasury snapshots and historical anomaly scores. Browser modules render company comparisons, transparent scenarios and reproducible briefs. Keep the original forecasting lab separate.

**Tech Stack:** Python 3.12, existing pandas/scikit-learn, standard-library HTTP/XML, browser ES modules, GitHub Pages/Actions.

**Spec:** `docs/superpowers/specs/2026-10-15-online-research-design.md`

## Global constraints

English, Leon Wang; six named companies; source dates and missing values visible; no fees or trades; no fictional replacements; no predictive performance claims from anomaly scores; retain original lab.

### Task 1: Financial evidence and anomaly pipeline

Files: `finscope/fundamentals.py`, `finscope/research.py`, `finscope/treasury.py`, `scripts/build_research.py`, `tests/test_research.py`.

- [x] Write tests for `annual_history(payload, as_of)` excluding later filings and mismatched periods, preserving restatements and missing balances.
- [x] Run `.venv/bin/python -m pytest tests/test_research.py -q`; confirm missing implementation.
- [x] Implement `annual_history`, `score_profiles(histories, as_of)`, `parse_treasury(raw)`, and the atomic public bundle builder. Ratio definitions are in the spec and model card.
- [x] Run tests and fetch official data with an identifying SEC User-Agent. Confirm company IDs, actual latest dates and complete provenance.

### Task 2: Online research workflow

Files: `web/index.html`, `web/research-app.js`, `web/research-math.js`, `web/research.css`, `web/lab.html`, `tests/research-ui.test.mjs`.

- [x] Test zero-shock identity, rate basis points, zero-coupon present value, date selection and exports against hand-calculated expectations before implementation.
- [x] Build browser selection, narrative financial review, comparison, annual history, source evidence, scenarios and brief export.
- [x] Run `node --test tests/*.test.mjs`. Inspect actual desktop and narrow browser flows, keyboard controls and exports.

### Task 3: Product packaging and operation

Files: README, `docs/PRODUCT.md`, `docs/RESEARCH_MODEL.md`, `docs/CASE_STUDY.md`, `.github/workflows/refresh.yml`, existing CI, notices, portfolio card.

- [x] Explain problem, requirements, original design, usefulness, worked user journey, precise AI role and limits.
- [x] Add scheduled refresh with validation before deployment and an artifact version/source manifest. Keep failures observable.
- [x] Independent review, full regression suite, build, clean commit and publish. Verify workflow SHA, live bytes and one complete company-to-brief journey.
- [x] Update portfolio wording to match delivered capabilities only.
