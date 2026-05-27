# F-39B — Almgren-Chriss slicing card on Subnet Pool Simulator

> **Decision anchor:** D-39 Part B (Library Night), green-lit via
> D-40 grant 2026-05-27 evening. Source: Cartea / Jaimungal / Penalva
> *Algorithmic and High-Frequency Trading* Ch 6 (Almgren-Chriss
> optimal execution); Ch 11 (mean-reversion bands). Anchored to
> `MemoryBank/Library/algorithmic-and-high-frequency-trading.md`.
>
> **Status:** green-lit, design-ready. Build behind feature flag.
>
> **Author:** Ari, Day 14 morning 2026-05-27 (Session XLIV continuation).

## Overview

The existing Subnet Pool Simulator
(`frontend/src/pages/PreTradeSimulator.tsx`) currently shows the
single-shot impact of a proposed trade against the live subnet AMM
pool: cost as a function of `tao_in`, slippage curve, and
liquidity-cliff warnings.

D-39 Part B extends this with an **Almgren-Chriss slicing card** that
answers a different question: *"if we split this trade into N slices
over T cycles, what does the total cost become?"*

For TAO-on-Bittensor's AMM construction:

```
single_shot_cost(τ_in)  = τ_in · s / (1 − s)
where s = τ_in / pool_tao_reserves
```

This is the **convex** linear-impact case from Cartea Ch 6.
Because cost is convex in `τ_in`, splitting a trade into N equal
slices reduces total cost — but only if the price doesn't drift
during the slicing window. The slicing card balances that trade-off
explicitly via an operator-set `urgency` parameter, surfacing the
optimal-N for each pool-fraction band.

## Goals

1. Make the convexity-savings explicit so operators can see
   "this 4% pool single-shot would cost X τ; split into 5 slices over 5
   cycles, cost is 0.6X — savings 0.4X."
2. Encode default policies per pool-fraction band:
   - **<1% pool single-shot:** fine, no split needed
   - **1–5% pool:** recommend `N≥5` split
   - **>5% pool:** mandatory split or fail-fast warning
3. Surface the `urgency` parameter as an operator-tunable so the
   speed-vs-savings trade-off is visible, not hidden.
4. Render the AMM convex cost function transparently with the
   formula and Cartea citation.

## Scope / non-goals

### In scope
- Slicing card on `PreTradeSimulator.tsx` adjacent to existing single-shot card
- Backend `pool_reserves_service.py` extension to compute multi-slice cost given (`τ_in`, `N`, `T_cycles`, `urgency`)
- Closed-form Almgren-Chriss optimal-N suggestion per the convex linear-impact case
- Pool-fraction band policy enforcement (single-shot fine / split recommended / split mandatory)
- Cycle-time integration: the simulator knows the fleet's typical cycle cadence and renders slicing in cycle-units, not arbitrary time units
- Adverse-selection warning when split window is wider than the strategy's signal half-life

### Out of scope (this spec)
- Actually executing slices live (this is simulator only — execution is a separate operator green-light)
- Cross-subnet slicing (subnet-α swaps; future)
- Permanent vs temporary impact decomposition (Cartea Ch 6 §6.2; future, requires more data)
- Adaptive urgency (auto-tighten on volatility); operator-set only for v1

## User flows / UX / design notes

### Surface placement on `PreTradeSimulator.tsx`

The page currently has (single-shot) cost cards for each subnet.
Slicing card sits as a **second tab on each subnet card**, default
hidden if `pool_fraction < 1%`, default visible if ≥1%.

```
┌─ Subnet 96 — Pool 12,400 τ ───────────────────────────────────┐
│  ┌─[ Single-shot ]─[ Sliced execution ]─────────────┐         │
│                                                                │
│  Single-shot:  Buy 200 τ  →  fill at 1.0163 (slippage 1.63%) │
│                cost: 3.31 τ   (1.61% of pool)                  │
│                                                                │
│  ⚠ Pool fraction 1.61% — split recommended (N≥5)               │
│  [ See Sliced execution → ]                                    │
└────────────────────────────────────────────────────────────────┘
```

