# Ask the ledger

A visitor types a question of their own, in Chinese or English, and gets an answer in the page at once. No language model runs, there is no API key, and nothing the visitor types leaves the browser. Fixed rules read the question and the program answers from the same evidence bundle the rest of the workspace uses (`web/data/research.json`). Every number is stated by the program with the SEC fact behind it.

This is tier 1 of the portfolio's demo pattern: instant, no download beyond the evidence the page already loads, for every visitor. There is no tier 2 (browser model) in FinScope; [FRONTIER_REVIEW.md](FRONTIER_REVIEW.md) explains why.

## Use it

- On the intro page, type into **Ask the ledger** and press Enter. The ledger opens on the **Ask** tab with the answer.
- In the ledger, open **Ask** (the first tab). Examples are offered as buttons; each answer offers follow-up questions.
- Answers use the evidence filed by the **information date** selected above the tabs. Change it to ask about an earlier view; an answer never uses a filing made after that date.

## What an answer contains

- **A status**: *Answered*, *Not in this bundle*, *Declined* or *Needs more detail*.
- **The engine**: every answer carries "Rules · tier 1 · no model" and, at the bottom, the full engine label, the information date, the snapshot date and the dataset fingerprint.
- **A summary** in the question's language, then a table where useful (trends, comparisons, rankings, the year-to-date checkpoint, the cash bridge).
- **How the program calculated it**: each ratio or derived figure with its formula and result.
- **Source lines**: one row per stated figure: the figure, company, value (with the exact USD amount), period, filing date and a link to the matched 10-K or 10-Q with its XBRL tag. Treasury yields link to the Treasury source.
- **Notes** on what the figures do not show, and follow-up questions.

## What it answers

| Topic | Example |
| --- | --- |
| Is profit backed by operating cash? | NVDA 的利润有现金流支撑吗 |
| One figure for a fiscal year | MSFT 2024 年经营现金流是多少 |
| One ratio or indicator | What was Apple's current ratio in FY2025? |
| A trend | 谷歌近五年的营收 |
| A year-over-year change | Amazon net income change |
| Two or more companies side by side | compare AMZN and META cash conversion |
| Which of the six is highest or lowest | 哪家公司利润和现金差距最大 |
| The latest fiscal year-to-date checkpoint | 微软最新一季度的经营现金流比去年同期怎样 |
| The profit-to-cash bridge for that checkpoint | 苹果的应收账款变化 · Why is NVDA's cash flow below its profit this year? |
| The AI triage percentile | META 的异常分数是多少 |
| Treasury yields | 10 年期美债收益率现在多少 |
| Filing links | Link to Amazon's latest 10-K |
| Definitions | 什么是应计比率 |
| What the box can do, how recent the data is | 你能回答什么问题 · 数据更新到什么时候 |

Figures: revenue, net income, operating income, operating cash flow, total assets, total liabilities, current assets, current liabilities, cash and cash equivalents, cash capital expenditure. Indicators: operating, net and operating-cash margins, current ratio, liabilities / assets, cash coverage, the accrual ratio, revenue growth, cash conversion (operating cash flow ÷ net income), free cash flow (operating cash flow − capital expenditure) and the profit-to-cash gap (net income − operating cash flow).

**Fiscal years.** "FY N" or "N 年" is the annual period that ends in calendar year N; the answer always prints the exact start and end. NVIDIA's year ends in late January, so its FY2026 mostly covers calendar 2025, and the answer says so.

## What it does not answer

| Question | Answer |
| --- | --- |
| Buy, sell, hold, targets, stock picks | Declined: no investment advice |
| Forecasts, or a fiscal year not yet filed | Declined: points to the Scenarios tab, where assumptions are the visitor's own |
| "Is this company committing fraud?" | Declined: no verdict; points to the accrual ratio, cash conversion and the AI percentile |
| Share prices, market value, P/E | Not in this bundle |
| A company outside the six | Not in this bundle, with the SEC EDGAR company search |
| EPS, gross margin, R&D, segments, debt, dividends, buybacks, equity, investing or financing cash flow, a receivables or inventory balance | Not in this bundle, by name; never a substitute figure |
| A figure whose standard tag is missing (AMZN total liabilities, NVDA and AMZN capital expenditure, and anything derived from them) | Not in this bundle; a missing value is never treated as zero |
| A fiscal year before the bundle's first period, or a standalone historical quarter | Not in this bundle |
| Other topics or instructions | Declined |
| Gibberish, or a figure without a company | Needs more detail, with suggestions |

## How it reads a question

`web/ask-engine.js` normalises the text (full-width characters, common traditional characters), then finds, longest match first:

1. companies (tickers, English and Chinese names) and companies outside the six (a name list plus capitalised ticker-like tokens);
2. figures and indicators, and the look-alikes the bundle does not hold (so 毛利率 is never read as 利润率, and 投资活动现金流 never as 经营现金流);
3. periods: dates, fiscal years (2024, FY24, 24财年, "25" next to a company and figure), ranges, "last N years", 去年 / last year, 今年 / this year;
4. topic cues: cash support, why / bridge, year to date, trend, change, comparison, ranking, definitions, scope, freshness, and the refusal cues.

