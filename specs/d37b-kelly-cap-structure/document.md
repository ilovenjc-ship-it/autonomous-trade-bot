# F-37B — Kelly cap-structure phasing in `risk_config.json`

> **Decision anchor:** D-37 Part B (Library Night), green-lit via
> D-40 grant 2026-05-27 evening. Source: Chan *Quantitative Trading
> 2nd Ed* p134-137 (continuous Kelly `f* = m/s²`); Poundstone
> *Fortune's Formula* p231-233 (half-Kelly default); D-32 LTCM
> forward-warning. Anchored to
> `MemoryBank/Library/quantitative-trading-chan.md`.
>
> **Status:** green-lit, design-ready. Build behind feature flag.
> The flag's purpose is reversibility, not gating — the cap-structure
> is policy doctrine, but a feature flag preserves a one-click
> rollback to the static-cap status quo if the phased logic
> misbehaves.
>
> **Author:** Ari, Day 14 morning 2026-05-27 (Session XLIV continuation).

## Overview

Position cap (`max_position` per strategy and globally) is currently
a static value in `risk_config.json` — same regardless of paper /
live status, sample size, or strategy maturity. D-37 Part B replaces
this with a **phased cap-structure** that ties cap to (a) deployment
phase (paper vs live), (b) sample-size sufficiency for Kelly
estimation (Bailey minimum), and (c) maturity tier in live
operation.

The phasing is non-negotiable doctrine:

| Phase | Sample | Cap formula |
|---|---|---|
| Paper, sample < Bailey-min | `n < Bailey_min(strategy)` | **static cap, Kelly NOT used** |
| Paper, sample ≥ Bailey-min | `n ≥ Bailey_min(strategy)` | **`min(static_cap, 0.25 × f*)`** |
| Live, maturing (first 100 live trades) | live-trade-count < 100 | **`min(static_cap, 0.25 × f*)`** tightening linearly toward `0.5 × f*` |
| Live, mature (≥100 live trades) | live-trade-count ≥ 100 | **`0.5 × f*`** (half-Kelly, the practitioner default per D-31) |
| **Full Kelly** | (any) | **NEVER** |

Where `f* = m/s²` is the continuous Kelly fraction (D-37 Part A): `m`
is the per-trade mean log-return (HODL-relative), `s²` is the
per-trade variance of log-return.

If `f* ≤ 0`, the strategy is do-not-deploy at any size — cap is
forced to `0` regardless of phase. (Same conclusion as Kelly verdict
on Momentum Cascade if `m < 0`.)

## Goals

1. Encode the cap-structure phasing as configuration-driven so it
   can ship without code changes per strategy.
2. Surface the cap calculation transparently in the Risk Config
   page — operator can see WHICH phase each strategy is in, WHAT
   the static and Kelly-derived caps would be, and WHICH applies.
3. Embed D-32 LTCM forward-warning as inline doctrine in the UI:
   any cap-loosening conversation must show the LTCM mechanisms
   alongside.
4. Make full-Kelly path **architecturally unreachable**: not just
   "default off" but no code path that produces `cap = f*`.

## Scope / non-goals

### In scope
- Schema extension to `risk_config.json` for phased cap fields per strategy
- Backend `risk_engine.py` changes to compute effective cap per phase
- New endpoint `/api/risk/cap-structure/{strategy_id}` returning current phase + computed caps
- Frontend Risk Config page extension: per-strategy cap-structure card showing phase, formulas, applied cap
- LTCM forward-warning panel in Risk Config (collapsible, default-open on first view)
- Bailey minimum sample-size lookup per strategy (table)
- Migration: existing strategies start in "paper, static cap" phase; no auto-promotion

### Out of scope (this spec)
- Live promotion (separate operator green-light)
- Auto-tightening cap during drawdown (different doctrine, future)
- Cross-strategy correlation-adjusted Kelly (future)
- UI for editing Bailey minima (table is config-driven, edit by JSON for now)

## User flows / UX / design notes

### Surface placement on `RiskConfig.tsx`

