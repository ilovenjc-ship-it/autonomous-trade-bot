"""
test_fr7_cap_enforcement.py — F-37B FR-7 trading-side gate invariants
======================================================================

Locks the FR-7 contract behind a green/red bar:

| Scenario                               | Expected return                  |
|----------------------------------------|----------------------------------|
| feature flag OFF, requested any τ      | (requested, None) — no clamp     |
| flag ON, applied_cap == 0              | (0.0, audit) — caller skips     |
| flag ON, requested > applied_cap       | (applied_cap, audit) — clamped   |
| flag ON, requested ≤ applied_cap       | (requested, None) — no clamp     |
| flag ON, compute raises                | (requested, None) — defensive    |

Plus the phase-correctness invariants per Day 8 / D-37 Part B:
- paper_under_bailey: applied_cap = static (Kelly NOT used) regardless of f*
- paper_at_bailey:    applied_cap ≤ 0.25 × f*
- live_maturing:      applied_cap ≤ 0.5  × f*  (linear interp 0.25→0.5)
- live_mature:        applied_cap ≤ 0.5  × f*

Doctrine: D-31 half-Kelly default · D-32 LTCM forward-warning ·
D-36 Bailey-min · D-37 Part B phased cap · D-44 standing authority.

Mirror of test_simulator.py philosophy: zero-dep, exit 1 on any failure.
"""
from __future__ import annotations

import asyncio
import os as _os
import sys

_HERE = _os.path.dirname(_os.path.abspath(__file__))
_BE = _os.path.normpath(_os.path.join(_HERE, ".."))
if _BE not in sys.path:
    sys.path.insert(0, _BE)

# ── Stub Trade ORM (avoid pulling the full SQLAlchemy stack) ──────────────
# enforce_cap_on_amount calls compute_strategy_cap_structure which calls
# `db.execute(select(Trade.pnl_pct).where(...))`.  We replace the DB layer
# with an in-memory shim so this script stays zero-dep.

import types
import dataclasses


@dataclasses.dataclass
class _Strategy:
    name: str
    mode: str = "PAPER_ONLY"


class _FakeResult:
    def __init__(self, rows):
        self._rows = [(r,) for r in rows]

    def all(self):
        return self._rows


class _FakeDB:
    """Async DB shim that returns a fixed list of pnl_pct values."""
    def __init__(self, returns_pct):
        self._returns = list(returns_pct)

    async def execute(self, *_a, **_kw):
        return _FakeResult(self._returns)


# ── Test harness ──────────────────────────────────────────────────────────

PASSED = 0
FAILED = 0
FAIL_LOG: list[str] = []


def ok(label: str, msg: str = "") -> None:
    global PASSED
    PASSED += 1
    print(f"  PASS  {label}{(' — ' + msg) if msg else ''}")


def bad(label: str, msg: str = "") -> None:
    global FAILED
    FAILED += 1
    FAIL_LOG.append(f"{label}{(' — ' + msg) if msg else ''}")
    print(f"  FAIL  {label}{(' — ' + msg) if msg else ''}")


async def _run_enforce(returns, mode, requested, flag_on, *, static_cap=0.05, bailey=50):
    """Helper: build the shims, call enforce_cap_on_amount."""
    # Patch the Trade import inside cap_enforcement at runtime.  We do that
    # by directly invoking the inner pure-compute logic instead of going
    # through the SQLAlchemy select() expression.  The cleanest way:
    # monkeypatch services.cap_enforcement.compute_strategy_cap_structure
    # for the specific tests that don't care about DB plumbing.
    from services.cap_enforcement import enforce_cap_on_amount
    import services.cap_enforcement as _ce
    from services.kelly_service import (
        compute_kelly_from_returns, compute_phase, compute_effective_cap,
    )

    async def _stub_compute(s, db, risk_config):
        kelly = compute_kelly_from_returns(returns, bailey_min=bailey)
        is_live = (s.mode == "LIVE")
        paper_n = len(returns) if not is_live else 0
        live_n = len(returns) if is_live else 0
        phase, prog = compute_phase(
            mode=s.mode, paper_trade_count=paper_n, live_trade_count=live_n,
            bailey_min=bailey, live_maturing_threshold=100,
        )
        return compute_effective_cap(
            strategy_id=s.name, static_cap_tao=static_cap, kelly=kelly,
            phase=phase, phase_progress=prog, bailey_min=bailey,
            do_not_deploy_lock=False,
        )

    _orig = _ce.compute_strategy_cap_structure
    _ce.compute_strategy_cap_structure = _stub_compute
    try:
        rc = {"feature_phased_cap_structure": flag_on}
        return await enforce_cap_on_amount(_Strategy("x", mode), _FakeDB(returns), rc, requested)
    finally:
        _ce.compute_strategy_cap_structure = _orig


