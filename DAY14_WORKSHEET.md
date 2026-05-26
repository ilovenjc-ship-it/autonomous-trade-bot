# DAY14_WORKSHEET.md — Fleet WR divergence + two strategy redesigns

> Drafted Day 13 wrap-up 2026-05-26 evening. Three items flagged at
> Day 12 close that have been compounding through Day 13. Day 14 is
> the **diagnose-and-redesign** day; nothing here ships without
> Mark's explicit green light per item.
>
> **Friday May 29 is the strategic-fork checkpoint.** If fleet WR
> stays in the 33–36% band by Friday close, Fleet design returns
> to the drawing board (per Day 12 R-close). Day 14 is the last
> business day before that fork. Three items, in priority order.

---

## ITEM 1 — Fleet WR 33.5% vs TAO +3% divergence (read-and-frame)

### The problem

Fleet has been transacting at **33.5% WR** while TAO underlying has
moved **+3% over the same window**. A passive HODL of the fleet's
TAO inputs would have outperformed the trade flow. This is the
opportunity-cost case the Sharpe Score was specced to surface (see
`SHARPE_SPEC.md` — `R_i = trade_return − HODL_return_i`); the
Sharpe metric isn't live yet, so Day 14 reads it eyeballed against
trade-log and pool snapshots.

This is the headline framing for the Friday strategic-fork meeting.
Whatever we ship Day 14 must be **diagnostic first, surgical
second** — a redesign on the wrong diagnosis is worse than holding
the line one more day.

### Hypotheses (rank-ordered, most likely first)

1. **Strategy bench coverage gap.** Day 8 INV-3 made Mean Reversion
   and Contrarian Flow regime-agnostic, but the other 10 bots are
   still regime-bench-gated. If the fleet has spent most of the
   window in `SIDEWAYS` regime, the 5 momentum bots have been
   benched, leaving 7 active — and 5 of those 7 are mean-reversion-
   shaped (which fade extremes). On a clean `+3% trend day` with no
   volatility spikes, the active subset is structurally
   counter-trend. **Predicts:** disable bench gate one cycle, or
   shift regime classification, and WR jumps.
2. **Fill-quality drag.** Day 12 Pool Simulator was designed to
   answer this. With `execution_guard.py` still on
   `DEFAULT_POOL_DEPTH_TAO` until the live-pool-depth swap (Day 13
   pickup item #1, not yet shipped per the 2026-05-26 morning queue
   — verify status), every paper trade is using a hardcoded depth
   that may overstate fill quality. If the hardcoded depth is too
   low, paper P&L has been silently penalized below what live
   reserves would produce. **Predicts:** swap to live pool depth,
   re-run a synthetic backtest of the last 100 trades, observe WR
   shift.
3. **Wrong-side macro_correlation post-rewrite.** Day 8 R4 rewrote
   macro_correlation as `signal = btc_change_24h − tao_change_24h`
   with ±1.5pp triggers and a 1.0% BTC activity floor. If BTC has
   been quiet (<1.0%) most of the week, this strategy abstains —
   but the abstention path quietly removes the only cross-asset
   diversifier from the fleet, leaving 11 TAO-lens voices voting on
   the same data. **Predicts:** check macro_correlation trade count
   over window; if it's near zero, the diversifier is dormant and
   Fleet Consensus reduces to a TAO-only echo chamber.
4. **OpenClaw 7/12 supermajority too tight.** Same data fed through
   12 strategies that share most of their inputs (RSI, MACD, BB,
   price-vs-SMA50) will produce correlated votes. A 7/12 floor on
   correlated voters means the supermajority is structurally easy
   to hit on consensus-against-trend days and structurally hard to
   hit on trend days. **Predicts:** distribution of round outcomes
   skews HOLD on trending days, ABSTAIN-via-no-quorum or
   reluctant-BUY on chop days. Look for HOLD-rate over the window.

### Data to pull (Day 14 morning, ~30 min)

| # | Source | Query / read | What we expect to see |
|---|--------|-------------|----------------------|
| A | `/api/analytics/strategies` | per-strategy WR over window | Confirm 33.5% is fleet-aggregate; identify worst 2 + best 2 |
| B | `/api/fleet/regime/current` + log scrape | regime distribution last 7d | If `SIDEWAYS` > 50%, hypothesis 1 advances |
| C | `/api/market/pool/{0,8,9,18,64,96}` | live `tao_in` vs `DEFAULT_POOL_DEPTH_TAO` | Quantify hypothesis 2's magnitude |
| D | `trades` table SQL — `WHERE strategy='macro_correlation' AND ts >= now()-7d` | trade count, signal-reason histogram | Confirm/refute hypothesis 3 directly |
| E | `consensus_history` rows | distribution of `result_chip` over window | Hypothesis 4 — if HOLD% is dominant, supermajority is choking |

