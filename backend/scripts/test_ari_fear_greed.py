"""
test_ari_fear_greed.py — Path B (Day 16) invariants for Ari's F&G synthesis
============================================================================
Mirrors test_grinold.py / test_almgren_chriss.py philosophy: zero-dep, exit
1 on any failure. Tests the pure synthesis surface (normalizers + composite
+ labeling). The async DB-backed surface is exercised separately.
"""

import math
import os as _os
import sys

_HERE = _os.path.dirname(_os.path.abspath(__file__))
_BE = _os.path.normpath(_os.path.join(_HERE, ".."))
if _BE not in sys.path:
    sys.path.insert(0, _BE)

from services.ari_fear_greed_service import (   # noqa: E402
    AriFearGreedComponents,
    label_for,
    normalize_breadth,
    normalize_consensus_tilt,
    normalize_macd,
    normalize_momentum,
    normalize_rsi,
    synthesize,
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


def approx(a, b, eps: float = 1e-6) -> bool:
    if a is None or b is None:
        return a is b  # both None passes; one None fails
    return abs(a - b) < eps


print("=" * 64)
print("  Path B — Ari's F&G synthesis invariants (Day 16)")
print("=" * 64)

# ─────────────────────────────────────────────────────────────────────────────
# INV-1 — Momentum normalization
# Spec: ±10% maps to ±100; clamps beyond.
# ─────────────────────────────────────────────────────────────────────────────
print("\n  ── INV-1 momentum normalization ─────────────────────────────")
ok("INV-1.zero",     approx(normalize_momentum(0.0),    0.0))
ok("INV-1.pos_5pct", approx(normalize_momentum(5.0),   50.0))
ok("INV-1.neg_5pct", approx(normalize_momentum(-5.0), -50.0))
ok("INV-1.pos_10",   approx(normalize_momentum(10.0), 100.0))
ok("INV-1.neg_10",   approx(normalize_momentum(-10.0), -100.0))
ok("INV-1.clamp_hi", approx(normalize_momentum(50.0), 100.0), "saturates at +100")
ok("INV-1.clamp_lo", approx(normalize_momentum(-50.0), -100.0), "saturates at -100")
ok("INV-1.none",     normalize_momentum(None) is None)

# ─────────────────────────────────────────────────────────────────────────────
# INV-2 — RSI normalization
# Spec: RSI 50 → 0; linear (rsi-50)*2 mapping to ±100.
# ─────────────────────────────────────────────────────────────────────────────
print("\n  ── INV-2 RSI normalization ──────────────────────────────────")
ok("INV-2.50_neutral",  approx(normalize_rsi(50.0),  0.0))
ok("INV-2.0_extreme",   approx(normalize_rsi(0.0), -100.0))
ok("INV-2.100_extreme", approx(normalize_rsi(100.0), 100.0))
ok("INV-2.30_oversold", approx(normalize_rsi(30.0), -40.0), "fear band")
ok("INV-2.70_overbought", approx(normalize_rsi(70.0), 40.0), "greed band")
ok("INV-2.none",        normalize_rsi(None) is None)

# ─────────────────────────────────────────────────────────────────────────────
# INV-3 — MACD normalization
# Spec: tanh(hist / (price * 0.01)) * 100. Sign preserved; magnitude saturates.
# ─────────────────────────────────────────────────────────────────────────────
print("\n  ── INV-3 MACD normalization ─────────────────────────────────")
# At 1% of price hist, output should be tanh(1)*100 ≈ 76.16
res_pos_1pct = normalize_macd(macd=104.0, macd_signal=100.0, current_price=400.0)
ok("INV-3.pos_1pct", approx(res_pos_1pct, math.tanh(1.0) * 100.0, eps=1e-3),
   f"got {res_pos_1pct:.3f}, expected ~76.16")
res_neg_1pct = normalize_macd(macd=96.0, macd_signal=100.0, current_price=400.0)
ok("INV-3.neg_1pct", approx(res_neg_1pct, -math.tanh(1.0) * 100.0, eps=1e-3),
   f"got {res_neg_1pct:.3f}, expected ~-76.16")
res_zero = normalize_macd(macd=100.0, macd_signal=100.0, current_price=400.0)
ok("INV-3.flat", approx(res_zero, 0.0))
ok("INV-3.none_macd", normalize_macd(None, 100.0, 400.0) is None)
ok("INV-3.none_signal", normalize_macd(100.0, None, 400.0) is None)
ok("INV-3.none_price", normalize_macd(100.0, 100.0, None) is None)
ok("INV-3.zero_price", normalize_macd(100.0, 100.0, 0.0) is None,
   "scale=0 must not divide-by-zero")
# Saturation: hist = 5% of price → tanh(5) ≈ 0.9999 → ~99.99
res_satur = normalize_macd(macd=120.0, macd_signal=100.0, current_price=400.0)
ok("INV-3.saturates_high", abs(res_satur - 100.0) < 0.5, f"got {res_satur:.3f}")

# ─────────────────────────────────────────────────────────────────────────────
# INV-4 — Breadth normalization
# Spec: (% positive - 50%) * 2; full saturation at 100%/0%.
# ─────────────────────────────────────────────────────────────────────────────
print("\n  ── INV-4 breadth normalization ──────────────────────────────")
ok("INV-4.all_up",      approx(normalize_breadth(10, 10), 100.0))
ok("INV-4.half_up",     approx(normalize_breadth(5, 10),    0.0))
ok("INV-4.all_down",    approx(normalize_breadth(0, 10), -100.0))
ok("INV-4.three_quarters", approx(normalize_breadth(75, 100), 50.0))
ok("INV-4.zero_total",  normalize_breadth(0, 0) is None)
ok("INV-4.neg_total",   normalize_breadth(0, -1) is None)

# ─────────────────────────────────────────────────────────────────────────────
# INV-5 — Consensus tilt normalization
# Spec: (buy - sell) / (buy + sell + hold) * 100. Hold is in denominator.
# ─────────────────────────────────────────────────────────────────────────────
print("\n  ── INV-5 consensus tilt normalization ───────────────────────")
ok("INV-5.all_buy",  approx(normalize_consensus_tilt(10, 0, 0), 100.0))
ok("INV-5.all_sell", approx(normalize_consensus_tilt(0, 10, 0), -100.0))
ok("INV-5.balanced", approx(normalize_consensus_tilt(5, 5, 0), 0.0))
ok("INV-5.holds_dilute_tilt",
   approx(normalize_consensus_tilt(buy_votes=5, sell_votes=0, hold_votes=5),
          50.0),
   "5 buy + 5 hold + 0 sell → +50, not +100")
ok("INV-5.empty", normalize_consensus_tilt(0, 0, 0) is None)

# ─────────────────────────────────────────────────────────────────────────────
# INV-6 — Composite synthesis (the contract)
# Spec:
#   - Equal weights when all 5 present.
#   - Graceful redistribution when K missing (remaining (5-K) each weight 1/(5-K)).
#   - All-None → None (NOT 0). AP-1 binding.
# ─────────────────────────────────────────────────────────────────────────────
print("\n  ── INV-6 composite synthesis ────────────────────────────────")

c_all = AriFearGreedComponents(
    momentum=20.0, rsi=40.0, macd=60.0, breadth=80.0, consensus=100.0,
)
ok("INV-6.equal_weight_full",
   approx(synthesize(c_all), 60.0),
   "(20+40+60+80+100)/5 = 60")

c_one_missing = AriFearGreedComponents(
    momentum=20.0, rsi=40.0, macd=60.0, breadth=80.0, consensus=None,
)
ok("INV-6.one_missing_redistributes",
   approx(synthesize(c_one_missing), 50.0),
   "(20+40+60+80)/4 = 50, not (20+40+60+80+0)/5")

c_only_one = AriFearGreedComponents(
    momentum=42.0, rsi=None, macd=None, breadth=None, consensus=None,
)
ok("INV-6.single_input_passes_through",
   approx(synthesize(c_only_one), 42.0),
   "single input is the composite")

c_all_none = AriFearGreedComponents(
    momentum=None, rsi=None, macd=None, breadth=None, consensus=None,
)
ok("INV-6.all_none_returns_none",
   synthesize(c_all_none) is None,
   "AP-1: no fabricated neutral when zero inputs")

# Mixed signs — fearful momentum + greedy RSI averages toward neutral
c_mixed = AriFearGreedComponents(
    momentum=-50.0, rsi=50.0, macd=0.0, breadth=None, consensus=None,
)
ok("INV-6.mixed_signs_average",
   approx(synthesize(c_mixed), 0.0),
   "(-50+50+0)/3 = 0")

# Composite bounded in [-100, +100]
c_extreme = AriFearGreedComponents(
    momentum=100.0, rsi=100.0, macd=100.0, breadth=100.0, consensus=100.0,
)
ok("INV-6.composite_bounded_high",
   approx(synthesize(c_extreme), 100.0))

c_extreme_neg = AriFearGreedComponents(
    momentum=-100.0, rsi=-100.0, macd=-100.0, breadth=-100.0, consensus=-100.0,
)
ok("INV-6.composite_bounded_low",
   approx(synthesize(c_extreme_neg), -100.0))

# present_count helper
ok("INV-6.present_count_5", c_all.present_count() == 5)
ok("INV-6.present_count_4", c_one_missing.present_count() == 4)
ok("INV-6.present_count_1", c_only_one.present_count() == 1)
ok("INV-6.present_count_0", c_all_none.present_count() == 0)

# ─────────────────────────────────────────────────────────────────────────────
# INV-7 — Labels
# Spec bands: ≥+60 Extreme Greed, ≥+25 Greed, ≥-25 Neutral, ≥-60 Fear, else Extreme Fear.
# Mirrors Dashboard SentimentGauge zones.
# ─────────────────────────────────────────────────────────────────────────────
print("\n  ── INV-7 labels ─────────────────────────────────────────────")
ok("INV-7.extreme_greed_60",  label_for(60.0)  == "Extreme Greed")
ok("INV-7.extreme_greed_100", label_for(100.0) == "Extreme Greed")
ok("INV-7.greed_25",          label_for(25.0)  == "Greed")
ok("INV-7.greed_59",          label_for(59.0)  == "Greed")
ok("INV-7.neutral_zero",      label_for(0.0)   == "Neutral")
ok("INV-7.neutral_neg25",     label_for(-25.0) == "Neutral")
ok("INV-7.neutral_pos24",     label_for(24.0)  == "Neutral")
ok("INV-7.fear_neg26",        label_for(-26.0) == "Fear")
ok("INV-7.fear_neg60",        label_for(-60.0) == "Fear")
ok("INV-7.extreme_fear_neg61", label_for(-61.0) == "Extreme Fear")
ok("INV-7.extreme_fear_neg100", label_for(-100.0) == "Extreme Fear")
ok("INV-7.none_passes_through", label_for(None) is None)

# ─────────────────────────────────────────────────────────────────────────────
# Closer
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 64)
if failed == 0:
    print(f"  RESULT: {passed} passed, 0 failed")
    print("  Path B (Ari F&G) synthesis invariants intact.")
    print("=" * 64)
    sys.exit(0)
else:
    print(f"  RESULT: {passed} passed, {failed} FAILED")
    print("=" * 64)
    sys.exit(1)