New section **"Position Cap Structure"** sits BELOW the existing
"Sharpe Score / Ratio" panel (which we just refactored Day 14
morning) and ABOVE the existing "Autonomous Guardrails" section.

#### Top-level summary

```
[i] Position Cap Structure  ·  Phased per D-37 Part B  ·  Half-Kelly mature ceiling, full Kelly NEVER

  ⚠ LTCM forward-warning — review before any cap-loosening change   [▼ expand]
```

LTCM panel default-open on first visit per session, collapsible
thereafter. Content references D-32:

> **Why this matters:** LTCM levered to ≈25:1 on positions whose
> historical correlation broke under stress. Same-data-feed
> strategies in Project Ari's fleet are correlated by construction
> (RSI / MACD / BB share inputs). Full Kelly assumes
> independent-bet sizing; correlated bets at full Kelly have
> compounding ruin risk during regime breaks. Half-Kelly is the
> practitioner default for a reason. Source: Poundstone *Fortune's
> Formula* p231-233; Lowenstein *When Genius Failed*.

#### Per-strategy cap card

For each of the 12 strategies, a card showing:

```
┌─ momentum_cascade ─────────────────────────────────────────────┐
│  Phase: PAPER · sample 642 trades (Bailey-min: 50) ✓           │
│                                                                │
│  Static cap          : 0.05 τ                                  │
│  Continuous Kelly f* : −0.014 (negative — do not deploy)       │
│  Applied cap         : 0.0 τ  (do-not-deploy override active) │
│                                                                │
│  Formula in this phase: min(static_cap, 0.25 × max(f*, 0))     │
│                                                                │
│  [i] Why this phase? ▾  [i] Why is f* negative? ▾              │
└────────────────────────────────────────────────────────────────┘
```

#### Phase-progression timeline

Visual on each card showing where the strategy is:

```
[ ─── paper, n<Bailey ───]──[ ⚫ paper, n≥Bailey ─]──[─ live, maturing ─]──[─ live, mature ─]
                                  current                                          half-Kelly
                                  ¼-Kelly                                          ceiling
```

#### Edit affordances

- **Operator can edit `static_cap`** directly inline (with confirmation modal noting D-32 LTCM warning if increasing).
- **Operator CANNOT edit Kelly fraction multiplier** (¼ / ½) — these are doctrine, encoded in the schema as locked constants. Attempting to set `kelly_multiplier > 0.5` in JSON returns 400 from the validator.
- **Operator CAN edit `bailey_min` per strategy** (config-driven table) but with a tooltip noting Chan p123-129 default is 50 for typical mean-reversion, higher for low-frequency strategies.

## Functional requirements

### FR-1: Schema extension

`risk_config.json` adds per-strategy block:

```json
{
  "strategies": {
    "momentum_cascade": {
      "static_cap_tao": 0.05,
      "bailey_min_trades": 50,
      "kelly_quarter_multiplier": 0.25,
      "kelly_half_multiplier": 0.5,
      "phase_override": null,
      "do_not_deploy_lock": false
    },
    ...
  },
  "global": {
    "kelly_full_forbidden": true,
    "ltcm_warning_required_on_increase": true,
    "live_maturing_threshold": 100
  }
}
```

`kelly_full_forbidden` is a tripwire: any code path attempting to
compute `cap = 1.0 × f*` raises `KellyDoctrineViolationError`.

### FR-2: Phase computation

`backend/services/risk_engine.py` adds:

```python
def compute_phase(strategy_id: str) -> Phase:
    """Returns one of: paper_under_bailey, paper_at_bailey,
    live_maturing, live_mature."""
```

Logic:
1. If strategy is `paper_only=True` (current global state for all 12):
   - paper_trade_count < bailey_min → `paper_under_bailey`
   - paper_trade_count >= bailey_min → `paper_at_bailey`
2. If strategy is `paper_only=False`:
   - live_trade_count < live_maturing_threshold (100) → `live_maturing`
   - live_trade_count >= live_maturing_threshold → `live_mature`

### FR-3: Continuous Kelly computation

