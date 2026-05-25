"""
test_simulator.py — Day 12 Pre-Trade Simulator math invariants.

Locks the constant-product AMM math behind a green/red bar. Runs the
LearnBittensor docs example, monotonicity checks, closed-form-cliff
self-consistency, exit-scenario symmetry, and HODL-block edge cases.

Mirror of scripts/test_day8_invariants.py philosophy: zero-dep, exit 1 on
any failure, prints PASS/FAIL per check.
"""
from __future__ import annotations
import sys
import math

# Allow running from repo root or from backend/
import os as _os
_HERE = _os.path.dirname(_os.path.abspath(__file__))
_BE   = _os.path.normpath(_os.path.join(_HERE, ".."))
if _BE not in sys.path:
    sys.path.insert(0, _BE)

from services.simulator_service import (
    stake_received, tao_received, slippage_pct, spot_price,
    cost_for_target_slippage, liquidity_cliffs,
    exit_scenario, hodl_opportunity_cost_usd,
    depth_tier, slippage_curve,
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
print("  Day 12 — Pre-Trade Simulator invariants")
print("=" * 64)

# ── INV-1: LearnBittensor docs example ────────────────────────────────────
# Pool (10τ, 100α), stake 5τ → expect 33.333α, ideal 50α, slippage 33.33%
sr = stake_received(10.0, 100.0, 5.0)
ok("INV-1.docs-example.stake_received", abs(sr - (100.0/3)) < 1e-6,
   f"got {sr:.6f} expect 33.333333")

ideal = 5.0 * 100.0 / 10.0    # 50.0
sp = slippage_pct(10.0, 100.0, 5.0)
ok("INV-1.docs-example.slippage", abs(sp - 100.0/3) < 1e-4,
   f"got {sp:.6f}% expect 33.3333%")

# ── INV-2: Spot price = τ_in / α_in ───────────────────────────────────────
ok("INV-2.spot_price.basic", abs(spot_price(100.0, 1000.0) - 0.1) < 1e-12)
ok("INV-2.spot_price.degenerate-zero-alpha", spot_price(100.0, 0.0) == 0.0)

# ── INV-3: Stake monotonicity (more cost → more alpha, but bounded) ───────
prev = -1.0
for c in (1.0, 5.0, 10.0, 50.0, 100.0, 500.0):
    sr = stake_received(5000.0, 50000.0, c)
    ok(f"INV-3.monotone.stake@{c}τ", sr > prev and sr < 50000.0,
       f"got {sr:.6f}α")
    prev = sr

# ── INV-4: Slippage monotonicity (more cost → more slippage, capped <100%) ─
prev = -1.0
for c in (1.0, 10.0, 100.0, 1000.0):
    s = slippage_pct(5000.0, 50000.0, c)
    ok(f"INV-4.monotone.slippage@{c}τ", s > prev and s < 100.0,
       f"got {s:.4f}%")
    prev = s

# ── INV-5: Closed-form cliff is self-consistent ───────────────────────────
# cost_for_target_slippage(τ, α, p) followed by slippage_pct should round-trip
for target in (0.5, 1.0, 2.0, 5.0, 10.0):
    c = cost_for_target_slippage(5000.0, 50000.0, target)
    s = slippage_pct(5000.0, 50000.0, c)
    ok(f"INV-5.cliff-roundtrip@{target}%", abs(s - target) < 1e-6,
       f"cost={c:.6f}τ slippage={s:.6f}%")

# Edge cases
ok("INV-5.cliff.zero-target",         cost_for_target_slippage(100, 100, 0.0)   is None)
ok("INV-5.cliff.full-target",         cost_for_target_slippage(100, 100, 100.0) is None)
ok("INV-5.cliff.degenerate-zero-tau", cost_for_target_slippage(0, 100, 5.0)     is None)

# ── INV-6: Liquidity cliffs default trio is sorted ascending ──────────────
cliffs = liquidity_cliffs(5000.0, 50000.0)
ok("INV-6.liquidity_cliffs.length", len(cliffs) == 3)
ok("INV-6.liquidity_cliffs.thresholds",
   [c.threshold_pct for c in cliffs] == [1.0, 2.0, 5.0])
ok("INV-6.liquidity_cliffs.cost-ascending",
   cliffs[0].cost_tao < cliffs[1].cost_tao < cliffs[2].cost_tao)

# ── INV-7: Exit scenario symmetry (k preservation) ────────────────────────
# Reserve product MUST equal the original after the price-rebalance step.
k_orig = 5000.0 * 50000.0
ent    = stake_received(5000.0, 50000.0, 100.0)
for move in (50.0, -50.0, 25.0, -25.0):
    s = exit_scenario(5000.0, 50000.0, 100.0, ent, move)
    k_new = s.new_tao_in * s.new_alpha_in
    ok(f"INV-7.exit.k-preserved@{move:+.0f}%",
       abs(k_new - k_orig) / k_orig < 1e-9,
       f"k_new={k_new:.4f} k_orig={k_orig:.4f}")

# +50% move should yield positive PnL on a long, −50% should yield negative
s_up   = exit_scenario(5000.0, 50000.0, 100.0, ent,  50.0)
s_down = exit_scenario(5000.0, 50000.0, 100.0, ent, -50.0)
ok("INV-7.exit.up-positive",   s_up.pnl_tao   > 0)
ok("INV-7.exit.down-negative", s_down.pnl_tao < 0)

# ── INV-8: Depth tier classification ──────────────────────────────────────
ok("INV-8.tier.deep",     depth_tier(10_000) == "deep")
ok("INV-8.tier.healthy",  depth_tier(2_000)  == "healthy")
ok("INV-8.tier.moderate", depth_tier(800)    == "moderate")
ok("INV-8.tier.thin",     depth_tier(50)     == "thin")
ok("INV-8.tier.zero",     depth_tier(0)      == "thin")

# ── INV-9: Slippage curve sample count + bounds ───────────────────────────
pts = slippage_curve(5000.0, 50000.0, max_cost_tao=2000.0, points=64)
ok("INV-9.curve.point-count", len(pts) == 64)
ok("INV-9.curve.first-leq-last", pts[0][0] <= pts[-1][0])
ok("INV-9.curve.slippage-monotone",
   all(pts[i][1] <= pts[i+1][1] + 1e-9 for i in range(len(pts)-1)))

# ── INV-10: HODL opportunity cost edge cases ──────────────────────────────
h0 = hodl_opportunity_cost_usd(0, 0, 100, 100, 0.1, 0.1)
ok("INV-10.hodl.zero-cost.winner-na", h0["winner"] == "n/a")

# Alpha doubled relative to TAO → alpha wins
h_alpha_wins = hodl_opportunity_cost_usd(
    cost_tao=100.0, entry_alpha=1000.0,
    tao_price_now_usd=100.0, tao_price_30d_usd=100.0,
    alpha_price_30d_tao=0.10, alpha_price_now_tao=0.20,
)
ok("INV-10.hodl.alpha-wins.delta-positive", h_alpha_wins["delta_usd"] > 0)
ok("INV-10.hodl.alpha-wins.winner-alpha",   h_alpha_wins["winner"] == "alpha")

# Alpha halved → TAO wins
h_tao_wins = hodl_opportunity_cost_usd(
    cost_tao=100.0, entry_alpha=1000.0,
    tao_price_now_usd=100.0, tao_price_30d_usd=100.0,
    alpha_price_30d_tao=0.20, alpha_price_now_tao=0.10,
)
ok("INV-10.hodl.tao-wins.delta-negative", h_tao_wins["delta_usd"] < 0)
ok("INV-10.hodl.tao-wins.winner-tao",     h_tao_wins["winner"] == "tao")

# ── INV-11: Stake/tao_received round-trip on infinitesimal trade ──────────
# A vanishingly small stake then immediate unstake should return ≈ original
# cost (modulo k-preserved rounding, no fee model).
tau, alp = 5000.0, 50000.0
small_cost = 0.001
got_alpha  = stake_received(tau, alp, small_cost)
new_tau   = tau + small_cost
new_alp   = alp - got_alpha
got_back  = tao_received(new_tau, new_alp, got_alpha)
ok("INV-11.roundtrip.small-trade-recoverable",
   abs(got_back - small_cost) / small_cost < 1e-6,
   f"in={small_cost} out={got_back:.9f}")

# ── INV-12: Defensive — negative / zero inputs return zero/none ───────────
ok("INV-12.defensive.negative-cost",       stake_received(100, 100, -1) == 0.0)
ok("INV-12.defensive.zero-pool",           stake_received(0, 100, 5)    == 0.0)
ok("INV-12.defensive.empty-curve",         slippage_curve(100, 100, 0)  == [])
ok("INV-12.defensive.cliff-bad-target",    cost_for_target_slippage(100, 100, -5) is None)


print("=" * 64)
if failed == 0:
    print(f"  RESULT: {passed} passed, 0 failed")
    print("  All Day 12 simulator invariants intact.")
    print("=" * 64)
    sys.exit(0)
else:
    print(f"  RESULT: {passed} passed, {failed} FAILED")
    print("=" * 64)
    sys.exit(1)