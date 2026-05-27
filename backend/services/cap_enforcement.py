"""
cap_enforcement.py — F-37B FR-7 trading-side cap enforcement
=================================================================

Doctrinal anchors
-----------------
- D-31  half-Kelly default · full Kelly NEVER
- D-32  LTCM forward-warning (correlated bets at full Kelly = ruin in regime
  breaks; cap structure is the load-bearing backstop against active bleed)
- D-36  Bailey-min sample-size gate
- D-37  continuous Kelly  f* = m / s²
- D-37 Part B (F-37B)  phased cap by deployment phase × sample size
- D-44  Architect standing authority — FR-7 wired without per-decision
  green-light because the doctrinal substrate above is already in place.

Purpose
-------
The pure-compute math lives in services.kelly_service.  The read-display
endpoint (fleet.py /risk/cap-structure) and the trading-side enforcement
(cycle_service buy path) both need the same DB-backed wrapper around it.
This module is that wrapper.

Two public entry points:

1. ``compute_strategy_cap_structure(s, db, risk_config) -> CapStructureResult``
   Exact moral equivalent of the pre-existing ``_build_cap_structure_for_strategy``
   helper that lived inline in fleet.py — relocated here so cycle_service
   can call it without importing from a router module (anti-pattern).

2. ``enforce_cap_on_amount(s, db, risk_config, requested_amount_tao)
   -> tuple[float, dict | None]``
   FR-7 trading-side gate.  Behavior:

   - ``feature_phased_cap_structure`` OFF → returns ``(requested, None)``
     unchanged (pure deploy hygiene; behaviour identical to pre-FR-7).
   - flag ON, applied_cap == 0 → returns ``(0.0, audit)`` — caller MUST
     skip the trade entirely (do-not-deploy / manual lock / f*≤0).
   - flag ON, requested > applied_cap → returns ``(applied_cap, audit)``.
   - flag ON, requested ≤ applied_cap → returns ``(requested, None)``.

   ``audit`` is a JSON-serialisable dict suitable for ``push_event(detail=…)``
   so every cap-clamp leaves a record in the activity log.

This module is read-only from the DB.  It does not mutate Trade rows or
risk config.  All τ-sizing decisions in the trading pipeline route
through ``enforce_cap_on_amount`` when the feature flag is ON — that is
the FR-7 acceptance criterion ("compute_effective_cap is the ONLY path
to applied cap").
"""
from __future__ import annotations

import logging
from typing import Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.trade import Trade
from services.kelly_service import (
    CapStructureResult,
    compute_effective_cap,
    compute_kelly_from_returns,
    compute_phase,
)

logger = logging.getLogger(__name__)


# ── Shared compute (read-display + FR-7 share this) ─────────────────────────


async def compute_strategy_cap_structure(
    s,                          # Strategy ORM row
    db: AsyncSession,
    risk_config: dict,
) -> CapStructureResult:
    """
    Build the CapStructureResult dataclass for a single strategy.

    Reads:
      - ``risk_config["strategies_cap_overrides"][s.name]`` (per-strategy
        static_cap_tao / bailey_min override / do_not_deploy_lock)
      - ``risk_config["max_position_size_pct"]`` (default static cap derivation)
      - ``risk_config["bailey_min_trades_default"]``
      - ``risk_config["live_maturing_threshold"]``
      - ``trades.pnl_pct`` for ``s.name`` (sample window for Kelly)

    No writes.  No HTTP exceptions raised — purely a compute helper.
    """
    overrides = risk_config.get("strategies_cap_overrides", {}) or {}
    bailey_default = int(risk_config.get("bailey_min_trades_default", 50))
    live_threshold = int(risk_config.get("live_maturing_threshold", 100))

    name = s.name
    override = overrides.get(name, {}) if isinstance(overrides, dict) else {}
    bailey_min = int(override.get("bailey_min_trades", bailey_default))
    do_not_deploy_lock = bool(override.get("do_not_deploy_lock", False))

    # Default static cap: derive from current max_position_size_pct + a
    # nominal 1τ wallet reference, then per-strategy override wins.
    default_static_cap = float(override.get(
        "static_cap_tao",
        (risk_config.get("max_position_size_pct", 5.0) / 100.0) * 1.0,  # 1τ ref wallet
    ))

    rows = await db.execute(
        select(Trade.pnl_pct).where(
            Trade.strategy == name,
            Trade.pnl_pct.isnot(None),
        )
    )
    returns_pct = [float(r[0]) for r in rows.all() if r[0] is not None]

    kelly = compute_kelly_from_returns(returns_pct, bailey_min=bailey_min)

    is_live = (s.mode == "LIVE")
    paper_n = len(returns_pct) if not is_live else 0
    live_n = len(returns_pct) if is_live else 0
    phase, progress = compute_phase(
        mode=s.mode or "PAPER_ONLY",
        paper_trade_count=paper_n,
        live_trade_count=live_n,
        bailey_min=bailey_min,
        live_maturing_threshold=live_threshold,
    )

    return compute_effective_cap(
        strategy_id=name,
        static_cap_tao=default_static_cap,
        kelly=kelly,
        phase=phase,
        phase_progress=progress,
        bailey_min=bailey_min,
        do_not_deploy_lock=do_not_deploy_lock,
    )


