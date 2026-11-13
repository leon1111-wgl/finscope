# Ask the ledger

A visitor types a question of their own, in Chinese or English, about **any company in the FinScope universe** (about 1,900 US large accelerated filers, see [UNIVERSE.md](UNIVERSE.md)) or the six deep-ledger companies, and gets an answer in the page at once. No language model runs, there is no API key, and nothing the visitor types leaves the browser. Fixed rules read the question; the program answers from the saved data the rest of the workspace uses (`web/data/research.json` for the deep ledger, `web/data/universe/` for the universe) and states every number with the SEC fact behind it.

## 0.3.0: the universe path

Since 0.3.0 the box has two data sources and one set of rules:

- **Universe path** (`web/universe-ask.js`): any question that names a universe company outside the six, asks for a figure added in 0.3.0 (gross margin, R&D, SG&A, interest, tax, diluted EPS, diluted shares, dividends, buybacks, cash and short-term investments, equity, total debt, ROE, ROA, debt to equity, interest coverage, FCF margin, shareholder payout, bank, insurance and REIT lines), asks which XBRL tag a figure came from, asks for data-quality notes, or asks where a company stands among its sector peers. The page loads the shards of the companies named (and the screen for a sector question) before answering.
- **Deep path** (`web/ask-engine.js`, unchanged rules): the six companies' 0.2.0 figures, the year-to-date checkpoint and cash bridge, AI triage, rankings among the six, Treasury yields and earlier information dates. A six-company figure the deep ledger lacks (NVIDIA's capex has no standard tag) goes to the universe path, which reads the documented fallback tag and says so.

Refusals come first and are shared: advice, forecasts, fraud verdicts, prices, write requests and off-topic questions are declined before either path runs. A company outside the universe gets the reason when it is known (it files 20-F as a foreign private issuer, it is not US-listed, it is private) and otherwise "no company with that ticker or name is in the universe".

**Companies.** Tickers in capitals anywhere; lower-case tickers only for a curated list of well-known ones (`jpm`, `wmt`, `ko`), because many tickers are ordinary words (`cost`, `low`, `now`, `all`); a short or lower-case ticker inside a list of tickers (`jpm bac wfc c gs ms`); `$TICKER` always; SEC names without their legal suffix (Coca-Cola, Home Depot); one-word names that are common words (Target, Block) only with a capital; and common Chinese names for about 190 of the largest companies (可口可乐, 摩根大通, 好市多). Up to eight companies per question.

**Fiscal years.** "FY N" is the company's own fiscal year N as its 10-K labels it; the answer prints the period start and end. "Latest" is the latest filed year; "last N years" covers at most the ten FinScope keeps.

**What a universe answer can be.** One figure or indicator; several figures for one company and year; a trend; a year-over-year change; two to eight companies side by side, each on its own fiscal year; whether profit is backed by operating cash (net income, operating cash flow, cash conversion, the accrual ratio, five years); a sector percentile for cash conversion, the accrual ratio or FCF margin; the tag, filing and chain behind a figure; the data-quality notes; the latest 10-K link; a definition; or, for a company named without a figure, an overview of its key figures. A figure the company does not report is *not reported* (with the tag chain read); one its template does not support (gross margin for a bank) is *not supported for this template*; neither is ever replaced by another figure. Rankings across a sector or the universe are on the Screen page; the box asks for named companies instead.

**Information date.** Universe figures are the latest filings. At an earlier information date the universe path declines and says why, so an answer never uses a filing made after the date the visitor chose.

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
| Several figures for one company and year | 苹果2025年的营收和净利润 |
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

**Fiscal years.** "FY N" or "N 年" is the annual period that ends in calendar year N; the answer always prints the exact start and end. NVIDIA's year ends in late January, so its FY2026 mostly covers calendar 2025, and the answer says so. A date is accepted when it is the company's fiscal year end. 去年, 今年 and "two years ago" count from the information date. Comparisons can take one year per company ("Meta in 2025 compared to Google in 2024").

**Two figures in one question.** A defined combination becomes its indicator ("operating cash flow minus capex" is free cash flow, "net income divided by revenue" is net margin). Other figures for one company and year are listed side by side. A combination FinScope does not define (capex as a share of revenue), or different figures for different companies, gets a decline or a request to ask one figure at a time; the box never states one of the inputs as the answer.

