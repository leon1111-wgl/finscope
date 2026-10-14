# Research behind the design

Primary-source screening, checked 14 October 2026. This is a focused design reading list, not a systematic review. None of the cited model results has been reproduced by this repository.

| Source | Design lesson | FinScope implementation |
| --- | --- | --- |
| Alejandro Lopez-Lira and Yuehua Tang, *Can ChatGPT Forecast Stock Price Movements? Return Predictability and Large Language Models*, [arXiv v6, 2025 revision](https://arxiv.org/abs/2304.07619v6) | A price reaction and an executable trading opportunity are different objects. | Separate forecast accuracy, information timing and delayed strategy returns. No ChatGPT baseline is claimed. |
| Yaxuan Kong et al., including Alejandro Lopez-Lira, *Evaluating LLMs in Finance Requires Explicit Bias Consideration*, [2026 position preprint](https://arxiv.org/abs/2602.14233) | Look-ahead, survivorship, narrative, objective and cost biases require distinct checks. | Provenance labels, fixed target, complete ablations and cost controls. Imported history is still unverified. |
| Lifan Zhao, Shuming Kong and Yanyan Shen, *DoubleAdapt: A Meta-learning Approach to Incremental Learning for Stock Trend Forecasting*, [KDD 2023](https://arxiv.org/abs/2306.09862) | Data adaptation and model adaptation address different aspects of market change. | Rolling Ridge refits and drift/error diagnostics. Learned adapters are future work, not implemented DoubleAdapt. |
| Abhimanyu Das, Weihao Kong, Rajat Sen and Yichen Zhou, *A decoder-only foundation model for time-series forecasting*, [ICML 2024, PMLR 235:10148–10167](https://proceedings.mlr.press/v235/das24c.html) | Pretrained forecasting is a useful comparison, with its own temporal provenance. | TimesFM is a candidate baseline only. Checkpoint date and data overlap must be audited before use. |
| Chen Xu and Yao Xie, *Conformal prediction interval for dynamic time-series*, [ICML 2021, PMLR 139:11559–11569](https://proceedings.mlr.press/v139/xu21h.html) | Time dependence matters for interval evaluation. | Separate past-residual calibration and observed coverage. FinScope is not EnbPI and inherits no theorem from it. |
| Haiqiang Chen et al., *Does Training on Future Data Pay? Look-Ahead Bias in Forecasting with Pretrained Models*, [2026 preprint](https://arxiv.org/abs/2609.20554) | Temporal exposure can invalidate a study even when its measured score worsens. | Audit clocks independently of performance. Recent preprint findings are not treated as settled consensus. |

## Questions for the next research iteration

1. Does a filing signal survive an event delay of one extra session? Predeclare the lag experiment and compare on the same rows.
2. Does the signal add value beyond volatility and momentum? Keep the price-only and historical-volatility controls.
3. Is a social effect explained by duplicated posts or missing source coverage? Record observed source coverage; never backfill current engagement into the past.
4. Do supplier links add out-of-time value? Start with lagged aggregate supplier features before a learned graph model. Separate documented links from inferred links and historical link revisions.
5. Does a model fail after a regime change? Compare fixed versus rolling fits on untouched chronological data; monitor calibration and error separately.
6. Does the result survive a broader universe and realistic execution? Include failed/delisted entities when relevant and test costs before interpreting Sharpe.

## Six areas, with honest delivery boundaries

| Area | Delivered | Next meaningful test |
| --- | --- | --- |
| Financial time series | 5/20-session volatility, rolling models, baseline | Authorized real universe and a frozen prospective evaluation |
| Factor fusion and risk | Price/filing/alternative/freshness ablations, intervals | Missing-source robustness and predeclared lag sensitivity |
| Alternative / high frequency | Timestamped daily social and supply events | Licensed intraday observations, exchange calendar and latency model |
| Strategy optimization | Fixed long/cash rule and cost sensitivity | Nested selection protocol and realistic execution; no test-set slider optimization |
| Financial NLP | Pairwise TF-IDF filing change and simple English lexicon | Versioned classifier with contamination and licensing checks |
| Financial networks | Dated descriptive supplier connections | Baseline neighbor aggregation before trained graph comparison |

The first release emphasizes a traceable research workflow. The future tests above are a roadmap, not completed features or promised performance.
