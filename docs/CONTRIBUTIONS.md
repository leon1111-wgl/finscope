# Contribution map

## Original implementation

- Evidence schema with source release and ingestion clocks; as-of feature construction and UI evidence eligibility.
- Original synthetic four-company scenario, authored filings/social/supply events and changing-volatility regimes.
- Five fixed model comparisons, horizon-specific purging, finite-number checks and complete-panel portfolio policy.
- A report contract connecting forecasts, matured labels, costs, data hashes, versions and split audits.
- An accessible static workbench, selected-view exports and a bounded local experiment service with saved history.
- An independent SEC fact selection pipeline with filing/source provenance and an executed external-parser check.

These are project engineering contributions. They are not a claim of a new learning algorithm or state-of-the-art empirical performance.

## Open-source foundations actually used

| Foundation | Use | Boundary |
| --- | --- | --- |
| scikit-learn | Ridge, imputation, scaling, TF-IDF and cosine similarity | Established implementations, credited upstream |
| NumPy / pandas | Arrays, tables, dates and numeric calculations | Established analysis infrastructure |
| FastAPI / Starlette / Uvicorn | Local HTTP validation, static serving and ASGI execution | Single-worker local mode, no production authentication |
| EdgarTools | Executed CompanyFacts parser check for the selected official snapshot | Selection/filtering logic remains FinScope's own implementation |
| pytest / Node built-in test runner | Python behavior and JS numeric regression checks | Tests do not prove data provenance or profitability |

No upstream application was copied and rebranded. [Qlib](https://github.com/microsoft/qlib) was examined as a reference for existing financial research/PIT infrastructure; no Qlib benchmark is executed here. FinBERT, TimesFM, DoubleAdapt and learned GNNs are not bundled or reported as integrated.

## Meaningful next contributions

Submit changes with a concrete research failure case, expected behavior and a reproducible test. A new factor should include its historical availability rule, source/license, missingness policy and baseline ablation. A new model should preserve the same evaluation dates, record tuning decisions and retain negative results. A new data connector should keep secrets and proprietary raw data outside the public tree.

Do not add attractive performance numbers from a differently filtered universe or a repeatedly optimized holdout. Improvements should make conclusions easier to verify, even when a forecast becomes less impressive.


## Online annual-financial research workspace

The real-company workspace adds original fiscal-period matching, filing-date snapshots, a historical-profile anomaly pipeline, explicit missing-value handling, browser stress calculations and source-rich Markdown/JSON/print briefs. It uses official SEC and Treasury inputs and the established scikit-learn Isolation Forest estimator. It does not assert algorithmic novelty or investment performance. See [product rationale](PRODUCT.md) and [model card](RESEARCH_MODEL.md).