### Decision tree

- If A surfaces a single strategy as WR-poison-pill (e.g., one bot
  at <20% WR pulling the fleet down), **demote that bot to PAPER_ONLY
  observation** and re-evaluate Friday. Surgical, reversible.
- If B + C are both clean (regime balanced + pool depth realistic),
  hypothesis 3/4 advance. Then it's an architecture question,
  not a parameter question.
- If C is dirty (hardcoded depth materially understates real depth
  on the bot's six trading subnets), **ship the
  `execution_guard.py` one-line swap** Mark queued for Day 13 morning
  before any other change, then read again 24h later.
- If D shows macro_correlation has fired <5 trades in 7 days, that
  strategy is sleeping through the window — separate worksheet
  needed (review activity-floor threshold; current 1.0% BTC floor
  may be too high for the regime BTC has been in this week).

### What does NOT happen Day 14

- No promotion of any bot to LIVE.
- No flag-flip of `FORCE_PAPER_MODE`.
- No new strategy added to the fleet.
- No DB migrations.
- No OpenClaw → Fleet Consensus rename work (separate session per
  `RENAME_FLEET_CONSENSUS.md`).

---

## ITEM 2 — Mean Reversion redesign (26.6% WR / 79 trades)

### The current state

Mean Reversion sits at **26.6% WR** on **79 trades** as of the Day 12
read. 79 trades is enough to reject "noise" — a strategy with a
50% true-WR has p < 0.001 of producing 26.6% over 79 trades. The
strategy is structurally wrong, not unlucky.

Day 8 INV-3 made it regime-agnostic (deliberately — mean-reversion
fires on RSI extremes, which by the canonical detector ARE the
trending regimes). So the previous bench-gate explanation does NOT
apply here; this is a **signal-logic** problem.

### Hypotheses

1. **RSI threshold mis-calibration on Wilder.** Day 8 INV-1 fixed
   RSI to Wilder smoothing with 28-tick warmup. Wilder RSI is
   *less reactive* than simple-rolling RSI — the same threshold
   that produced reasonable signal density on the broken
   simple-rolling implementation now produces signals deeper into
   genuine extremes. If thresholds weren't re-tuned post-Wilder-fix,
   the strategy is buying RSI 25 (lower deeper) and selling RSI 75
   (upper deeper) but holding through to RSI 15 / 85 *before*
   reversal mean-reverts. The exit is wrong, not the entry.
2. **Mean-reversion in a trending regime is a buy-the-dip-of-a-
   cliff strategy.** dTAO subnet prices in the post-Conviction Era
   often trend monotonically for 3–5 days as conviction-locked
   alpha accumulates. Mean-reversion on a monotone trend = fading
   the trend = losing on every trade. The strategy needs a regime
   filter that's NOT the canonical regime detector (because Day 8
   INV-3 made it regime-agnostic by design) — it needs a
   **subnet-specific monotonicity filter**: if last 6 of 7 candles
   are same-direction, do not fade.
3. **Position-size symmetry on asymmetric distributions.** Mean-
   reversion strategies typically have win-small / lose-big
   distributions because the mean-reverted price reverts a known
   amount but the trended-against price runs unbounded. 26.6% WR
   isn't necessarily fatal *if* the avg-win / avg-loss ratio is
   3:1 or better. **Need the avg-W / avg-L number before redesigning
   anything.**

### Day 14 plan (sequential)

1. **Pull avg_win and avg_loss** for mean_reversion strategy from
   `trades` table. If avg-W / avg-L ≥ 2.5, the 26.6% WR may be a
   feature, not a bug — strategy survives at WR > ~28.6% (1 / 3.5).
2. **If ratio is <2.0**, strategy is structurally bleeding —
   redesign the **exit logic first** (hypothesis 1). Keep entry
   thresholds untouched; tighten exit to fixed `ATR × 2` instead of
   waiting for full mean-revert. Test on the last 79 trades
   synthetically before shipping.
3. **If ratio is ≥2.0 and WR is 26.6%**, strategy is correctly
   sized but firing too often into trends — redesign with
   hypothesis 2's monotonicity filter. Test synthetically; if filter
   reduces trade count by ~40% and lifts WR to >35%, ship behind a
   feature flag and observe for 50 trades.

### What does NOT happen Day 14

- No `cycle_service.REGIME_SUITABILITY` change (Day 8 INV-3 is
  load-bearing; mean-reversion stays regime-agnostic at the cycle
  level — any new filter is internal to mean-reversion's own
  signal logic).
- No removal from the fleet (OpenClaw / Fleet Consensus needs all
  12 voices for the 7/12 supermajority — same constraint Day 8 R4
  named when rejecting macro_correlation retirement).

---

