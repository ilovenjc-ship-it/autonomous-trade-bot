from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, text
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
    strategy: Optional[str] = None,
    result: Optional[str] = None,       # "win" | "loss"
    real_only: bool = Query(False),     # True → only on-chain confirmed trades
    db: AsyncSession = Depends(get_db),
):
    q = select(Trade)
    if trade_type:
        q = q.where(Trade.trade_type == trade_type)
    if status:
        q = q.where(Trade.status == status)
    if strategy:
        q = q.where(Trade.strategy == strategy)
    if result == "win":
        q = q.where(Trade.pnl > 0)
    elif result == "loss":
        q = q.where(Trade.pnl <= 0)
    if real_only:
        q = q.where(Trade.tx_hash.isnot(None))
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
                "fee": t.fee or 0.0,
                "pnl": t.pnl,
                "pnl_pct": t.pnl_pct,
                "strategy": t.strategy,
                "signal_reason": t.signal_reason,
                "tx_hash": t.tx_hash,
                "netuid": t.netuid,
                "network": t.network or "finney",
                # live = has a real on-chain tx_hash (not a sim placeholder)
                "live": bool(t.tx_hash and not t.tx_hash.startswith("block:sim")),
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "executed_at": t.executed_at.isoformat() if t.executed_at else None,
                "error_message": t.error_message,
            }
            for t in rows
        ],
    }


@router.get("/archive/stats")
async def archive_stats(db: AsyncSession = Depends(get_db)):
    """Return count of archived paper trades and real on-chain trade stats."""
    # Count archived paper trades (separate table)
    try:
        result = await db.execute(text("SELECT COUNT(*) FROM paper_trades"))
        archived_count = result.scalar() or 0
    except Exception:
        archived_count = 0

    # Count real on-chain trades in main table
    real_result = await db.execute(
        select(func.count()).select_from(Trade).where(Trade.tx_hash.isnot(None))
    )
    real_count = real_result.scalar() or 0

    # Total in main table
    total_result = await db.execute(select(func.count()).select_from(Trade))
    total_count = total_result.scalar() or 0

    return {
        "real_on_chain": real_count,
        "paper_in_main": total_count - real_count,
        "archived_paper": archived_count,
        "total_historical": real_count + archived_count,
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
    """
    Single source of truth for Dashboard + Manual Trades stats.

    Session XXVI fixes:
      • `win_rate` is now an ACTUAL win rate (wins / executed where pnl > 0).
        Previously returned executed / total (which was execution success rate,
        always ~100% for paper). Labeled incorrectly as "Win Rate" on UI.
      • `total_pnl` is split into `total_pnl_tau` and `total_pnl_usd`.
        `Trade.pnl` is stored in τ units (see cycle_service:951 —
        `pnl = net_return * amount` where amount is stake in τ). Previously
        the τ value was returned as "total_pnl_usd" — a 300x unit error.
      • Counts are now COUNT(*) against the trades table (not BotConfig
        singleton). Matches what /api/pnl/summary reports.
    """
    from services.price_service import price_service as _ps
    from models.strategy import Strategy as _Strategy
    TAO_USD_FALLBACK = 259.31
    tao_price = float(_ps.current_price or TAO_USD_FALLBACK)

    # Session XXVI: honor the same stats_reset_at cutoff as /api/analytics/summary.
    # Prevents drift between Dashboard and Manual Trades after /reset-paper-stats
    # zeroes counters without purging the trades table.
    reset_at = (await db.execute(
        select(func.min(_Strategy.stats_reset_at))
    )).scalar_one_or_none()

    def _scoped():
        q = select(func.count()).select_from(Trade)
        if reset_at is not None:
            q = q.where(Trade.executed_at >= reset_at)
        return q

    def _scoped_sum(col):
        q = select(func.sum(col)).select_from(Trade).where(Trade.status == "executed")
        if reset_at is not None:
            q = q.where(Trade.executed_at >= reset_at)
        return q

    def _scoped_count_where(*extra):
        q = select(func.count()).select_from(Trade)
        for c in extra:
            q = q.where(c)
        if reset_at is not None:
            q = q.where(Trade.executed_at >= reset_at)
        return q

    total    = (await db.execute(_scoped())).scalar() or 0
    executed = (await db.execute(_scoped_count_where(Trade.status == "executed"))).scalar() or 0
    failed   = (await db.execute(_scoped_count_where(Trade.status == "failed"))).scalar() or 0
    buys     = (await db.execute(_scoped_count_where(Trade.trade_type == "buy"))).scalar() or 0
    sells    = (await db.execute(_scoped_count_where(Trade.trade_type == "sell"))).scalar() or 0
    wins     = (await db.execute(_scoped_count_where(Trade.status == "executed", Trade.pnl > 0))).scalar() or 0
    losses   = (await db.execute(_scoped_count_where(Trade.status == "executed", Trade.pnl <= 0))).scalar() or 0

    total_volume_usd = (await db.execute(_scoped_sum(Trade.usd_value))).scalar()
    total_pnl_tau    = float((await db.execute(_scoped_sum(Trade.pnl))).scalar() or 0.0)

    return {
        "total_trades":      total,
        "executed_trades":   executed,
        "failed_trades":     failed,
        "buy_trades":        buys,
        "sell_trades":       sells,
        "wins":              wins,
        "losses":            losses,
        "total_volume_usd":  round(float(total_volume_usd or 0), 4),
        "total_pnl_tau":     round(total_pnl_tau, 6),
        "total_pnl_usd":     round(total_pnl_tau * tao_price, 4),
        "win_rate":          round(wins / executed * 100, 1) if executed else 0.0,
        "exec_success_rate": round(executed / total * 100, 1) if total else 0.0,
        "tao_price_usd":     round(tao_price, 4),
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