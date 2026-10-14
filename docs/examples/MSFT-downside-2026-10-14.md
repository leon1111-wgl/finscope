# MSFT · earnings quality and financial resilience

Prepared with FinScope by Leon Wang.

Requested date: 2026-10-14. Financial snapshot: 2026-10-14. Annual period end: 2026-06-30.

Dataset SHA-256: 687c425e48f615d0a3b460141fe5ff6114e518b01512e8d1fa8d2b6c3db1c735
Built: 2026-10-14T19:01:17.398317Z. Exported: 2026-10-14T19:14:07.346Z.

## Question

Does reported profit have cash-flow support, and what changes under a weaker operating scenario?

## Reported evidence (USD)

| Metric | Value | Period end | Filed | Source |
| --- | ---: | --- | --- | --- |
| revenue | 331,839,000,000 | 2026-06-30 | 2026-07-29 | [RevenueFromContractWithCustomerExcludingAssessedTax](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/) |
| net_income | 133,749,000,000 | 2026-06-30 | 2026-07-29 | [NetIncomeLoss](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/) |
| operating_income | 155,237,000,000 | 2026-06-30 | 2026-07-29 | [OperatingIncomeLoss](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/) |
| operating_cash_flow | 182,935,000,000 | 2026-06-30 | 2026-07-29 | [NetCashProvidedByUsedInOperatingActivities](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/) |
| assets | 758,376,000,000 | 2026-06-30 | 2026-07-29 | [Assets](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/) |
| liabilities | 315,989,000,000 | 2026-06-30 | 2026-07-29 | [Liabilities](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/) |
| current_assets | 207,710,000,000 | 2026-06-30 | 2026-07-29 | [AssetsCurrent](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/) |
| current_liabilities | 168,825,000,000 | 2026-06-30 | 2026-07-29 | [LiabilitiesCurrent](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/) |
| cash | 20,935,000,000 | 2026-06-30 | 2026-07-29 | [CashAndCashEquivalentsAtCarryingValue](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/) |
| capex | 115,948,000,000 | 2026-06-30 | 2026-07-29 | [PaymentsToAcquirePropertyPlantAndEquipment](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/) |

## Prior annual inputs for growth and average assets

Prior period end: 2025-06-30.

- revenue: 281,724,000,000 USD · filed 2026-07-29 · https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/
- assets: 619,003,000,000 USD · filed 2026-07-29 · https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/

## Ratios (decimal unless named ratio)

- operating_margin: 0.4678. Formula: Operating income / revenue.
- net_margin: 0.4031. Formula: Net income / revenue.
- cash_margin: 0.5513. Formula: Operating cash flow / revenue.
- current_ratio: 1.2303. Formula: Current assets / current liabilities.
- liabilities_assets: 0.4167. Formula: Liabilities / assets.
- cash_coverage: 0.124. Formula: Cash and equivalents / current liabilities.
- accruals: -0.0714. Formula: (Net income - operating cash flow) / ((current-year total assets + previous-year total assets) / 2).
- revenue_growth: 0.1779. Formula: Current annual revenue / previous annual revenue - 1.

## AI triage

Historical anomaly percentile: 83.9. Higher means more unusual, not greater default probability. 93 earlier company-years; period ends strictly before 2025-09-27. Latest training filing: 2026-07-29. Imputed target features: none.

## Scenario assumptions

- revenuePercent: -10
- marginPoints: -2
- refinanceBillions: 10
- rateBps: 100
- collectionDays: 15

## Scenario results (USD)

- stressedRevenue: 298,655,100,000
- operatingIncome: 133,740,198,000
- extraInterest: 100,000,000
- profitProxy: 133,640,198,000
- operatingChange: -21,496,802,000
- cashTiedUp: 12,273,497,260.274
- cashRemainingProxy: 8,661,502,739.726

Revenue = reported revenue × (1 + revenue change / 100). Operating income = scenario revenue × (reported operating margin + margin-point change / 100). Incremental interest = assumed refinancing exposure in billions × 1e9 × rate shock / 10000. Profit proxy = scenario operating income − incremental interest; it omits existing interest, tax and other income. Cash tied up = scenario revenue / 365 × extra collection days. These are mechanical assumptions, not a forecast.

## Follow-up work

