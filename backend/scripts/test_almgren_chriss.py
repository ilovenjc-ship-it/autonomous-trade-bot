"""
test_almgren_chriss.py — F-39B optimal sliced execution invariants
====================================================================

Locks the convex AMM cost / pool-band / optimal-N math behind a green/red bar.

Mirror of test_simulator.py philosophy: zero-dep, exit 1 on any failure.
"""
from __future__ import annotations

import math
import os as _os
import sys

_HERE = _os.path.dirname(_os.path.abspath(__file__))
_BE = _os.path.normpath(_os.path.join(_HERE, ".."))
if _BE not in sys.path:
    sys.path.insert(0, _BE)

from services.almgren_chriss_service import (
    compute_single_shot_cost,
    compute_sliced_cost,
    compute_optimal_n,
    compute_sliced_execution,
    get_band_policy,
    check_adverse_selection,
    BAND_SAFE_FRACTION, BAND_RECOMMEND_FRACTION,
    DEFAULT_RECOMMEND_N, DEFAULT_MANDATORY_N,
)

passed = 0
failed = 0


def ok(name: str, cond: bool, hint: str = "") -> None:
    global passed, failed
    if cond:
        print(f"  PASS  {name}{(' — ' + hint) if hint else ''}")
        passed += 1
    else:
        print(f"  FAIL  {name}{(' — ' + hint) if hint else ''}")
        failed += 1


print("=" * 64)
print("  F-39B — Almgren-Chriss optimal sliced execution invariants")
print("=" * 64)

# ── INV-1: single-shot cost basics ────────────────────────────────────────
# τ_in=10, pool=10000 → s=0.001, cost = 10·0.001/0.999 ≈ 0.01001
r = compute_single_shot_cost(10.0, 10000.0)
ok("INV-1.single.small.s",      abs(r.s - 0.001) < 1e-9, f"got {r.s}")
ok("INV-1.single.small.cost",   abs(r.cost_tao - 10*0.001/0.999) < 1e-6,
   f"got {r.cost_tao}")

# τ_in=1000, pool=10000 → s=0.10, cost = 1000·0.1/0.9 ≈ 111.1111
r = compute_single_shot_cost(1000.0, 10000.0)
ok("INV-1.single.10pct.cost",   abs(r.cost_tao - 1000.0/9.0) < 1e-6,
   f"got {r.cost_tao}")

# s ≥ 1 → infinite cost
r = compute_single_shot_cost(10000.0, 10000.0)
ok("INV-1.single.s_eq_1.inf",   r.cost_tao == float("inf"))
r = compute_single_shot_cost(20000.0, 10000.0)
ok("INV-1.single.s_gt_1.inf",   r.cost_tao == float("inf"))

# Defensive: zero pool → 0 cost
r = compute_single_shot_cost(10.0, 0.0)
ok("INV-1.single.zero_pool",    r.cost_tao == 0.0)
r = compute_single_shot_cost(0.0, 10000.0)
ok("INV-1.single.zero_in",      r.cost_tao == 0.0)

# ── INV-2: convexity — sliced cost < single-shot for s > 0 (pre-uplift) ──
# τ_in=200, pool=12400 → s≈0.01613, single≈3.276
single = compute_single_shot_cost(200.0, 12400.0)
ok("INV-2.convex.single_known",
   abs(single.cost_tao - 200.0 * (200.0/12400.0) / (1 - 200.0/12400.0)) < 1e-6)

# N=5, T=5 → per-slice s ≈ 0.00323, per-cost ≈ 0.1294, total ≈ 0.647
sliced = compute_sliced_cost(
    tao_in=200.0, pool_tao=12400.0, n_slices=5, t_cycles=5,
    urgency=0.5, signal_half_life_cycles=None,
)
ok("INV-2.convex.sliced_lt_single",
   sliced.total_cost_tao < single.cost_tao,
   f"sliced={sliced.total_cost_tao:.4f} single={single.cost_tao:.4f}")
ok("INV-2.convex.savings_positive", sliced.savings_tao > 0)
ok("INV-2.convex.uplift_one_when_no_halflife", sliced.adverse_selection_uplift == 1.0)