```python
def compute_kelly(strategy_id: str, window_days: int = 30) -> KellyResult:
    """Returns KellyResult with f_star, m, s_squared, sample_size,
    and a do_not_deploy flag if f_star <= 0 or sample < bailey_min."""
```

Per D-37 Part A:
- `m` = mean of log-return per trade (HODL-relative)
- `s² = variance of log-return per trade` (HODL-relative)
- `f* = m / s²`

Sources of return: same `trades` table read used in F-30 (HODL-relative
return per SHARPE_SPEC.md).

### FR-4: Effective cap

```python
def compute_effective_cap(strategy_id: str) -> float:
    phase = compute_phase(strategy_id)
    static = config[strategy_id].static_cap_tao
    kelly = compute_kelly(strategy_id)

    if config[strategy_id].do_not_deploy_lock or kelly.f_star <= 0:
        return 0.0

    if phase == "paper_under_bailey":
        return static  # Kelly NOT USED
    elif phase == "paper_at_bailey":
        return min(static, 0.25 * kelly.f_star)
    elif phase == "live_maturing":
        # linear interpolation from 0.25×f* at trade 0 to 0.5×f* at trade 100
        progress = live_trade_count / 100
        multiplier = 0.25 + 0.25 * progress
        return min(static, multiplier * kelly.f_star)
    elif phase == "live_mature":
        return min(static, 0.5 * kelly.f_star)
```

`kelly_full_forbidden` tripwire: assert `multiplier <= 0.5` always.

### FR-5: Backend endpoint

`GET /api/risk/cap-structure/{strategy_id}`

Returns:
```json
{
  "strategy_id": "momentum_cascade",
  "phase": "paper_at_bailey",
  "phase_progress": 1.0,
  "sample_size": 642,
  "bailey_min": 50,
  "static_cap_tao": 0.05,
  "kelly": {
    "m": -0.00021,
    "s_squared": 0.015,
    "f_star": -0.014,
    "do_not_deploy": true,
    "reason": "f_star <= 0"
  },
  "applied_formula": "min(static, 0.25 × max(f*, 0))",
  "applied_cap_tao": 0.0,
  "computed_at": "2026-05-27T14:23:11Z",
  "warnings": ["do-not-deploy override active"]
}
```

`GET /api/risk/cap-structure` (no id) returns array of all 12 strategies + global.

### FR-6: Frontend integration

`RiskConfig.tsx` adds new section component
`<CapStructureSection strategies={...} />`. Component:
- Fetches `/api/risk/cap-structure` on mount
- Renders LTCM warning panel + 12 per-strategy cards
- LTCM panel default-open per session (sessionStorage)
- Inline edit for `static_cap_tao` with confirmation modal

### FR-7: Cap-write enforcement

Existing risk_engine path that emits orders MUST consume
`compute_effective_cap()` rather than reading `static_cap_tao`
directly. Audit existing code paths; replace any `risk_config.max_position`
reads with effective-cap calls.

## Data model / schema

Schema extension in `risk_config.json` per FR-1.

No new DB tables. Computation reads from existing `trades` table.

## API contracts

See FR-5. Endpoint added to `backend/routers/risk.py` (create or extend).

OpenAPI annotations:
- Each phase enum value documented with the formula it triggers
- `do_not_deploy` reason field documented as one of: `f_star_negative`, `sample_below_bailey`, `manual_lock`

## Edge cases / failure modes

- **Strategy with zero trades:** `kelly.f_star = null`, phase =
  `paper_under_bailey`, applied cap = static (Kelly not used in
  this phase, so null f* is fine).
- **Strategy in `paper_at_bailey` with f* > static cap:** applied cap
  = static (the `min` clamps; Kelly is the ceiling, not the target).
- **Live promotion mid-window:** when `paper_only` flips to `False`,
  phase recomputes on next request. No "in-flight" race because
  cap is read per-order.
- **`s² → 0` (degenerate variance):** `f* → ±∞`. Backend returns
  `f_star: null`, warning surfaced, applied cap falls back to static.
- **Operator attempts to set `kelly_multiplier > 0.5` in JSON:**
  validation rejects with 400 + body explaining D-31 / D-32.
