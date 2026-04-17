"""
PnL Summary router — dedicated P&L breakdown endpoint.
Covers: by-strategy, by-day, by-week, by-type (BUY/SELL), running total τ + USD.
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from db.database import get_db

router = APIRouter(prefix="/api/pnl", tags=["pnl"])

TAO_USD = 259.31  # fallback; overridden by live price where available

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


# ── /api/pnl/summary — master endpoint ───────────────────────────────────────

@router.get("/summary")
async def pnl_summary(db: AsyncSession = Depends(get_db)):
    """
    One-shot PnL summary:
      - fleet totals
      - by_strategy breakdown
      - by_type (BUY / SELL)
      - by_day (last 14 days)
      - by_week (last 8 weeks)
      - cumulative equity series
    """

    # ── Fleet totals ──────────────────────────────────────────────────────────
    totals_row = (await db.execute(text("""
        SELECT
            COUNT(*)                                        AS total_trades,
            SUM(pnl)                                        AS total_pnl,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)       AS wins,
            SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END)      AS losses,
            SUM(usd_value)                                  AS total_volume_usd,
            AVG(pnl)                                        AS avg_pnl_per_trade,
            MAX(pnl)                                        AS best_trade,
            MIN(pnl)                                        AS worst_trade
        FROM trades
        WHERE status = 'executed'
    """))).fetchone()

    total_pnl   = float(totals_row.total_pnl   or 0)
    total_trades = int(totals_row.total_trades  or 0)
    wins         = int(totals_row.wins          or 0)
    losses       = int(totals_row.losses        or 0)
    win_rate     = round(wins / total_trades * 100, 1) if total_trades else 0

    fleet = {
        "total_pnl_tau":      round(total_pnl, 6),
        "total_pnl_usd":      round(total_pnl * TAO_USD, 4),
        "total_trades":       total_trades,
        "wins":               wins,
        "losses":             losses,
        "win_rate":           win_rate,
        "total_volume_usd":   round(float(totals_row.total_volume_usd or 0), 2),
        "avg_pnl_per_trade":  round(float(totals_row.avg_pnl_per_trade or 0), 6),
        "best_trade":         round(float(totals_row.best_trade or 0), 6),
        "worst_trade":        round(float(totals_row.worst_trade or 0), 6),
    }

    # ── By strategy ───────────────────────────────────────────────────────────
    strat_rows = (await db.execute(text("""
        SELECT
            t.strategy,
            COUNT(*)                                        AS total_trades,
            SUM(t.pnl)                                      AS total_pnl,
            SUM(CASE WHEN t.pnl > 0 THEN 1 ELSE 0 END)     AS wins,
            AVG(t.pnl)                                      AS avg_pnl,
            MAX(t.pnl)                                      AS best_trade,
            MIN(t.pnl)                                      AS worst_trade,
            s.mode,
            s.is_active,
            s.win_rate                                      AS stored_win_rate
        FROM trades t
        LEFT JOIN strategies s ON s.name = t.strategy
        WHERE t.status = 'executed' AND t.strategy IS NOT NULL
        GROUP BY t.strategy, s.mode, s.is_active, s.win_rate
        ORDER BY total_pnl DESC
    """))).fetchall()

    by_strategy = []
    for r in strat_rows:
        strat_trades = int(r.total_trades or 0)
        strat_wins   = int(r.wins or 0)
        strat_pnl    = float(r.total_pnl or 0)
        strat_wr     = round(strat_wins / strat_trades * 100, 1) if strat_trades else 0
        by_strategy.append({
            "strategy":    r.strategy,
            "label":       STRATEGY_LABELS.get(r.strategy, r.strategy),
            "mode":        r.mode or "PAPER_ONLY",
            "is_active":   bool(r.is_active),
            "total_pnl":   round(strat_pnl, 6),
            "total_pnl_usd": round(strat_pnl * TAO_USD, 4),
            "total_trades": strat_trades,
            "wins":        strat_wins,
            "win_rate":    strat_wr,
            "avg_pnl":     round(float(r.avg_pnl or 0), 6),
            "best_trade":  round(float(r.best_trade or 0), 6),
            "worst_trade": round(float(r.worst_trade or 0), 6),
            "pnl_share":   round(strat_pnl / total_pnl * 100, 1) if total_pnl else 0,
        })

    # ── By trade type (BUY / SELL) ────────────────────────────────────────────
    type_rows = (await db.execute(text("""
        SELECT
            trade_type,
            COUNT(*)                                        AS total_trades,
            SUM(pnl)                                        AS total_pnl,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)       AS wins,
            AVG(pnl)                                        AS avg_pnl,
            SUM(usd_value)                                  AS volume_usd
        FROM trades
        WHERE status = 'executed'
        GROUP BY trade_type
    """))).fetchall()

    by_type = []
    for r in type_rows:
        type_trades = int(r.total_trades or 0)
        type_wins   = int(r.wins or 0)
        type_pnl    = float(r.total_pnl or 0)
        by_type.append({
            "type":         r.trade_type.upper(),
            "total_trades": type_trades,
            "total_pnl":    round(type_pnl, 6),
            "total_pnl_usd": round(type_pnl * TAO_USD, 4),
            "wins":         type_wins,
            "win_rate":     round(type_wins / type_trades * 100, 1) if type_trades else 0,
            "avg_pnl":      round(float(r.avg_pnl or 0), 6),
            "volume_usd":   round(float(r.volume_usd or 0), 2),
        })

    # ── By day (last 14 days) ─────────────────────────────────────────────────
    day_rows = (await db.execute(text("""
        SELECT
            DATE(created_at)                                AS day,
            COUNT(*)                                        AS total_trades,
            SUM(pnl)                                        AS daily_pnl,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)       AS wins
        FROM trades
        WHERE status = 'executed'
          AND created_at >= DATE('now', '-14 days')
        GROUP BY DATE(created_at)
        ORDER BY day ASC
    """))).fetchall()

    by_day = []
    for r in day_rows:
        day_trades = int(r.total_trades or 0)
        day_wins   = int(r.wins or 0)
        day_pnl    = float(r.daily_pnl or 0)
        by_day.append({
            "date":         r.day,
            "total_trades": day_trades,
            "pnl":          round(day_pnl, 6),
            "pnl_usd":      round(day_pnl * TAO_USD, 4),
            "win_rate":     round(day_wins / day_trades * 100, 1) if day_trades else 0,
        })

    # ── By week (last 8 weeks) ────────────────────────────────────────────────
    week_rows = (await db.execute(text("""
        SELECT
            strftime('%Y-W%W', created_at)                  AS week,
            COUNT(*)                                        AS total_trades,
            SUM(pnl)                                        AS weekly_pnl,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)       AS wins
        FROM trades
        WHERE status = 'executed'
          AND created_at >= DATE('now', '-56 days')
        GROUP BY strftime('%Y-W%W', created_at)
        ORDER BY week ASC
    """))).fetchall()

    by_week = []
    for r in week_rows:
        wk_trades = int(r.total_trades or 0)
        wk_wins   = int(r.wins or 0)
        wk_pnl    = float(r.weekly_pnl or 0)
        by_week.append({
            "week":         r.week,
            "total_trades": wk_trades,
            "pnl":          round(wk_pnl, 6),
            "pnl_usd":      round(wk_pnl * TAO_USD, 4),
            "win_rate":     round(wk_wins / wk_trades * 100, 1) if wk_trades else 0,
        })

    # ── Cumulative equity series (last 200 trades) ────────────────────────────
    eq_rows = (await db.execute(text("""
        SELECT pnl, created_at, strategy
        FROM trades
        WHERE status = 'executed'
        ORDER BY created_at ASC
        LIMIT 500
    """))).fetchall()

    cumulative = 0.0
    equity_series = []
    for r in eq_rows:
        cumulative += float(r.pnl or 0)
        equity_series.append({
            "ts":         r.created_at,
            "cumulative": round(cumulative, 6),
            "strategy":   r.strategy,
        })

    return {
        "fleet":         fleet,
        "by_strategy":   by_strategy,
        "by_type":       by_type,
        "by_day":        by_day,
        "by_week":       by_week,
        "equity_series": equity_series,
        "tao_price_usd": TAO_USD,
    }