## ITEM 3 — Momentum Cascade redesign (31.3% WR / 642 trades / −0.136τ)

### The current state

Momentum Cascade is at **31.3% WR** on **642 trades** with a paper
P&L of **−0.136τ**. 642 trades is *deeply* statistically significant
— the strategy is near-zero-information at 31.3% WR (random would
be ~50%, anti-trend would be ~70% inverted). Paper P&L of −0.136τ
on 642 trades = avg loss per trade ~ −0.00021τ, which means the
strategy is roughly break-even on PnL despite the bad WR — implying
**big-win / lots-of-small-losses asymmetric distribution**.

That's the actual signature of a momentum strategy: the strategy
catches the rare-but-large breakout and pays for it with frequent
small mean-reversions. The 31.3% WR is *expected* for this
strategy class; the question is whether avg-W / avg-L is large
enough to make the negative expectancy positive.

### Hypotheses

1. **Avg-W / avg-L ratio is sub-3.0.** Momentum strategies need
   avg-W / avg-L of 3.0+ to be profitable at WR ~30%. If the ratio
   is <2.5, the strategy is structurally negative-expectancy and
   needs a position-sizing fix, not a signal fix.
2. **Stop-loss too tight.** Momentum cascade benefits from letting
   winners run. If the strategy uses a tight stop (1.5×ATR) it
   exits the few wins early, collapsing avg-W and breaking the
   30%-WR / 3.0-ratio formula.
3. **Entry signal noise.** If Momentum Cascade fires on every
   marginal RSI move above 50, it's catching too many false
   positives. Tightening the entry trigger (e.g., RSI > 55 AND
   MACD histogram > prior bar) cuts trade count, may lift WR.

### Day 14 plan (sequential, after Item 2 read)

1. **Pull avg_win / avg_loss / avg_hold_duration** for
   momentum_cascade. Compute Kelly criterion: `f* = WR − ((1−WR) /
   (avg_W / avg_L))`. If `f* > 0`, strategy is profitable
   long-run; the −0.136τ is variance, not edge.
2. **If `f* > 0`**, hold the redesign. The strategy is working as
   designed; 642 trades is still inside the variance window for a
   30% WR strategy. Document the Kelly read in the worksheet, file
   for Friday review.
3. **If `f* < 0`**, the strategy is bleeding edge. Redesign exit
   first (hypothesis 2): widen stop to 2.5×ATR, trail the winner,
   observe 100 trades.
4. **If trade count is materially above expectations** (>5 trades/
   day), tighten entry (hypothesis 3) before exit.

### What does NOT happen Day 14

- No removal from fleet (same supermajority constraint as Item 2).
- No promotion to LIVE (paper-only baseline holds; Friday gate
  unchanged).

---

## Order of operations Day 14 morning

1. **Pre-flight (5 min):** Verify Railway healthy + Day 13 morning
   pickup-queue items #1 and #2 status (execution_guard live-pool
   swap; R9 deploy held overnight). If item #1 is still pending,
   ship it FIRST — it changes the data we read for everything below.
2. **Read pass (30 min):** Pull data tables A–E from Item 1 + the
   avg_W/avg_L numbers for Items 2 and 3. **Do not write code.**
   Walk the numbers with Mark before committing to any redesign.
3. **Frame for Mark:** one-page status against this worksheet.
   Confirm or revise hypothesis ranking based on real data.
4. **Mark picks the priority order.** Default: Item 1 read →
   Item 2 redesign → Item 3 redesign. Mark may invert if data
   surprises.
5. **Each redesign ships behind a feature flag in
   `_RISK_CONFIG`** so Mark can flip it off in one click without
   a redeploy if the redesign reads worse than the original.

---

## Friday strategic-fork checkpoint (May 29) — what we need by then

- **Fleet WR readout** with the diagnosis from Item 1 attached,
  not just the number.
- **Per-strategy verdict** for Items 2 and 3 (redesigned, redesigned-
  and-shipped, redesigned-but-held, or "Kelly-positive, no
  change").
- **Sharpe Score read** if implementation lands Day 14 (gated on
  Mark green-light per `SHARPE_SPEC.md`).
- **Recommendation to fork or hold.** If fleet WR is still 33–36%
  after Day 14 redesigns have had time to read (1–2 days), Friday
  is genuine drawing-board territory. If the redesigns lift WR to
  >40%, Friday is "hold one more week and re-read."

---

## What this worksheet does NOT replace

- The Sharpe Score implementation (separate spec, separate
  green-light).
- The OpenClaw → Fleet Consensus rename (separate session, see
  `RENAME_FLEET_CONSENSUS.md`).
- The three deferred research-log rows (Lewis Jackson / Hermes /
  Axiom — Mark's call to defer or skip permanently).

— Ari, Day 13 wrap-up, 2026-05-26 evening