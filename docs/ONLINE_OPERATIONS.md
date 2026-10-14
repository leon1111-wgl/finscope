# Online research operations

## Public runtime

GitHub Pages serves `web/`. The public research workspace executes its corporate and bond scenarios in the browser. Python model fitting happens during snapshot builds, not on the public server. The original local experiment API remains loopback-only and is accessed through `lab.html`.

No credentials or identifying SEC contact address are placed in the public JSON. Data sources are fixed official endpoints. The source manifest records URLs, retrieval timestamps and raw SHA-256 hashes. The bundle hash is SHA-256 of sorted compact JSON before adding its own `dataset_sha256` key. This hash includes build and source metadata.

## Refresh

Workflow: `.github/workflows/refresh.yml`. Schedule: 03:37 UTC Tuesday through Saturday, after the preceding US weekday. A manual dispatch is available. GitHub schedules may be delayed or disabled for an inactive public repository, so actual freshness is visible in the product. See [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Repository variable `SEC_USER_AGENT` must identify the maintainer and a contact email. Source requests are sequential; SEC requests are throttled to at most four per second with bounded retries. Never disable TLS validation to bypass access failures.

Each run installs pinned dependencies, tests the implementation, downloads SEC and Treasury sources, validates the complete bundle, commits the derived snapshot and deploys that exact working tree. GitHub's default token does not trigger another push workflow from its own commit; refresh explicitly deploys its output. Public raw-source artifacts are retained for 30 days. They include CompanyFacts, SEC Submissions (current and relevant historical files), Treasury XML and the retrieval/hash manifest.

## Failure behavior

The builder writes the public JSON only after every company and rate series is available and validated. Failure leaves the previous file untouched. Deployment occurs only after a successful build and push. A concurrent human update can reject the refresh push; that run stops and leaves the live site unchanged. Re-run from current main after checking the change.

Validation rejects no-data responses, CIK mismatches, nonfinite rates, future-filed facts, unmatched balance periods, included target periods in model training, unexpectedly old annual endpoints and Treasury data more than nine days behind the build cutoff. The UI marks a build older than four days as overdue. If SEC data semantics change, inspect the raw source and selection rules before altering thresholds.

## Reproducibility and privacy

`--offline` validates saved raw hashes and reconstructs the research content using the original source retrieval metadata. The build timestamp/hash changes per build; numerical content should match with the same inputs and pinned runtime. Do not claim a raw source is permanently archived: the uploaded raw artifact has a 30-day retention policy. Selected original fact values and source records remain in committed snapshots.

Filing navigation uses the official Submissions `primaryDocument` field. It never guesses a filename from the fiscal period. Missing or unsupported primary-document names fall back to the accession index; unmatched metadata keeps the directory link. Download, schema or offline hash failures stop the build. Existing raw caches created before this feature need one metadata fetch: `python scripts/build_research.py --offline --refresh-filings --as-of YYYY-MM-DD`, with the same identifying `SEC_USER_AGENT`. After that, an ordinary offline rebuild includes filing metadata. This option refreshes navigation metadata while preserving the financial sources and their retrieval records. Metadata downloads are staged until all companies and bundle validation succeed. A failed metadata-only refresh preserves the previous metadata cache and hash manifest for offline rebuilding. Cache promotion uses per-file renames; it is not a disk-crash transaction. [Matching rules](FILING_EVIDENCE.md).

Private local price/event uploads remain under ignored local directories and are unrelated to the public annual-company pipeline. No private financial data, social account access or brokerage connection is required.
