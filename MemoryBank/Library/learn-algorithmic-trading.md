# Learn Algorithmic Trading
**Donadio & Ghosh · Packt 2019 · 378 pp · ISBN 978-1-78934-834-7**

## Why it matters to Ari

This is a working practitioner's textbook — not a theory volume. Two of its chapters (Ch 6
Risk and Ch 10 Adapting) map almost 1:1 onto load-bearing pieces of Project Ari that we
just shipped or are about to redesign: the Sharpe Contract panel (Ch 6), the Mean Reversion
redesign queued for Day 14 (Ch 5 §"volatility-adjusted mean reversion" reports a +200%
performance lift from the recipe we'd be applying), and the entire **Fleet Consensus**
allocation evolution beyond equal-weight voting (Ch 10's Portfolio Optimization deep dive
is the most directly actionable chapter in the book). The book also explicitly endorses our
display-first → soft-gate → hard-gate doctrine (p213-214) and the paper/live cohort
separation we locked into Sharpe-dimension #4 (Ch 9 keeps `paper_position` and `position`
as parallel attributes inside the same strategy class). Three counterfactuals worth flagging
to the decision log live in here too: book's Sharpe primary horizon is weekly (ours is
per-trade), volatility adjustment *degrades* trend-following in their results (relevant to
Momentum Cascade redesign), and Markowitz deliberately allocates risk to losing strategies
because uncorrelated returns offset portfolio variance (counterintuitive vs "kill the worst
performer").

---

## Top 5 Lifts (ranked by leverage)

### 1. Volatility-adjusted mean reversion recipe — apply to tomorrow's Mean Reversion redesign
**(p144-148, "Mean reversion strategy that dynamically adjusts for changing volatility")**

Mean Reversion currently sits at 26.6% WR / 79 trades / p<0.001 vs 50%. Book's recipe:
compute `stdev` over a 20-period window, derive `stdev_factor = stdev / 15` (15 ≈ avg
historical stdev for that instrument; for us → calibrate against TAO/USD volatility regime,
not 15), then apply three distinct multipliers:

- `K_FAST * stdev_factor`, `K_SLOW * stdev_factor` → faster-reacting EMAs in volatile
  periods (smoothing factor scales UP with vol)
- `APO_BUY_THRESHOLD * stdev_factor`, `APO_SELL_THRESHOLD * stdev_factor` → entry
  thresholds widen in volatile periods (less aggressive entry when noisy)
- `MIN_PROFIT_TO_CLOSE / stdev_factor` → exit thresholds shrink in volatile periods (lock
  profit faster when noisy, because holding is riskier)

Book reports: **"adjusting the trading strategy for volatility increases the strategy
performance by 200%!"** (p148, screenshot caption). That's a concrete number on the same
fundamental algorithm we run. The pattern is portable: any signal threshold becomes
`threshold * f(volatility)` or `threshold / f(volatility)` depending on whether high vol
should make the strategy more or less aggressive at that decision point.

**Implementation hint:** the three multipliers are not symmetric. Entry thresholds and
smoothing factors scale UP with vol; profit-take thresholds scale DOWN. This three-way
asymmetry is the actual insight, not the formula itself. For Ari: pre-compute `stdev_factor`
once per cycle in the strategy's signal layer (Day 8 invariant safe — internal to strategy,
regime classifier untouched).

### 2. Fleet allocation roadmap — Uniform → PnL → PnL-Sharpe → Markowitz → Regime-Predictive
**(Ch 10 §"Portfolio optimization", p348-352)**

Fleet Consensus is currently equal-weighted vote = identical to book's **Uniform** method,
which the book's own results show is the **worst** of all five methods tested (lowest
average PnL, second-highest variance — Fig. p351-352). Book ranks the five methods on a
12-futures portfolio (we have 12 strategies — direct structural match):

| Rank | Method | Avg daily PnL | Daily risk | Notes |
|------|--------|--------------|-----------|-------|
| Worst | Uniform | $20K | $500K | What we have today |
| 4th | PnL-Sharpe | mid | mid | Markowitz without correlation |
| 3rd | Markowitz | $25K | $300K | **Lowest variance** |
| 2nd | Individual PnL | $80K | $4.7M | High return, unusable risk |
| **Best** | **Regime-Predictive** | **$180K** | **$1.8M** | **5× return at 6× risk** |

Reference implementation at `github.com/sghoshusc/stratandport` (p348) — uses cvxopt for
Markowitz, scikit-learn for regime classifier. The author's own code, on a 12-strategy
portfolio.