# ── FR-7 trading-side enforcement gate ──────────────────────────────────────


async def enforce_cap_on_amount(
    s,                          # Strategy ORM row
    db: AsyncSession,
    risk_config: dict,
    requested_amount_tao: float,
) -> Tuple[float, Optional[dict]]:
    """
    FR-7 — clamp a requested τ trade size against the phased cap.

    Returns ``(applied_amount_tao, audit_record)``.

    Contract
    --------
    * Feature flag OFF → returns ``(requested, None)``.  Behaviour is
      bit-identical to pre-FR-7 deploys (pure deploy hygiene).

    * Feature flag ON →
        - ``applied_cap_tao == 0`` (do-not-deploy / manual lock / f*≤0)
          → returns ``(0.0, audit)``.  Caller MUST skip the trade.
        - ``requested_amount_tao > applied_cap_tao`` → returns
          ``(applied_cap_tao, audit)``.  Trade fires at the clamped size.
        - ``requested_amount_tao ≤ applied_cap_tao`` → returns
          ``(requested, None)``.  No clamp; trade fires at requested size.

    * Defensive fallback: if cap compute raises (DB hiccup, malformed
      override, etc.), returns ``(requested, None)`` and logs a warning.
      Cap enforcement MUST NOT crash the cycle loop.
    """
    if not bool(risk_config.get("feature_phased_cap_structure", False)):
        return requested_amount_tao, None

    try:
        cap_res = await compute_strategy_cap_structure(s, db, risk_config)
    except Exception as e:  # pragma: no cover — defensive only
        logger.warning(
            f"FR-7 cap compute failed for {s.name}: {e} — falling through to requested amount"
        )
        return requested_amount_tao, None

    applied_cap = float(cap_res.applied_cap_tao)
    requested = float(requested_amount_tao)

    # do-not-deploy: f* ≤ 0, manual lock, or below-bailey clamp to zero.
    if applied_cap <= 0.0:
        return 0.0, {
            "strategy": s.name,
            "phase": cap_res.phase,
            "applied_cap_tao": 0.0,
            "requested_tao": round(requested, 6),
            "reason": cap_res.applied_formula,
            "warnings": list(cap_res.warnings),
            "kelly_f_star": cap_res.kelly.get("f_star"),
            "sample_size": cap_res.sample_size,
        }

    # Clamp on overshoot (with tiny epsilon to suppress float noise).
    if requested > applied_cap + 1e-9:
        return applied_cap, {
            "strategy": s.name,
            "phase": cap_res.phase,
            "applied_cap_tao": round(applied_cap, 6),
            "requested_tao": round(requested, 6),
            "reason": f"clamped_to_effective_cap: {cap_res.applied_formula}",
            "warnings": list(cap_res.warnings),
            "kelly_f_star": cap_res.kelly.get("f_star"),
            "sample_size": cap_res.sample_size,
            "multiplier_used": cap_res.multiplier_used,
        }

    # Within cap — no clamp, no audit record needed.
    return requested, None