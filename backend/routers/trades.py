from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from db.database import get_db
from models.trade import Trade
from services.trading_service import trading_service

router = APIRouter(prefix="/api/trades", tags=["trades"])


class ManualTradeRequest(BaseModel):
    action: str          # "buy" or "sell"
    amount: float
    reason: Optional[str] = "Manual trade"


@router.get("")
async def list_trades(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    trade_type: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Trade)
    if trade_type:
        q = q.where(Trade.trade_type == trade_type)
    if status:
        q = q.where(Trade.status == status)
    q = q.order_by(desc(Trade.created_at))

    # Count
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar()

    # Page
    q = q.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "trades": [
            {
                "id": t.id,
                "trade_type": t.trade_type,
                "status": t.status,
                "amount": t.amount,
                "price_at_trade": t.price_at_trade,
                "usd_value": t.usd_value,
                "pnl": t.pnl,
                "pnl_pct": t.pnl_pct,
                "strategy": t.strategy,
                "signal_reason": t.signal_reason,
                "tx_hash": t.tx_hash,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "executed_at": t.executed_at.isoformat() if t.executed_at else None,
                "error_message": t.error_message,
            }
            for t in rows
        ],
    }


@router.post("/manual")
async def manual_trade(payload: ManualTradeRequest):
    if payload.action not in ("buy", "sell"):
        raise HTTPException(status_code=400, detail="action must be 'buy' or 'sell'")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")

    result = await trading_service.manual_trade(
        action=payload.action,
        amount=payload.amount,
        reason=payload.reason or "Manual trade",
    )
    return result


@router.get("/stats")
async def trade_stats(db: AsyncSession = Depends(get_db)):
    total = (await db.execute(select(func.count()).select_from(Trade))).scalar()
    executed = (
        await db.execute(
            select(func.count()).select_from(Trade).where(Trade.status == "executed")
        )
    ).scalar()
    failed = (
        await db.execute(
            select(func.count()).select_from(Trade).where(Trade.status == "failed")
        )
    ).scalar()
    buys = (
        await db.execute(
            select(func.count()).select_from(Trade).where(Trade.trade_type == "buy")
        )
    ).scalar()
    sells = (
        await db.execute(
            select(func.count()).select_from(Trade).where(Trade.trade_type == "sell")
        )
    ).scalar()
    total_volume = (
        await db.execute(
            select(func.sum(Trade.usd_value)).select_from(Trade).where(
                Trade.status == "executed"
            )
        )
    ).scalar()
    total_pnl = (
        await db.execute(
            select(func.sum(Trade.pnl)).select_from(Trade).where(
                Trade.status == "executed"
            )
        )
    ).scalar()

    return {
        "total_trades": total,
        "executed_trades": executed,
        "failed_trades": failed,
        "buy_trades": buys,
        "sell_trades": sells,
        "total_volume_usd": float(total_volume or 0),
        "total_pnl_usd": float(total_pnl or 0),
        "win_rate": round(executed / total * 100, 1) if total else 0,
    }


@router.get("/{trade_id}")
async def get_trade(trade_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Trade).where(Trade.id == trade_id))
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    return {
        "id": trade.id,
        "trade_type": trade.trade_type,
        "status": trade.status,
        "amount": trade.amount,
        "price_at_trade": trade.price_at_trade,
        "usd_value": trade.usd_value,
        "pnl": trade.pnl,
        "pnl_pct": trade.pnl_pct,
        "strategy": trade.strategy,
        "signal_reason": trade.signal_reason,
        "tx_hash": trade.tx_hash,
        "netuid": trade.netuid,
        "network": trade.network,
        "created_at": trade.created_at.isoformat() if trade.created_at else None,
        "executed_at": trade.executed_at.isoformat() if trade.executed_at else None,
        "error_message": trade.error_message,
    }