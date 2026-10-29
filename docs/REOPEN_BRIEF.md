# Reopen a research brief

## The missing handoff

An analyst sends a brief to a colleague. The colleague wants to change one assumption and reproduce the starting point first. Previously, a JSON export had no import path. A copied URL did not identify the dataset, and invalid URL assumptions silently became a zero-shock baseline. A refresh could therefore change the evidence without the recipient noticing.

FinScope now restores the company, information date and five corporate scenario inputs. It recomputes the analysis using the site's official evidence. Saved facts, ratios, model outputs and conclusions are never imported as trusted data.

## Use it

1. In **Brief**, download the JSON evidence file or copy the research-view link. Markdown also includes a reopening link.
2. To use a file, expand **Open a saved brief** below the company/date selection and choose the JSON. The file is read on your device; it is not uploaded.
3. Inspect the company, date, assumptions and version information. Select **Restore these inputs** when both versions match.
4. If either version differs or an older export has no version record, explicitly select **Recalculate with current data**, or cancel. This uses current data and formulas and can change the results.
5. Review the recalculated evidence and export a new brief. The new export records the versions actually used.

A matching versioned URL opens its selection directly. A changed or unversioned URL stops before showing results. A malformed URL offers a new review rather than pretending to restore the original scenario. Cancellation keeps the existing selection when a file was opened from an active review.

## What the two versions mean

| Record | Purpose | Limit |
| --- | --- | --- |
| Dataset SHA-256 | Identifies the committed evidence bundle, including facts, model results and retrieval metadata | A change can come from metadata alone; it does not prove a financial number changed |
| Calculation version | Identifies the supported client calculation/selection contract | It is a maintained compatibility version, not a cryptographic code signature |
| Brief format/version | Identifies the JSON interchange structure | Recognition does not authenticate an edited file |

The dataset identifier in an imported file is only a recorded identifier. It does not certify the author's conclusions or the file's financial values. FinScope ignores those values and recomputes from its own bundle. Current-source historical reconstruction retains its existing limitations.

This release does not download or serve archived datasets by hash. If a saved version is unavailable, the original Markdown/JSON remains the record of that earlier analysis. Choosing current data creates a new calculation rather than recovering the old version. Dates outside the current dataset's coverage are rejected, not clamped to a different date.

## Loading and retry

The evidence download has a 45-second limit covering both the response and its JSON body. If the connection fails, times out, or returns an unusable response, research controls remain disabled and **Retry loading evidence** becomes available. No financial result or export is shown until loading completes.

Retry keeps the original shared-link inputs. It still checks dataset/calculation versions before reopening the research; a changed version requires the same explicit choice. Only one attempt runs at a time. A late response from an expired attempt cannot replace the recovered evidence. Retry checks the published snapshot; it does not trigger a new SEC or Treasury collection. A script that cannot load at all still requires a browser reload.

## Input and failure behavior

- Only a supported company, real calendar date, known view and five finite numeric assumptions are restored. Bounds match the corporate scenario calculator. Decimal assumptions remain editable.
- Blank values do not mean zero. Zero is accepted when it is explicitly numeric.
- Duplicate URL parameters, unsupported formats, invalid version identifiers and out-of-range assumptions are rejected together. There is no partial application of an invalid saved state.
- Files are limited to 2 MB. No filename, saved HTML, saved company description or saved financial value is inserted into the research output.
- Preview disables analysis controls until the user restores or cancels. Invalid in-progress scenario edits also block navigation and file restoration.
- The draft is checked again after an asynchronous file read. An invalid edit made during that read stays visible, including when the read or JSON parsing fails.

## Maintenance and verification

`web/research-state.js` owns parsing, version gates and scenario-input validation. `CALCULATION_VERSION` is currently `1`. Increment it when changing client formulas or calculation/selection semantics that can change a reopened result. A display-only change does not need a new calculation version. Preserve older schema support only when its input meanings are known.

Run `npm ci --ignore-scripts` and `node --test tests/*.test.mjs`. jsdom is a pinned development dependency, used only for DOM integration tests. It is not shipped to the public site and is not a real browser.

The tests exercise saved-input preview, apply/cancel, changed versions, invalid inputs, decimal scenarios, edited financial fields, export recomputation and delayed file-read failures. The committed evidence bundle also supplies every company/date case for JSON and URL round-trip checks. Real browser layout, native file selection, download behavior and keyboard interaction need separate browser checks.
