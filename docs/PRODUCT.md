# FinScope: the product argument

**From reported profit to an evidence-backed research brief.**

A student analyst is reviewing a company. Earnings have grown. The analyst needs to decide whether the growth has cash-flow support and what to investigate before calling it financially resilient. Pulling numbers into a chart is only the first step. The real deliverable is a review that another person can inspect and continue.

## What was missing

The original FinScope forecasting lab demonstrated timing-aware features, baseline comparisons and transaction-cost sensitivity on a fictional dataset. It was useful for method education. It could not support a real-company annual financial review. Its separate SEC panel showed facts, but did not connect those facts to a complete question-to-report workflow.

This is a gap in the previous project, not a claim that commercial financial platforms lack these capabilities. FinScope prioritizes a small, public, inspectable workflow that visitors can use without a data-terminal subscription or Python installation.

## Requirements and delivered behavior

| User need | Design | What it resolves | How to use it |
| --- | --- | --- | --- |
| Start with a real financial question | Earnings-quality and resilience review | Gives each chart a purpose | Select a company and ask whether profit has cash support |
| Trust the inputs | Official SEC facts, fiscal-period matching, filing links, missing-value labels | Makes errors and gaps inspectable | Open the evidence table and follow a source |
| Compare with context | Six-company comparison with fiscal dates | Avoids treating unmatched years as identical | Compare margins, liquidity and funding structure |
| Prioritize investigation | Isolation Forest on six financial ratios | Identifies profiles worth reading more closely | Inspect anomaly percentile and underlying ratios |
| Test a specific downside | Browser operating, financing and collection-delay math | Turns an opinion into explicit assumptions | Change inputs and inspect each resulting amount |
| Hand off a useful result | Markdown, JSON, print and a shareable view | Preserves evidence and assumptions | Download a brief; add your conclusion after reading filings |
| Understand freshness | Actual fiscal, filing, rate-observation and retrieval dates | Separates source recency from page recency | Read the scope line and freshness banner |

## A five-minute user journey

1. Open the live workspace. Microsoft is selected by default.
2. Read the annual period and filing date. Compare net income with operating cash flow.
3. Open the exact-value table and the reported-input evidence links. Decide what additional filing section you need.
4. Compare the six profiles. Treat differences as questions about their business models.
5. Open **Test assumptions**. Try the preset downside, then replace its assumed refinancing exposure with an exposure you want to investigate.
6. Open **Take your brief**. Download Markdown for an editable research note or JSON for further analysis. Print to PDF if needed.
7. Add a human conclusion after reading the latest quarterly disclosure, cash-flow reconciliation and debt maturity note.

## What is original

The contribution is the workflow and its implementation: fiscal-period alignment, evidence lineage, dated historical views, target-period exclusion from anomaly training, explicit missing-data behavior, scenario math and a reproducible export. Established models and public data are acknowledged. No estimator or financial formula is claimed as a new invention.

The existing forecasting lab adds a second, clearly separated research track: reproducible synthetic experiments in information timing and daily volatility. Social and supply-chain examples live there. They are not fabricated signals about the real companies in this workspace.

## Useful now, bounded deliberately

Useful today: annual financial statement review, classroom cases, first-pass research memos, scenario explanation and reproducibility demonstrations.

Not established: predictive alpha, company credit ratings, fraud detection, comprehensive accounting normalization, whole-market screening, live trading, intraday feeds or production institutional adoption. There are six selected surviving businesses, not an unbiased investment universe. An annual-only review must be supplemented with newer quarterly filings.

## How to evaluate usefulness next

No user-study results are claimed. A practical next evaluation is to ask independent readers to complete the five-minute journey and record: whether they find the correct period, whether their downloaded brief reproduces their assumptions, whether they can trace a ratio to its facts, and which remaining manual step blocks their review. These are proposed product tests, not measured adoption statistics.

## Honest portfolio description

> Built FinScope, a browser-based financial research workspace that turns official SEC disclosures into source-linked company reviews, historical-profile anomaly triage and transparent stress scenarios. Implemented fiscal-period alignment, filing-date reconstruction, training-boundary checks, reproducible exports and a scheduled public-data pipeline. Retained an independent synthetic forecasting lab for timing-aware model evaluation.

Do not append unmeasured claims such as improved investment returns, reduced analyst hours or production-grade fraud detection.
