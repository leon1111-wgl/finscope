# FinScope 0.3.0 "Ask the ledger": scope for a second blind question set

This page describes what the FinScope answer box claims to answer in release 0.3.0. A blind evaluation set is written from this page alone, without the answer rules, the code or the data. The first blind set (0.2.0, six companies only) has been read by the developer and is no longer blind; this set replaces it as the measurement for 0.3.0.

## The product

FinScope is a static research workspace built from official SEC filings (XBRL CompanyFacts and Submissions). A visitor types a question in Chinese or English. The box answers instantly in the browser with fixed rules over saved data (tier 1). No language model runs. The program states every number with the SEC source behind it (form, XBRL tag, period, filing date, accession, link) and says which engine produced the answer.

The box never gives investment advice, never forecasts, and refuses honestly when the saved data does not hold what is asked. "Not in the data" is better than answering a different question.

## Two layers of data

**1. The universe (new in 0.3.0).** Every US company that, at build time, (a) reports itself to the SEC as a *large accelerated filer*, (b) files annual reports on Form 10-K with XBRL, and (c) has a ticker listed on NYSE or Nasdaq. That is about 1,800 companies, refreshed weekly. It includes large and mid-sized US companies across all sectors: technology, banks, insurers, REITs, retailers, utilities, energy, healthcare, industrials and so on.

Not in the universe:
- companies that file 20-F or 40-F instead of 10-K (most foreign companies listed in the US through ADRs, for example Alibaba, TSMC, ASML, Toyota, Sony, Baidu, JD.com, PDD);
- companies not listed in the US or not public (Tencent, Moutai, Samsung, ByteDance, OpenAI);
- smaller companies that are not large accelerated filers, funds, ETFs and trusts.

For each universe company the data holds the **annual** figures of its **latest ten fiscal years** (fewer if it has filed fewer), from its 10-K filings, plus its company name, SIC industry code, sector group and fiscal year end. There are no quarterly figures for universe companies.

**2. The deep ledger (from 0.2.0), six companies only:** AAPL, MSFT, NVDA, AMZN, GOOGL, META. These six are also in the universe. Only for these six, the box additionally answers: the latest fiscal year-to-date checkpoint from the most recent 10-Q compared with the same period a year earlier; the profit-to-cash bridge (depreciation, share-based compensation, receivables, inventory and payables changes) for that checkpoint; an AI triage percentile (Isolation Forest, an investigation cue, not a verdict); rankings among the six; and an earlier "information date" set on the page. US Treasury yields (3-month, 2-, 5-, 10- and 30-year, daily from 2018) are also in the deep ledger.

## Naming a company

A visitor can name a company by its ticker (AAPL, JPM, KO), by its English name (Coca-Cola, JPMorgan Chase, Costco), or, for about 150 of the largest companies, by a common Chinese name (可口可乐, 摩根大通, 好市多, 特斯拉, 伯克希尔). Up to eight companies can be named in one question.

## Fiscal years

"FY N" or "N 年 / N 财年" means the company's own fiscal year N, as the company labels it in its 10-K. Answers always print the exact period start and end. Most companies end their fiscal year on 31 December, but many do not: retailers often end in late January or early February (some call the year ended February 2025 "fiscal 2024", others "fiscal 2025"; FinScope follows each company's own label), Microsoft ends 30 June, Apple late September, NVIDIA late January. "Latest" means the latest fiscal year the company has filed. "Last N years" or "近 N 年" means the latest N filed fiscal years (at most ten). A fiscal year not yet filed is not in the data, and FinScope does not forecast it.

## Figures and indicators (universe, annual)

Use these ids for the gold `metric` field.