# Per-slice math
ok("INV-2.convex.per_slice_size",
   abs(sliced.per_slice_size_tao - 40.0) < 1e-9)
ok("INV-2.convex.n_slices", sliced.n_slices == 5)
ok("INV-2.convex.t_cycles", sliced.t_cycles == 5)

# ── INV-3: sliced N=1 == single-shot ──────────────────────────────────────
sliced_n1 = compute_sliced_cost(
    tao_in=200.0, pool_tao=12400.0, n_slices=1, t_cycles=1,
)
ok("INV-3.n1_equals_single",
   abs(sliced_n1.total_cost_tao - single.cost_tao) < 1e-9,
   f"got {sliced_n1.total_cost_tao} vs {single.cost_tao}")
ok("INV-3.n1_savings_zero", abs(sliced_n1.savings_tao) < 1e-9)

# ── INV-4: sliced more is better (without uplift) ─────────────────────────
costs = []
for n in (1, 2, 5, 10, 20):
    sc = compute_sliced_cost(
        tao_in=500.0, pool_tao=10000.0, n_slices=n, t_cycles=1,
    )
    costs.append((n, sc.total_cost_tao))

# Costs should be monotonically non-increasing as N grows.
for i in range(1, len(costs)):
    n_curr, c_curr = costs[i]
    n_prev, c_prev = costs[i-1]
    ok(f"INV-4.monotone.n{n_prev}_ge_n{n_curr}",
       c_curr <= c_prev + 1e-9,
       f"prev={c_prev:.4f} curr={c_curr:.4f}")

# ── INV-5: pool-fraction bands ────────────────────────────────────────────
b = get_band_policy(0.005)
ok("INV-5.band.safe.005", b.name == "safe")
ok("INV-5.band.safe.split_not_required", b.split_required is False)
ok("INV-5.band.safe.color", b.color == "green")

b = get_band_policy(0.01)
ok("INV-5.band.boundary_1pct.recommend", b.name == "recommend_split")

b = get_band_policy(0.025)
ok("INV-5.band.recommend.025", b.name == "recommend_split")
ok("INV-5.band.recommend.recommend_n", b.recommend_n == DEFAULT_RECOMMEND_N)
ok("INV-5.band.recommend.split_not_required", b.split_required is False)
ok("INV-5.band.recommend.color", b.color == "amber")

b = get_band_policy(0.05)
ok("INV-5.band.boundary_5pct.mandatory", b.name == "mandatory_split")

b = get_band_policy(0.07)
ok("INV-5.band.mandatory.07", b.name == "mandatory_split")
ok("INV-5.band.mandatory.split_required", b.split_required is True)
ok("INV-5.band.mandatory.recommend_n", b.recommend_n == DEFAULT_MANDATORY_N)
ok("INV-5.band.mandatory.color", b.color == "red")

# ── INV-6: adverse selection — within window ──────────────────────────────
adv = check_adverse_selection(t_cycles=4, signal_half_life_cycles=6, urgency=0.5)
ok("INV-6.adv.within_window", adv.within_signal_window is True)
ok("INV-6.adv.no_uplift",     adv.uplift == 1.0)
ok("INV-6.adv.no_warning",    adv.warning is None)

# ── INV-7: adverse selection — exceeds window ─────────────────────────────
adv = check_adverse_selection(t_cycles=12, signal_half_life_cycles=6, urgency=0.5)
ok("INV-7.adv.exceeds_window",  adv.within_signal_window is False)
# uplift = 1 + 0.5 × (12/6 − 1) = 1 + 0.5 × 1 = 1.5
ok("INV-7.adv.uplift_1.5",      abs(adv.uplift - 1.5) < 1e-9, f"got {adv.uplift}")
ok("INV-7.adv.warning_surfaced", adv.warning is not None and "exceeds" in adv.warning)

# Higher urgency → more uplift
adv_low = check_adverse_selection(t_cycles=12, signal_half_life_cycles=6, urgency=0.1)
adv_high = check_adverse_selection(t_cycles=12, signal_half_life_cycles=6, urgency=0.9)
ok("INV-7.adv.urgency_monotone",
   adv_low.uplift < adv.uplift < adv_high.uplift,
   f"low={adv_low.uplift:.4f} mid={adv.uplift:.4f} high={adv_high.uplift:.4f}")

