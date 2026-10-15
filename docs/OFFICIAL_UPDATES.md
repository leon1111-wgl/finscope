# Latest official updates

Use this monitor to notice a new disclosure, read the original filing, and decide what to investigate in your next company review. It is the first dynamic-data increment in FinScope. It does not interpret news, predict prices, or claim that a new filing is already in the financial model.

## Use it

1. Open **Latest official updates** above the research workspace.
2. Choose a company independently of your dated research selection.
3. Read the filing date, form and acceptance time, then open **Read filing**. **Index** is the official fallback. An 8-K can concern many company events; it is not necessarily an earnings release.
4. Check the daily Treasury curve's observation date before using it as current context. Missing tenors say **Unavailable**.
5. Use **Check published updates** to recheck the hosted capture. Sources and their SHA-256 fingerprints are available below the tables.

This is **current monitoring**, not filtered by the research date. It is excluded from dated research calculations and brief exports, including printing. A newer filing may not yet be reflected in `research.json`, which has its own daily refresh and as-of date. No monitoring field is passed to the research model.

## What “dynamic” means

The GitHub workflow requests official sources hourly at minute 17 UTC, then validates and publishes a small feed. GitHub scheduling and Pages deployment can be delayed; there is no guaranteed hourly service level. The browser checks the published feed every five minutes while this section is open and visible. The check button does not start an upstream collection job. Treasury yields are daily business-day observations, not streaming market quotes.

The feed covers AAPL, MSFT, NVDA, AMZN, GOOGL and META. It keeps at most 20 supported SEC filings per company from the last 120 calendar days. Supported forms: 10-K, 10-K/A, 10-Q, 10-Q/A, 8-K and 8-K/A. This is a bounded disclosure list, not a complete company archive. A reported period is not the date a filing became public. Accepted timestamps are displayed in UTC when supplied.

Treasury captures include the previous and current calendar year. The feed retains up to 60 observations with five selected tenors, and the interface shows the latest curve and up to 10 recent dates. Weekends and holidays normally have no new observation. Capture age over three hours and latest observation age over seven days are explicitly marked.

## Failure and audit behavior

A collection publishes only after all six SEC and both Treasury sources validate. Empty annual Treasury responses are rejected except for a valid current-year empty feed during January 1–7, when a new business-day observation may not yet exist. On source/network failure, the prior public feed remains intact and the workflow fails visibly. Browser timeouts, invalid payloads and older responses keep the previous validated display with an error message. The initial failure shows no invented numbers. The collector and browser both reject future information relative to the current capture boundary.

Each source record contains a fixed official URL, retrieval timestamp and raw SHA-256. `feed_sha256` hashes sorted, compact JSON with that field omitted. This identifies a capture; it does not certify economic conclusions. Raw responses are retained as a GitHub Actions artifact for seven days; the public feed persists in Git history. The SEC identifying User-Agent stays in a repository variable and is not published.

Run locally from the repository root with `SEC_USER_AGENT` set privately:

```sh
python scripts/build_updates.py
python -m pytest tests/test_updates.py -q
node --test tests/official-updates.test.mjs
```

The collector writes only `web/data/updates.json` and ignored `local-data/updates/`. The hourly workflow uses the existing Pages deployment concurrency group. It does not rerun financial modeling or overwrite the research bundle.

Official documentation: [SEC APIs and CORS](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [SEC fair access](https://www.sec.gov/about/developer-resources), [Treasury daily rates](https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics), [Treasury XML](https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics/interest-rate-xml-files).

Next increments should first connect a new filing to the last financial evidence date and make the refresh gap clear. Broader macro series and analysis need source-specific release times and revision handling before they can enter historical research.


## Does a new announcement appear in the research?

The filing table now compares reports with selected facts in the research bundle loaded in this tab. Its cutoff and version are separate from the current feed and from your historical workspace selection. Read the **Research coverage** column, then open the full SEC report or the versioned research link. A match means selected facts were referenced, not that the full report was analyzed. [Status definitions and limitations](FILING_COVERAGE.md).
