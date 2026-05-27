# Quantitative Trading: How to Build Your Own Algorithmic Trading Business
**Ernest P. Chan · Wiley Trading 2021 (2nd edition) · 256 pp**

## Why it matters to Ari

This is the book the Day 14 worksheet was secretly written for. Three chapters land on tomorrow's actual work with surgical precision: **Ch 7 §"Mean-Reverting versus Momentum Strategies"** rewrites how to think about Item 2 (Mean Reversion at 26.6% WR / 79 trades is almost certainly broken in a *specific* way Chan diagnoses on p134-135 — wrong category of mean-reversion entirely); **Ch 7 §"What Is Your Exit Strategy?"** delivers the Ornstein-Uhlenbeck half-life formula that operationalizes López de Prado's Triple-Barrier Method exit-distribution into a single statistically robust number (D-26 pre-flight diagnostic gains a new column); and **Ch 6 §"Optimal Capital Allocation and Leverage"** gives us the **continuous Kelly formula `f* = m / s²`** that Day 14 Item 3 (Momentum Cascade Kelly check) was queued for. Chan also drops the **Bailey minimum-backtest-length theorem** (Ch 3) which puts hard numbers on Sharpe Contract dimension #5 — `n=681` for 95%-confidence-true-SR-≥-0 at backtest SR=1 — sister inscription to D-24 (DSR ≥ 0.95). The book sits exactly where the operator framing predicted: between Donadio/Ghosh's recipe-level treatment and López de Prado's statistical-rigor treatment, in Chan's own practitioner-who-has-blown-up voice.

---

## Top 5 Lifts (ranked by leverage)

### 1. Time-series vs cross-sectional mean reversion — Project Ari's Mean Reversion is the wrong category
**(Ch 7, p134-135)**

Chan's exact words on p134:

> "Reversion of the price of a single stock from a temporary deviation from its mean price level back to its mean is called **time-series mean reversion**, which **doesn't happen often**. […] Mean reversion of the spread of a pair of stocks, or a portfolio of stocks, back to its mean level is called **cross-sectional mean reversion**, and it happens much more often."

Project Ari's Mean Reversion strategy is single-asset (TAO price reverts to its own mean). That's the rare category. Chan's framing is that academic research finds stock prices are very close to random walks; time-series mean reversion is the exception, not the rule. The 26.6% WR / 79 trades / p<0.001 vs 50% pattern is **exactly** what a wrong-category-of-mean-reversion strategy looks like — it's not "broken parameters," it's "broken thesis."

**Day 14 Item 2 implication:** the redesign branch tree gains a new fork at the top. Before deciding "exit logic redesign" vs "subnet-monotonicity filter" (the existing branches), first decide: **stay with time-series mean reversion** (and accept it will be hit-or-miss), **or pivot to cross-sectional** (mean reversion of a TAO/BTC spread, or a TAO/subnet-alpha spread, or a basket of cointegrated subnets). The cross-sectional pivot is the higher-EV choice if any of our pairs cointegrate.

**Implementation hint:** run Engle-Granger / Augmented Dickey-Fuller (ADF) test on TAO/BTC, TAO/sn8, TAO/sn18, TAO/sn64 spreads (`statsmodels.tsa.stattools.coint`). If any pair rejects null at 95%, that pair is a cross-sectional mean-reversion candidate. **Caveat from Chan p152:** the Python `coint()` function disagrees with MATLAB and R on the same data; Chan recommends preferring R or MATLAB. For us, double-check any cointegration finding with at least two implementations.

### 2. Ornstein-Uhlenbeck half-life — the missing TBM exit-distribution diagnostic
**(Ch 7 §Exit Strategy, p170-172)**

For a mean-reverting series `z(t)`, the Ornstein-Uhlenbeck SDE `dz = θ(z − μ)dt + dW` gives **half-life = −ln(2) / θ**, where θ comes from regressing `dz` on `(z − mean(z))` via OLS. Statistically robust because it uses every data point in the series, not just trade events.

Chan p170: *"the average value of z(t) follows an exponential decay to its mean μ, and the half-life of this exponential decay is equal to ln(2)/θ, which is the expected time it takes for the spread to revert to half its initial deviation from the mean. **This half-life can be used to determine the optimal holding period for a mean-reverting position.**"*

**Project Ari fit:** D-26 (Day 14 pre-flight diagnostics) currently says *"run probFailure + TBM exit-distribution before any redesign proposal."* Add an OU half-life calculation as a third pre-flight diagnostic. For a properly-functioning Mean Reversion strategy, observed mean holding time should match the OU half-life within ~30%. If our Mean Reversion holds for vastly longer or shorter than its computed half-life, that's a diagnostic — not "edges are wrong" but "exit logic is misaligned with the signal's actual decay timescale."

**Implementation hint:** ~10 lines of Python on existing `paper_trades` joined to `prices`. Compute once per strategy. Surface on Day 14 worksheet alongside `probFailure` and TBM exit-distribution. Cost: trivial. Information density: high.

### 3. Continuous Kelly `f* = m / s²` — the right Kelly for Day 14 Item 3
**(Ch 6, p134-136)**

This is the operational answer to Day 14 Item 3's "compute Kelly first." For continuous returns (which is what we have — paper-trade returns are not Bernoulli), the Kelly formula is:

