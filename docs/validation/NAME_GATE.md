# All-company name gate (pre-registered for 0.3.2)

Written and committed before any 0.3.2 fix. The question: does a visitor who types their own company's ordinary name get *that* company?

## Procedure (`scripts/name-gate.mjs`)

For every company in `web/data/universe/index.json` (1,994 at data `c75dfa6`):

1. **Natural name.** Take the SEC conformed name from the company's shard. Remove "/TX", "/DE/", "/NEW/", "(DE)" style state and "new" suffixes, a trailing "/", and the legal suffix (Inc, Incorporated, Corp, Corporation, Co, Company, Ltd, Limited, plc, LLC, LP, NV, SA, with or without a comma or period), repeatedly. Take a mixed-case name as it is. Title-case an all-caps name, and also try it with its words of three letters or fewer kept as acronyms ("RPM International", "MGM Resorts International"). **Both forms must pass.**
2. Ask `"<natural name> revenue"` through the page's engine (`answerQuestion` with the universe loaded from disk, as `scripts/ask.mjs` does). Read which companies the answer's plan names.
3. **Outcomes**, the worst form counting:
   - `correct`: the plan names exactly this company (answered, or not stated with a reason, for example a bank without that figure);
   - `clarify_listed`: the natural name is shared by two or more companies, and the box asks which one, listing this company among the candidates;
   - `wrong_company`: the plan names another company, or this one together with another;
   - `false_outside`: the answer says the company is not in the universe;
   - `miss`: anything else (asks "which company?" without candidates, refuses, routes to another topic).

Named probes, from the main session's probe of 0.3.1: "T Rowe Price net income" → TROW, "T. Rowe Price revenue" → TROW, "Best Buy revenue" → BBY, "Weatherford revenue" → WFRD, "MoonLake revenue" → MLTX, "TTM Technologies revenue" → TTMI, "Q2 Holdings revenue" → QTWO, "Burlington revenue" → BURL. The refusals must still hold: "Is Best Buy a buy?", "should I buy Target stock", "Best Buy stock price", "Will Best Buy revenue grow next year?".

## Pass bar (fixed now)

- `wrong_company` = 0;
- `false_outside` = 0;
- `miss` ≤ 1% of companies (19 of 1,994);
- every named probe holds;
- on the blind set v3, every must-not-answer question is still not answered (53/53), and the 0.2.0 blind guard in CI still passes (advice, price and forecast refusals).

The first run on the fixed head is reported with its commit, whatever it shows; later runs are labelled reruns.

## Corrections made before the first gate run

These were found on a development run of the gate during the fixes, and corrected before the first run on the fixed head. Each is a mistake in how the gate implemented the rule above, not a change to the bar.

- "/ MA" and "/ DE", with a space after the slash, were not removed as state suffixes. The gate asked "Vertex Pharmaceuticals INC / MA revenue", which no visitor would type ("MA" then read as Mastercard). The state pattern now allows the space.
- A name that is itself one acronym of three letters or fewer (RH) is tried only as written. "Rh" is not how anyone writes it.
- "Best Buy stock price" was expected to be `refused`. The box answers every price question with `not_in_bundle` (topic `price`: "Share prices… are not in this bundle"), for NVDA as for Best Buy. That has always been the price behaviour, and it states no price. The probe now expects that status and topic, and no figures.

## Baseline (before any fix; not the gate run)

On `main` at `00fb51b` (data `c75dfa6`): correct 1,879, clarify_listed 0, wrong_company 7, false_outside 9, miss 99. Seven named probes failed: T Rowe Price (both), Best Buy, Weatherford, MoonLake, Q2 Holdings, Burlington. The main session's own count with title case only was wrong 6, false outside 9, about 33 misses. This gate also tries the acronym form, so it counts more misses.

## First run on the fixed head

`90a717e` (data `fb2b5a4`), report `name-gate-first-run-90a717e.json`. **Passed.**

| Outcome | Companies |
| --- | ---: |
| correct | 1,990 |
| clarify_listed (shared name, both listed) | 4 (First Bancorp: FBP, FBNC; Blue Owl Capital: OWL, OBDC) |
| wrong_company | 0 |
| false_outside | 0 |
| miss | 0 |

All twelve named probes hold. On the blind set v3 (seen rerun, not blind, `ask-blind-v3-seen-rerun-0.3.2.json`): 210 correct, 0 wrong, 1 abstained; must-not-answer 53/53. The 0.2.0 blind guard passes in CI.
