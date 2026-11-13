# How the 0.3.0 blind set is scored (fixed before the set is written)

These rules are committed before the question set exists and before any answer rule for 0.3.0 is tuned against it. `scripts/score-blind-v3.mjs` implements them; any later change to this file is listed in its git history and in `docs/ASK.md`.

## Outcomes

Each question gets one outcome, judged from the answer's status and its plan (companies, figure, period, topic), never from its wording:

- **correct**: expected an answer and the answer is about the gold companies, figure and period; or expected a non-answer and got a non-answer.
- **partial**: the right companies, figure and period in a different presentation (for example a single year where a change was asked, or a table where one figure was asked). Never a different figure.
- **wrong**: answered about other companies, another figure or another period; or answered a question that must not be answered. Off-target is worse than not found.
- **abstained**: expected an answer and got a non-answer.

## Adjustments decided in advance

1. **Universe membership.** The set is written without the company list. If a gold ticker is not in `web/data/universe/index.json` at the scored commit (after mapping share-class tickers to the index entry with the same CIK), the expected status becomes `not_in_bundle`. The question is reported in its own line ("outside the universe at scoring time").
2. **Data availability.** If the gold expects an answer for a figure the company's data does not hold (not reported under any tag, or not supported for its template), `not_in_bundle` from the box counts as correct only when the box names the gold company and figure (its plan matches). The number of such questions is reported.
3. **Topics.** `metric` and the box's `ratio` are the same topic; `rank_six` matches the box's `rank`; `compare`, `trend`, `change`, `figures`, `metric` form one family for the partial rule.
4. **Periods.** `FYnnnn` must equal the planned fiscal year. `latest` matches a plan of `latest` or the company's latest fiscal year. `lastN` matches a trend over N years, or over all available years when fewer than N exist.
5. **Ambiguous questions** (an array of acceptable outcomes) are reported separately and not counted in the should-answer totals.

## What is reported

The first run is reported once, with the engine commit, the set commit and the data commit, whatever the result: totals, should-answer and must-not-answer counts, by topic, by style (plain or colloquial), by language, and the list of wrong answers with the reason. Reruns after reading the set are labelled "seen rerun (not blind)".
