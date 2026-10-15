# Official updates: first dynamic-data increment

The user chose new filing announcements and official macro data, then asked for gradual iteration. A student needs to see what was disclosed recently. An analyst needs the original document, and a reviewer needs to distinguish a new disclosure from evidence already used in a saved analysis.

Build a separate current-monitoring feed for the existing six companies (AAPL, MSFT, NVDA, AMZN, GOOGL, META) and daily US Treasury par yields. Collect SEC Submissions metadata hourly through GitHub Actions. Retain at most 20 supported filings per company over the last 120 days (10-K, 10-K/A, 10-Q, 10-Q/A, 8-K, 8-K/A). Fetch the previous and current calendar years of Treasury XML, retaining up to 60 recent observations for 3m, 2y, 5y, 10y and 30y. Missing yields remain null.

SEC does not support browser CORS. An hourly published JSON feed is appropriate for Pages; it is not a streaming service. Treasury observations are daily. GitHub scheduled runs and Pages publication may be delayed. Label source dates, capture times and browser check times independently. A check button checks the published feed; it does not trigger the official collector.

Show a collapsed, independently controlled "Latest official updates" section above the research workspace. Only request data when it opens; check every five minutes while open and visible. Show a visible warning when capture age exceeds three hours, rates are over seven days old, or a check fails. Preserve the previous validated display on failure. Support timeouts, schema rejection and unavailable sources. Show sources and hashes in a provenance disclosure. Do not imply that 8-K filings are all earnings releases or that new announcements are already incorporated into financial calculations.

This section is current monitoring, not filtered by the research date. It is excluded from historical brief exports and print. Do not change research.json, calculation version, saved brief restoration, model outputs or existing financial formulas.

Source collection is atomic: all eight sources must fetch and validate before replacing the public feed. Retain bounded raw source artifacts for audit. Use an identifying SEC User-Agent privately, TLS validation, request pacing and fixed official hosts. Public JSON must not include the User-Agent or private contact. Reject wrong company IDs, malformed arrays, invalid dates and unsafe document paths; filter future-dated records. No external account, API key purchase, trading integration or additional dependency is needed.

Official references: [SEC APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [SEC fair access](https://www.sec.gov/about/developer-resources), [Treasury XML](https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics/interest-rate-xml-files).
