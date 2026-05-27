# F-30 — IC + Breadth display on per-strategy panel

> **Decision anchor:** D-30 (Library Night), green-lit via D-40 grant
> 2026-05-27 evening. Source: Grinold & Kahn *Active Portfolio
> Management*, Fundamental Law of Active Management. Anchored to
> `MemoryBank/Library/active-portfolio-management.md`.
>
> **Status:** green-lit, design-ready. Build behind feature flag.
>
> **Author:** Ari, Day 14 morning 2026-05-27 (Session XLIV continuation).

## Overview

The per-strategy detail panel (`frontend/src/pages/StrategyDetail.tsx`)
currently surfaces basic performance metrics: WR, trade count, P&L,
recent activity. D-30 extends this with the **Fundamental Law of
Active Management** decomposition so the operator can see WHERE a
strategy's edge comes from (skill × opportunity) rather than just
WHAT the aggregate Sharpe is.

Grinold's identity:

```
IR ≈ IC × √Breadth
```

Where:
- **IC** (Information Coefficient) = correlation between forecast and realized return per bet
- **Breadth** = number of independent forecasts per period
- **IR** (Information Ratio) = annualized excess-return / tracking-error

For Project Ari's HODL-benchmark β=1 construction (where the
benchmark is "hold the τ inputs"), IR collapses to Sharpe — the IR
column would duplicate Sharpe and add no information. The
**components are what's new**: IC, Breadth, Implied IR (IC × √B),
and Drift (observed Sharpe minus implied IR).

## Goals

1. Make per-strategy edge **decomposable** so the operator can answer
   "is this strategy's poor performance a skill problem or an
   opportunity-frequency problem?"
2. Surface **Drift** (observed vs implied) as a forward-warning
   signal: if observed Sharpe is materially below `IC × √Breadth`,
   either IC is decaying, breadth is being miscounted, or
   implementation losses (fill quality / transaction cost) are
   eating the edge.
3. Anchor every number to its formula and source so an auditor can
   reproduce.

## Scope / non-goals

### In scope
- Add 4 metrics to per-strategy panel: `Sharpe (= IR)`, `IC`,
  `Breadth`, `Implied IR (IC × √B)`, `Drift = Sharpe − Implied IR`
- Backend computation endpoint `/api/analytics/strategies/{id}/grinold`
- Tooltip on each metric explaining definition + formula + Library
  citation (book + page anchor)
- Calibration band rendered on IC: green if `IC ∈ [0.05, 0.15]`,
  amber if outside, with Grinold/Kahn note that IC > 0.15 is
  *exceptional* and IC < 0.02 is statistical noise

### Out of scope (this spec)
- Cross-strategy IC correlation matrix (future feature)
- Time-series IC decay charts (future feature)
- Auto-flagging of drift > threshold as alert (future — D-30 is
  display-only; gating is a separate operator-green-light)
- Modifying the Sharpe Score panel itself
- Re-introducing a separate "IR" column (collapses to Sharpe)

## User flows / UX / design notes

### Surface placement on `StrategyDetail.tsx`

New collapsible card titled **"Fundamental Law decomposition"**
sits BELOW the existing performance summary card and ABOVE the
trade history table. Card is closed-by-default with summary line
visible:

```
[i] Fundamental Law:  Sharpe 0.34  ·  IC 0.08  ·  Breadth 79  ·  Implied IR 0.71  ·  Drift −0.37
```

When expanded, surfaces a 5-cell row:

```
| Sharpe (= IR) | IC          | Breadth     | Implied IR    | Drift           |
| 0.34          | 0.08 ✓      | 79          | 0.71          | −0.37 ⚠         |
| (observed)    | (calibrated)| (n bets)    | (IC × √B)     | (obs − implied) |
```

Each cell has:
- Numeric value (large, monospace)
- Sub-label (small, tertiary text)
- Info bubble `[i]` triggering tooltip

### Calibration band on IC

Three-tier color treatment per Grinold/Kahn p147:

| IC range | Treatment | Caption |
|---|---|---|
| ≥ 0.15 | **excellent** (green-cyan) | "Exceptional skill — verify sample size before celebrating" |
| 0.05 ≤ IC < 0.15 | **good** (green) | "Calibrated skill range — typical for surviving quant strategies" |
| 0.02 ≤ IC < 0.05 | **marginal** (amber) | "Below conventional threshold — edge weak or sample noisy" |
| < 0.02 | **noise** (red) | "Statistically indistinguishable from zero" |

### Drift band (observed Sharpe − implied IR)

| Drift range | Treatment | Caption |
|---|---|---|
| ≥ 0 | **green** | "Strategy is meeting or exceeding its theoretical edge" |
| −0.20 ≤ Drift < 0 | **amber** | "Some implementation drag — fill quality or cost worth checking" |
| < −0.20 | **red** | "Material drag — IC decay, breadth miscount, or execution cost dominating" |

### Tooltip wording (Library-citation-anchored)

- **IC tooltip:** "Information Coefficient. Per-bet correlation
  between this strategy's forecast and the realized HODL-relative
  return. Grinold & Kahn p146-150. IC > 0.15 is exceptional;
  0.05–0.15 is the typical surviving-strategy range; <0.02 is noise."
- **Breadth tooltip:** "Number of independent forecasts (≈ trade
  count) over the rolling window. Independence assumption: each
  trade's forecast is uncorrelated with the prior trade's. If
  trades cluster in regimes, true breadth is lower than count.
  Grinold & Kahn p146."
- **Implied IR tooltip:** "Theoretical Sharpe given IC × √Breadth.
  This is what the strategy *should* deliver if it has the skill
  measured (IC) and gets the opportunities counted (Breadth).
  Grinold & Kahn Fundamental Law of Active Management."
- **Drift tooltip:** "Observed Sharpe minus Implied IR. Negative
  drift means observed performance is below theoretical edge —
  possible causes: IC measurement is overstated, breadth has
  correlation we missed, or implementation cost (fill quality,
  slippage) is eating the edge. Project Ari's Pool Simulator and
  Almgren-Chriss spec target the implementation-cost branch."

## Functional requirements

### FR-1: Backend computes per-strategy IC, Breadth

Endpoint: `GET /api/analytics/strategies/{strategy_id}/grinold`
Query params: `window` (default `30d`)

Response shape:
```json
{
  "strategy_id": "mean_reversion",
  "window_days": 30,
  "trade_count": 79,
  "sharpe_observed": 0.34,
  "ic": 0.08,
  "ic_band": "good",
  "breadth": 79,
  "breadth_method": "trade_count",
  "implied_ir": 0.71,
  "drift": -0.37,
  "drift_band": "red",
  "computed_at": "2026-05-27T14:23:11Z",
  "n_independent_estimate": 64,
  "warnings": ["breadth may overstate due to regime clustering"]
}
```

### FR-2: IC computation (per-trade)

Per-trade IC for trade `t`:
- `forecast_t` = the strategy's signal magnitude at trade `t` (mapped
  to `[-1, +1]` via z-score normalization within the strategy's own
  signal distribution over the window)
- `realized_t` = `(trade_return_t − HODL_return_t)` over the trade's
  hold duration (HODL-relative, per SHARPE_SPEC.md)

Then `IC = corr(forecast, realized)` over all trades in the window.

If `n < 30`, return `ic: null` and `warnings: ["sample below n=30 minimum for IC"]`.

### FR-3: Breadth computation

`breadth = n_trades` is the naive estimate. Refinement: estimate
**effective breadth** by counting same-regime same-direction clusters
as 1 trade each (per Grinold p146 independence assumption).

Surface BOTH:
- `breadth: 79` (raw trade count)
- `n_independent_estimate: 64` (regime/direction-deduplicated)

Implied IR is computed using `n_independent_estimate` for the
conservative read; UI displays raw `breadth` with a tooltip noting
the conservative estimate.

### FR-4: Caching