```
f* = m / s²    (single strategy, m = mean return, s = std deviation)
F* = C⁻¹ × M   (multi-strategy, C = covariance matrix, M = mean return vector)
```

The single-strategy form is **scale-invariant in time** (Chan p137: *"The Kelly f is independent of time scale, so it actually does not matter whether you annualize your return and standard deviation"*). Plug in raw per-trade or per-day numbers — answer is the same fraction.

Worked example for **Momentum Cascade** at 31.3% WR / 642 trades / −0.136τ realized PnL:
- If `m < 0` (which it is: −0.136τ over 642 trades is `m ≈ −0.0002τ/trade`), then `f* < 0` regardless of `s²`. **Negative Kelly = short the strategy = don't deploy it = the data is telling us not to scale up, not "tighten parameters."**
- For Momentum to be Kelly-positive, we need `m > 0` first. Win rate is irrelevant in isolation; what matters is `mean(P&L per trade)`, which combines WR and `avg_W / avg_L`.
- **Diagnostic for Day 14 Item 3:** before any redesign proposal, compute `m` and `s` from `paper_trades` and read the sign of `f* = m/s²`. If negative, the redesign question is "why is `m` negative?" not "what holding period is optimal?"

**Half-Kelly is standard practice** (Chan p136): cut recommended leverage in half "for safety" because parameter estimates have uncertainty and returns are not exactly Gaussian. **Quarter-Kelly is what most institutional shops actually run** (Poundstone confirms — see Library entry 5).

**Implementation hint:** `f* = m/s²` becomes a per-strategy column in any Sharpe metric service we ship. Sister to `Sharpe (raw)` / `PSR(0)` / `DSR`. Cross-reference D-22 / D-25 / D-26. Filing this as a **forward-warning D-NN inscription**, not a build directive — actual code is downstream.

### 4. Mean-reverters MUST NOT use stop-losses — momentum strategies SHOULD use signal-based exits
**(Ch 7 §Exit Strategy, p173-174)**

Chan p174:

> "For a reversal model, … running the reversal model again will simply generate a new signal with the same sign. Thus, **a reversal model for entry signals will never recommend a stop loss**. (On the contrary, it can recommend a target price or profit cap when the reversal has gone so far as to hit the opposite entry threshold.) And, indeed, it is much more reasonable to exit a position recommended by a mean-reversal model based on holding period or profit cap than stop loss, **as a stop loss in this case often means you are exiting at the worst possible time**."

For momentum strategies: exit when latest signal is *opposite* to existing position. *"This is almost akin to a stop loss. However, rather than imposing an arbitrary stop-loss price and thus introducing an extra adjustable parameter, which invites data-snooping bias, exiting based on the most recent entry signal is clearly justified based on the rationale for the momentum model."*

**Project Ari implication — load-bearing for Day 14:** before redesigning Mean Reversion (Item 2), audit whether the strategy currently exits via stop-loss. If it does, **the stop-loss is a bug, not a feature** — it's mathematically opposed to the mean-reversion thesis. Removing it may be more impactful than any parameter tuning. Cross-references **D-21** (vol-adjustment asymmetry between mean-rev and trend-follow) — same shape: *what works for one strategy class is structurally wrong for the other.*

**Day 8 INV-3 boundary:** stop-loss exit logic is internal to a strategy's exit code. Removing it is internal-to-strategy, not regime-level. INV-3 untouched.

**Inscription confidence:** ready-to-inscribe as descriptive forward-warning **D-NN**.

### 5. Bailey minimum backtest length theorem — hard numbers for Sharpe Contract dim #5
**(Ch 3, p84-85, citing Bailey 2012)**

Three pivot points for "how much data do you need to be 95% confident the true Sharpe is at or above target":

| Backtest SR achieves | To be 95% confident true SR ≥ | Need sample size ≥ |
|---|---|---|
| 1.0 | 0 | 681 trades (≈2.71 years daily) |
| 2.0 | 0 | 174 trades (≈0.69 years daily) |
| 1.5 | 1 | 2,739 trades (≈10.87 years daily) |

For Project Ari (sample sizes inscribed in current state): Vol-Arb n=18, Mean-Rev n=79, Momentum Cascade n=642 — **only Momentum Cascade is approaching the n=681 threshold**, and only for the weakest possible claim ("true SR ≥ 0" at backtest SR ≥ 1). Vol-Arb's n=18 is so far below threshold that any Sharpe reading is essentially noise — which is the honest answer, not a defect. Sister inscription to **D-24** (DSR ≥ 0.95): Bailey-min-length is a sample-size precondition; DSR is a multiple-testing correction; both gate honest Sharpe claims.

**Inscription confidence:** ready-to-inscribe as descriptive **D-NN**. Refines D-24 from a probability-threshold gate into a probability-threshold-AND-sample-size gate.

---

## Full Lifts (the long list, by chapter)

### Chapter 2 — Fishing for Ideas
- **Drawdown depth/length is more telling than peak return** (p23-24). Project Ari already surfaces drawdown in `risk_config`; Chan endorses the framing.
- **Survivorship bias inflates mean-reversion backtest disproportionately** (p134). Bittensor is too young for survivorship bias in subnet history yet, but logging which subnets de-listed (alpha-token retired) is a hygiene investment now for the day this matters.