When operator clicks "Sliced execution":

```
┌─ Sliced Execution — Subnet 96 ────────────────────────────────┐
│                                                                │
│  Trade size: 200 τ   ·   Pool: 12,400 τ   ·   Pool frac: 1.61% │
│  Policy: split recommended (N≥5)                               │
│                                                                │
│  Split into:   ⓿ 5 slices  ○ 10  ○ 20   over   ⓿ 5 cycles  ○ 10│
│  Urgency:      [ low ────●──── high ]                          │
│                                                                │
│  ┌─ Single-shot cost ──┐  ┌─ Sliced cost (N=5, T=5) ──┐         │
│  │   3.31 τ            │  │   1.97 τ  (savings 1.34 τ)│         │
│  └─────────────────────┘  └────────────────────────────┘        │
│                                                                │
│  Almgren-Chriss optimal: N* = 4, T* = 4 cycles                 │
│                          → cost 1.78 τ (savings 1.53 τ)        │
│                                                                │
│  ⚠ Adverse-selection check: signal half-life = 6 cycles        │
│     T=5 within signal window ✓ (use T<half-life)               │
│                                                                │
│  Cost function: cost(τ_in) = τ_in · s / (1−s)                  │
│  where s = τ_in / pool_reserves                                │
│  Source: Cartea/Jaimungal/Penalva Ch 6 §6.1                    │
└────────────────────────────────────────────────────────────────┘
```

### Pool-fraction band visual

A horizontal stripe at top of each subnet card showing where the
proposed trade lands in band:

```
[ ─ <1% safe ─ ][ ─ 1–5% recommend split ─ ][ ─ >5% mandatory split ─ ]
                          ●  1.61%
```

Color: green / amber / red.

### Mandatory-split fail-fast

If `pool_fraction > 5%` AND `N=1` (no split selected), the
"Single-shot" tab shows a fail-fast modal:

```
┌─ Mandatory Split Required ────────────────────────────────────┐
│  This trade is 7.4% of pool reserves. Single-shot execution   │
│  at this size triggers materially adverse fill quality and    │
│  visible market impact.                                       │
│                                                               │
│  Per D-39 Part B doctrine: pool fraction > 5% requires split. │
│                                                               │
│  Choose:                                                      │
│    [ Reduce trade size ]                                      │
│    [ Switch to Sliced execution → ]                          │
│    [ Override (operator green-light) ]                        │
└───────────────────────────────────────────────────────────────┘
```

The "Override" path requires an operator-token confirmation (text
input with `LTCM_AWARE` or similar phrase). Override is logged.

## Functional requirements

### FR-1: Backend cost computation

`backend/services/pool_reserves_service.py` adds:

```python
def compute_single_shot_cost(tao_in: float, pool_tao: float) -> SingleShotCost:
    s = tao_in / pool_tao
    cost = tao_in * s / (1 - s) if s < 1.0 else float('inf')
    return SingleShotCost(s=s, cost_tao=cost)

def compute_sliced_cost(
    tao_in: float,
    pool_tao: float,
    n_slices: int,
    t_cycles: int,
    urgency: float = 0.5
) -> SlicedCost:
    """Returns total cost across all N slices, accounting for
    pool-replenishment between slices and urgency-adjusted spacing.
    Linear-impact AMM convex case per Cartea Ch 6 §6.1.

    Closed-form for equal-slice, equal-spacing, no-replenishment:
        per_slice_size = tao_in / n_slices
        per_slice_s    = per_slice_size / pool_tao
        per_slice_cost = per_slice_size * per_slice_s / (1 - per_slice_s)
        total_cost     = n_slices * per_slice_cost

    Plus drift-adjustment: if t_cycles > signal_half_life, total cost
    is uplifted by an adverse-selection multiplier (urgency-tunable).
    """

def compute_optimal_n(
    tao_in: float,
    pool_tao: float,
    max_t_cycles: int,
    urgency: float = 0.5
) -> OptimalN:
    """Returns N*, T*, and minimum cost. Search is small (N up to 20,
    T up to max_t_cycles); brute-force optimization is fine."""
```