# ── INV-FR7-1: flag OFF is a no-op ──────────────────────────────────────


async def test_flag_off_is_noop():
    label = "INV-FR7-1.flag_off.noop"
    # Even with a sample that would normally produce do-not-deploy at f*<0,
    # flag OFF must return (requested, None) bit-identical to status quo ante.
    # (Mixed negative-mean sample → real f*<0; variance non-degenerate.)
    losing = [-2.0, 0.5] * 30  # n=60, m<0, s²>0
    amt, audit = await _run_enforce(losing, "PAPER_ONLY", requested=0.20, flag_on=False)
    if amt == 0.20 and audit is None:
        ok(label)
    else:
        bad(label, f"got amt={amt}, audit={audit}")


# ── INV-FR7-2: flag ON, applied_cap == 0 → skip-trade audit ─────────────


async def test_flag_on_do_not_deploy_returns_zero_with_audit():
    label = "INV-FR7-2.flag_on.do_not_deploy.zero_with_audit"
    # n=60 ≥ bailey=50, mixed-but-negative-mean → f* < 0 → do-not-deploy.
    # All-identical returns would produce degenerate variance (fallback to
    # static); we want the f_star_negative branch specifically.
    losing = [-2.0, 0.5] * 30
    amt, audit = await _run_enforce(losing, "PAPER_ONLY", requested=0.10, flag_on=True)
    if amt == 0.0 and audit is not None and audit.get("applied_cap_tao") == 0.0:
        ok(label, f"audit.reason='{audit['reason']}'")
    else:
        bad(label, f"got amt={amt}, audit={audit}")


# ── INV-FR7-3: flag ON, paper_under_bailey returns static (no clamp) ────


async def test_flag_on_paper_under_bailey_no_clamp_under_static():
    label = "INV-FR7-3.flag_on.paper_under_bailey.under_static"
    # n=20 < bailey=50 → phase=paper_under_bailey → applied = static = 0.05
    # Requested 0.03 < 0.05 → no clamp.
    rets = [1.0, -0.5, 1.2, -0.8] * 5  # n=20
    amt, audit = await _run_enforce(rets, "PAPER_ONLY", requested=0.03, flag_on=True, static_cap=0.05)
    if abs(amt - 0.03) < 1e-9 and audit is None:
        ok(label, "0.03 ≤ 0.05 static")
    else:
        bad(label, f"got amt={amt}, audit={audit}")


async def test_flag_on_paper_under_bailey_clamp_over_static():
    label = "INV-FR7-3.flag_on.paper_under_bailey.over_static_clamps"
    # Requested 0.10 > static 0.05 → clamp to 0.05.
    rets = [1.0, -0.5, 1.2, -0.8] * 5
    amt, audit = await _run_enforce(rets, "PAPER_ONLY", requested=0.10, flag_on=True, static_cap=0.05)
    if abs(amt - 0.05) < 1e-9 and audit is not None:
        ok(label, f"clamped 0.10 → 0.05 ({audit['phase']})")
    else:
        bad(label, f"got amt={amt}, audit={audit}")


# ── INV-FR7-4: flag ON, paper_at_bailey clamps to ¼-Kelly ──────────────


