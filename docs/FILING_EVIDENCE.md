# Filing evidence that a reader can open

## The user task

An analyst notices a profit-to-cash gap. A reviewer wants to inspect the filing behind the number. The previous evidence link opened an SEC archive directory. The reader then had to choose among documents, exhibits and XBRL files. An exported brief inherited the same friction.

FinScope now opens the matched primary 10-K or 10-Q. A filing-index link stays beside it. The exact XBRL concept remains visible, so the reader can find the corresponding statement or disclosure. This is document navigation, not an exact fact or paragraph anchor.

## Use it

1. Choose a company and information date, then open **Review the evidence**.
2. In the annual evidence table or YTD source details, select **Read 10-K** or **Read 10-Q**. Read the statement and its explanatory notes.
3. Use **Filing index** to inspect the submission's other files. If the primary file could not be resolved, the label says **Filing index** or **Filing directory**, rather than claiming a direct document match.
4. Export a Markdown or JSON brief. Its annual inputs, prior-year denominators, YTD facts and cash-bridge components retain their sources. A recipient can check the same accession without using the website.

## Matching rules

The [official SEC Submissions API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) supplies accession numbers, filing dates, forms and `primaryDocument` filenames. Recent filings are in `filings.recent`. Older filings are in the historical JSON files named by `filings.files`.

- Verify the company CIK. Load only official filenames for that CIK, and only historical files whose date range overlaps a needed filing date.
- Require aligned metadata columns. Match the accession, filing date, form and company archive path before replacing a fact's URL.
- Accept a plain HTML document filename. Reject external URLs, parent paths, query strings and fragments. Construct the URL inside the verified accession directory.
- Do not require the fact's period end to equal the filing's report date. A later report can legitimately contain a comparative value for an earlier period. Filing-date eligibility remains enforced by the existing financial-data selector.
- Keep an accession index as a backup. An absent or unsupported primary filename uses that index. Unmatched metadata leaves the existing directory link unchanged.

These checks resolve navigation. They do not prove that every accounting interpretation is correct. A reader still needs to inspect the reported unit, period, tag and disclosure context. Custom tags and exact statement/section anchors remain future work.

## Provenance and time

The bundle records Submissions source URLs, raw SHA-256 hashes and retrieval timestamps. Raw responses remain in the ignored local cache and the refresh workflow's 30-day evidence artifact. The public data includes match coverage counts and the selected document/index URLs.

Newly retrieved metadata only changes where a reader opens an already-selected filing. It does not add financial facts to an earlier view, change a filing date or make the current SEC API a historical raw archive. Financial/model values and their original source retrieval records are unchanged by a metadata-only refresh.

Metadata-only refreshes stage downloads until all sources and bundle validation succeed. A failed request leaves the prior metadata cache and manifest available for offline use. An offline rebuild verifies the saved raw hashes. It must use the same cutoff and pinned runtime to reproduce financial content; build timestamps and therefore the bundle hash change. A failed required source fetch, invalid metadata schema or cache hash mismatch leaves the previous public bundle untouched.

## Validation in this release

The metadata audit matched 237 distinct accessions across six companies. All 19,815 repeated evidence references in the saved annual and YTD snapshots resolve to primary documents. The audit checks CIK, accession, date, form and filename against cached official responses. This count is a metadata-match result, not a claim that every external link has been interactively opened.

Regression coverage includes wrong-company/date/form matches, malformed or misaligned metadata, unsafe document paths, missing document names, index fallback, comparative periods, repeated resolution, offline cache tampering and HTML/Markdown source retention. Existing financial, model, interim and rate data are compared with the preceding release after removing only the new navigation fields.

The bundle is approximately 14.1 MB of uncompressed JSON and 0.62 MB when gzip-compressed. Repeated evidence appears in historical snapshots; compressed size is measured locally, not a promise about the hosting provider's transfer encoding.
