# Has the picture changed since the annual report?

An annual review can miss several months of subsequent operations. A researcher needs a small, traceable update before drawing a conclusion from that older baseline. FinScope adds a fiscal year-to-date (YTD) checkpoint for revenue, net income, operating income and operating cash flow.

## A useful example

An analyst sees growing revenue. They should also ask whether operating cash flow kept pace. Suppose revenue rises from 40 to 60 and cash flow rises from 5 to 6, in the same units and comparable fiscal YTD periods. Revenue grew 50%; cash flow grew 20%. Cash generated per dollar of revenue fell from 12.5% to 10%, a change of −2.5 percentage points.

That is a useful question for the working-capital reconciliation. It is not proof of distress: collections, inventory, deferred revenue, taxes and non-cash adjustments can affect the result. FinScope shows the calculation and links the inputs, leaving the causal conclusion to a reading of the disclosures.

## Why YTD matters

US interim reporting presents both current-quarter and fiscal YTD income statements. Cash-flow statements cover fiscal YTD and the corresponding prior-year period; filings may also include other durations. [Regulation S-X, Rule 10-01(c)(2)–(3)](https://www.ecfr.gov/current/title-17/chapter-II/part-210/section-210.10-01). A query for the latest reported value can therefore combine a three-month revenue number with six-month or twelve-month cash flow.

FinScope uses fiscal YTD for all four metrics. It does not add quarters together, subtract overlapping durations, annualize a partial year or manufacture a missing value.

## Matching and timing contract

1. Find the latest annual revenue period in eligible 10-K/10-K/A evidence. The YTD start must be the next calendar day after that annual end.
2. Consider standard USD facts from 10-Q/10-Q/A with durations of 60–310 elapsed days. Select the latest revenue end with that exact fiscal start.
3. Match every other current flow to both revenue start and end. A standalone Q2/Q3 value cannot fill a missing YTD cash-flow value.
4. Require prior revenue to start at the preceding annual period's start. Its end must be 350–380 days before the current end; durations may differ by no more than eight days for 52/53-week calendars. Match prior flows to that exact pair of dates.
5. At each eligible filing event, use only facts filed on or before that day. Later amendments update later checkpoints, while earlier snapshots retain their original eligibility. Equal-day ties use a fixed standard-tag preference and accession order.
6. The browser selects a checkpoint by the user's information date. When the selected annual accounts already cover its end, the page reports that no newer matched checkpoint is available. An incompatible annual baseline is unavailable.

The model and company stress scenario keep their annual inputs. Interim selection has its own filing-event dates and does not refit the annual anomaly model.

Each current/prior YTD period also carries a [partial cash-flow bridge](CASH_FLOW_BRIDGE.md). Its selected adjustments must match the operating-cash-flow endpoint's exact fiscal dates and filing accession. Missing lines remain null, and unselected differences appear in a calculated residual.

## Formulas and exported evidence

- Absolute change = current − prior, including negative or zero prior values.
- Growth = current / prior − 1, only for a positive prior value.
- Cash margin = operating cash flow / revenue, only for positive revenue.
- Operating margin = operating income / revenue, only for positive revenue.
- Margin change in percentage points = (current margin − prior margin) × 100.

The on-screen checkpoint, company comparison, print brief, Markdown brief and JSON evidence share the selected checkpoint. Downloads contain current/prior start and end dates, values, tags, accession numbers, filing dates, source URLs and change values. The annual baseline remains separately labeled.

## Limits and checks

This covers four standard-tag flows for six selected companies. Custom tags, missing fiscal anchors or a nonstandard transition year can prevent a match. It is not complete quarterly coverage, a full cash-flow bridge, a TTM statement or an earnings forecast. “Unavailable” does not mean that a company filed no quarterly report.

The source is the currently retrieved [SEC CompanyFacts API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces). Filing-day reconstruction is not a certified historical raw archive. Public availability is only represented at date precision; intraday trading use is unsupported.

Tests exercise mixed-duration distractors, future filing/amendment exclusion, missing YTD cash flow, nonpositive growth denominators, unmatched prior periods, annual supersession and browser exports. Live-source checks verify every selected fact against the cached raw source and its exact fiscal dates. These are accounting and software checks, not predictive-performance evidence.