### FR-2: Pool-fraction band policy

```python
def get_band_policy(pool_fraction: float) -> BandPolicy:
    if pool_fraction < 0.01:
        return BandPolicy(name="safe", split_required=False, recommend_n=1)
    elif pool_fraction < 0.05:
        return BandPolicy(name="recommend_split", split_required=False, recommend_n=5)
    else:
        return BandPolicy(name="mandatory_split", split_required=True, recommend_n=10)
```

### FR-3: Adverse-selection check

```python
def check_adverse_selection(
    t_cycles: int,
    strategy_id: str
) -> AdverseSelectionCheck:
    """Compares t_cycles against the strategy's signal half-life
    (from OU half-life estimate per Chan p118-122 — already
    computed elsewhere for the regime classifier). If
    t_cycles > half_life, signal may decay during the slicing
    window."""
```

### FR-4: Backend endpoint

`POST /api/simulator/sliced-execution`

Request:
```json
{
  "subnet_id": 96,
  "tao_in": 200.0,
  "n_slices": 5,
  "t_cycles": 5,
  "urgency": 0.5,
  "strategy_id": "momentum_cascade"
}
```

Response:
```json
{
  "subnet_id": 96,
  "pool_tao_reserves": 12400.0,
  "pool_fraction": 0.0161,
  "band": {
    "name": "recommend_split",
    "split_required": false,
    "recommend_n": 5
  },
  "single_shot": {
    "s": 0.0161,
    "cost_tao": 3.31
  },
  "sliced": {
    "n_slices": 5,
    "t_cycles": 5,
    "per_slice_size": 40.0,
    "per_slice_s": 0.00322,
    "per_slice_cost": 0.13,
    "total_cost_tao": 0.65,
    "savings_tao": 2.66,
    "adverse_selection_uplift": 1.0
  },
  "optimal": {
    "n_star": 4,
    "t_star": 4,
    "optimal_cost_tao": 0.51,
    "optimal_savings_tao": 2.80
  },
  "adverse_selection": {
    "signal_half_life_cycles": 6,
    "within_signal_window": true,
    "warning": null
  },
  "computed_at": "2026-05-27T14:23:11Z"
}
```

### FR-5: Frontend integration

`PreTradeSimulator.tsx` adds new component
`<SlicedExecutionCard subnet_id={...} tao_in={...} />`. Component:
- Tab interface inside existing per-subnet card
- POSTs to `/api/simulator/sliced-execution` on parameter change (debounced 300ms)
- Renders single-shot vs sliced comparison
- Renders Almgren-Chriss optimal suggestion
- Renders adverse-selection warning
- Renders pool-fraction band stripe
- Mandatory-split fail-fast modal when triggered

### FR-6: Override audit log

When operator overrides a mandatory-split, log to existing
audit table with:
- `event_type: "mandatory_split_override"`
- `subnet_id`, `tao_in`, `pool_fraction`, `operator_token`
- `timestamp`

## Data model / schema

No new DB tables. Reads from `pool_snapshot` for pool reserves,
existing `trades` table for half-life estimates (or compute on demand).

Optional: cache `signal_half_life_cycles` per strategy for fast lookup.

## API contracts

See FR-4. Endpoint added to `backend/routers/simulator.py` (create or extend).

OpenAPI annotations:
- Each cost component documented with the formula and Cartea citation
- Pool-fraction bands documented as enum
- Override path documented as audit-logged

## Edge cases / failure modes

- **Trade size > pool reserves** (s ≥ 1.0): single-shot cost is
  infinite; render `cost: "∞"` with `band: mandatory_split`,
  recommend `N` such that per-slice s < 0.5 (likely N=10+).
- **`pool_tao` is stale or 0**: return 422 with body
  `"pool reserves unavailable; refresh pool data first"`.
- **`t_cycles = 0`**: invalid (would mean zero-duration slicing);
  reject with 400.
