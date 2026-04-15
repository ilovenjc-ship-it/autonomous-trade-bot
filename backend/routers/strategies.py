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

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


class StrategyUpdate(BaseModel):
    parameters: Optional[Dict[str, Any]] = None
    is_enabled: Optional[bool] = None


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