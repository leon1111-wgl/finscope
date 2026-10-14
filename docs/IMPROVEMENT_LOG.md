# Continuous improvement log

## Working rule

Improve an actual user task. Start with a reproducible failure or a clearly unmet need. State the target user, expected behavior, evidence, implementation and verification. Prefer a completed useful increment to another panel or a longer feature list. Keep reported facts, user assumptions, synthetic examples and model outputs distinct.

Adversarial review is internal work by Codex: take the perspective of a first-time reader, an analyst, a mobile visitor and a recipient of an exported brief. Find and fix weaknesses proactively. It is not a request for a public visitor-feedback or bug-submission feature.

## 2026-10-15 — Reopen an analyst's saved brief

Reproduced user failures: JSON briefs had no restoration path; shared URLs did not identify the evidence version; invalid shared assumptions silently fell back to zero shock; `2026-02-30` was accepted by the export function. A recipient could think the original analysis had been restored even when inputs or data differed.

Implemented: local JSON selection restore with a preview and apply/cancel; versioned URLs in copied links, JSON and Markdown; explicit approval when the data or calculation version differs or is absent; strict calendar/date/assumption validation; current-data recomputation that ignores imported financial facts and model outputs. Fractional scenario inputs remain editable. No account, upload or archive-retrieval service was added. [User workflow and compatibility rules](REOPEN_BRIEF.md).

Independent review reproduced an asynchronous file-read race that could erase a newly invalid draft. The app now revalidates on both successful and failed reads before opening a preview; the delayed-read regression passes. Focused review found no remaining blocker. Browser connection still times out, so native file selection/downloads, keyboard behavior and visual layout remain unverified. DOM integration tests cover the application handlers and state transitions without a browser, network requests or real downloads.

Validation: 92 Python and 58 JavaScript tests passed, including eight DOM integration flows. All 312 company/date cases reproduced the same selected facts, ratios, interim evidence, anomaly/model records, scenario results and Treasury context through both JSON and versioned URL restoration. Legacy JSON requires an explicit current-version choice. The evidence bundle is byte-identical to the preceding release; no data or model rebuild was performed. Exact deployment verification is recorded after publication.

Next step: preserve or locate a historical evidence bundle when an old version is unavailable; keep recalculation distinct from exact historical reproduction. Continue investigating the cash-flow remainder and statement references separately.

## 2026-10-15 — Open the financial evidence directly

Reproducible user friction: the evidence table and exported brief opened an SEC archive directory, leaving a student or analyst to identify the report among exhibits and XBRL files. A reviewer could trace an accession, but could not immediately read its financial discussion.

Selected improvement: use official SEC Submissions metadata to resolve primary documents. Match company CIK, accession, filing date and form; load only relevant official historical metadata files. The table and cash-flow bridge now offer **Read 10-K / Read 10-Q**, a **Filing index** backup and the XBRL tag. Annual/YTD facts and prior-year denominators retain these links in Markdown and JSON. Unresolved metadata preserves the original directory; unavailable document filenames use an explicitly labeled index. No financial inputs or model results change. [Method, user steps and limitations](FILING_EVIDENCE.md).

Validation: 92 Python and 33 JavaScript tests passed. An offline rebuild verified cached raw hashes. All 19,815 repeated evidence references matched official metadata across 237 distinct accessions. All previous financial/model/interim/rate values and original financial-source retrieval records remained unchanged. 312 real company/date brief exports preserved eligible filing dates and source links. The six latest primary document URLs returned HTTP 200 with HTML content. The new bundle is 14.1 MB uncompressed / 0.62 MB gzip locally; repeated URL provenance compresses well. Unit checks cover wrong company/date/form, malformed or misaligned records, unsafe paths, missing filenames, repeated resolution, cache tampering and transparent fallback.

Browser interaction and layout verification remain unavailable because the browser connection times out. HTTP/source/export checks are not claimed as a substitute for an interactive browser test. Independent review found an interrupted-refresh cache/hash mismatch. Metadata downloads now stage until the full batch and validation succeed; failure and successful-promotion regressions pass, and focused re-review found no remaining blocker. Published implementation `7150f11`: Checks `38638022919` and Pages `38638023131` succeeded at that exact commit. All seven checked live assets (HTML, app, math, bridge, evidence-link module, CSS and data) matched local bytes. The public dataset hash is `ab7ea60969e405c69873fe66f8d1eda41ad9a1923298e1fcda834f0bdc0eb78e`.

Next step: make a large cash-flow remainder easier to investigate through reviewed statement/section references and clearly sourced additional adjustments. A direct document link does not yet jump to the exact fact or prove a causal explanation.

## 2026-10-15 — Explain the profit-to-cash gap

User task: after noticing a newer YTD cash-margin change, identify disclosed accounting adjustments and a concrete question to take into the filing. The previous view showed the change but left this investigation entirely manual.

Implemented: a partial, same-filing cash-flow bridge for five selected adjustment groups; current/prior signed comparisons; a waterfall with SVG download; source/sign drill-down; a specific working-capital follow-up prompt; portable Markdown/JSON/print content. Missing facts remain null, and other/unmapped adjustments stay a visible calculated remainder. The annual model and scenarios remain separate. [Design and limitations](CASH_FLOW_BRIDGE.md).

