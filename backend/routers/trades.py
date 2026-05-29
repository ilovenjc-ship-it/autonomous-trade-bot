from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, text, case
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from db.database import get_db
from models.trade import Trade
from services.trading_service import trading_service

router = APIRouter(prefix="/api/trades", tags=["trades"])


# ── Day 16 #15 — D-44 cohort anchor ───────────────────────────────────────────
# Mark's spec: add a "post-D-44 cohort" line on the Fleet and Strategies
# pages so the operator can see how the bot is performing since the
# Architect-standing-authority + same-day live-wire batch landed.
#
# Cohort start = git commit fd6f5922 ("D-44 inscription: Architect standing
# authority + same-day live-wire batch") committed 2026-05-27 16:55:18 UTC.
# That commit ships F-37B FR-7 cap-write enforcement to LIVE — the cleanest
# architectural before/after line we have for "the system the live-wire
# committee actually approved on Day 44".
#
# Anyone after D-44 wanting to extend the cohort start (e.g. "since most
# recent inscription") can pass ?since=<iso-timestamp>. Default is D-44.
D44_INSCRIPTION_TIMESTAMP_UTC = datetime(2026, 5, 27, 16, 55, 18, tzinfo=timezone.utc)
D44_COMMIT_SHA = "fd6f5922"


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
    q: Optional[str] = Query(None, description="Free-text search across strategy, signal_reason, id, tx_hash"),
    db: AsyncSession = Depends(get_db),
):
    """
    Session XXXV: added `q` for full-history search.
    Mav: 'Search Box should be able to search All Trades, Not just Trades on
    the Page'. The free-text param ILIKE-matches strategy + signal_reason +
    tx_hash, and exact-matches numeric id when the query is numeric.
    """
    qry = select(Trade)
    if trade_type:
        qry = qry.where(Trade.trade_type == trade_type)
    if status:
        qry = qry.where(Trade.status == status)
    if strategy:
        qry = qry.where(Trade.strategy == strategy)
    if result == "win":
        qry = qry.where(Trade.pnl > 0)
    elif result == "loss":
        qry = qry.where(Trade.pnl <= 0)
    if real_only:
        qry = qry.where(Trade.tx_hash.isnot(None))

    # Session XXXV: free-text search across the WHOLE history (not just the
    # current page). Combines case-insensitive substring on strategy /
    # signal_reason / tx_hash with optional exact id match if numeric.
    if q:
        like = f"%{q.strip()}%"
        from sqlalchemy import or_
        clauses = [
            Trade.strategy.ilike(like),
            Trade.signal_reason.ilike(like),
            Trade.tx_hash.ilike(like),
        ]
        if q.strip().isdigit():
            clauses.append(Trade.id == int(q.strip()))
        qry = qry.where(or_(*clauses))

    qry = qry.order_by(desc(Trade.created_at))
    q = qry  # alias for the rest of the function (preserves diff size)

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


