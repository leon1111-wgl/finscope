# From a filing announcement to research evidence

## User task

An analyst sees a new SEC announcement and needs to decide whether the published financial review already uses facts from it. Previously, the monitor only linked the report. A student could mistake a fresh announcement feed for a fresh financial analysis.

Open **Latest official updates**, select a company and read the **Research coverage** column. The comparison uses the latest research cutoff in the bundle loaded by this tab, displayed above the table, independent of the historical date in your workspace. The versioned **Open [company] at this cutoff in a new tab** link preserves the current research draft. Read the original SEC filing for the full disclosure.

| Status | Meaning and next action |
| --- | --- |
| Financial facts referenced | At least one sourced numeric fact matches the company, accession, form and filing date. The count covers distinct facts in annual history and the latest eligible interim checkpoint, including its prior-period and cash-flow inputs. Read the report for narrative and context. This is not full-report analysis. |
| After research cutoff | The announcement is later than the published research date. Read it before relying on the older review; check again after a financial-data refresh. |
| Read event report | 8-K and 8-K/A narrative and exhibits are outside the structured financial-fact pipeline. They need manual reading even if another filing from the same day supplies financial facts. |
| Not referenced | No selected financial facts match within this scope. Older or superseded reports and unsupported metrics can cause this. It is not proof that collection failed or that the company did not disclose the information. |
| Coverage unavailable | Research data is not yet available or its comparison metadata is incomplete. Do not treat this as zero coverage. |

## Matching and boundaries

`filing-coverage.js` is a read-only projection of the existing research bundle. It uses the latest snapshot at or before the bundle cutoff and the existing interim-selection rules. It does not fetch another copy, request SEC data, rebuild the model or mutate research inputs. Zero counts as a fact; null and nonfinite values do not. Facts filed or ending after the cutoff do not establish a match. Duplicate tag/start/end/unit/value tuples within one accession/form/filing date count once.

The research bundle loads once per page. Announcement polling does not refresh that bundle. The label explicitly says “research loaded in this tab.” Open the versioned link in a new tab to check the published version; if it changed, the existing restore gate asks before recalculating. There is no automatic refresh that could erase a draft.

The monitor receives a read-only callback from the research app. If it opens before research finishes loading, it initially reports unavailable coverage, then updates when research becomes ready. Monitor company selection remains independent. All monitoring content stays outside historical briefs, comparison exports and print. Research and feed fingerprints identify separate artifacts. Current retrieval and matching do not certify an archived point-in-time dataset.

Scope is intentionally narrow: no full-text ingestion status, no promise that all facts in a report were extracted, no filing-completeness or investment conclusion. Financial snapshots still refresh through their existing workflow. The hourly announcement feed does not update financial calculations.

## Verification

Tests exercise exact and mismatched references, company isolation, zero/null values, future dates, amendments, 8-K reports, superseded interim checkpoints, missing research, delayed research loading, one research fetch, independent company selection and byte-equivalent historical brief payloads (apart from export time). Actual browser checks and release evidence are recorded in [IMPROVEMENT_LOG.md](IMPROVEMENT_LOG.md).
