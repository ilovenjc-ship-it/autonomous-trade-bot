# Active Portfolio Management: A Quantitative Approach for Producing Superior Returns and Controlling Risk
**Grinold & Kahn · McGraw-Hill 2nd ed. 1999 · ~621 pp · ISBN 0-07-024882-6**

## Why it matters to Ari

This is the canonical textbook the Donadio/Ghosh Ch 10 sketch was summarizing. Two of its
chapters (Ch 5 *Information Ratio* + Ch 6 *Fundamental Law*) are the theoretical foundation
under our just-shipped Sharpe Contract; one chapter (Ch 14 *Portfolio Construction*) is the
operational manual for the Markowitz step queued behind D-22; and Ch 12 (*Information
Analysis*) gives us the formal apparatus to measure **IC** (information coefficient) on every
strategy in the Fleet — turning "is this strategy adding value?" from a small-sample-Sharpe
guess into a measurable correlation between forecast and realized residual return. The
book's distillation of active management into seven insights (preface p.xii) reads as a
near-perfect alignment audit of Project Ari: insights 2 (*IR is the key to value-added*),
3 (*IR ≈ IC × √breadth*), 4 (*alpha = volatility · IC · score*), 6 (*implementation should
subtract as little value as possible*), and 7 (*distinguishing skill from luck is difficult*)
each map to load-bearing decisions we've already made or are about to make. **Note one
caveat upfront:** the formal "transfer coefficient" Mark referenced is NOT in this 1999
edition by name — that term came from Clarke / de Silva / Thorley 2002, and is the natural
sequel paper. The mechanics are all here (Ch 14 Table 14.1 shows constraints shrinking
realized IC by 62%) but the named coefficient and its closed-form treatment is post-1999.

---

## Top 5 Lifts (ranked by leverage)

### 1. Fundamental Law of Active Management — `IR ≈ IC × √breadth` — operationalize the Sharpe Contract
**(Ch 6, p147–161)**

THE equation. For Project Ari this is the most leveraged single concept in the book, because
it converts our Sharpe Contract from a measurement scaffold into a **diagnostic and design
tool**. Every strategy in the Fleet has an implied IC (correlation between its signal and
realized PnL) and an implied breadth (independent decisions per year). Once we measure
both, we can:

- **Diagnose the Mean Reversion failure properly.** 26.6% WR / 79 trades is a *symptom*.
  The diagnosis is whichever of (low IC, low breadth, or correlated bets posing as
  independent) is binding. Cure differs per cause.
- **Sanity-check small-sample Sharpe claims.** IC=0.0577 → 52.9% directional accuracy →
  IR > 1.0 with sufficient breadth (p153–154). The book gives concrete IC calibration
  thresholds (p272): **IC = 0.05 good, 0.10 great, 0.15 world-class, IC > 0.20 = "faulty
  backtest or imminent investigation for insider dealing."** Any per-strategy IC we compute
  above 0.15 should be treated as a backtest-overfitting flag, not a victory.
- **Surface the "12 strategies but how many independent bets?" question.** Book quote
  (p158): *"If you reassess your industry bets each year but rebalance monthly, you don't
  make 12 industry bets per year. You just make the same bet 12 times."* Project Ari runs
  on 5-min cycles. Number of *independent* decisions per year ≪ number of cycles. Breadth
  measurement requires correlating consecutive-cycle signals per strategy and counting
  effective independent decisions — not gross trade count.

**Implementation hint:** Wire IC measurement into the existing per-strategy PnL pipeline.
For each strategy, regress per-trade `realized_residual_return` on per-trade
`signal_strength`. The regression β-coefficient times signal-volatility ratio is IC. For
breadth, compute the autocorrelation of consecutive-cycle signals and apply
`effective_breadth = N_cycles × (1 − ρ) / (1 + ρ)` as a rule-of-thumb deflator. Display IC
and breadth alongside Sharpe on Risk Config — they are the *components* of Sharpe, not
alternatives.

### 2. Markowitz done right (Ch 14) — the operational manual for D-22
**(Ch 14, p377–417)**