- **`urgency` outside [0, 1]**: clamp to [0, 1] silently.
- **Strategy with no half-life estimate yet**: skip
  adverse-selection check, populate `signal_half_life_cycles: null`,
  warning: "half-life not yet estimated; adverse-selection check
  skipped".
- **Optimal N=1 (i.e. single-shot is optimal)**: surface this
  honestly; mark sliced card with "optimal is single-shot for this
  size."

## Acceptance criteria

The 8-step pre-flight diagnostic chain runs ahead of merge:

1. **D-26 cyclic-process check.** Cost computation is idempotent
   and free of side effects.
2. **D-34 mean-rev-no-stop-loss.** Slicing does NOT introduce stop
   logic — slicing is execution-cost optimization, exit logic is
   separate.
3. **D-35 cross-sectional-prior.** N/A here (single-instrument).
4. **D-36 Bailey-min sample.** Half-life estimate respects
   Bailey-min before being trusted.
5. **D-37 continuous-Kelly compatibility.** Slicing card consumes
   `tao_in` regardless of whether it came from Kelly-derived or
   static cap; no coupling.
6. **D-38 asymmetric-bands compatibility.** N/A here.
7. **Grinold/Kahn IC×Breadth.** Slicing's adverse-selection check
   relates to Breadth (independent slices ≈ independent forecasts);
   no formula coupling needed for v1.
8. **López de Prado probFailure check.** Optimal-N suggestion is
   not promoted to "always optimal" — surface as suggestion only.

Plus standard build acceptance:

- [ ] Endpoint returns 200 + valid schema for representative cases
- [ ] Pool-fraction band policy enforced (visual + fail-fast)
- [ ] Mandatory-split override audit-logged
- [ ] Adverse-selection check renders correctly when half-life data present
- [ ] Adverse-selection check skips gracefully when half-life data absent
- [ ] Cost function and Cartea citation visible on card
- [ ] Behind feature flag `_RISK_CONFIG.feature_almgren_chriss_slicing` (default OFF)
- [ ] Test fixtures cover: <1% pool, 1–5% pool, >5% pool, infinite-cost case, half-life present/absent
- [ ] Bundle size delta < 12kB gzipped (slicing card has more interactivity)
- [ ] No regression on existing `PreTradeSimulator.tsx`
- [ ] No new console errors in prod build

## Test plan / test cases

### Backend unit tests (`backend/tests/test_almgren_chriss.py`)

| Test | Input | Expected |
|---|---|---|
| `test_single_shot_cost_small_fraction` | tao_in=10, pool=10000 | s=0.001, cost≈0.01 |
| `test_single_shot_cost_large_fraction` | tao_in=1000, pool=10000 | s=0.10, cost≈111.1 |
| `test_single_shot_infinite_for_s_ge_1` | tao_in=10000, pool=10000 | cost=inf |
| `test_sliced_cost_n_5_savings` | tao_in=200, pool=12400, N=5, T=5 | cost < single_shot, savings > 0 |
| `test_optimal_n_brute_force` | tao_in=500, pool=10000 | N*∈[2,8], T*∈[2,8] |
| `test_band_safe` | pool_frac=0.005 | name=safe, recommend_n=1 |
| `test_band_recommend` | pool_frac=0.025 | name=recommend_split, recommend_n=5 |
| `test_band_mandatory` | pool_frac=0.07 | name=mandatory_split, recommend_n=10 |
| `test_adverse_selection_within_window` | T=4, half_life=6 | warning=null |
| `test_adverse_selection_exceeds_window` | T=10, half_life=6 | warning surfaced, uplift > 1.0 |
| `test_no_half_life_skips_check` | half_life=null | skipped, no warning |
| `test_mandatory_split_override_audit_logged` | (integration) | audit row inserted |

### Frontend integration tests

| Test | Expected |
|---|---|
| Single-shot card renders for <1% pool fraction with no split prompt | green band, no warning |
| Sliced tab default visible for ≥1% pool fraction | tab clickable |
| Mandatory-split modal blocks single-shot for >5% | modal renders |
| Override path requires LTCM_AWARE phrase | text input validated |
| Optimal N suggestion renders | "N* = 4, T* = 4" visible |
| Adverse-selection warning when T > half-life | amber chip rendered |