**Implementation hint:** this is the natural progression for Fleet Consensus AFTER live
sample sizes are sufficient. Don't skip levels. Specifically: PnL-Sharpe before Markowitz
(adds variance penalty without correlation matrix complexity), Markowitz before Regime
(needs covariance from history). Each stage gates on data sufficiency the same shape as the
warmup-gate doctrine. Crucial counterfactual buried here: **Markowitz allocates risk to
losing strategies on purpose** because their losses anti-correlate with the rest of the
portfolio's losses (p350). This contradicts the obvious "rank by PnL, drop the bottom"
intuition.

### 3. Risk-scaling system — start at minimum, ramp on monthly performance
**(Ch 6 §"Realistically adjusting risk", p213-221)**

Book's quantitative gate-progression mechanism, directly applicable to our display→soft→hard
gate journey. Start `num_shares_per_trade = MIN (= 1)`, increment by `INCREMENT (= 2)`
after each profitable month, decrement after each losing month, bounded by
`MIN ≤ size ≤ MAX (= 50)`. All risk limits scale together (weekly stop-loss, monthly
stop-loss, max position, max trade size — all defined as `BASE + N * INCREMENT`).

Quote that endorses our doctrine verbatim (p213):

> "When a new algorithmic trading strategy is built and deployed, it is first deployed
> with very low-risk limits—usually the least amount of risk possible. […] After a couple
> of days or weeks, when initial bugs have been worked out and strategy performance is in
> line with simulation performance, it is slowly scaled up to take more risks in order to
> generate more profits. Conversely, after a strategy goes through a bad patch of losses,
> it is often reevaluated at reduced risk limits."

**Implementation hint:** our current `risk_config.json` has `max_position_size_pct` as a
single static cap. Adding a scale-state (e.g. `live_scale_step: 0..N`, with all limits
defined as `base * (1 + step * increment)`) gives us a quantitative knob for the gate
progression rather than a binary flip. The monthly cadence is too slow for our throughput
— probably scale per-week for paper, per-2-weeks for live, but the structure is identical.

### 4. Sortino ratio as Sharpe sibling — asymmetric risk for asymmetric expectations
**(Ch 6 §"Sharpe ratio", p203-204)**

> "Sortino ratio […] only uses observations where the trading strategy loses money and
> ignores the ones where the trading strategy makes money. The simple idea is that, for a
> trading strategy, upside moves in PnLs are a good thing, so they should not be considered
> when computing the standard deviation. Another way to say the same thing would be that
> only downside moves or losses are actual risk observations."

`sortino = mean(pnls) / stdev(losses_only)`. Mathematically a one-line addition next to our
Sharpe display. Conceptually a *better* fit for our use case than Sharpe: we have explicit
asymmetric expectations (drawdown-bounded, no-symmetric-volatility-target). Worth
displaying *alongside* Sharpe in the same panel since they answer slightly different
questions and the divergence between them is itself diagnostic (`Sortino - Sharpe` ≈ how
much of our std-dev is upside vs downside).

**Implementation hint:** when we eventually wire up the actual Sharpe metric (still queued
as of Day 14 evening — we shipped the contract panel, not the calculation), compute Sortino
in the same pass. Same numerator, denominator changes from `stdev(pnls)` to
`stdev([p for p in pnls if p < 0])`. Free metric.

### 5. The "severity of risk violations" three-tier model
**(Ch 6 §"Severity of risk violations", p192)**

Book's three-tier model lines up with our display/soft-gate/hard-gate progression but at a
different axis (per-event severity, not per-strategy maturity):

1. **Warning** — unusual but acceptable; alert operator, keep trading
2. **Liquidate-and-shutdown** — strategy hits its lane line; close positions, cancel new
   entries, stop until operator restarts
3. **Maximum / freeze** — flash-crash-class event; STOP all order flow immediately, hand
   off to human

This is orthogonal to but compatible with our maturity-axis gates. We could (eventually)
overlay a severity axis on top: a per-event escalator independent of whether the strategy is
in display, soft-gate, or hard-gate mode. For Day 14 it's not actionable, but it's the right
mental model for when we add per-event circuit breakers later.

---

## Full Lifts (the long list)

### Chapter 5 — Sophisticated Algorithmic Strategies

- **Volatility-adjusted mean reversion** (p144-148) — see Top Lift #1.
- **Volatility-adjusted trend-following degrades performance** (p153-155) — book reports
  the same vol-adjustment recipe applied to a trend-follower **reduced** PnL. Counterfactual
  against blanket adoption. Relevance to **Momentum Cascade redesign**: think twice before
  applying the same vol-recipe to it. Different signal class, different vol response.