**Treasury years.** "The 10-year yield in 2024" gives that year's first, last, lowest and highest observations with their dates. Only the five tenors in the bundle are answered.

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
| A fiscal year before the bundle's first period, a standalone quarter or half-year, a calendar year for a company whose fiscal year does not end in December, or a date that is not a fiscal year end | Not in this bundle, or a request for a fiscal year |
| A narrower or broader scope: excluding a part, a region or product, cash plus marketable securities, per-share, CAGR, another currency | Not in this bundle |
| A ranking by growth of anything but revenue | Not in this bundle |
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
node scripts/ask.mjs --q "可口可乐 2024 年的毛利率"           # any company in the universe
node scripts/ask.mjs --q "Compare JPM, BAC and WFC deposits"
node scripts/ask.mjs questions.json --date 2024-06-30 --full   # an earlier information date; full tables
node scripts/ask.mjs questions.json --no-universe              # the six-company deep ledger only (0.2.0 behaviour)
```

It loads the universe shards from `web/data/universe/` for the companies each question names, exactly as the page loads them. Each source line in the output carries the figure, company, value and exact amount, period, fiscal year, form, XBRL tag (or the parts of a composed figure), how it was chosen (first choice, fallback, composed), filing date, accession and URL.

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

**Independent review.** A read-only Fable review at `09a54fd` ran 181 adversarial questions of its own and verified a sample of figures, the bridge arithmetic and information-date bounding against the bundle; it found no wrong figure. It found classes where a different figure or period than the one asked was stated: two figures in one question (the first one won), growth or earnings-quality rankings answered with a level figure, quarters, half-years, calendar years and dates mapped to another period, Treasury years and tenors ignored, and sub-scope qualifiers (excluding China, cash plus marketable securities) ignored. It also found harmless questions refused ("What does NVDA sell?", "英伟达持有多少现金", "Did Apple's revenue go up last year?"). All were fixed with failing-first tests (`tests/ask-review.test.mjs`); the reviewer's questions are kept with their read-by-hand outcomes (`tests/ask-review-probe.json`). There was no second review.

**Main-session probe (not blind).** Before merge, the main session ran 54 questions of its own at `63aaf77`. Two were off-target: "谷歌和脸书谁的现金转化更好" was answered with cash and cash equivalents, and "亚马逊利润和现金差得多吗" with net income plus the cash balance. The class was fixed, not the strings: the bare word 现金 / cash next to profit, conversion or support wording now means operating cash against profit (cash support for one company, cash conversion across companies, the profit-to-cash gap when a gap is asked), and never the cash balance; "现金转化" without 率 is cash conversion. Also fixed: "apple ocf vs net income" and "AMZN profit vs cash" give the cash-support answer; comparisons print each company's fiscal year and end date next to its number and say when the years end on different dates; a quarter question first says single quarters are not held, then gives the labelled year-to-date figure with its length in months; year-on-year wording says 增长/下降 (up/down); "这个工具能干嘛" gets the scope answer; "请用英文回答" answers in English; a few common typos (amazn, net incom) are read. Tests: `tests/ask-main-probe.test.mjs` (failing first, with look-alike variants and cash-balance controls) and the 54 questions with their read-by-hand outcomes (`tests/ask-main-probe.json`). The blind rerun did not change.

A held-out batch of 27 more questions from the main session at `d484511` found no wrong figure but four wording classes, fixed in the same way (not blind): quality words beside profit (利润是不是虚的, 有没有水分, 靠谱吗, is the profit real) get the cash-support answer instead of the bare net-income figure; requests to change saved data (把…改成, 删掉, set … to) are declined with a pointer to the Scenarios page; freshness and provenance wordings (数据是什么时候的, 这些数字从哪来的) get the freshness and sources answers, while "收入来源" (a revenue breakdown) is not in the bundle; and ratios the bundle lacks (quick ratio, inventory turnover, interest coverage, debt to equity) get "not in this bundle". A browser walk at `11c1f89` found one more class: two companies named with 谁…更 and cash-support wording ("微软和谷歌谁的利润更有现金支撑") were answered with a six-company ranking. Named companies are now always compared (each with its fiscal year); a ranking needs no named company or an explicit "all six". The same rule covers gap, accrual and growth comparisons; growth across companies is compared for revenue only, and trends are shown one company at a time.

At `77c82f7` one more evaluative word beside profit ("谷歌和亚马逊谁的利润更扎实") still fell back to the net-income level. Word lists would keep missing such words, so profit now follows a closed rule (`profitEvaluative` in `web/ask-engine.js`): only a fixed set of size, amount, direction and ranking predicates (更高, 多少, 增长, 亏损, 排名, higher, how much …) plus the filler of an ordinary lookup keep the net-income level. Any other word beside 利润 / profit, or an evaluative frame (怎么样, 是不是, how is …), asks about the quality of the profit and gets cash support for one company, a cash-conversion comparison for named companies, or a ranking for all six. Questions whose wording is not in either list therefore get the cash-support answer, which states net income beside operating cash flow, never the bare level.

**Exhaustive exactness.** For every company, every fiscal year in the bundle and every reported figure, the test asks the question and requires the stated value, period, tag and accession to equal the bundle fact, or a decline where the fact is missing.

**In the page.** jsdom tests cover the intro box, the Ask tab, escaping of the visitor's text, follow-up buttons, empty input and the information date. The release walk (`scripts/release-walk.mjs`, run in CI with screenshots as an artifact) asks real questions and refusals at 1440 and 375 px in both themes, with zero console errors, failed or cross-origin requests allowed.

## Limits

- The vocabulary is closed. Unseen colloquial wording will mostly get *Needs more detail*; it should not get a different figure, but the blind set cannot prove a failure class is absent.
- The topics are the bundle's: annual figures, one year-to-date checkpoint per company, a five-line cash bridge, the anomaly percentile and Treasury yields. Anything else is refused.
- Answers describe filings; they do not explain business causes or give advice.
