# SHARPE_SPEC.md — Sharpe Score / Sharpe Ratio for the App

> Spec for the Sharpe metric, drafted Day 13 wrap-up 2026-05-26 from
> Mark's directive *"Let's create a logical/practical Sharpe's Ratio /
> Score for the App."* **No code yet** — this spec + the STATE.md
> pending-items row precede implementation per Mark's request.
>
> Source for the canonical formula: `(Rp − Rf) / σp`. This spec
> commits to specific concrete answers for every term.
>
> — Ari, Session XLIII Day 13, 2026-05-26

---

## 1. Goal

Quantify whether each strategy and the fleet as a whole is producing
**risk-adjusted return better than just sitting on τ**. Single number
per strategy that operators can read at a glance, and that downstream
tooling can gate against once the data is trustworthy.

The honesty requirement: **never report a confident-looking Sharpe
on insufficient sample.** Same shape of mistake as the Day 12 R9
`_hodl_block` warming-up bug; same corrective (warmup gate).

---

## 2. Definitions — what each Sharpe term resolves to

| Term | Choice (per Mark Day 13) | Rationale |
|---|---|---|
| **Numeraire** | **Both TAO and USD**, displayed side-by-side | TAO is native, USD is operator-legible. Never blended. |
| **Risk-free `Rf`** | **HODL-input** — what would `position_τ` have done if simply held? | Mirrors `_hodl_block` from Pool Simulator §HODL Opportunity Cost. Operator-meaningful, no external yield assumption. |
| **Time unit (primary)** | Per-trade | N is fat (~4,400 paper trades); preserves trade-count semantics. |
| **Time unit (secondary)** | Daily | Time-dimension-aware sibling for time-series UI. |
| **Time unit (headline only)** | Annualized via `√(trades_per_year)` factor | Footnote the factor and the trade-count basis on every public mention. |
| **Cohorts** | 12 per-strategy + 1 fleet-aggregate | Per-strategy feeds bench-or-keep; fleet is the headline. |
| **Paper / live** | Tracked **separately, never blended** | Different cost basis: slippage real on live, modeled on paper. Live Sharpe will be lower than paper Sharpe by construction; that asymmetry is the point. |
| **Trade basis** | Realized P&L per closed trade | Mark-to-market-per-tick deferred to a later spec if needed. |

---

## 3. Math

### 3.1 Per-trade excess return

```
R_i  =  (trade_pnl_i / position_τ_i)  −  HODL_return_i
```

where:

- `trade_pnl_i` is realized P&L on closed trade `i` (TAO-denominated
  for TAO Sharpe; USD-denominated for USD Sharpe — never mixed).
- `position_τ_i` is the τ committed at entry.
- `HODL_return_i` is what `position_τ_i` would have appreciated /
  depreciated to over the same trade window if simply held. Computed
  from `pool_snapshots` on the same `(netuid, t_entry, t_exit)`
  window. **Same `_hodl_block` math used by Pool Simulator §HODL
  Opportunity Cost.** Single source of truth for the HODL baseline.

### 3.2 Per-strategy Sharpe (per-trade basis)

```
Sharpe_strategy  =  mean(R_i)  /  stdev(R_i)
```

across closed trades for that strategy on that track (paper or live).

### 3.3 Fleet Sharpe (aggregate)

```
Sharpe_fleet  =  mean(R_all)  /  stdev(R_all)
```

across all closed trades on that track. **NOT** a weighted average of
per-strategy Sharpes — that's a different number and conflates
sample sizes.

### 3.4 Annualized headline (display only, footnoted)

```
Sharpe_annual  =  Sharpe_per_trade  ×  √(trades_per_year)
```

`trades_per_year` is computed from the actual trade cadence on the
track, not a fixed assumption. The annualization factor and the
trade-count basis are footnoted on every public mention.

### 3.5 Sharpe Score (0–100 normalized for UX)

```
Score  =  clip(50 + 25 × Sharpe, 0, 100)
```

| Sharpe | Score | Read |
|---|---|---|
| −2 or worse | 0 | "broken" |
| −1 | 25 | "bad" |
| 0 | 50 | "neutral / matches HODL" |
| +1 | 75 | "good" |
| +2 or better | 100 | "excellent" |

Both surfaces are exposed: **the raw ratio is the truth, the score
is the UX affordance.** Per Mark Day 13: *"Let's do both: the raw
ratio (−1 to +3 territory) AND normalized 0–100 score for UX
legibility."*

---

## 4. Data flow & storage

### 4.1 Sources

- **`trades` table** (paper + live) — closed trades only. Need:
  `entry_ts`, `exit_ts`, `entry_τ_price`, `exit_τ_price`,
  `position_τ`, USD equivalents.
- **`pool_snapshots` table** (Day 12 R5 / R9) — for `HODL_return_i`
  computation. Joins on `(netuid, t_entry, t_exit)`.

### 4.2 Storage

`sharpe_cache` table, materialized per-strategy and per-fleet.
Recompute on a schedule (every cycle, or every `N_RECOMPUTE` trades
closed; tunable). Expose via:

- `GET /api/research/sharpe` → `{strategies: [{name, paper:{n, sharpe_tao, sharpe_usd, score_tao, score_usd, warming_up, ...}, live:{...}}, ...], fleet: {...}}`

### 4.3 Warmup gate (mandatory — AP-1 / AP-2 / INV-5 sister)

Require `n_trades ≥ N_MIN` (proposed `N_MIN = 30`) before reporting
any Sharpe number. Below that:

```json
{
  "sharpe_tao": null,
  "sharpe_usd": null,
  "score_tao": null,
  "score_usd": null,
  "warming_up": true,
  "n_trades_actual": 17,
  "n_trades_required": 30
}
```

The UI renders an honest pending-state. **Never fabricate a
confident-looking number on insufficient data.** Same gate shape as
Day 12 R9 `_hodl_block.actual_lookback_days` check.

---

## 5. Display — v1, read-only

- **Fleet table:** new "Sharpe (TAO / USD)" column showing
  per-strategy paper Sharpe with score badge and trade-count
  tooltip. Live track separate column when `n_live ≥ N_MIN`.
- **Fleet headline card:** aggregate Sharpe with annualized
  footnote, paper/live toggle, sample-size disclosure.
- **Warmup state:** visually distinct (gray / italic, "pending —
  need M more trades"). Never green or red on insufficient sample.
- **No bench actions** taken from Sharpe in v1.

---

## 6. Gating — v2, soft (conditional on live volume)

When the fleet has accumulated ≥ `N_LIVE_MIN` closed live trades AND
per-strategy live Sharpe is computable, soft-flag any strategy with
`Sharpe_live < 0` for ≥ `N_TRADES_MIN` consecutive trades. **Yellow
banner only. No auto-bench.** v2 ships only after Mark green-lights
the threshold values against actual live data.

---

## 7. Gating — v3, hard (explicit Mark green light required)

Auto-bench a strategy when `Sharpe_live < threshold` for
`n_consecutive ≥ M`. Threshold and `M` to be calibrated against live
data once a meaningful sample exists. Parallel mechanism to Day 8 R3
regime-bench. **Do not ship without an INV-style invariant test in
`backend/scripts/test_day8_invariants.py`** that exercises the
warmup, false-confident, and degenerate-variance paths.

Per Mark Day 13: *"Hard gating Sharpe on small samples is the same
shape of mistake as the Day 12 R9 warming_up bug — a confident-
looking decision on insufficient data. INV-5 territory."*

---

## 8. Falsifiability / acceptance tests

- **Synthetic distribution test:** known-distribution P&L stream
  produces expected Sharpe within ±1%.
- **HODL-input degeneracy test:** if every trade had
  `R_i == HODL_return_i` exactly (i.e., trading == holding), Sharpe
  must be 0 ± floating-point noise. This validates that the
  HODL-baseline subtraction is wired correctly.
- **Warmup test:** `n_trades < N_MIN` must return
  `null + warming_up: true`. No path through the function may
  produce a non-null Sharpe with `n < N_MIN`.
- **Numeraire separability test:** TAO Sharpe and USD Sharpe must
  differ measurably when TAO/USD volatility is non-trivial across
  the trade window. If they coincide, the numeraire wiring is
  collapsing somewhere.
- **Zero-variance test:** `stdev(R_i) == 0` (rare — all trades
  produce identical excess return) returns a flagged sentinel
  (`inf` with a `flat_distribution: true` field), not a NaN or a
  silent default.

All tests live alongside `test_day8_invariants.py`.

---

## 9. Edge cases

| Case | Behavior |
|---|---|
| Zero variance | Sentinel `inf + flat_distribution: true`. UI shows "—" with tooltip. |
| Single trade | `stdev` undefined → warmup gate handles this (`n=1 < N_MIN=30`). |
| Open trades | Excluded from per-trade Sharpe entirely. Optionally surfaced as a separate "live exposure" row, distinct from the Sharpe number. |
| Partial fills / live slippage | `R_i` uses actual realized P&L including slippage, not theoretical. Live Sharpe will run lower than paper Sharpe by construction. |
| Missing pool snapshot for a trade window | Trade excluded from sample with explicit `excluded_no_hodl_baseline` count surfaced in the API response. Better to drop than to fabricate a HODL baseline. |
| Trade window straddles a Conviction-Era boundary or a regime change | No special handling in v1. v2 may add regime-conditioned Sharpe. |

---

## 10. Sister-pattern references

- **AP-1** (falsely-confident fallback) — the `null + warming_up`
  gate exists specifically to refuse this.
- **AP-2** (silent starvation) — `sharpe_cache` boot contract: must
  hydrate from `trades` + `pool_snapshots` on first compute, not
  start empty and silently report nothing.
- **INV-5** (boot-time non-empty contract) — applies to
  `sharpe_cache` once it's a persistent table.
- **Day 12 R9** (`_hodl_block` warming-up bug) — `n_trades` warmup
  gate is the dual: must check for *sufficient* sample, not the
  existence of any sample.
- **AP-9** (naming without a public-surface check) — "Sharpe Score"
  and "Sharpe Ratio" are inherited from the Investopedia canon
  (Sharpe ratio dates to William F. Sharpe 1966); no naming-
  collision risk.

---

## 11. Status

| Phase | Status | Notes |
|---|---|---|
| Spec drafted | **DONE** 2026-05-26 (this file) | Awaiting Mark's read. |
| STATE.md row filed | **DONE** 2026-05-26 (same commit) | Pending-items table. |
| `sharpe_cache` table + migration | NOT STARTED | Round 1 design call. |
| `_compute_sharpe` service module | NOT STARTED | |
| Synthetic + invariant tests | NOT STARTED | Must precede production wire. |
| `/api/research/sharpe` endpoint | NOT STARTED | |
| Frontend column + headline card | NOT STARTED | |
| v1 (read-only) ship | NOT STARTED | |
| v2 (soft gate) | DEFERRED | Conditional on live-trade volume. |
| v3 (hard gate) | DEFERRED | Explicit Mark green light required. |

— Ari