Compute on-request, cache result for 5 minutes (matches existing
`/api/analytics/*` cache behavior). Stale-while-revalidate
acceptable.

### FR-5: Frontend integration

`StrategyDetail.tsx` adds new component
`<FundamentalLawCard strategy_id={...} />`. Component:
- Fetches `/api/analytics/strategies/{id}/grinold` on mount
- Renders 5-cell row with bands
- Closed-by-default; expandable; remembers open/closed in
  `localStorage` per strategy

## Data model / schema

No new DB tables. Computation reads from existing `trades` and
`pool_snapshot` tables.

Optional future optimization: cache `grinold_metrics` rows for
historical reads, but Day 14 build uses on-demand compute only.

## API contracts

See FR-1 above. Endpoint added to `backend/routers/analytics.py`
(create if not present; otherwise extend).

OpenAPI documentation required: each metric annotated with formula
and Grinold/Kahn page anchor.

## Edge cases / failure modes

- **n < 30 trades:** `ic = null`, full payload shape preserved,
  warnings populated, frontend renders "Insufficient sample (n < 30)"
  in the IC cell.
- **Zero variance in forecast:** corr undefined, `ic = null`,
  `warnings: ["forecast variance is zero — strategy producing constant signal"]`.
- **Strategy disabled / no trades in window:** return 200 with all
  metrics `null`, `trade_count: 0`, `warnings: ["no trades in window"]`.
- **HODL return missing for a trade** (legacy data pre-SHARPE_SPEC):
  exclude that trade from the IC computation, decrement breadth,
  add warning.
- **Frontend network failure:** card shows error state with retry
  button; does not block other panel content.

## Acceptance criteria

The 8-step pre-flight diagnostic chain runs ahead of merge:

1. **D-26 cyclic-process check.** Endpoint behaves correctly for
   pathological inputs (zero trades, single trade, all-same-direction).
2. **D-34 mean-rev-no-stop-loss.** Confirm IC computation does NOT
   penalize strategies that don't use stops (since stops are
   doctrinally banned for mean-rev). IC is signal-vs-realized,
   doesn't depend on exit logic.
3. **D-35 cross-sectional-prior.** N/A here (D-30 is descriptive
   per-strategy); cross-sectional IC analysis is a future feature.
4. **D-36 Bailey-min sample.** Returns `ic: null` for `n < 30`. ✓
5. **D-37 continuous-Kelly compatibility.** Sharpe surfaced is
   compatible with Kelly `f* = m/s²` upstream consumers (no schema
   collision).
6. **D-38 asymmetric-bands compatibility.** N/A here.
7. **Grinold/Kahn IC×Breadth Fundamental Law decomposition.** ✓
   (this spec implements it).
8. **López de Prado probFailure check.** If IC ∈ [0.02, 0.05] AND
   `n < 100`, surface `warnings: ["IC band 'marginal' with n < 100 — probFailure elevated, see López de Prado Ch 3"]`.

Plus standard build acceptance:

- [ ] Backend endpoint returns 200 + valid schema for all 12 strategies
- [ ] Frontend card renders 5-cell row with correct bands
- [ ] All 4 metric tooltips include Library citation
- [ ] Closed-by-default; open state persists per strategy
- [ ] Behind feature flag `_RISK_CONFIG.feature_grinold_fundamental_law` (default OFF until operator review)
- [ ] Test fixtures cover: n=0, n=29, n=30, n=78, n=642 cases
- [ ] No regression on existing `StrategyDetail.tsx` rendering
- [ ] Bundle size delta < 5kB gzipped
- [ ] Lighthouse score on `StrategyDetail.tsx` does not drop
- [ ] No new console errors in prod build

## Test plan / test cases

### Backend unit tests (`backend/tests/test_grinold.py`)