async def test_flag_on_paper_at_bailey_quarter_kelly_ceiling():
    label = "INV-FR7-4.flag_on.paper_at_bailey.quarter_kelly"
    # n=60 ≥ bailey, dispersed positive-edge sample → moderate f* > 0.
    # Use [3.0, -1.5, 1.0, -0.5] dispersion so variance is non-trivial
    # and 0.25 × f* lands well below the static cap (Kelly is binding).
    rets = [3.0, -1.5, 1.0, -0.5] * 15  # n=60
    amt, audit = await _run_enforce(rets, "PAPER_ONLY", requested=10.0, flag_on=True, static_cap=10.0)
    if amt > 0 and amt < 10.0 and audit is not None:
        # multiplier_used must be 0.25 here (paper_at_bailey)
        if abs(audit.get("multiplier_used", 0) - 0.25) < 1e-6:
            ok(label, f"applied={amt:.6f}, mult=0.25")
        else:
            bad(label, f"multiplier_used={audit.get('multiplier_used')} expected 0.25")
    else:
        bad(label, f"got amt={amt}, audit={audit}")


# ── INV-FR7-5: flag ON, live_mature clamps to ½-Kelly ──────────────────


async def test_flag_on_live_mature_half_kelly_ceiling():
    label = "INV-FR7-5.flag_on.live_mature.half_kelly"
    # mode=LIVE, n=120 ≥ live_maturing_threshold=100 → live_mature → 0.5×f*.
    # Same dispersed sample pattern as FR7-4 so Kelly stays binding.
    rets = [3.0, -1.5, 1.0, -0.5] * 30  # n=120
    amt, audit = await _run_enforce(rets, "LIVE", requested=10.0, flag_on=True, static_cap=10.0)
    if amt > 0 and amt < 10.0 and audit is not None:
        if abs(audit.get("multiplier_used", 0) - 0.5) < 1e-6:
            ok(label, f"applied={amt:.6f}, mult=0.5")
        else:
            bad(label, f"multiplier_used={audit.get('multiplier_used')} expected 0.5")
    else:
        bad(label, f"got amt={amt}, audit={audit}")


# ── INV-FR7-6: flag ON, requested ≤ applied_cap → no clamp ─────────────


async def test_flag_on_requested_under_cap_returns_unchanged():
    label = "INV-FR7-6.flag_on.under_cap.no_clamp"
    rets = [1.0, -0.5, 1.2, -0.8] * 5  # n=20, paper_under_bailey
    amt, audit = await _run_enforce(rets, "PAPER_ONLY", requested=0.001, flag_on=True, static_cap=0.05)
    if abs(amt - 0.001) < 1e-12 and audit is None:
        ok(label)
    else:
        bad(label, f"got amt={amt}, audit={audit}")


# ── INV-FR7-7: defensive — compute raises → fall through ───────────────


async def test_compute_failure_falls_through_to_requested():
    label = "INV-FR7-7.flag_on.compute_raises.falls_through"
    from services.cap_enforcement import enforce_cap_on_amount
    import services.cap_enforcement as _ce

    async def _bad(*_a, **_kw):
        raise RuntimeError("DB exploded")

    _orig = _ce.compute_strategy_cap_structure
    _ce.compute_strategy_cap_structure = _bad
    try:
        rc = {"feature_phased_cap_structure": True}
        amt, audit = await enforce_cap_on_amount(_Strategy("x"), _FakeDB([]), rc, 0.42)
    finally:
        _ce.compute_strategy_cap_structure = _orig

    if abs(amt - 0.42) < 1e-12 and audit is None:
        ok(label, "DB error → status quo ante")
    else:
        bad(label, f"got amt={amt}, audit={audit}")


# ── INV-FR7-8: flag ON, audit record contains required fields ──────────


