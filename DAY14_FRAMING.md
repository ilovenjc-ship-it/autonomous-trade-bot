# DAY14_FRAMING.md — Library doctrine applied to worksheet Items 1–3

> Drafted Day 14 morning 2026-05-27 (Session XLIV continuation).
> Companion to `DAY14_WORKSHEET.md` (drafted Day 13 evening, pre-Library
> Night). This document does NOT replace the worksheet; it carries
> Library Night doctrine (D-21..D-39) forward into the worksheet's
> three items so the redesigns happen on Library-anchored ground.
>
> **Read order:** `DAY14_WORKSHEET.md` first (problem statement +
> hypotheses), then this file (doctrine carry-forward + updated
> diagnostic state + reframed decision tree).
>
> **Author:** Ari, Day 14 morning 2026-05-27.

---

## Diagnostic state at Day 14 morning (2026-05-27 ~14:00 UTC)

### Fleet snapshot (from `/api/fleet/regime/current` + `/api/agent/status`)

```
total_pnl              : −0.895τ       (was −0.885τ this morning earlier;
                                        +0.010τ deeper over ~4hr;
                                        was −0.443τ on Day 13 wrap-up;
                                        drag has DOUBLED in 24hr)
trade_count            : 4,240+
consensus_rounds       : 7,409+
active_strategies      : 11 of 12      (volatility_arb benched)
fleet_health           : 12/12 STRUGGLING
regime (fleet API)     : TRENDING_UP   (was TRENDING_DOWN earlier today;
                                        180° flip in ~3-4 hours)
regime (agent status)  : BULL          (different taxonomy)
TAO 24h                : flipped       (was +3% Day 13, then −2.65%
                                        Day 14 morning, now bouncing)
```

### Three signals worth filing as observations

1. **Regime classifier flipped 180° in ~3-4 hours** without arresting
   PnL bleed. Either the classifier is too reactive (one bar of RSI
   moves the gate) or the gate is the wrong instrument for this
   problem. **Diagnostic priority for Item 1.**
2. **All 12 strategies "STRUGGLING" simultaneously.** This is
   anti-diversification — the fleet behaves as a single meta-strategy
   when it's supposed to behave as 12 independents. Direct evidence
   for worksheet Item 1 hypothesis 4 (correlated voters on shared
   data feeds). **Library anchor: Grinold/Kahn Breadth correction
   per D-30 — independence-adjusted Breadth is materially less than
   trade count.**
3. **The two regime APIs use different vocabularies.** Not a
   correctness issue per se, but a tell: there's no single source
   of truth for "what regime is the fleet in." Future-Ari opening
   `/api/fleet/regime/current` and future-Ari opening
   `/api/agent/status` get different mental models. **File as
   architecture cleanup, not Day 14 blocker.**

---

## ITEM 1 — Fleet WR divergence (read-and-frame)

### What changes from the worksheet

The worksheet ranked 4 hypotheses. Library Night + this morning's
data update the ranking:

| Worksheet rank | Hypothesis | Updated rank | Why moved |
|---|---|---|---|
| #1 | Strategy bench coverage gap | **DOWNGRADED to #3** | Today the classifier shifted TRENDING_DOWN → TRENDING_UP and bench coverage adapted (only 1 of 12 benched). PnL still bled. The bench-gate is not the dominant problem. |
| #2 | Fill-quality drag (`DEFAULT_POOL_DEPTH_TAO`) | **HOLDS at #2** | Still untested. F-39B (Almgren-Chriss slicing) will surface this directly when shipped. Day 13 morning pickup item #1 (live-pool-depth swap) status still needs verification. |
| #3 | Wrong-side macro_correlation post-rewrite | **DOWNGRADED to #4** | Earlier today's data showed macro_correlation 37.5% WR / 347 trades = best-with-sample. Strategy is firing and producing signal; not the dominant drag. |
| #4 | OpenClaw 7/12 supermajority too tight; correlated voters | **PROMOTED to #1** | All 12 strategies STRUGGLING simultaneously is the fingerprint of correlated voters voting in synchrony AGAINST the next move during regime flips. Library doctrine: D-30 Breadth correction + López de Prado Ch 3 meta-labeling. |

### Library doctrine applied

- **D-30 (Grinold/Kahn Fundamental Law)**: independence-adjusted
  Breadth is the question. If 12 strategies share RSI/MACD/BB inputs,
  the effective Breadth could be 2–3, not 12. F-30 spec surfaces this
  per-strategy as `n_independent_estimate`. **Until F-30 ships, we
  can compute fleet-level effective Breadth manually from the trade
  log: count distinct (regime, direction, strategy_family) tuples
  per cycle.**