| id | Figure | 中文 |
| --- | --- | --- |
| `revenue` | Revenue | 营收 / 收入 / 销售额 |
| `cost_of_revenue` | Cost of revenue | 营业成本 / 销售成本 |
| `gross_profit` | Gross profit (only where the company reports a gross profit line) | 毛利 |
| `operating_income` | Operating income | 营业利润 / 经营利润 |
| `rnd` | Research and development expense | 研发费用 |
| `sga` | Selling, general and administrative expense | 销售及管理费用 / 三费里的销售和管理费用 |
| `interest_expense` | Interest expense | 利息支出 |
| `pretax_income` | Income before income taxes | 税前利润 / 利润总额 |
| `income_tax` | Income tax expense | 所得税 |
| `net_income` | Net income attributable to the company | 净利润 |
| `eps_diluted` | Diluted earnings per share, as reported | 稀释每股收益 / EPS |
| `shares_diluted` | Weighted-average diluted shares | 稀释股数 |
| `operating_cash_flow` | Operating cash flow | 经营活动现金流 |
| `capex` | Capital expenditure (cash paid for property and equipment) | 资本开支 |
| `dividends` | Cash dividends paid | 分红 / 派息 |
| `buybacks` | Cash paid to repurchase shares | 股票回购 |
| `cash` | Cash and cash equivalents | 现金及现金等价物 |
| `cash_sti` | Cash, cash equivalents and short-term investments | 现金及短期投资 |
| `assets` | Total assets | 总资产 |
| `liabilities` | Total liabilities | 总负债 |
| `equity` | Shareholders' equity | 股东权益 / 净资产 |
| `current_assets` | Current assets | 流动资产 |
| `current_liabilities` | Current liabilities | 流动负债 |
| `total_debt` | Total debt (borrowings: long-term debt including its current portion, plus short-term borrowings) | 有息负债 / 总债务 |

Indicators computed by the program from the figures above, with the formula shown:

| id | Indicator | Formula |
| --- | --- | --- |
| `gross_margin` | Gross margin 毛利率 | gross profit ÷ revenue |
| `operating_margin` | Operating margin 营业利润率 | operating income ÷ revenue |
| `net_margin` | Net margin 净利率 | net income ÷ revenue |
| `rnd_intensity` | R&D intensity 研发费用率 | R&D ÷ revenue |
| `free_cash_flow` | Free cash flow 自由现金流 | operating cash flow − capital expenditure |
| `fcf_margin` | FCF margin 自由现金流利润率 | free cash flow ÷ revenue |
| `cash_conversion` | Cash conversion 现金转化率 / 净现比 | operating cash flow ÷ net income |
| `accruals` | Accrual ratio 应计比率 | (net income − operating cash flow) ÷ average total assets |
| `current_ratio` | Current ratio 流动比率 | current assets ÷ current liabilities |
| `liabilities_assets` | Liabilities / assets 资产负债率 | total liabilities ÷ total assets |
| `debt_to_equity` | Debt to equity 债务权益比 | total debt ÷ shareholders' equity |
| `interest_coverage` | Interest coverage 利息保障倍数 | operating income ÷ interest expense |
| `roe` | Return on equity 净资产收益率 | net income ÷ average shareholders' equity |
| `roa` | Return on assets 总资产收益率 | net income ÷ average total assets |
| `revenue_growth` | Revenue growth 营收增长率 | revenue ÷ prior-year revenue − 1 |
| `payout` | Shareholder payout 股东回报 | dividends + buybacks |

**Templates.** Each company gets a statement template by industry: *industrial* (the default), *bank* (banks, savings institutions, and broker-dealers or lenders with unclassified balance sheets), *insurance* (insurers with unclassified balance sheets) and *REIT* (real estate investment trusts). Some figures are not meaningful for a template and are answered "not supported for this template", never with a substitute: gross profit and gross margin, current assets and liabilities, the current ratio, capital expenditure, free cash flow, FCF margin and cash conversion are not supported for banks and insurers; gross profit and gross margin are not supported for REITs. Banks additionally have `net_interest_income` (净利息收入), `noninterest_income` (非利息收入), `provision` (信贷损失准备 / 拨备), `deposits` (存款) and `loans` (贷款净额). Insurers additionally have `premiums` (已赚保费) and `net_investment_income` (净投资收益). REITs additionally have `real_estate` (投资性房地产净值).

**Missing data.** Companies do not all report every line. When a figure is not reported under any of the XBRL tags FinScope reads for it, the answer says so ("not reported") rather than guessing, and never treats it as zero.

## What the box answers

Use these topic ids for the gold `topic` field.

