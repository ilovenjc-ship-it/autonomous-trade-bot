"""
grinold_service.py — F-30 (D-30) Fundamental Law of Active Management
======================================================================

Per-strategy decomposition of edge into skill (IC) × opportunity (Breadth).

Grinold & Kahn identity (Active Portfolio Management, Ch 6):

    IR ≈ IC × √Breadth

Where:
    IC      = Information Coefficient (corr forecast vs realized return per bet)
    Breadth = number of *independent* forecasts per period
    IR      = Information Ratio (annualized excess / tracking error)

For Project Ari's HODL-benchmark β=1 construction, IR collapses to Sharpe.
The decomposition surfaces:
    - Sharpe (= IR for this construction)        — observed
    - IC                                          — calibrated
    - Breadth                                     — n bets
    - Implied IR  = IC × √Breadth                 — theoretical
    - Drift       = Sharpe_observed − Implied IR  — forward-warning signal

Doctrinal anchors:
    - D-30 (D-40 grant) — Grinold/Kahn IC×√Breadth display
    - D-23 inscription discipline — citations match Library file anchors
    - SHARPE_SPEC.md HODL-relative return convention
    - López de Prado probFailure check for marginal-band low-n combos

This module is pure-compute — all I/O lives in the calling endpoint.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional, Sequence, List


# ── Bands per Grinold/Kahn p147 ────────────────────────────────────────────

# IC ranges:
#   ≥ 0.15           excellent  — verify sample size before celebrating
#   [0.05, 0.15)     good       — typical surviving-quant range
#   [0.02, 0.05)     marginal   — edge weak or sample noisy
#   < 0.02           noise      — statistically indistinguishable from zero
IC_BAND_EXCELLENT = 0.15
IC_BAND_GOOD = 0.05
IC_BAND_MARGINAL = 0.02

# Drift bands (observed Sharpe − implied IR):
#   ≥ 0           green       — meeting/exceeding theoretical edge
#   [-0.20, 0)    amber       — some implementation drag
#   < -0.20       red         — material drag (IC decay / breadth miscount / cost)
DRIFT_BAND_AMBER = 0.0
DRIFT_BAND_RED = -0.20

# Bailey-style minimum sample size for IC; below this, IC is surfaced null.
IC_MIN_SAMPLE = 30

# López de Prado probFailure noise-floor: marginal IC + small n is suspect.
PROB_FAILURE_N = 100


@dataclass
class GrinoldResult:
    """Full payload for /grinold endpoint."""
    strategy_id: str
    window_days: int
    trade_count: int
    sharpe_observed: Optional[float]
    ic: Optional[float]
    ic_band: Optional[str]                 # "excellent" / "good" / "marginal" / "noise" / None
    breadth: int                            # raw trade count
    breadth_method: str                     # "trade_count" (raw) or "direction_cluster" (effective)
    n_independent_estimate: int             # direction-cluster count
    implied_ir: Optional[float]
    drift: Optional[float]
    drift_band: Optional[str]               # "green" / "amber" / "red" / None
    forecast_method: str                    # "direction_only" v1
    warnings: List[str] = field(default_factory=list)


# ── Pearson correlation (zero-dep) ─────────────────────────────────────────

def _pearson(xs: Sequence[float], ys: Sequence[float]) -> Optional[float]:
    """
    Sample Pearson correlation. Returns None on:
      - empty / single-element series
      - either series has zero variance
      - mismatched lengths
    """
    n = len(xs)
    if n != len(ys) or n < 2:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx <= 0 or syy <= 0:
        return None
    sxy = sum((xs[i] - mx) * (ys[i] - my) for i in range(n))
    return sxy / math.sqrt(sxx * syy)


# ── Band classifiers ───────────────────────────────────────────────────────

def band_for_ic(ic: Optional[float]) -> Optional[str]:
    if ic is None:
        return None
    a = abs(ic)
    if a >= IC_BAND_EXCELLENT:
        return "excellent"
    if a >= IC_BAND_GOOD:
        return "good"
    if a >= IC_BAND_MARGINAL:
        return "marginal"
    return "noise"


def band_for_drift(drift: Optional[float]) -> Optional[str]:
    if drift is None:
        return None
    if drift >= DRIFT_BAND_AMBER:
        return "green"
    if drift >= DRIFT_BAND_RED:
        return "amber"
    return "red"


# ── Sharpe (per-trade) ─────────────────────────────────────────────────────

def compute_sharpe(returns_pct: Sequence[float]) -> Optional[float]:
    """
    Per-trade Sharpe from percent returns.

      Sharpe = mean(r) / stdev(r)   (per-trade unit, not annualized)

    Returns None if n < 2 or stdev == 0.
    """
    n = len(returns_pct)
    if n < 2:
        return None
    m = sum(returns_pct) / n
    s2 = sum((r - m) ** 2 for r in returns_pct) / (n - 1)
    if s2 <= 0:
        return None
    return m / math.sqrt(s2)


# ── IC (direction-only v1) ─────────────────────────────────────────────────

def compute_ic_direction_only(
    directions: Sequence[float],            # +1 for buy, -1 for sell
    realized: Sequence[float],              # pnl_pct (signed)
    min_sample: int = IC_MIN_SAMPLE,
) -> tuple[Optional[float], List[str]]:
    """
    IC = corr(direction, realized).

    v1 limitation: we don't have signal-magnitude per trade in the trades
    table — only direction (buy/sell).  That makes this a *direction-only*
    IC, which is one of the two ways the spec said this could go.  Surface
    a warning so the operator knows the IC is bounded by direction-resolution.
    """
    warnings: List[str] = []
    n = len(directions)

    if n != len(realized):
        warnings.append("forecast/realized length mismatch — IC unavailable")
        return None, warnings

    if n < min_sample:
        warnings.append(
            f"sample {n} below n={min_sample} minimum for IC — see Grinold/Kahn p146"
        )
        return None, warnings

    ic = _pearson(directions, realized)
    if ic is None:
        warnings.append(
            "forecast variance is zero — strategy producing constant signal"
        )
        return None, warnings

    return ic, warnings


# ── Breadth + direction-cluster effective count ───────────────────────────

def compute_breadth(
    directions: Sequence[float],
) -> tuple[int, int]:
    """
    Returns (raw_breadth, n_independent_estimate).

    raw_breadth         = len(directions)
    n_independent       = number of direction-clusters
                          (= 1 + number of direction switches)

    Independence assumption per Grinold p146: each forecast is uncorrelated
    with the prior. Consecutive same-direction trades likely share regime
    state, so they collapse to one effective bet.
    """
    n = len(directions)
    if n == 0:
        return 0, 0
    if n == 1:
        return 1, 1

    switches = 0
    for i in range(1, n):
        if directions[i] != directions[i - 1]:
            switches += 1

    return n, switches + 1


# ── Implied IR ─────────────────────────────────────────────────────────────

def compute_implied_ir(
    ic: Optional[float],
    breadth: int,
) -> Optional[float]:
    """
    Implied IR = IC × √Breadth (Grinold/Kahn Fundamental Law).

    Uses |IC| × √B because the magnitude is what determines the theoretical
    edge — direction is captured by the sign of IC separately.
    """
    if ic is None or breadth <= 0:
        return None
    return abs(ic) * math.sqrt(breadth)


# ── Top-level compose ─────────────────────────────────────────────────────

def compute_grinold_metrics(
    *,
    strategy_id: str,
    window_days: int,
    directions: Sequence[float],
    realized: Sequence[float],
    use_independent_breadth: bool = True,
) -> GrinoldResult:
    """
    Compose all 5 metrics + bands + warnings.

    use_independent_breadth=True (default) uses the direction-cluster
    estimate for Implied IR — the conservative read per spec FR-3.
    The raw breadth is still surfaced for the operator to compare.
    """
    warnings: List[str] = []
    n = len(directions)

    if n == 0:
        return GrinoldResult(
            strategy_id=strategy_id, window_days=window_days, trade_count=0,
            sharpe_observed=None, ic=None, ic_band=None,
            breadth=0, breadth_method="trade_count",
            n_independent_estimate=0,
            implied_ir=None, drift=None, drift_band=None,
            forecast_method="direction_only",
            warnings=["no trades in window"],
        )

    sharpe = compute_sharpe(realized)
    ic, ic_warnings = compute_ic_direction_only(directions, realized)
    warnings.extend(ic_warnings)

    raw_breadth, n_independent = compute_breadth(directions)
    breadth_for_ir = n_independent if use_independent_breadth else raw_breadth
    breadth_method = "direction_cluster" if use_independent_breadth else "trade_count"

    if use_independent_breadth and raw_breadth > n_independent:
        # Note the conservative read — operator should know breadth was
        # de-duplicated.
        warnings.append(
            f"effective breadth ({n_independent}) < raw count ({raw_breadth}) — "
            f"direction-clusters de-duplicated; Implied IR uses the conservative read"
        )

    implied_ir = compute_implied_ir(ic, breadth_for_ir)

    if sharpe is not None and implied_ir is not None:
        # Drift uses signed Sharpe minus the (always-positive) implied IR
        # ceiling. A negative IC produces |IC|×√B as the implied IR
        # ceiling on absolute alpha; the drift comparison is cleanest
        # when both sides are absolute-value-based on the direction of
        # the IC. For v1 we use signed Sharpe vs |implied_ir| because
        # the operational question is "is the strategy delivering on
        # the forecasted direction it's making?"
        drift = sharpe - implied_ir
    else:
        drift = None

    ic_band = band_for_ic(ic)
    drift_band = band_for_drift(drift)

    # López de Prado probFailure — marginal IC at small n is suspect.
    if (
        ic is not None
        and ic_band == "marginal"
        and n < PROB_FAILURE_N
    ):
        warnings.append(
            f"IC band 'marginal' with n < {PROB_FAILURE_N} — probFailure elevated, "
            f"see López de Prado *Advances in Financial Machine Learning* Ch 3"
        )

    return GrinoldResult(
        strategy_id=strategy_id, window_days=window_days, trade_count=n,
        sharpe_observed=sharpe, ic=ic, ic_band=ic_band,
        breadth=raw_breadth, breadth_method=breadth_method,
        n_independent_estimate=n_independent,
        implied_ir=implied_ir, drift=drift, drift_band=drift_band,
        forecast_method="direction_only",
        warnings=warnings,
    )


def grinold_to_dict(res: GrinoldResult) -> dict:
    """JSON-friendly rounded payload for the API."""
    def _r(v: Optional[float], digits: int = 4) -> Optional[float]:
        return None if v is None else round(v, digits)
    return {
        "strategy_id": res.strategy_id,
        "window_days": res.window_days,
        "trade_count": res.trade_count,
        "sharpe_observed": _r(res.sharpe_observed),
        "ic": _r(res.ic),
        "ic_band": res.ic_band,
        "breadth": res.breadth,
        "breadth_method": res.breadth_method,
        "n_independent_estimate": res.n_independent_estimate,
        "implied_ir": _r(res.implied_ir),
        "drift": _r(res.drift),
        "drift_band": res.drift_band,
        "forecast_method": res.forecast_method,
        "warnings": list(res.warnings),
    }