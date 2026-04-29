from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional, Dict, Any

from db.database import get_db
from models.strategy import Strategy
from models.bot_config import BotConfig
from services.strategy_service import DEFAULT_STRATEGIES, get_signal
from services.price_service import price_service
from services.activity_service import push_event
from services.alert_service import alert_service

router = APIRouter(prefix="/api/strategies", tags=["strategies"])

# ── Valid strategy modes ──────────────────────────────────────────────────────
VALID_MODES = {"PAPER_ONLY", "APPROVED_FOR_LIVE", "PENDING_LIVE_APPROVAL", "LIVE"}


class StrategyUpdate(BaseModel):
    parameters: Optional[Dict[str, Any]] = None
    is_enabled: Optional[bool] = None
    stake_amount: Optional[float] = None  # TAO per trade — overrides global config


@router.get("")
async def list_strategies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Strategy))
    strategies = result.scalars().all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "display_name": s.display_name,
            "description": s.description,
            "is_active": s.is_active,
            "is_enabled": s.is_enabled,
            "mode": getattr(s, "mode", "PAPER_ONLY"),
            "parameters": s.parameters,
            "total_trades": s.total_trades,
            "win_rate": s.win_rate,
            "total_pnl": s.total_pnl,
            "cycles_completed": getattr(s, "cycles_completed", 0),
            # Capital allocation fields
            "stake_amount": getattr(s, "stake_amount", None),
            "allocation_pct": getattr(s, "allocation_pct", None),
        }
        for s in strategies
    ]


@router.post("/{name}/activate")
async def activate_strategy(name: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Strategy).where(Strategy.name == name))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    # Deactivate all
    await db.execute(update(Strategy).values(is_active=False))
    strategy.is_active = True

    # Update bot config
    config_result = await db.execute(select(BotConfig).where(BotConfig.id == 1))
    config = config_result.scalar_one_or_none()
    if config:
        config.active_strategy = name

    await db.commit()
    return {"success": True, "message": f"Strategy '{name}' activated"}


@router.put("/{name}")
async def update_strategy(
    name: str, payload: StrategyUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Strategy).where(Strategy.name == name))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if payload.parameters is not None:
        strategy.parameters = payload.parameters
    if payload.is_enabled is not None:
        strategy.is_enabled = payload.is_enabled
    if payload.stake_amount is not None:
        strategy.stake_amount = max(0.001, payload.stake_amount)  # enforce minimum
    await db.commit()
    return {"success": True, "message": f"Strategy '{name}' updated"}


@router.get("/{name}/signal")
async def get_strategy_signal(name: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Strategy).where(Strategy.name == name))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    prices = price_service.get_price_history_list()
    indicators = price_service.compute_indicators()
    signal = get_signal(name, prices, indicators, strategy.parameters or {})
    return {"strategy": name, "signal": signal, "price": price_service.current_price}


# ── Human Approval Gate endpoints ─────────────────────────────────────────────

@router.get("/pending-approval")
async def list_pending_approval(db: AsyncSession = Depends(get_db)):
    """Return all strategies currently in PENDING_LIVE_APPROVAL state."""
    result = await db.execute(
        select(Strategy).where(Strategy.mode == "PENDING_LIVE_APPROVAL")
    )
    strategies = result.scalars().all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "display_name": s.display_name,
            "mode": s.mode,
            "win_rate": round(s.win_rate or 0, 1),
            "total_pnl": round(s.total_pnl or 0, 4),
            "cycles_completed": s.cycles_completed or 0,
            "win_trades": s.win_trades or 0,
            "loss_trades": s.loss_trades or 0,
            "last_promoted_at": (
                s.last_promoted_at.isoformat() + "Z"
                if s.last_promoted_at else None
            ),
        }
        for s in strategies
    ]


@router.post("/{name}/approve-live")
async def approve_for_live(name: str, db: AsyncSession = Depends(get_db)):
    """
    Operator explicitly approves a PENDING_LIVE_APPROVAL strategy for LIVE trading.
    This is the human gate — no strategy goes LIVE without this call.
    """
    result = await db.execute(select(Strategy).where(Strategy.name == name))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    if strategy.mode != "PENDING_LIVE_APPROVAL":
        raise HTTPException(
            status_code=400,
            detail=f"Strategy '{name}' is not in PENDING_LIVE_APPROVAL state "
                   f"(current mode: {strategy.mode}). Cannot approve.",
        )

    strategy.mode = "LIVE"
    strategy.last_promoted_at = datetime.utcnow()
    await db.commit()

    stats_str = (
        f"Cycles={strategy.cycles_completed} "
        f"WR={strategy.win_rate:.1f}% "
        f"PnL={strategy.total_pnl:.4f}τ"
    )
    push_event(
        "gate",
        f"✅ {strategy.display_name} APPROVED FOR LIVE by operator — going LIVE",
        strategy=name,
        detail=stats_str,
    )
    alert_service.push_alert(
        type     = "GATE_PROMOTION",
        level    = "INFO",
        title    = f"✅ {strategy.display_name} approved for LIVE by operator",
        message  = (
            f"Operator manually approved {strategy.display_name} for live trading. "
            f"Mode: LIVE. {stats_str}"
        ),
        strategy = name,
        detail   = "Human approval gate passed — live TAO execution now active for this strategy.",
    )
    alert_service.gate_promotion(name, strategy.display_name, "LIVE", stats_str)
    return {
        "success": True,
        "strategy": name,
        "new_mode": "LIVE",
        "message": f"Strategy '{strategy.display_name}' approved for LIVE trading by operator.",
    }


@router.post("/{name}/reject-live")
async def reject_for_live(name: str, db: AsyncSession = Depends(get_db)):
    """
    Operator rejects a PENDING_LIVE_APPROVAL strategy — sends it back to PAPER_ONLY.
    Stats are preserved; strategy must re-accumulate paper data.
    """
    result = await db.execute(select(Strategy).where(Strategy.name == name))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    if strategy.mode not in ("PENDING_LIVE_APPROVAL", "APPROVED_FOR_LIVE", "LIVE"):
        raise HTTPException(
            status_code=400,
            detail=f"Strategy '{name}' cannot be rejected from mode '{strategy.mode}'.",
        )

    previous_mode = strategy.mode
    strategy.mode = "PAPER_ONLY"
    await db.commit()

    push_event(
        "gate",
        f"🚫 {strategy.display_name} rejected by operator — returned to PAPER",
        strategy=name,
        detail=f"Previous mode: {previous_mode}",
    )
    alert_service.push_alert(
        type     = "GATE_DEMOTION",
        level    = "WARNING",
        title    = f"🚫 {strategy.display_name} live approval rejected",
        message  = (
            f"Operator rejected {strategy.display_name} for live trading. "
            f"Mode reset to PAPER_ONLY. Strategy will continue accumulating paper data."
        ),
        strategy = name,
        detail   = f"Previous mode: {previous_mode}",
    )
    return {
        "success": True,
        "strategy": name,
        "new_mode": "PAPER_ONLY",
        "previous_mode": previous_mode,
        "message": f"Strategy '{strategy.display_name}' rejected — returned to PAPER_ONLY.",
    }