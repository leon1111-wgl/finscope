# Methodology

## 1. Choose the question before the model

The target is **future volatility**, not tomorrow's closing price. Let adjusted close be $P_t$, and log return be $r_t=\log(P_t/P_{t-1})$. For horizon $h\in\{5,20\}$:

$$y_t=\sqrt{252}\sqrt{\frac{1}{h}\sum_{j=1}^{h}(r_{t+j}-\bar r_{t,h})^2}.$$

The mean $\bar r_{t,h}$ belongs only to the future label. It is never an input feature. A label becomes observable at its recorded `label_end`. The interface hides it before that date. An annualized value of 0.20 means 20% volatility, not a forecast of a 20% gain.

The historical baseline uses the past 20 log returns. Four fixed Ridge variants progressively add filing, alternative and freshness features. They use identical evaluation observations. This is an ablation study: more inputs must justify their complexity.

## 2. Reconstruct the information set

An event has three clocks: occurrence, public availability, and ingestion. Its usable time is:

$$u_e=\max(available\_at_e,ingested\_at_e).$$

Events with $u_e$ after **16:00 UTC** are deferred. This is an intentionally early information cutoff, not the exchange close. The price feature is observed after the actual U.S. regular or scheduled early close. Unscheduled closes, other markets and intraday strategies need a calendar adapter.

Filings contribute supplied revenue growth, pairwise TF-IDF cosine distance between the two latest usable filings, and age. A new vocabulary is built only from that usable pair. Social text is deduplicated within a trailing 30-day window and scored with a small English lexicon. Supply fields include reported delay days. Freshness features decay with age. These are simple measurable controls; their presence does not establish that a source is reliable or economically predictive.

Today’s downloaded history may contain revisions or survivors. An old publication date cannot prove that today’s exact bytes were available then. Imported results therefore state `unverified`. The SEC panel is separate and retains filing links, fact periods, units, retrieval time and raw-source hash. Selected duration and instant facts may refer to different periods; the UI does not invent ratios between them.

## 3. Fit on the past; calibrate separately

Long datasets use 360 training sessions, 80 calibration sessions and a 20-session refit step. Compact datasets use 120/40/20. Each boundary includes a horizon-length purge. The actual ticker label dates must also satisfy:

$$last\ training\ label < first\ calibration\ origin,$$
$$last\ calibration\ label < first\ test\ origin.$$

Median imputation and standardization fit training rows only. Ridge minimizes:

$$\sum_{i\in train}(y_i-b-x_i^\top w)^2+20\lVert w\rVert_2^2.$$

The intercept is not penalized. Predictions are clipped to [0, 3] in annualized decimal volatility. Hyperparameters, features and variants are fixed in code. They are not optimized on the displayed test scores.

Absolute calibration residuals $a_i=|y_i-\hat y_i|$ determine radius $q$: use the higher empirical quantile at $\min(1,\lceil0.9(n+1)\rceil/n)$. The interval is $[\max(0,\hat y-q),\hat y+q]$. This is a past-residual interval with nominal 90% coverage. Dependent, overlapping labels and distribution shifts prevent a general coverage guarantee. It is not an EnbPI reproduction.

## 4. Evaluate mistakes and changing markets

MAE is $n^{-1}\sum|\hat y-y|$; RMSE is $\sqrt{n^{-1}\sum(\hat y-y)^2}$. Bias averages $\hat y-y$. Coverage counts how often a matured label falls inside its interval. The interface reports errors in percentage points; a decimal error of 0.02 is 2 pp.

Rolling error and past-volatility strata reveal failures hidden by an aggregate score. Input PSI compares training and test feature-bin proportions, using training-derived bins. It is a distribution diagnostic, not proof that the prediction relationship changed. Thresholds 0.10/0.25 are heuristics. The displayed mean PSI aggregates the full historical run and is explicitly retrospective.

Rolling refits can respond to recent data but cannot prevent regime failure. Before a real deployment, record a final holdout, freeze selection rules, then evaluate prospective data. Repeated use of the public synthetic scenario is development work. It does not create independent economic evidence or correct for multiple strategy trials.

## 5. Translate risk to an inspectable strategy

The target position is $w_t^*=\min(1,0.20/\max(\hat y_t,10^{-6}))$. A forecast formed after close $t$ can first trade at close $t+1$ and first earn the return into close $t+2$. The series therefore uses a two-index lag.

For executed position $w_t$, simple asset return $R_t=P_t/P_{t-1}-1$, turnover $\tau_t=|w_t-w_{t-1}|$ and total cost $c$ basis points:

$$R_t^{net}=w_tR_t-\tau_t\frac{c}{10,000}.$$

Example: a 0.5 position earns 0.5% on a 1% asset return. Opening that position at 10 bps costs 0.05%. Net return is 0.45%. Fees and slippage sliders recompute this exact equation; they do not rerun the model.

Ticker sleeves receive equal daily weights. Portfolio daily return is their arithmetic mean, then wealth compounds as $\prod_t(1+R_t^{net})$. Incomplete multi-ticker evaluation panels are rejected. Buy-and-hold starts at the first evaluation close and pays an entry cost. Cash/risk-free rate is zero; terminal positions remain marked to market without forced liquidation.

Annualized strategy volatility is population daily standard deviation (`ddof=0`) times $\sqrt{252}$. Zero-cash-rate Sharpe is daily mean divided by daily standard deviation times $\sqrt{252}$. Maximum drawdown includes initial wealth 1. A nonpositive wealth factor or numeric overflow fails the run.

This daily-reset approximation costs changes in signal exposure. It omits price-induced equal-weight rebalancing turnover, market impact, spread dynamics, funding and broker fills. Cost sensitivity is useful research, not execution validation.

## 6. Preserve the audit trail

Each artifact stores the dataset fingerprint, seed, dependency versions, fixed configuration, split boundaries and all model variants. A selected-view export uses the chosen date, company, evidence type and costs. Its network explicitly retains all eligible relationship kinds, as in the chart. The original-run export retains the full retrospective artifact.

A future LLM or pretrained time-series baseline must also record model revision, training cutoff, retrieval-index vintage and overlap checks. Poor performance cannot make leaked information acceptable. See [research sources](RESEARCH.md) and the [exact schema](DATA_CONTRACT.md).
