# FinScope: from reported profit to a research decision

## Product story

A junior analyst is preparing a company review. Revenue and profit have risen. Before writing that growth is healthy, the analyst must ask: did operations produce cash, did short-term obligations grow faster than liquid resources, and how sensitive is operating profit to a weaker year?

The current FinScope lab explains information timing well, but its fictional market scenario cannot answer that real-company question. A collection of charts is also not a finished research workflow. The missing output is a short, reproducible research brief with facts, assumptions, follow-up questions and source links.

## User and job

Primary users are students, independent researchers and junior analysts doing an initial annual review of six selected US-listed technology/platform businesses. They need a fast first pass before reading the full filing. This is a curated research universe, not a whole-market screener or a substitute for professional diligence.

Success means a first-time visitor can choose a company, understand profit versus operating cash flow, compare financial profiles, run a scenario and export an evidence-linked brief without installing Python or supplying an API key.

## Chosen design

Use official SEC CompanyFacts for AAPL, MSFT, NVDA, AMZN, GOOGL and META. Match annual flows and year-end balances to the same fiscal period. Offer filing-date reconstruction for historical views. Show annual period end, filing date, retrieval date and missing fields. Never label current retrieval as an archived historical database.

Use a fixed-seed Isolation Forest to prioritize unusual financial profiles. Train only on eligible earlier company-years. Explain the underlying ratios beside the anomaly score. The score is a descriptive historical percentile, not a probability of fraud, default or an expected return. A six-company survivor universe is a material limitation.

Use official Treasury rates for financing context. Corporate stress calculations run in the browser with explicit revenue, margin, refinancing exposure and payment-delay assumptions. A hypothetical bond calculation connects rate shocks with present value. Distinguish observed facts from assumed scenarios throughout.

The output is a downloadable Markdown/JSON research brief and a printable view. Each brief records facts, formulas, filing links, model training boundaries, scenario inputs and dataset version. The original synthetic forecasting workbench remains at `lab.html`.

## Architecture

Official sources → validated Python extraction → versioned JSON snapshot → browser research workflow → portable brief.

Static hosting avoids visitor credentials and a paid backend. Scheduled GitHub Actions refreshes public data and deploys only a successful, validated build. Failed refreshes retain the previous deployment. Freshness is visible, so a failed or delayed scheduler never looks like live data.

## Boundaries

- Public name: Leon Wang. English interface and documentation.
- No paid services, trades, private uploads, copied coursework or live market-price claims.
- Missing data stays missing; no synthetic replacements in the real research view.
- Historical filing reconstruction is day-level, with current-source revision limitations.
- No claimed alpha, prediction accuracy, calibrated credit risk or unique invention of established algorithms.
- Ship an executable worked case, reproducible pipeline, tests and clear instructions.

## Acceptance

Six real companies have source-linked annual history; historical views exclude later filings; AI fitting excludes scored periods; stress math has independent numeric tests; browser use works on desktop and mobile; exports reproduce the displayed selection; refresh failures do not overwrite live data; exact deployment and representative live assets are verified.
