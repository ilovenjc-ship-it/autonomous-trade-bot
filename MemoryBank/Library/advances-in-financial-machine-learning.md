# Advances in Financial Machine Learning
**Marcos López de Prado · Wiley 2018 · 393 pp · ISBN 978-1-119-48208-6**

## Why it matters to Ari

This is the most directly load-bearing book on the shelf for what Project Ari is
about to do next. It addresses, with formulas and Python, the four open questions
we are sitting on simultaneously: (1) "what does Vol-Arb's Sharpe at n=18 trades
actually mean?" — Ch 14 (Probabilistic Sharpe Ratio) and Ch 15 (Probability of
Strategy Failure) answer this directly; (2) "what would a soft-gate Sharpe
threshold *actually* look like?" — Ch 14 (Deflated Sharpe Ratio) refines lock
dimension #5 of the Sharpe Contract from "raw Sharpe ≥ X" to "DSR ≥ 0.95," with
selection-bias correction across our 12 strategies built in; (3) "what is Fleet
Consensus's 7-of-12 supermajority approximating?" — Ch 3 (Meta-Labeling) gives it
the formal name and the upgrade path: a primary model that decides side + a
secondary model that decides whether to take the trade. Project Ari has been
hand-coding meta-labeling without knowing that's what it was. (4) "When we move
Fleet Consensus off equal-weight, does Markowitz really sit between
PnL-Sharpe-weighted and Regime-Predictive?" — Ch 16 (Hierarchical Risk Parity)
**replaces** Markowitz in that progression; HRP delivers lower out-of-sample
variance than Markowitz's own minimum-variance objective, on portfolios that map
exactly onto our 12-strategy structure. **D-22 needs a forward-warning extension
filed against it from this read.**

This is also the book whose author would object most loudly to what we are
about to do tomorrow. López de Prado's Second Law of Backtesting — *"Researching
and backtesting is like drinking and driving. Do not research under the influence
of a backtest."* — is a direct counterfactual to Day 14's design-from-data
worksheet (read Mean Reversion's 79 trades → propose redesign). The cure is to
keep the locks intentional and run the diagnoses through the formal small-sample
machinery (Ch 15) before deciding what the data is allowed to say.

---

## Top 5 Lifts (ranked by leverage)

### 1. Probability of Strategy Failure — answers "n=18 means what?" directly with code we can run
**(Ch 15 §15.4, p216-218; Snippet 15.5 `probFailure(ret, freq, tSR)`)**

Given a series of trade returns `{π_t}`, the algorithm computes:
- π+ = average of positive returns, π- = average of negative returns
- p = realized win rate = count(π_t > 0) / count(π_t)
- Implied annualized Sharpe θ = ((π+ - π-)p + π-) / ((π+ - π-)·√(p(1-p))) · √n
- Solves for `p_θ*` = the precision below which Sharpe drops below the target θ*
- Returns `P[p < p_θ*]` = probability the strategy fails the target

Practical rule from p217: *"we would disregard strategies where P[p < p_θ*] > .05
as too risky."*

For Mean Reversion (26.6% WR / 79 trades): if we have `avg_W` and `avg_L` (we
have them — Day 14 worksheet calls for pulling exactly these), this snippet
runs in 10 lines on existing `paper_trades` data and tells us the **probability
the strategy fails its Sharpe target**, not just "it has a low win rate." A
26.6% WR with `avg_W / |avg_L| = 4` and a positive-skewed payout distribution
can still be Kelly-positive; the same WR with `avg_W / |avg_L| = 1.2` cannot.
This is the right diagnostic shape. For Vol-Arb (n=18): the same algorithm with
n=18 will produce a probability so wide the answer is "n is too small to tell"
— which is itself the honest reading.

**Implementation hint:** lives in a new `backend/services/strategy_risk_service.py`,
called from the (forthcoming) Sharpe metric service or from a one-off diagnostic
script. Returns `(probFailure, implied_sr, p_theta_star, n)`. Surface on the
per-strategy Sharpe card as a small line: *"prob fail target = X% (rule of thumb:
discard if >5%)."* Day 8 invariant safe — purely retrospective on existing
`paper_trades` rows.

### 2. Deflated Sharpe Ratio — refines Sharpe Contract dimension #5 from "raw Sharpe ≥ X" to "DSR ≥ 0.95"
**(Ch 14 §14.7.3, p204-205; via PSR §14.7.2 p203-204)**

Mark's pre-read framing said *"DSR ≥ 0 belongs on the soft-gate"* — small
correction from the actual book: threshold is **DSR ≥ 0.95** (95% confidence),
not 0. DSR is a probability, not a ratio. What raw Sharpe overstates:

1. **Selection bias from running N strategies.** Even if all 12 strategies have
   true Sharpe = 0, the *expected maximum* observed Sharpe across 12 trials is
   greater than 0 just by luck. DSR computes that null expectation and asks
   whether the observed top Sharpe beats it.
2. **Non-normal returns** (skewness, kurtosis ≠ Gaussian).
3. **Track-record length** (small T inflates apparent Sharpe).

DSR formula (`PSR[SR*]` with computed benchmark):
```
SR* = √V[{SR_n}] · ((1-γ)·Z⁻¹[1 - 1/N] + γ·Z⁻¹[1 - 1/(N·e⁻¹)])
DSR = Z[ (SR_hat - SR*) · √(T-1) / √(1 - γ3·SR_hat + (γ4-1)/4 · SR_hat²) ]
```
where N = number of strategies tested, V[{SR_n}] = variance across the N
strategies' Sharpe estimates, γ = Euler-Mascheroni constant ≈ 0.577, T = trade
count, γ3 = skewness, γ4 = kurtosis (=3 Gaussian).

For Project Ari with N=12 (or N=13 including Fleet): every input is computable
from existing paper-trade data the moment the Sharpe metric service ships.
Expected order of magnitude: with 12 trials and modest cross-trial variance,
SR* will sit ~0.5-1.0 — meaning a strategy needs raw Sharpe noticeably above
1 just to clear the multiple-testing null, before any operator-target
comparison.

**Concrete recommendation for Sharpe Contract dimension #5 lock:** DO NOT
re-open the lock. Instead, **extend it** with a sub-clause: the soft-gate
criterion is *"raw Sharpe ≥ operator target AND DSR ≥ 0.95."* DSR doesn't
replace the operator-target slider — it's an upstream sanity floor. If the
strategy can't even clear the multiple-testing null at 95% confidence, the
operator's preferred Sharpe target is moot. If it can, the operator target
remains the meaningful gate.

