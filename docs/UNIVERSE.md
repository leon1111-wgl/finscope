# The company universe (0.3.0)

FinScope 0.2.0 covered six companies. Release 0.3.0 adds a **universe**: every US company that files 10-Ks with XBRL and reports itself to the SEC as a large accelerated filer, with ten years of standardized annual figures, each traced to its filing. The six keep their deep ledger (year-to-date checkpoint, cash-flow bridge, AI triage, information dates and scenarios); the universe is what a visitor uses for a company of their own.

## Which companies, and why this set

**Rule.** A company is in the universe when, at the weekly build:

1. its SEC Submissions record has `category` starting with *Large accelerated filer*, and
2. it filed a 10-K or 10-K/A in the last 15 months, and
3. its CompanyFacts hold at least one annual US-GAAP period in USD from a 10-K.

**Why this rule.** Large accelerated filer status is a legal test the SEC already applies: a public equity float of at least $700 million at the end of the second fiscal quarter, at least twelve months of reporting and at least one annual report (17 CFR 240.12b-2). It therefore selects established, publicly traded companies without a proprietary index list, it is stated by the company itself on the 10-K cover, and it can be rebuilt by anyone from SEC data alone. It is broader than the S&P 500: it includes mid-caps a student or junior analyst is likely to look at, and it includes banks, insurers and REITs, which get their own templates. It excludes foreign private issuers that file 20-F or 40-F (most ADRs), smaller reporting companies and companies that are not yet large accelerated filers (recent IPOs among them).

**Size.** The build of 2026-11-13 (data commit `ec1f904`) holds **1,994 companies**: 1,566 industrial, 244 bank and other financial, 64 insurance and 120 REIT. The funnel: 6,033 companies with an NYSE or Nasdaq ticker; 4,021 candidates; 1,998 large accelerated filers with a 10-K in the last 15 months; 4 without an annual USD period in a 10-K; 0 failed validation. The build made 6,028 SEC requests (506 MB compressed) in 12.7 minutes. The count is written by every build in `web/data/universe/manifest.json`.

**How candidates are found.** Checking every SEC registrant's filer status would take tens of thousands of requests, so the build narrows the requests first. Candidates are every company whose 10-K cover reports a public float of at least $560 million (the level below which a large accelerated filer loses that status) in the SEC's `dei:EntityPublicFloat` frames for the last eight quarter ends, plus every company with an NYSE or Nasdaq ticker in `company_tickers_exchange.json` that reports no float in those frames. Filer status is then read from each candidate's Submissions record. The ticker file only supplies tickers; when both it and Submissions omit a ticker (ExxonMobil in November 2026), a short curated list fills it, and failing that the company is listed under its CIK.

## How it is built

`scripts/build_universe.py` runs weekly on GitHub Actions (`.github/workflows/universe.yml`) and commits `web/data/universe/` to `main`, which deploys Pages.