### Chapter 3 — Backtesting
- **Bailey min-length theorem** (Lift #5 above).
- **Look-ahead bias detection via truncation test** (p83): run backtest on full data → save positions A; truncate last N days → run again → save positions B; positions before T-N must be identical. Subtle look-ahead bias that survives code review fails this test. Project Ari should run this against any future backtester before trusting its numbers.
- **Data-snooping mitigation: ≤5 parameters maximum** (p84). Project Ari's strategies tend to have 3-6 parameters each; we should audit each for any that's optimized rather than principled.
- **DSR namechecked** (p84) — Chan cites Bailey's DSR paper directly as the metric for "how much have you tweaked the backtest." Cross-validates López de Prado entry's CH 14 inscription.

### Chapter 5 — Execution Systems
- **Paper-trading discovers look-ahead bugs that backtest cannot** (p103). Validates Project Ari's paper-first → live progression. Quote on p104: paper trading *"is practically the only way to see if your ATS software has bugs without losing a lot of real money."*
- **Why-actual-diverges-from-expectations checklist** (p104-107): bugs, execution costs, regime shifts, data-snooping. Operationalizes our **simulation dislocation** vocabulary (V-1 from Donadio/Ghosh) into a practitioner's checklist.
- **Decimalization / regulatory regime shifts as canonical examples** (p105-106): a market-structure change can flip a previously-profitable strategy negative overnight. Project Ari's Bittensor analog is alpha-token tokenomics changes, validator behavior shifts, halving events. Worth tracking as a separate regime axis.

### Chapter 6 — Money and Risk Management
- **Continuous Kelly** (Lift #3 above).
- **Multi-strategy Kelly: `F* = C⁻¹ × M`** (p134). Same shape as HRP from D-25 but with explicit inverse. Cross-links D-22, D-25.
- **`g_max = r + S²/2`** (p137). Maximum compounded growth = risk-free rate + half the squared Sharpe. **Direct mechanical link between Sharpe and growth.** Validates the entire Sharpe Contract — Sharpe IS what we're optimizing because it determines compounded growth under Kelly-optimal sizing.
- **Risk decreases long-term growth rate** (p136). Geometric mean < arithmetic mean. Validates D-22's Markowitz-allocates-to-losers framing — variance reduction is mathematically equivalent to growth optimization.

### Chapter 7 — Special Topics
- **Time-series vs cross-sectional mean reversion** (Lift #1).
- **Cointegration via Engle-Granger / Augmented Dickey-Fuller (ADF)** (p149-152). Statistical test for "does this pair form a stationary spread?" t-stat below critical value (e.g., −3.38 at 5%) → cointegrated → mean-reverting strategy mathematically valid. **Caveat:** Python's `statsmodels.tsa.stattools.coint()` disagrees with MATLAB/R on the same data (p152). Use multiple implementations.
- **Ornstein-Uhlenbeck half-life** (Lift #2).
- **Mean-rev no-stop-loss / momentum signal-based-exit** (Lift #4).
- **Profit-decay decomposition by strategy class** (p161): mean-reverters decay by **opportunity exhaustion** (returns shrink to zero); momentum decays by **horizon compression** (winning window shortens). Cross-link to V-2 (profit decay) — Donadio/Ghosh has the six causes; Chan has the per-class decay shape.
- **Conditional Parameter Optimization (CPO)** (p138-148). Chan's ML approach: random forest with boosting predicts strategy outcome given current market features + parameter combinations; pick best-predicted set each day. Future direction for Project Ari, NOT a near-term lift. Implementation requires substantial ML infrastructure.
- **Factor models / Fama-French** (p160-169). Decomposes return into systematic factor exposures. For Project Ari: not directly applicable (Bittensor doesn't have well-defined factors yet), but the framework belongs filed for the day Bittensor analytics matures.
- **Seasonal trading** (p174-186). January effect, etc. Project Ari has weak seasonality so far; validators have monthly stake-rewards cadences but the price impact is small. Skip for now, file the idea.

### Chapter 8 — Conclusion + Appendix
- **Kelly formula derivation appendix** (p131): reproduces the log-utility derivation in plain notation. Useful when defending the Kelly choice in code comments.

---

## Mean Reversion Done Right — DEEP DIVE

The most directly applicable section for tomorrow's Day 14 Item 2 redesign.

### What a properly-functioning mean-reverter looks like

Per Chan, three signatures should hold for a mean-reverting strategy worth running:

1. **Underlying series passes ADF test at ≥95% confidence.** Either single-asset stationarity (rare) or pair/portfolio cointegration (common). Without this, the strategy has no mathematical foundation — observed reversion in backtest is luck.
2. **Holding time matches OU half-life within ~30%.** If you exit far before half-life, you're systematically taking partial reversion at higher cost-per-trade. If you exit far after, the position has either reverted-and-reversed or the regime has shifted.
3. **No stop-loss on the strategy.** Mean reversion's adverse path is "the spread keeps widening before reverting." A stop-loss kicks you out at the local maximum-pain instant and locks the loss. Use holding period + profit cap; let losing trades run their natural course.

### Would Chan diagnose Mean Reversion at 26.6% WR / 79 trades as broken vs unlucky vs mis-specified?

**Mis-specified.** The 26.6% WR is the symptom; the cause (per Chan's framing) is almost certainly one or more of:
- **Wrong category** (time-series, not cross-sectional): there is no cointegrated spread underneath; we're betting on TAO-as-single-asset reverting to a moving average, which Chan says doesn't happen often.
- **Stop-loss in the exit logic**: locks losses at peak-adverse-excursion before reversion has a chance to play out.
- **Holding time misaligned with OU half-life**: either too short (taking partial) or too long (waiting past the regime).

p<0.001 vs 50% is consistent with "the underlying series has no statistical mean-reversion property" — random-walk-with-frictions delivers ~50% WR with negative expected return; structurally-anti-mean-reverting series (positive drift on momentum) delivers 20-30% WR consistently.

### Concrete redesign hints

Pre-flight (per D-26 + this entry):
1. **ADF test** on TAO/USD price series — expected to fail (TAO has trend / drift).
2. **Cointegration tests** on TAO/BTC, TAO/{sn8, sn18, sn64} alpha-spreads — find any pair that cointegrates at 95%.
3. **OU half-life** on Mean Reversion's actual entry/exit data — compare to current `holding_period_min`.
4. **Audit exit logic** for stop-loss — quote: *"a stop loss in this case often means you are exiting at the worst possible time."*

Redesign branches:
- **Branch A (cointegration found):** pivot to cross-sectional Mean Reversion — entry on `(z − μ)/σ` cross of cointegrated spread; exit on holding-period = OU half-life OR opposite-side z-cross.
- **Branch B (no cointegration found):** Mean Reversion as currently designed has no mathematical basis. Either (a) demote to a holding strategy until Bittensor matures more, or (b) repurpose its slot in the Fleet for a different signal class entirely.
- **Branch C (cointegration marginal, p between 5-10%):** keep the strategy but remove stop-loss, align holding period to OU half-life, monitor for one more sample period before scaling.

---

## Momentum Done Right — DEEP DIVE

Day 14 Item 3 (Momentum Cascade).

### Why low WR is normal for momentum

Chan p161 (paraphrasing): momentum strategies survive on `avg_W >> avg_L`, not on win rate. The 31.3% WR for Momentum Cascade is **expected** for momentum class — it's not the diagnostic. The diagnostic is `mean(P&L per trade)`, which is **−0.0002τ** (=−0.136τ ÷ 642 trades). That's a Kelly-negative number regardless of `avg_W / avg_L` distribution.

### How Chan would evaluate Momentum Cascade

The strategy is **shipping at negative expected value per trade**. Three explanations Chan would consider:

1. **Horizon compression** (p161): "as more traders take advantage of this trend earlier on, the equilibrium price will be reached sooner. Any trade entered after this equilibrium price is reached will be unprofitable." Applied here: Bittensor markets have matured between the original Momentum Cascade design and now; the holding period that was profitable when designed may now extend past peak-momentum into mean-reversion territory.
2. **Misclassified signal**: "momentum" cues that aren't actually predicting trend. Common causes: indicator threshold tuned on the trending portion of the backtest, fails on choppy regimes (which dominate live data); regime classifier and momentum detector seeing different things.
3. **Transaction cost erosion**: 642 trades is a lot of churn; if `avg_P&L_gross > 0` but `avg_P&L_net < 0`, the strategy has good signal but is being eaten by execution costs. Project Ari is on AMM pools so this is a different cost shape than Chan's exchange context, but the failure mode is the same.

### Concrete redesign hints

Pre-flight (per D-26):
1. **Compute Kelly fraction**: `f* = m/s²` where `m`, `s` come from `paper_trades`. **If `f* < 0`, do not redesign — kill the strategy or repurpose the slot.** Negative Kelly means mean return is negative; no parameter tuning fixes a negative-mean strategy.
2. **Decompose**: `m_gross = m_net + transaction_costs`. If `m_gross > 0` and `m_net < 0`, the redesign target is execution / order-splitting, not signal logic.
3. **Examine holding period**: compute realized hold time vs original-design hold time. If realized > designed, either (a) signal is firing later than intended, or (b) horizon-compression has shrunk the available momentum window beneath our holding period.

Redesign branches:
- **Branch A (Kelly-positive once costs separated):** reduce holding period to match observed momentum-window. Cost-mitigation may be done via Almgren-Chriss-style splitting (pending Cartea read).
- **Branch B (Kelly-negative even on gross):** the signal isn't catching momentum. Repurpose the slot or rebuild the entry logic. **Crucially: do NOT apply the vol-adjustment recipe from Donadio/Ghosh per D-21 (vol-adjustment helps mean-rev, hurts trend-follow).**

---

## Backtesting Pitfalls — what to NOT do
**(Ch 3)**

Operationalizing López de Prado's PBO/CSCV framework into a practitioner's checklist:

| Pitfall | Symptom | Project Ari guard |
|---|---|---|
| **Look-ahead bias** | Backtest uses information not yet available at trade time | Truncation-test recipe (p83). Run on any future backtester before trusting numbers. |
| **Data-snooping bias** | Performance inflated from optimization on transient noise | ≤5 parameters per strategy (p84). Audit each strategy's parameter count. **DSR ≥ 0.95** (D-24) is the multiple-testing correction. |
| **Survivorship bias** | Strategy backtest excludes dead instruments | Bittensor too young for major impact, but log retired alpha-tokens for future-proofing. |
| **Transaction cost underestimation** | Strategy works in backtest, fails live | Pool simulator already surfaces liquidity cliffs at 1%/2%/5% of pool depth. Need to extend to per-trade slippage estimation. |
| **Regime shift unaccounted** | Backtest period had different market structure | Operationalize via regime classifier (already canonical per Day 8 INV-2). |

Cross-reference: D-21 (vol-adjustment asymmetry), D-22 (Markowitz-on-losers paradox), D-24 (DSR ≥ 0.95), D-26 (Day 14 pre-flight diagnostics).

---

## Kelly Criterion / Position Sizing — operational version
**(Ch 6)**

Day 14 Item 3 says "compute Kelly first." This is that section.

### Single-strategy continuous Kelly
```
f* = m / s²
```
Where `m` = mean per-period return (uncompounded), `s` = standard deviation. Time-scale invariant: same answer for per-trade or annualized inputs.

### Multi-strategy continuous Kelly (Thorp 1997)
```
F* = C⁻¹ × M
```
Where `C` is the covariance matrix and `M` is the vector of mean returns. Same shape as Markowitz's mean-variance optimization. **Same problem as HRP** — but where HRP avoids inverting C explicitly, Kelly assumes you have an invertible C. Per D-25, HRP is the better destination for Project Ari because our paper-data covariance matrix is small-sample and ill-conditioned.

### What fraction should Project Ari use?

**Half-Kelly** is the standard default (Chan p136). For Project Ari specifically, given:
- Paper-trading phase = parameter uncertainty is HIGH (Bayesian priors not yet hardened against live data)
- Returns are non-Gaussian (TAO has fat tails)
- Drawdown sensitivity is high (small operator, no institutional cushion)

**Quarter-Kelly is more appropriate** until live data matures the parameter estimates. Operationalization: compute `f*` per strategy, use `0.25 × f*` as the position-size cap suggestion in `risk_config.json`.

### Mapping to current `risk_config.json`

`max_position_size_pct` is currently a fixed cap unrelated to Kelly. The proposed evolution path:

| Phase | Position cap | Kelly fraction |
|---|---|---|
| Now (paper, low data) | static cap | none — sizing is uncalibrated |
| After live data sufficient (per D-24 + Bailey) | `min(static_cap, 0.25 × f*)` | quarter-Kelly hybrid |
| After confidence in C estimation (months of live) | `0.5 × f*` per strategy | half-Kelly |

**Build directive: prescriptive, requires operator green-light.** Filed here as design-ready, not as a code change.

---

## Paper → Live Promotion — Chan's framing
**(Ch 5, p103-107)**

Chan's practitioner answer to the paper→live transition:

1. **Paper trade for at least one month** to discover look-ahead bugs and operational issues that backtest cannot reveal.
2. **Compare paper P&L vs backtest theoretical P&L** at every cycle. Difference should be transaction-cost-explainable; otherwise, investigate.
3. **Start live with the smallest possible capital.** "Bad luck or data-snooping?" question is unanswerable without live data.
4. **Eliminate parameters before adding them** when live underperforms backtest. If simplification preserves backtest performance, the strategy is robust; if it falls apart, the original strategy was data-snooped.

**Cross-reference Sharpe Contract dim #5** (display-first → soft-gate → hard-gate). Chan's framework is *qualitatively identical* to ours; he doesn't quantify the gates the way Bailey does (Lift #5) or LdP does (D-24 DSR), but he states the discipline cleanly.

---

## Counterfactuals

### CF-Chan-1 — Cointegration tests in Python are unreliable
**(p152)**

Chan: *"the Python code's Engle-Granger test generates a t-statistic of −2.4, whose absolute value is less than the 90% critical value, indicating that the two series are not cointegrating. This contradicts the results of the MATLAB cadf test. Which should we trust? […] **Do not trust Python's statistics and econometrics packages.**"*

This is a strong claim, somewhat dated (the book repeats it from the 2009 edition). Modern `statsmodels` is more reliable than 2009 vintage, but the warning stands: **for any cointegration finding that drives a Project-Ari strategy decision, run the test with at least two independent implementations** (e.g., `statsmodels` + `arch` or R via `rpy2`). Pre-flight check before trusting any pair.

### CF-Chan-2 — Time-series mean reversion is rare; we may be operating outside Chan's framework
**(p134)**

Chan's claim is grounded in equity research where prices are very close to random walks. Bittensor subnet alpha-tokens may behave differently:
- Newer market structure (less efficient → more reversion?)
- Tokenomics-driven volatility (halvings, emissions schedule)
- Validator behavior creates different price dynamics than retail/institutional equity flow

So Chan's "time-series MR doesn't happen often" may not generalize cleanly to TAO/dTAO. **However**, our 26.6% WR / 79 trades evidence is consistent with Chan's framing — Mean Reversion IS underperforming by exactly the amount that would suggest no real edge. Until proven otherwise, Chan's prior dominates.

### CF-Chan-3 — CPO requires ML infrastructure we don't have
**(p138-148)**

Chan's Conditional Parameter Optimization is interesting and may be a long-term direction, but it requires:
- Random forest with boosting trained on hundreds of features
- Daily retraining infrastructure
- A separate API call per parameter combination

This is outside Project Ari's current build scope. **Filed as future direction, not immediate lift.** López de Prado's meta-labeling (Library entry 3) is closer to our shape (Fleet Consensus already IS heuristic meta-labeling) and a more natural next step.

---

## Validations

### V-Chan-1 — Half-Kelly as standard practice
**(p136)**

Endorses what Project Ari's `max_position_size_pct` cap implicitly approximates. Sister inscription to D-22 (Markowitz allocates to losers). Risk-aversion-tempered position sizing is the rule, not the exception.

### V-Chan-2 — Paper trading is the only honest backtest
**(p103-104)**

Validates Day 8 invariants generally, especially INV-5 (PriceService persists+hydrates) — paper-trading without persisted history is operationally useless. Chan's framing: *"running the model on actual unseen data is the most reliable way to test it (short of actually trading it)."*

### V-Chan-3 — `g_max = r + S²/2` makes Sharpe the right optimization target
**(p137)**

Sharpe is mechanically connected to compounded growth via the Kelly formula. Project Ari's Sharpe Contract (five locked dimensions) is optimizing the right thing. Cross-reference D-30 (IR-on-display = Sharpe-on-display for HODL-benchmark Project Ari).

### V-Chan-4 — Diversification across strategies is mathematically forced
**(p137-141)**

Chan's worked example shows portfolio compounded growth (15.29%) exceeding the best single-strategy compounded growth (12.78%) under multi-strategy Kelly. Validates Fleet Consensus's existence as a structure — not just "more bets = lower variance," but **diversification mathematically increases growth rate**, not just reducing risk.

### V-Chan-5 — DSR namechecked
**(p84)**

Chan cites Bailey (2014) DSR paper directly. Cross-validates López de Prado's Ch 14 inscription (D-24). When two practitioner-textbook authors converge on the same metric, the metric is canon.

---

## Cross-references with prior Library entries

| Topic | Chan | Donadio/Ghosh | López de Prado | Grinold/Kahn |
|---|---|---|---|---|
| Sharpe / IR foundation | Ch 6 p137: `g_max = r + S²/2` | Ch 6 p203-204: definition only | Ch 14: DSR/PSR refinement | Ch 5: IR formal definition |
| Kelly formula | Ch 6 p134-136: continuous form `f*=m/s²` | Ch 6 p213-221: risk-scaling adjacent | Ch 10: bet-sizing rigorous | implicit only |
| Backtest pitfalls | Ch 3 p82-90: practitioner checklist | Ch 9: paper vs live | Ch 11-13: PBO/CSCV/SFP | not addressed |
| Mean reversion category distinction | **Ch 7 p134-135: time-series vs cross-sectional** | Ch 4-5: examples without category | not addressed | not addressed |
| OU half-life | **Ch 7 p170-172: explicit formula** | not addressed | Ch 3 (TBM) implicit | not addressed |
| Cointegration / ADF | **Ch 7 p147-159: explicit test** | Ch 5: StatArb mentions | Ch 5 (frac diff) adjacent | Ch 5 implicit |
| Multi-strategy Kelly | Ch 6 p134: `F*=C⁻¹M` | Ch 10: Markowitz | Ch 16: HRP (D-25) | Ch 14: Markowitz |
| Stop-loss for mean-reverters | **Ch 7 p173-174: do NOT use** | Ch 5: not addressed | implicit in TBM | not addressed |
| Min backtest length | **Ch 3 p84-85: Bailey theorem** | not addressed | Ch 14 (DSR) adjacent | not addressed |
| Profit decay shape per class | **Ch 7 p161: differential decay** | Ch 10: 6-cause taxonomy (V-2) | not addressed | Ch 13: half-life (V-9) |

**Highest cross-Library tension:** Chan p152 *"Do not trust Python's statistics packages"* vs Project Ari's Python-only stack. Resolved via CF-Chan-1: run cointegration tests through ≥2 implementations.

**Highest cross-Library convergence:** Chan + LdP + Grinold/Kahn all converge on Sharpe-as-canonical-metric AND on Kelly/log-utility as the underlying growth-optimization framework. Project Ari's Sharpe Contract is the consensus position of the practitioner-textbook canon.

---

## Skip list

What's covered in Chan's book but not relevant to Project Ari right now:

- **Brokerage/broker selection logistics** (Ch 4): Bittensor doesn't have brokers; we interact directly with subnet AMMs.
- **MATLAB tutorials** (Appendix): we use Python.
- **Equity-specific backtest databases** (Ch 3 p44-46): Bittensor data sourcing is its own problem.
- **Decimalization / plus-tick rule regime shifts** (Ch 5 p105-106): US-equity-specific historical events. Useful as *examples* of regime shift, not directly applicable.
- **Seasonal trading strategies** (Ch 7 p174-186): Bittensor seasonality is weak so far.
- **High-Frequency Trading Strategies** (Ch 7 p186-188): Chan's own framing is clear — HFT requires C-language stacks, colocation, and microsecond-grade execution. Our 5-minute cycle on 12-second blocks is a different regime entirely. Skip honestly.
- **Factor models (Fama-French)** (Ch 7 p160-169): Bittensor factor structure is too immature; the framework belongs filed for the day Bittensor analytics matures.
- **Conditional Parameter Optimization (CPO)** (Ch 7 p138-148): future ML direction; currently outside scope.
- **Business structure / retail vs proprietary** (Ch 4 p81-91): Project Ari is a single-operator-plus-AI build with its own legal structure (D-18); standard advice doesn't apply.

---

## Vocabulary candidates (per D-23 autonomy: ready-to-inscribe)

| Term | Proposed §3 row content |
|---|---|
| **Time-series mean reversion** | A mean-reversion strategy applied to a single-asset price series reverting to its own moving average. Per Chan p134: rare in practice; most asset prices are very close to random walks. Distinguished from **Cross-sectional mean reversion** (which is the spread of a pair or portfolio of assets reverting). Project Ari's current Mean Reversion strategy is time-series; Day 14 Item 2 redesign should evaluate whether to pivot to cross-sectional. |
| **Cross-sectional mean reversion** | A mean-reversion strategy applied to the *spread* of a pair (or basket) of cointegrated assets reverting to its mean. Per Chan p134-135: happens much more often than time-series MR; the mathematical foundation is **cointegration** verified via ADF or Engle-Granger test. The standard equity example is pair trading (e.g., GLD/GDX). For Project Ari: candidate pairs are TAO/BTC, TAO/sn8, TAO/sn18, etc. — any cointegrated TAO-asset pair. |
| **Cointegration** | A statistical property of two (or more) non-stationary time series whose linear combination IS stationary. Tested via Engle-Granger or Augmented Dickey-Fuller (ADF). t-statistic below critical value (e.g., −3.38 at 5%) → reject null of "no cointegration" → series form a stationary spread → cross-sectional mean reversion is mathematically valid. Distinct from **correlation**: cointegrated pairs may have low daily-return correlation (Chan p154-155), and correlated pairs (e.g., KO/PEP) may not cointegrate. **Caveat per Chan p152:** Python's `statsmodels.tsa.stattools.coint()` may disagree with R/MATLAB on the same data; verify with multiple implementations. |
| **Ornstein-Uhlenbeck half-life** | For a mean-reverting series modeled by `dz = θ(z − μ)dt + dW`, the half-life of reversion = `−ln(2) / θ`, where θ is obtained by OLS regression of `dz` on `(z − mean(z))`. Statistically robust because it uses every data point in the series, not just trade events. Per Chan p170-172: the right operational holding period for a mean-reverting position. For Project Ari, this becomes a Day 14 pre-flight diagnostic alongside `probFailure` (D-26): observed mean holding time should match OU half-life within ~30%. Inscribed Day 14 evening from `MemoryBank/Library/quantitative-trading-chan.md` Ch 7 §"What Is Your Exit Strategy?". |
| **Continuous Kelly** | The Kelly formula for continuous (non-Bernoulli) returns: single-strategy `f* = m/s²` (Chan p134); multi-strategy `F* = C⁻¹ × M` (Thorp 1997). Time-scale invariant — same fraction whether `m`, `s` are per-trade or annualized. Distinguished from **Discrete Kelly** (`f = (bp − q)/b` for Bernoulli win/lose with payoff `b`). For Project Ari with continuous trade returns, Continuous Kelly is the right form. **Half-Kelly** (`0.5 × f*`) is standard practice for parameter uncertainty + non-Gaussian returns; **Quarter-Kelly** is appropriate for paper-phase / small-sample / high-drawdown-sensitivity contexts. Maximum compounded growth under optimal Kelly: `g_max = r + S²/2`. |
| **Bailey minimum backtest length** | A theorem (Bailey 2012, cited Chan p84-85) giving the minimum sample size required to be 95%-confident that a strategy's true Sharpe ratio exceeds a target, given an observed backtest Sharpe ratio. Three pivot points: (a) backtest SR=1 → need n=681 to claim true SR ≥ 0; (b) backtest SR=2 → need only n=174 for true SR ≥ 0; (c) backtest SR=1.5 → need n=2,739 for true SR ≥ 1. Operationalizes Sharpe Contract dimension #5 sufficiency criterion with hard numbers. Sister to D-24 (DSR ≥ 0.95): Bailey-min-length is the sample-size precondition; DSR is the multiple-testing correction; both gate honest Sharpe claims. For current Project Ari samples (Vol-Arb n=18, Mean-Rev n=79, Momentum n=642), only Momentum is approaching threshold. |

All six rows ready-to-inscribe per D-23 (descriptive, source-cited, scope-defined). Inscribe in single batch with the Cartea + Poundstone vocabulary at end of session.

---

## Decision-log candidates (D-NN proposals)

Note on numbering: D-31/D-32/D-33 already inscribed by the parallel Poundstone entry (Kelly fraction default, LTCM forward-warning, Sharpe-vs-Kelly framework clarification). This entry's inscriptions start at **D-34** and cross-link D-31 where Kelly-fraction discipline overlaps.

### D-34 — Mean-reverting strategies must NOT use stop-loss exits (descriptive forward-warning, ready-to-inscribe)
Quote-based rationale from Chan p173-174: *"a stop loss in this case often means you are exiting at the worst possible time."* Day 14 Item 2 redesign pre-check: audit Mean Reversion exit code for stop-loss; remove if present. Sister to D-21 (vol-adjustment asymmetry between mean-rev and trend-follow) — same shape: what works for one strategy class is structurally wrong for the other. Day 8 INV-3 untouched (exit logic is internal to strategy, not a regime gate). For momentum strategies, Chan p173 endorses signal-based exits (exit when latest signal is opposite to existing position) over arbitrary stop-loss thresholds — sister inscription for trend-following exit logic.

### D-35 — Time-series mean reversion is a low-prior strategy class; cross-sectional is the higher-EV default (descriptive forward-warning, ready-to-inscribe)
Per Chan p134-135: *"Reversion of the price of a single stock from a temporary deviation from its mean price level back to its mean is called time-series mean reversion, which doesn't happen often. […] Mean reversion of the spread of a pair of stocks, or a portfolio of stocks, back to its mean level is called cross-sectional mean reversion, and it happens much more often."* Project Ari's Mean Reversion (single-asset TAO) is in the rare category; the 26.6% WR / 79 trades / p<0.001 vs 50% pattern is the signature of wrong-category-of-mean-reversion. Day 14 Item 2 redesign branch tree gains a top-level fork: stay time-series vs pivot to cross-sectional spread (TAO/BTC, TAO/{subnet alpha}). Pre-flight: Engle-Granger / ADF test on candidate pairs. If any pair cointegrates at 95%, cross-sectional pivot becomes the default. **Caveat (CF-Chan-1):** Python's `statsmodels.tsa.stattools.coint()` may disagree with R/MATLAB on the same data (Chan p152) — verify any cointegration finding with multiple implementations before acting on it.

### D-36 — Bailey minimum backtest length operationalizes Sharpe Contract dim #5 sample-size precondition (descriptive, ready-to-inscribe — refines D-24)
Refines **D-24** (DSR ≥ 0.95) from a multiple-testing correction alone to a multiple-testing correction AND a sample-size precondition. New combined gate: `DSR ≥ 0.95 AND n ≥ Bailey_min(observed_SR, target_SR)`. Three pivot points from Chan p84-85 (citing Bailey 2012):

| Backtest SR achieves | To be 95% confident true SR ≥ | Need sample size ≥ |
|---|---|---|
| 1.0 | 0 | 681 trades (≈2.71 years daily) |
| 2.0 | 0 | 174 trades (≈0.69 years daily) |
| 1.5 | 1 | 2,739 trades (≈10.87 years daily) |

For current Project Ari samples (Vol-Arb n=18, Mean-Rev n=79, Momentum n=642), only Momentum Cascade is approaching the weakest threshold. The honest Sharpe-Contract dim #5 reading at the others' sample sizes is "n is too small to tell" — sister framing to López de Prado's `probFailure` (D-26). Both gates run together: DSR is the multiple-testing correction; Bailey-min-length is the sample-size precondition; together they gate honest Sharpe claims.

### D-37 — Continuous Kelly `f* = m/s²` is the operational sizing formula; cross-link to D-31 (half-Kelly default) and D-NN-G open (paper-phase quarter-Kelly proposal) (descriptive on formula, prescriptive on phasing — partial green-light)

**Two-part inscription:**
- **Part A (descriptive, ready-to-inscribe):** the operational Kelly formula for Project Ari's continuous-return paper trades is **Chan p134's continuous form `f* = m/s²` (single strategy)** and **Thorp 1997's multi-strategy form `F* = C⁻¹ × M`**. Both are time-scale-invariant. **Sign rule:** negative `m` → negative `f*` → don't deploy regardless of variance. Cross-references D-31 (half-Kelly default), D-32 (LTCM cautionary tale), D-33 (Sharpe-vs-Kelly timescales), V-FF1 (Kelly fraction vocabulary), V-FF3 (Geometric mean criterion lineage).
- **Part B (prescriptive, requires operator green-light):** position-size cap in `risk_config.json` evolves through phases — `static_cap` only during paper-phase / sub-Bailey-min sample → `min(static_cap, 0.25 × f*)` once samples meet Bailey-min-length (D-36) → `min(static_cap, 0.5 × f*)` at mature live operation. **Quarter-Kelly during paper / early live** rather than half-Kelly (D-31's general default) because TAO returns are demonstrably non-Gaussian and parameter estimates are not yet hardened against live data. **Filed as design-ready; operator decision required on (a) the per-phase fraction, (b) trigger conditions for transitions, (c) whether `static_cap` always upper-bounds Kelly or yields to it.** Cross-references D-31 (half-Kelly framework), D-32 (LTCM forward-warning), D-NN-G in Library/fortunes-formula.md.

---

## One-line verdict

**Yes — strongly worth.** Three chapters (Ch 3 backtest pitfalls, Ch 6 Kelly, Ch 7 mean-rev/momentum/exit) land directly on tomorrow's Day 14 redesigns and queue four high-confidence forward-warnings to the decision log; Chan's practitioner voice cleanly bridges the Donadio/Ghosh recipe layer and the López de Prado statistical-rigor layer; the cointegration-test / OU-half-life / continuous-Kelly trio are operational diagnostics we should run before any Day 14 redesign proposal.