This is the **highest-stakes question** in the book and I'm explicit about my
position: extend, don't replace. Lock #5 reads "display-only first, soft-gate
after sufficient live trades" — DSR ≥ 0.95 is what "soft-gate" *means
quantitatively*, not a competing definition.

### 3. Meta-Labeling — Fleet Consensus IS this pattern, just heuristic; the book gives us the upgrade path
**(Ch 3 §3.6-3.7, p50-53)**

The architectural cross-reference is uncanny:

| López de Prado's Meta-Labeling | Project Ari's current shape |
|--------------------------------|------------------------------|
| Primary model decides side (long/short) | 12 strategies decide BUY/SELL/HOLD on their own logic |
| Secondary ML model decides bet size including 0 (= "don't take it") | Fleet Consensus 7-of-12 supermajority decides take/don't-take |
| Output of secondary is binary {0, 1} | Fleet Consensus output is binary (vote passes / fails) |
| Primary can be technical, fundamental, ML, even discretionary | Our 12 strategies are heterogeneous (RSI, EMA, flow, sentiment, macro) |
| Reduces type-I errors by filtering low-precision primary signals | 7-of-12 filter is structurally identical |

López de Prado: *"Meta-labeling is particularly helpful when you want to achieve
higher F1-scores. First, we build a model that achieves high recall, even if the
precision is not particularly high. Second, we correct for the low precision by
applying meta-labeling to the positives predicted by the primary model."* (p52)

This describes Project Ari precisely. Each individual strategy fires often
(high recall, low precision); Fleet Consensus is the precision-corrector.
We just didn't have a name for the pattern.

**What we'd gain by replacing the 7-of-12 heuristic with a trained meta-model:**
- Per-signal precision weighting instead of uniform vote
- Feature-aware filtering ("regime + per-strategy historical accuracy in this
  regime + macro_correlation activity → trust this strategy's vote 0.7
  this cycle")
- Native bet-size output (0..1) rather than binary pass/fail

**What we'd lose:**
- Interpretability of "7 of 12 said yes"
- Robustness — a hand-coded supermajority cannot be overfit to backtest data;
  a trained meta-model can
- Day 8 INV-3 boundary respect — our regime-agnostic invariant lives at the
  cycle level, NOT inside individual strategies; meta-labeling lives at Fleet
  Consensus level, NOT inside individual strategies. Same boundary.

**Recommendation:** keep 7-of-12 as the production gate. Build meta-labeling as
a **shadow consumer** of the same Fleet decisions, train it on paper-trade
outcomes, log its agreement/disagreement with the heuristic, surface the
divergence on a diagnostic page. If after sufficient sample the meta-model
consistently outperforms 7-of-12 on F1-score with no overfitting evidence
(Ch 11 PBO check), promote it to soft gate. This is the same display-first →
soft-gate progression we use for live trading, applied to the council
mechanism itself.

### 4. Hierarchical Risk Parity (HRP) — replaces Markowitz in the Fleet allocation roadmap from D-22
**(Ch 16 §16.4, p223-231)**

D-22 currently reads *Uniform → PnL-Sharpe → Markowitz → Regime-Predictive.*
This read says **the Markowitz step is wrong.** López de Prado's HRP
specifically addresses why:

1. **Markowitz's curse (p222):** the more correlated the assets, the greater
   the need for diversification, AND the more numerically unstable the matrix
   inversion. Small estimation errors → huge weight changes. Project Ari's 12
   strategies trade the same instrument set (TAO + dTAO subnet alphas) and
   share many regime signals — high cross-correlation territory, exactly where
   Markowitz fails.
2. **Equal-weight beats Markowitz out-of-sample (p223, citing DeMiguel et al.
   2009).** This is a documented finding, not a contrarian opinion. It means
   Project Ari's current Uniform weighting is not actually the worst place to
   be — and it's worse to step DOWN to PnL-weighted (which we already filed
   D-22 to skip) than to step SIDEWAYS to Markowitz.
3. **HRP doesn't require matrix inversion or positive-definiteness** (p221).
   It works on a singular covariance matrix. For Project Ari this matters
   because with 12 strategies and small-sample-size paper data, our covariance
   matrix WILL be ill-conditioned. HRP is robust where Markowitz numerically
   fails.
4. **HRP delivers lower out-of-sample variance than Markowitz's CLA — even
   though minimum-variance is CLA's optimization objective** (p221). On
   pure-math terms, HRP wins on the metric Markowitz was *designed* for.

Mechanism (three stages, p224-231):
- **Tree clustering:** convert correlation matrix → distance metric
  d_ij = √((1-ρ_ij)/2) → hierarchical tree via single-linkage clustering
- **Quasi-diagonalization:** reorder cov matrix so similar strategies are
  adjacent
- **Recursive bisection:** split clusters, allocate weights inversely to
  variance within each split, recurse

**Forward-warning revision to D-22:** path becomes
*Uniform → PnL-Sharpe → **HRP** → Regime-Predictive*. PnL-Sharpe still falls out
for free once Sharpe metric service ships (same numerator). HRP is the right
correlation-aware destination, not Markowitz. Reference impl: scipy
(`scipy.cluster.hierarchy.linkage`) + López de Prado's Snippets 16.1-16.4 in
Ch 16.

This is the most substantive single revision the book proposes to a
previously-inscribed Project Ari decision. D-22 was filed two days ago without
this; it deserves an extension entry, not a rewrite — the Markowitz warning is
still correct (PnL-weighted is structurally opposed to it), the destination
just changes.

### 5. Triple-Barrier Method — formalize what we already do, retrospectively label every trade
**(Ch 3 §3.4, p45-47)**

Project Ari already exits trades on three conditions: profit-take, stop-loss,
or time. We do not currently *label* exits formally. The Triple-Barrier Method
(TBM) gives us a one-byte label per trade record:

- `+1` if upper (profit-take) barrier touched first
- `-1` if lower (stop-loss) barrier touched first
- `0` if vertical (time) barrier touched first — or, optionally, `sgn(return)` at
  time exit (López de Prado prefers the latter; for Project Ari I'd start with
  the conservative `0` since "neutral exit on time" is itself diagnostic)

