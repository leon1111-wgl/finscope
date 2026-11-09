# FinScope "Ask the ledger": scope for a blind question set

This page describes what the FinScope answer box claims to answer. A blind evaluation set is written from this page alone, without the answer rules or the code.

## The product

FinScope is a static research workspace built from official SEC filings (CompanyFacts XBRL, 10-K and 10-Q) and daily US Treasury yields. A visitor types a question in Chinese or English. The box answers instantly in the browser with fixed rules over a saved evidence bundle (tier 1). No language model runs and nothing is sent to a server. The program states every number, with the SEC source line (form, XBRL tag, period, filing date, link) it came from, and says which engine produced the answer.

The box never gives investment advice, never forecasts, and refuses honestly when the bundle doesn't hold what is asked. Saying "not in this bundle" is better than answering a different question.

## Universe

Only six companies are in the bundle:

| Ticker | Company | Common names | Fiscal year ends | Annual periods in the bundle | Latest fiscal year-to-date (10-Q) checkpoint |
| --- | --- | --- | --- | --- | --- |
| AAPL | Apple Inc. | Apple, 苹果 | late September | FY2012 (ended 2012-09-29) … FY2026 (ended 2026-09-26) | 2025-09-28 → 2026-06-27 |
| MSFT | Microsoft | Microsoft, 微软 | 30 June | FY2012 … FY2026 (ended 2026-06-30) | 2026-07-01 → 2026-09-30 |
| NVDA | NVIDIA | Nvidia, 英伟达 | late January | FY2012 (ended 2012-01-29) … FY2026 (ended 2026-01-25) | 2026-01-26 → 2026-07-26 |
| AMZN | Amazon | Amazon, 亚马逊 | 31 December | FY2011 … FY2025 | 2026-01-01 → 2026-09-30 |
| GOOGL | Alphabet | Google, Alphabet, 谷歌 | 31 December | FY2013 … FY2025 | 2026-01-01 → 2026-09-30 |
| META | Meta Platforms | Meta, Facebook, 脸书 | 31 December | FY2012 … FY2025 | 2026-01-01 → 2026-09-30 |

**Fiscal-year convention.** "FY N" or "N 年" means the annual period that ends in calendar year N. Example: NVDA FY2025 ended 2025-01-26 and mostly covers calendar 2024; MSFT FY2024 ended 2024-06-30. A fiscal year that has not ended or been filed yet (for example GOOGL FY2026, or anything 2027 and later) is not in the bundle. Years before the first period above are not in the bundle.

The evidence is as of 2026-11-07. Treasury yields run from 2018-01-02 to 2026-11-06 (tenors 3-month, 2-year, 5-year, 10-year, 30-year).

## What is in the bundle (per company, per annual period)

Reported figures (USD, standard US-GAAP XBRL tags only):

| id | Figure | 中文 |
| --- | --- | --- |
| `revenue` | Revenue | 营收 / 收入 |
| `net_income` | Net income | 净利润 |
| `operating_income` | Operating income | 营业利润 |
| `operating_cash_flow` | Operating cash flow | 经营活动现金流 |
| `assets` | Total assets | 总资产 |
| `liabilities` | Total liabilities | 总负债 |
| `current_assets` | Current assets | 流动资产 |
| `current_liabilities` | Current liabilities | 流动负债 |
| `cash` | Cash and cash equivalents | 现金及现金等价物 |
| `capex` | Cash capital expenditure | 资本开支 |

Known gaps: AMZN has no standard-tag total liabilities; NVDA and AMZN have no standard-tag capital expenditure. A question about those must get "not in this bundle" (the box must not substitute another figure).

Ratios and indicators computed from those figures:

| id | Indicator | Formula |
| --- | --- | --- |
| `operating_margin` | Operating margin 营业利润率 | operating income ÷ revenue |
| `net_margin` | Net margin 净利率 | net income ÷ revenue |
| `cash_margin` | Operating cash margin 经营现金流利润率 | operating cash flow ÷ revenue |
| `current_ratio` | Current ratio 流动比率 | current assets ÷ current liabilities |
| `liabilities_assets` | Liabilities / assets 资产负债率 | total liabilities ÷ total assets |
| `cash_coverage` | Cash coverage 现金覆盖率 | cash ÷ current liabilities |
| `accruals` | Accrual ratio 应计比率 (Sloan-style) | (net income − operating cash flow) ÷ average total assets |
| `revenue_growth` | Revenue growth 营收增长率 | revenue ÷ prior-year revenue − 1 |
| `cash_conversion` | Cash conversion 现金转化率 / 利润现金含量 | operating cash flow ÷ net income |
| `free_cash_flow` | Free cash flow 自由现金流 | operating cash flow − capital expenditure |
| `profit_cash_gap` | Profit-to-cash gap 利润与现金差距 | net income − operating cash flow |

Other sections:

- **Fiscal year-to-date checkpoint** (latest 10-Q): revenue, net income, operating income and operating cash flow for the current YTD and the same YTD last year, with changes.
- **Profit-to-cash bridge** for that YTD: depreciation and amortization, share-based compensation, accounts receivable change, inventory change, accounts payable change, and the unexplained remainder. Accounts receivable appears only here, as a cash-flow-statement change; there is no receivables balance.
- **AI triage**: an Isolation Forest anomaly percentile (0–100) per company for its latest annual profile, with the three ratios furthest from the training medians. It is an investigation cue, not a fraud, default or return signal.
- **Treasury yields** for a date.
- **Filing links**: the latest 10-K or 10-Q document for a company.
- **Definitions** of the figures, ratios, the anomaly score and the data sources.
- **Freshness**: when the bundle was built and what it covers.

## Topics the box claims (gold `topic` ids)

| topic | What a visitor asks | Example |
| --- | --- | --- |
| `cash_support` | Is one company's profit backed by operating cash? Earnings quality. | NVDA 的利润有现金流支撑吗 |
| `metric` | One reported figure for one company and period | MSFT 2024 年经营现金流是多少 |
| `ratio` | One ratio or indicator for one company and period | What was Apple's current ratio in FY2025? |
| `trend` | A figure or ratio across several fiscal years | 谷歌近几年的营收走势 |
| `change` | Year-over-year change of a figure or ratio, or the receivables change | 苹果的应收账款变化 |
| `compare` | Two or more named companies on one figure or ratio | compare AMZN and META cash conversion |
| `rank` | Which of the six is highest or lowest on a figure, ratio or gap | 哪家公司利润和现金差距最大 |
| `ytd` | The latest fiscal year-to-date checkpoint versus last year | 微软最新一季度的经营现金流比去年同期怎样 |
| `bridge` | What explains the gap between profit and operating cash (YTD bridge) | Why is NVDA's cash flow below its profit this year? |
| `anomaly` | The AI triage percentile and what drives it | META 的异常分数是多少 |
| `rates` | Treasury yields on a date | 10 年期美债收益率现在多少 |
| `filing` | Where to read the latest 10-K or 10-Q | Link to Amazon's latest 10-K |
| `definition` | What a figure, ratio or the anomaly score means | 什么是应计比率 |
| `scope` | What the box can answer | 你能回答什么问题 |
| `freshness` | How recent the data is | 数据更新到什么时候 |

## What the box must not answer (non-answer classes)

| class | Examples | Expected status |
| --- | --- | --- |
| `advice` | buy, sell, hold, worth investing, target price, which stock to pick, position sizing | `refuse` |
| `forecast` | next year's revenue, will profit grow, any figure for a fiscal year not yet filed | `refuse` |
| `fraud_verdict` | is the company cooking its books, is this fraud | `refuse` (it may point to transparent indicators, but must not give a verdict) |
| `price` | share price, market cap, P/E, valuation, dividend yield | `not_in_bundle` |
| `out_of_universe` | any company outside the six (Tesla, Netflix, 茅台, 腾讯, TSMC…) | `not_in_bundle` |
| `unsupported_metric` | EPS, gross margin, R&D, segment revenue, debt, dividends, buybacks, employees, EBITDA, investing or financing cash flow, receivables balance, inventory balance | `not_in_bundle` |
| `missing_fact` | AMZN total liabilities, NVDA or AMZN capex (and anything derived from them) | `not_in_bundle` |
| `out_of_range` | a fiscal year before the first one in the bundle | `not_in_bundle` |
| `off_topic` | weather, write code, tell a joke, ignore your rules | `refuse` |
| `gibberish` | random characters, empty-ish input | `clarify` |
| `ambiguous` | a single-company question with no company named ("利润有现金流支撑吗") | `clarify`, or an answer that covers all six |

## Gold record format

One JSON array. Each record:

```json
{
  "id": "b001",
  "q": "NVDA 的利润有现金流支撑吗",
  "lang": "zh",
  "style": "plain",
  "pair": "p001",
  "expect": "answer",
  "topic": "cash_support",
  "tickers": ["NVDA"],
  "metric": null,
  "period": "latest"
}
```

- `lang`: `zh`, `en` or `mixed`.
- `style`: `plain` or `colloquial`. Every answerable topic gets pairs: the same intent once in plain wording and once colloquially (slang, typos, missing punctuation, mixed language, indirect phrasing). Use the same `pair` id for both.
- `expect`: `answer`, `not_in_bundle`, `refuse` or `clarify`, or an array of acceptable statuses (only for `ambiguous`).
- `topic`: a topic id from the first table, or a non-answer class from the second.
- `tickers`: the companies the question is about, in the order asked; `[]` when none; for `rank`, `[]` (all six).
- `metric`: a figure or indicator id from the tables above, or `null` when the topic doesn't need one (`cash_support`, `ytd`, `bridge`, `anomaly`, `rates`, `filing`, `scope`, `freshness`). For `definition`, the id being defined (`anomaly_score` for the AI score).
- `period`: `latest`, `FYyyyy`, `ytd`, a date `yyyy-mm-dd` (rates), or `null`.
