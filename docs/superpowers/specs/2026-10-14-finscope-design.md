# FinScope: evidence-grounded financial risk workbench

Owner: Leon Wang. User approved implementation on 2026-10-14 and added social sentiment, supply-chain logs, research grounding, leakage protection, overfitting controls and non-stationarity. This spec records that approved design; no further design gate is required.

## Outcome
A usable English-first visual application plus a reproducible Python research engine. Publish a public repository and GitHub Pages demo linked from Leon's portfolio. Focus on financial disclosure changes, alternative data and 5/20-session volatility forecasts. This is a research workbench, not production-certified trading software. Never claim profitable alpha, causal effects, academic novelty or reproduced papers without evidence.

## Workflows
1. Explore a clearly labelled deterministic synthetic scenario of four fictional companies. Select company, horizon, historical date and factor/model variants. View prediction vs observation, intervals, financial/text evidence, event timelines, network relationships, rolling model errors and drift.
2. Inspect a separate real SEC financial-fact snapshot (Apple, Microsoft, Nvidia), with units, periods, filing dates, accession links, as-of exclusion and provenance. Never mix synthetic prices with real facts under a real-data label.
3. Run the Python CLI or local FastAPI service on validated, user-supplied prices and events. The static demo serves versioned precomputed experiment results; it must never pretend to retrain on Pages. The local service runs new experiments, lists run artifacts, exports JSON/CSV and validates inputs. Bind to loopback by default; no arbitrary file-path or URL inputs over HTTP.
4. Export a self-contained research report including configuration, dataset SHA-256, package versions, seed, split boundaries, timestamp, data quality warnings and limitations.

## Data contracts
Prices CSV: date (YYYY-MM-DD session), ticker, close (>0), volume (>=0). Duplicate ticker/date, invalid dates, non-finite numbers, nonpositive prices fail. Document adjusted-price requirement for user inputs. No interpolation across missing sessions. All tickers must have enough history; fail with a useful error if no valid dataset remains.
Events JSON array: id, ticker, kind (filing/social/supply), event_time, available_at, ingested_at (UTC-aware ISO strings), text, source, optional numeric metrics and relationship. Never use an event before max(available_at, ingested_at); occurrence alone is insufficient. Duplicate IDs conflict => reject; repeated social texts deduplicate in each as-of window. Future events cannot change earlier features. Social metrics are transparent lexical signals, NOT a trained sentiment classifier or reliable investment signal. Public fixtures are authored fictional text. No private logs, account scraping or real individual social posts are published.
SEC snapshot: official CompanyFacts fetched with identified User-Agent, HTTPS verification, bounded retries/timeouts, rate limiting, raw response hash, retrieval time. Preserve fact start/end, filed, accession, tag/unit. Select matching annual durations, distinguish instant vs duration concepts, preserve restatements by filing date. Use EdgarTools for a real, executed optional/ingestion integration; record exactly where it is used. No live source success claim when unavailable; keep last snapshot and show age.

## Research engine
Open-source foundation: scikit-learn for fitted models and text vectorization; EdgarTools for SEC parsing. Qlib is an interoperability/reference target with an export adapter, not an executed baseline until actually run. Preserve upstream credits/licenses. Do not rebrand upstream PIT or graph algorithms as inventions.
- Past-only price features, as-of financial metrics, filing-text change scores (TF-IDF cosine alignment), freshness decay, social coverage/sentiment and supply delay metrics. Factor groups: price; price+filing; price+filing+alternative; freshness-aware fusion. An explicit historical-volatility baseline is required.
- Forward realized volatility of log returns over 5 and 20 sessions, annualized by sqrt(252). Label end timestamps must be known before model fit. Chronological rolling training and separate calibration with purged overlapping targets. Scalers, imputers, vocabulary used in supervised features and feature selection fit on permitted past data only.
- Fixed hyperparameters in v1; no test-period tuning. Report all predetermined ablations, unsuccessful results included. Synthetic scenarios demonstrate behavior and never establish real-world forecasting performance.
- Simple conformal-style residual intervals calibrated only on past matured labels, explicitly no guaranteed coverage under drift. Report empirical coverage.
- Rolling error, regime-stratified results and input PSI (fixed training bin edges, explicit heuristic thresholds); retraining is scheduled rolling-window fitting, not a claim to implement DoubleAdapt.
- Cost-aware long/cash risk targeting. A close-time signal executes no earlier than the following close; use a two-index lag before close-to-close returns. Include initial position entry costs, turnover, bps fees/slippage, maximum drawdown, volatility and Sharpe (cash/risk-free=0 assumption). All model comparisons share evaluation dates.
- A lightweight relationship/network view may show synthetic supplier edges or past correlations. Label descriptive graph analysis accurately; learned GNN and order-book execution are future extensions, not delivered features.

## Industry-oriented engineering
Typed config bounds, deterministic runs, sensible row/text/body-size limits, clear validation errors, atomic artifact writes, safe run identifiers, immutable provenance manifests, structured logs, cached source snapshots, health endpoint, no secrets in client/static files, accessible loading/empty/error states. Uploads stay local. No remote public training API deployed. Dependency lock, CI, meaningful leakage/financial correctness tests and documented recovery/limits.

## Visual direction
Use Sites' local visual guidance only; user explicitly chose GitHub hosting, so no separate Sites registration. Dark navy technical workbench, restrained cyan/teal accents, off-white readable text, 16-18px body, minimum 12px secondary labels. Responsive sidebar/top nav, semantic controls, keyboard focus, reduced-motion support, no page overflow at 390px. Interactive SVG charts with clear axes/units, explanatory tooltips and accessible tables. Sections: Overview, Evidence, Risk Lab, Strategy, Data & Audit, Research. Default demonstration label visible throughout. Brand Leon Wang.

## Research grounding
Curate primary-source reading notes for Lopez-Lira & Tang, relevant KDD incremental-learning work and ICML forecasting work. Link each paper to a concrete design choice and separately label implemented, inspired, optional and not reproduced. Explain LLM checkpoint contamination, event timestamps, revised data, survivorship, overlapping labels, repeated holdout reuse, transaction costs, regime shifts. Never present pretrained hindsight as historical available information.

## Acceptance
Offline synthetic build reproducible with matching deterministic content (run timestamps excluded); tests cover future-event invariance, purged labels, lagged execution, costs, restatements/units, bad uploads, no NaN serialization and deterministic splits. Live SEC fetch/parse verified separately. Desktop/mobile browser review checks every primary interaction, exports and local API versus static mode. Publish only after tests, source review and exact remote-head/workflow validation. Demo data and actual research limits are visible, not buried.