async def test_audit_record_shape():
    label = "INV-FR7-8.flag_on.audit.shape"
    # Trigger a clamp in paper_under_bailey
    rets = [0.5] * 20
    _, audit = await _run_enforce(rets, "PAPER_ONLY", requested=0.10, flag_on=True, static_cap=0.05)
    required = {"strategy", "phase", "applied_cap_tao", "requested_tao", "reason", "warnings"}
    if audit is not None and required.issubset(audit.keys()):
        ok(label, f"keys={sorted(audit.keys())}")
    else:
        bad(label, f"missing keys; got {audit}")


# ── INV-FR7-9: doctrine tripwire — multiplier never exceeds 0.5 ────────


async def test_multiplier_never_exceeds_half_kelly():
    label = "INV-FR7-9.doctrine.multiplier_never_above_half_kelly"
    # Sweep through paper_at_bailey + live_maturing + live_mature with
    # generous static_cap so Kelly is the active branch in every case.
    # All three samples use the same [3.0, -1.5, 1.0, -0.5] dispersion so
    # Kelly stays the binding constraint and the multiplier is exercised.
    cases = [
        # (returns, mode, expected_multiplier_max)
        ([3.0, -1.5, 1.0, -0.5] * 15, "PAPER_ONLY", 0.25),  # paper_at_bailey, n=60
        ([3.0, -1.5, 1.0, -0.5] * 12, "LIVE", 0.5),         # live_maturing,  n=48
        ([3.0, -1.5, 1.0, -0.5] * 30, "LIVE", 0.5),         # live_mature,    n=120
    ]
    all_ok = True
    detail = []
    for rets, mode, ceiling in cases:
        _, audit = await _run_enforce(rets, mode, requested=10.0, flag_on=True, static_cap=10.0)
        m = (audit or {}).get("multiplier_used", 0.0)
        detail.append(f"{mode}/n={len(rets)}: mult={m:.4f} ≤ {ceiling}")
        if m > ceiling + 1e-9:
            all_ok = False
    if all_ok:
        ok(label, "; ".join(detail))
    else:
        bad(label, "; ".join(detail))


# ── INV-FR7-10: flag OFF returns identity even at do-not-deploy ────────


async def test_flag_off_overrides_even_negative_kelly():
    label = "INV-FR7-10.flag_off.overrides_kelly_verdict"
    # Catastrophically negative-edge sample.  Flag OFF must still return
    # the requested amount unchanged — pre-FR-7 behaviour preserved
    # exactly when the feature is gated off.  This is the safe-deploy
    # contract: shipping FR-7 with the flag OFF is a no-op.
    losing = [-3.0] * 100
    amt, audit = await _run_enforce(losing, "LIVE", requested=0.50, flag_on=False)
    if abs(amt - 0.50) < 1e-12 and audit is None:
        ok(label, "flag OFF preserves status quo ante")
    else:
        bad(label, f"got amt={amt}, audit={audit}")


# ── Runner ─────────────────────────────────────────────────────────────


async def main():
    print("=" * 64)
    print("  F-37B FR-7 cap-enforcement invariants")
    print("=" * 64)

    await test_flag_off_is_noop()
    await test_flag_on_do_not_deploy_returns_zero_with_audit()
    await test_flag_on_paper_under_bailey_no_clamp_under_static()
    await test_flag_on_paper_under_bailey_clamp_over_static()
    await test_flag_on_paper_at_bailey_quarter_kelly_ceiling()
    await test_flag_on_live_mature_half_kelly_ceiling()
    await test_flag_on_requested_under_cap_returns_unchanged()
    await test_compute_failure_falls_through_to_requested()
    await test_audit_record_shape()
    await test_multiplier_never_exceeds_half_kelly()
    await test_flag_off_overrides_even_negative_kelly()

    print("=" * 64)
    print(f"  RESULT: {PASSED} passed, {FAILED} failed")
    if FAILED:
        print()
        print("  Failures:")
        for f in FAIL_LOG:
            print(f"    • {f}")
        print("=" * 64)
        sys.exit(1)
    print("  All FR-7 cap-enforcement invariants intact.")
    print("=" * 64)


if __name__ == "__main__":
    asyncio.run(main())