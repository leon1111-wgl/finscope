# Financial-profile anomaly model card

## Purpose

Prioritize unusual annual financial profiles for human investigation. The output does not predict distress, fraud, returns or creditworthiness. The transparent ratio view is the baseline that remains useful without a model.

## Data and unit of analysis

One company-year per observation. The curated universe is AAPL, MSFT, NVDA, AMZN, GOOGL and META. Facts come from the [SEC CompanyFacts API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces). Only standard US-GAAP USD facts from 10-K or 10-K/A filings are used. Annual flows last 330–400 days. Revenue anchors the period; other flows must share its exact start/end, and balance-sheet amounts its exact end.

Latest eligible filing wins within a matched period; explicit revenue-tag priority breaks ties. Missing standard tags remain null. This deliberately avoids pretending an unreviewed custom tag means the same thing. Examples include missing total-liabilities and capital-expenditure fields in some company-years.

## Inputs

| Input | Formula | Interpretation question |
| --- | --- | --- |
| Operating margin | Operating income / revenue | How much operating profit is earned per revenue dollar? |
| Operating cash margin | Operating cash flow / revenue | How much cash do operations generate per revenue dollar? |
| Current ratio | Current assets / current liabilities | What is the balance of short-term assets and obligations? |
| Liabilities / assets | Total liabilities / total assets | How much of the asset base is funded by liabilities? |
| Cash coverage | Cash and equivalents / current liabilities | What portion of current obligations matches immediately liquid cash? |
| Accrual ratio | (Net income − operating cash flow) / average assets | How far does accounting profit diverge from operating cash? |

Average assets uses two adjacent annual periods 300–430 days apart. Denominators must be positive. At least four of six observed features are required. Missing features use medians fitted only on the training sample. If any feature has no training observations, or fewer than 30 training observations exist, scoring is unavailable.

## Training and scoring

For each saved date, select facts filed by that date. Identify each company's latest annual period. Use only company-years ending strictly before the earliest of those target period ends. This excludes all currently scored periods. Fit scikit-learn IsolationForest with 128 trees, seed 42 and one worker; other parameters use the pinned package defaults.

The anomaly score is `-model.score_samples(X)`: larger means more unusual. The displayed percentile is `100 × mean(training_scores <= target_score)`. It uses training scores as a descriptive reference, not a held-out accuracy or probability calibration sample. Company-history observations are correlated.

The UI displays the three largest absolute deviations from training medians, scaled by median absolute deviation with a 0.01 floor. These are contextual ratio comparisons, not SHAP values or explanations of the forest's splits. Isolation Forest uses axis-aligned partitions and does not require a separate standardization stage.

[Official estimator documentation](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html).

## Timing and revision limitations

Historical views use precomputed dates at first annual revenue filings, plus the current build date. A user date selects the latest such snapshot on or before it. Dates between snapshots do not trigger a new model fit. A later restatement is reflected at the next eligible saved snapshot, not necessarily on its precise submission date.

Fact filtering is by filing day, with no intraday availability claim. Current API retrieval cannot certify exact historically archived bytes. The export carries source retrieval timestamps and SHA-256 hashes. Revised past facts may be used when they have become eligible by the chosen snapshot. Do not interpret this reconstruction as a clean historical trading backtest.

## Nonstationarity and selection bias

The sample is six surviving technology/platform businesses. Accounting policies, mergers, capital intensity and industry growth change. An unusual profile may reflect a changed business regime or strong performance. Compare the company's own history and latest discussion before interpreting a percentile. The model is refreshed with the evidence snapshot, not continuously adapted to streaming data.

## Verification

Automated checks use small-number independent ratio expectations, future-filing exclusion, restatement timing, mismatched annual/quarterly periods, missing and nonfinite facts, deterministic scoring and target-period exclusion. Browser calculations separately test zero-shock identity, basis-point conversion, bond present values and export provenance. These checks establish implemented invariants, not economic predictive validity.
