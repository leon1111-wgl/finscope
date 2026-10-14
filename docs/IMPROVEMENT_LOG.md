# Continuous improvement log

## Working rule

Improve an actual user task. Start with a reproducible failure or a clearly unmet need. State the target user, expected behavior, evidence, implementation and verification. Prefer a completed useful increment to another panel or a longer feature list. Keep reported facts, user assumptions, synthetic examples and model outputs distinct.

Adversarial review is internal work by Codex: take the perspective of a first-time reader, an analyst, a mobile visitor and a recipient of an exported brief. Find and fix weaknesses proactively. It is not a request for a public visitor-feedback or bug-submission feature.

## 2026-10-15 — Newer interim evidence

User task: decide whether the annual profit/cash picture has changed in subsequent operations. The annual-only workflow left that question unanswered.

Implemented: fiscal YTD checkpoints for revenue, net income, operating income and operating cash flow; comparable prior YTD inputs; growth and margin changes; source drill-down; a coverage table across the six companies; shared HTML/Markdown/JSON brief content. The annual model and scenario retain their original annual basis.

Internal adversarial checks target mixed quarter/YTD/TTM facts, future amendments, missing comparators, nonpositive prior values and older quarters already covered by the latest annual report. [Matching design](INTERIM_CHECKPOINT.md). Local verification: 70 Python and 24 JavaScript tests passed. Independent review matched all 1,256 selected facts across 157 checkpoints to cached SEC records and reproduced each checkpoint at its own cutoff. Browser checks covered the day before a filing, annual supersession, 390/1440 px layouts and actual Markdown/JSON downloads. A minor review finding was fixed: Markdown now retains both cash and operating margins and their changes. A fresh official-source build succeeded; all 51 annual/model snapshots remained unchanged. Publication verification follows below.

## 2026-10-15 — Online annual-company research

Problem: the original synthetic forecasting lab could demonstrate a method but could not support an initial financial review of a real company or deliver a portable evidence pack.

Implemented: official SEC history for six companies, Treasury rate context, matched annual financial ratios, historical filing-date snapshots, Isolation Forest triage, company comparison, corporate and bond scenarios, Markdown/JSON/print briefs, original product rationale and a worked Microsoft case. The prior lab remains at `lab.html`.

Adversarial review found and addressed:

- An invalid earlier date could remain visible while a newer snapshot was exported. Restore the valid selection and enforce a date boundary in the export function.
- An invalid scenario could silently export the last valid scenario. Block leaving the scenario form until its inputs are corrected or reset.
- A brief omitted prior-year denominators needed to recompute growth and accruals. Include prior sourced facts and ratio formulas.

Local verification: 61 Python tests and 20 JavaScript tests; actual browser downloads and invalid-input checks; source membership audit across 51 snapshots; 390 px and 1440 px responsive checks. Published and verified: implementation commit `1c6a706`, Checks run `38622603755` and Pages run `38622603725` succeeded. Six representative live assets matched local bytes. Portfolio update `e670c95` deployed in run `38622653509`; live homepage and profile README matched. The first cloud refresh also completed successfully in run `38622980033`, including official-source fetching, tests, raw-source archival, snapshot commit and deployment. Refreshed data commit: `71c51de`. Its live JSON matched the committed bytes. Ongoing hourly reviews are enabled, with explicit adversarial user-workflow checks.

## Candidate needs, to investigate before implementation

1. The new YTD checkpoint covers four flows. Next investigate a sourced cash-flow reconciliation and complete balance/debt context; require correct duration alignment before adding TTM calculations.
2. Missing custom tags prevent some comparisons. Investigate reviewed company-specific mappings with visible provenance; never guess equivalence or replace missing values with zero.
3. Historical views are coarsened to annual-filing dates. Evaluate snapshot dates for amendments and revised comparisons; make archive/revision limitations explicit.
4. A reader still needs to locate the right filing note. Explore direct document/section evidence and a cash-flow bridge before adding generative summaries.
5. The six-company universe is narrow. Define sector-specific ratio suitability and data coverage before expansion; banks require different financial logic.
6. Validate usefulness with actual first-time workflows. No adoption or time-saving statistics have yet been measured.

Hourly reviews should also try empty and extreme inputs, invalid dates, stale snapshots, missing fields, different fiscal calendars, exports and mobile reading. Preserve the original lab's separate synthetic labeling. Paid APIs, live trading and new external accounts are outside the current scope.