# Urgency clamping
adv_neg = check_adverse_selection(t_cycles=12, signal_half_life_cycles=6, urgency=-0.5)
ok("INV-7.adv.urgency_clamp_low", adv_neg.uplift == 1.0,
   f"got {adv_neg.uplift}")  # clamped to 0 → no uplift
adv_big = check_adverse_selection(t_cycles=12, signal_half_life_cycles=6, urgency=1.5)
adv_one = check_adverse_selection(t_cycles=12, signal_half_life_cycles=6, urgency=1.0)
ok("INV-7.adv.urgency_clamp_high", abs(adv_big.uplift - adv_one.uplift) < 1e-9)

# ── INV-8: missing half-life data → skip gracefully ──────────────────────
adv = check_adverse_selection(t_cycles=10, signal_half_life_cycles=None, urgency=0.5)
ok("INV-8.no_halflife.uplift_one",    adv.uplift == 1.0)
ok("INV-8.no_halflife.within_window", adv.within_signal_window is True)
ok("INV-8.no_halflife.warning",       adv.warning is not None and "skipped" in adv.warning)

# ── INV-9: adverse selection actually applied to sliced cost ─────────────
sliced_no_uplift = compute_sliced_cost(
    tao_in=200.0, pool_tao=12400.0, n_slices=5, t_cycles=4,
    urgency=0.5, signal_half_life_cycles=6,
)
sliced_with_uplift = compute_sliced_cost(
    tao_in=200.0, pool_tao=12400.0, n_slices=5, t_cycles=12,
    urgency=0.5, signal_half_life_cycles=6,
)
ok("INV-9.uplift_applied_to_total",
   sliced_with_uplift.total_cost_tao > sliced_no_uplift.total_cost_tao,
   f"no_uplift={sliced_no_uplift.total_cost_tao:.4f} "
   f"with_uplift={sliced_with_uplift.total_cost_tao:.4f}")
ok("INV-9.uplift_value_matches_check",
   abs(sliced_with_uplift.adverse_selection_uplift - 1.5) < 1e-9)

# ── INV-10: optimal N* T* — brute force search ────────────────────────────
opt = compute_optimal_n(
    tao_in=500.0, pool_tao=10000.0,
    max_n=20, max_t=20, urgency=0.5, signal_half_life_cycles=None,
)
# Without uplift, more slices = lower cost → optimal should hit max_n.
ok("INV-10.opt.no_halflife.max_n", opt.n_star == 20)
ok("INV-10.opt.cost_finite", math.isfinite(opt.optimal_cost_tao))
single = compute_single_shot_cost(500.0, 10000.0)
ok("INV-10.opt.savings_positive",
   opt.optimal_savings_tao > 0,
   f"savings={opt.optimal_savings_tao:.4f} single={single.cost_tao:.4f}")

# With half-life, optimal T should NOT exceed half-life × urgency-tradeoff.
opt_with_h = compute_optimal_n(
    tao_in=500.0, pool_tao=10000.0,
    max_n=20, max_t=20, urgency=1.0, signal_half_life_cycles=4,
)
ok("INV-10.opt.with_halflife.t_bounded",
   opt_with_h.t_star <= 4 + 1,   # T* should be ≤ half_life-ish at urgency=1
   f"t_star={opt_with_h.t_star} half_life=4 urgency=1.0")

# ── INV-11: full orchestrator returns valid schema ────────────────────────
res = compute_sliced_execution(
    tao_in=200.0, pool_tao=12400.0,
    n_slices=5, t_cycles=5, urgency=0.5,
    signal_half_life_cycles=6,
)
ok("INV-11.dict.has_band",            "band" in res)
ok("INV-11.dict.has_single_shot",     "single_shot" in res)
ok("INV-11.dict.has_sliced",          "sliced" in res)
ok("INV-11.dict.has_optimal",         "optimal" in res)
ok("INV-11.dict.has_adverse_selection", "adverse_selection" in res)
ok("INV-11.dict.has_doctrine",        "doctrine" in res)
ok("INV-11.dict.pool_fraction_correct",
   abs(res["pool_fraction"] - 200.0/12400.0) < 1e-6)
