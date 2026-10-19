# FinScope design log

## 2026-10-15 — Dedicated designer established

User feedback: the interface feels too AI-generated. The user selected a restrained financial research workbench over an editorial magazine or dense terminal direction.

Created the ACTIVE **FinScope 页面设计师** heartbeat (`finscope-2`), every six hours, attached to the existing chat. Updated the existing functional heartbeat to read the shared design guide and coordinate overlapping edits. Preserved its existing six-hour cadence and active status.

A dedicated designer performed a read-only source audit. Main findings:

- Hero, story card and workspace slogan create three introductions before research starts.
- Repeated rounded, tinted containers make controls, figures, evidence and explanatory text look equally important.
- The tall masthead and oversized slogan consume the first screen.
- Small secondary labels and inconsistent table density weaken readability.
- A light theme requires coordinated SVG and state colors; changing root variables alone would break chart contrast. Downloaded SVGs need separate verification.

The first implementation pass and safeguards are written in [DESIGN_GUIDE.md](DESIGN_GUIDE.md). This setup round did not change or deploy the website. No new browser or visual validation is claimed. The existing release-note edits and pending Git synchronization from the official-updates release remain untouched.

Next action: implement the compact workbench structure and coherent light theme, then check all five research views, mobile tables, warnings, restoration and affected exports before publishing. Retain current monitoring's separation from historical research.


## 2026-10-16 — Filing coverage within the existing table

The functional iteration added one prose column and a compact research-cutoff sentence to the existing current-monitoring table. No new panel, decorative colors or card collection was added. Method/version detail uses a disclosure. At 1280 px the complete table fits; at 390 px its own scroll region retains 16 px body text and 14.4 px explanatory text without expanding the page. Visible keyboard focus and horizontal scrolling were checked in the local browser. The complete workbench theme pass above remains pending.


## 2026-10-16 — Bring company selection into the first screen

Reproduced problem: at 1280 px the company control started about 1,086 px down the page; at 390 px it started about 1,660 px down. A large promotional hero, story card, repeated workspace slogan and saved-brief utility preceded the primary action. Mobile brand text was only 9 px and navigation labels were 13 px.

Selected a bounded entrance/navigation pass. Replaced the hero with “Company research” and one short sentence, reduced the masthead, removed the decorative gradient/story card/pill, moved the intact restoration utility after company/date/scope, and made navigation plain underlined buttons. Current monitoring remains separate and clearly names its time boundary. Brand attribution is now at least 14 px; navigation and selection inputs are 16 px, with navigation targets about 48 px high. The dark research/chart palette remains, so this pass does not pretend to complete the proposed light theme or remaining panel/KPI consolidation.

Actual local browser: company control now starts at about 398 px on desktop and 541 px on mobile; mobile date input starts at 632 px. Both inputs are visible in the first 390 × 844 screen. All five views were navigable at both widths without page overflow (document width 1,265/375 inside 1,280/390 viewports). Empty scenario input prevented navigation and displayed a visible correction prompt. Restoring an actual historical JSON brief focused its confirmation, disabled selection during preview, and preserved its date on apply. A native download exactly matched the prior brief except export time. All 90 existing JavaScript tests passed; no new CSS mirror tests were added. Independent review/release status is recorded in the improvement log.

Screenshots retained locally under `.work/design-entry/`: `before-desktop.jpg`, `before-mobile.jpg`, `after-desktop.jpg`, `after-mobile.jpg`, `invalid-mobile.jpg`, `restore-desktop.jpg`. These are actual browser captures, not generated mockups. A local browser reused old CSS after HTML changed; the stylesheet now has an explicit entry-release query token, and the final captures/measurements used the new styles. Native print and artificially induced stale/loading failures were not newly exercised; their selectors and semantics remain unchanged.

Released as `f8c1c92`; Checks `38806949403` and Pages `38806949544` succeeded at that exact revision. CI passed 118 Python and 90 JavaScript tests, and seven live files matched the tested bytes. Live browser navigation timed out; desktop/mobile screenshots and restored-brief download verification above were local-browser checks.

Next visual pass: simplify ordinary reading panels and KPI presentation, then perform the coordinated light-theme/chart migration described in the guide. Preserve date/source prominence and test all chart/print/export states before claiming that migration complete.


## 2026-10-20 — Read referenced facts without crowding the announcement table

The monitor's coverage count did not expose its supporting values. An initial local implementation put a long list inside the coverage column; real-browser inspection showed that it cramped labels and dates. The final interaction opens a native disclosure below the announcement table. At desktop width, each row separates metric/tag, amount/unit and period; at 390 px the same row stacks without page overflow. The existing exact-source link and cutoff context remain visible. No theme, chart or financial calculation changed.

Local browser verified MSFT annual and NVDA interim details, keyboard focus and disclosure toggling, and unchanged historical research after monitoring-company changes and a manual refresh. Before/after desktop and final mobile screenshots are in `.work/filing-facts/`. Long XBRL tags wrap at 14.4 px; values remain 16 px. The full regression suite passed 94 JavaScript tests. The remaining panel/KPI and coordinated theme work in the guide is still pending. Release status is recorded in the improvement log.