- **Statistical arbitrage signal aggregation** (p171-176) — final signal is a
  correlation-weighted sum of pairwise predictions, normalized by sum of correlation
  magnitudes. Pattern: when one relationship breaks, others compensate. Direct theoretical
  underpinning for our Fleet Consensus design philosophy ("12 strategies so when one fails,
  the vote survives") — book quote (p176): *"StatArb benefits from having multiple leading
  trading instruments, because when relationships break down between specific pairs, the
  other strongly correlated pairs can help offset bad predictions."*
- **APO (Absolute Price Oscillator)** as the underlying signal (p134) — APO = Fast EMA −
  Slow EMA. Defaults: 10-day fast, 40-day slow. Lower = oversold (mean-rev: BUY,
  trend-follow: SELL). Higher = overbought (mean-rev: SELL, trend-follow: BUY). Same
  signal, opposite trading rules between the two strategies — clean validation of why
  trend + mean-reversion is the canonical complementary pair (book p347).
- **MIN_PRICE_MOVE_FROM_LAST_TRADE** anti-overtrading guard (p137) — refuse to trade
  again at/around the same price as the last trade. Cheap, effective. Worth checking
  whether our 12 strategies all have this kind of guard or whether some over-trade noise.
- **Z-score based pair-trading exit logic** (p123) — enter when Z hits ±1, exit when Z
  re-enters [−1, +1] (i.e. equilibrium reached). Symmetric, intuitive. Relevant if we ever
  add a true pair-trading strategy.

### Chapter 6 — Managing the Risk of Algorithmic Strategies

- **Three risk severity tiers** — see Top Lift #5.
- **Risk-scaling system** — see Top Lift #3.
- **Sharpe ratio formula** (p203) — `mean(pnls) / stdev(pnls)` over chosen time horizon.
  Book uses **weekly** as primary horizon (counterfactual to our per-trade lock). Also
  notes: when computed over very short horizons, Sharpe gets very small numerical values
  (book reports 0.095 weekly), which is why it's traditionally annualized — but the
  annualization with √N can mislead if returns aren't iid. Our locked footnote requirement
  is well-founded.
- **Sortino ratio** — see Top Lift #4.
- **Stop-loss with timeframe** (p194-195) — stop-loss isn't a single number, it's a
  number-per-timeframe (daily, weekly, monthly, lifetime). Book's calibration on its
  reference strategy: daily/weekly/monthly bins, take the 100th percentile of historical
  losses, scale by 1.5x as cushion. Ari currently has `max_drawdown_pct` only — could be
  extended to `max_drawdown_pct_daily / weekly / monthly` for tighter control.
- **Max drawdown computation** (p196-198) — running peak-to-trough on cumulative PnL. We
  track this; book's implementation matches what's already in our analytics pipeline.
- **Position holding time** (p200-201) — distribution of how long positions stay open
  before flipping. Useful diagnostic, especially for detecting when a strategy starts
  holding losers longer than usual (regime-shift tell).
- **Variance of PnLs** (p201-202) — std-dev of weekly returns. Already implicit in Sharpe
  but worth surfacing on its own as a portfolio-stability metric.
- **Maximum executions per period** (p204-206) — interval-based counter that resets each
  window. Cheap protection against runaway algos. Only really useful for HFT-class
  strategies, less so for our cycle cadence — but if we ever go to per-tick execution this
  is the canonical guard.
- **Maximum trade size** (p207) — per-trade size cap, distinct from total position cap.
  Anti-fat-finger and anti-bug. Worth adding as a separate `max_single_trade_pct` field
  alongside `max_position_size_pct`.
- **Volume limits** (p207) — total traded volume across a period, also distinct from
  position. Detects over-trading even when net position stays bounded.
- **Calibration heuristic: 150% of historical maxima** (p208) — quote: *"It is possible
  that there is a day in the future that is very different from what we've seen
  historically."* Practical, simple, defensible. We should consider this when setting
  guardrail defaults — they should be CALIBRATED, not picked.
- **Knight Capital incident** (p189) — $440M loss in 45 minutes from a software bug. Book
  uses this as the canonical "why risk limits exist" war story. Cite-able when defending
  why we ship behind feature flags and refuse to mid-flight-edit Day 8 invariants.
- **Software bugs as #1 most-overlooked risk source** (p188) — quote: *"Software
  implementation bugs are often the most overlooked source of risk in algorithmic
  trading."* Direct validation of our test-discipline, AST-clean-on-every-commit, Day-8
  invariants-30/30 doctrine.
- **Black-box vs gray-box** (p190) — pure-autonomous vs autonomous-with-operator-overrides.
  Project Ari is gray-box (operator on Risk Config slider, manual feature-flag gates).
  Book endorses gray-box as the realistic mode for actively-evolved strategies.
- **Spoofing / Quote stuffing / Banging the close** (p186-188) — illegal manipulation
  practices. Not relevant to us (DeFi/Bittensor pool, no order book, no other participants
  to spoof against). Worth knowing what they ARE in case we ever read TradFi research and
  see the terms.

### Chapter 9 — Creating a Backtester in Python

- **For-loop backtester is "most optimistic"** (p307) — perfect fills, no drawdown
  protection, no position limits. Book explicitly warns this overstates returns. Our
  pre-trade simulator is closer to event-driven (k-preserving rebalance, liquidity cliffs)
  — already past the for-loop weakness, validation rather than lift.
- **Event-driven backtester via deque queues between components** (p310-313) — uses
  `deque` per-channel between LP, OB, TS, OM, MS, GW. Each tick generates events that
  cascade through all components. This is the architecturally-correct pattern for what
  our pre-trade simulator is gradually becoming. Worth the structural mapping when we
  generalize the simulator.
- **Paper-trading and live-trading parallel-tracked in same class** (p315) — book's
  `TradingStrategyDualMA` keeps `self.position`/`self.pnl` and `self.paper_position`/
  `self.paper_pnl` simultaneously. **Direct validation** of our locked Sharpe dimension
  #4: paper and live tracked separately. Not just convention — the book treats it as the
  obvious correct shape.
- **Fill ratio modeling** (p318-319) — drop fill ratio to 10% in the market simulator and
  PnL collapses. Demonstrates how sensitive results are to fill assumptions. Our
  pre-trade simulator's liquidity cliffs (1%/2%/5%) are a coarser version of the same
  idea — we're modeling fill *quality*, not fill *rate*, but the principle is identical.

### Chapter 10 — Adapting to Markets

- **Fleet allocation methods** — see Top Lift #2 and the dedicated DEEP DIVE section below.
- **Simulation dislocation** (p322 onwards) — book's term for the gap between
  backtester/simulator output and live-trading output. They distinguish **pessimistic
  bias** (live > simulated) from **optimistic bias** (live < simulated), both as constants
  and as variables that depend on regime/strategy/parameters. This is a vocabulary
  candidate (see end of file).
- **Slippage** (p327) — expected vs actual trade prices. Causes: market data playback
  issues, latency assumptions, market impact. We model this implicitly via reserve-shift
  math but don't currently surface a "slippage delta" metric. Worth adding.
- **Fees** (p327) — per-share/contract trading cost. We have Bittensor pool fees implicit
  in the k-preserving rebalance. Worth surfacing explicitly in the simulator output as
  "fees-paid this trade" so operator sees them.
- **Place-in-line estimates** (p329) — relevant to FIFO/pro-rata exchanges, NOT to our
  AMM pool environment. Skip-list candidate — but worth knowing the term so when we read
  TradFi material we can recognize it as inapplicable.
- **Market impact** (p329-330) — non-linear: profit doesn't grow linearly with size,
  there's a saturation point where additional risk doesn't add profit. Our liquidity
  cliffs (1%/2%/5%) ARE a market-impact model. Validation rather than lift.
- **Latency variance** (p328-332) — book emphasizes that latency isn't a single number,
  it's a distribution that varies by market activity. Not currently relevant for us
  (cycle-cadence trading, latency dwarfed by tick interval) — but if we ever go
  shorter-horizon this becomes important.
- **Signal/profit decay catalog** (p335-341):
  1. Signal decay due to lack of optimization (parameters go stale)
  2. Signal decay due to absence of leading participants (the players the signal tracked
     left)
  3. Signal discovery by other participants (signal becomes crowded, edge erodes)
  4. Profit decay due to exit of losing participants (zero-sum: when the donors leave, the
     winners can't make money)
  5. Changes in underlying assumptions/relationships (regime shift)
  6. Seasonal profit decay (some signals work in some regimes only)
  We see Cause #5 most clearly — Mean Reversion's 26.6% WR is consistent with "underlying
  assumption (mean-reverts) doesn't hold in current TAO regime." Cause #1 also relevant if
  parameters are static.
- **Trading signals dictionary/database** (p341-342) — long-running database of
  `<signal, instrument, parameters>` tuples scored by predictive power over time. Sophisticated
  participants run thousands of variants. Aspirational for Ari — not buildable today,
  but a future direction worth registering.
- **Signal/strategy optimization pipeline** (p343-344) — grid search, convex optimization,
  SGD, genetic algorithms applied to signal parameter spaces. We don't optimize today.
  When we do, this is the menu of techniques.
- **Strategy complementarity rules** (p347):
  - Trend-following + Mean-reversion — opposing views on breakouts (canonical pair)
  - Pairs-trading + Stat-arb — same-instrument-set, different relationship hypotheses
  - Event-based + (trend OR mean-reversion) — uncorrelated drivers
  Validates the diversification rationale of our 12-strategy fleet. Implicit answer to
  "should the 12 strategies overlap or be different?": **different in driver class, not
  just different in parameter values**.
- **"Don't manually intervene"** (p328) — book quote: *"For automated trading algorithms,
  which have been backtested extensively, manual intervention is a bad idea because
  simulated results can't be realized and they affect the expected versus realized
  profitability."* Validates Ari's autonomous-by-default doctrine.

---

## Counterfactuals

### CF-1 · Sharpe primary horizon: book = weekly, ours = per-trade
Book consistently uses weekly as primary Sharpe horizon (p203, p215). Lock dimension #3
of our Sharpe Contract specifies **per-trade primary, daily secondary**. Justified for us
because (a) trade frequency is sparse-to-moderate, not HFT; (b) per-trade gives
finer-grained attribution to specific signal events; (c) we explicitly annotate
annualization with √N footnote so the headline number doesn't mislead. The book's choice
is appropriate for daily-cadence stock strategies; our choice is appropriate for
event-driven crypto trading. **Document the divergence in the Sharpe panel itself when we
wire up the calculation, not just here.**

### CF-2 · Volatility adjustment helps mean-reversion (+200%) but DEGRADES trend-following
Book p148 vs p155: identical recipe applied to mean-reversion strategy gave +200% PnL,
applied to trend-following strategy **reduced** PnL. Reason (per book): trend-following
needs aggressive entry on signal continuation; widening thresholds in volatile periods
makes trend-followers miss the very breakouts they're built to catch. **Implication for
Day 14:** when we redesign Momentum Cascade, do NOT default to "vol-adjust everything."
The asymmetry between mean-rev and trend-follow vol-adjustment is the lesson, not the
recipe. Worth a STATE.md decision-log entry if/when we start applying vol-adjustment to
strategies.

### CF-3 · Markowitz allocates risk to LOSING strategies on purpose
Book p350: *"While in other allocation methods, the risk allocation for strategies that
have poor performance would have dropped close to 0, here even losing strategies have
some allocation assigned to them. This is because the periods in which these losing
strategies make money offsets periods where the rest of the portfolio loses money, thus
minimizing overall portfolio variance."* This is counterintuitive vs the obvious "rank by
PnL, drop the bottom" Fleet-evolution path. **Implication:** when we move Fleet Consensus
beyond uniform, the simplest upgrade (PnL-weighted) is NOT a stepping stone toward
Markowitz — it actually CONTRADICTS Markowitz's mechanism. PnL-weighted concentrates,
Markowitz diversifies on covariance. We need to choose which philosophy we want before we
implement either.

### CF-4 · Book's calibration is "150% of historical max"; ours is currently "operator-set"
Book p208 sets risk limits at 150% of historically observed maxima — purely data-driven,
no operator input. Our current Risk Config is operator-set with implied-target advisory
from current guardrails. Both have failure modes: book's is too tight after a bad
historical streak, ours is too vague when operator has no calibration data. **Hybrid
forward path:** use book's 150% rule to compute a *recommended* default, surface it as the
implied-target advisory, let operator override. We're already 80% of the way there with
the Sharpe Contract panel — would just be extending the same pattern to the rest of the
guardrails.

---

## Validations

The book endorses or implies the following design decisions Project Ari has already made.
Cite-able ammo when defending the architecture.

- **Display-first → soft-gate → hard-gate progression** ← Book p213-214 endorses verbatim:
  start at minimum risk, scale up after good performance, scale down after bad.
- **Paper / Live cohort separation** ← Book p315: `paper_position`/`position` parallel
  attributes inside the same class. Treated as obvious correct shape.
- **12 diverse strategies, not 1 deeply-tuned strategy** ← Book p340, p347: diverse
  uncorrelated strategies reduce simultaneous-loss risk; trend-follow + mean-rev is the
  canonical complementary pair.
- **Autonomous-by-default, operator-overridable** ← Book p328: manual intervention hurts
  expected vs realized PnL alignment.
- **Day 8 invariants enforced on every commit** ← Book p188: software bugs are the #1
  most overlooked source of risk in algorithmic trading. Knight Capital lost $440M in 45
  minutes from one.
- **Pre-trade simulator with liquidity cliffs (1/2/5% pool)** ← Book p329-330: market
  impact is non-linear; modeling it as cliff-thresholds is a coarse but valid market-impact
  model.
- **Sharpe Contract's metric-definition-is-read-only doctrine** ← Book p325: *"the lack
  of [an accurate backtester] will cause inaccuracies in measuring expected risk limits."*
  By extension, mid-flight redefinition of the metric itself is a category-worse error.
- **Operator-input HODL baseline as risk-free floor (lock dim #2)** ← Book doesn't
  explicitly cover this (it uses risk-free=0 in the Sharpe calc on p203), but it's
  consistent with the spirit: risk-free floor is a JUDGMENT CALL, not a market datum, so
  surfacing it as operator input is the honest move.

---

## Fleet Allocation Methods (Ch 10) — DEEP DIVE

Fleet Consensus today: **equal-weighted vote** across 12 strategies. This maps directly to
**Uniform allocation**, which book's own results rank as the worst-performing of the five
methods tested. Below: the five methods, in increasing complexity, with the actual numbers
the book reports on a 12-futures portfolio (mean-rev + trend-follow + stat-arb +
pairs-trade applied to 12 instruments — same shape as our 12-strategy fleet).

### M1 — Uniform Risk Allocation
**What it does:** distribute total risk budget equally across all strategies.
**Project Ari fit:** identical to current Fleet Consensus equal-vote.
**Data needed:** none.
**Complexity:** trivial.
**Book result:** lowest avg-PnL ($20K), 2nd-highest variance ($500K). Quote (p349):
*"In practice this is rarely ever used"* — except as the bootstrap before any history
exists.
**Verdict:** what we have today. Book's results say it's the floor, not the ceiling.

### M2 — PnL-Based Risk Allocation
**What it does:** rebalance monthly. Each strategy's allocation is proportional to its
recent average PnL. Best performers get most risk.
**Project Ari fit:** straightforward extension. We already track per-strategy PnL.
**Data needed:** rolling per-strategy PnL window (1+ months suggested).
**Complexity:** low — one division per rebalance.
**Book result:** very high avg-PnL ($80K) but unusable risk ($4.7M daily std). Concentrates
into whoever's hottest. Book quote (p349): *"the strategy with the best historical
performance ends up with the majority of the risk allocation. […] strategies that haven't
been performing as well as their peers gradually have their risk cut down to a very small
amount and often don't recover from there."*
**Verdict:** trap. Looks like the obvious upgrade to Uniform but actually has worse
risk-adjusted returns than Markowitz. Skip-or-skip-quickly.

### M3 — PnL-Sharpe-Based Risk Allocation
**What it does:** allocation proportional to (avg PnL / std-dev of PnL) per strategy. Penalizes
high-volatility returns.
**Project Ari fit:** one step beyond M2; needs per-strategy PnL std-dev.
**Data needed:** rolling per-strategy PnL std-dev (similar window to M2).
**Complexity:** low-medium — one division per strategy per rebalance, plus running
std-dev.
**Book result:** middle of the pack. Solves the "concentrate into volatile winner" problem
of M2 but doesn't account for inter-strategy correlation, so portfolio variance can still
spike when multiple strategies happen to lose together.
**Verdict:** reasonable transition from Uniform. Natural fit alongside the Sharpe Contract
panel we just shipped — once we wire up the Sharpe calculation, the per-strategy Sharpe
becomes the allocation weight. Two birds, one calc.

### M4 — Markowitz Allocation
**What it does:** convex optimization over the strategy-return covariance matrix. Maximize
expected portfolio return subject to a portfolio-variance ceiling. Allocates risk to
*uncorrelated* strategies, including some losers, because their losses anti-correlate with
the rest.
**Project Ari fit:** structurally compatible with our 12-strategy fleet. Needs a
covariance matrix (12×12 = 144 entries, manageable).
**Data needed:** stable per-strategy return history, AND that the inter-strategy
correlations are stable enough to estimate. Probably 100+ rebalance windows of data
before this is reliable. We're not there yet on paper, certainly not on live.
**Complexity:** medium-high — needs cvxopt or similar convex solver. Reference impl exists
at `github.com/sghoshusc/stratandport`.
**Book result:** **lowest portfolio variance** ($300K), modest avg-PnL ($25K). Sharpe
(roughly $25K/$300K) ≈ 0.083 — actually beats every method except Regime-Predictive on a
risk-adjusted basis.
**Verdict:** this is the destination for the foreseeable Fleet Consensus evolution.
Conservative, mathematically principled, not faddish. The right "v2" once we have enough
live history to estimate a stable covariance matrix.

### M5 — Regime-Predictive Allocation
**What it does:** ML model takes economic/market features as input, predicts which
strategies will perform best in the *current* regime, allocates accordingly. Adaptive in
real-time, not just rebalance-cadence-time.
**Project Ari fit:** powerful but complex. We already have a regime classifier (Day 8
invariant: one canonical classifier). The classifier output could be one of the input
features.
**Data needed:** historical regime labels for each window + per-strategy performance per
regime. A LOT of data. Book mentions this is still "actively being researched" (p351).
**Complexity:** high. ML infrastructure, retraining pipeline, model-degradation detection.
**Book result:** **best by far** — $180K avg-PnL ($900M cumulative) at $1.8M daily risk.
Sharpe ≈ 0.10. Quote (p352): *"makes it the best-available allocation method in practice,
thus also validating why it's an active research area right now."*
**Verdict:** the prize. Don't reach for it before earning Markowitz first. When we get
there, the existing Day-8 regime classifier is a head start — the rails are partly laid.

**Recommended Fleet evolution path:** **Uniform (today) → PnL-Sharpe (M3, after Sharpe
calc ships) → Markowitz (M4, after live covariance is stable) → Regime-Predictive (M5,
research-mode).** Skip M2 (PnL-only) entirely — it's a worse Sharpe than M3 with no extra
intuitiveness benefit.

---

## Risk Measures Catalog (Ch 6) — DEEP DIVE

Compare book's risk-measure catalog against current `risk_config.json`. What's there,
what's missing, what's there-but-undervalued.

| Book risk measure | In our risk_config? | Notes |
|------|--------------------|-------|
| Stop-loss (with timeframe: daily/weekly/monthly/lifetime) | Partial | We have `max_drawdown_pct` (single number). Book's pattern: separate budgets per timeframe. Worth extending. |
| Max drawdown | ✓ | `max_drawdown_pct`. Same definition as book. |
| Position limits (separate long/short) | Partial | We have `max_position_size_pct`. Book separates max-long from max-short. For us, since TAO trades both directions, this would be `max_long_pct` + `max_short_pct`. Probably overkill until we see asymmetric edge. |
| Position holding time | ✗ | Not in config. Useful diagnostic. Particularly informative for detecting "strategy is holding losers longer than usual" (regime-shift tell). |
| Variance of PnLs | ✗ | Not in config. Implicit in Sharpe (denominator) once we wire it up. |
| Sharpe ratio target | ✓ | `sharpe_target_score: 75` (just shipped). |
| Sortino ratio target | ✗ | Not yet. See Top Lift #4. Cheap addition alongside Sharpe. |
| Max executions per period | ✗ | HFT-relevant; lower priority for our cadence. |
| Max trade size (per-trade cap) | ✗ | Distinct from position cap. Anti-fat-finger. Worth adding as `max_single_trade_pct`. |
| Volume limits (total traded volume per period) | ✗ | Detects over-trading even when net position stays bounded. Lower priority. |
| Confidence-score floor | ✓ | `min_confidence_score`. Not in book — Ari-specific. Validates that we have the right level of feature-set even if we're missing some traditional ones. |

**What's underweighted in our current catalog:** position holding time (high diagnostic
value, low cost to add), max trade size (anti-bug), Sortino (free given Sharpe).

**What we have that book doesn't emphasize:** confidence-score floor — book talks about
strategy-level "sufficient signal strength" qualitatively (p185) but doesn't bake it in
quantitatively the way our `min_confidence_score` does. Validation that we have a
non-traditional but valuable lever.

---

## Sharpe Ratio — book's treatment vs our 5 locked dimensions

| Lock dim | Our choice | Book's treatment | Verdict |
|----------|------------|------------------|---------|
| **1. Numeraire** | TAO + USD side-by-side, never blended | Book operates in a single base currency (USD) per strategy; doesn't address the multi-currency-numeraire problem. | **Extension.** Book doesn't go here because it doesn't have to. We do. Our lock is principled. |
| **2. Risk-free floor** | HODL baseline, operator-input | Book uses risk-free = 0 in its Sharpe calc (p204): `sharpe_ratio = mean(weekly_pnls) / stdev(weekly_pnls)` — no `r_f` term. Doesn't argue for it; just defaults. | **Extension.** Book is silent; we're explicit. HODL baseline is a more honest comparison than "is this strategy better than nothing." |
| **3. Time unit** | Per-trade primary, daily secondary, annualize headline only with √N footnote | Book uses **weekly** as primary horizon (p203 quote: *"we will use a week as the time horizon for our trading strategy"*). Annualizes via √52 implicitly. | **Disagreement (CF-1).** Book's choice fits daily-cadence stocks; ours fits sparse event-driven crypto. Both are defensible for their respective contexts. Worth documenting in the panel. |
| **4. Cohorts: 12 per-strategy + 1 fleet, paper/live separate** | Locked | Book Ch 9 p315 keeps `paper_position` and `position` parallel-tracked in same class — exact same separation pattern. Doesn't elaborate on per-strategy vs portfolio cohorts but the per-strategy reporting in Ch 6 is implicit. | **Validation.** Same shape, same reasoning. |
| **5. Display vs Gate** | Display-only first, soft-gate after sufficient live | Book p213-214 endorses verbatim: start with minimum risk, scale up after good live performance, scale down after bad. Doesn't use the words "display" or "gate" but the progression is identical. | **Validation.** Strong endorsement, almost word-for-word. |

**Net:** 2 validations, 2 extensions (where we go beyond the book), 1 documented
disagreement (CF-1). The Sharpe Contract panel is well-grounded.

---

## Skip list

What's covered in the book but not relevant to Project Ari right now. Read, conscious
skip, line per item.

- **Ch 1: Algorithmic trading fundamentals** — primer for total beginners. We're past it.
- **Ch 2: Technical analysis indicators (SMA/EMA/RSI/Bollinger/MACD/etc.)** — we already
  have these implemented; would be useful only as a refresher.
- **Ch 3: Basic ML (linear regression, KNN, SVM, decision trees)** — generic primer; not
  specific to our regime classifier or any current Ari work.
- **Ch 7: Building a trading system in Python** — generic architecture chapter (LP / OB /
  TS / OM / MS / Gateway). Covers ground we already covered when designing the FastAPI +
  per-strategy module shape. Mostly skip, but the queue-based event passing is referenced
  in our event-driven backtester lift (Ch 9).
- **Ch 8: FIX protocol, exchange connectivity** — irrelevant. We're on Bittensor pool, not
  a TradFi exchange. No FIX. No order book. No place-in-line.
- **Ch 5: Pair-trading and cointegration analysis** — interesting reference, but we don't
  have a true pair-trading strategy in the fleet today. Could become relevant if we ever
  add TAO/BTC or TAO/SOL pair logic.
- **Ch 6: Spoofing / Quote stuffing / Banging the close** — illegal manipulation tactics;
  not relevant in DeFi pool environment without an order book or other participants to
  spoof. Useful only as vocabulary for understanding TradFi research.
- **Ch 9: HDF5 file storage for tick data** — we use Postgres + the PriceService persist-
  every-tick / hydrate-on-start pattern. HDF5 is a different storage model for a
  different scale. Skip.
- **Ch 10: FPGA / kernel-bypass / microwave network HFT infrastructure** — orthogonal.
  We're not latency-sensitive at sub-millisecond levels.
- **Ch 10: Trading-signal optimization via genetic algorithms / SGD / convex optimization**
  — aspirational. Not relevant until we have a signals dictionary and a stable
  cross-validation pipeline. File for later.

---

## Vocabulary candidates for STATE.md §3

Proposed only — not added. List for review.

### V-1 · Simulation dislocation **(strong candidate)**
**Source:** Ch 10 p322.
**Proposed definition:** *The gap between simulator output and live-trading output for
the same configuration. Can be pessimistic (live > simulated) or optimistic (live <
simulated), and either constant or regime-dependent. A constant bias can be calibrated
out; a regime-dependent bias requires either a better simulator or live-only signal
analytics.*
**Why it's worth canonical status:** we already operate a pre-trade simulator with HODL
warmup gate and liquidity cliffs. We don't yet have a single word for "the gap between
what the sim says will happen and what actually happens" — this is the right one. As we
go more live, this gap will be a recurring topic and naming it now saves repeated
exposition later. Cleanly avoids overlap with anything currently in vocabulary.

### V-2 · Profit decay **(medium candidate)**
**Source:** Ch 10 p335-341.
**Proposed definition:** *The progressive erosion of a previously-profitable strategy's
edge over time, attributable to one or more of: (1) parameter staleness, (2) absence of
the participants the signal tracked, (3) signal discovery by competitors, (4) exit of
losing counter-participants, (5) shifts in underlying assumptions/relationships, (6)
seasonal regime change.*
**Why it's worth canonical status:** Mean Reversion's 26.6% WR is exactly Cause #5 of
the catalog. Naming the failure mode lets us file the diagnosis crisply. Six-cause
catalog gives us a checklist when post-mortem-ing any strategy.

### V-3 · Stdev factor **(weak candidate)**
**Source:** Ch 5 p145.
**Proposed definition:** *A unitless multiplier `stdev / typical_stdev` used to scale
strategy thresholds, smoothing factors, or profit-take levels in volatility-adjusted
strategies. >1 in volatile periods, <1 in calm periods. Used asymmetrically: entry
thresholds and smoothing factors scale UP with vol, profit-take thresholds scale DOWN.*
**Why it's worth considering:** if we adopt vol-adjustment for the Mean Reversion
redesign, we'll be referring to this construct repeatedly. Pre-emptive naming reduces
redundant explanation.
**Why it's weak:** specific to a strategy-redesign that hasn't shipped yet. Probably
better to wait until the redesign ships and the term is earned by use.

### V-4 · Gray box **(low candidate, deferred)**
**Source:** Ch 6 p190.
**Proposed definition:** *An algorithmic trading strategy that is autonomous in
decision-making but has external operator-monitorable parameters and override controls.
Distinguished from "black box" (fully autonomous, no operator overrides) and "manual"
(operator decides every action). Project Ari operates in gray-box mode by design.*
**Why deferred:** the concept is already implicit in our Risk Config + feature-flag
architecture. Naming it doesn't unlock anything new today. File for if/when somebody
asks "what mode does Ari operate in?" — then promote.