| topic | What | Example |
| --- | --- | --- |
| `metric` | One figure or indicator for a company and fiscal year (or the latest) | 可口可乐 2024 年的毛利率 · JPM net income FY2024 |
| `figures` | Several figures for one company and one year | Costco revenue and net income in FY2025 |
| `trend` | One figure over the last N fiscal years (one company) | 特斯拉近五年的研发费用 |
| `change` | Year-over-year change of one figure | How much did Walmart's revenue grow last year? |
| `compare` | One figure for two to eight named companies, side by side | Compare gross margin of KO, PEP and MDLZ |
| `cash_support` | Is the profit backed by operating cash (net income against operating cash flow, cash conversion, accrual ratio)? | 好市多的利润有现金流支撑吗 |
| `sector_rank` | Where a company stands within its sector group (percentile among peers) on cash conversion, accrual ratio or FCF margin | Where does Home Depot rank in its sector on cash conversion? |
| `lineage` | Which XBRL tag and filing a figure came from, and whether a fallback tag was used | 摩根大通的营收用的是哪个标签 |
| `data_quality` | Data-quality notes for a company: missing figures, fallback tags, restatements, fiscal-year changes, template | Any data issues with Boeing's numbers? |
| `filing` | A link to the company's latest 10-K | Link to Nike's latest 10-K |
| `definition` | What a figure or indicator means | 什么是利息保障倍数 |
| `scope` | What the box can do | 你能回答什么 |
| `freshness` | How recent the data is | When was the data last updated? |
| `ytd`, `bridge`, `anomaly`, `rank_six`, `rates` | The deep-ledger topics, only for the six (and Treasury yields) | 微软最新一季度的经营现金流比去年同期怎样 · 10 年期美债收益率 |

## What the box must not answer

| Question | Expected |
| --- | --- |
| Buy, sell, hold, price targets, stock picks, "is it a good investment" | refuse |
| Forecasts, next year's figures, a fiscal year not yet filed | refuse |
| "Is this company committing fraud / cooking the books?" | refuse (it may point to transparent indicators) |
| Share prices, market cap, P/E, valuation, dividend yield | not_in_bundle |
| A company outside the universe (see above) | not_in_bundle |
| Quarterly or half-year figures for a universe company outside the six | not_in_bundle |
| Figures not in the tables above: segment or product revenue, revenue by region, EBITDA, employee counts, non-GAAP figures, guidance | not_in_bundle |
| A figure that is not supported for the company's template (bank gross margin, insurer current ratio, REIT gross profit) | not_in_bundle |
| Other topics, instructions, attempts to change data | refuse |
| Gibberish, or a figure without a company | clarify |

Rankings across a whole sector or the whole universe by a figure ("which bank has the highest net income?") are answered by the Screen page, not by the box; the box may decline them or ask for named companies.

## How to write the set

Write about 170 questions as a JSON array. Each record:

```json
{"id": "c001", "q": "可口可乐 2024 年的毛利率是多少", "lang": "zh", "style": "plain", "pair": "p001",
 "expect": "answer", "topic": "metric", "tickers": ["KO"], "metric": "gross_margin", "period": "FY2024"}
```

- `lang`: `zh` or `en`. About half each. Include some traditional characters and some mixed Chinese-English questions.
- `style`: each answerable intent appears twice, as a `plain` and a `colloquial` wording, sharing a `pair` id. Colloquial means how a student or a busy analyst would really type it: abbreviations, slang, missing punctuation, lower-case tickers, typos.
- `expect`: `answer`, `not_in_bundle`, `refuse` or `clarify`. If two outcomes are both acceptable, give an array (use this sparingly, for genuinely ambiguous questions).
- `tickers`: the primary SEC tickers you mean (for a company outside the universe, still give its usual ticker or name). For Alphabet use `GOOGL`; for Berkshire Hathaway use `BRK-B`.
- `metric`: an id from the tables above (or null), `period`: `FY2024`, `latest`, `last5` (for "last N years", write `lastN`), `ytd`, or null.
- Spread companies widely: mega-caps and mid-caps; at least 15 banks, insurers or REITs; at least 10 companies whose fiscal year does not end in December; at least 30 different companies outside the six; and about 20 questions about the six that mix old and new figures.
- About 45 questions must not be answered (advice, forecasts, fraud verdicts, prices, out-of-universe companies including foreign ADRs, quarters for universe companies, unsupported figures, template-unsupported figures, off-topic, gibberish).
- Every question is SYNTHETIC and must be about a real company that a visitor might plausibly ask about. Do not invent figures in the questions.