# ── Day 16 #15 — Post-D-44 cohort stats ──────────────────────────────────────
@router.get("/cohort-stats")
async def cohort_stats(
    since: Optional[str] = Query(
        None,
        description=(
            "ISO-8601 timestamp (UTC). Trades with executed_at >= this value "
            "are included in the cohort. Defaults to the D-44 inscription "
            "(git commit fd6f5922, 2026-05-27 16:55:18 UTC) — the architectural "
            "before/after line the live-wire committee approved on Day 44."
        ),
    ),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate trade stats for a cohort defined by an executed_at lower bound.

    Default cohort: post-D-44 (everything that executed on or after the
    Architect-standing-authority + same-day live-wire batch commit).

    Returns:
      cohort_label       Human label for the cohort window.
      since              ISO-8601 timestamp the cohort started at.
      commit_sha         The anchor commit (informational, may be empty for
                         ?since=<custom>).
      now                Server time at query.
      days_since         Whole days from cohort start to now.
      total_trades       Trades with executed_at >= since.
      executed           total_trades with status="executed".
      wins / losses      executed trades split by pnl > 0 vs <= 0.
      win_rate           Percent (0-100), wins / executed.
      total_pnl_tau      Sum of pnl over executed trades.
      per_strategy       List of {strategy, total, executed, wins, losses,
                                  win_rate, total_pnl_tau}, sorted by
                                  total_pnl_tau desc.
    """
    # Resolve cohort start.
    if since:
        try:
            # Accept both '...Z' and '+00:00' suffixes.
            since_iso = since.replace("Z", "+00:00") if since.endswith("Z") else since
            cohort_start = datetime.fromisoformat(since_iso)
            if cohort_start.tzinfo is None:
                cohort_start = cohort_start.replace(tzinfo=timezone.utc)
            cohort_start = cohort_start.astimezone(timezone.utc)
            commit_sha = ""  # custom cohort, not tied to a known anchor
            cohort_label = f"Custom (since {cohort_start.isoformat()})"
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid 'since' timestamp: {since!r}. Expected ISO-8601 (e.g. 2026-05-27T16:55:18Z).",
            )
    else:
        cohort_start = D44_INSCRIPTION_TIMESTAMP_UTC
        commit_sha = D44_COMMIT_SHA
        cohort_label = "Post-D-44"

    # Strip tz for SQL comparison — Trade.executed_at is a naive UTC column.
    cohort_start_naive = cohort_start.astimezone(timezone.utc).replace(tzinfo=None)

    # Aggregate counts.
    base = select(Trade).where(Trade.executed_at >= cohort_start_naive)

    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar() or 0

    executed_q = base.where(Trade.status == "executed")
    executed = (await db.execute(
        select(func.count()).select_from(executed_q.subquery())
    )).scalar() or 0

    wins = (await db.execute(
        select(func.count()).select_from(
            executed_q.where(Trade.pnl > 0).subquery()
        )
    )).scalar() or 0

    losses = (await db.execute(
        select(func.count()).select_from(
            executed_q.where(Trade.pnl <= 0).subquery()
        )
    )).scalar() or 0

    total_pnl_tau = float((await db.execute(
        select(func.sum(Trade.pnl)).where(
            Trade.executed_at >= cohort_start_naive,
            Trade.status == "executed",
        )
    )).scalar() or 0.0)

    win_rate = round((wins / executed * 100), 2) if executed else 0.0

    # Per-strategy breakdown — uses CASE expressions instead of CAST so the
    # query is portable across SQLite (test) and Postgres (production).
    is_exec = case((Trade.status == "executed", 1), else_=0)
    is_win  = case(((Trade.status == "executed") & (Trade.pnl > 0), 1),  else_=0)
    is_loss = case(((Trade.status == "executed") & (Trade.pnl <= 0), 1), else_=0)
    pnl_if_exec = case(
        (Trade.status == "executed", func.coalesce(Trade.pnl, 0.0)),
        else_=0.0,
    )

    strat_rows = (await db.execute(
        select(
            Trade.strategy,
            func.count().label("total"),
            func.sum(is_exec).label("executed"),
            func.sum(is_win).label("wins"),
            func.sum(is_loss).label("losses"),
            func.sum(pnl_if_exec).label("pnl"),
        ).where(
            Trade.executed_at >= cohort_start_naive,
        ).group_by(Trade.strategy)
    )).all()

    per_strategy = []
    for r in strat_rows:
        ex = int(r.executed or 0)
        wn = int(r.wins or 0)
        per_strategy.append({
            "strategy":      r.strategy or "(unknown)",
            "total":         int(r.total or 0),
            "executed":      ex,
            "wins":          wn,
            "losses":        int(r.losses or 0),
            "win_rate":      round((wn / ex * 100), 2) if ex else 0.0,
            "total_pnl_tau": round(float(r.pnl or 0.0), 6),
        })
    per_strategy.sort(key=lambda x: x["total_pnl_tau"], reverse=True)

    now_utc = datetime.now(timezone.utc)
    days_since = max(0, (now_utc - cohort_start).days)

    return {
        "cohort_label":  cohort_label,
        "since":         cohort_start.isoformat().replace("+00:00", "Z"),
        "commit_sha":    commit_sha,
        "now":           now_utc.isoformat().replace("+00:00", "Z"),
        "days_since":    days_since,
        "total_trades":  int(total),
        "executed":      int(executed),
        "wins":          int(wins),
        "losses":        int(losses),
        "win_rate":      win_rate,
        "total_pnl_tau": round(total_pnl_tau, 6),
        "per_strategy":  per_strategy,
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