ok("INV-11.dict.band_name_recommend", res["band"]["name"] == "recommend_split")
ok("INV-11.dict.single_shot_finite",  math.isfinite(res["single_shot"]["cost_tao"]))
ok("INV-11.dict.sliced_n_5",          res["sliced"]["n_slices"] == 5)
ok("INV-11.dict.optimal_n_star_set",  res["optimal"]["n_star"] >= 1)

# Doctrine block — citation present
ok("INV-11.dict.doctrine.formula",   "cost(τ_in)" in res["doctrine"]["cost_formula"])
ok("INV-11.dict.doctrine.source",    "Cartea" in res["doctrine"]["source"])
ok("INV-11.dict.doctrine.anchor",    "D-39 Part B" in res["doctrine"]["anchor"])

# ── INV-12: D-26 idempotence — same inputs → same outputs ────────────────
r1 = compute_sliced_execution(tao_in=200.0, pool_tao=12400.0, n_slices=5, t_cycles=5)
r2 = compute_sliced_execution(tao_in=200.0, pool_tao=12400.0, n_slices=5, t_cycles=5)
ok("INV-12.idempotent.single_shot",
   r1["single_shot"]["cost_tao"] == r2["single_shot"]["cost_tao"])
ok("INV-12.idempotent.sliced",
   r1["sliced"]["total_cost_tao"] == r2["sliced"]["total_cost_tao"])
ok("INV-12.idempotent.optimal_n",
   r1["optimal"]["n_star"] == r2["optimal"]["n_star"])

# ── INV-13: trade > pool — infinite cost surfaces honestly ────────────────
res = compute_sliced_execution(tao_in=12000.0, pool_tao=10000.0, n_slices=1, t_cycles=1)
ok("INV-13.over_pool.single_inf", res["single_shot"]["cost_tao"] == float("inf"))
ok("INV-13.over_pool.band_mandatory", res["band"]["name"] == "mandatory_split")

# But N=20 slices brings each slice below 1.0 fraction → finite cost.
res_split = compute_sliced_execution(tao_in=12000.0, pool_tao=10000.0, n_slices=20, t_cycles=1)
ok("INV-13.over_pool.split_finite",
   res_split["sliced"]["total_cost_tao"] != float("inf"),
   f"got {res_split['sliced']['total_cost_tao']}")

# ── INV-14: invalid inputs handled gracefully ────────────────────────────
res = compute_sliced_execution(tao_in=200.0, pool_tao=12400.0, n_slices=0, t_cycles=0)
# n_slices=0 → coerced to 1; t_cycles=0 → coerced to 1
ok("INV-14.invalid.n0_coerced", res["sliced"]["n_slices"] == 1)
ok("INV-14.invalid.t0_coerced", res["sliced"]["t_cycles"] == 1)

res = compute_sliced_execution(tao_in=0.0, pool_tao=12400.0, n_slices=5, t_cycles=5)
ok("INV-14.invalid.zero_in", res["single_shot"]["cost_tao"] == 0.0)

# ── INV-15: López de Prado probFailure caveat — optimal not promoted to "always" ─
# This is enforced by the orchestrator including BOTH user-chosen N/T AND optimal,
# so the user can compare. Verify both are present in the dict.
res = compute_sliced_execution(
    tao_in=300.0, pool_tao=10000.0, n_slices=2, t_cycles=2,
    signal_half_life_cycles=8,
)
ok("INV-15.both_user_and_optimal_returned",
   "n_slices" in res["sliced"] and "n_star" in res["optimal"])
# User chose N=2 — verify cost is reported even when optimal is different.
ok("INV-15.user_n_respected", res["sliced"]["n_slices"] == 2)


print("=" * 64)
if failed == 0:
    print(f"  RESULT: {passed} passed, 0 failed")
    print("  All F-39B Almgren-Chriss invariants intact.")
    print("=" * 64)
    sys.exit(0)
else:
    print(f"  RESULT: {passed} passed, {failed} FAILED")
    print("=" * 64)
    sys.exit(1)