- **SEC fair access.** One declared User-Agent with a contact address (the repository variable `SEC_USER_AGENT`), at most 8 requests per second across threads (the SEC's limit is 10), gzip, and up to five retries with backoff on 403, 429 and 5xx. The manifest records the number of requests, bytes and seconds.
- **Determinism.** A company's shard is rewritten only when its content changes, so a weekly build commits only the companies with a new filing.
- **Validation.** Every shard is checked before it is written: periods strictly increasing with unique fiscal-year labels, every cell's accession present in the filing table, every cell filed on or after its period end, and every composed cell equal to the sum of its parts. One malformed company is excluded and named in the manifest; more than 1% fails the build. The shards must stay under 200 MB.

## Fiscal years

The annual periods come from the company's **original 10-K filings**: the current period of a 10-K is the latest annual duration (330 to 400 days) it reports. The latest period's label is that 10-K's own DEI fiscal-year focus (or its end year when the label is implausible), so retailers keep their own naming (Walmart calls the year ended 31 January 2026 FY2026, Target calls the year ended 31 January 2026 FY2025). Earlier contiguous periods count back one year at a time, so labels have no holes or repeats; across a gap (a transition period) an earlier period keeps its own plausible label. An earlier filing whose own label differs is named in the data-quality notes. Transition-period 10-KT filings are not annual periods; the gap they leave is noted. FinScope keeps the latest ten fiscal years.

## How each figure is chosen

For each figure and period: the **best tag in the figure's chain that any 10-K or 10-K/A reports for that period** is chosen first, then the **latest filing** that reports that tag. So a later 10-K that carries an older year only under a broader concept (equity including noncontrolling interests, cash including restricted cash) cannot replace the company's own first-choice figure. Leading tags that are equally standard (for revenue: contract revenue and `Revenues`) form one tier; later tags are *fallbacks* and are marked. (Until the independent review this rule read "latest filing first", which swapped concepts for about a third of older cash and equity cells; see the CHANGELOG.) Flows must match the period's start and end; balances its end. Only facts without dimensions are read (CompanyFacts carries no segment facts). A value is never treated as zero when it is missing, and never replaced by a different concept.

| id | Figure | Statement | Kind | Unit | Tag chain (fallback order) | Templates |
| --- | --- | --- | --- | --- | --- | --- |
| `revenue` | Revenue | IS | flow | USD | RevenueFromContractWithCustomerExcludingAssessedTax → Revenues → SalesRevenueNet → RevenueFromContractWithCustomerIncludingAssessedTax → SalesRevenueGoodsNet → SalesRevenueServicesNet → RevenuesNetOfInterestExpense | all |
| `cost_of_revenue` | Cost of revenue | IS | flow | USD | CostOfRevenue → CostOfGoodsAndServicesSold → CostOfGoodsSold → CostOfServices → CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization | industrial, REIT |
| `gross_profit` | Gross profit | IS | flow | USD | GrossProfit (never computed for a company that does not present it) | industrial |
| `operating_income` | Operating income | IS | flow | USD | OperatingIncomeLoss | all |
| `rnd` | Research and development | IS | flow | USD | ResearchAndDevelopmentExpense → ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost | industrial |
| `sga` | Selling, general and administrative | IS | flow | USD | SellingGeneralAndAdministrativeExpense; else SellingAndMarketingExpense or SellingExpense plus GeneralAndAdministrativeExpense from the same filing | industrial, REIT |
| `interest_expense` | Interest expense | IS | flow | USD | InterestExpense → InterestExpenseNonoperating → InterestExpenseDebt → InterestAndDebtExpense | all |
| `pretax_income` | Income before income taxes | IS | flow | USD | IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest → IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments | all |
| `income_tax` | Income tax expense | IS | flow | USD | IncomeTaxExpenseBenefit | all |
| `net_income` | Net income | IS | flow | USD | NetIncomeLoss → ProfitLoss (includes noncontrolling interests; marked as a fallback) | all |
| `eps_diluted` | Diluted EPS, as reported | IS | flow | USD/share | EarningsPerShareDiluted → EarningsPerShareBasicAndDiluted | all |
| `shares_diluted` | Diluted weighted-average shares | IS | flow | shares | WeightedAverageNumberOfDilutedSharesOutstanding → WeightedAverageNumberOfShareOutstandingBasicAndDiluted | all |
| `operating_cash_flow` | Operating cash flow | CF | flow | USD | NetCashProvidedByUsedInOperatingActivities → NetCashProvidedByUsedInOperatingActivitiesContinuingOperations | all |
| `capex` | Capital expenditure | CF | flow | USD | PaymentsToAcquirePropertyPlantAndEquipment → PaymentsToAcquireProductiveAssets (may include intangibles) | industrial, REIT |
| `dividends` | Dividends paid | CF | flow | USD | PaymentsOfDividends → PaymentsOfDividendsCommonStock → PaymentsOfOrdinaryDividends | all |
| `buybacks` | Share repurchases | CF | flow | USD | PaymentsForRepurchaseOfCommonStock → PaymentsForRepurchaseOfEquity | all |
| `cash` | Cash and cash equivalents | BS | balance | USD | CashAndCashEquivalentsAtCarryingValue → CashAndDueFromBanks → Cash → CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents (includes restricted cash) | all |
| `cash_sti` | Cash and short-term investments | BS | balance | USD | CashCashEquivalentsAndShortTermInvestments; else cash plus ShortTermInvestments, MarketableSecuritiesCurrent, AvailableForSaleSecuritiesDebtSecuritiesCurrent, AvailableForSaleSecuritiesCurrent, HeldToMaturitySecuritiesCurrent or OtherShortTermInvestments from one filing (any filing that has both parts); **not reported** when no filing has a short-term investment line, never cash alone | industrial |
| `assets` | Total assets | BS | balance | USD | Assets | all |
| `liabilities` | Total liabilities | BS | balance | USD | Liabilities; else LiabilitiesAndStockholdersEquity minus total equity including noncontrolling interest, minus temporary equity where tagged, from the same filing | all |
| `equity` | Shareholders' equity | BS | balance | USD | StockholdersEquity → StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest | all |
| `current_assets`, `current_liabilities` | Current assets and liabilities | BS | balance | USD | AssetsCurrent; LiabilitiesCurrent | industrial, REIT |
| `total_debt` | Total debt (borrowings) | BS | balance | USD | The best composition reported for the period in any filing, from the latest filing supporting it, in this order: DebtLongtermAndShorttermCombinedAmount; LongTermDebtNoncurrent (or LongTermDebtAndCapitalLeaseObligations) plus DebtCurrent; noncurrent plus LongTermDebtCurrent, plus ShortTermBorrowings or CommercialPaper where tagged; LongTermDebt alone when its current portion is tagged and no short-term borrowings are (LongTermDebt plus short-term borrowings is never summed, because it can count current maturities twice); DebtAndCapitalLeaseObligations (noted). Parts come from one filing; operating leases are never included. A value above total liabilities, or more than ten times away from the company's other years, is **withheld** and noted | all |
| `net_interest_income`, `noninterest_income`, `provision`, `deposits`, `loans` | Bank lines | IS / BS | | USD | InterestIncomeExpenseNet; NoninterestIncome; ProvisionForLoanLeaseAndOtherLosses → ProvisionForLoanAndLeaseLosses → FinancingReceivableCreditLossExpenseReversal; Deposits; LoansAndLeasesReceivableNetReportedAmount → FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss | bank |
| `premiums`, `net_investment_income` | Insurance lines | IS | flow | USD | PremiumsEarnedNet; NetInvestmentIncome | insurance |
| `real_estate` | Real estate investment property, net | BS | balance | USD | RealEstateInvestmentPropertyNet | REIT |

**Revenue exception.** Some companies report both contract revenue (`RevenueFromContractWithCustomer…`) and a larger total `Revenues` that includes leases or interest. Inside one filing, the larger total wins, and the cell says which subset it replaced.

**Per-share figures and splits.** A jump of 1.8 times or more in diluted shares between consecutive years marks a split, reverse split or large issuance (noted). EPS and share-count trends are shown only from that year on, and changes across it are not stated, because the figures before and after are on different bases. Negative-signed payments (capex, dividends, buybacks) are shown as payments, with a note.

**Indicators** (computed in the browser from the traced figures, never stored): gross margin, operating margin, net margin, R&D intensity, operating cash margin, free cash flow (operating cash flow − capital expenditure), FCF margin, cash conversion (operating cash flow ÷ net income, only when net income is positive), the Sloan accrual ratio ((net income − operating cash flow) ÷ average total assets), the profit-to-cash gap, current ratio, cash coverage, liabilities ÷ assets, debt ÷ equity, interest coverage (operating income ÷ interest expense), ROE (only when equity is positive in both years) and ROA on average balances, revenue growth and shareholder payout (dividends + buybacks, only when both are reported). A ratio with a zero or negative denominator is *not meaningful* and is not stated. Ratios that need the prior year use it only when the two periods are 300 to 430 days apart.

## Templates

| Template | Rule | Not supported (answered as "not supported for this template") |
| --- | --- | --- |
| Industrial | the default | bank, insurance and REIT lines |
| Bank / other financial | SIC 6000–6799 (except REITs and insurers), or no SIC, **and** no classified balance sheet (no `AssetsCurrent`) | gross profit, cost of revenue, R&D, SG&A, current assets and liabilities, capex, cash and short-term investments and the ratios built on them (gross margin, current ratio, FCF, FCF margin, cash conversion, accruals, debt ÷ equity, interest coverage), insurance and REIT lines |
| Insurance | SIC 6311–6399 or 6411 **and** no classified balance sheet | as for banks, plus bank lines |
| REIT | SIC 6798 | gross profit and gross margin, R&D, cash and short-term investments, bank and insurance lines |

The balance-sheet test keeps health insurers, insurance brokers, exchanges and payment networks with classified balance sheets (UnitedHealth, Visa) on the industrial template.

## Data-quality notes

Each shard carries notes written by the build, shown on the Financials page and answered by Ask ("any data issues with …?"):

- **missing**: a supported figure not reported under any tag in its chain, with the fiscal years;
- **fallback**: a figure read from a later tag in its chain, with the tag and years;
- **derived**: a figure composed from parts of one filing, with the rule;
- **restated**: under the same tag, the latest filing's value differs from the value first reported in the period's original 10-K (a restatement or reclassification); both values and accessions are given, and the later value is shown;
- **withheld**: a composed total debt that exceeds total liabilities or sits far from the company's other years is not stated;
- **split**: a diluted-share jump that changes the per-share basis;
- **conflict**: one filing reports two values for the same tag and period; no value is stated;
- **amended**: a value that comes from a 10-K/A;
- **fiscal shift / gap / label**: a change of fiscal year end, an uncovered gap between periods (a transition period or a missing 10-K), or a fiscal-year label taken from the end year;
- **template**: the template and what it does not support.

## Sector peer groups and the screen

The Screen page and Ask's sector percentile use a company's **peer group**: the most specific SIC level (four digits, then three, then two, then the SIC division) that has at least 10 screened companies. A company's peers are every screened company at that level. Percentile = (peers below + half of ties) ÷ peers with a value × 100, each peer on its own latest fiscal year. Banks and insurers are not screened, because cash conversion, accruals and FCF margin do not describe their statements.

## Download budget

| File | Raw | gzip | When it loads |
| --- | --- | --- | --- |
| `research.json` (deep ledger, unchanged) | 14.4 MB | 632 KB | first visit |
| `universe/index.json` (search, names, catalog) | 516 KB | 111 KB | first visit, in parallel |
| one company shard | median 41 KB, max 74 KB | about 4–6 KB | when a company is opened or asked about |
| `universe/screen.json` | 814 KB | 102 KB | only when the Screen page or a sector question needs it |

A first visit downloads the deep-ledger bundle and the index, then one shard for the default company: **about 750 KB compressed**. The whole universe is 79 MB on Pages; the site stays under 100 MB, well inside the 300 MB budget and GitHub Pages' 1 GB limit.

## Accuracy

The pre-registered check against the SEC Financial Statement Data Sets is described in [validation/ACCURACY_PROTOCOL.md](validation/ACCURACY_PROTOCOL.md) with its Addendum A (older years and identity checks). Results, all kept in `docs/validation/`: latest two years, third run `1d38946`: 798/798 verifiable cells match; older years, Addendum A second run `b3e1025` on data `5e55a21`: 679/679. Not met: fiscal labels (78/80 and 63/67; MongoDB and Yext, where FinScope follows the companies' own naming), statement placement in older years (2.6% against 2%), and 54 identity exceptions in 31,569 checks. The first runs, which failed on checker faults, are kept and described in [CHANGELOG.md](../CHANGELOG.md).