What this gives us:
- Per-strategy distribution of exit reasons. For Mean Reversion at 26.6% WR, if
  most exits are stop-loss = entries are systematically wrong; if most are time
  = entries don't have an edge to realize; if most are profit-take but small =
  thresholds are too tight. **Different failure modes, different redesigns.**
- Population for retrospective ML labeling if we ever build a meta-model
  (Lift #3).
- Asymmetric horizontal barriers explicitly allowed (p47) — maps directly to
  our existing per-strategy stop-loss vs profit-take ratios.

**Implementation hint:** retroactive migration on `paper_trades`. New columns
`exit_barrier` (TEXT: 'pt' | 'sl' | 't1') and `tbm_label` (INT: -1 | 0 | +1).
Backfill once on existing rows from already-recorded `entry_price`,
`exit_price`, `exit_reason`, then write the columns at exit-time going forward.
Pure analytical. No execution-path change. Day 8 invariants untouched.

**This becomes the single highest-leverage diagnostic for tomorrow's Mean
Reversion redesign.** Pull TBM-labeled exits across Mean Reversion's 79 trades,
read the distribution before deciding what to redesign.

---

## Full Lifts (the long list, by chapter)

### Ch 3 — Labeling (p43-56)
- **Triple-Barrier Method** (p45-47): see Lift #5.
- **Dynamic thresholds via rolling EWM stdev** (p44): use volatility-adjusted
  thresholds rather than fixed. Cross-references Donadio/Ghosh's vol-adjusted
  Mean Reversion recipe (D-21) with rigor.
- **Meta-Labeling** (p50-53): see Lift #3.
- **Quantamental approach** (p53-54): meta-labeling layer on top of ANY primary
  (technical, ML, fundamental, even discretionary). Validates our heterogeneous
  fleet — Sentiment Surge + RSI Mean Reversion + Whale Flow live under one
  meta-layer with no theoretical mismatch.

### Ch 5 — Fractionally Differentiated Features (p75-89)
- The "stationarity vs memory dilemma" (p75): integer differentiation (returns
  vs prices) achieves stationarity but destroys long-range memory; raw prices
  preserve memory but are non-stationary. Fractional differentiation finds the
  minimum d ∈ [0,1] that achieves stationarity while preserving as much memory
  as possible.
- **Project Ari relevance:** LIMITED. Our features are oscillators (RSI, MACD,
  EMA crosses) not raw price levels — already implicitly stationary by
  construction. Frac diff matters for ML on price-as-feature, which we don't
  do. Filed for future reference if we ever feed raw prices to a meta-labeling
  classifier.

### Ch 7 — Cross-Validation in Finance (p103-111)
- **Why standard k-fold CV fails on financial data** (p104): observations are
  serially correlated, breaking the IID assumption k-fold requires; testing-set
  observations leak into training-set observations through label overlap.
- **Purged K-Fold CV** (p105-108): drop training observations whose labels
  overlap in time with testing labels.
- **Embargo** (p107): drop training observations that come immediately AFTER
  test observations (h ≈ 0.01·T). Catches serial-correlation leaks that
  purging misses.
- **Project Ari relevance:** WHEN we do parameter optimization on backtests
  (e.g., re-tuning Mean Reversion thresholds on history before deploying), this
  is the right CV framework. Not relevant to the current forward-paper-trading
  phase, but goes on the shelf for parameter-search work.
- **scikit-learn k-fold has bugs in financial contexts** (p109): if you use
  it directly, your CV is broken. Use a custom `PurgedKFold` class
  (Snippet 7.3 p108).

### Ch 10 — Bet Sizing (p141-149)
- Sizing bets from predicted probabilities: m = 2·Z[z] - 1 where z is the
  t-statistic of the prediction probability against the null hypothesis
  H0: p = 1/||X||.
- **Averaging active bets** (p144): when multiple bets are concurrently open,
  average their sizes to avoid overtrading from rapid signal updates.
- **Bet size discretization** (p144): m* = round(m/d)·d to prevent jitter.
- **Sigmoid bet-size function for dynamic position adjustment** (p145-148):
  m[ω, x] = x / √(ω + x²), where x = (forecast - market_price). As price
  approaches forecast, target position → 0 (realize gains).
- **Critical honesty note:** This chapter does NOT cover Kelly criterion,
  despite the prior recommendation framing implying it would. López de Prado's
  bet sizing is meta-labeling-derived size from probability, not Kelly. The
  Day 14 Item 3 Kelly check still wants Poundstone (or Thorp). Keep both books
  in scope.

### Ch 11 — The Dangers of Backtesting (p151-159)
- **Marcos' Second Law of Backtesting** (p154): *"Backtesting while researching
  is like drinking and driving. Do not research under the influence of a
  backtest."* — Strong counterfactual to Day 14's design-from-data work.
- **Marcos' Third Law of Backtesting** (p204, in Ch 14 but stated here):
  *"Every backtest result must be reported in conjunction with all the trials
  involved in its production. Absent that information, it is impossible to
  assess the backtest's 'false discovery' probability."* — The justification for
  DSR (Lift #2). For Project Ari: when we report a strategy's Sharpe, the
  number of strategies in the fleet is part of the report.
- **Seven Sins of Quantitative Investing** (p152): survivorship bias,
  look-ahead bias, storytelling, data mining, transaction costs, outliers,
  shorting. Project Ari's pre-trade simulator's HODL warmup gate addresses
  Sin #2 (look-ahead) by refusing to render verdicts before sufficient
  history exists. The "Backtest is not a research tool" doctrine (p153)
  validates that the simulator is for sanity-checking AFTER strategy design,
  not for deriving strategy parameters from.
- **PBO via CSCV** (p155-157): combinatorially symmetric cross-validation
  procedure for computing Probability of Backtest Overfitting. Forms a matrix
  M of (T trades × N strategies), partitions into S submatrices, computes ranks
  of in-sample-best vs out-of-sample. PBO is the probability that the
  in-sample-best strategy ranks below median out-of-sample. **Limited
  applicability to Project Ari** because our 12 strategies are PERMANENT
  trading entities, not parameter-search candidates — PBO is sharpest when N
  is "configurations tested." It becomes relevant when we A/B test redesigned
  strategy versions against current ones (which we'll do tomorrow with feature
  flags). At that point: PBO across `mean_reversion_v1` vs `mean_reversion_v2`
  performance series.

### Ch 12 — Backtesting through Cross-Validation (p161-168)
- **Walk-Forward (WF) is the standard backtest method and it is the worst.**
  Single path, easily overfit, sensitive to start date.
- **CPCV (Combinatorial Purged Cross-Validation)** (p163-167): partition T
  observations into N groups, generate φ[N,k] = (k/N)·C(N,N-k) backtest paths
  by combining group splits. Each path produces one Sharpe; the *distribution*
  of Sharpes is the answer, not a single number.
- **Project Ari relevance:** Same answer as PBO above — relevant when we test
  parameter variants of a strategy. Not directly applicable to forward paper
  trading on a single live timeline. Ship for the parameter-search workflow
  whenever it arrives.

### Ch 13 — Backtesting on Synthetic Data (p169-193)
- Use historical data to estimate process parameters → generate synthetic
  return paths → backtest on synthetic. Reduces overfitting to a particular
  historical sequence.
- **Project Ari relevance:** future Monte Carlo workflow if/when we want to
  stress-test redesigned strategies. Not Day 14 work.

### Ch 14 — Backtest Statistics (p195-209)
- See Lift #2 for DSR.
- **Probabilistic Sharpe Ratio (PSR)** (p203-204): the corrects-for-non-normality
  cousin of DSR. Same formula as DSR but with user-set SR* benchmark instead of
  computed multiple-testing benchmark. Should ship alongside DSR; both are
  cheap once Sharpe and (skewness, kurtosis) are computed. PSR > 0.95 is the
  rough significance threshold.
- **Time under Water (TuW)** (p201): time elapsed between high-watermark and
  PnL recovering above prior maximum. We compute drawdown; we don't yet
  surface TuW. Diagnostic complement to drawdown — same loss can have very
  different TuW signatures.
- **HHI concentration of returns** (p199-200): measures whether profits are
  concentrated in a few outlier trades (high HHI = strategy depends on
  outliers, fragile). Useful per-strategy alongside Sharpe.

### Ch 15 — Understanding Strategy Risk (p211-219)
- See Lift #1 for `probFailure`.
- **Strategy risk vs portfolio risk** (p213): "the risk that the investment
  strategy will fail to succeed over time, a question of far greater relevance
  to the chief investment officer." This is a vocabulary-worthy distinction.
  Risk Configuration page covers position-size limits, drawdown limits — those
  are *portfolio* risk. Sharpe Contract panel covers *strategy* risk
  (will the edge actually materialize). Different beasts; we have been
  conflating them in some places.

### Ch 16 — Hierarchical Risk Parity (p221-245)
- See Lift #4 for the full HRP argument.
- **Even naïve equal-weighted portfolios beat Markowitz out-of-sample**
  (p223, citing DeMiguel et al. 2009): direct validation that Project Ari's
  current Uniform Fleet is not actually broken — the upgrade path's first
  step (PnL-Sharpe) is the gentle one, and the destination (HRP) is the
  correlation-aware one.
- HRP works on singular covariance matrices (p221): with our small-sample
  paper data and 12 cross-correlated strategies, this matters.

### Skipped chapters (one line each, for completeness)
- Ch 1 Financial ML as a Distinct Subject — motivation, no lifts
- Ch 2 Financial Data Structures — dollar/volume/information bars; tick-data
  context, doesn't apply to our 5-min metagraph cycle
- Ch 4 Sample Weights — overlapping-label uniqueness for ML training; relevant
  if we train a meta-model, not before
- Ch 6 Ensemble Methods — random forest, bagging, boosting standard ML; same
  caveat as Ch 4
- Ch 8 Feature Importance — MDI/MDA/SFI; relevant for diagnosing meta-model
  features once we have one
- Ch 9 Hyper-Parameter Tuning — relevant for parameter-search work, not
  current phase
- Ch 17 Structural Breaks — CUSUM tests for regime change; our regime
  classifier is a different shape
- Ch 18 Entropy Features — Shannon entropy on price sequences; advanced
  feature engineering, future
- Ch 19 Microstructural Features — Kyle's lambda, Amihud's lambda, bid-ask
  bounce; HFT-specific, doesn't map to AMM pools
- Ch 20-22 High-Performance Computing Recipes — multiprocessing, vectorization,
  quantum optimization; infrastructure not algorithm content

---

## Deflated Sharpe Ratio — DEEP DIVE

Already covered in Lift #2. Adding the implementation-specific details here.

**What raw Sharpe overstates, in detail:**

1. **Selection bias from N strategies.** Suppose all 12 of our strategies have
   true Sharpe = 0 (no edge). The expected MAXIMUM observed Sharpe across 12
   independent trials is positive, by lucky-draw alone. López de Prado quotes
   the asymptotic approximation (p217, applied in p204):
   `E[max{x_i}] ≈ (1-γ)·Z⁻¹[1 - 1/N] + γ·Z⁻¹[1 - 1/(N·e⁻¹)]` where γ ≈ 0.577.
   For N=12: this evaluates to roughly 1.62 standard deviations above zero.
   Multiplied by the cross-strategy SR variance, that gives our SR*. So the
   "null Sharpe we have to beat" is real and quantifiable.

2. **Non-normal returns.** Skewness and kurtosis distort Sharpe. PSR formula:
   `Z[(SR_hat - SR*) · √(T-1) / √(1 - γ3·SR_hat + ((γ4-1)/4)·SR_hat²)]`.
   Negative skewness (`γ3 < 0` — losses are larger than wins) and high kurtosis
   (`γ4 > 3` — fat tails) BOTH inflate raw Sharpe relative to its honest meaning.

3. **Track-record length.** For small T, Sharpe is volatile across draws. The
   `√(T-1)` term in the denominator damps confidence with shorter history.

**Mapping each input to Project Ari data:**

| DSR input | Source |
|-----------|--------|
| `SR_hat` | Strategy's realized Sharpe (computed by forthcoming Sharpe service) |
| `T` | Trade count for the strategy |
| `γ3` (skewness) | `scipy.stats.skew(returns)` |
| `γ4` (kurtosis) | `scipy.stats.kurtosis(returns) + 3` (book uses raw kurtosis, scipy default returns excess) |
| `N` | 12 (or 13 if Fleet is included as a 13th trial) |
| `V[{SR_n}]` | Variance across the 12 strategies' realized Sharpes |

All inputs already exist or fall out of the Sharpe service we're about to build.
DSR is **a single function call on top of that service**, ~30 lines of Python.

**Estimated time-to-implementation:** when the Sharpe metric service ships, DSR
is a ~2-hour follow-on. PSR is the same call with a different SR*. Both belong
on the per-strategy Sharpe card as one row each:
- "Sharpe (raw): 1.42"
- "PSR(0): 0.81 — fails 0.95 significance"
- "DSR: 0.62 — fails 0.95 significance"

Reading: this strategy's Sharpe is positive, but at this sample size and given
that we're testing 12 strategies, we cannot reject the null hypothesis that its
true Sharpe is zero with 95% confidence. Display-row only initially. Soft-gate
once enough live trades accumulate.

---

## Probability of Backtest Overfitting (PBO) — DEEP DIVE

Covered in the Ch 11 entry of the Full Lifts list. Adding the
Project-Ari-specific applicability question.

**Can PBO run on paper-trading data the way it runs on backtests?**

Strict answer: **No, not directly.** PBO is built around N parallel "trials"
(parameter configurations or strategy variants) on the SAME historical
timeline, partitioned into S folds. The combinatorial structure relies on
having multiple configurations to in-sample-rank then out-of-sample-validate.

Project Ari's 12 strategies are not configurations — they are permanent
trading entities run forward on a single live timeline. They share the time
axis but they don't compete for parameter selection. PBO is sharpest when N =
"variants of one strategy under different threshold/parameter choices."

**When PBO becomes relevant for Project Ari:**

1. **Tomorrow.** Day 14 Item 2 redesigns Mean Reversion behind a
   `_RISK_CONFIG` feature flag. Both versions (`mean_reversion_v1` current,
   `mean_reversion_v2` redesigned) will run in paper. After sufficient sample,
   we have two PnL series on the same timeline → PBO across {v1, v2} gives us
   the probability that the redesign was an artifact of fitting to v1's failure
   modes.
2. **Future parameter searches.** When we eventually optimize Mean Reversion
   threshold parameters, the search produces many configurations. Run PBO on
   the search output before promoting any configuration to live.

**Should this become a Display row on the Sharpe Contract panel?**

Not as a panel row — PBO is a **strategy-redesign-event diagnostic**, not a
running statistic. File it as a one-shot report that runs whenever a redesign
is promoted from `_v1` to `_v2`. Surface in the redesign commit's verification
gauntlet, not as a permanent UI element.

---

## Meta-Labeling — Fleet Consensus as the formal pattern

Covered in Lift #3. Adding the Day 8 INV-3 boundary question and the implementation
sketch.

**Day 8 INV-3 boundary respect:**

Day 8 INV-3 reads: *"Mean Reversion + Contrarian Flow are regime-AGNOSTIC at
the cycle level — any strategy filter is internal to the strategy's signal
logic."* This is about the regime-classifier-vs-strategy boundary.

Meta-labeling lives at a DIFFERENT level: it's the Fleet Consensus → trade
decision layer, NOT the cycle classifier → strategy assignment layer. They
don't conflict. The architecture in scope:

```
                      ┌─ Strategy 1 (RSI Mean Rev)        ─┐
                      ├─ Strategy 2 (EMA Cross)            ─┤
cycle classifier      ├─ Strategy 3 (Whale Flow)           ─┤    Fleet Consensus
(NOT meta-labeling) ──┤ ...                                 ├──→ (META-LABELING)
                      ├─ Strategy 11 (Macro Correlation)   ─┤   currently 7-of-12
                      └─ Strategy 12 (Sentiment Surge)     ─┘   could be trained model
                            ↑                                            ↑
                            INV-3 enforces this is regime-agnostic       Lift #3 ships here
```

The cycle classifier feeds all 12 strategies regardless of regime
(INV-3-protected). Each strategy votes. Meta-labeling sits on the votes,
not inside the strategies. Boundary respected.

**Implementation sketch (shadow-consumer mode):**

1. **Data:** every Fleet Consensus decision logged with full primary outputs
   (we already log this).
2. **Primary features:** the 12 strategy signal outputs (BUY/SELL/HOLD), plus
   per-strategy historical accuracy in the current regime, plus market context
   (regime, vol, macro_correlation activity).
3. **Label:** binary {0, 1} for did-this-vote-result-in-profit per
   triple-barrier-method (Lift #5).
4. **Train:** sklearn random forest binary classifier, with PurgedKFold
   (Ch 7) for honest CV.
5. **Surface:** on the Fleet Consensus diagnostic page, side-by-side
   "heuristic decision: BUY (8/12)" and "meta-model decision: HOLD (P(take) =
   0.41)". Log divergences. Don't change live behavior.
6. **Gate:** if after sufficient sample the meta-model's F1-score on
   take-the-trade decisions outperforms the heuristic's, AND PBO across the
   two indicates non-artifact, promote to soft gate.

This is a meaningful build — likely 2-3 sessions when we get there. Not a
Day 14 ask. Filed as a future arc.

---

## Triple-Barrier Method — labeling our trade exits

Covered in Lift #5. Adding the migration plan.

**Migration plan (one-time backfill + ongoing write):**

1. New columns on `paper_trades` (and `live_trades` when it exists):
   - `exit_barrier TEXT NOT NULL DEFAULT 'unknown' CHECK IN ('pt','sl','t1','unknown')`
   - `tbm_label INT NOT NULL DEFAULT 0 CHECK IN (-1, 0, 1)`
2. Backfill on existing rows: derive `exit_barrier` from existing
   `exit_reason` field where it's already specific; default to 'unknown' for
   ambiguous rows.
3. Add to the trade-exit code path: when a trade closes, write the
   `exit_barrier` and `tbm_label` columns alongside `exit_price`. One line of
   logic per exit-reason branch.
4. Add a per-strategy "exit reason distribution" diagnostic: bar chart of
   pt% / sl% / t1% per strategy on the per-strategy Sharpe card.

**Whether this changes anything in the live execution path:** no. Pure
analytical migration. Existing exit logic produces the labels; we just store
them.

---

## Counterfactuals

### CF-LDP-1 · "Backtesting is not a research tool" — direct counterfactual to Day 14 worksheet

**(Ch 11 §11.4, p153)**

Quote: *"The purpose of a backtest is to discard bad models, not to improve
them. Adjusting your model based on the backtest results is a waste of time . . .
and it's dangerous. Invest your time and effort in getting all the components
right, as we've discussed elsewhere in the book: structured data, labeling,
weighting, ensembles, cross-validation, feature importance, bet sizing, etc.
By the time you are backtesting, it is too late."*

Day 14 worksheet plans:
- Read Mean Reversion's 79 paper trades → propose redesign
- Read Momentum Cascade's 642 paper trades → propose redesign

López de Prado's position: this is the failure mode. Every redesign-from-data
cycle adds a round to the implicit multiple-testing problem. After enough
cycles, you've fit your model to the historical noise.

**How to honor the warning while still doing the work:**

1. **Run `probFailure` (Lift #1) BEFORE proposing any redesign.** If Mean
   Reversion's `P[p < p_θ*=1]` is already < 0.05, the strategy is fine — the
   26.6% WR is consistent with positive Sharpe given asymmetric payouts.
   *The data tells us the strategy might not need redesigning.* Honor that
   if it's the answer.
2. **TBM-label exits FIRST (Lift #5).** Before proposing a redesign, look at
   the exit-reason distribution. Different distributions imply different
   redesigns. *The data tells us what kind of redesign, not whether to redesign.*
3. **Ship redesigns BEHIND feature flags as the worksheet already specifies.**
   Then the redesigned version vs the original is a 2-trial PBO problem in
   prospective paper trading, not a backtest-overfitting problem.
4. **Don't iterate.** If `mean_reversion_v2` underperforms `_v1`, do not write
   `_v3` from the same data. Pause. Read the book. Re-derive from theory, not
   from the data again. (López de Prado's Second Law.)

**Decision:** the Day 14 worksheet stands AS PLANNED, but with `probFailure`
and TBM-labeling added as pre-flight diagnostic steps before any redesign
proposal. This is a soft revision, not an abort. Filed as a discipline note
in the Day 14 worksheet, not a doctrinal change.

### CF-LDP-2 · Markowitz is not the right destination for Fleet Consensus — HRP is

**(Ch 16 §16.4, p221-231)**

Discussed in Lift #4. The previously-inscribed D-22 path
(Uniform → PnL-Sharpe → Markowitz → Regime-Predictive) needs an extension to
swap Markowitz for HRP. Filing this as `D-NN forward-warning extending D-22`
this commit.

### CF-LDP-3 · Sharpe annualization assumption — Project Ari is correct, the book is wrong by default for our context

**(Ch 14 §14.7.4, p205)**

Book quote: *"Annualized Sharpe ratio: This is the SR value, annualized by a
factor √a, where a is the average number of returns observed per year. **This
common annualization method relies on the assumption that returns are IID.**"*

Project Ari's Sharpe Contract dimension #3 lock reads: *"Time unit = per-trade
primary, daily secondary, annualize headline only with √N footnote."* The
"with √N footnote" is exactly the IID-assumption disclosure the book demands.
**We had this right before the book.** This is a validation, not a
counterfactual — but it's worth recording as a citation when defending the
lock against future "let's just use annualized Sharpe everywhere" pressure.

### CF-LDP-4 · Bet sizing in this book is NOT Kelly — Day 14 Item 3 needs Poundstone separately

**(Ch 10, all of it)**

The prior recommendation framing implied Ch 10 covers Kelly. It does not.
López de Prado's bet sizing is meta-labeling-derived from predicted
probabilities (sigmoid sizing on price-vs-forecast divergence), which is its
own valid framework. Kelly is mentioned in passing in Ch 16 motivation. **For
Day 14 Item 3 (Momentum Cascade Kelly check), the Poundstone book on the
queue remains the right reference.** No counterfactual to current Project
Ari practice; just a precision note on what this book does and doesn't cover.

---

## Validations

Where the book endorses Project Ari decisions already in place.

### V-LDP-1 · Day 8 INV-1 (RSI returns None below warmup) is the correct shape
Ch 11 Seven Sins of Quantitative Investing (p152) Sin #2 (look-ahead bias)
and Sin #4 (data mining) both implicate "confidently-defaulting indicators
during warmup" as failure modes. INV-1's "return None during warmup, never a
neutral default" is the exact opposite pattern. The pre-trade simulator's
HODL warmup gate (refuses verdicts before ≥25 days) is the same shape, applied
to a different surface.

### V-LDP-2 · Sharpe Contract dimension #4 (paper/live cohort separation) is correct
Ch 9 §9.1-9.4 (CV in finance, p103-111) treats training-set/testing-set
separation as inviolable; once data is used to train, it cannot be used to
test. Same shape as Project Ari's paper-trades cannot graduate to live-trades
silently — the gate is explicit and tracked separately.

### V-LDP-3 · Sharpe Contract dimension #3 (per-trade primary, daily secondary, annualize with √N footnote)
See CF-LDP-3 above — actually a validation, with the IID-disclosure footnote
already in the lock.

### V-LDP-4 · Display-first → soft-gate → hard-gate progression is the right shape
Ch 11 §11.5 General Recommendations (p153-154) recommends recording every
backtest conducted and deflating Sharpe by trial count before promoting to
live — same display-first → gated-promotion shape as our Sharpe Contract
dimension #5.

### V-LDP-5 · Heterogeneous fleet under one consensus gate (the quantamental architecture)
Ch 3 §3.8 (p53-54): *"You can always add a meta-labeling layer to any primary
model, whether that is an ML algorithm, an econometric equation, a technical
trading rule, a fundamental analysis, etc."* Project Ari's 12 strategies span
exactly this range — RSI/EMA technical, whale-flow fundamental, sentiment-based,
macro-correlation. One Fleet Consensus gate sits over all. Validates the
architecture choice with the formal name of the pattern.

### V-LDP-6 · Day 8 INV-3 (regime-agnostic mean-rev/contrarian at cycle level)
Implicit validation through Ch 11's general principle: "Develop models for
entire asset classes or investment universes, rather than for specific
securities" (p154). Our cycle classifier doesn't gate strategy selection on
regime; strategies fire on signal logic that incorporates regime where
internally relevant. Same shape.

---

## Cross-references with Donadio/Ghosh entry

Where this book deepens, refines, or contradicts the prior Library entry.

### Sharpe Ratio — book deepens Donadio/Ghosh significantly
- **Donadio/Ghosh (Packt p203-204):** introduces Sharpe as the standard
  risk-adjusted return ratio, implicitly assumes IID Gaussian returns,
  no multiple-testing correction, no skewness/kurtosis correction.
- **López de Prado (Ch 14):** PSR + DSR explicitly correct for non-Gaussian
  returns AND multiple testing. Marcos' Third Law makes the multiple-testing
  point load-bearing.
- **Resolution:** Donadio/Ghosh's Sharpe is the input; López de Prado's PSR/DSR
  is the qualifier on it. Both ship together on the Sharpe metric service.

### Backtesting — books take opposite positions
- **Donadio/Ghosh (Packt Ch 9):** treats backtesting as a development tool
  (for-loop vs event-driven, in-sample vs out-of-sample, paper trading as
  forward backtesting). Pragmatic, practitioner.
- **López de Prado (Ch 11):** *"Backtesting is not a research tool. … By the
  time you are backtesting, it is too late."* CV-on-financial-data (Ch 7)
  must be purged-and-embargoed.
- **Resolution:** Donadio/Ghosh's framework is fine for sanity-checking
  AFTER strategy design (which Project Ari doesn't currently do — we're in
  forward paper trading, not backtesting). López de Prado's warning applies
  to using backtests to FIND/TUNE strategies (which Project Ari might do
  tomorrow, hence CF-LDP-1).

### Bet Sizing / Kelly — Donadio/Ghosh is the practitioner reference; this book is a different framework
- **Donadio/Ghosh (Packt p213-221):** Risk-scaling system, monthly performance
  ramping, Kelly mentioned in passing. Practitioner-grade.
- **López de Prado (Ch 10):** Bet sizing from ML predicted probabilities,
  meta-labeling-derived. Not Kelly.
- **Resolution:** these are non-overlapping frameworks. Donadio/Ghosh's
  risk-scaling system endorses the display→soft→hard gate progression. López
  de Prado's Ch 10 is for sizing each individual bet from a probability
  classifier (relevant when meta-labeling is shipped, Lift #3 future).
  **Kelly itself remains a Poundstone read.**

### Mean Reversion small-sample diagnosis
- **Donadio/Ghosh (Packt Ch 5):** vol-adjusted Mean Reversion recipe
  (D-21 codified the asymmetry: vol UP → entry/smoothing scale UP, profit-take
  scales DOWN). Gives us the redesign.
- **López de Prado (Ch 15):** `probFailure` algorithm gives us the diagnostic
  to run BEFORE proposing the redesign. The 26.6% WR / 79 trades pattern's
  significance is computable, not a guess.
- **Resolution:** these are sequential, not competing. Run `probFailure` first
  (this book), then if redesign warranted, apply vol-adjustment recipe (prior
  book). Both ship for Day 14 Item 2.

### Fleet allocation roadmap
- **Donadio/Ghosh (Packt Ch 10):** D-22 path Uniform → PnL-Sharpe → Markowitz
  → Regime-Predictive. Skip PnL-only. Reference impl `github.com/sghoshusc/stratandport`.
- **López de Prado (Ch 16):** HRP replaces Markowitz. Reference impl in scipy +
  Snippets 16.1-16.4. Plus Ch 11 §11.5 "models for entire asset classes
  not specific securities" as the philosophical basis.
- **Resolution:** D-22 needs forward-warning extension. Path becomes
  Uniform → PnL-Sharpe → HRP → Regime-Predictive. Donadio/Ghosh's Markowitz
  reference impl is now a reference for "the obvious-looking middle step that
  HRP improves on," not the destination.

---

## Skip list

- Ch 1 — General motivation
- Ch 2 — Tick/dollar/volume bars don't apply to our 5-min metagraph cycle
- Ch 4 — Sample weights for ML training (not training yet)
- Ch 6 — Random forest / boosting (not training yet)
- Ch 8 — Feature importance (not training yet)
- Ch 9 — Hyper-parameter tuning (not searching parameters yet)
- Ch 13 — Synthetic-data backtesting (Monte Carlo, future)
- Ch 17 — Structural break tests (different shape from our regime classifier)
- Ch 18 — Entropy features on price sequences (advanced ML feature, future)
- Ch 19 — HFT microstructural features (Kyle's lambda, etc.) — order-book context, doesn't apply to AMM pools
- Ch 20-22 — Multiprocessing, vectorization, quantum computing — infrastructure not algorithm

---

## Vocabulary candidates for STATE.md §3 (per D-23 autonomy)

### V-LDP-1 · Deflated Sharpe Ratio (DSR) — STRONG, inscribe
The probability that a strategy's true Sharpe exceeds the expected maximum
Sharpe under the null hypothesis SR=0 across N independent trials. Corrects
raw Sharpe for: (1) selection bias from running N strategies, (2) non-Gaussian
returns (skewness, kurtosis), (3) finite track-record length. DSR ≥ 0.95 is the
standard 95% significance threshold. For Project Ari with 12 strategies, DSR
ships alongside the Sharpe service and refines what "soft-gate" means
quantitatively in Sharpe Contract dimension #5. Not "DSR replaces operator
target" — DSR is an upstream sanity floor; operator target remains the
meaningful gate above the floor.

### V-LDP-2 · Probabilistic Sharpe Ratio (PSR) — STRONG, inscribe
Sister of DSR. Probability that a strategy's true Sharpe exceeds a
user-specified benchmark SR* (typically 0 = "no skill"). Corrects for
non-Gaussian returns and finite track-record length, but NOT for multiple
testing — that's what DSR adds on top. PSR is the right metric for "is this
ONE strategy's Sharpe meaningful?"; DSR is the right metric for "is this
strategy meaningful given we tested 12 of them?" Both ship together.

### V-LDP-3 · Triple-Barrier Method (TBM) — STRONG, inscribe
Path-dependent labeling of a closed trade by which of three exit barriers
triggered first: profit-take (label +1), stop-loss (-1), or time horizon (0).
Project Ari already executes this exit logic; TBM is the formalization of the
labeling layer. Enables retrospective diagnosis (per-strategy exit-reason
distribution) and is the foundation for any future meta-labeling work
(Lift #3).

### V-LDP-4 · Meta-Labeling — STRONG, inscribe
Architectural pattern where a primary model decides bet side and a secondary
model decides bet size (including 0 = "don't take it"). Fleet Consensus 7-of-12
supermajority IS this pattern, just hand-coded as a heuristic instead of
trained. Naming the pattern lets us discuss the upgrade path (heuristic →
trained meta-model on triple-barrier labels) without re-deriving the
architecture each time.

### V-LDP-5 · Probability of Strategy Failure — STRONG, inscribe
Quantitative answer to "is this strategy's win rate viable given its asymmetric
payouts?" P[p < p_θ*] where p_θ* is the precision (win rate) below which the
strategy fails the target Sharpe θ*. Practical rule of thumb: discard if > 5%.
For Project Ari this becomes the small-sample-honest readout for Vol-Arb (n=18)
and the diagnosis-before-redesign step for Mean Reversion (n=79).

### V-LDP-6 · Hierarchical Risk Parity (HRP) — STRONG, inscribe
Three-stage portfolio allocation method (tree clustering → quasi-diagonalization
→ recursive bisection) that allocates weights based on the correlation
hierarchy without requiring covariance matrix inversion. Replaces Markowitz in
the Fleet Consensus evolution roadmap (D-22 forward-warning extension this
commit). Lower out-of-sample variance than Markowitz's CLA on Markowitz's own
objective, on portfolios that map exactly onto our 12-strategy structure.

### V-LDP-7 · Strategy risk vs portfolio risk — MEDIUM, inscribe later
Distinction from Ch 15 §15.2: portfolio risk = will my open positions lose
money this week (managed by Risk Configuration: drawdown, position size).
Strategy risk = will the strategy's edge fail to materialize over the long run
(managed by Sharpe Contract: DSR, probability-of-failure). Project Ari
conflates these in some places — "risk" on the Risk Config page is portfolio
risk; "risk" on the Sharpe panel is strategy risk. Worth inscribing once we
have a place where the distinction needs to be drawn explicitly. Defer to
when we ship the per-strategy Sharpe card; the page that displays both at
once will be where the term earns its keep.

### V-LDP-8 · Marcos' Three Laws of Backtesting — DEFER, useful as citation not vocabulary
- First Law (implied): "Backtesting is not a research tool." (p153)
- Second Law: "Backtesting while researching is like drinking and driving."
  (p154)
- Third Law: "Every backtest result must be reported in conjunction with all
  the trials involved in its production." (p204)
These are doctrinal quotes, not vocabulary terms. File as citations in
relevant decision-log entries when invoked, not as their own §3 row.

### V-LDP-9 · Time under Water (TuW) — DEFER, future
Time elapsed between a high-watermark and PnL recovering above the prior
maximum. Diagnostic complement to drawdown — same drawdown can have very
different TuW signatures. Ship to vocabulary when we surface it on a
diagnostic UI.

---

## Decision-log candidates for STATE.md §4 (D-NN proposals)

### D-NN-A · Sharpe Contract dimension #5 lock — EXTEND with DSR ≥ 0.95 sub-clause, do NOT re-open
**Status:** ready to inscribe.
The lock is intentionally inflexible by design (re-opening it is a high bar).
This read does NOT make the case for re-opening it. It DOES make the case for
extending it: the soft-gate criterion gains a sub-clause "raw Sharpe ≥ operator
target AND DSR ≥ 0.95" without changing the operator-input semantics. DSR is
the multiple-testing sanity floor; operator target remains the meaningful gate
above that floor.

### D-NN-B · D-22 forward-warning extension — Fleet Consensus path replaces Markowitz with HRP
**Status:** ready to inscribe.
D-22 currently reads Uniform → PnL-Sharpe → Markowitz → Regime-Predictive.
This read replaces Markowitz with HRP for documented out-of-sample-variance
reasons. PnL-only stays skipped. Regime-Predictive stays as the destination.
Reference impl: scipy hierarchy + López de Prado Ch 16 Snippets 16.1-16.4.
Filed alongside D-22 as a forward-warning extension, not a rewrite — the
Markowitz warning in D-22 is still correct (PnL-weighted is structurally
opposed to either Markowitz or HRP), only the destination shifts.

### D-NN-C · Day 14 worksheet — pre-flight diagnostics (probFailure + TBM exit-distribution) before any redesign proposal
**Status:** propose to inscribe.
The Day 14 worksheet plans to read paper-trading data → propose redesigns of
Mean Reversion and Momentum Cascade. López de Prado's Second Law of Backtesting
warns this can become a multiple-testing failure mode. Cure: insert pre-flight
diagnostic steps before any redesign proposal:
1. Run `probFailure(returns, freq, target_sr)` on each candidate strategy. If
   `P[fail] < 0.05`, the strategy is fine; the WR is consistent with positive
   Sharpe given the asymmetric payouts. Honor that if it's the answer.
2. Run TBM exit-barrier distribution. Different distributions imply different
   redesigns (stop-loss-heavy = entries wrong; time-heavy = no edge;
   profit-take-small = thresholds tight).
3. Then propose redesign, behind feature flag, as the worksheet already
   specifies.
This is a soft revision to the worksheet, not an abort. Filed as a decision
because the discipline change is worth recording, not just a worksheet edit.

### D-NN-D · Inscription-autonomy nuance — DSR threshold correction
**Status:** propose to inscribe (small).
Mark's prior framing of DSR threshold as "DSR ≥ 0" was actually "DSR ≥ 0.95"
in the source. Operator-named project terminology (D-20) is verified by use,
not morpheme search; operator-relayed source claims should be verified against
the source, gently. Filing this small correction as a precedent for how the
Library system handles "operator framing differs from source on a precise
technical claim" — Ari files the source-accurate version with a footnote on
the prior framing, no redo, no friction.

---

## End notes

This book sits at peak relevance for Project Ari's current shape. Re-read Ch
14 (DSR) and Ch 15 (Strategy Risk) before shipping the Sharpe metric service.
Re-read Ch 3 (Meta-Labeling) before any Fleet-Consensus mechanism redesign.
Re-read Ch 16 (HRP) when D-22 path is activated. Skip the rest unless the
specific topic surfaces.

Reference repo for HRP: scipy `scipy.cluster.hierarchy.linkage` + López de
Prado's own Snippets 16.1-16.4 on his M Lab GitHub.

Cross-link: extends `MemoryBank/Library/learn-algorithmic-trading.md` —
Donadio/Ghosh is the practitioner foundation; this book is the modern,
small-sample-honest, multiple-testing-aware refinement on top. Both stay on
the shelf permanently. They do not duplicate.