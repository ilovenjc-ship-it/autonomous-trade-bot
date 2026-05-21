from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query
from sqlalchemy import select

from db.database import AsyncSessionLocal
from models.price_history import PriceHistory
from services.price_service import price_service

router = APIRouter(prefix="/api/price", tags=["price"])


@router.get("/current")
async def get_current_price():
    """
    Live snapshot from the in-memory feed. TAO + BTC reference together —
    macro_correlation reads BTC out of indicators; the UI Macro Reference
    card reads it out of `btc`.
    """
    return {
        "symbol": "TAO",
        **price_service.price_data,
        "btc": price_service.btc_data,
        "indicators": price_service.compute_indicators(),
    }


@router.get("/history")
async def get_price_history(
    days: int = Query(7, ge=1, le=90),
    source: str = Query("local", pattern="^(local|coingecko)$"),
):
    """
    Historical TAO ticks.

    Day 9 — Task #C: default `source=local` reads from the persisted
    `price_history` table. `source=coingecko` falls back to the legacy
    CoinGecko `/coins/{id}/market_chart` call (used as a backfill path
    on cold starts before persistence accumulates `days` of data).

    The local source returns the bot's own observed sequence: the same
    ticks the in-memory buffer saw, the same ones strategies acted on.
    No CoinGecko round-trip per request, no 429-throttle dependency.
    """
    if source == "coingecko":
        data = await price_service.fetch_ohlcv(days=days)
        return {
            "symbol": "TAO",
            "days": days,
            "source": "coingecko",
            "data": data,
        }

    # Local DB read
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    async with AsyncSessionLocal() as db:
        stmt = (
            select(
                PriceHistory.recorded_at,
                PriceHistory.price_usd,
                PriceHistory.volume_24h,
                PriceHistory.btc_price_usd,
                PriceHistory.btc_price_change_pct_24h,
                PriceHistory.rsi_14,
            )
            .where(
                PriceHistory.symbol == "TAO",
                PriceHistory.recorded_at >= cutoff,
            )
            .order_by(PriceHistory.recorded_at.asc())
        )
        rows = (await db.execute(stmt)).all()

    data = [
        {
            "timestamp": int(r.recorded_at.timestamp() * 1000)
                          if r.recorded_at is not None else None,
            "price": r.price_usd,
            "volume": r.volume_24h,
            "btc_price": r.btc_price_usd,
            "btc_change_24h": r.btc_price_change_pct_24h,
            "rsi_14": r.rsi_14,
        }
        for r in rows
    ]
    return {
        "symbol": "TAO",
        "days": days,
        "source": "local",
        "count": len(data),
        "data": data,
    }


@router.get("/indicators")
async def get_indicators():
    return price_service.compute_indicators()