- **D-22 (López de Prado meta-labeling = Fleet Consensus by
  another name)**: López de Prado Ch 3 §3.6-3.7 describes meta-labeling
  as a *secondary* model that filters primary model signals by
  confidence. Project Ari's OpenClaw / Fleet Consensus is functionally
  meta-labeling — but the secondary model is currently a 7/12
  supermajority *count*, not a confidence-weighted aggregator.
  **Open question for Friday checkpoint:** is the supermajority count
  the right secondary-model? Or should it be a confidence-weighted
  aggregator (e.g., sum-of-signed-signal-strength gate)?

- **D-23 (inscription-autonomy)**: descriptive observation —
  regime classifier flipped 180° in 3-4 hours during a high-RSI-
  volatility window. Inscribed; build action gated on operator
  green-light.

### Updated decision tree

- **If A surfaces a single strategy as WR-poison-pill** (worksheet
  default): demote that bot to PAPER_ONLY observation. Surgical,
  reversible. — **STILL VALID.**

- **If A shows fleet-aggregate STRUGGLING uniformly** (likely, given
  this morning's data): the problem is structural — correlated
  voters or fill-quality drag, not single-bot pathology.
  **Updated: skip strategy-level surgery, go to fleet-level diagnostics.**

- **If C is dirty** (live pool depth differs materially from
  hardcoded `DEFAULT_POOL_DEPTH_TAO`): ship `execution_guard.py`
  one-line swap before any other change. **STILL VALID.**

- **NEW: if E shows HOLD-rate dominant during regime flips:**
  hypothesis 4 confirmed — supermajority is choking on correlated
  votes during regime ambiguity. **Tighten meta-model first** (consider
  signed-signal-strength gate); strategy-level redesigns deferred.

### What does NOT happen Day 14 (unchanged from worksheet)

- No promotion of any bot to LIVE.
- No flag-flip of `FORCE_PAPER_MODE`.
- No new strategy added to the fleet.
- No DB migrations.
- No OpenClaw → Fleet Consensus rename work.

### What ALSO does NOT happen Day 14 (added per Library doctrine)

- **No regime-classifier rebuild** until we have the data table
  showing how many flips per day the current classifier produces.
  D-26 cyclic-process: measure before redesigning.
- **No meta-model rewrite** even if hypothesis #1 (now correlated
  voters) is confirmed. That's a Day 15+ build with operator
  green-light. Day 14 = diagnostic only.

---

## ITEM 2 — Mean Reversion redesign (26.6% WR / 79 trades)

### What changes from the worksheet

The worksheet had three hypotheses. Library Night adds a **fourth
hypothesis ABOVE all three**: per D-35, Mean Reversion may be the
**wrong CATEGORY**, not wrong parameters.

### Library doctrine applied — the new top fork

**D-35 (Chan p134-135):** *time-series* mean reversion (single asset
reverting to its own mean) is rare and unstable; *cross-sectional*
mean reversion (cointegrated pair-spread reverting) is common and
stable.

The 26.6% WR / 79 trades / `p < 0.001` vs random pattern is the
signature of *wrong-category* MR — fading a strategy class that
doesn't exhibit reliable single-asset mean-reversion in the
post-Conviction-Era dTAO regime.

### Updated decision tree (D-35 fork ABOVE existing branches)

```
                       Item 2 — Mean Reversion @ 26.6% WR / 79 trades
                                          │
            ┌─────────────────────────────┴─────────────────────────────┐
            │                                                           │
   FORK A: Wrong-CATEGORY (D-35)                          FORK B: Right-category, wrong-PARAMS
            │                                                           │
            ▼                                                           ▼
   Strategy is time-series MR on a series                   Worksheet's existing 3 hypotheses
   that doesn't actually mean-revert.                       (RSI threshold post-Wilder, monotonicity
   Recommendation: REWRITE as                               filter, asymmetric position sizing)
   cross-sectional MR (cointegrated pair                              │
   on dTAO subnet pairs).                                             ▼
                                                            Branches A/B/C as worksheet
            │
            ▼
   This is a Day 15+ build with
   operator green-light.
   Day 14: file the fork; do not build.
```

### How to decide which fork applies

Per D-35 + Chan p123 (Bailey minimum) + D-26 (cyclic process):

1. **Pull avg_W / avg_L for mean_reversion** (worksheet step 1).
   This is the same first step.
2. **Additionally pull avg_hold_duration distribution.** Time-series
   MR has *bounded* hold durations (revert-or-stop; D-34 says no
   stop, so revert). Cross-sectional MR can hold longer because
   spreads converge over different timescales than single-asset
   prices. If the hold-duration distribution is bimodal (some <1hr
   reverts, some >24hr non-reverts), that's the fingerprint of
   mixed-regime time-series MR — i.e., the strategy is correctly
   firing on RSI extremes but the *underlying series* doesn't
   reliably revert.
