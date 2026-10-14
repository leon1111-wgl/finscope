# Worked case: turn a Microsoft headline into a review

A student analyst sees that Microsoft reports strong earnings. The analyst wants to write a short note for a finance study group. A useful note needs more than a positive headline: it needs cash-flow evidence, a concrete downside and clear follow-up work.

This case was exported from the actual browser workspace. It uses the snapshot built on **2026-10-14 UTC** (2026-10-15 in Taipei). It is a fixed reproducibility example; later scheduled snapshots may produce updated results.

[Open the same company, date and scenario](https://leon1111-wgl.github.io/finscope/?company=MSFT&date=2026-10-14&view=brief&revenuePercent=-10&marginPoints=-2&refinanceBillions=10&rateBps=100&collectionDays=15) · [Editable browser-exported brief](examples/MSFT-downside-2026-10-14.md) · [Exact JSON](examples/MSFT-downside-2026-10-14.json)

## 1. Define the question

**Does annual profit have operating cash-flow support, and how sensitive is operating income to a weaker year?**

This asks for an initial financial review. It does not ask for a stock-price target or a trading signal.

## 2. Read the evidence

Latest selected annual period: **2026-06-30**. Filing date: **2026-07-29**. Values below are rounded to two decimals in USD billions; the JSON retains original USD amounts.

| Fact | Reported value |
| --- | ---: |
| Revenue | $331.84B |
| Net income | $133.75B |
| Operating income | $155.24B |
| Operating cash flow | $182.94B |
| Cash and equivalents | $20.93B |
| Current assets | $207.71B |
| Current liabilities | $168.82B |

[SEC filing evidence](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/). Exact tags, amounts, source dates and raw-source hashes are included in the export.

Operating cash exceeds net income. That supports the limited observation that annual reported profit is accompanied by cash generation. It does not prove that all of the cash improvement is recurring. The analyst should inspect non-cash charges, changes in working capital and the latest quarterly results.

The current ratio is approximately **1.23×**. That is a balance-sheet relationship, not a guarantee that obligations will be paid comfortably. Cash-flow timing, liquid securities, debt maturities and funding access still matter. Cash and equivalents alone does not include every liquid investment.

## 3. Use AI to prioritize reading

The snapshot assigns Microsoft a historical anomaly percentile of **83.9/100** using **93 earlier company-years**. The training periods end before **2025-09-27**, the earliest current target period in this comparison set. The score is high enough to prompt inspection; it is not an 83.9% chance of trouble.

The context table points to a high operating cash margin, a high operating margin and a low cash/current-liabilities ratio relative to the training medians. These differences can reflect strengths, capital allocation or a changed business model. They do not establish a causal explanation for the model score.

A useful next question is: **What explains the cash-generation and liquidity mix, and is that explanation supported by the notes?** The six-company sample is too narrow for a general market-risk conclusion.

## 4. Make a downside explicit

The preset assumes:

- Revenue falls 10% from the reported annual level.
- Operating margin falls by 2 percentage points.
- $10B of financing exposure is refinanced at a rate 100 basis points higher. This exposure is a hypothetical input, not an extracted debt balance.
- Collections take 15 extra days, approximated using annual revenue divided by 365.

| Mechanical scenario output | Result |
| --- | ---: |
| Scenario revenue | $298.66B |
| Scenario operating income | $133.74B |
| Change in operating income | −$21.50B |
| Incremental annual interest | $0.10B |
| Operating income minus extra interest | $133.64B |
| Additional cash tied up in collections | $12.27B |
| Reported cash minus collection-delay amount | $8.66B |

For example, incremental interest is `$10B × 100 / 10,000 = $0.10B`. Revenue and margin assumptions together drive the operating-income change. The collection-delay calculation is `$298.6551B / 365 × 15 ≈ $12.27B`.

The profit proxy omits existing interest, tax and other income. The cash proxy omits all other cash movements and financing actions. These results show sensitivity to assumptions, not an expected outcome or a solvency forecast.

## 5. Write a proportionate conclusion

> In this annual period, operating cash flow exceeds net income. Under the specified downside, operating income remains positive but declines by about $21.50B. A 15-day collection delay ties up roughly $12.27B under the simplified revenue-run-rate assumption. Before drawing a funding-risk conclusion, I would inspect the cash-flow reconciliation, liquid investment balances, debt maturities and the latest quarterly disclosure.

The result is useful because someone else can challenge each input and reproduce the arithmetic. It remains incomplete until a human reads the relevant disclosures and considers business context.

## 6. Reuse the workflow

Use the editable brief for a class discussion, an initial company memo or a handoff to a more experienced analyst. Change the company and assumptions, keep the source trail, and write down the evidence that would change your conclusion. Do not turn the anomaly percentile into a buy/sell ranking.