- **Strategy reverts from live to paper (rollback):** phase recomputes
  to `paper_at_bailey` on next request. No data loss.

## Acceptance criteria

The 8-step pre-flight diagnostic chain runs ahead of merge:

1. **D-26 cyclic-process check.** Phase computation is idempotent
   and free of side effects.
2. **D-34 mean-rev-no-stop-loss.** Cap structure does NOT introduce
   stop-loss exits. Applied cap controls position size only.
3. **D-35 cross-sectional-prior.** N/A here (per-strategy).
4. **D-36 Bailey-min sample.** Bailey-min explicitly gates
   Kelly-sizing activation per the doctrine. ✓
5. **D-37 continuous-Kelly.** `f* = m/s²` is the operational
   formula. ✓
6. **D-38 asymmetric-bands compatibility.** N/A here.
7. **Grinold/Kahn IC×Breadth.** Cap structure is independent of
   per-strategy IC; no coupling needed.
8. **López de Prado probFailure check.** If `0 < f_star < 0.001`
   AND `sample < 100`, surface warning that Kelly fraction is
   inside the noise floor — the strategy may be edge-positive only
   by sample variance.

Plus standard build acceptance:

- [ ] Schema validator rejects `kelly_multiplier > 0.5`
- [ ] Endpoint returns 200 + valid schema for all 12 strategies
- [ ] LTCM warning panel renders on first session visit
- [ ] Inline edit `static_cap_tao` modal includes D-32 link/text on increase
- [ ] Phase timeline visual renders for each strategy correctly
- [ ] `compute_effective_cap` is the ONLY path to applied cap (audit done)
- [ ] `KellyDoctrineViolationError` raised if any code attempts full Kelly
- [ ] Behind feature flag `_RISK_CONFIG.feature_phased_cap_structure` (default OFF until first read with operator)
- [ ] Test fixtures cover: paper_under_bailey, paper_at_bailey, live_maturing (50%), live_mature, f*<0, s²→0
- [ ] No regression on existing `risk_config.json` consumers (audit + tests)
- [ ] Bundle size delta < 8kB gzipped
- [ ] No new console errors in prod build

## Test plan / test cases

### Backend unit tests (`backend/tests/test_kelly_cap_structure.py`)

| Test | Input | Expected |
|---|---|---|
| `test_phase_paper_under_bailey` | n=20, bailey_min=50 | `phase=paper_under_bailey` |
| `test_phase_paper_at_bailey` | n=80, bailey_min=50 | `phase=paper_at_bailey` |
| `test_phase_live_maturing` | live_n=42 | `phase=live_maturing`, progress=0.42 |
| `test_phase_live_mature` | live_n=150 | `phase=live_mature` |
| `test_kelly_negative_f_star` | m=-0.001, s²=0.01 | `f*=-0.1`, `do_not_deploy=True` |
| `test_kelly_zero_variance` | s²=0 | `f*=null`, fallback to static |
| `test_effective_cap_paper_under_bailey_uses_static` | n=20, static=0.05, f*=0.10 | applied=0.05 (not min) |
| `test_effective_cap_paper_at_bailey_uses_min` | n=80, static=0.05, f*=0.20 | applied=min(0.05, 0.05)=0.05 |
| `test_effective_cap_live_maturing_interpolates` | live_n=50, f*=0.10 | applied≤0.0375 (0.375×f*) |
| `test_effective_cap_live_mature_half_kelly` | live_n=200, static=0.10, f*=0.05 | applied=min(0.10, 0.025)=0.025 |
| `test_kelly_full_forbidden_raises` | multiplier=1.0 attempt | raises `KellyDoctrineViolationError` |
| `test_do_not_deploy_lock_returns_zero` | do_not_deploy_lock=True | applied=0.0 regardless of f* |

### Schema validation tests (`backend/tests/test_risk_config_schema.py`)

| Test | Input | Expected |
|---|---|---|
| `test_kelly_multiplier_above_half_rejected` | kelly_multiplier=0.6 | ValidationError |
| `test_static_cap_negative_rejected` | static_cap_tao=-0.05 | ValidationError |
| `test_bailey_min_below_30_rejected` | bailey_min=25 | ValidationError |