### Live data smoke test (post-deploy)

For each of 6 trading subnets:
- Trigger a synthetic 1% trade, verify single-shot card renders
- Trigger a synthetic 3% trade, verify split-recommend card renders
- Trigger a synthetic 7% trade, verify mandatory-split modal appears
- Verify Cartea citation and formula visible

## Implementation notes

### Files to touch

- `backend/services/pool_reserves_service.py` — extend with sliced-cost + optimal-N
- `backend/services/almgren_chriss_service.py` — new module (or extend pool_reserves_service)
- `backend/routers/simulator.py` — new endpoint (create if not present)
- `backend/tests/test_almgren_chriss.py` — unit tests (new)
- `frontend/src/api/simulator.ts` — add `getSlicedExecution()` client
- `frontend/src/components/SlicedExecutionCard.tsx` — new
- `frontend/src/components/PoolFractionBandStripe.tsx` — new
- `frontend/src/components/MandatorySplitModal.tsx` — new
- `frontend/src/pages/PreTradeSimulator.tsx` — integrate

### Feature flag

```json
{
  "feature_almgren_chriss_slicing": false
}
```

Default OFF until first read with operator on representative pools.

### Library citation source-of-truth

`MemoryBank/Library/algorithmic-and-high-frequency-trading.md`
(D-38, D-39 — Cartea Ch 6 + Ch 11). UI text MUST cite the same
chapter/section anchors used in Library file.

### AMM cost function rederivation note

Cartea Ch 6 derives optimal execution under a generic linear-impact
cost function. For Bittensor's specific AMM construction:

```
cost(τ_in) = τ_in · s / (1 − s)  where s = τ_in / pool_τ
```

This is the convex case (cost grows superlinearly in `τ_in`). The
slicing optimization is therefore ALWAYS savings-positive for s > 0,
and the optimal N is bounded above only by adverse-selection
(slicing too long lets the price drift before slices complete).

The closed-form optimum exists for the case where:
- Pool replenishment is negligible during the slicing window
  (assumption holds for cycles measured in minutes; breaks down
  if the slicing window is hours)
- No drift in mid-price during the window (handled by
  adverse-selection uplift, parameterized by urgency)

## Status / open questions

### Status
- **green-lit, design-ready** (D-40 grant 2026-05-27 evening)
- Spec drafted Day 14 morning 2026-05-27
- Build pending — slot in Day 14 / Day 15 work-stream behind feature flag
- Cartea Ch 6 §6.1 closed-form rederivation already done during
  Library Night; verify with Library citation before implementation

### Open questions

1. **Cycle-cadence assumption for `t_cycles` units.** Project Ari's
   cycle is ~10 cycles/hour. Verify this is stable enough that
   "5 cycles" reads as ~30 minutes consistently. If cycle cadence
   varies materially, slicing card needs to render `t_cycles` AND
   approximate wall-clock time.
2. **Half-life data availability for v1.** Backend currently
   estimates OU half-life only as part of the regime classifier;
   per-strategy half-life may not be reliably populated for all 12.
   Acceptable to ship v1 with adverse-selection check skipping
   gracefully when data absent (per FR-3).
3. **Override token / phrase.** Spec uses `LTCM_AWARE`. Operator
   may prefer different phrase or full sentence. Decide before
   first deploy.
4. **Pool-replenishment modeling.** v1 assumes negligible. If
   subnet pools recover materially within 5 cycles, slicing
   savings are understated. Future feature: use historical
   replenishment-rate curves per pool. Not v1.
5. **Permanent vs temporary impact.** Cartea Ch 6 §6.2 distinguishes
   them. v1 conflates (treats all impact as temporary, decaying
   between slices). Future feature.
6. **Coupling to F-37B Kelly cap-structure.** When F-37B ships, the
   `tao_in` parameter to F-39B should default to the F-37B effective
   cap × position-target. Spec'd as decoupled for now (operator can
   manually enter `tao_in`); coupling is a Day 15+ enhancement.