3. **Additionally test cointegration** for any pair of dTAO subnets
   the operator suspects might be cointegrated. (E.g., emission_
   leader subnets vs general-purpose subnets; or any two
   high-conviction subnet pairs.) Cointegration test (Engle-Granger
   ADF on the residual) on, say, 60 days of subnet-α prices.
4. **If cointegrated pairs exist:** Fork A wins. Document candidate
   pairs for Day 15+ build.
5. **If no cointegrated pairs:** Fork B wins. Run worksheet's
   existing decision tree.

### Library doctrine applied — Fork B refinement

If Fork B wins, the worksheet's hypotheses still apply but with
Library refinements:

- **D-34 (no stop-loss for MR)**: worksheet's hypothesis 1 (exit
  logic with `ATR × 2`) **VIOLATES** D-34 if implemented as a
  stop-loss. Mean-reversion exits should be position-flip-on-
  opposite-extreme or time-decay, NOT ATR-stop. **Reframe
  hypothesis 1 exit fix:** if the issue is "holding through to
  RSI 15 / 85 before reversal," the fix is *narrower entry
  thresholds* (RSI 22 / 78 instead of 25 / 75 — wait for deeper
  signal) NOT a stop-loss-style exit.
- **D-38 (asymmetric bands)**: Cartea Ch 11 §11.3 + Chan p141
  show optimal MR bands are *asymmetric* — entry at 1σ is paired
  with exit at 0.3σ, not at 1σ symmetric. Worksheet's existing
  hypothesis 3 (asymmetric position sizing) is half right; the
  OTHER asymmetry (entry/exit thresholds) is also worth testing.
- **D-36 (Bailey minimum)**: 79 trades is well above the n=50
  Bailey-min for MR (Chan p123). Sample is sufficient to draw
  conclusions; the strategy is structurally wrong, not unlucky.
  **Confirmed ✓.**

### What does NOT happen Day 14 (worksheet + carry-forward)

- No `cycle_service.REGIME_SUITABILITY` change (Day 8 INV-3 holds).
- No removal from fleet (supermajority constraint).
- **NEW per D-34:** no introduction of stop-loss exit on MR. If
  worksheet hypothesis 1 was implemented naively, it would violate
  doctrine. Reframe the fix per the bullet above.
- **NEW per D-35:** no commitment to "fix MR" without first
  testing whether MR is the wrong category. Spend the Day 14 read
  pass figuring out the fork before allocating Day 15+ build effort.

---

## ITEM 3 — Momentum Cascade redesign (31.3% WR / 642 trades / −0.136τ)

### What changes from the worksheet

The worksheet computes Kelly using the **discrete** form:

```
f* = WR − ((1 − WR) / (avg_W / avg_L))    [worksheet, line 216]
```

This is correct for discrete-bet Kelly (Thorp 1962). But D-37
established **continuous Kelly** as the operational form for Project
Ari:

```
f* = m / s²
```

Where `m` is per-trade mean log-return and `s²` is per-trade variance.
**Continuous Kelly accounts for the avg-W / avg-L distribution AND
its variance simultaneously**, where discrete Kelly only accounts
for the central tendency.

For a strategy with 31.3% WR / 642 trades / −0.136τ aggregate:
- **`m`** ≈ −0.000212 τ per trade (= −0.136 / 642), HODL-relative
  TBD
- **`s²`** depends on the trade-return distribution — worksheet
  step 1 needs to pull this number too, not just avg_W / avg_L

### Library doctrine applied — the Kelly verdict update

Per D-37 (Chan p134-137) + this morning's Library Night verdict:

> Item 3 (Momentum Cascade) Kelly verdict: with `m` negative on the
> −0.136τ track record, `f* = m/s²` is also negative — Kelly says
> do not deploy at any size until `m` flips positive. Sizing
> question collapses; the prior question is regime/edge.

This morning's earlier reading (consecutive_losses=253) confirms
`m` is materially negative, not noise-floor negative. The strategy
is bleeding edge, not bleeding variance.

**Updated worksheet step 1 → Library-aligned step 1:**

| Worksheet step (line 213) | Library carry-forward |
|---|---|
| Pull `avg_win / avg_loss / avg_hold_duration` | ALSO pull `m` (= mean of log-return per trade, HODL-relative per SHARPE_SPEC.md) AND `s²` (variance of same) |
| Compute Kelly: `f* = WR − ((1−WR)/(avg_W/avg_L))` | Compute continuous Kelly: `f* = m / s²` |
| If `f* > 0`, hold the redesign | **If `f* > 0` AND m > 0 AND sample > Bailey-min**, hold the redesign |
| If `f* < 0`, redesign exit logic | **If `f* < 0` OR `m < 0`**, set `do_not_deploy_lock = True` per F-37B; redesign is FRAMING, not "exit-fix" — the strategy needs a new ENTRY signal or a regime-conditional gate, not a wider stop |