D-22 already filed as a forward-warning. Ch 14 is the playbook. Ranked tested results
(Table 14.3, p399–400) on a 12-strategy portfolio (which is structurally identical to our
Fleet's shape):

| Method | Avg ex-post IR | StdDev | Notes |
|--------|---------------|--------|-------|
| Screen I (equal-weight top-N) | 0.86 | 0.27 | Worst — what we *aren't* doing now |
| Screen II (cap-weight top-N) | 1.10 | 0.79 | Volatile, lucky once at 2.24 |
| Stratification | 1.27 | 0.89 | Single best run (2.82) but inconsistent |
| **Quadratic Programming (Markowitz)** | **1.88** | **0.40** | **Wins on average AND consistency** |

QP target was 2.24 (theoretical from `IC=0.1 × √500 = 2.24`). None of the methods hit it.
**Constraints alone shrunk IC by 62%** (p382, comparing original alpha SD 2.00% vs
modified alpha SD 0.57%). This is the empirical foundation of the transfer-coefficient
concept — even before Clarke/de Silva/Thorley 2002 named it.

**Three Markowitz ingredients Project Ari currently lacks:**
- **Covariance matrix of strategy returns.** Need at minimum a 12×12 covariance over
  paper-trading PnL. Probably needs 6+ months of live data to be trustworthy. Book warning
  (p397): *"Errors in the estimates of covariance lead to inefficient implementation"* —
  optimizer EXPLOITS noise, the opposite of what we want.
- **λ (active risk aversion).** Solve the inverse: `λ = IR / (2 · ω*)`. If our target
  Fleet IR = 1.0 and target Fleet active-risk = 5%, then λ = 0.10 (p388). Dimensional
  consistency check: book uses percent units, not decimals.
- **Constraint plumbing.** Long-only is structural for us (we don't short on Bittensor),
  position caps live in `risk_config.json`, turnover budget should be derived from t-cost
  amortization (annualized cost = round-trip / holding period in years, p387).

**Implementation hint:** *Don't* skip the input-quality step before standing up an
optimizer. Ch 14 reads as a sustained warning that QP is the *best* method given clean
inputs and the *worst* method given dirty inputs. Build the covariance estimator and a
sanity test (estimated vs realized vol) for at least one quarter before any solver runs.

### 3. Ex-post IR = t-statistic / √Y — small-sample Sharpe is a t-statistic problem
**(Ch 5, p112; Ch 12, p327)**

Project Ari has small samples (Vol-Arb n=18, Mean-Rev n=79). The Sharpe Contract dimension
#5 (display-first, soft-gate after sufficient live trades) is correctly worded but doesn't
specify *what* "sufficient" means. Grinold/Kahn give us the formal answer:

> *"The ex-post information ratio is related to the t statistic one obtains for the alpha
> in the regression. If the data in the regression cover Y years, then the information ratio
> is approximately the alpha's t statistic divided by the square root of Y."* (p112)

Therefore: **IR_observed × √Y = t-statistic.** A 1-year IR of 0.5 has t = 0.5 — not even
close to the conventional 2.0 significance threshold. A 5-year IR of 0.5 has t = 1.12 —
still not significant. To distinguish IR = 0.5 from zero with t = 2, you need **Y = 16
years** of data.

**Recast for Project Ari (per-trade unit, our locked dimension #3):** standard error of
observed IR is approximately `1/√Y` annualized, equivalent to `1/√n_trades` in per-trade
units. Mean Reversion at n=79 trades has IR standard error ≈ 1/√79 ≈ 0.11. So an observed
Mean-Rev IR of −0.3 has |t| ≈ 2.7 — *that* is statistically significant evidence the
strategy is broken, separate from the win-rate p-value already cited.

**Implementation hint:** "Sufficient live trades" should mean: "enough trades that
`|observed_IR| × √n_trades > 2`." This becomes a soft-gate trigger in the Sharpe Contract
without changing any of the five locked dimensions. It just operationalizes dimension #5.

### 4. Alpha refinement: scale, trim, neutralize before construction
**(Ch 14 §"Alpha Analysis", p381–385)**

Project Ari currently feeds raw strategy signals into Fleet Consensus (a vote count). When
we move to weighted allocation (D-22), the equivalent of "alpha" enters the pipeline. Book
prescribes three pre-construction refinements:

- **Scale: `Std{α} ≈ volatility · IC`** (p382). Concretely: if our typical residual
  volatility per cycle is 2% and our IC is 0.05, our alpha SD should be 10 bp. Alphas
  arriving with SD an order of magnitude off should be rescaled before any optimization.
  (Equivalent to D-Q/G's "alphas need scaling" technical-appendix Proposition 6.)
- **Trim outliers at 3× scale** (p382). Pull anything beyond 3× scale to 3× scale, or
  zero it if data is questionable. Prevents single-stock optimizer dominance — analog for
  us is preventing a single strategy with a momentary spike from dominating the Fleet
  weight allocation.
- **Neutralize: benchmark-, cash-, factor-neutral** (p383–385). If our alphas are not
  HODL-benchmark-neutral, the Fleet will inadvertently take a directional bet on TAO. Ch 14
  shows how `α_neutral = α − β · α_benchmark` enforces benchmark neutrality.

**Implementation hint:** This sits in a *new* layer between strategy signal generation and
Fleet allocation. Doesn't touch Day 8 invariants (regime classifier, RSI warmup, etc.).
Lands as a `signal_refinement.py` service called downstream of strategy signal output and
upstream of Fleet aggregation.

### 5. Information horizon & half-life — operationalize "rebalance frequency"
**(Ch 13, p347–366)**

Project Ari runs 5-min cycles uniformly across all 12 strategies. Book argues this is
almost certainly suboptimal: every signal has its own *half-life*, the time at which its IR
drops to 50% of immediate-implementation value. **A momentum signal with 1-day half-life
and a fundamental signal with 6-month half-life should NOT rebalance on the same clock.**

Three concrete results from Ch 13:
- **Half-life is a strategy-intrinsic property** (p348). Temporal manipulations
  (averaging, lagging) change performance but DO NOT change the half-life. So the question
  isn't "what frequency would optimize this strategy?" — it's "what is this strategy's
  half-life, and are we paying for cycles past it?"
- **Value-added decays at HALF the IR's half-life** (p348–349). VA ∝ IR², so if IR
  half-life is 1 year, value-added half-life is 6 months.
- **Best signal-horizon match: rebalance interval ≈ 2× half-life** (p361, footnote 9 —
  function `√x · e^(−x · ln 2)` peaks at x = 1.257). This is a precise, derivable answer to
  "how often should this strategy rebalance?"

**Implementation hint:** Day 14 Item 1 (Fleet WR 33.5% vs TAO +3% divergence) might have a
half-life-mismatch component buried in it. If Mean Reversion's signal has a half-life of
6 hours and we're rebalancing on 5-min cycles, we're churning t-costs against fresh-signal
noise. *Suggestion (not yet a directive):* during Day 14 Item 1 reading, pull
per-strategy autocorrelation-of-signals over the last 30 days. ρ → half-life via
`HL = log(0.5) / log(ρ)`.

---

## Full Lifts (the long list)

### Ch 4 — Exceptional Return, Benchmarks, and Value Added (skimmed)
- **Value Added objective: `VA = α − λ · ω²`** (p119). λ is residual risk aversion. Aligns
  with our Sharpe-target slider semantics — the slider is implicitly choosing a `(IR, λ)`
  pair, with the band gradient encoding aggressiveness.
- **Risk-free portfolio and benchmark both have `α = 0` by construction** (p111). For
  Project Ari, HODL is the benchmark (Sharpe locked dim #2). Therefore HODL-relative
  alpha is the only quantity worth measuring — TAO-absolute returns confound benchmark
  drift with strategy skill.

### Ch 5 — Information Ratio (full read)
- Empirical IR distribution (Table 5.1, p114): 90th=1.0, 75th=0.5, 50th=0.0, 25th=−0.5,
  10th=−1.0. *"Top-quartile manager has an information ratio of one-half. That's a good
  number to remember."* Generic distribution holds across asset classes.
- Empirical equity IR distribution (Table 5.6, p130): top-quartile institutional = 0.63
  before fees. After-fees distribution shifts down by ~0.15.
- IR depends on horizon: scales as √horizon. Quarterly IR = annual IR / 2; monthly =
  annual / √12 (p117, Proposition 5 p144).
- **IR is independent of aggressiveness level** (p116). Our slider scales λ, not IR. This
  is doctrinally consistent with our Sharpe Contract.
- **Optimal residual risk: `ω* = IR / (2λ)`** (p123). Inversion: `λ = IR / (2ω*)`.
  Concrete: Sharpe target 75 ≈ IR=1.0, target ω*=5% → λ=0.10 ("moderate" in book).
- **Value Added at optimum: `VA* = IR² / (4λ)`** (p124). Quadratic in IR — small IR
  improvements compound.
- *"Every investor seeks the strategy with the highest IR. Different investors will differ
  only in how aggressively they implement the strategy."* (p125) — meta-validation of why
  the IR is the universal currency.
- Alphas often need rescaling: book provides `IR0 = √(α^T · V^−1 · α)` calculation; if
  IR0 is unreasonable (say 2.46), rescale alphas by `IR_target / IR0` (p144).

### Ch 6 — Fundamental Law of Active Management (full read)
- `IR ≈ IC × √BR` (p148). To go from IR=0.5 to IR=1.0: double IC, quadruple breadth, or
  combine.
- **IC = 2·N₁/N − 1** for binary directional forecasts (p153). IC = 0.0577 → 52.9%
  directional accuracy. IC = 0.02 → 51% accuracy + breadth 800 → IR = 0.56.
- **Additivity: `IR_total² = Σ IR_i²`** (p155). Independent strategy/source contributions
  add in squared-IR units. Sponsor with managers at IR 0.75, 0.50, 0.30 → composite IR =
  √(0.75² + 0.50² + 0.30²) = 0.95.
- **Independence is critical.** Same signal repackaged twice = single bet, not double
  breadth (p158). Test for dependence by regressing forecasts against firm/sector
  attributes and checking residuals.
- **Dependent sources:** `IC²(combined) = 2·IC² · (1−γ) / (1−γ²)` where γ is
  inter-source correlation (p159).
- **NOT the law of large numbers** (p160). IR is the same at BR=10 or BR=1000. Breadth
  diversifies *active risk* and lets us scale up λ, but doesn't change skill itself.
- Tests of the law (p161): realized IR statistically indistinguishable from theoretical
  prediction. Constraints (no shorting) reduce realized IR.

### Ch 10/11 — Forecasting Basics & Advanced Forecasting (skimmed)
- **The forecasting rule of thumb: `α = volatility · IC · score`** (p267). Insight #4 in
  the seven-insight summary. Score has mean 0, std 1; IC is dimensionless skill measure;
  volatility carries the dimension of return.
- **Volatility scaling intuition** (p268): "If utility stock and Internet stock both
  appear on a buy list, both expected to rise. Internet stock (more volatile) should rise
  more." Project-Ari analog: high-vol subnets get larger position sizing per unit of score.
- **IC calibration thresholds** (p272): good=0.05, great=0.10, world-class=0.15.
  IC > 0.20 → faulty backtest. Filed below as Vocabulary candidate V-3.
- **Combining N forecasts:** uncorrelated → `IC²(combined) = Σ IC_i²`; correlated →
  reduces redundant signal weight (p269–270). Mathematical equivalent of factor
  decomposition.

### Ch 12 — Information Analysis (full read)
- IC = correlation(forecast, realized residual return). Bounded [−1, +1]. IC=0 means
  pure noise (p327–328).
- **Two-step measurement process:** (1) turn predictions into portfolios; (2) evaluate
  portfolio performance (p318). Six procedures; book recommends procedure 5 or 6 (factor
  portfolios with controls) because they isolate signal from incidental bets.
- **t-statistic ≈ IR × √Y** (p327). Book: *"Do not let this close mathematical
  relationship obscure the fundamental distinction. The t statistic measures statistical
  significance; the information ratio captures the risk-reward trade-off."*
- IR standard error ≈ 1/√Y (p327 footnote 3). Filed below as Lift #3.
- **Event studies for episodic information** (p329). Methodology: regress
  `θ_n(1,j)/ω_n(1,j)` on conditioning variables `X_nk`. Direct application: dTAO subnet
  events (registration, halving, governance vote) as candidate event-study material.
- **Effective breadth for episodic events: `N* ≈ N · 2p / (1 + p)`** where p = daily
  event probability (p332). Rare events ⇒ effective breadth far below nominal universe.
- **Data mining is the bane of information analysis** (p334). Specifically: (a) testing
  many signals, the *expected* best looks great by chance; (b) backtests confound
  in-sample fitting with out-of-sample skill. The 95% confidence claim of any single
  backtest is meaningless if 100 signals were tested before the lucky one was reported.

### Ch 13 — Information Horizon (full read; covered in Lift #5 above)

### Ch 14 — Portfolio Construction (full read; core in Lift #2 + #4)
- **Modified-alpha trick** (p379): any constrained optimization is equivalent to
  unconstrained optimization with shrunken alphas. Constraints can be replaced by
  rescaling.
- **Practical λ from `IR / (2ω*)`** (p388). Same formula as Ch 5; restated in the
  optimization-implementation context.
- **t-cost amortization rule** (p387): annualized cost = round-trip cost / holding
  period in years. Project Ari's holding-period varies per strategy, so t-cost amortization
  must be per-strategy, not global.
- **Aversion to specific vs common-factor risk** can differ (p388). Two reasons to
  penalize specific risk more: (a) reduces single-asset blowup risk; (b) reduces
  cross-account dispersion.
- **Mean/variance dominates alternative risk measures (kurtosis, semivariance, downside
  risk) for institutional managers** (p400–402). Two-part argument: Kahn/Stefek 1996 (asset
  selection) + Grinold 1999 (asset allocation). Confirms Sharpe-as-canonical was the right
  call; doesn't argue against displaying alternative measures, just against optimizing on
  them.
- **Dispersion** (p402–408): different accounts running same strategy diverge from
  cash flows + transaction costs. *Some dispersion is optimal* given non-zero t-costs;
  zero-dispersion requires excess trading. For Project Ari this is forward-context for
  paper/live cohort split (Sharpe lock dim #4) — paper and live are inevitably "dispersed"
  even running identical signals.

### Ch 16 — Transactions Costs (skimmed)
- Average active US equity manager underperforms S&P 500 by 1–2% per year (p445), and
  Treynor's argument: this can ONLY be due to t-costs. *"A top-quartile manager with an
  information ratio of 0.5 may lose roughly half her returns because of transactions
  costs."* (p445) Forward-relevant for Project Ari: we operate inside an AMM with
  k-preserving slippage; pre-trade simulator already models this.
- T-cost components: commissions, bid/ask spread, market impact, opportunity cost (p446).
  For us: AMM slippage replaces bid/ask spread + market impact (k-curve combines both into
  a single function).
- *"You can often achieve at least 75 percent of the value added with only half the
  turnover (and half the transactions costs)"* (p446). Forward-relevant for any future
  rebalance-frequency reduction.

---

## The Fundamental Law of Active Management — DEEP DIVE

### What IC actually measures

`IC = Corr(forecast_α, realized_residual_return)` — a number in [−1, +1]. Not a percentage,
not a ratio, just a Pearson correlation. The interpretation is concrete:

- **IC = 0:** pure noise, forecast and realization are unrelated
- **IC = 0.05:** "good" forecaster (book p272). 51.4% directional accuracy. Forecasts
  contain 0.25% of the variance of realized returns.
- **IC = 0.10:** "great" forecaster. 52.9% directional accuracy.
- **IC = 0.15:** "world-class." 54.3% directional accuracy.
- **IC > 0.20:** *"a faulty backtest or imminent investigation for insider dealing"* —
  the book's guardrail against overfitting.

For Project Ari, the per-strategy IC is computable directly from the existing schema:
join `signals` table (per-cycle strategy signal strength) against
`paper_trades`/`live_trades` (realized residual return = trade PnL − HODL benchmark over
trade window). Pearson correlation across the joined rows = strategy IC.

### What "breadth" means and how it counts

Breadth is the number of *independent* forecasts per year. The independence qualifier is
the trap. The book's clearest example (p158):

> *"If you reassess your industry bets each year but rebalance monthly, you don't make
> 12 industry bets per year. You just make the same bet 12 times."*

For Project Ari with 5-minute cycles → 105,120 cycles/year per strategy. Naively
multiplied by 12 strategies = 1.26M decisions/year. But the *effective* breadth is much
lower:

- Same strategy on consecutive cycles ≈ same bet most of the time. Effective breadth
  per strategy = `cycles_per_year × (1 − ρ_signal_autocorrelation)` to first order.
- Strategies that share input features (RSI-based and macro-correlation-based both react
  to BTC-vs-TAO) are not fully independent. Pairwise correlation matrix among strategy
  signals shrinks effective breadth.

A measurement-quality estimate for our breadth probably falls in the **300–3000 effective
bets/year** range across the whole Fleet, not the gross cycle count.

### Where Project Ari has IC measurable, and where breadth is measurable

| Quantity | Measurable today? | Source |
|----------|-------------------|--------|
| Per-strategy IC | Yes — joinable from existing tables | `signals` × `paper_trades` |
| Per-strategy signal autocorrelation ρ | Yes — single SQL lag join | `signals` table |
| Pairwise inter-strategy signal correlation | Yes — pivot + correlate | `signals` table |
| Effective per-strategy breadth | Computable from above three | Derived |
| Realized IR per strategy | Yes — already implicit in Sharpe metric | `paper_trades` |

So we can validate `IR_observed ≈ IC × √BR_effective` end-to-end on existing data, with
zero new instrumentation.

### The "transfer coefficient" extension

Not formally in this 1999 edition (named in Clarke/de Silva/Thorley 2002, *"Portfolio
Constraints and the Fundamental Law of Active Management,"* Financial Analysts Journal). The
concept is here in mechanism, not in name. The full formula is:

> `IR_realized = TC × IC × √BR`
> 
> where `TC = Corr(α_constrained, α_unconstrained)` ∈ [0, 1]

TC measures how much of theoretical IC survives the constraints (long-only, position caps,
turnover limits, etc.). G/K Ch 14 Table 14.1 (p380): example constraints shrunk realized
alpha SD from 2.00% to 0.57%, implying TC ≈ 0.285 — i.e., **the constraints destroyed 71.5%
of theoretical IC.** That's the transfer coefficient at work without the name.

For Project Ari: `risk_config.json` (max_drawdown_pct, max_position_size_pct,
min_confidence_score) IS our constraint set. Each constraint individually contributes a
factor to TC. The Sharpe panel's drift heuristic (aligned ≤5pts / partial ≤15 / divergent
>15) is implicitly tracking TC drift between guardrails and the implied target.

### Concrete proposal for what Project Ari would compute and display

Three new metrics, behind feature flag, after Sharpe-metric implementation lands:

1. **Per-strategy IC** — Pearson correlation of signal vs realized residual return.
   Display alongside Sharpe on the per-strategy detail card.
2. **Per-strategy effective breadth** — `n_cycles × (1 − ρ_signal)`. Display as
   "effective independent bets per year."
3. **Fleet TC (transfer coefficient)** — ratio of constrained Markowitz α-SD to
   unconstrained α-SD. Single Fleet-level number; displays "constraint cost" in IC units.
   Equivalent to Risk Config drift but expressed in the Fundamental Law's currency.

Per D-23: this proposal is descriptive (what to compute and display); operator green-light
required for the prescriptive question of *whether* to display, since it materially changes
what the Risk Config panel looks like.

---

## Information Ratio vs Sharpe Ratio — what's the relationship

Definitionally:

- **Sharpe Ratio:** `SR = (R_portfolio − R_riskfree) / σ_portfolio`. Excess return over
  risk-free, scaled by total volatility.
- **Information Ratio:** `IR = (R_portfolio − R_benchmark) / σ_residual`. Active return
  over benchmark, scaled by *residual* (benchmark-orthogonal) volatility.

The two are mathematically related (Ch 5 Proposition 1, item 8, p137):

> `SR_optimal² = SR_benchmark² + IR_max²`

i.e., maximum Sharpe = √(benchmark Sharpe² + max IR²). They contain different information.

### For Project Ari: HODL is both the risk-free floor AND the benchmark

This is a happy coincidence — our Sharpe Contract dimension #2 (HODL as risk-free floor)
and the benchmark in the IR sense **collapse to the same baseline**. Therefore:

- **For us, Sharpe and IR converge** when the numerator is `excess_return_over_HODL` (which
  is what our Sharpe Contract already specifies). The denominator distinction (total vs
  residual volatility) collapses too, because HODL is the benchmark — any portfolio
  variance that's perfectly correlated with HODL is itself benchmark-tracking, which we
  define out of "active risk" by setting HODL as the benchmark.
- The remaining distinction is the **β=1 constraint**. IR formally requires β=1 to
  benchmark; Sharpe does not. Our Fleet has implicit β-to-HODL of approximately 1
  (we trade TAO and dTAO subnets, which co-move with TAO HODL almost by definition), so
  the constraint is approximately satisfied without enforcement.

### Should the Risk Config panel display IR alongside Sharpe?

**Recommendation: no, not as a separate metric. Yes, as a relabel.** The number the panel
currently calls "Sharpe" is mechanically *both* Sharpe and IR for our specific design
(HODL as benchmark and risk-free floor simultaneously). Adding a second number would be
duplicative for the operator and confusing on the Sharpe Contract.

**However — IC and breadth ARE distinct from Sharpe and ARE worth surfacing.** They are
the *components* of Sharpe via the Fundamental Law, not alternatives. Display proposal
(per Lift #1):

```
Per-strategy detail card:
  Sharpe (= IR for HODL-benchmark)    1.04
  IC (skill)                          0.062  · "good"
  Breadth (effective bets/yr)         287
  Implied IR (IC × √breadth)          1.05  · matches observed (good calibration)
  Drift                               aligned
```

If observed IR diverges materially from `IC × √breadth`, that drift is itself a
diagnostic — Day 14 Item 1 type signal that something is structurally off (bad signal
calibration, hidden correlations destroying breadth, or constraint cost burning realized
return).

---

## Markowitz done right (Ch on Portfolio Construction) — DEEP DIVE

D-22 is the forward-warning. This section is the operational manual.

### Shrinkage covariance — what does the book recommend?

**The book does NOT formally recommend Ledoit-Wolf** (which was published in this exact
form in 2003, four years post-2nd-edition). What G/K p397–398 prescribes instead is
**multi-factor structural risk models** (the BARRA approach — Barr Rosenberg's lineage,
and the institutional ancestor of Ledoit-Wolf shrinkage):

> *"Errors in the estimates of covariance lead to inefficient implementation. […] It is
> vital to have good estimates of covariance. Rather than abandon the attempt, try to do a
> good job."* (p398)

The reasoning is identical to Ledoit-Wolf's: a sample covariance matrix of N×N entries
estimated from T<N×N return observations has rank deficiency and noise the optimizer will
exploit. Structure (factor model) reduces the number of parameters to estimate from
N(N+1)/2 to roughly N×K + K(K+1)/2 where K is the number of factors. For our N=12
strategies, sample covariance is "only" 78 parameters — not as catastrophic as the
N=500 institutional case, but with paper-trading sample sizes ~30-700, still noisy.

**Practical recipe for Project Ari** (synthesizing book + post-1999 standard practice):

1. **Pure sample covariance is OK for 12×12** if we have ≥250 trade-pair observations
   per strategy pair. We probably don't yet. Don't ship Markowitz on noise.
2. **Equal-correlation prior shrinkage** (Ledoit-Wolf 2003 single-factor variant):
   `Σ_shrunk = δ · F + (1 − δ) · Σ_sample` where F is a constant-correlation matrix and
   δ is optimally chosen. Cheap to implement, dramatic improvement for small samples.
3. **Eventually — full BARRA-style structural model** with regime-conditional factors.
   Far down the road.

### Risk-aversion parameter λ

`λ_active = IR_target / (2 · ω*_target)` (p388). Practical numbers:

| Sharpe Target | IR | ω* target | λ_active |
|---------------|-----|-----------|----------|
| 50 ("good") | 0.50 | 5% | 0.05 ("aggressive") |
| 75 ("very good") | 0.75 | 5% | 0.075 ("moderate-aggressive") |
| 100 ("exceptional") | 1.00 | 5% | 0.10 ("moderate") |

The slider is implicitly setting a `(IR_target, λ)` pair at fixed `ω*=5%`. This is
internally consistent — the slider position is the lever, λ is the optimizer parameter.

### Constraint handling

Project Ari constraints, mapped to G/K language:

| Project Ari constraint | G/K equivalent | TC cost |
|------------------------|----------------|---------|
| Long-only (no shorting on Bittensor) | Long-only constraint | Significant — Ch 15 entirely on this |
| `max_position_size_pct` | Position cap | Mild for small N, severe at low diversification |
| `max_drawdown_pct` (auto-demote) | Risk-of-ruin constraint | Asymmetric — punishes downside paths |
| `min_confidence_score` | Signal-quality threshold | Reduces breadth by truncating low-IC trades |
| Regime gates (some strategies) | Conditional trading | Reduces breadth if signal would have fired |

Each constraint contributes a factor to TC. We can backsolve TC by running a constrained
and an unconstrained Markowitz solution on the same alphas and computing the correlation
of the two active-holdings vectors. Difference between observed and theoretical IR =
`(1 − TC) × IC × √BR` is the cost-of-constraints in IR units.

### Practical workflow when Fleet Consensus evolves off Uniform

Mark's wording in the Library introduction list: *"Skip M2 (PnL-only) entirely."* Ch 14
agrees, and gives the language: PnL-weighted weighting takes Markowitz out at the knees by
ignoring covariance entirely, and Test 14.3 (p399) shows the result — Screen II
(cap-weight + PnL-rank top-N) had the highest single result (2.24) but wildly inconsistent
performance and the second-highest standard deviation across backtests. Stage gates:

1. **Today: Uniform** (12 strategies, equal vote). Fine until measurable IC stabilizes.
2. **Stage 2: Sharpe-weighted with shrinkage prior.** Sharpe per strategy → softmax →
   weights. Equivalent to PnL-Sharpe in Donadio/Ghosh, more numerically stable. Doesn't
   require covariance. Earn this stage by passing the soft-gate criterion in Lift #3
   (`|IR| × √n_trades > 2`).
3. **Stage 3: Markowitz with shrinkage covariance.** Earn this stage by demonstrating the
   covariance estimate is stable across rolling 60-day windows (variance of the smallest
   eigenvalue < 25% of its mean).
4. **Stage 4: Regime-Predictive (D-Q/G Ch 10 §"Portfolio Optimization" highest-ranked
   method).** Earn this stage by demonstrating the structural risk model has predictive
   validity (forecast vol vs realized vol R² > 0.4 over 6+ months).

Each stage is bounded by a measurable gate. No stage-skipping. This is the warmup-gate
doctrine (Day 8 INV-1) applied to portfolio construction itself.

### Cross-Library tension: López de Prado argues HRP replaces Markowitz at Stage 3

The companion Library entry at `MemoryBank/Library/advances-in-financial-machine-learning.md`
(López de Prado 2018) Lift #4 takes a strong position **against** Markowitz at this stage,
in favor of **Hierarchical Risk Parity (HRP, Ch 16 of that book)**. The argument is
empirically grounded, post-1999, and worth taking seriously:

1. **"Markowitz's curse"** — high-correlation environments (which Project Ari has, since
   our 12 strategies trade the same TAO/dTAO instrument set and share many regime signals)
   are precisely where Markowitz's matrix inversion is most numerically unstable, and most
   in need of diversification. The two needs collide.
2. **Equal-weight beats Markowitz out-of-sample** (DeMiguel et al. 2009, cited p223 of
   López de Prado) — meaning Project Ari's current Uniform allocation is not as wrong as
   "worst possible" framing suggests; stepping to PnL-weighted (already filed D-22 to
   skip) would be worse than staying Uniform.
3. **HRP works on singular covariance matrices** — doesn't require positive-definiteness,
   which our small-sample paper-trading covariance won't have for a long time.
4. **HRP delivers lower out-of-sample variance than Markowitz's CLA on the
   minimum-variance objective itself** — the metric Markowitz was *designed* for.

**Resolution (filed for forward decision, NOT this commit):** the Markowitz roadmap stage
in this entry's "Practical workflow" should likely be *replaced* with HRP, making the
progression `Uniform → Sharpe-weighted → HRP → Regime-Predictive`. **However**, the rest
of Grinold/Kahn's machinery — IC measurement (Lift #1), small-sample t-stat calibration
(Lift #3), alpha refinement (Lift #4), half-life rebalancing (Lift #5), λ parameterization,
modified-alpha trick, dispersion analysis — remains complementary to HRP, not competing
with it. HRP replaces the *optimizer*, not the *signal preparation pipeline*.

**Why I'm not unilaterally rewriting the roadmap here:** the cross-Library tension is
itself information worth preserving. Future-Ari (or a future Mark) deciding the Stage 3
question gets a stronger answer from reading both entries side-by-side than from a single
synthesized version. D-22's forward-warning still applies in either case (Markowitz OR HRP
allocates by correlation structure, not by raw PnL — both contradict PnL-weighted).
Operator green-light for any specific path remains required.

---

## Forecasting / Signal Refinement

Project Ari's strategies output signals → Fleet Consensus votes → trade. G/K's pipeline is
strategies output signals → alpha refinement → optimizer → portfolio. The intermediate
"alpha refinement" layer is what we currently lack. Per Lift #4, three operations:

1. **Scale**: rescale strategy signals so `Std{α} ≈ volatility · IC`. If a strategy's
   signal magnitudes are in the wrong units (raw RSI vs RSI-z-score), rescaling normalizes.
2. **Trim**: clip signals at 3× scale. Prevents single-spike domination.
3. **Neutralize**: subtract benchmark-implied alpha. For us: subtract HODL drift before
   weighting.

Where it lands in code: a new `signal_refinement.py` between
`backend/services/cycle_service.py` (signal generation) and the Fleet aggregation step.
Strict requirement: must NOT touch Day 8 invariants. Specifically:

- **INV-1** (RSI returns None below warmup): refinement happens *after* signal generation,
  on already-warmup-gated signals. None values pass through unrefined.
- **INV-2** (one canonical regime classifier): refinement is regime-agnostic at the
  strategy level. Day 8 INV-3 holds.
- **INV-3** (regime-agnostic mean-rev/contrarian at cycle level): refinement is internal
  to strategy signal output, not a regime gate.
- **INV-4** (symmetric BTC-vs-TAO macro_correlation): refinement does not modify
  macro_correlation logic.
- **INV-5** (PriceService persists+hydrates): unchanged.

Per D-23, this layer is *prescriptive* (changes how Project Ari operates) — operator
green-light required before any code lands. Filed here as design-ready.

---

## Counterfactuals

### CF-G1 · Mean/variance dominates alternative risk measures (semivariance, downside risk, kurtosis)
**(Ch 14 §"Alternatives to Mean/Variance Optimization", p400–402)**

We have a Sharpe Contract and a HODL benchmark. The instinct under stress (after a loss
streak) is to add downside-risk-only metrics (Sortino, Sterling, Calmar) and try to
optimize on them. Book pushes back hard:

> *"Higher moments of asset and asset class return distributions exhibit very little
> predictability, especially where it is important for portfolio construction. […] Most
> alternative risk forecasts reduce to a standard deviation forecast plus noise."*
> (Kahn/Stefek 1996, summarized p401)

Two-part argument: (1) Kahn/Stefek for asset selection; (2) Grinold for asset allocation.
Conclusion: use mean/variance for optimization, even if your *preferences* favor an
alternative measure. Display alternative measures if useful for client communication, but
don't optimize on them.

**Filed as forward-warning (proposed D-NN below).** When we add a metric panel, distinguish
*display* metrics (Sortino, Calmar — fine to show) from *optimization* metrics (Sharpe is
canonical until evidence shifts).

### CF-G2 · The optimizer EXPLOITS noise — covariance matrix quality matters more than alpha quality
**(Ch 14, p397–398)**

Counterintuitive but rigorous: a quadratic optimizer with great alphas and noisy
covariance produces *worse* portfolios than a quadratic optimizer with mediocre alphas and
clean covariance. The optimizer aggressively exploits any covariance that *looks* low,
regardless of whether the low-covariance is real or noise. *"Estimation errors will be
exploited as if they were signal."*

For Project Ari this means: when we eventually deploy Markowitz, we cannot prioritize
"better signals" over "stable covariance." Order of attack: covariance shrinkage and
factor structure FIRST, signal refinement SECOND.

### CF-G3 · "Active management is a zero-sum game" — IR distribution centered on zero by construction
**(Ch 5, Table 5.1 p114)**

Book frames IR distribution as "symmetric, centered on zero, consistent with our
fundamental understanding of active management as a zero-sum game." For US equity
mutual funds vs S&P 500 this is roughly true (someone's overperformance is someone else's
underperformance among active managers).

**Project Ari is NOT in a zero-sum game vs HODL.** HODL benchmark is the *passive return*
of holding the position. We can beat HODL without anyone else losing — the AMM pool, the
subnet rewards, and active strategy selection across multiple subnets gives us a positive-
sum game in expectation if we add real value through dTAO subnet selection. So our prior
over IR distribution is NOT centered on zero in the same way.

Filed as a doctrinal contrast, not a counterfactual against a Project Ari decision. The
Sharpe Contract's HODL-as-benchmark choice (locked dim #2) was already the right answer
to this — we're benchmarked against passive-hold returns, not against the median active
manager.

---

## Validations

### V-G1 · Sharpe Contract dimension #4 (paper/live cohort split) is supported by Ch 14 §Dispersion
**(p402–408)**

G/K analyze why "separately managed accounts running the same strategy" diverge from each
other (cash flows, transaction-cost-driven optimal-portfolio-mismatch). Conclusion: *"Some
dispersion is optimal"* — zero-dispersion would require excess trading. Our paper-vs-live
cohort split is the same phenomenon: paper has zero t-cost, live has real t-cost, so they
will inevitably diverge even running identical signals. Forced convergence (paper-tracking
live or vice versa) would destroy value. Sharpe Contract dim #4 is locked correctly.

### V-G2 · Sharpe-as-canonical (locked dim #1) is endorsed twice
**(Ch 14 §400–402; Ch 5 §125)**

> *"Every investor seeks the strategy or manager with the highest information ratio.
> Different investors will differ only in how aggressively they implement the strategy."*
> (p125)

For HODL-benchmarked Project Ari, IR = Sharpe (under our specific construction). So:
"every observer of Project Ari should care most about the strategy's Sharpe; we differ
only in how aggressively we want to implement (= where to set the slider)." The slider
+ Sharpe ratio is the right two-knob interface.

### V-G3 · Display-first → soft-gate → hard-gate progression is the warmup-gate doctrine applied to portfolio construction
**(Ch 14, p378; Ch 5, p109–110)**

> *"With no transactions costs, the goal is to maximize value added within any limitations
> on the manager's behavior imposed by the client. Transactions costs make the problem
> more difficult. […] Implementation schemes are, in part, safeguards against poor
> research."*

G/K's "implementation schemes are safeguards" framing is a direct cousin of our
display-first doctrine: when you're not yet sure your alphas are right, constrain
implementation tightly. As confidence grows, loosen constraints. The Markowitz-stage
roadmap (Lift #2 + the "Markowitz Done Right" deep-dive) embeds the same doctrine into
portfolio construction itself.

### V-G4 · D-23 inscription-autonomy doctrine is a Library-relevant generalization of G/K's Ch 1 framing
**(Ch 1 Introduction, p1)**

> *"This does not mean that heroic personal investment insights are a thing of the past.
> It means that managers will increasingly capture and apply those insights in a
> systematic fashion."*

The transformation G/K describe (intuition → process → systematic capture) is directly
parallel to D-23 (operator authority → autonomy in descriptive inscription → operator
authority retained for prescriptive). Filing-as-process is the correct operationalization
of "capture and apply systematically."

### V-G5 · Anti-data-mining doctrine — IC > 0.20 = "faulty backtest"
**(Ch 10 p272)**

We have not yet computed IC on any Project Ari strategy. When we do, the threshold
*"IC > 0.20 usually signals a faulty backtest or imminent investigation for insider
dealing"* is a built-in anti-overfit guardrail — pre-validates AP/protect-against-overfitting
discipline before we have an institutional history of it. Filed for use when IC
measurements come online.

---

## Cross-references with Donadio/Ghosh entry

Direct cross-refs in the form `(G/K page) ↔ (D/G page)`:

1. **IR definition** — G/K Ch 5 (p109–115) ↔ D/G Ch 6 (p213, "Sharpe ratio"). G/K is the
   formally derived primary; D/G is the working tool. G/K's distinction between IR and
   Sharpe (different denominators when benchmark ≠ risk-free) collapses for Project Ari but
   matters for the general theory.
2. **Fundamental Law** — G/K Ch 6 (p147–161) ↔ D/G Ch 10 §"Optimizing trading signals"
   (p346). G/K provides the formal IR=IC×√BR identity; D/G mentions it informally without
   giving the breadth-counting discipline. Counts as **deepening, not contradiction**.
3. **Markowitz** — G/K Ch 14 (p377–417) ↔ D/G Ch 10 §"Portfolio optimization" (p348–352).
   D/G ranked five methods (Uniform → PnL → PnL-Sharpe → Markowitz → Regime-Predictive); G/K
   provides the operational manual for the Markowitz step (covariance estimation, λ
   parameterization, constraint handling, modified-alpha trick). Counts as **deepening**.
4. **Vol-adjusted strategies** — G/K not directly. D/G Ch 5 (p144–148, +200% mean-rev
   result) is the unique source. G/K's `α = volatility · IC · score` rule of thumb (p267)
   is the natural generalization but doesn't quote a number.
5. **Backtest overfitting** — G/K Ch 10 (p272, "IC > 0.20 = faulty backtest or insider
   dealing") + Ch 12 (p334, "data mining is the bane of information analysis") ↔ D/G
   Ch 10 §"Profit decay" (p355). G/K is more rigorous on the *measurement* side; D/G more
   rigorous on the *failure mode taxonomy* side. Complementary, not duplicative.
6. **Risk-scaling progression (graduated promotion)** — G/K Ch 14 §"Implementation
   schemes are safeguards" (p378) ↔ D/G Ch 6 (p213–221, risk-scaling system). Same
   doctrine, two angles: D/G operationalizes ("start at MIN, ramp on monthly performance");
   G/K provides the *why* ("safeguards against poor research"). Counts as **deepening**.
7. **t-stat / skill vs luck** — G/K Ch 5 (p112, ex-post IR = t-stat / √Y) + Ch 12 (p327,
   IR std error ≈ 1/√Y) ↔ D/G Ch 6 (p213, qualitative "Sharpe over time matters"). G/K
   has the *formal small-sample relationship*; D/G doesn't. Counts as **adds new content**.
8. **T-cost amortization** — G/K Ch 14 (p387, annualized = round-trip / holding period)
   + Ch 16 (p445–447, 75%-with-half-turnover rule) ↔ D/G Ch 5 (p148 footnote,
   1% round-trip → 0.8% drag). Same direction; G/K more rigorous and gives a bound on
   value-loss from t-cost dominance.
9. **Constraints reduce theoretical IR** — G/K Ch 14 Table 14.1 (p380, IC shrinkage by
   62% from constraints) ↔ D/G Ch 10 §"Portfolio optimization" (p349, Markowitz under
   constraints). G/K is precise; D/G hand-waves the same point. Counts as **deepening**.
10. **Half-life / signal decay** — G/K Ch 13 entire chapter (p347–366, half-life as
    intrinsic property; rebalance ≈ 2× half-life optimal) ↔ D/G Ch 10 §"Signal decay"
    (p352–355). D/G lists the failure modes (six causes); G/K provides the math. Counts
    as **complementary** — both belong on the shelf.

**Summary of relationship:** Donadio/Ghosh is the *practitioner's* book — code, working
examples, recipes. Grinold/Kahn is the *theorist's* book — formal derivations, equations,
empirical validation tables. They are complementary; D/G says "here's the recipe," G/K says
"here's why the recipe works and how to know when it doesn't." For Project Ari, we read
D/G first to get to working code fast; we read G/K to validate that the working code is the
*right* code, and to plan the next stage.

---

## Skip list

What's covered in the book but not relevant to Project Ari right now (so future Ari knows
it was read and consciously skipped):

- **Ch 2 — CAPM** (p11–40). Background; we operate on TAO/dTAO not US equities; Ari's
  benchmarks are HODL-based not market-cap-weighted indices. Standard CAPM concepts (β, α,
  excess return) carry over but we don't need the equity-specific machinery.
- **Ch 7 — Arbitrage Pricing Theory** (p173–198). Multi-factor return models for equities.
  We don't have multiple equities; we have multiple strategies. Different abstraction.
- **Ch 8 — Valuation in Theory** + **Ch 9 — Valuation in Practice** (p199–260). Dividend
  discount models, fundamental valuation. Not applicable to AMM-pool-based subnet alpha
  pricing.
- **Ch 15 — Long/Short Investing** (p419–444). We can't short on Bittensor.
- **Ch 18 — Asset Allocation** (p517–540). Equity / bond / cash mix problem. We're 100%
  TAO + dTAO; the only "allocation" question is across subnets, which is a different
  problem shape.
- **Ch 19 — Benchmark Timing** (p541–558). HODL is our benchmark; we don't time it,
  we beat it.
- **Ch 20 — The Historical Record for Active Management** (p559–572). US equity mutual
  fund empirical study. Background only.
- **Ch 21 — Open Questions** (p573–576). Author's frontier in 1999. Of historical
  interest only.
- **Most appendices** (technical-appendix derivations beyond what's in the chapter
  prose). Read selectively when implementing specific equations.

---

## Vocabulary candidates for STATE.md §3

Per D-23, candidates flagged with confidence:

### V-G1 · Information Coefficient (IC) — STRONG, ready to inscribe
*Definition:* The correlation between a strategy's forecast (signal strength) and the
realized residual return (PnL net of HODL benchmark). A scalar in [−1, +1]. Calibration
thresholds (Grinold/Kahn p272): IC=0.05 good, 0.10 great, 0.15 world-class, IC>0.20 a
red flag for backtest overfitting. For Project Ari, IC is computable per-strategy and
per-fleet from joining `signals` against `paper_trades` / `live_trades`. The *skill*
component of the Fundamental Law `IR ≈ IC × √breadth`.

### V-G2 · Breadth (effective) — STRONG, ready to inscribe
*Definition:* The number of *independent* forecasts a strategy makes per year. NOT the
gross number of cycles or trades — independence requires that consecutive signals not
mostly repeat. For a strategy with N cycles/year and signal-autocorrelation ρ, effective
breadth ≈ `N × (1 − ρ)`. Cross-strategy breadth is reduced by inter-strategy signal
correlations. The *opportunity* component of the Fundamental Law `IR ≈ IC × √breadth`.

### V-G3 · Transfer Coefficient (TC) — MEDIUM, ready to inscribe with caveat
*Definition:* The correlation between constrained and unconstrained Markowitz solutions on
the same alphas. Measures how much theoretical IC survives portfolio constraints. Range
[0, 1]. Extends the Fundamental Law to `IR_realized ≈ TC × IC × √breadth`. *Caveat:*
formal name and equation are from Clarke/de Silva/Thorley 2002, post-Grinold/Kahn 2nd
edition; the mechanism is in Grinold/Kahn Ch 14 (Table 14.1 shows constraints shrinking
realized IC by ~62%) but without the named coefficient. For Project Ari, TC quantifies the
"cost of `risk_config.json`" in IR units.

### V-G4 · Signal Half-Life — STRONG, ready to inscribe
*Definition:* The lag at which a strategy's signal IC drops to 50% of immediate-
implementation value. An *intrinsic* property of the signal (Grinold/Kahn p348): temporal
manipulations like averaging or lagging change performance but DO NOT change the half-life.
Computable from signal-vs-realized-return correlation as a function of lag, fitted to
exponential decay. A momentum signal with 1-day half-life and a fundamental signal with
6-month half-life should NOT rebalance on the same clock — optimal rebalance interval is
roughly `2 × half_life` (Ch 13 footnote 9, function `√x · e^(−x ln 2)` peaks at x=1.257).

### V-G5 · Alpha Refinement — MEDIUM, propose-defer
*Definition:* The pre-construction process of converting raw strategy signals into
allocation-ready alphas. Three operations: (1) **Scale** so `Std{α} ≈ volatility · IC`;
(2) **Trim** outliers at 3× scale; (3) **Neutralize** against benchmark / cash / factor
biases (Grinold/Kahn p381–385). Sits between strategy signal generation and Fleet
aggregation. *Defer reason:* term is in tension with our existing "signal" usage —
"refinement" is the right word but proposing it now without the layer existing in code
risks making the vocabulary entry meaningless. Inscribe alongside the code change, not
before.

---

## Decision-log candidates for STATE.md §4

Per D-23, candidates flagged with confidence:

### D-NN candidate · "Mean/variance is canonical for optimization; alternative risk measures are display-only" — READY TO INSCRIBE
*Forward-warning rationale:* Eventually Mark or future-Ari will look at a downside-heavy
month and want to add Sortino / Sterling / Calmar to the optimizer (not just the display).
Grinold/Kahn Ch 14 §400–402 specifically argues against this: alternative risk measures
have very low predictive validity (Kahn/Stefek 1996), and optimization on them produces
*worse* portfolios than mean/variance optimization even for investors whose preferences
favor downside-only metrics. *Trigger:* The first time a future-Ari proposes optimizing on
anything other than mean/variance, this entry is the canonical "do not." Display Sortino /
Calmar / Sterling — they're cheap to compute and useful for operator communication. Don't
*optimize* on them. Source: `MemoryBank/Library/active-portfolio-management.md` §CF-G1 +
Ch 14 p400–402 + Kahn/Stefek 1996 + Grinold 1999 references.

### D-NN candidate · "Covariance estimation quality > alpha quality at the optimizer" — READY TO INSCRIBE
*Forward-warning rationale:* When Fleet Consensus moves off Uniform (D-22 trigger),
intuition will say "spend the time getting the alphas right." Counter-intuitively,
Grinold/Kahn Ch 14 p397–398 argues the opposite: the optimizer EXPLOITS covariance noise
as if it were signal. Order of attack must be: (1) covariance shrinkage / structural
factor model FIRST; (2) alpha refinement SECOND; (3) signal generation improvements
THIRD. *Trigger:* When the team or future-Ari proposes adding signals before stabilizing
covariance, this entry is the canonical "stop and read this first." Source:
`MemoryBank/Library/active-portfolio-management.md` §CF-G2 + Ch 14 p397–398.

### D-NN candidate · "IR-on-display = Sharpe-on-display for HODL-benchmark Ari (do not duplicate)" — READY TO INSCRIBE
*Standing-decision rationale:* For Project Ari's specific construction (HODL as both
risk-free floor and benchmark, β-to-HODL ≈ 1 by construction), IR and Sharpe collapse to
the same number. Adding IR alongside Sharpe on the Risk Config panel would be duplicative
and confusing. *What WOULD add value:* IC and breadth — the *components* of Sharpe via
the Fundamental Law, not alternatives. *Trigger:* This entry pre-empts the obvious next
suggestion ("you read Grinold/Kahn, shouldn't we display IR?") with the formal answer:
yes, IR matters, and we already display it under the name Sharpe. The work to do is to
display IC and breadth (the components), not IR (a relabel of what we have). Source:
`MemoryBank/Library/active-portfolio-management.md` §"Information Ratio vs Sharpe" +
Ch 5 Proposition 1 item 8 (p137).

### D-NN candidate · "Markowitz evolution is staged with measurable gates" — PROPOSE, DEFER
*Forward-design rationale:* Lift #2 lays out a four-stage progression off Uniform
(Sharpe-weighted with shrinkage prior → Markowitz with shrinkage covariance →
Regime-Predictive). Each stage has a measurable entry gate. This is the right
*direction* but the gate criteria are tentative — proposing them as a decision-log entry
now would lock in numbers (`|IR| × √n_trades > 2`, eigenvalue-stability < 25% mean,
forecast-vol R² > 0.4) that haven't been calibrated against real Project Ari data.
*Defer reason:* let the gates earn their numbers from one quarter of paper-trading data
before inscribing. *Trigger to revisit:* once we have enough live IR-per-strategy data
to set the Stage 2 gate empirically, file as D-NN.