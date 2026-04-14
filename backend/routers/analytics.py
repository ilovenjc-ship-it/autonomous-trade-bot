"""
Analytics router — strategy comparison, equity curve, drawdown, rolling win rate.
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from typing import List

from db.database import get_db
from models.trade import Trade
from models.strategy import Strategy

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ── helpers ───────────────────────────────────────────────────────────────────

STRATEGY_LABELS = {
    "momentum_cascade":   "Momentum Cascade",
    "dtao_flow_momentum": "dTAO Flow Momentum",
    "liquidity_hunter":   "Liquidity Hunter",
    "breakout_hunter":    "Breakout Hunter",
    "yield_maximizer":    "Yield Maximizer",
    "contrarian_flow":    "Contrarian Flow",
    "volatility_arb":     "Volatility Arb",
    "sentiment_surge":    "Sentiment Surge",
    "balanced_risk":      "Balanced Risk",
    "mean_reversion":     "Mean Reversion",
    "emission_momentum":  "Emission Momentum",
    "macro_correlation":  "Macro Correlation",
}


# ── Strategy comparison table ─────────────────────────────────────────────────

@router.get("/strategies")
async def strategy_comparison(db: AsyncSession = Depends(get_db)):
    """Per-strategy aggregated stats from live trade data."""
    result = await db.execute(
        text("""
            SELECT
                strategy,
                COUNT(*)                                        AS total_trades,
                SUM(pnl)                                        AS total_pnl,
                SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)       AS wins,
                SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END)      AS losses,
                AVG(pnl)                                        AS avg_pnl,
                MAX(pnl)                                        AS best_trade,
                MIN(pnl)                                        AS worst_trade,
                AVG(price_at_trade)                             AS avg_price
            FROM trades
            WHERE strategy IS NOT NULL
            GROUP BY strategy
            ORDER BY total_pnl DESC
        """)
    )
    rows = result.fetchall()

    strategies = []
    for row in rows:
        name, total, pnl, wins, losses, avg_pnl, best, worst, avg_px = row
        win_rate = round((wins / total * 100) if total > 0 else 0, 1)
        strategies.append({
            "name":        name,
            "label":       STRATEGY_LABELS.get(name, name),
            "total_trades": int(total),
            "total_pnl":   round(float(pnl or 0), 4),
            "wins":        int(wins),
            "losses":      int(losses),
            "win_rate":    win_rate,
            "avg_pnl":     round(float(avg_pnl or 0), 6),
            "best_trade":  round(float(best or 0), 4),
            "worst_trade": round(float(worst or 0), 4),
        })
    return strategies


# ── Equity curve ─────────────────────────────────────────────────────────────

@router.get("/equity")
async def equity_curve(db: AsyncSession = Depends(get_db)):
    """Cumulative PnL over time — one point per trade ordered by time."""
    result = await db.execute(
        text("""
            SELECT created_at, pnl, strategy
            FROM trades
            WHERE pnl IS NOT NULL
            ORDER BY created_at ASC
        """)
    )
    rows = result.fetchall()

    points = []
    cumulative = 0.0
    for ts, pnl, strategy in rows:
        cumulative += float(pnl or 0)
        points.append({
            "time":       ts[:16] if ts else "",   # "YYYY-MM-DD HH:MM"
            "pnl":        round(float(pnl or 0), 6),
            "cumulative": round(cumulative, 4),
            "strategy":   strategy,
        })
    return points


# ── Drawdown series ───────────────────────────────────────────────────────────

@router.get("/drawdown")
async def drawdown_series(db: AsyncSession = Depends(get_db)):
    """
    Returns hourly buckets with max drawdown depth (most negative PnL swing from
    running peak) and total PnL for each bucket.
    """
    result = await db.execute(
        text("""
            SELECT created_at, pnl
            FROM trades
            WHERE pnl IS NOT NULL
            ORDER BY created_at ASC
        """)
    )
    rows = result.fetchall()

    # Build hourly buckets
    buckets: dict[str, float] = {}
    for ts, pnl in rows:
        hour = ts[:13]   # "YYYY-MM-DD HH"
        buckets[hour] = buckets.get(hour, 0) + float(pnl or 0)

    # Compute drawdown from running peak
    points = []
    peak = 0.0
    running = 0.0
    for hour, bucket_pnl in sorted(buckets.items()):
        running += bucket_pnl
        if running > peak:
            peak = running
        drawdown = running - peak   # always ≤ 0
        points.append({
            "time":     hour,
            "pnl":      round(bucket_pnl, 4),
            "drawdown": round(drawdown, 4),
            "equity":   round(running, 4),
        })
    return points


# ── Rolling win rate (last N trades window) ───────────────────────────────────

@router.get("/rolling-winrate")
async def rolling_winrate(window: int = 20, db: AsyncSession = Depends(get_db)):
    """Rolling win rate over the last `window` trades at each point."""
    result = await db.execute(
        text("""
            SELECT created_at, pnl
            FROM trades
            WHERE pnl IS NOT NULL
            ORDER BY created_at ASC
        """)
    )
    rows = result.fetchall()
    if not rows:
        return []

    buf = []
    points = []
    for ts, pnl in rows:
        buf.append(float(pnl or 0))
        if len(buf) > window:
            buf.pop(0)
        wins = sum(1 for p in buf if p > 0)
        rate = round(wins / len(buf) * 100, 1)
        points.append({
            "time":     ts[:16],
            "win_rate": rate,
            "n":        len(buf),
        })
    return points


# ── Summary stats ─────────────────────────────────────────────────────────────

@router.get("/summary")
async def analytics_summary(db: AsyncSession = Depends(get_db)):
    """Top-level KPIs for the analytics header bar."""
    result = await db.execute(
        text("""
            SELECT
                COUNT(*)                                     AS total_trades,
                SUM(pnl)                                     AS total_pnl,
                SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)    AS wins,
                SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END)   AS losses,
                MAX(pnl)                                     AS best,
                MIN(pnl)                                     AS worst,
                COUNT(DISTINCT strategy)                     AS active_strategies
            FROM trades
        """)
    )
    r = result.fetchone()
    total, pnl, wins, losses, best, worst, strats = r
    win_rate = round(wins / total * 100, 1) if total else 0

    return {
        "total_trades":       int(total or 0),
        "total_pnl":          round(float(pnl or 0), 4),
        "wins":               int(wins or 0),
        "losses":             int(losses or 0),
        "win_rate":           win_rate,
        "best_trade":         round(float(best or 0), 4),
        "worst_trade":        round(float(worst or 0), 4),
        "active_strategies":  int(strats or 0),
    }