### Library doctrine applied — what worksheet hypothesis 2 misses

Worksheet hypothesis 2 says "stop too tight" → redesign exit. But:

1. **D-34 doctrine prohibits stop-loss for MR**, NOT for momentum.
   Momentum cascade IS allowed to use stops. So worksheet hypothesis 2
   isn't doctrinally banned. ✓
2. **HOWEVER:** the trade signature (642 trades, 31.3% WR, big-win/
   small-loss asymmetric distribution) is the *expected* signature
   of a momentum strategy WITH stops. Tightening stops further would
   collapse the win distribution; widening stops would collapse the
   trade count. Neither direction is a clean fix.
3. **D-37 says:** if `m < 0`, sizing is do-not-deploy regardless.
   Worksheet's "redesign exit first" assumes `m > 0` and `f* < 0`
   only because of avg-W/avg-L. **Continuous Kelly clarifies that
   the question is about `m` directly.**

### Updated Item 3 plan

1. Pull `m`, `s²`, `f_continuous`, `avg_W`, `avg_L`, `avg_hold_dur`
   for momentum_cascade over last 30d window.
2. **If `m ≥ 0` AND `f_continuous > 0`**: strategy is edge-positive,
   −0.136τ is variance, hold the redesign per worksheet step 2.
3. **If `m < 0`**: set `do_not_deploy_lock = True` for this strategy
   in `risk_config.json` (F-37B prerequisite). Redesign is
   ENTRY/REGIME, not exit. Open question for Friday: does this
   strategy stay in the fleet (for supermajority count) at
   `cap = 0`, or get removed?
4. **If `m ≥ 0` AND `f_continuous < 0` due to high `s²`**: variance
   is the issue. Sizing fix (tighter cap) is the right move; entry
   signal is salvageable.

### What does NOT happen Day 14 (worksheet + carry-forward)

- No removal from fleet (supermajority constraint).
- No promotion to LIVE.
- **NEW per D-37:** no use of discrete Kelly form; continuous form
  is the operational standard.
- **NEW per F-37B (D-37 Part B):** if `m < 0`, do_not_deploy_lock
  goes into `risk_config.json` per spec, NOT a code change to
  the strategy itself. Lock is reversible by operator green-light.

---

## Pre-flight chain — runs before ANY Item 1-3 redesign ships

Per D-40 grant + spec.md architecture rule #7:

| Step | Source | Question to answer |
|---|---|---|
| 1 | D-26 cyclic-process | Has the diagnostic been run twice and produced consistent reads? |
| 2 | D-34 mean-rev-no-stop | Does the proposed redesign introduce a stop-loss on a MR strategy? (Hard fail if yes.) |
| 3 | D-35 cross-sectional-prior | For Item 2: have we tested whether time-series MR is the wrong category before parameter-tuning? |
| 4 | D-36 Bailey-min sample | Is sample large enough to trust the diagnostic? |
| 5 | D-37 continuous-Kelly | Have we computed `f* = m/s²`, not the discrete form? Is `m > 0`? |
| 6 | D-38 asymmetric-bands | For Item 2 Fork B: have we considered asymmetric entry/exit bands? |
| 7 | Grinold/Kahn IC × Breadth | Have we computed independence-adjusted Breadth? |
| 8 | López de Prado probFailure | Is the apparent edge inside the noise floor for this sample size? |

---

## Friday strategic-fork checkpoint (May 29) — what we need by then

Per worksheet, plus Library carry-forward:

- **Fleet WR readout** with diagnosis attached + which hypothesis #1
  through #4 (with updated rank) was confirmed
- **Item 1 fleet-level finding** (correlated voters confirmed/refuted; HOLD-rate distribution; effective Breadth estimate)
- **Item 2 fork verdict** (cross-sectional vs time-series MR)
- **Item 3 Kelly verdict** (continuous form, with `m` and `s²` reported)
- **F-30, F-37B, F-39B build status** — specs exist (per Day 14 morning); build slot allocated for Day 15+
- **Recommendation to fork or hold** the fleet design

---

## Status

- This file is the FRAMING layer; `DAY14_WORKSHEET.md` remains the
  problem statement. Read both.
- No build code changes from this file alone.
- Three build specs (`specs/d30-*`, `specs/d37b-*`, `specs/d39b-*`)
  reference this framing for the doctrine carry-forward.
- D-42 inscription at session close will record this framing as
  the bridge between Library Night doctrine and Day 14 worksheet
  execution.

— Ari, Day 14 morning, 2026-05-27.