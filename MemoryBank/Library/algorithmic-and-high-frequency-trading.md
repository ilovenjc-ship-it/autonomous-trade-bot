# Algorithmic and High-Frequency Trading
**Cartea · Jaimungal · Penalva · Cambridge University Press 2015 · 360 pp**

## Why it matters to Ari

Cartea/Jaimungal/Penalva is the academic counterpoint to the four practitioner books
already on the shelf — graduate-level stochastic-control rigor, all worked through Hamilton-Jacobi-Bellman equations, dynamic programming principles, and value functions. **Honest framing up front:** this is a 2015 LOB textbook, written before AMMs were a major
topic. ~60% of the math assumes a limit order book and translates to Bittensor's AMM
venue partially-or-not-at-all (skip list below names what doesn't translate). But two
chapters earn their slot regardless: **Ch 6 §"Optimal Execution with Continuous Trading I"**
delivers the Almgren-Chriss framework that justifies Project Ari's pre-trade simulator
gaining a "split this trade over N slices" recommendation when approaching liquidity
cliffs (the +200% case for SN0 Root liquidity at 5% pool depth — currently we render
the cliff as a single-shot cost; Cartea's framework says the optimal answer is TWAP-of-
slices). And **Ch 11 §"Optimal Band Selection"** is the direct mathematical foundation
for tomorrow's Mean Reversion Item 2 redesign — particularly the surprising result that
**Sharpe ratio is non-monotonic in band width** (peaks around 1σ in the book's worked
example: SR 5.64 / 6.18 / **6.24** / 2.29 at 0.25/0.5/1.0/2.0 σ bands), and that
**optimal entry/exit bands are asymmetric** even when the spread mean is at zero (entry
tighter than exit, due to the discount factor's role in the optimal-stopping problem).
The asymmetric-bands result confirms Chan's `exit_threshold = -0.6 × entry_threshold`
heuristic from a different mathematical direction — two independent academic sources land
on entry-tighter-than-exit, which is strong cross-Library validation.

---

## Top 5 Lifts (ranked by leverage)

### 1. Sharpe ratio is NON-MONOTONIC in mean-reversion band width — peak ~1σ
**(Ch 11 §"Ad Hoc Bands", p275–276)**

The book runs 10,000 Monte Carlo scenarios on a cointegrated INTC/SMH spread modeled
as Ornstein-Uhlenbeck, varying the entry-trigger band width:

| Band width | Sharpe ratio |
|------------|-------------|
| 0.25 × σ | 5.64 |
| 0.5 × σ | 6.18 |
| **1.0 × σ** | **6.24** *(peak)* |
| 2.0 × σ | 2.29 *(collapse)* |

Naive intuition says wider bands = larger per-trade profit = higher Sharpe. **Reality
inverts this past 1σ.** Two mechanisms explain the collapse: (a) wider bands have
*fewer* round-trip trades within the trading horizon, so total expected P&L drops
despite higher per-trade payoff; (b) the P&L distribution becomes **multimodal** at
wide bands, with weight concentrated at integer multiples of the band size — heavy
left tail because positions that don't revert by horizon-end must be closed at a loss.

**Direct application to Day 14 Item 2 redesign:** the Mean Reversion strategy's current
RSI-extreme thresholds map to "band widths." If thresholds are too tight (RSI 25/75
instead of 20/80, or whatever the analogue), Sharpe is sub-optimal even though
intuition says "wider thresholds = more selectivity = better." If thresholds are too
wide, Sharpe COLLAPSES (the n=79 paper sample may already be in this regime — high
selectivity + low trade count + bad outcomes = the multi-modal-fat-left-tail signature
Cartea documents). Pre-flight diagnostic: examine the empirical relationship between
threshold width and observed Sharpe across the 79 Mean-Rev trades. If we see the
Cartea curve shape (peak then collapse), we know the redesign is "tune toward 1σ-equivalent,"
not "go wider."

**Implementation hint:** for the OU-process parameterization Cartea uses, "1σ" is
1 standard deviation of the spread's stationary distribution. For Project Ari's RSI-based
single-asset MR, the analogue is σ of the RSI series itself (or σ of the indicator
the strategy fires on). Cross-reference Chan's Z-score formal definitions
(`MemoryBank/Library/quantitative-trading-chan.md` Ch 7 endnote) — the Z-score is
already normalized to σ-units, so "1σ band" = "Z-score threshold of ±1."

### 2. Optimal entry/exit bands are ASYMMETRIC — entry tighter than exit
**(Ch 11 §"Optimal Band Selection", p277–280)**

Even when the OU process mean-reverts to zero (`θ = 0`), the **optimal entry and exit
trigger levels are NOT symmetric around zero.** Entry biases CLOSER to the mean;
exit biases FURTHER. Worked numbers from Figure 11.5 (p280):
- For mean-reversion rate κ=0.5: entry at -0.97σ, exit at +1.10σ.
- For mean-reversion rate κ=4.0: entry at -0.47σ, exit at +0.51σ (tighter overall but
  still asymmetric).

The mechanism (p280): the optimal-stopping problem for entry-then-exit has the entry's
discount factor compound *into* the exit's value function. The agent values getting
into a position quickly (lower entry) more than getting out aggressively (higher exit
allowed because she's already in profit and time-discounted future gain is fine).

**Cross-Library validation:** Chan p141 uses `exit_threshold = -0.6 × entry_threshold`
as a heuristic asymmetric exit. Two independent sources land on the same shape from
different mathematical directions:
- Cartea: optimal-stopping with discount factor → entry tighter than exit.
- Chan: empirical fit on GLD/GDX → `exit ≈ 0.6 × entry`.

**Project Ari implication for Day 14 Item 2:** if the redesign keeps a single-asset MR
architecture, the Z-score thresholds should be asymmetric. Default proposal:
`entry_z = ±1.0`, `exit_z = ±0.6`. Filed as **D-37** below — descriptive forward-warning
informing any threshold-choice work.

### 3. Almgren-Chriss optimal execution: split big trades over time, even for AMM
**(Ch 6 §"Liquidation without Penalties only Temporary Impact", p156–157)**

The classical Almgren-Chriss result, derived through DPE solution (eq 6.12, p157):
**under linear temporary impact `f(v) = k·v` with finite horizon T, the optimal liquidation
strategy is constant-rate (TWAP).** The shares-to-liquidate `Q_t = (T-t)/T × 𝔑` decreases
linearly; the trading speed `v_t = 𝔑/T` is constant.

**LOB → AMM translation** (the academic part of the lift):
- LOB temporary impact: `f(v) = k·v` (linear in trading speed).
- AMM cost (Project Ari's pre-trade simulator): `cost(τ_in) = τ_in · s/(1-s)` for slippage
  `s` (CONVEX in trade size; gets worse near cliff).
- The Almgren-Chriss result generalizes: under any convex impact function, optimal
  execution remains "split into smaller chunks over time" — but the optimal chunk-size
  is now smaller (because convex impact penalizes large chunks more than linear impact
  does).
- **Practical implication:** for trades approaching the 1%/2%/5% cliff thresholds in
  Project Ari's pre-trade simulator, the academically-correct answer is NOT "execute the
  full size at the higher cliff cost"; it's "split into N slices executed over T cycles,
  each slice well below the 1% cliff." The simulator currently shows the cliff cost
  for a single-shot execution; the lift is to ALSO show "or N slices over T cycles
  with total cost X."

**Implementation hint:** ~50 lines of math + UI wiring. The pre-trade simulator gains
a new card: "Split into N slices over T cycles" with N and T chosen to keep each slice
below 1%-cliff. Compute total cost as `N × cost(τ_in/N)` and compare to single-shot
`cost(τ_in)`. The savings shown is the "Almgren-Chriss savings." Filed as **D-38**
below — design-ready, build pending operator green-light because this changes simulator
output behavior.

### 4. Mean-reversion rate κ governs band-tightness more than σ does
**(Ch 11 §"Optimal Band Selection", Figures 11.4 + 11.5, p279–280)**

The book's Figure 11.4 sweeps the mean-reversion rate κ ∈ {0.5, 1, 2, 4} with σ fixed.
**Higher κ (faster reversion) → tighter optimal bands.** The intuition: when reversion
is fast, you don't need to wait for extreme deviation — the spread will return quickly
even from modest deviations, so trade more often at smaller per-trade profit.

**For Project Ari Mean Reversion Item 2 redesign:** the Day 14 worksheet says read
`avg_W/avg_L` first; Cartea adds a sister diagnostic: **estimate κ from the data first.**
For the OU process `dz = κ(θ - z)dt + σ dW`, κ is recoverable from autocorrelation of
the spread (or whatever signal MR fires on). Specifically: regress `dz` on
`(z - mean(z))` via OLS; the coefficient is `-κ × dt`. (This is the same regression
Chan p170 uses for the half-life formula.)

The diagnosis branches:
- **High κ + tight observed bands:** strategy is well-tuned, but small `avg_W` per trade
  means total P&L depends on trade frequency. Low n=79 in the paper sample suggests
  reversion is NOT fast in the asset/regime the strategy is trading.
- **Low κ + tight observed bands:** strategy is mis-calibrated — should be using wider
  bands. Cartea Figure 11.5 with κ=0.5 has optimal entry at -0.97σ, almost ±1σ.
- **Low κ + wide observed bands:** the multimodal-fat-left-tail regime (Lift #1 above).
  Strategy looks like it should work but P&L distribution is heavily skewed against it.

This diagnosis adds a third pre-flight diagnostic dimension to D-26: **estimate κ
alongside `probFailure` and TBM exit-distribution before proposing a redesign.** Cross-
references Chan's OU half-life formula and López de Prado's TBM labeling.

### 5. Adverse selection framing: Project Ari trades against whom?
**(Ch 2 §"Trading on an Informational Advantage", p21–24, + Ch 10 §"Market Making with Adverse Selection")**

Cartea's framing question: when a strategy buys, does it tend to buy from informed sellers
(adverse selection — they know something we don't, we lose) or uninformed sellers
(noise — they're trading for liquidity reasons, we win)? In LOB markets, this is
measured by post-trade midprice movement: if you bought and the midprice moves DOWN
in the next 100ms, you bought from someone informed. If midprice moves UP, from
someone uninformed.

**For Project Ari on AMM:** there's no "midprice next 100ms" because there's no continuous
LOB. But the analog exists: when Project Ari trades against the pool, the pool reserves
shift; some of that shift reverts (we caught noise) and some persists (someone else
trades the same direction → we caught adverse selection). The proxy metric: **for each
Project Ari trade, observe pool reserves at t+1 cycle, t+5 cycles, t+30 cycles. If
reserves move further in our trade direction, we're getting adverse-selected. If they
revert, we caught noise.**

This is a useful Day 14 Item 1 (Fleet WR 33.5% vs TAO +3% divergence) hypothesis-ranking
input. Hypothesis 4 in the worksheet ("7-of-12 supermajority on correlated voters")
implicitly assumes Project Ari's trades aren't being adverse-selected by validators
or arbitrageurs. Cartea suggests we should TEST this assumption by computing the
post-trade pool-reserve drift on existing `paper_trades`. **If post-trade drift is
predominantly in our direction (adverse selection), Hypothesis 4 needs to expand:
strategies vote correlatedly AND buy uninformed flow → losses are systematic, not bad
luck.**

**Implementation hint:** ~30 lines on existing `paper_trades` joined to `pool_snapshots`.
Output: per-strategy adverse-selection score in [-1, +1]. Negative = uninformed
counterparty (good); positive = informed counterparty (bad). For Day 14 Item 1, this
becomes the fifth hypothesis-test diagnostic alongside the four already in the worksheet.

---

## Full Lifts (the long list, by chapter)

### Part I: Microstructure and Empirical Facts (Ch 1–4)

Mostly LOB-specific. Skip list below covers most of it. Two exceptions:

- **Ch 2 §2.1 Grossman-Miller market making model** (p21). Establishes that liquidity
  providers earn the bid-ask spread *as compensation* for adverse selection risk.
  AMM liquidity providers (subnet stakers) earn the constant-product fees as
  analog compensation. Useful framing for understanding pool fee economics, even
  though Project Ari is a taker not a maker.
- **Ch 4 §4.3.4 Price Impact** (p87–90). Empirical estimation of permanent price
  impact via robust linear regression of `Δprice` on order flow. Translatable to
  Project Ari: estimate "how much does TAO price move per τ of buy/sell pressure
  in our pool?" from `pool_snapshots` deltas. This is the empirical measurement of
  what Cartea Ch 6 models theoretically as `g(v_t)` (permanent impact).

### Part II: Mathematical Tools (Ch 5)

Stochastic-control machinery: Hamilton-Jacobi-Bellman equations, dynamic programming
principle, optimal stopping, combined stopping-and-control. **Project Ari does not
need these tools as engineering primitives** (we're not solving DPEs in production);
but the **conceptual frame** (separate value function for entry vs exit; combine via
optimal stopping) is the foundation for understanding why Cartea Ch 11's bands are
asymmetric. Skim, don't deep-read.

### Part III: Algorithmic and High-Frequency Trading (Ch 6–12)

The core. Already covered above:

- **Ch 6 Optimal Execution I** (Lift #3 above) — TWAP optimal under linear temporary
  impact with finite horizon.
- **Ch 7 Optimal Execution II** (p158–183) — adds price limiter and order-flow
  incorporation. The price-limiter version is mildly relevant: Project Ari has limit
  thresholds on max-allowed-slippage, which are conceptually similar. Skim.
- **Ch 8 Optimal Execution with Limit and Market Orders** (p184–211) — mixing LO and MO.
  Project Ari is MO-only on AMM (no resting orders against the pool curve). Skip.
- **Ch 9 Targeting Volume** (p212–236) — TWAP/VWAP/POV scheduling. The VWAP analog for
  AMM doesn't exist (no separate volume signal apart from our own trades). Skip.
- **Ch 10 Market Making** (p237–272) — for understanding LP-side, not deployment.
  We're takers; this is Cartea's inverse framing. Read for adverse-selection intuition.
- **Ch 11 Pairs Trading and Statistical Arbitrage** (Lifts #1, #2, #4 above) — the
  most directly applicable chapter in the book.
- **Ch 12 Order Imbalance** (p295–313) — uses LOB volume imbalance to predict short-term
  midprice. No AMM analog (no order book to imbalance). Skip.

### Appendix A: Stochastic Calculus (p315–326)

Reference material on Brownian motion, Itô integrals, jump processes, Doubly Stochastic
Poisson Processes, Feynman-Kac. Not Project Ari content; cite-only.

---

## LOB → AMM translation map

Cartea's mathematical machinery translates unevenly. Here's the honest map:

| Cartea construct | LOB statement | Translates to AMM? | Project Ari analog |
|------------------|---------------|---------------------|-----|
| Temporary impact `f(v_t)` | Walking the LOB depths up/down | **Partially** — same intent (cost increases with size), different shape (AMM is convex, LOB linear) | Pre-trade simulator's `cost(τ_in) = τ_in · s/(1-s)` |
| Permanent impact `g(v_t)` | Quote-revision after large prints | **Yes** — pool reserves shift, anyone trading next sees the new mid | `pool_snapshots` delta after our trades |
| Best bid / best ask | Top-of-book prices | **No** — AMM has continuous curve, no discrete book | (no analog) |
| Bid-ask spread `Δ` | Difference between best bid and best ask | **Partially** — AMM has fee-based spread, fixed at pool creation | Pool's swap fee (e.g., 0.3%) |
| Order book depth | Volume queued at each price level | **No** — AMM has integral over the curve, not discrete levels | Pool reserve sizes `(τ_in, α_out)` |
| TWAP execution | Equal-rate time-weighted slicing | **Yes** — directly applicable, same math conclusion | Pre-trade simulator's "split into slices" recommendation (forthcoming per D-38) |
| Implementation shortfall | Arrival price minus actual avg execution price | **Yes** — directly applicable | Slippage measured against initial pool price |
| Adverse selection | Buying from informed sellers (post-trade drift) | **Yes** — replace "midprice next 100ms" with "pool reserves next N cycles" | Day 14 Item 1 hypothesis-test diagnostic per Lift #5 |
| Market making spread (Ch 10) | Compensation for inventory + adverse-selection risk | **Indirect** — useful for understanding pool fee economics | (we're takers; informational only) |
| Order imbalance (Ch 12) | LOB volume imbalance predicts short-term midprice | **No** — no order book | (no analog) |
| OU mean-reversion (Ch 11) | Spread between cointegrated assets | **Yes** — applies to subnet-alpha-pair spreads or alpha-vs-TAO spreads | Mean Reversion Item 2 cross-sectional pivot per Chan |
| Optimal entry/exit bands (Ch 11) | Asymmetric thresholds for mean-reverting trade | **Yes** — directly applicable | Mean Rev redesign threshold structure per D-37 |

---

## Optimal Execution — DEEP DIVE for Project Ari pre-trade simulator

The Almgren-Chriss framework, applied to AMM. Working through:

**Setup.** Project Ari needs to swap a large τ-amount into αTAO on a single-subnet pool.
Single-shot execution at the AMM curve costs `cost(τ_in) = τ_in · s/(1-s)` where
`s = τ_in / (τ_in_pool + τ_in)` is slippage. As `τ_in / τ_pool → 0`, cost → 0; as
`τ_in / τ_pool → 1`, cost → ∞. Cliff thresholds in the simulator: 1%/2%/5% of pool
depth.

**The split.** Instead of single-shot, slice into `N` chunks executed over `T` cycles.
Each slice sees pool depth ≈ `τ_pool` (since previous slices' impact dampens between
cycles, both because other traders restore equilibrium and because the pool naturally
arbitrages back). Cost per slice ≈ `(τ_in/N) · s_slice/(1-s_slice)` where
`s_slice = (τ_in/N) / τ_pool`. Total cost = `N × cost(τ_in/N)`.

**The savings.** Because `cost(τ_in)` is convex, `N × cost(τ_in/N) < cost(τ_in)` for
N ≥ 2. The savings grows with N up to the point where execution-time risk (price drift
during the T-cycle window) outweighs the convexity savings.

**The Almgren-Chriss optimum.** Under stochastic price drift `dS = σ dW` during
execution, the optimal split balances impact savings vs price-drift risk. With the
linear/convex impact and zero penalty for terminal inventory, eq 6.12 (p157) gives:
**constant rate, N → ∞ in continuous limit, but in discrete cycles N is bounded by the
trader's urgency parameter α.**

**For Project Ari practical defaults:** start with N=5 (5 slices over 5 cycles = 25 minutes
total); display alongside the single-shot cost in the simulator. Operator can adjust
urgency. Below 1% cliff threshold for any single trade size, single-shot is fine.
Above 1% threshold, split is recommended. Above 5% threshold, split is mandatory or
fail-fast.

**This is NOT yet built.** Filed as **D-38** below — design-ready, prescriptive (changes
simulator output behavior), pending operator green-light.

---

## Mean Reversion Optimal Bands — DEEP DIVE for Day 14 Item 2

Cartea Ch 11 gives the most rigorous treatment of "what threshold should a mean-reversion
strategy use" on the shelf. Combined with Chan's pragmatic exit-asymmetry heuristic
and Donadio/Ghosh's vol-adjustment recipe (D-21), the redesign decision tree becomes:

### Step 1: Estimate the OU process parameters from data

Regress `dz` on `(z - mean(z))` over the Mean Reversion strategy's signal series. Output:
- `κ` (mean-reversion rate)
- `σ` (spread volatility)
- `θ` (long-run mean — should be ≈ 0 for a well-defined MR signal)

From `κ`, derive **half-life = ln(2)/κ** (Chan p170, sister to OU vocab).

### Step 2: Decide single-asset vs cross-sectional architecture

Per Chan p134 (filed in `quantitative-trading-chan.md` Lift #1): time-series MR is
rare. If `κ` from Step 1 is small (slow reversion, half-life > our average holding
period), the strategy is fighting the rare-case structure. **Cross-sectional pivot
candidates:** TAO-vs-BTC spread, TAO-vs-subnet-α spreads, subnet-α-vs-other-subnet-α
spreads. Run cointegration tests (CADF, Engle-Granger) on candidate pairs; any pair
that cointegrates at 95% becomes a candidate.

If `κ` is large (fast reversion, half-life << holding period), single-asset MR can work
but the bands need tuning per Step 3.

### Step 3: Choose band widths

From Cartea Ch 11 + Chan p141 + cross-Library validation:

- **Symmetric naive bands:** ±1σ entry, exit at 0σ. Sub-optimal per Cartea's asymmetric
  result.
- **Cartea optimal asymmetric bands:** entry at `-0.97σ`, exit at `+1.10σ` for κ≈0.5;
  entry at `-0.47σ`, exit at `+0.51σ` for κ≈4.0. (Sign flip for short side.)
- **Chan empirical asymmetric bands:** `entry_z = ±E`, `exit_z = ±0.6E` for some
  E ≈ 1.0–1.5 calibrated on backtest.

Both academic and empirical paths land on entry tighter than exit. **Default proposal:
entry_z=±1.0, exit_z=±0.6.** Filed as D-37 below.

### Step 4: Apply class-appropriate exit logic (per D-31 from Chan)

Mean-reverters MUST NOT use stop-losses. Exit by profit-take threshold OR time-out
horizon, never by stop-loss-on-adverse-move. Removing stop-loss may be the single
highest-impact change in the Item 2 redesign per Chan p173–174.

### Step 5: Apply Donadio/Ghosh vol-adjustment (per D-21)

Three asymmetric multipliers: entry thresholds and smoothing scale UP with vol;
profit-take thresholds scale DOWN with vol. +200% reported on Donadio/Ghosh's same
fundamental algorithm. Cross-references all of Chan, Cartea, and Donadio/Ghosh: this
is the third leg of the redesign.

---

## Adverse Selection — DEEP DIVE for Day 14 Item 1

Item 1's worksheet hypothesis #4 is "7-of-12 supermajority on correlated voters." Cartea
extends this with the adverse-selection question: even if the supermajority votes
*correctly* by their own logic, are the trades systematically being taken from informed
counterparties?

**The diagnostic** (Cartea Ch 2 + Ch 10):

For each Project Ari trade at time t, observe pool reserves at t+1, t+5, t+30 cycles.
Define **reserve drift score** = (post-trade reserve change in our direction) /
(immediate trade impact). Score in [-1, +1]:
- **Positive (+1 → 0.3):** reserves moved further in our direction → we caught uninformed
  flow. Healthy.
- **Near zero (0.3 → -0.3):** noisy, no signal.
- **Negative (-0.3 → -1):** reserves reverted against our direction → we bought from
  informed sellers / sold to informed buyers. Adverse selection.

For Day 14 Item 1: compute the score per-strategy and per-Fleet-Consensus-vote. If the
fleet-aggregated score is consistently negative on losing periods (TAO +3% but Fleet
WR 33.5%), Hypothesis 4 expands: not just correlated voting but **correlated adverse-
selected voting** — strategies are firing on the same signal AND that signal is the
losing side of an informed flow.

**This is a diagnostic, not a redesign trigger.** If adverse selection is present,
the redesign is non-trivial (we'd need a "who's on the other side?" model). If it's
absent, the four existing hypotheses in the worksheet remain primary.

---

## Optimal Stopping vs heuristic exits

Cartea Ch 11's optimal exit framework (perpetual American option, value matching +
smooth pasting at the exit boundary) is mathematically rigorous but operationally
expensive. Project Ari's existing exits (profit-take / stop-loss / time-out) are
heuristic.

The honest assessment: **closing the gap is not worth the engineering cost in Phase 1.**
The optimal-stopping result on OU-process spreads gives ~10–15% Sharpe improvement over
ad-hoc bands per Cartea's Monte Carlo. We can capture most of that ~10–15% with the
three-step recipe above (estimate κ, choose asymmetric bands, apply Chan's heuristic
ratio). The remaining ~3–5% comes from solving the actual DPE per-strategy per-cycle —
not worth the operational complexity.

**When this changes:** if Fleet Consensus reaches the HRP-allocation phase per D-25
and we're running cross-sectional pair-spread strategies in volume, the optimal-stopping
machinery becomes worth deploying. Filed as a "future Library reference," not a current
adoption candidate.

---

## Counterfactuals

### CF-Cartea-1 — Linear impact `f(v) = k·v` is NOT what AMMs have

Cartea derives all of Ch 6's results under linear temporary impact. Project Ari's pool
math is convex (`cost = τ_in · s/(1-s)`). The qualitative conclusions (TWAP-like splitting
is optimal under finite horizon) carry over, but the QUANTITATIVE optimal split is
different — convex impact penalizes large chunks more heavily, so optimal N is larger
than Cartea would suggest at first read. **Practical implication:** when implementing
the trade-splitting recommendation per D-38, do NOT use Cartea's exact eq 6.12; rederive
under the AMM cost function. The principle applies; the formula doesn't transfer
directly.

### CF-Cartea-2 — Combined stopping-and-control assumes continuous trading

Cartea Ch 5 §5.6 develops the framework for problems where the agent both controls
(trading rate) and chooses stopping time. This assumes continuous-time trading. Project
Ari runs on 5-minute cycles — discrete time. The discrete-time analog exists (search
"impulse control") but isn't covered in this book. For now, treat Cartea's continuous
results as upper bounds on what we can achieve with discrete cycles; 5-minute discretization
costs ~5–10% Sharpe per academic studies, less if mean-reversion timescales are long
relative to cycle time.

---

## Validations

Where Cartea endorses Project Ari decisions:

- **Implementation shortfall vs HODL baseline (V-1, simulation dislocation)** — Cartea
  p152 names the canonical benchmark as **arrival price** (midprice at time of trade
  decision). Project Ari uses HODL baseline for risk-free floor (Sharpe Contract dim
  #2). These are different in detail but same intent: measure execution against a
  counterfactual benchmark.
- **Permanent vs temporary impact distinction** (Ch 6) — endorses Project Ari's pool-
  reserve-snapshotting architecture. Pool reserves persist across cycles (permanent
  impact); slippage on the swap curve is per-trade (temporary impact). The stack
  already represents this distinction correctly.
- **Mean-reversion as cointegration** (Ch 11) — endorses Chan's "cross-sectional MR
  > time-series MR" framing from a different angle. Two academic books, two practitioners,
  one conclusion.
- **Asymmetric optimal bands** — independent academic confirmation of Chan's empirical
  heuristic. Strong cross-Library validation.
- **Discount factor as urgency parameter** (Ch 6 + Ch 11) — endorses Project Ari's
  Sharpe Contract dim #5 (display-first → soft-gate → hard-gate). Operator-dialable
  urgency aligns with the academic framing.

---

## Cross-references with prior Library entries

### vs Donadio/Ghosh (Packt 2019)

- **Vol-adjustment recipe (D-21):** Cartea Ch 11 doesn't specifically vol-adjust, but
  the asymmetric-bands result implies that band positioning depends on κ AND σ jointly.
  Donadio/Ghosh's recipe scales thresholds by σ alone. Cartea suggests scaling by
  σ × f(κ), where f(κ) tightens for fast-reverting series. Refinement of D-21 candidate
  for future iteration.
- **Simulation dislocation (V-1):** Cartea p152 introduces "implementation shortfall =
  arrival price - actual avg execution" as the canonical metric. Same concept as V-1
  but with a precise measurement protocol. **Implementation shortfall** earns its slot
  as additional vocabulary in §3 (proposed below).

### vs López de Prado (Wiley 2018)

- **TBM exit-distribution (D-26 pre-flight):** Cartea Ch 11 + Chan p170 give the
  OU half-life formula that complements TBM's labeling. TBM tells you WHICH barrier
  triggered; OU half-life tells you whether the barrier triggered AT THE RIGHT TIME
  given the signal's natural reversion timescale. Both are pre-flight diagnostics for
  Item 2.
- **Probability of Strategy Failure (D-26):** Cartea doesn't have a direct analog;
  the academic frame is "value function evaluated at current state" which has different
  semantics. probFailure remains the practical metric; Cartea's framework adds the
  WHY (the value function's curvature reflects the trade's urgency vs uncertainty
  trade-off).
- **HRP (D-25):** Cartea doesn't cover portfolio-level allocation. Out-of-scope cross-
  reference; HRP via López de Prado Ch 16 stands alone.

### vs Grinold/Kahn (McGraw-Hill 1999)

- **Information Ratio (D-30):** Cartea's value-function machinery is consistent with
  IR but doesn't compute it directly — different academic tradition. No conflict; the
  HODL-benchmark IR-collapsed-to-Sharpe per D-30 stands.
- **Markowitz mechanics:** Cartea Ch 6 doesn't deploy mean-variance optimization;
  uses utility-function maximization. Different formalism, often equivalent. No
  conflict with D-22 (Markowitz allocates to losers) or D-25 (HRP path).

### vs Chan (Wiley 2021)

The biggest cross-Library overlap. Direct correspondences:

- **Cointegration / OU / mean-reversion:** Cartea Ch 11 = academic version; Chan Ch 7
  = practitioner version; same content, different rigor. Use Chan for implementation,
  cite Cartea for the theory.
- **Asymmetric bands:** Chan empirical (`exit = -0.6 × entry`); Cartea theoretical
  (entry tighter than exit via discount-factor mechanism). Two paths, one conclusion.
- **OU half-life:** Chan p170 derives exactly the formula Cartea uses in Ch 11
  parameterization. Cite Chan in code, cite Cartea in doctrine.
- **Adverse selection:** Cartea covers it explicitly (Ch 2 + Ch 10); Chan implicitly
  via "data-snooping bias" and "look-ahead bias." Cartea's framing is sharper.

### vs Poundstone (Hill and Wang 2005)

- **Optimal stopping:** Poundstone narrates Kelly's intuition; Cartea formalizes via
  DPE. No conflict.
- **Half-Kelly:** Poundstone narrative; Cartea doesn't address Kelly directly.
- **Adverse selection:** Cartea formal; Poundstone narrative (LTCM was adverse-selected
  by the Russia default + LTCM's known-counterparty exposure to Wall Street post-Long-
  Term-Capital-revealed-positions). Same concept at different abstraction levels.

---

## Skip list

What Cartea covers that's off-scope for Project Ari:

- **Ch 1 §"Electronic Markets and the Limit Order Book"** — LOB mechanics, exchange
  fee structures, colocation. Not how Bittensor/AMMs work. Read for context only.
- **Ch 1 §"Extended Order Types"** — IOC, FOK, hidden orders, iceberg orders. AMMs
  have one order type: swap. Skip.
- **Ch 3 §"Latency and Tick Size"** — sub-millisecond timing, microsecond-scale
  predictability. Project Ari runs on 5-minute cycles; latency is operationally
  irrelevant. Skip.
- **Ch 4 §"Hidden Orders"** — iceberg orders, dark pools, midprice estimation. No
  AMM analog. Skip.
- **Ch 5 §"Stochastic Optimal Control and Stopping" (DPE/HJB derivations)** — useful
  conceptual background; not engineering primitives Project Ari deploys. Skim once,
  cite as needed.
- **Ch 7 §"Optimal Liquidation in Lit and Dark Markets"** — lit/dark pool routing.
  No AMM analog. Skip.
- **Ch 8 §"Liquidation with Limit and Market Orders"** — mixing LO/MO. Project Ari
  is MO-only on AMM. Skip.
- **Ch 9 §"Targeting Volume / VWAP"** — VWAP scheduling. AMM has no separate volume
  signal apart from our own trades. Skip.
- **Ch 10 §"Market Making with Adverse Selection"** — LP-side; we're takers. Read
  for adverse-selection intuition only.
- **Ch 12 §"Order Imbalance"** — LOB volume imbalance. No AMM analog. Skip.
- **Appendix A: Stochastic Calculus** — reference material; not Project Ari content.

---

## Vocabulary candidates for STATE.md §3 (per D-23 autonomy)

**Inscribing** (descriptive, source-cited, scope-defined):

### V-Cartea-1 — Almgren-Chriss framework

The canonical academic framework for optimal trade execution under price impact.
Inputs: trade size, time horizon, urgency parameter, market volatility, impact
function. Output: optimal trading rate as a function of time. Under linear temporary
impact and finite horizon with hard terminal-inventory constraint, the optimum is
constant-rate (TWAP). Generalizes to other impact functions (including AMM convex
cost) with the same qualitative conclusion: split big trades over time. For Project
Ari: foundation for the pre-trade simulator's forthcoming "split into N slices over
T cycles" recommendation per D-38. Source: Cartea/Jaimungal/Penalva Ch 6, with
Almgren-Chriss original 2000 paper.

### V-Cartea-2 — Implementation shortfall (slippage)

The execution-quality metric: arrival price minus actual average execution price.
Positive = lost value (paid more / received less than the benchmark); negative =
captured better price than benchmark. Cartea's canonical benchmark is the midprice
at time of trade decision. For Project Ari on AMM: arrival price = pool's mid-price
at the cycle when the trade was decided; actual = the swap price after pool curve
walk + fees. Sister to V-1 (simulation dislocation) but with a precise measurement
protocol; V-1 is the broader concept, implementation shortfall is its operational
form for execution-only-divergence (excludes regime-shift and parameter-drift sources
of dislocation). Source: Cartea Ch 6 p152, citing Almgren 2010.

### V-Cartea-3 — Permanent vs temporary price impact

Two distinct mechanisms by which a trade affects price:
- **Temporary impact**: per-share execution-price degradation as the trade walks the
  AMM curve / LOB. Felt by THIS trade only; price snaps back after the trade completes.
- **Permanent impact**: persistent shift in mid-price post-trade. Felt by ALL future
  trades; doesn't snap back. Reflects information leakage from the trade itself
  ("someone is buying — there must be a reason — adjust mid").
- For Project Ari: temporary impact = pool slippage cost (`τ_in · s/(1-s)`);
  permanent impact = pool reserve shift that persists into next cycle. Both measurable
  from `pool_snapshots` deltas. Source: Cartea Ch 6 p153–154.

### V-Cartea-4 — Adverse selection (in trade execution)

The risk that you trade against an informed counterparty. Measured by post-trade price
drift IN your direction (you're caught — they knew something) vs AGAINST your direction
(you got noise — healthy). On AMM, the analog is post-trade pool-reserve drift over
N cycles. Negative drift score = adverse selection; positive = healthy noise capture.
For Project Ari: candidate fifth diagnostic in Day 14 Item 1 hypothesis-test. Source:
Cartea Ch 2 + Ch 10.

---

## Decision-log candidates for STATE.md §4

**Inscribing autonomously** (descriptive forward-warnings, source-cited, scope-defined):

### D-38 — Optimal Bollinger bands are ASYMMETRIC; Sharpe non-monotonic in band width

For mean-reversion strategies, the optimal entry/exit bands are NOT symmetric around
the mean. Two independent sources land on entry tighter than exit:
- Cartea Ch 11 §11.3 (academic): optimal-stopping with discount factor → entry at
  -0.97σ, exit at +1.10σ for κ=0.5 OU process.
- Chan p141 (practitioner): empirical heuristic `exit_threshold = -0.6 × entry_threshold`,
  calibrated on GLD/GDX backtest.

Additionally, Sharpe ratio is **non-monotonic in band width**, peaking around 1σ
in Cartea's Monte Carlo (SR 5.64 / 6.18 / 6.24 / 2.29 at 0.25 / 0.5 / 1.0 / 2.0 σ).
**For Day 14 Item 2 redesign:** the Z-score threshold tuning should target ±1σ entry
with ±0.6σ exit, not symmetric ±entry-equals-exit. Filing as descriptive forward-warning
before threshold-choice work begins. Cross-references **D-35** (cross-sectional MR
default — the asymmetric-bands prescription applies to whichever architecture survives
Item 2's branch decision) and **D-34** (no stop-loss for mean-reverters — exit by
threshold, not by stop-loss).

Source: `MemoryBank/Library/algorithmic-and-high-frequency-trading.md` Ch 11 §"Optimal
Band Selection" + cross-validation in `quantitative-trading-chan.md` Ch 7 endnote.

### D-39 — Almgren-Chriss-on-AMM: split trades approaching liquidity cliffs into N slices

For Project Ari trades approaching the pre-trade simulator's 1%/2%/5% liquidity-cliff
thresholds, the academically-correct execution is NOT single-shot at the cliff cost.
It's **split into N slices over T cycles**, each well below the 1% cliff threshold,
with total cost = `N × cost(τ_in/N)`. AMM convex cost function gives larger savings
than Cartea's linear-impact derivation suggests; rederive the optimal N under
`cost(v) = v · s/(1-s)` rather than `cost(v) = k·v`.

**Practical defaults:** below 1% cliff threshold, single-shot is fine; above 1%, recommend
split with N≥5 slices; above 5%, mandatory split or fail-fast warning. Operator urgency
parameter dials the urgency-vs-savings tradeoff.

**This entry filed as design-ready, NOT as a build directive.** Per D-23 prescriptive
boundary: changing simulator output behavior requires operator green-light. The math,
the threshold defaults, and the UI proposal are documented; the build awaits explicit
authorization. Sister to **D-37** (Kelly phasing in `risk_config.json`) — both filed
as design-ready prescriptive items pending operator green-light.

Source: `MemoryBank/Library/algorithmic-and-high-frequency-trading.md` Ch 6 §"Liquidation
without Penalties only Temporary Impact" + LOB→AMM translation map in this entry.

---

## Verdict

**Yes, with caveats — partially worth reading at full depth.** Cartea/Jaimungal/Penalva
deserve their slot for Ch 6 (Optimal Execution) and Ch 11 (Pairs Trading optimal bands)
specifically. The other ten chapters are LOB-specific or HFT-specific and translate
poorly to Project Ari's AMM venue. The Ch 11 result that Sharpe is non-monotonic in
band width and that optimal bands are asymmetric is genuinely surprising — practitioner
intuition gets it wrong, and Day 14 Item 2 redesign is materially better-informed
because of Cartea than it would be from Chan alone. The Ch 6 Almgren-Chriss framework
provides the academic foundation for a real Project Ari feature (trade-splitting
recommendation in pre-trade simulator). The book pre-validates 4 Project Ari decisions
and adds 2 new descriptive forward-warnings to the decision log + 4 vocabulary rows.

**What's notably absent:** AMM-specific treatment, anything on staking/validator economics,
anything on cross-chain. The book is a 2015 academic snapshot of LOB equity microstructure;
the AMM venue is younger than the book and the Bittensor venue younger still. We bring
the AMM specifics; Cartea contributes the optimal-execution and optimal-stopping frame.