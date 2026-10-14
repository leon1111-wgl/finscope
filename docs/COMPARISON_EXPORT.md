# Take a company comparison into your own work

## The missing handoff

An analyst could compare six companies on screen but could only download a single-company brief. Copying rounded table values into a spreadsheet loses precision, fiscal dates and the source trail. The comparison now has its own CSV and evidence JSON exports.

## Use the files

1. Choose an information date and open **Compare companies**.
2. Download **comparison (.csv)** for a spreadsheet and **comparison evidence (.json)** for its audit trail. Both filenames use `finscope-comparison-<information-date>`.
3. Read the period columns before comparing margins. A company's fiscal year can end months before another company's year. Interim columns retain both current and prior YTD periods.
4. Use numeric columns as labeled: decimal margins (`0.20` means 20%), a current-ratio multiple, cash-margin changes in percentage points, and a model percentile from 0 to 100. The CSV uses full numeric precision rather than the rounded page display.
5. An empty numeric cell means unavailable, not zero. `annual_missing_metrics`, `interim_status`, `model_status` and `model_imputed_features` explain important gaps. The JSON retains null facts, full filing records, model context, training boundaries and source retrieval hashes.
6. Open the JSON's `reopen_url` to revisit the comparison. Data or calculation version changes require the existing explicit current-data choice. The JSON is an evidence package; **Open a saved brief** accepts single-company briefs and explains this distinction if the comparison file is selected.

The exports include all six curated companies, independently of the company highlighted in the selector. They include reported profiles only. Corporate scenario assumptions are not applied to peers. Reopening starts a comparison with zero corporate shocks; it does not restore an earlier single-company scenario.

## Evidence contract

- Annual facts, ratios and the model come from the saved annual snapshot at or before the information date. Newer interim selection uses the information date itself.
- `annual` retains the current selected annual row and its source facts. `prior_annual_period` carries the preceding available annual row. `interim` retains the matched YTD comparison and cash-flow bridge where available.
- The CSV is a compact summary. Its unique filing URLs identify the documents; use the JSON for metric-to-tag, accession, filing-date and value mappings.
- Model imputation is separate from missing reported facts. A missing score is unavailable; it is never exported as zero. A recorded zero percentile remains numeric zero.
- The data bundle and existing financial calculations are unchanged. Export format version 1 identifies this comparison package. Calculation version remains 1 because existing calculations and restored results have not changed.
- The evidence package records its build, export timestamp and dataset hash. Those identifiers preserve provenance, not file authenticity. The exported current-source reconstruction is not an archived point-in-time database or a trading backtest.

The comparison set is not a sector benchmark, an investment ranking or proof of economic predictive validity. Different businesses, fiscal calendars and missing standard tags still require reading the filings.

## File compatibility and checks

CSV uses UTF-8 with a byte-order mark, CRLF record separators and [RFC 4180 quoting](https://www.rfc-editor.org/rfc/rfc4180). Formula-like text is prefixed with an apostrophe for spreadsheet use; actual numeric negatives remain numbers. JSON retains the original source text. No spreadsheet formulas, macros or external-data commands are generated.

Tests cover historical cutoffs, impossible dates, six-company coverage, missing versus zero values, precision, units, quoted names, file-type confusion, and the two download handlers. A separate Python standard-library CSV read checks exported rows against the JSON. DOM integration exercises application state and generated file payloads; it does not verify real browser layout or native downloads. Browser connection was unavailable during this release's local check.
