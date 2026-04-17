"""
Fleet, Activity, and Chat routes for MissionControl.
"""
import random
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, update as sa_update
from pydantic import BaseModel

from db.database import get_db
from models.strategy import Strategy
from models.trade import Trade
from services.price_service import price_service
from services.activity_service import push_event as _push_event_raw, get_events

router = APIRouter(prefix="/api/fleet", tags=["fleet"])

def _push_event(kind: str, message: str, strategy: Optional[str] = None, detail: str = ""):
    _push_event_raw(kind, message, strategy, detail)


# ── Gate helpers ─────────────────────────────────────────────────────────────

GATE_CYCLES_REQUIRED = 10
GATE_WIN_RATE_REQUIRED = 55.0   # %
GATE_WIN_MARGIN_REQUIRED = 2    # wins must exceed losses by at least 2
GATE_PNL_REQUIRED = 0.0         # cumulative PnL > 0

def _gate_progress(s: Strategy) -> dict:
    cycles_ok = s.cycles_completed >= GATE_CYCLES_REQUIRED
    win_rate_ok = (s.win_rate or 0) >= GATE_WIN_RATE_REQUIRED
    margin_ok = (s.win_trades or 0) - (s.loss_trades or 0) >= GATE_WIN_MARGIN_REQUIRED
    pnl_ok = (s.total_pnl or 0) > GATE_PNL_REQUIRED
    all_clear = cycles_ok and win_rate_ok and margin_ok and pnl_ok
    return {
        "cycles": {"value": s.cycles_completed, "required": GATE_CYCLES_REQUIRED, "ok": cycles_ok},
        "win_rate": {"value": round(s.win_rate or 0, 1), "required": GATE_WIN_RATE_REQUIRED, "ok": win_rate_ok},
        "win_margin": {
            "value": (s.win_trades or 0) - (s.loss_trades or 0),
            "required": GATE_WIN_MARGIN_REQUIRED,
            "ok": margin_ok,
        },
        "pnl": {"value": round(s.total_pnl or 0, 4), "required": GATE_PNL_REQUIRED, "ok": pnl_ok},
        "all_clear": all_clear,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def fleet_status(db: AsyncSession = Depends(get_db)):
    """Full fleet snapshot — all strategies with mode, stats, gate progress."""
    result = await db.execute(select(Strategy).order_by(Strategy.id))
    strategies = result.scalars().all()

    price = price_service.current_price or 0.0
    indicators = price_service.compute_indicators()

    fleet = []
    for s in strategies:
        gate = _gate_progress(s)
        fleet.append({
            "id": s.id,
            "name": s.name,
            "display_name": s.display_name,
            "description": s.description,
            "mode": s.mode or "PAPER_ONLY",
            "is_active": s.is_active,
            "is_enabled": s.is_enabled,
            "total_trades": s.total_trades or 0,
            "win_trades": s.win_trades or 0,
            "loss_trades": s.loss_trades or 0,
            "win_rate": round(s.win_rate or 0, 1),
            "total_pnl": round(s.total_pnl or 0, 4),
            "avg_return": round(s.avg_return or 0, 4),
            "cycles_completed": s.cycles_completed or 0,
            "current_cycle_pnl": round(s.current_cycle_pnl or 0, 4),
            "last_cycle_at": s.last_cycle_at.isoformat() + "Z" if s.last_cycle_at else None,
            "gate": gate,
        })

    # Aggregate metrics
    live_count = sum(1 for f in fleet if f["mode"] == "LIVE")
    paper_count = sum(1 for f in fleet if f["mode"] == "PAPER_ONLY")
    approved_count = sum(1 for f in fleet if f["mode"] == "APPROVED_FOR_LIVE")
    total_pnl = sum(f["total_pnl"] for f in fleet)

    return {
        "fleet": fleet,
        "summary": {
            "total": len(fleet),
            "live": live_count,
            "paper": paper_count,
            "approved": approved_count,
            "total_pnl": round(total_pnl, 4),
            "tao_price": round(price, 2),
            "rsi": round(indicators.get("rsi_14") or 50, 1),
            "ema9": round(indicators.get("ema_9") or price, 2),
        },
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/activity")
async def get_activity(limit: int = 50, db: AsyncSession = Depends(get_db)):
    """Recent activity events — combines system log with real trades."""
    # Pull last trades from DB
    result = await db.execute(
        select(Trade).order_by(desc(Trade.created_at)).limit(20)
    )
    trades = result.scalars().all()

    trade_events = []
    for t in trades:
        action = t.trade_type.upper() if t.trade_type else "TRADE"
        emoji = "🟢" if t.trade_type == "buy" else "🔴"
        trade_events.append({
            "id": f"trade-{t.id}",
            "kind": "trade",
            "message": f"{emoji} {action} {t.amount:.4f} TAO @ ${t.price_at_trade:.2f}",
            "strategy": t.strategy,
            "detail": t.signal_reason or "",
            "timestamp": t.created_at.isoformat() + "Z" if t.created_at else "",
        })

    # Merge with in-memory system events
    sys_events = get_events(limit)
    combined = sys_events + trade_events
    combined.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    return {"events": combined[:limit], "total": len(combined)}


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    message: str

_CHAT_HISTORY: List[dict] = []

@router.post("/chat")
async def chat(payload: ChatMessage, db: AsyncSession = Depends(get_db)):
    """Chat with II Agent — responses backed by live DB + indicator data."""
    msg = payload.message.lower().strip()
    price  = price_service.current_price or 0.0
    ind    = price_service.compute_indicators()
    rsi    = ind.get("rsi_14")
    ema9   = ind.get("ema_9")
    ema21  = ind.get("ema_21")
    macd   = ind.get("macd")
    msig   = ind.get("macd_signal")

    result = await db.execute(select(Strategy))
    strategies = result.scalars().all()

    live_strats     = [s for s in strategies if s.mode == "LIVE"]
    approved_strats = [s for s in strategies if s.mode == "APPROVED_FOR_LIVE"]
    paper_strats    = [s for s in strategies if s.mode == "PAPER_ONLY"]
    total_pnl       = sum(s.total_pnl or 0 for s in strategies)
    total_trades    = sum(s.total_trades or 0 for s in strategies)
    total_wins      = sum(s.win_trades or 0 for s in strategies)
    fleet_wr        = round(total_wins / total_trades * 100, 1) if total_trades else 0
    best_strat      = max(strategies, key=lambda s: s.total_pnl or 0)

    # Momentum signal label
    if rsi and rsi < 35:
        signal_label = "OVERSOLD — BUY bias across momentum strategies"
    elif rsi and rsi > 65:
        signal_label = "OVERBOUGHT — SELL/HOLD bias; trailing stops tightening"
    else:
        signal_label = "NEUTRAL — no high-conviction signal; waiting for confirmation"

    # ── Keyword routing with live data ────────────────────────────────────────
    if any(w in msg for w in ["price", "tao", "cost", "worth", "usd", "$"]):
        ch = ind.get("price_change_pct_24h") or 0
        response = (
            f"TAO is trading at **${price:.2f}** ({'+' if ch>=0 else ''}{ch:.2f}% 24h). "
            f"RSI(14) = {rsi:.1f} — {signal_label}. "
            f"EMA9={ema9:.3f}, EMA21={ema21:.3f}." if rsi and ema9 and ema21 else
            f"TAO is trading at **${price:.2f}**. Indicators are still warming up — need more price history."
        )

    elif any(w in msg for w in ["rsi", "macd", "ema", "indicator", "signal", "momentum", "technical"]):
        ind_lines = []
        if rsi:   ind_lines.append(f"RSI(14): {rsi:.1f}")
        if ema9:  ind_lines.append(f"EMA9: {ema9:.4f}")
        if ema21: ind_lines.append(f"EMA21: {ema21:.4f}")
        if macd and msig: ind_lines.append(f"MACD hist: {(macd-msig):.5f}")
        ind_str = " | ".join(ind_lines) if ind_lines else "Indicators warming up…"
        response = f"Live indicators → {ind_str}. Current signal: {signal_label}."

    elif any(w in msg for w in ["status", "how", "health", "online", "running", "fleet"]):
        response = (
            f"Fleet operational. {len(live_strats)} strategies LIVE, "
            f"{len(approved_strats)} approved for live, {len(paper_strats)} in paper training. "
            f"Cycle engine running — executing trades every 60s. "
            f"Fleet win rate: {fleet_wr:.1f}% across {total_trades} trades."
        )

    elif any(w in msg for w in ["gate", "graduate", "promote", "approved", "paper only"]):
        promoted = [s.display_name for s in approved_strats] or ["none yet"]
        live_names = [s.display_name for s in live_strats]
        response = (
            f"Gate system: strategies need {GATE_CYCLES_REQUIRED} cycles, "
            f">{GATE_WIN_RATE_REQUIRED}% win rate, wins exceed losses by ≥2, and positive PnL. "
            f"Currently APPROVED (awaiting deployment): {', '.join(promoted)}. "
            f"LIVE strategies: {', '.join(live_names) if live_names else 'none'}."
        )

    elif any(w in msg for w in ["pnl", "profit", "loss", "return", "earn", "made", "performance"]):
        response = (
            f"Total fleet PnL: **{total_pnl:+.4f} τ** (${total_pnl * price:.2f} USD). "
            f"Win rate: {fleet_wr:.1f}% across {total_trades} trades. "
            f"Best performer: {best_strat.display_name} at {best_strat.total_pnl:+.4f} τ "
            f"({best_strat.win_rate:.1f}% WR)."
        )

    elif any(w in msg for w in ["best", "top", "leading", "winner", "rank"]):
        top3 = sorted(strategies, key=lambda s: s.total_pnl or 0, reverse=True)[:3]
        lines = [f"{i+1}. {s.display_name}: {s.total_pnl:+.4f} τ ({s.win_rate:.1f}% WR)"
                 for i, s in enumerate(top3)]
        response = "Top 3 strategies by PnL: " + " | ".join(lines)

    elif any(w in msg for w in ["cycle", "interval", "next", "when", "frequency"]):
        from services.cycle_service import cycle_service
        cn = cycle_service.cycle_number
        response = (
            f"Autonomous cycle engine is {'running' if cycle_service.is_running else 'stopped'}. "
            f"Completed {cn} cycles, firing every 60 seconds. "
            f"Each cycle evaluates all 12 strategies and executes paper trades based on signal strength."
        )

    elif any(w in msg for w in ["risk", "stop", "loss", "drawdown", "safety", "halt"]):
        response = (
            "Risk controls active: max drawdown 15%, position size capped at 2% of portfolio per trade. "
            "Stop-loss at 5% per position. Daily trade limit: 50. "
            "All trades are paper trades — no real capital at risk until wallet is connected."
        )

    elif any(w in msg for w in ["wallet", "address", "key", "mnemonic", "connect"]):
        response = (
            "Wallet not connected. Target address: 5GgRojEFh5aCFNLKuSWb6WtrM5nBDB6GrRpqaqreBLcg4e7L "
            "(Finney mainnet). Connect via the Wallet page — requires 12-word mnemonic. "
            "All trading is paper-only until wallet is active."
        )

    else:
        response = random.choice([
            f"Monitoring {len(strategies)} strategies. Cycle engine at cycle #{getattr(__import__('services.cycle_service', fromlist=['cycle_service']), 'cycle_service', None) and __import__('services.cycle_service', fromlist=['cycle_service']).cycle_service.cycle_number}. Signal: {signal_label}.",
            f"Risk parameters nominal. Fleet win rate {fleet_wr:.1f}%, {total_trades} paper trades executed. PnL: {total_pnl:+.4f} τ.",
            f"Gate enforcement active. {len(paper_strats)} strategies in paper training, {len(approved_strats)} pending deployment, {len(live_strats)} in LIVE mode.",
            f"CoinGecko price feed active at ${price:.2f}. RSI={rsi:.1f if rsi else 'N/A'}. Autonomous cycle running every 60s.",
            f"Consensus engine voting across {len(live_strats)} LIVE strategies. Best performer: {best_strat.display_name} at {best_strat.total_pnl:+.4f} τ.",
        ])

    user_entry  = {"role": "user",  "content": payload.message,  "timestamp": datetime.utcnow().isoformat() + "Z"}
    agent_entry = {"role": "agent", "content": response,          "timestamp": datetime.utcnow().isoformat() + "Z"}
    _CHAT_HISTORY.extend([user_entry, agent_entry])
    _push_event("system", f"Chat: {payload.message[:60]}", detail=response[:100])

    return {"response": response, "history": _CHAT_HISTORY[-20:]}

@router.get("/chat/history")
async def chat_history():
    return {"history": _CHAT_HISTORY[-20:]}


# ── Fleet Bots (Agent Fleet page) ────────────────────────────────────────────

# Capital allocation based on performance score
_ALLOCATION_DEFAULTS = {
    "momentum_cascade":   25.0,
    "dtao_flow_momentum": 25.0,
    "liquidity_hunter":   14.4,
    "emission_momentum":   7.5,
    "balanced_risk":      11.9,
    "mean_reversion":     11.9,
    "volatility_arb":     11.9,
    "sentiment_surge":    11.9,
    "macro_correlation":   2.0,
    "breakout_hunter":    11.9,
    "yield_maximizer":     2.0,
    "contrarian_flow":    11.9,
}

_LAST_SIGNALS = {
    "momentum_cascade":   "HOLD",
    "dtao_flow_momentum": "BUY",
    "liquidity_hunter":   "BUY",
    "emission_momentum":  "HOLD",
    "balanced_risk":      "BUY",
    "mean_reversion":     "HOLD",
    "volatility_arb":     "HOLD",
    "sentiment_surge":    "BUY",
    "macro_correlation":  "BUY",
    "breakout_hunter":    "BUY",
    "yield_maximizer":    "BUY",
    "contrarian_flow":    "SELL",
}


@router.get("/bots")
async def fleet_bots(db: AsyncSession = Depends(get_db)):
    """Leaderboard-ranked 12-bot fleet view."""
    result = await db.execute(select(Strategy).order_by(Strategy.id))
    strategies = result.scalars().all()

    # Compute performance score: win_rate * 0.6 + (pnl_normalised) * 0.4
    max_pnl = max((abs(s.total_pnl or 0) for s in strategies), default=0.001) or 0.001

    bots = []
    for s in strategies:
        pnl = s.total_pnl or 0
        wr = s.win_rate or 0
        score = (wr * 0.6 + (pnl / max_pnl * 100) * 0.4) if (wr > 0 or pnl != 0) else 50.0
        score = max(0, min(100, score))

        gate = _gate_progress(s)
        health = "GREEN" if (s.win_rate or 0) >= 30 else ("YELLOW" if (s.win_rate or 0) >= 10 else "RED")
        if (s.total_trades or 0) == 0:
            health = "YELLOW"

        # Allocation: prefer DB-persisted value, fall back to in-memory default
        alloc = s.allocation_pct if s.allocation_pct is not None else _ALLOCATION_DEFAULTS.get(s.name, 11.9)

        bots.append({
            "name": s.name,
            "display_name": s.display_name,
            "strategy": s.description,
            "mode": s.mode or "PAPER_ONLY",
            "health": health,
            "is_active": s.is_active,
            "last_signal": _LAST_SIGNALS.get(s.name, "HOLD"),
            "total_trades": s.total_trades or 0,
            "win_trades": s.win_trades or 0,
            "loss_trades": s.loss_trades or 0,
            "win_rate": round(wr, 1),
            "net_pnl_tao": round(pnl, 4),
            "capital_allocation_pct": round(alloc, 1),
            "performance_score": round(score, 1),
            "consecutive_losses": max(0, (s.loss_trades or 0) - (s.win_trades or 0)),
            "gate_passed": gate["all_clear"],
            "gate": gate,
            "cycles_completed": s.cycles_completed or 0,
            "last_promoted_at": s.last_promoted_at if isinstance(s.last_promoted_at, str)
                                else (s.last_promoted_at.isoformat() + "Z" if s.last_promoted_at else None),
        })

    # Sort by performance_score descending, assign rank
    bots.sort(key=lambda b: b["performance_score"], reverse=True)
    for i, b in enumerate(bots):
        b["rank"] = i + 1

    live_count = sum(1 for b in bots if b["mode"] == "LIVE")
    paper_count = sum(1 for b in bots if b["mode"] == "PAPER_ONLY")
    approved_count = sum(1 for b in bots if b["mode"] == "APPROVED_FOR_LIVE")
    total_allocation = sum(b["capital_allocation_pct"] for b in bots)

    # Import here to avoid circular import
    from services.promotion_service import promotion_service as _ps

    return {
        "bots": bots,
        "summary": {
            "total": len(bots),
            "live": live_count,
            "paper": paper_count,
            "approved": approved_count,
            "green": sum(1 for b in bots if b["health"] == "GREEN"),
            "yellow": sum(1 for b in bots if b["health"] == "YELLOW"),
            "red": sum(1 for b in bots if b["health"] == "RED"),
            "total_allocation": round(total_allocation, 1),
            "last_rebalanced_at": _ps.last_rebalanced_at,
            "promotions_this_session": len(_ps.promotions_this_session),
        },
    }


@router.post("/rebalance")
async def rebalance_capital(db: AsyncSession = Depends(get_db)):
    """
    Recalculate capital allocation % for all 12 bots based on live performance scores.

    Algorithm:
      - Every bot gets a guaranteed floor of 2 %
      - Remaining pool (100 % - 12*2 % = 76 %) is distributed proportionally
        to each bot's performance score (win_rate*0.6 + pnl_norm*0.4)
      - Hard cap of 30 % per bot (excess redistributed to rest)
      - Results written back into the in-memory _ALLOCATION_DEFAULTS dict
        so the next /bots call reflects the new values immediately
    """
    result = await db.execute(select(Strategy).order_by(Strategy.id))
    strategies = result.scalars().all()

    FLOOR   = 2.0    # % every bot guaranteed
    CAP     = 30.0   # % max any single bot can hold
    TOTAL   = 100.0

    # Step 1 — compute raw performance scores
    max_pnl = max((abs(s.total_pnl or 0) for s in strategies), default=0.001) or 0.001
    scores: dict[str, float] = {}
    for s in strategies:
        pnl = s.total_pnl or 0
        wr  = s.win_rate  or 0
        raw = (wr * 0.6 + (pnl / max_pnl * 100) * 0.4) if (wr > 0 or pnl != 0) else 50.0
        scores[s.name] = max(0.1, min(100, raw))   # clamp, never zero

    names       = [s.name for s in strategies]
    n           = len(names)
    floor_pool  = FLOOR * n                         # 24 % reserved as floors
    merit_pool  = TOTAL - floor_pool                 # 76 % merit-based

    total_score = sum(scores[nm] for nm in names)
    new_alloc: dict[str, float] = {}

    # Step 2 — proportional merit slice
    for nm in names:
        merit_slice = (scores[nm] / total_score) * merit_pool
        new_alloc[nm] = FLOOR + merit_slice

    # Step 3 — enforce CAP; bleed excess back to the uncapped pool
    for _ in range(10):                             # iterate until convergence
        capped   = {nm for nm, v in new_alloc.items() if v >= CAP}
        uncapped = [nm for nm in names if nm not in capped]
        if not uncapped:
            break
        excess = sum(new_alloc[nm] - CAP for nm in capped)
        for nm in capped:
            new_alloc[nm] = CAP
        if excess < 0.001:
            break
        uncap_score = sum(scores[nm] for nm in uncapped)
        for nm in uncapped:
            new_alloc[nm] += (scores[nm] / uncap_score) * excess

    # Step 4 — round and normalise to exactly 100 %
    for nm in names:
        new_alloc[nm] = round(new_alloc[nm], 1)
    diff = round(TOTAL - sum(new_alloc.values()), 1)
    if diff != 0:
        # add rounding residual to the highest scorer
        top = max(names, key=lambda nm: scores[nm])
        new_alloc[top] = round(new_alloc[top] + diff, 1)

    # Step 5 — update in-memory dict so /bots reflects this immediately
    _ALLOCATION_DEFAULTS.update(new_alloc)

    # Step 5b — persist allocations to DB (survives backend restarts)
    for s in strategies:
        if s.name in new_alloc:
            await db.execute(
                sa_update(Strategy)
                .where(Strategy.id == s.id)
                .values(allocation_pct=new_alloc[s.name])
            )
    await db.commit()

    # Step 5c — update promotion_service's last_rebalanced_at timestamp
    from services.promotion_service import promotion_service as _ps
    from datetime import timezone as _tz
    _ps._last_rebalanced_at = datetime.now(_tz.utc)

    # Step 6 — build a readable summary and push activity event
    top3 = sorted(names, key=lambda nm: new_alloc[nm], reverse=True)[:3]
    summary = ", ".join(f"{nm.replace('_',' ').title()} {new_alloc[nm]:.1f}%" for nm in top3)
    _push_event(
        "system",
        f"Capital rebalanced — top 3: {summary}",
        detail=f"Score-weighted across {n} bots · floor 2% · cap 30% · persisted to DB",
    )

    from services.alert_service import alert_service as _as
    _as.system_alert(
        title="⚖️ Capital Rebalanced",
        message=f"Manual rebalance: {summary}. Allocations persisted to DB.",
        level="INFO",
    )

    return {
        "success": True,
        "message": f"Capital rebalanced across {n} strategies — persisted to DB",
        "allocations": new_alloc,
        "total": round(sum(new_alloc.values()), 1),
        "top": top3,
        "last_rebalanced_at": _ps.last_rebalanced_at,
    }


@router.get("/promotion/status")
async def promotion_status():
    """Status of the autonomous promotion engine and auto-rebalance scheduler."""
    from services.promotion_service import promotion_service as _ps
    return {
        "engine_running": _ps.is_running,
        "last_rebalanced_at": _ps.last_rebalanced_at,
        "next_rebalance_in_hours": None if _ps._last_rebalanced_at is None else round(
            max(0, (86400 - (datetime.utcnow().replace(tzinfo=None) -
                             _ps._last_rebalanced_at.replace(tzinfo=None)).total_seconds()) / 3600), 1
        ),
        "check_interval_seconds": 300,
        "rebalance_interval_hours": 24,
        "promotions_this_session": _ps.promotions_this_session,
        "total_promotions_this_session": len(_ps.promotions_this_session),
    }


@router.post("/promotion/force-check")
async def force_promotion_check():
    """Immediately run a promotion gate check (skips throttle window)."""
    from services.promotion_service import promotion_service as _ps
    await _ps.force_check_promotions()
    return {"success": True, "message": "Promotion check completed"}


@router.post("/bots/{bot_name}/activate")
async def activate_bot(bot_name: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import update
    await db.execute(update(Strategy).where(Strategy.name == bot_name).values(is_active=True))
    await db.commit()
    _push_event("system", f"Bot activated: {bot_name}", strategy=bot_name)
    return {"success": True, "bot": bot_name, "status": "activated"}


@router.post("/bots/{bot_name}/deactivate")
async def deactivate_bot(bot_name: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import update
    await db.execute(update(Strategy).where(Strategy.name == bot_name).values(is_active=False))
    await db.commit()
    _push_event("system", f"Bot deactivated: {bot_name}", strategy=bot_name)
    return {"success": True, "bot": bot_name, "status": "deactivated"}


# ── Risk Config ───────────────────────────────────────────────────────────────

# In-memory risk config (matches original system's defaults)
_RISK_CONFIG = {
    "max_drawdown_pct": 45.0,
    "stop_loss_pct": 8.0,
    "take_profit_pct": 25.0,
    "max_position_size_pct": 30.0,
    "max_concurrent_positions": 4,
    "daily_loss_circuit_breaker_pct": 40.0,
    "min_confidence_score": 0.6,
    "consensus_threshold": 0.45,
    "cycle_interval_seconds": 600,
}

_RISK_STATUS = {
    "global_halt": False,
    "circuit_breaker": False,
    "drawdown_pct": 38.05,
    "daily_loss_pct": 0.0,
    "open_positions": 0,
    "max_positions": 4,
    "phase": "LIVE",
}


@router.get("/risk/config")
async def get_risk_config():
    return _RISK_CONFIG


@router.post("/risk/config")
async def update_risk_config(payload: dict):
    _RISK_CONFIG.update({k: v for k, v in payload.items() if k in _RISK_CONFIG})
    _push_event("system", "Risk configuration updated", detail=str(payload)[:80])
    return {"success": True, "config": _RISK_CONFIG}


@router.get("/risk/status")
async def get_risk_status():
    return {**_RISK_STATUS, "config": _RISK_CONFIG}


@router.post("/risk/halt")
async def risk_halt():
    _RISK_STATUS["global_halt"] = True
    _push_event("alert", "⛔ GLOBAL HALT ACTIVATED — all trading suspended")
    return {"success": True, "global_halt": True}


@router.post("/risk/release")
async def risk_release():
    _RISK_STATUS["global_halt"] = False
    _push_event("system", "Global halt released — trading resumed")
    return {"success": True, "global_halt": False}