Independent review: all 314 current/prior bridges reconcile; 1,288 component facts matched cached SEC records; 282 missing component slots remained null. Browser connection remains unavailable; chart export is rendered and visually inspected separately, while browser interaction verification is pending. Local verification: 76 Python and 29 JavaScript tests passed, including sign reversals, zero versus absent values, source/period boundaries, exclusive tag selection, residual arithmetic, chart geometry and export source retention. The standalone SVG was rasterized and visually inspected; this is not a browser screenshot. All previous annual/model snapshots and interim values remain unchanged, and original source retrieval metadata is preserved. Published implementation `7dc1f5e`: Checks `38631123950` and Pages `38631124016` succeeded at that exact commit. Five live assets (app, math, bridge module, CSS and data) matched local bytes. All 314 generated SVGs and six complete real-company exports also passed consistency checks. Browser interaction remains unverified this release because the browser bridge still times out; revisit this when the connection is available. The previously pending documentation commit `374bb22` was synchronized with this release.

## 2026-10-15 — Newer interim evidence

User task: decide whether the annual profit/cash picture has changed in subsequent operations. The annual-only workflow left that question unanswered.

Implemented: fiscal YTD checkpoints for revenue, net income, operating income and operating cash flow; comparable prior YTD inputs; growth and margin changes; source drill-down; a coverage table across the six companies; shared HTML/Markdown/JSON brief content. The annual model and scenario retain their original annual basis.

Internal adversarial checks target mixed quarter/YTD/TTM facts, future amendments, missing comparators, nonpositive prior values and older quarters already covered by the latest annual report. [Matching design](INTERIM_CHECKPOINT.md). Local verification: 70 Python and 24 JavaScript tests passed. Independent review matched all 1,256 selected facts across 157 checkpoints to cached SEC records and reproduced each checkpoint at its own cutoff. Browser checks covered the day before a filing, annual supersession, 390/1440 px layouts and actual Markdown/JSON downloads. A minor review finding was fixed: Markdown now retains both cash and operating margins and their changes. A fresh official-source build succeeded; all 51 annual/model snapshots remained unchanged. Published implementation `39cc285`: Checks run `38625953344` and Pages run `38625953466` succeeded at that exact commit. Five live assets (HTML, app module, math module, CSS and data) matched the validated local bytes. Final live-browser inspection was unavailable because the browser bridge timed out; local interactive date/company/export and responsive checks passed. Recheck live interaction when the browser connection is available.

## 2026-10-15 — Online annual-company research

Problem: the original synthetic forecasting lab could demonstrate a method but could not support an initial financial review of a real company or deliver a portable evidence pack.

Implemented: official SEC history for six companies, Treasury rate context, matched annual financial ratios, historical filing-date snapshots, Isolation Forest triage, company comparison, corporate and bond scenarios, Markdown/JSON/print briefs, original product rationale and a worked Microsoft case. The prior lab remains at `lab.html`.

Adversarial review found and addressed:

- An invalid earlier date could remain visible while a newer snapshot was exported. Restore the valid selection and enforce a date boundary in the export function.
- An invalid scenario could silently export the last valid scenario. Block leaving the scenario form until its inputs are corrected or reset.
- A brief omitted prior-year denominators needed to recompute growth and accruals. Include prior sourced facts and ratio formulas.

Local verification: 61 Python tests and 20 JavaScript tests; actual browser downloads and invalid-input checks; source membership audit across 51 snapshots; 390 px and 1440 px responsive checks. Published and verified: implementation commit `1c6a706`, Checks run `38622603755` and Pages run `38622603725` succeeded. Six representative live assets matched local bytes. Portfolio update `e670c95` deployed in run `38622653509`; live homepage and profile README matched. The first cloud refresh also completed successfully in run `38622980033`, including official-source fetching, tests, raw-source archival, snapshot commit and deployment. Refreshed data commit: `71c51de`. Its live JSON matched the committed bytes. Ongoing hourly reviews are enabled, with explicit adversarial user-workflow checks.

## Candidate needs, to investigate before implementation

1. The YTD checkpoint now has a five-group partial cash-flow bridge. Investigate material residuals using reviewed disclosure mappings and add balance/debt context; require correct duration alignment before adding TTM calculations.
2. Missing custom tags prevent some comparisons. Investigate reviewed company-specific mappings with visible provenance; never guess equivalence or replace missing values with zero.
3. Historical views are coarsened to annual-filing dates. Evaluate snapshot dates for amendments and revised comparisons; make archive/revision limitations explicit.
4. Primary filing documents are now linked. A reader still needs to locate the right statement or note. Add verified section references where available, and investigate residual adjustments before adding generative summaries.
5. The six-company universe is narrow. Define sector-specific ratio suitability and data coverage before expansion; banks require different financial logic.
6. Validate usefulness with actual first-time workflows. No adoption or time-saving statistics have yet been measured.

Hourly reviews should also try empty and extreme inputs, invalid dates, stale snapshots, missing fields, different fiscal calendars, exports and mobile reading. Preserve the original lab's separate synthetic labeling. Paid APIs, live trading and new external accounts are outside the current scope.
