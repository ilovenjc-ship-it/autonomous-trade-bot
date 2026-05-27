"""
almgren_chriss_service.py — F-39B (D-39 Part B) optimal sliced execution
=========================================================================

For Bittensor's constant-product AMM, the single-shot cost function is:

    cost(τ_in) = τ_in · s / (1 − s)     where  s = τ_in / pool_τ

This is the convex linear-impact case from Cartea/Jaimungal/Penalva
*Algorithmic and High-Frequency Trading* Ch 6 §6.1.  Convexity ⇒ splitting
a trade into N equal slices reduces total cost — bounded above only by
adverse-selection (signal decay during the slicing window).

Pool-fraction bands (D-39 Part B doctrine):
    < 1% pool  →  safe         (no split needed)
    1–5% pool  →  recommend    (N ≥ 5)
    > 5% pool  →  mandatory    (N ≥ 10) — operator-token override required

Adverse-selection check:
    if t_cycles ≤ signal_half_life  →  no uplift (within signal window)
    else                            →  cost uplifted by (1 + urgency · (t/h − 1))

This module is pure-compute; all I/O is in the calling endpoint.

Doctrinal anchors:
    - D-39 Part B (D-40 grant) — Library Night Almgren-Chriss optimal slicing
    - D-23 inscription discipline — UI tooltip page anchors must match Library
    - F-39B specs/d39b-almgren-chriss-slicing/document.md
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, List, Tuple


# ── Pool-fraction band constants (D-39 Part B doctrine) ───────────────────

BAND_SAFE_FRACTION = 0.01          # < 1% pool — single-shot fine
BAND_RECOMMEND_FRACTION = 0.05     # 1–5% pool — split recommended (N≥5)
# ≥ 0.05 pool → mandatory_split (N≥10)

DEFAULT_RECOMMEND_N = 5
DEFAULT_MANDATORY_N = 10
DEFAULT_MAX_OPTIMAL_N = 20         # cap on brute-force optimal-N search
DEFAULT_MAX_OPTIMAL_T = 20         # cap on brute-force optimal-T search


@dataclass
class SingleShotCost:
    s: float                       # pool fraction = tao_in / pool_tao
    cost_tao: float                # τ · s / (1 − s); inf if s ≥ 1


@dataclass
class SlicedCost:
    n_slices: int
    t_cycles: int
    per_slice_size_tao: float
    per_slice_s: float
    per_slice_cost_tao: float
    total_cost_tao: float
    savings_tao: float             # single_shot − sliced (always ≥ 0 for s>0)
    savings_pct: float             # savings / single_shot × 100
    adverse_selection_uplift: float  # ≥ 1.0
    adverse_selection_warning: Optional[str] = None


@dataclass
class OptimalResult:
    n_star: int
    t_star: int
    optimal_cost_tao: float
    optimal_savings_tao: float
    method: str                    # "brute_force_grid"


@dataclass
class BandPolicy:
    name: str                      # "safe" / "recommend_split" / "mandatory_split"
    split_required: bool
    recommend_n: int
    color: str                     # "green" / "amber" / "red"


@dataclass
class AdverseSelectionCheck:
    signal_half_life_cycles: Optional[int]
    t_cycles: int
    within_signal_window: bool
    uplift: float                  # 1.0 if within window or unknown
    warning: Optional[str] = None


# ── Single-shot cost ──────────────────────────────────────────────────────

def compute_single_shot_cost(tao_in: float, pool_tao: float) -> SingleShotCost:
    """
    cost = τ_in · s / (1 − s)   where s = τ_in / pool_τ.

    Returns SingleShotCost with cost=inf if s ≥ 1 (trade exceeds pool).
    """
    if pool_tao <= 0 or tao_in <= 0:
        return SingleShotCost(s=0.0, cost_tao=0.0)
    s = tao_in / pool_tao
    if s >= 1.0:
        return SingleShotCost(s=s, cost_tao=float("inf"))
    cost = tao_in * s / (1.0 - s)
    return SingleShotCost(s=s, cost_tao=cost)


# ── Adverse-selection check ───────────────────────────────────────────────

def check_adverse_selection(
    *,
    t_cycles: int,
    signal_half_life_cycles: Optional[int],
    urgency: float = 0.5,
) -> AdverseSelectionCheck:
    """
    If signal_half_life_cycles is None → skip (warning surfaced).
    If t_cycles ≤ half_life          → within window, uplift=1.0.
    If t_cycles > half_life          → uplift = 1 + urgency · (t/h − 1)

    `urgency` ∈ [0, 1]; clamp silently outside.
    """
    u = max(0.0, min(1.0, urgency))

    if signal_half_life_cycles is None or signal_half_life_cycles <= 0:
        return AdverseSelectionCheck(
            signal_half_life_cycles=signal_half_life_cycles,
            t_cycles=t_cycles,
            within_signal_window=True,
            uplift=1.0,
            warning="signal half-life not yet estimated; adverse-selection check skipped",
        )

    h = signal_half_life_cycles
    if t_cycles <= h:
        return AdverseSelectionCheck(
            signal_half_life_cycles=h,
            t_cycles=t_cycles,
            within_signal_window=True,
            uplift=1.0,
            warning=None,
        )

    # Outside window — uplift cost.
    ratio = t_cycles / h
    uplift = 1.0 + u * (ratio - 1.0)
    return AdverseSelectionCheck(
        signal_half_life_cycles=h,
        t_cycles=t_cycles,
        within_signal_window=False,
        uplift=uplift,
        warning=(
            f"slicing window ({t_cycles} cycles) exceeds signal half-life "
            f"({h} cycles) — cost uplifted by {(uplift-1)*100:.1f}% per urgency"
        ),
    )


# ── Sliced cost ───────────────────────────────────────────────────────────

def compute_sliced_cost(
    *,
    tao_in: float,
    pool_tao: float,
    n_slices: int,
    t_cycles: int,
    urgency: float = 0.5,
    signal_half_life_cycles: Optional[int] = None,
) -> SlicedCost:
    """
    Equal-slice, equal-spacing, no-replenishment closed form:
      per_slice_size = tao_in / n_slices
      per_slice_s    = per_slice_size / pool_tao
      per_slice_cost = per_slice_size · per_slice_s / (1 − per_slice_s)
      total_cost     = n_slices · per_slice_cost  (× adverse-selection uplift)

    Convexity guarantees `total_cost ≤ single_shot_cost` for s > 0
    (before uplift).  Uplift can in principle make sliced > single-shot;
    this is the right answer when slicing is too slow for the signal.
    """
    if n_slices < 1:
        n_slices = 1
    if t_cycles < 1:
        t_cycles = 1
    if pool_tao <= 0 or tao_in <= 0:
        return SlicedCost(
            n_slices=n_slices, t_cycles=t_cycles,
            per_slice_size_tao=0.0, per_slice_s=0.0, per_slice_cost_tao=0.0,
            total_cost_tao=0.0, savings_tao=0.0, savings_pct=0.0,
            adverse_selection_uplift=1.0,
        )

    per_size = tao_in / n_slices
    per_s = per_size / pool_tao
    if per_s >= 1.0:
        # Even one slice exceeds the pool — cost is infinite.
        return SlicedCost(
            n_slices=n_slices, t_cycles=t_cycles,
            per_slice_size_tao=per_size, per_slice_s=per_s,
            per_slice_cost_tao=float("inf"),
            total_cost_tao=float("inf"),
            savings_tao=float("-inf"),
            savings_pct=float("-inf"),
            adverse_selection_uplift=1.0,
        )
    per_cost = per_size * per_s / (1.0 - per_s)
    total_pre_uplift = n_slices * per_cost

    adv = check_adverse_selection(
        t_cycles=t_cycles,
        signal_half_life_cycles=signal_half_life_cycles,
        urgency=urgency,
    )
    total = total_pre_uplift * adv.uplift

    single = compute_single_shot_cost(tao_in, pool_tao)
    if single.cost_tao == float("inf"):
        savings = float("inf")
        savings_pct = 100.0
    else:
        savings = single.cost_tao - total
        savings_pct = (savings / single.cost_tao * 100.0) if single.cost_tao > 0 else 0.0

    return SlicedCost(
        n_slices=n_slices, t_cycles=t_cycles,
        per_slice_size_tao=per_size, per_slice_s=per_s,
        per_slice_cost_tao=per_cost,
        total_cost_tao=total,
        savings_tao=savings,
        savings_pct=savings_pct,
        adverse_selection_uplift=adv.uplift,
        adverse_selection_warning=adv.warning,
    )


# ── Optimal N* T* (brute-force grid) ──────────────────────────────────────

def compute_optimal_n(
    *,
    tao_in: float,
    pool_tao: float,
    max_n: int = DEFAULT_MAX_OPTIMAL_N,
    max_t: int = DEFAULT_MAX_OPTIMAL_T,
    urgency: float = 0.5,
    signal_half_life_cycles: Optional[int] = None,
) -> OptimalResult:
    """
    Brute-force search over N ∈ [1, max_n], T ∈ [1, max_t] for the (N, T)
    pair that minimises total_cost.  Search is small (≤400 evaluations
    on default bounds); closed-form would require solving the
    AMM-cost-with-adverse-selection equation, which has no clean closed
    form once the uplift is non-linear in T.
    """
    if pool_tao <= 0 or tao_in <= 0:
        return OptimalResult(
            n_star=1, t_star=1, optimal_cost_tao=0.0,
            optimal_savings_tao=0.0, method="brute_force_grid",
        )

    single = compute_single_shot_cost(tao_in, pool_tao)
    best_cost = float("inf")
    best_n = 1
    best_t = 1

    for n in range(1, max_n + 1):
        for t in range(1, max_t + 1):
            sc = compute_sliced_cost(
                tao_in=tao_in, pool_tao=pool_tao,
                n_slices=n, t_cycles=t,
                urgency=urgency,
                signal_half_life_cycles=signal_half_life_cycles,
            )
            if sc.total_cost_tao < best_cost:
                best_cost = sc.total_cost_tao
                best_n = n
                best_t = t

    if best_cost == float("inf"):
        savings = 0.0
    elif single.cost_tao == float("inf"):
        savings = float("inf")
    else:
        savings = single.cost_tao - best_cost

    return OptimalResult(
        n_star=best_n,
        t_star=best_t,
        optimal_cost_tao=best_cost,
        optimal_savings_tao=savings,
        method="brute_force_grid",
    )


# ── Pool-fraction band policy ─────────────────────────────────────────────

def get_band_policy(pool_fraction: float) -> BandPolicy:
    """
    Maps pool_fraction to band name + split-required + recommended N.

      < 0.01       safe          (no split)
      [0.01, 0.05) recommend     (N≥5)
      ≥ 0.05       mandatory     (N≥10)
    """
    if pool_fraction < BAND_SAFE_FRACTION:
        return BandPolicy(
            name="safe", split_required=False, recommend_n=1, color="green",
        )
    if pool_fraction < BAND_RECOMMEND_FRACTION:
        return BandPolicy(
            name="recommend_split", split_required=False,
            recommend_n=DEFAULT_RECOMMEND_N, color="amber",
        )
    return BandPolicy(
        name="mandatory_split", split_required=True,
        recommend_n=DEFAULT_MANDATORY_N, color="red",
    )


# ── Top-level orchestrator ────────────────────────────────────────────────

def compute_sliced_execution(
    *,
    tao_in: float,
    pool_tao: float,
    n_slices: int,
    t_cycles: int,
    urgency: float = 0.5,
    signal_half_life_cycles: Optional[int] = None,
) -> dict:
    """
    Top-level orchestrator — returns a JSON-friendly dict suitable for the
    /api/market/sliced-execution endpoint response.

    Composition:
      1. pool_fraction + band policy
      2. single-shot cost
      3. sliced cost at operator-chosen (N, T)
      4. Almgren-Chriss optimal (N*, T*) via brute-force grid
      5. adverse-selection check
    """
    pool_fraction = (tao_in / pool_tao) if pool_tao > 0 else 0.0
    band = get_band_policy(pool_fraction)
    single = compute_single_shot_cost(tao_in, pool_tao)

    sliced = compute_sliced_cost(
        tao_in=tao_in, pool_tao=pool_tao,
        n_slices=n_slices, t_cycles=t_cycles,
        urgency=urgency,
        signal_half_life_cycles=signal_half_life_cycles,
    )

    optimal = compute_optimal_n(
        tao_in=tao_in, pool_tao=pool_tao,
        urgency=urgency,
        signal_half_life_cycles=signal_half_life_cycles,
    )

    adv = check_adverse_selection(
        t_cycles=t_cycles,
        signal_half_life_cycles=signal_half_life_cycles,
        urgency=urgency,
    )

    def _round_or_inf(v: float, digits: int = 4) -> float:
        if v == float("inf") or v == float("-inf"):
            return v
        return round(v, digits)

    return {
        "pool_tao_reserves": round(pool_tao, 4),
        "tao_in": round(tao_in, 4),
        "pool_fraction": round(pool_fraction, 6),
        "band": {
            "name": band.name,
            "split_required": band.split_required,
            "recommend_n": band.recommend_n,
            "color": band.color,
        },
        "single_shot": {
            "s": round(single.s, 6),
            "cost_tao": _round_or_inf(single.cost_tao, 4),
        },
        "sliced": {
            "n_slices": sliced.n_slices,
            "t_cycles": sliced.t_cycles,
            "per_slice_size_tao": round(sliced.per_slice_size_tao, 4),
            "per_slice_s": round(sliced.per_slice_s, 6),
            "per_slice_cost_tao": _round_or_inf(sliced.per_slice_cost_tao, 4),
            "total_cost_tao": _round_or_inf(sliced.total_cost_tao, 4),
            "savings_tao": _round_or_inf(sliced.savings_tao, 4),
            "savings_pct": _round_or_inf(sliced.savings_pct, 2),
            "adverse_selection_uplift": round(sliced.adverse_selection_uplift, 4),
            "adverse_selection_warning": sliced.adverse_selection_warning,
        },
        "optimal": {
            "n_star": optimal.n_star,
            "t_star": optimal.t_star,
            "optimal_cost_tao": _round_or_inf(optimal.optimal_cost_tao, 4),
            "optimal_savings_tao": _round_or_inf(optimal.optimal_savings_tao, 4),
            "method": optimal.method,
        },
        "adverse_selection": {
            "signal_half_life_cycles": adv.signal_half_life_cycles,
            "t_cycles": adv.t_cycles,
            "within_signal_window": adv.within_signal_window,
            "uplift": round(adv.uplift, 4),
            "warning": adv.warning,
        },
        "doctrine": {
            "cost_formula": "cost(τ_in) = τ_in · s / (1 − s)   where s = τ_in / pool_τ",
            "source": "Cartea/Jaimungal/Penalva — Algorithmic and HF Trading Ch 6 §6.1",
            "anchor": "D-39 Part B (D-40 grant)",
        },
    }