| Test | Input | Expected |
|---|---|---|
| `test_ic_zero_variance_forecast` | 50 trades, all same forecast | `ic=null`, warning surfaces |
| `test_ic_perfect_correlation` | 50 trades, forecast = realized | `ic ≈ 1.0` |
| `test_ic_anti_correlation` | 50 trades, forecast = -realized | `ic ≈ -1.0` |
| `test_breadth_independent_count` | 50 trades, 25 same-regime clusters | `breadth=50`, `n_independent_estimate=25` |
| `test_implied_ir_formula` | IC=0.10, B=64 | `implied_ir = 0.10 × 8 = 0.80` |
| `test_drift_calculation` | Sharpe=0.34, Implied=0.71 | `drift = -0.37` |
| `test_drift_red_band` | Drift=-0.37 | `drift_band="red"` |
| `test_n_below_30` | 29 trades | `ic=null`, sample warning |
| `test_no_hodl_return_excluded` | 50 trades, 5 missing HODL | breadth=45, warning |

### Frontend integration tests (`frontend/src/pages/__tests__/StrategyDetail.test.tsx`)

| Test | Expected |
|---|---|
| Renders card collapsed by default | summary line visible, cells hidden |
| Expanding card persists per-strategy in localStorage | reload → still expanded |
| Insufficient sample state renders gracefully | "Insufficient sample (n < 30)" in IC cell |
| IC band color switches at thresholds | mocked `ic=0.05` → green; `ic=0.04` → amber |
| Tooltip text contains Library citation | regex match on "Grinold" |

### Live data smoke test (post-deploy)

For each of the 12 strategies, inspect:
- Card renders without error
- IC band classification is plausible (no `excellent` for known struggling strategies)
- Drift sign matches operator's prior intuition (if all 12 are red,
  feature is broken; if all 12 are green, formula is wrong)

## Implementation notes

### Files to touch

- `backend/routers/analytics.py` — add `/grinold/{strategy_id}` route
- `backend/services/grinold_service.py` — new module, IC + Breadth + Implied IR + Drift computation
- `backend/tests/test_grinold.py` — unit tests (new file)
- `frontend/src/api/analytics.ts` — add `getStrategyGrinold(id, window)` client
- `frontend/src/components/FundamentalLawCard.tsx` — new component
- `frontend/src/pages/StrategyDetail.tsx` — integrate card
- `frontend/src/pages/__tests__/StrategyDetail.test.tsx` — extend tests

### Feature flag

Add to `_RISK_CONFIG`:
```json
{
  "feature_grinold_fundamental_law": false
}
```

Default OFF until operator review of first read on live data.

### Library citation source-of-truth

`MemoryBank/Library/active-portfolio-management.md` — D-30 is
inscribed there with page anchors. Tooltip text MUST cite the same
page anchors used in the Library file. If page citation is wrong,
fix Library file FIRST per D-23 inscription discipline.

## Status / open questions

### Status
- **green-lit, design-ready** (D-40 grant 2026-05-27 evening)
- Spec drafted Day 14 morning 2026-05-27 (this document)
- Build pending — slot in Day 14 / Day 15 work-stream behind feature flag

### Open questions (none blocking design; flag at build-time)

1. **Forecast magnitude normalization.** Each strategy emits its own
   signal-strength field, but they're not normalized across strategies.
   For per-strategy IC computation that's fine (z-score within the
   strategy). But future cross-strategy IC comparisons will need a
   common scale. Defer until cross-strategy view is specced.
2. **Regime-cluster definition for `n_independent_estimate`.** Two
   options: (a) regime-classifier label (TRENDING_UP / SIDEWAYS / etc.)
   used as cluster key; (b) direction-of-trade in the prior 4 hours
   used as cluster key. Defer to build-time; pick (a) unless the
   regime classifier disagreement diagnostic (Day 14 Item 1) shows
   the classifier itself is unreliable, in which case (b).
3. **Drift threshold colors.** Picked `−0.20` as amber/red boundary
   somewhat arbitrarily; revisit after first 7 days of live data.
4. **Tooltip text length.** Long tooltips on a per-strategy panel
   may feel busy. If feedback says "tooltips are too verbose,"
   collapse to one-liner + "see Library" link.