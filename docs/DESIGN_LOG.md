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
