"""
kelly_service.py — F-37B (D-37 Part B) Kelly cap-structure phasing
====================================================================

Doctrinal anchors
-----------------
- D-31 half-Kelly default · full Kelly NEVER
- D-32 LTCM forward-warning (correlated bets at full Kelly = compounding
  ruin risk during regime breaks)
- D-36 Bailey-min sample-size gate
- D-37 continuous Kelly: f* = m / s²
  (m = mean of per-trade log-return, s² = variance of per-trade log-return)
- D-37 Part B (this file): phased cap by deployment phase × sample size

Phase matrix
------------
| Phase                     | Sample        | Cap formula                          |
|---------------------------|---------------|--------------------------------------|
| paper_under_bailey        | n < bailey    | static_cap (Kelly NOT used)          |
| paper_at_bailey           | n ≥ bailey    | min(static, 0.25 × max(f*, 0))       |
| live_maturing (0..100)    | live_n < 100  | linear interp 0.25→0.5 × max(f*, 0)  |
| live_mature               | live_n ≥ 100  | min(static, 0.5 × max(f*, 0))        |

Tripwires
---------
- `KellyDoctrineViolationError` raised on any code path that would compute
  cap = 1.0 × f* (full Kelly is architecturally unreachable).
- f* ≤ 0 → applied cap = 0 regardless of phase (do-not-deploy).
- s² ≈ 0 → f* = None, fallback to static cap, warning surfaced.

This module is pure-compute: all I/O lives in the calling endpoint.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional, Iterable, List


# ── Doctrine tripwire ─────────────────────────────────────────────────────

class KellyDoctrineViolationError(Exception):
    """
    Raised when any code path attempts to compute a position cap at
    full Kelly (multiplier = 1.0) or above the half-Kelly ceiling.

    Distinguishable from a runtime bug in logs — this is a *doctrine*
    violation, not an exception we expect under normal operation.
    """


# ── Result dataclasses ────────────────────────────────────────────────────

@dataclass
class KellyResult:
    """Output of compute_kelly()."""
    f_star: Optional[float]              # m / s² — None if degenerate
    m: Optional[float]                   # mean of log-returns
    s_squared: Optional[float]           # variance of log-returns
    sample_size: int                     # n trades in window
    do_not_deploy: bool                  # f* ≤ 0 OR sample < bailey_min
    reason: Optional[str] = None         # "f_star_negative" / "sample_below_bailey" / "degenerate_variance" / None
    inside_noise_floor: bool = False     # 0 < f* < 0.001 AND sample < 100 (López de Prado prob-failure flag)


@dataclass
class CapStructureResult:
    """Output of compute_effective_cap() — what the endpoint serializes."""
    strategy_id: str
    phase: str
    phase_progress: float                # 0..1 within current phase
    sample_size: int
    bailey_min: int
    static_cap_tao: float
    kelly: dict                          # KellyResult.__dict__ (for JSON)
    applied_formula: str
    applied_cap_tao: float
    multiplier_used: float               # the actual multiplier applied (≤ 0.5 always)
    warnings: List[str] = field(default_factory=list)


# ── Compute Kelly from returns ────────────────────────────────────────────

def compute_kelly_from_returns(
    returns_pct: Iterable[float],
    bailey_min: int = 50,
) -> KellyResult:
    """
    Compute the continuous Kelly fraction f* = m / s² from a sequence
    of per-trade percent returns (e.g. trades.pnl_pct).

    Inputs
    ------
    returns_pct : iterable of float
        Per-trade percentage returns. e.g. 1.5 means +1.5% on that trade.
        Converted to log-returns internally: ln(1 + pct/100).
    bailey_min : int
        Minimum sample size before Kelly is considered usable for
        sizing decisions. Below this, we return do_not_deploy=True
        with reason="sample_below_bailey".

    Returns
    -------
    KellyResult

    Edge cases
    ----------
    - Empty / very small sample → do_not_deploy=True, f_star=None
    - All returns identical → s² = 0 → f_star=None, reason="degenerate_variance"
    - Mean ≤ 0 → f_star ≤ 0, do_not_deploy=True (D-37 doctrine: m<0 ⇒ no size)
    - 1 + pct/100 ≤ 0 (catastrophic loss row) → that observation is
      clamped to log(0.01) = -4.605 to avoid log of non-positive.
    """
    returns_list = list(returns_pct)
    n = len(returns_list)

    if n == 0:
        return KellyResult(
            f_star=None, m=None, s_squared=None, sample_size=0,
            do_not_deploy=True, reason="sample_below_bailey",
        )

    # Convert pct → log-return; clamp catastrophic 1+r ≤ 0 to a survivable
    # floor (log(0.01) ≈ -4.605) so a single bad row doesn't crash the calc.
    log_returns: List[float] = []
    for r in returns_list:
        gross = 1.0 + (r / 100.0)
        log_returns.append(math.log(max(gross, 0.01)))

    # Sample mean & sample variance (Bessel-corrected for n ≥ 2).
    m = sum(log_returns) / n
    if n >= 2:
        s_squared = sum((x - m) ** 2 for x in log_returns) / (n - 1)
    else:
        s_squared = 0.0

    # Below-Bailey gate: Kelly is computed for visibility but flagged unusable.
    if n < bailey_min:
        # Compute f* anyway for display, but do_not_deploy fires.
        if s_squared > 1e-12:
            f_star = m / s_squared
        else:
            f_star = None
        return KellyResult(
            f_star=f_star, m=m, s_squared=s_squared, sample_size=n,
            do_not_deploy=True, reason="sample_below_bailey",
            inside_noise_floor=False,
        )

    # Degenerate variance — f* is undefined / explodes; fall back to static.
    if s_squared < 1e-12:
        return KellyResult(
            f_star=None, m=m, s_squared=s_squared, sample_size=n,
            do_not_deploy=False, reason="degenerate_variance",
        )

    f_star = m / s_squared

    # f* ≤ 0 → do-not-deploy at any size (D-37 doctrine for m < 0).
    if f_star <= 0:
        return KellyResult(
            f_star=f_star, m=m, s_squared=s_squared, sample_size=n,
            do_not_deploy=True, reason="f_star_negative",
        )

    # López de Prado prob-failure noise-floor flag.
    inside_noise_floor = (0 < f_star < 0.001) and (n < 100)

    return KellyResult(
        f_star=f_star, m=m, s_squared=s_squared, sample_size=n,
        do_not_deploy=False, reason=None,
        inside_noise_floor=inside_noise_floor,
    )


# ── Phase classification ──────────────────────────────────────────────────

def compute_phase(
    *,
    mode: str,                           # "PAPER_ONLY" | "APPROVED_FOR_LIVE" | "LIVE"
    paper_trade_count: int,
    live_trade_count: int,
    bailey_min: int,
    live_maturing_threshold: int = 100,
) -> tuple[str, float]:
    """
    Returns (phase, phase_progress).

    phase ∈ {paper_under_bailey, paper_at_bailey, live_maturing, live_mature}
    phase_progress ∈ [0,1] — fraction of the way through the current phase
                              (used for live_maturing linear interpolation).
    """
    is_live = (mode == "LIVE")

    if not is_live:
        if paper_trade_count < bailey_min:
            progress = (paper_trade_count / bailey_min) if bailey_min > 0 else 0.0
            return "paper_under_bailey", min(1.0, max(0.0, progress))
        else:
            return "paper_at_bailey", 1.0

    # LIVE
    if live_trade_count < live_maturing_threshold:
        progress = (live_trade_count / live_maturing_threshold) if live_maturing_threshold > 0 else 0.0
        return "live_maturing", min(1.0, max(0.0, progress))
    return "live_mature", 1.0


# ── Effective cap composition ─────────────────────────────────────────────

# Locked doctrine constants — full Kelly is architecturally unreachable.
KELLY_QUARTER_MULTIPLIER = 0.25
KELLY_HALF_MULTIPLIER = 0.5
KELLY_MAX_MULTIPLIER = 0.5  # half-Kelly is the ceiling, period


def compute_effective_cap(
    *,
    strategy_id: str,
    static_cap_tao: float,
    kelly: KellyResult,
    phase: str,
    phase_progress: float,
    bailey_min: int,
    do_not_deploy_lock: bool = False,
) -> CapStructureResult:
    """
    Compose the applied cap from (static, Kelly, phase, locks).

    Tripwire
    --------
    Asserts `multiplier_used ≤ KELLY_MAX_MULTIPLIER`. Any violation
    raises `KellyDoctrineViolationError`. This is the "full Kelly NEVER"
    architectural backstop.
    """
    warnings: List[str] = []

    # Operator manual lock — wins regardless of Kelly verdict.
    if do_not_deploy_lock:
        return CapStructureResult(
            strategy_id=strategy_id, phase=phase, phase_progress=phase_progress,
            sample_size=kelly.sample_size, bailey_min=bailey_min,
            static_cap_tao=static_cap_tao,
            kelly=_kelly_to_dict(kelly),
            applied_formula="manual_lock_active",
            applied_cap_tao=0.0,
            multiplier_used=0.0,
            warnings=["do-not-deploy lock active (manual)"],
        )

    # Kelly-driven do-not-deploy (f* ≤ 0).
    if kelly.do_not_deploy and kelly.reason == "f_star_negative":
        return CapStructureResult(
            strategy_id=strategy_id, phase=phase, phase_progress=phase_progress,
            sample_size=kelly.sample_size, bailey_min=bailey_min,
            static_cap_tao=static_cap_tao,
            kelly=_kelly_to_dict(kelly),
            applied_formula="do_not_deploy(f*≤0)",
            applied_cap_tao=0.0,
            multiplier_used=0.0,
            warnings=["f* ≤ 0 — strategy is do-not-deploy at any size"],
        )

    # paper_under_bailey: Kelly NOT used; static cap rules.
    if phase == "paper_under_bailey":
        return CapStructureResult(
            strategy_id=strategy_id, phase=phase, phase_progress=phase_progress,
            sample_size=kelly.sample_size, bailey_min=bailey_min,
            static_cap_tao=static_cap_tao,
            kelly=_kelly_to_dict(kelly),
            applied_formula="static_cap (n < bailey_min — Kelly not used)",
            applied_cap_tao=static_cap_tao,
            multiplier_used=0.0,
            warnings=[f"sample {kelly.sample_size} < bailey_min {bailey_min} — Kelly inactive"],
        )

    # Degenerate variance — fall back to static.
    if kelly.f_star is None:
        return CapStructureResult(
            strategy_id=strategy_id, phase=phase, phase_progress=phase_progress,
            sample_size=kelly.sample_size, bailey_min=bailey_min,
            static_cap_tao=static_cap_tao,
            kelly=_kelly_to_dict(kelly),
            applied_formula="static_cap (degenerate variance)",
            applied_cap_tao=static_cap_tao,
            multiplier_used=0.0,
            warnings=["s² ≈ 0 — Kelly undefined, fell back to static"],
        )

    # Determine the multiplier per phase.
    if phase == "paper_at_bailey":
        multiplier = KELLY_QUARTER_MULTIPLIER
        formula = f"min(static, {KELLY_QUARTER_MULTIPLIER:.2f} × f*)"
    elif phase == "live_maturing":
        # Linear interpolation: 0.25 at progress=0 → 0.50 at progress=1.
        multiplier = KELLY_QUARTER_MULTIPLIER + (KELLY_HALF_MULTIPLIER - KELLY_QUARTER_MULTIPLIER) * phase_progress
        formula = f"min(static, {multiplier:.3f} × f*)  [maturing {phase_progress*100:.0f}%]"
    elif phase == "live_mature":
        multiplier = KELLY_HALF_MULTIPLIER
        formula = f"min(static, {KELLY_HALF_MULTIPLIER:.2f} × f*)"
    else:
        # Unknown phase — defensive fallback.
        return CapStructureResult(
            strategy_id=strategy_id, phase=phase, phase_progress=phase_progress,
            sample_size=kelly.sample_size, bailey_min=bailey_min,
            static_cap_tao=static_cap_tao,
            kelly=_kelly_to_dict(kelly),
            applied_formula=f"static_cap (unknown phase {phase})",
            applied_cap_tao=static_cap_tao,
            multiplier_used=0.0,
            warnings=[f"unknown phase: {phase}"],
        )

    # ── Doctrine tripwire — full Kelly is architecturally unreachable ────
    if multiplier > KELLY_MAX_MULTIPLIER:
        raise KellyDoctrineViolationError(
            f"D-31/D-32 violation: multiplier {multiplier:.4f} exceeds "
            f"KELLY_MAX_MULTIPLIER ({KELLY_MAX_MULTIPLIER}). "
            f"Half-Kelly is the ceiling, full Kelly is NEVER. "
            f"strategy={strategy_id} phase={phase}"
        )

    # f* > 0 by this point (do-not-deploy branch handled above).
    kelly_cap = multiplier * kelly.f_star  # type: ignore[operator]

    # min(static, Kelly-derived) — Kelly is the ceiling, not the target.
    applied = min(static_cap_tao, kelly_cap)
    if kelly_cap < static_cap_tao:
        warnings.append(
            f"Kelly cap ({kelly_cap:.4f} τ) below static ({static_cap_tao:.4f} τ) — Kelly active"
        )
    else:
        warnings.append(
            f"static cap ({static_cap_tao:.4f} τ) below Kelly ({kelly_cap:.4f} τ) — static active"
        )

    if kelly.inside_noise_floor:
        warnings.append(
            "Kelly fraction inside noise floor (0 < f* < 0.001, n < 100) — "
            "edge may be sample variance only (López de Prado probFailure check)"
        )

    return CapStructureResult(
        strategy_id=strategy_id, phase=phase, phase_progress=phase_progress,
        sample_size=kelly.sample_size, bailey_min=bailey_min,
        static_cap_tao=static_cap_tao,
        kelly=_kelly_to_dict(kelly),
        applied_formula=formula,
        applied_cap_tao=applied,
        multiplier_used=multiplier,
        warnings=warnings,
    )


def _kelly_to_dict(k: KellyResult) -> dict:
    """JSON-friendly serialization of KellyResult."""
    return {
        "f_star": k.f_star,
        "m": k.m,
        "s_squared": k.s_squared,
        "sample_size": k.sample_size,
        "do_not_deploy": k.do_not_deploy,
        "reason": k.reason,
        "inside_noise_floor": k.inside_noise_floor,
    }


# ── Schema validator (used by /risk/config POST) ──────────────────────────

def validate_kelly_multipliers(payload: dict) -> Optional[str]:
    """
    Returns None if payload is doctrinally valid, else an error string.

    Rejects:
    - kelly_quarter_multiplier > 0.5
    - kelly_half_multiplier > 0.5
    - any field named like "kelly_*_multiplier" with value > 0.5
    - kelly_full_forbidden = false (the doctrine flag MUST stay true)
    """
    for key, val in payload.items():
        if key.startswith("kelly_") and key.endswith("_multiplier"):
            try:
                fv = float(val)
            except (TypeError, ValueError):
                return f"{key} must be numeric"
            if fv > KELLY_MAX_MULTIPLIER:
                return (
                    f"{key} = {fv} exceeds half-Kelly ceiling "
                    f"({KELLY_MAX_MULTIPLIER}). Full Kelly is NEVER. "
                    f"See D-31 / D-32 / Poundstone p231-233."
                )
            if fv < 0:
                return f"{key} must be non-negative"
        if key == "kelly_full_forbidden" and val is not True:
            return "kelly_full_forbidden must remain true (doctrine)"
    return None