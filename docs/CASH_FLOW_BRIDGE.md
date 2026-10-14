# From reported profit to operating cash

## The user task

A reader sees cash flow growing more slowly than profit. A ratio reveals the gap, but does not tell them where to investigate. FinScope now adds a partial reconciliation inside the newer fiscal YTD checkpoint. It shows selected disclosed adjustments, the same-period comparison and the remaining amount that still needs explanation.

The output is useful for a first-pass research memo: identify a cash-use line, inspect its source, compare the prior period and take a specific question into the filing notes. The [SEC financial-statement guide](https://www.sec.gov/about/reports-publications/investorpubsbegfinstmtguide) explains the indirect-method link between profit, non-cash items and operating assets/liabilities.

## What appears in the workspace

- A waterfall from reported net income to operating cash flow. Reported endpoints, signed adjustments and the calculated remainder have distinct colors and labels.
- A table of current YTD, prior YTD and change for each selected adjustment.
- A follow-up question about the largest mapped working-capital cash use. This is an investigation prompt, not an asserted business cause.
- Raw values, sign multipliers, XBRL tags, filing dates and source links.
- A downloadable SVG with period dates, units, source accession and Leon Wang branding. Markdown and JSON retain the inputs and computations; the printable brief includes the comparison table.

## Source and sign contract

The net-income and operating-cash-flow endpoints must have the same filing accession and exact fiscal start/end dates. Both must be eligible by the selected checkpoint's date. If they do not match, the bridge is unavailable. Every mapped component must use the CFO endpoint's accession and exact start/end. This avoids combining an old line with a revised total.

| Group | Exclusive standard-tag candidates, in preference order | Sign |
| --- | --- | ---: |
| Depreciation and amortization | `DepreciationDepletionAndAmortization`, `DepreciationAmortizationAndAccretionNet` | +1 |
| Share-based compensation | `ShareBasedCompensation` | +1 |
| Receivables | `IncreaseDecreaseInAccountsReceivable` | −1 |
| Inventory | `IncreaseDecreaseInInventories` | −1 |
| Payables | `IncreaseDecreaseInAccountsPayable`, `IncreaseDecreaseInAccountsPayableTrade` | +1 |

Only one tag is selected within each group. A subtotal and its constituents are never added together. Narrower depreciation components are left unmapped rather than silently presented as total depreciation and amortization. Deferred tax, gains, custom tags and other operating changes remain in the residual in this version.

The increase/decrease tags describe changes in the relevant operating accounts. Asset increases use cash in this reconciliation; liability increases preserve cash temporarily. Negative reported values reverse the direction. The raw SEC value is preserved beside its sign multiplier. Non-cash expense add-backs are accounting adjustments, not new receipts; stock compensation can still have an economic cost through dilution.

## Arithmetic, with an independent example

Start with net income of 100. Add depreciation 20 and stock compensation 10. An increase in receivables of 30 contributes −30. A decrease in inventory of 5 contributes +5. An increase in payables of 15 contributes +15. The selected subtotal is +20.

If reported operating cash flow is 130, the residual is:

`130 − 100 − (20 + 10 − 30 + 5 + 15) = 10`.

The graph reaches the reported endpoint by including that residual. This arithmetic identity does **not** prove that all adjustments were mapped correctly or that the cash-flow change has been economically explained. The residual is labeled “Other and unmapped adjustments,” not a reported fact.

## Missing data and comparisons

An absent matching fact remains null. A reported zero stays zero. Only observed mapped effects enter the subtotal, while the residual absorbs all other differences. The UI reports the number of selected groups mapped; this count is not an economic coverage percentage.

A component change is computed only if both periods have that mapped component. The residual can change because of operating changes, unselected disclosures or mapping coverage. Read the linked cash-flow statement and notes before attributing a cause. This is a partial statement reconciliation, not a forecast, cash balance, valuation, solvency judgment or full working-capital model.

## Verification

Tests check source-accession and fiscal-duration alignment, future amendments, incompatible endpoints, sign reversals, exclusive subtotal selection, absent versus zero values, nonfinite data, loss-making chart endpoints and Markdown/source retention. A separate audit matched all selected components against cached SEC records. Annual model inputs and stress scenarios remain unchanged.
