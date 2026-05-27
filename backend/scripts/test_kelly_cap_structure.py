"""
test_kelly_cap_structure.py — F-37B Kelly cap-structure invariants
====================================================================

Locks the phased cap doctrine behind a green/red bar:

| Phase                     | Cap formula                          |
|---------------------------|--------------------------------------|
| paper_under_bailey        | static_cap (Kelly NOT used)          |
| paper_at_bailey           | min(static, 0.25 × max(f*, 0))       |
| live_maturing (0..100)    | linear interp 0.25→0.5 × max(f*, 0)  |
| live_mature               | min(static, 0.5 × max(f*, 0))        |

Plus doctrine tripwires:
- f* ≤ 0 → applied_cap = 0 (do-not-deploy)
- multiplier > 0.5 → KellyDoctrineViolationError
- s² ≈ 0 → fall back to static, no crash

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

from services.kelly_service import (
    KellyDoctrineViolationError,
    KellyResult,
    compute_kelly_from_returns,
    compute_phase,
    compute_effective_cap,
    validate_kelly_multipliers,
    KELLY_QUARTER_MULTIPLIER,
    KELLY_HALF_MULTIPLIER,
    KELLY_MAX_MULTIPLIER,
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
print("  F-37B — Kelly cap-structure invariants")
print("=" * 64)

# ── INV-1: compute_kelly empty / small sample ─────────────────────────────
r = compute_kelly_from_returns([], bailey_min=50)
ok("INV-1.empty.do_not_deploy", r.do_not_deploy is True)
ok("INV-1.empty.reason", r.reason == "sample_below_bailey")
ok("INV-1.empty.f_star_none", r.f_star is None)
ok("INV-1.empty.sample_zero", r.sample_size == 0)

r = compute_kelly_from_returns([1.0, -0.5, 0.8], bailey_min=50)
ok("INV-1.small-sample.do_not_deploy", r.do_not_deploy is True)
ok("INV-1.small-sample.reason", r.reason == "sample_below_bailey")
ok("INV-1.small-sample.has_stats", r.m is not None and r.s_squared is not None)

# ── INV-2: compute_kelly positive edge above Bailey ───────────────────────
# Generate a stylized return series with positive mean ≈ 1%, modest variance.
# Manually constructible expectation:
#   returns_pct = [+1, +1, +1, +1, +1, -0.5, -0.5, +0.5, +1.5] etc.
# We just need m > 0 and s² > 0 → f* > 0.
import random
random.seed(42)
positive_returns = [random.gauss(0.5, 1.5) for _ in range(80)]   # 80 ≥ 50
r = compute_kelly_from_returns(positive_returns, bailey_min=50)
ok("INV-2.bailey-met.no_do_not_deploy", r.do_not_deploy is False)
ok("INV-2.bailey-met.f_star_positive", r.f_star is not None and r.f_star > 0)
ok("INV-2.bailey-met.sample_correct", r.sample_size == 80)

# ── INV-3: compute_kelly negative-mean ⇒ do_not_deploy ────────────────────
random.seed(7)
neg_returns = [random.gauss(-0.5, 1.0) for _ in range(80)]
r = compute_kelly_from_returns(neg_returns, bailey_min=50)
ok("INV-3.negative-mean.do_not_deploy", r.do_not_deploy is True)
ok("INV-3.negative-mean.reason", r.reason == "f_star_negative")
ok("INV-3.negative-mean.f_star_le_zero", r.f_star is not None and r.f_star <= 0)

# ── INV-4: degenerate variance (all returns identical) ────────────────────
flat = [0.5] * 80
r = compute_kelly_from_returns(flat, bailey_min=50)
ok("INV-4.degenerate.f_star_none", r.f_star is None)
ok("INV-4.degenerate.reason", r.reason == "degenerate_variance")
ok("INV-4.degenerate.no_do_not_deploy", r.do_not_deploy is False)

# ── INV-5: catastrophic loss row clamped (no log of non-positive) ─────────
# A -100% return means total wipeout; should clamp to log(0.01), not crash.
catastrophic = [-100.0] + [1.0] * 80
r = compute_kelly_from_returns(catastrophic, bailey_min=50)
ok("INV-5.catastrophic.no_crash", r is not None)
ok("INV-5.catastrophic.has_stats", r.m is not None and r.s_squared is not None)
ok("INV-5.catastrophic.finite_m", r.m is not None and math.isfinite(r.m))

# ── INV-6: phase classification ───────────────────────────────────────────
phase, prog = compute_phase(mode="PAPER_ONLY", paper_trade_count=20, live_trade_count=0, bailey_min=50)
ok("INV-6.phase.paper_under_bailey", phase == "paper_under_bailey")
ok("INV-6.phase.paper_under_bailey.progress", abs(prog - 0.4) < 1e-9)

phase, prog = compute_phase(mode="PAPER_ONLY", paper_trade_count=80, live_trade_count=0, bailey_min=50)
ok("INV-6.phase.paper_at_bailey", phase == "paper_at_bailey")
ok("INV-6.phase.paper_at_bailey.progress", prog == 1.0)

phase, prog = compute_phase(mode="LIVE", paper_trade_count=200, live_trade_count=42, bailey_min=50)
ok("INV-6.phase.live_maturing", phase == "live_maturing")
ok("INV-6.phase.live_maturing.progress", abs(prog - 0.42) < 1e-9)

phase, prog = compute_phase(mode="LIVE", paper_trade_count=200, live_trade_count=150, bailey_min=50)
ok("INV-6.phase.live_mature", phase == "live_mature")
ok("INV-6.phase.live_mature.progress", prog == 1.0)

# ── INV-7: effective cap — paper_under_bailey returns static, ignores Kelly ──
mock_kelly_pos = KellyResult(
    f_star=0.10, m=0.001, s_squared=0.01, sample_size=20,
    do_not_deploy=True, reason="sample_below_bailey",
)
res = compute_effective_cap(
    strategy_id="x", static_cap_tao=0.05, kelly=mock_kelly_pos,
    phase="paper_under_bailey", phase_progress=0.4, bailey_min=50,
)
ok("INV-7.paper_under_bailey.applied_static",
   abs(res.applied_cap_tao - 0.05) < 1e-9,
   f"got {res.applied_cap_tao}")
ok("INV-7.paper_under_bailey.multiplier_zero", res.multiplier_used == 0.0)

# ── INV-8: effective cap — paper_at_bailey applies min(static, 0.25 × f*) ────
mock_kelly_strong = KellyResult(
    f_star=0.20, m=0.001, s_squared=0.005, sample_size=80,
    do_not_deploy=False, reason=None,
)
# static 0.05 vs Kelly 0.25 × 0.20 = 0.05 → min = 0.05
res = compute_effective_cap(
    strategy_id="x", static_cap_tao=0.05, kelly=mock_kelly_strong,
    phase="paper_at_bailey", phase_progress=1.0, bailey_min=50,
)
ok("INV-8.paper_at_bailey.applied_min",
   abs(res.applied_cap_tao - 0.05) < 1e-9,
   f"got {res.applied_cap_tao}")
ok("INV-8.paper_at_bailey.multiplier_quarter",
   abs(res.multiplier_used - KELLY_QUARTER_MULTIPLIER) < 1e-9)

# Now make Kelly the binding constraint:
# static 0.10 vs Kelly 0.25 × 0.20 = 0.05 → min = 0.05 (Kelly binds)
res = compute_effective_cap(
    strategy_id="x", static_cap_tao=0.10, kelly=mock_kelly_strong,
    phase="paper_at_bailey", phase_progress=1.0, bailey_min=50,
)
ok("INV-8.paper_at_bailey.kelly_binds",
   abs(res.applied_cap_tao - 0.05) < 1e-9,
   f"got {res.applied_cap_tao}")

# ── INV-9: live_maturing linear interp from 0.25 to 0.5 ───────────────────
res_at_50 = compute_effective_cap(
    strategy_id="x", static_cap_tao=1.0, kelly=mock_kelly_strong,
    phase="live_maturing", phase_progress=0.5, bailey_min=50,
)
expected_mult_50 = 0.25 + (0.5 - 0.25) * 0.5  # 0.375
ok("INV-9.live_maturing.50pct.multiplier",
   abs(res_at_50.multiplier_used - expected_mult_50) < 1e-9,
   f"got {res_at_50.multiplier_used}")
ok("INV-9.live_maturing.50pct.applied",
   abs(res_at_50.applied_cap_tao - (expected_mult_50 * 0.20)) < 1e-9,
   f"got {res_at_50.applied_cap_tao}")

# ── INV-10: live_mature applies 0.5 × f* ──────────────────────────────────
res = compute_effective_cap(
    strategy_id="x", static_cap_tao=1.0, kelly=mock_kelly_strong,
    phase="live_mature", phase_progress=1.0, bailey_min=50,
)
ok("INV-10.live_mature.multiplier_half",
   abs(res.multiplier_used - KELLY_HALF_MULTIPLIER) < 1e-9)
expected_kelly_cap = KELLY_HALF_MULTIPLIER * 0.20  # 0.10
ok("INV-10.live_mature.applied_kelly",
   abs(res.applied_cap_tao - expected_kelly_cap) < 1e-9,
   f"got {res.applied_cap_tao}")

# ── INV-11: f* ≤ 0 → applied = 0 regardless of phase ──────────────────────
mock_kelly_neg = KellyResult(
    f_star=-0.014, m=-0.0001, s_squared=0.007, sample_size=80,
    do_not_deploy=True, reason="f_star_negative",
)
for phase in ("paper_at_bailey", "live_maturing", "live_mature"):
    res = compute_effective_cap(
        strategy_id="x", static_cap_tao=0.05, kelly=mock_kelly_neg,
        phase=phase, phase_progress=0.5, bailey_min=50,
    )
    ok(f"INV-11.f_star_neg.{phase}.applied_zero",
       res.applied_cap_tao == 0.0,
       f"got {res.applied_cap_tao}")
    ok(f"INV-11.f_star_neg.{phase}.multiplier_zero", res.multiplier_used == 0.0)

# ── INV-12: do_not_deploy_lock overrides everything ──────────────────────
res = compute_effective_cap(
    strategy_id="x", static_cap_tao=0.05, kelly=mock_kelly_strong,
    phase="live_mature", phase_progress=1.0, bailey_min=50,
    do_not_deploy_lock=True,
)
ok("INV-12.manual_lock.applied_zero", res.applied_cap_tao == 0.0)
ok("INV-12.manual_lock.formula", "manual_lock_active" in res.applied_formula)

# ── INV-13: doctrine tripwire — full Kelly raises ─────────────────────────
# We can't easily corrupt the multiplier table from outside, so we simulate
# by directly injecting a phase that would resolve to a multiplier > 0.5.
# Cleanest: monkeypatch KELLY_HALF_MULTIPLIER via the module to see the
# tripwire actually fires. Use a defensive approach: validate the validator.
err = validate_kelly_multipliers({"kelly_quarter_multiplier": 0.6})
ok("INV-13.validator.rejects_above_half", err is not None and "ceiling" in err.lower())

err = validate_kelly_multipliers({"kelly_half_multiplier": 1.0})
ok("INV-13.validator.rejects_full_kelly", err is not None)

err = validate_kelly_multipliers({"kelly_full_forbidden": False})
ok("INV-13.validator.rejects_doctrine_off", err is not None)

err = validate_kelly_multipliers({"kelly_quarter_multiplier": 0.25, "kelly_half_multiplier": 0.5})
ok("INV-13.validator.accepts_doctrinal_values", err is None)

err = validate_kelly_multipliers({"kelly_quarter_multiplier": -0.1})
ok("INV-13.validator.rejects_negative", err is not None)

# Simulate the architectural tripwire by directly calling compute_effective_cap
# with a forged phase that the function would interpret. We construct a
# passing-then-failing branch by patching the module constant temporarily.
import services.kelly_service as ks
_orig = ks.KELLY_MAX_MULTIPLIER
try:
    # Force the half multiplier above the max — tripwire should fire.
    ks.KELLY_HALF_MULTIPLIER = 0.7  # type: ignore[assignment]
    raised = False
    try:
        compute_effective_cap(
            strategy_id="x", static_cap_tao=1.0, kelly=mock_kelly_strong,
            phase="live_mature", phase_progress=1.0, bailey_min=50,
        )
    except KellyDoctrineViolationError:
        raised = True
    ok("INV-13.tripwire.raises_on_above_half", raised is True)
finally:
    ks.KELLY_HALF_MULTIPLIER = 0.5  # type: ignore[assignment]
    ks.KELLY_MAX_MULTIPLIER = _orig

# ── INV-14: degenerate variance falls back to static (no crash, no Kelly) ──
mock_kelly_degen = KellyResult(
    f_star=None, m=0.001, s_squared=0.0, sample_size=80,
    do_not_deploy=False, reason="degenerate_variance",
)
res = compute_effective_cap(
    strategy_id="x", static_cap_tao=0.05, kelly=mock_kelly_degen,
    phase="paper_at_bailey", phase_progress=1.0, bailey_min=50,
)
ok("INV-14.degenerate.applied_static",
   abs(res.applied_cap_tao - 0.05) < 1e-9,
   f"got {res.applied_cap_tao}")
ok("INV-14.degenerate.multiplier_zero", res.multiplier_used == 0.0)

# ── INV-15: López de Prado prob-failure noise floor flag ──────────────────
# Construct a series with f* in (0, 0.001) and n < 100 → inside_noise_floor.
random.seed(99)
weak_returns = [random.gauss(0.0001, 1.0) for _ in range(60)]  # tiny mean, n < 100
r = compute_kelly_from_returns(weak_returns, bailey_min=50)
# Whether inside_noise_floor is True depends on the random draw, so we just
# assert the property is well-defined and a boolean.
ok("INV-15.noise_floor.is_bool", isinstance(r.inside_noise_floor, bool))

# Construct an explicit case: small positive f*.
mock_kelly_noise = KellyResult(
    f_star=0.0005, m=0.000005, s_squared=0.01, sample_size=60,
    do_not_deploy=False, reason=None, inside_noise_floor=True,
)
res = compute_effective_cap(
    strategy_id="x", static_cap_tao=0.05, kelly=mock_kelly_noise,
    phase="paper_at_bailey", phase_progress=1.0, bailey_min=50,
)
ok("INV-15.noise_floor.warning_surfaced",
   any("noise floor" in w.lower() for w in res.warnings))

# ── INV-16: idempotence — same inputs → same outputs (D-26 cyclic check) ──
r1 = compute_kelly_from_returns(positive_returns, bailey_min=50)
r2 = compute_kelly_from_returns(positive_returns, bailey_min=50)
ok("INV-16.idempotent.f_star",
   r1.f_star is not None and r2.f_star is not None and abs(r1.f_star - r2.f_star) < 1e-12)
ok("INV-16.idempotent.sample_size", r1.sample_size == r2.sample_size)

# ── INV-17: multiplier ≤ 0.5 is invariant on every code path ─────────────
# Run through all valid phases; multiplier_used must always be ≤ 0.5.
for phase in ("paper_under_bailey", "paper_at_bailey", "live_maturing", "live_mature"):
    for progress in (0.0, 0.25, 0.5, 0.75, 1.0):
        res = compute_effective_cap(
            strategy_id="x", static_cap_tao=0.05, kelly=mock_kelly_strong,
            phase=phase, phase_progress=progress, bailey_min=50,
        )
        ok(f"INV-17.half_kelly_ceiling.{phase}@{progress}",
           res.multiplier_used <= KELLY_MAX_MULTIPLIER + 1e-9,
           f"got {res.multiplier_used}")


print("=" * 64)
if failed == 0:
    print(f"  RESULT: {passed} passed, 0 failed")
    print("  All F-37B Kelly cap-structure invariants intact.")
    print("=" * 64)
    sys.exit(0)
else:
    print(f"  RESULT: {passed} passed, {failed} FAILED")
    print("=" * 64)
    sys.exit(1)