### Frontend integration tests

| Test | Expected |
|---|---|
| LTCM panel renders open on first session | sessionStorage check |
| LTCM panel collapses after first close | persists in sessionStorage |
| Per-strategy card shows correct phase label | mocked phase data |
| Inline edit `static_cap_tao` with increase shows D-32 modal | modal visible |
| `do_not_deploy_lock` displays applied cap = 0 | rendered as `0.0 τ` |

### Live data smoke test (post-deploy)

For each of the 12 strategies, verify:
- Phase classification matches expected (all 12 should be `paper_at_bailey` or `paper_under_bailey` initially)
- Strategies with negative observed PnL surface negative `f_star` and `do_not_deploy=True`
- Cap-write path uses `compute_effective_cap` (manual trace)

## Implementation notes

### Files to touch

- `recovery-data/risk_config.json` — schema migration (add per-strategy block)
- `backend/services/risk_engine.py` — phase + cap computation
- `backend/services/kelly_service.py` — new module, `compute_kelly`
- `backend/routers/risk.py` — new endpoint
- `backend/tests/test_kelly_cap_structure.py` — new (per matrix above)
- `backend/tests/test_risk_config_schema.py` — extend
- `frontend/src/api/risk.ts` — add `getCapStructure()` client
- `frontend/src/components/CapStructureSection.tsx` — new
- `frontend/src/components/LTCMWarningPanel.tsx` — new
- `frontend/src/components/StrategyCapCard.tsx` — new
- `frontend/src/pages/RiskConfig.tsx` — integrate section

### Feature flag

```json
{
  "feature_phased_cap_structure": false
}
```

Default OFF until first read with operator on live data.

### Doctrine encoding

- `kelly_full_forbidden: true` is a config field but ALSO an
  assert in code: `assert multiplier <= 0.5` in `compute_effective_cap`.
- `KellyDoctrineViolationError` is a custom exception class to
  make doctrine violations distinguishable from runtime bugs in logs.

### Library citation source-of-truth

`MemoryBank/Library/quantitative-trading-chan.md` (D-37 Part A
continuous Kelly, p134-137) and `MemoryBank/Library/fortune's-formula.md`
[verify slug] (D-31 half-Kelly default, p231-233) and the LTCM
forward-warning per D-32. UI text MUST cite the same page anchors
used in Library files.

## Status / open questions

### Status
- **green-lit, design-ready** (D-40 grant 2026-05-27 evening)
- Spec drafted Day 14 morning 2026-05-27
- Build pending — slot in Day 14 / Day 15 work-stream behind feature flag
- D-32 LTCM warning copy needs final operator review before deploy

### Open questions

1. **Bailey minimum default per strategy.** Chan p123 says n=50 for
   typical mean-reversion. Momentum strategies may need higher (sample
   variance is higher). Suggest starting at n=50 across all 12, then
   tuning per strategy as we observe variance. Operator override per
   FR-1.
2. **Live-maturing interpolation curve.** Linear from ¼-Kelly to ½-Kelly
   over first 100 live trades is one choice; could also be sqrt or
   step function (e.g., ¼-Kelly until n=50 live, ½-Kelly thereafter).
   Linear is simplest and traceable; pick that for v1.
3. **Per-strategy `kelly_quarter_multiplier` vs global.** Currently
   spec'd as per-strategy override (in `risk_config.json`). Could
   simplify to global-only. Per-strategy is more flexible but creates
   more edge cases. Recommend per-strategy for v1, eligible to
   simplify to global if no operator uses the override.
4. **Display Kelly numbers in τ vs %.** Internally we compute `f*` as
   a fraction (0.10 means 10% of equity). UI should show as %, but
   final applied cap is in τ. Need consistent unit handling in UI;
   spec says "applied cap in τ, Kelly fraction in %" but verify on
   first mockup.
5. **Live promotion gating.** Spec assumes promotion to live is
   operator-gated elsewhere; this spec only handles caps once live
   status is set. Confirm with operator that live-promotion path is
   untouched.