- Operating cash flow exceeds net income. Check how much comes from recurring operations, non-cash charges and working-capital timing.
- Current assets exceed current liabilities. Check asset liquidity and the timing of obligations; the ratio alone cannot establish resilience.
- Read the latest quarterly filing and management discussion. This workspace uses annual accounts and does not cover every recent development.

## Treasury context

Observation 2026-10-13; 2-year 4.79%, 10-year 5.21%. These are Treasury rates, not this company's borrowing rates.

## Limits

- Filing-day reconstruction from currently retrieved CompanyFacts, not an archived point-in-time database.
- Annual accounts only; subsequent quarterly results are outside this review.
- Six selected surviving technology/platform businesses are not a market-representative sample.
- Anomaly percentiles describe unusual profiles, not fraud/default probabilities or investment returns.
- All stress results are user assumptions, not company forecasts.

## Source retrieval records

- AAPL: https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json · retrieved 2026-10-14T18:59:43.591315Z · SHA-256 73a86c6aedc31f77cac2ea4df5f80f0b3bd7e6eb58bb4e01444fbedf3afb9c43
- MSFT: https://data.sec.gov/api/xbrl/companyfacts/CIK0000789019.json · retrieved 2026-10-14T18:59:50.181260Z · SHA-256 f8aae2965b20ad0df44bdf7ccbedf797d275b6b8dc030154a7a311361bb7246f
- NVDA: https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json · retrieved 2026-10-14T18:59:56.533396Z · SHA-256 19ef503a5770f5660964b3c3aea6937579d9b359da344afe6a9adf59c63d26ff
- AMZN: https://data.sec.gov/api/xbrl/companyfacts/CIK0001018724.json · retrieved 2026-10-14T19:00:01.548593Z · SHA-256 7549fb68446eee40e1f50a166fa06b2d2ee6349e07c8553a4828757e032d3cd4
- GOOGL: https://data.sec.gov/api/xbrl/companyfacts/CIK0001652044.json · retrieved 2026-10-14T19:00:07.091746Z · SHA-256 a017f26ee88cb4a639d1c1ddb06d53b4afe22f0ac89cabec7cd67c88919fe1c5
- META: https://data.sec.gov/api/xbrl/companyfacts/CIK0001326801.json · retrieved 2026-10-14T19:00:13.588296Z · SHA-256 7518e76d6dac2d016e1a3d1dec1cc55ff9ea3bdd58a151b16fcaa067a6c9d94e
- treasury-2018: https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=2018 · retrieved 2026-10-14T19:00:20.081993Z · SHA-256 71ae7fd60321e71adad5742f2e93e8f9ea8a3c8c75ab93abe07bb804b8947361
- treasury-2019: https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=2019 · retrieved 2026-10-14T19:00:26.719226Z · SHA-256 59cff62db7c1436d031e6ff2285868a997a27427c98f0b14108659efa5d3fe98
- treasury-2020: https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=2020 · retrieved 2026-10-14T19:00:33.503090Z · SHA-256 8e369f1aafb88dcc93a2e5cf68dd3970954130d87d5d6701e9a326b53690f9d9
- treasury-2021: https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=2021 · retrieved 2026-10-14T19:00:40.194225Z · SHA-256 858a1db3ce49d3a3052b0ffb19c10abb671501a194c45fe7cfd89789358719d5
- treasury-2022: https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=2022 · retrieved 2026-10-14T19:00:46.596734Z · SHA-256 14fdbb16c13914dc2f69c5f311f1e5c2c81cf5e1f3bf3cd9937a1e4e96ca19f3
- treasury-2023: https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=2023 · retrieved 2026-10-14T19:00:53.156597Z · SHA-256 ea2847de5b05742f718a14ac6e91cabdd0942714f488fc3cba327597de1e87e7
- treasury-2024: https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=2024 · retrieved 2026-10-14T19:00:59.780873Z · SHA-256 fa4a1c6f865bcb5b7dd84fe41f27daf6c296484609cc20cbc3b6e98bc2334cd4
- treasury-2025: https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=2025 · retrieved 2026-10-14T19:01:06.187810Z · SHA-256 1d8918985fddb5d5ac5ac34b0ec67b0fda05eb8d65b2fc9000708a2f1ed0a0ff
- treasury-2026: https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=2026 · retrieved 2026-10-14T19:01:12.582287Z · SHA-256 2ac8234bda1936e9358c1cf0e7668862992bf61fa5cff747381eb9899cbfcac0