Refusals are checked first (off-topic, advice, fraud verdicts, other companies, prices, unsupported figures, forecasts and unfiled years). Only then is an answer composed. Because the vocabulary is closed, unfamiliar wording gets *Needs more detail* rather than a guess. The cost is that some colloquial phrasings are not understood; the measurement below shows how often.

## Run your own questions without a browser

`scripts/ask.mjs` imports the same module the page uses and prints each answer as JSON: status, topic, engine, the plan (companies, figure, period), the answer text, calculations and every source line. It loads no model, so it is safe to run anywhere Node 20+ runs.

```bash
node scripts/ask.mjs questions.json            # a JSON array of strings or {"id","q"} objects
node scripts/ask.mjs questions.txt             # one question per line
node scripts/ask.mjs --q "NVDA 的利润有现金流支撑吗"
node scripts/ask.mjs questions.json --date 2024-06-30 --full   # an earlier information date; full tables
```

## How it was tested

All questions below are SYNTHETIC visitor questions. These numbers describe how well the rules read questions; they are not a measure of financial accuracy, which comes from the bundle and its own checks.

**Blind set.** 145 questions written by a separate model (Sonnet) from [`tests/ask-blind/BLIND_SCOPE.md`](../tests/ask-blind/BLIND_SCOPE.md) only, without the code or rules. The scope was committed at `35d3903` and the set at `f43486b`, before any rule existed. Each answerable intent has a plain and a colloquial wording; 48 must not be answered (advice, forecasts, fraud verdicts, prices, other companies, unsupported or missing figures, out-of-range years, off-topic, gibberish) and 4 are ambiguous. `scripts/score-blind.mjs` scores the plan, not the prose: an answer is **correct** only with the gold companies, figure and period; **wrong** if it names other companies, another figure or period, or answers what must not be answered; **partial** if it has the right companies, figure and period in a different presentation; **abstained** for a non-answer where an answer was expected.

| Run | Correct | Partial | Wrong | Abstained | Must-not-answer held |
| --- | --- | --- | --- | --- | --- |
| **Blind first run at `ac0afc4`** (before reading the set) | 127 | 3 | 7 | 8 | 47 / 48 |
| Seen rerun (after reading the set; not blind) | 143 | 1 | 1 | 0 | 48 / 48 |

The first run is kept as [`docs/validation/ask-blind-first-run-ac0afc4.json`](validation/ask-blind-first-run-ac0afc4.json). Of its seven wrong answers, six were colloquial. Two read a bare two-digit year ("25", "24") as the latest year; two read a profit-versus-cash question as a single figure (net income); one answered "where does the gap come from" with the annual gap instead of the year-to-date bridge; one gave the revenue change where the gold wanted the revenue-growth ratio (the answer states the same growth rate); and one answered "amzn next yr revenue gonna be?" with the latest filed revenue instead of declining. The eight abstentions were abbreviations and slang (rev, liabs, 纸面富贵, 哪几家, what can u do, 10y yield), "净利润比前一年涨了多少" read as a share-price question, and "does the anomaly score mean fraud?" declined instead of defined. These classes were fixed after reading the set, so the rerun is not blind; a new measurement needs a new set. The one remaining disagreement is the revenue change versus revenue-growth case above, left as is because the answer states the asked growth rate. The current rerun is [`docs/validation/ask-blind-seen-rerun.json`](validation/ask-blind-seen-rerun.json); `tests/ask-blind.test.mjs` fails if the engine's outcomes drift from it.

**Coverage.** [`tests/ask-coverage.json`](../tests/ask-coverage.json): every topic the box claims, every figure and indicator, and every non-answer class, each in a plain and a colloquial wording (129 questions, written by the developer). The test also requires every stated figure to carry an SEC or Treasury source line and every non-answer to state no figure.

**Exactness.** Stated figures are compared with the bundle fact for that company, tag, period and accession; the accrual ratio is recomputed from the cited facts (including the prior-year assets) and must equal the pipeline value; answers at an earlier information date use only facts filed by then.

**In the page.** jsdom tests cover the intro box, the Ask tab, escaping of the visitor's text, follow-up buttons, empty input and the information date. The release walk (`scripts/release-walk.mjs`, run in CI with screenshots as an artifact) asks real questions and refusals at 1440 and 375 px in both themes, with zero console errors, failed or cross-origin requests allowed.

## Limits

- The vocabulary is closed. Unseen colloquial wording will mostly get *Needs more detail*; it should not get a different figure, but the blind set cannot prove a failure class is absent.
- The topics are the bundle's: annual figures, one year-to-date checkpoint per company, a five-line cash bridge, the anomaly percentile and Treasury yields. Anything else is refused.
- Answers describe filings; they do not explain business causes or give advice.
