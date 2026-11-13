# Universe accuracy check: pre-registered protocol (0.3.0)

Committed before the check runs. The script that implements it is `scripts/accuracy_check.py`; the workflow is `.github/workflows/accuracy.yml`. The first run is reported in `docs/validation/` with its commit, whatever the result.

## Question

Does each figure FinScope states for a universe company equal the value the company filed, for the same filing, concept and period? And is the fiscal year labelled the way the company labelled it?

## Sample (salted, fixed in advance)

- **Salt:** `finscope-0.3.0-accuracy-2026-11-14`.
- **Companies:** sort every CIK in `web/data/universe/index.json` at the data commit under test by `sha256(salt + ":" + cik)` as a hex string, ascending. Take the first 40 companies whose shard holds at least two fiscal years.
- **Fiscal years:** the two most recent fiscal years in each sampled shard.
- **Figures:** `revenue`, `gross_profit`, `operating_income`, `net_income`, `eps_diluted`, `operating_cash_flow`, `capex`, `cash`, `assets`, `liabilities`, `equity`, `total_debt`. A figure that is not supported for the company's template is recorded as *not applicable*. A figure the shard marks *not reported* is recorded as *not stated* and is not compared.
- That is at most 40 × 2 × 12 = 960 cells.

## Independent reference

The SEC's **Financial Statement Data Sets** (DERA), quarterly zips from `https://www.sec.gov/files/dera/data/financial-statement-data-sets/`, downloaded inside the GitHub Actions job only (never kept on a workstation). They are produced by the SEC from the filings' XBRL independently of the CompanyFacts API that FinScope reads.

For each stated cell FinScope records the accession, XBRL tag, period end, duration and unit. The reference row is the `num.txt` row with the same `adsh` (accession), `tag`, `ddate` (period end), `qtrs` (4 for an annual flow, 0 for a balance), `uom` (`USD`, `USD/shares` for EPS), with empty `coreg` and empty `segments`. A derived cell (for example a sum of debt components, or total liabilities derived from the balance-sheet identity) is checked component by component and recomputed.

## Tolerance and pass bar

- **Match:** the absolute difference is at most 0.5 in the reported unit (USD, or USD/share for EPS with at most 0.005). Filings report exact values, so this is equality up to rounding of the stored number.
- **Fiscal label:** FinScope's fiscal-year label equals `fy` in `sub.txt` for the original 10-K whose `period` is the period end. This checks FinScope's mapping, not an independent fact (both come from the filing's DEI cover data).
- **Statement placement (concept check):** for figures expected on the face of a statement (revenue, gross profit, operating income, net income and EPS on the income statement; operating cash flow and capital expenditure on the cash-flow statement; cash, assets, liabilities and equity on the balance sheet), the tag must appear in `pre.txt` for that accession in that statement. Derived and fallback cells are reported with their lineage.

The release passes if all of these hold:

1. at least **99%** of verifiable stated cells match;
2. **zero** sign errors and **zero** scale errors (values that differ by a factor of −1 or a power of 1,000);
3. the fiscal label agrees for at least **98%** of sampled company-years;
4. at most **2%** of face-statement cells use a tag that is not presented in the expected statement;
5. cells that cannot be verified for a reason other than publication lag (the filing is newer than the latest published quarterly data set) are at most **10%** of stated cells.

## Failure classes reported

Wrong value (same key, different number), sign, scale, period mismatch (no row for the period and duration, but rows for another), duplicate context (more than one distinct reference value for the same key), fiscal mislabel, concept off-statement, unverifiable (with the reason: publication lag, accession absent, tag absent).
