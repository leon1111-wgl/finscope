# FinScope design guide

## Purpose and approved direction

The user requested a dedicated page designer because the interface felt too much like an AI-generated template. On 2026-10-15, they selected **a financial research workbench: restrained, clear, with little decoration**. Preserve the English interface and Leon Wang identity.

The first screen should help someone select a company and information date, understand the evidence boundary, and start a review. Layout and typography should communicate those priorities. Every visual change must improve a specific reading or interaction problem.

## First implementation pass

Focus on `web/index.html` and `web/research.css`. Implement this as one coherent change, then inspect all research views before publication.

1. Replace the large marketing hero and story card with a compact introduction: **Company research**. Supporting sentence: **Review reported results, trace filing evidence and test downside assumptions.** Retain the actual research and export functionality.
2. Reduce the masthead to approximately 68 px on desktop, with a 21 px wordmark and a simple 28 px square mark. Keep the source, portfolio and separate forecasting-lab routes discoverable.
3. Make company/date selection the main action. Replace the second slogan with **Select company and date**. Keep saved-brief restoration and current monitoring visually secondary, with clear, accessible disclosure summaries.
4. Remove surrounding boxes from ordinary reading sections. Use whitespace and horizontal rules to separate sections. Reserve enclosed surfaces for editable controls, restoration decisions and information that requires special attention.
5. Present key financial values as a continuous band with dividers, not four detached cards. Preserve labels, units and fiscal context. Use tabular digits and an explicit two-column arrangement on small screens.
6. Style research navigation as quiet tabs with an underline for the current view. Preserve `data-page`, `aria-current`, keyboard focus and adequate hit areas. Any changed labels must remain accurate for the existing view.
7. Keep tables readable: clear headers, stable column widths, useful row spacing, visible scrolling and focusable regions. Do not force every column to numeric alignment; evidence and formula columns contain prose.

This pass must not change calculations, source selection, model outputs, data refresh schedules, saved-state formats or export semantics.

## Visual system

The initial design recommendation is a light neutral workbench with restrained green and blue accents. It is not yet implemented. Validate the complete theme, including charts and states, before release.

| Token | Value | Purpose |
| --- | --- | --- |
| Background | `#f5f6f7` | Quiet page canvas |
| Surface | `#ffffff` | Inputs, tables and decision surfaces |
| Text | `#1f2933` | Main content and figures |
| Secondary text | `#56616d` | Supporting context |
| Border | `#d8dde3` | Rules and separators |
| Primary accent | `#245c52` | Main action and one data series |
| Secondary series | `#365f87` | Distinct comparison series |
| Warning text | `#7b4d14` | Staleness and attention states |

- Use a system sans-serif stack. Body text starts at 16 px with about 1.55 line height. Supporting labels and provenance should remain at least 14 px; do not shrink mobile text to fit more columns.
- Start with approximately 30/24/18 px for heading levels 1/2/3. Avoid oversized, widely tracked uppercase slogans. Let actual research content carry the hierarchy.
- Use 3–4 px control radii. Remove decorative gradients, glow and floating shadows. Avoid pill-shaped labels unless their shape conveys an actual state or interaction.
- Use color consistently for series and states. Do not rely only on color to communicate sign, availability, selection or warnings.
- Preserve a visible keyboard focus treatment and controls of at least 44 px where practical. Tables should scroll inside their own containers without expanding the page.

## Theme migration checks

Current JavaScript generates SVGs with hardcoded colors. Replacing root CSS variables alone will produce unreadable charts.

- `web/research-app.js` generates the annual profit chart with pale text and mint/blue bars. Scope any CSS theme treatment to `#profit-chart .chart`; check text, grid lines, both series and legend against the final background.
- `web/cash-bridge.js` generates the waterfall with an explicit dark background and independent text, total, positive, negative and residual colors. Keep all categories distinguishable. If styling the embedded SVG through CSS, note that the downloaded SVG is regenerated in JavaScript and will retain its original theme until separately updated and verified.
- Audit hardcoded colors in `.formula`, `.brief-paper`, `.error`, `.interim-periods span`, `.evidence-links small`, `.freshness`, inputs, and the monitoring selectors at the end of the stylesheet.
- Inspect loading, empty, invalid-input, disabled, stale-data, missing-fact and saved-version mismatch states. A theme is incomplete if these states are illegible.
- Keep print styling, `[hidden]` behavior, skip links, focus restoration, and all `aria-live` status regions intact.

## Acceptance and coordination

Inspect real data in Evidence, Comparison, Scenarios, Brief and Method views at desktop width and approximately 390 px. Check a historical date, a recent date, long evidence links, missing values and extreme assumptions. The company/date controls should appear much earlier than in the current landing page. Capture before/after screenshots and record concrete findings.

Check body and chart contrast, table scrolling, page overflow, keyboard focus, source access and actual exports affected by the change. Run tests appropriate to the edited behavior. Browser connection failures must be recorded as incomplete checks, not described as successful visual verification.

The design task and functional task share the current chat. Inspect working-tree changes and pending releases before editing; do not overwrite another iteration. The current functional task must follow this guide when adding components. Do not make changes merely to produce activity. Record decisions and evidence in `docs/DESIGN_LOG.md` and release outcomes in `docs/IMPROVEMENT_LOG.md`.
