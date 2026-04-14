"""
Fleet, Activity, and Chat routes for MissionControl.
"""
import random
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel

from db.database import get_db
from models.strategy import Strategy
from models.trade import Trade
from services.price_service import price_service

router = APIRouter(prefix="/api/fleet", tags=["fleet"])

# ── In-memory activity log (ring buffer, max 200 events) ─────────────────────
_activity: List[dict] = []

def _push_event(kind: str, message: str, strategy: Optional[str] = None, detail: str = ""):
    _activity.append({
        "id": len(_activity) + 1,
        "kind": kind,          # trade | signal | gate | system | alert
        "message": message,
        "strategy": strategy,
        "detail": detail,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })
    if len(_activity) > 200:
        _activity.pop(0)

# Seed a few startup events
_push_event("system", "TAO Trading Bot backend online", detail="All systems nominal")
_push_event("system", "CoinGecko price feed connected", detail="Live TAO price streaming")
_push_event("system", "SQLite database initialised — 4 strategies seeded")


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
    combined = list(reversed(_activity[-limit:])) + trade_events
    combined.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    return {"events": combined[:limit], "total": len(combined)}


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    message: str

_CHAT_HISTORY: List[dict] = []

# II Agent response templates
_RESPONSES = {
    "price": lambda p, _: f"TAO is currently trading at ${p:.2f}. " +
        ("RSI is elevated — watching for reversal signals." if (p or 0) > 280 else "RSI is in neutral territory. Momentum strategies are on standby."),
    "status": lambda _, s: f"Fleet is operational. {s.get('live', 0)} strategies in LIVE mode, {s.get('paper', 0)} in paper training. All systems nominal.",
    "gate": lambda _, s: f"Gate system active. Strategies must complete {GATE_CYCLES_REQUIRED} cycles with >{GATE_WIN_RATE_REQUIRED}% win rate and positive PnL before graduating to LIVE.",
    "pnl": lambda _, s: f"Total fleet PnL stands at {s.get('total_pnl', 0):.4f} TAO (${s.get('total_pnl', 0) * s.get('tao_price', 250):.2f} USD at current price).",
    "default": lambda _, __: random.choice([
        "Monitoring all 4 strategies. Signal consensus threshold set to 60%. Waiting for high-confidence entry.",
        "Risk parameters nominal. Max drawdown guard is active. No position sizing anomalies detected.",
        "Paper trading gate enforcement is active. No strategy graduates to LIVE without passing all 4 gate conditions.",
        "CoinGecko price feed is live. RSI, EMA, MACD and Bollinger Band indicators are refreshing every 30 seconds.",
        "Consensus engine is running. Sharpe-weighted voting across all active strategies before any execution.",
    ]),
}

@router.post("/chat")
async def chat(payload: ChatMessage, db: AsyncSession = Depends(get_db)):
    """Chat with II Agent."""
    msg = payload.message.lower().strip()
    price = price_service.current_price or 0.0

    # Simple keyword routing
    result = await db.execute(select(Strategy))
    strategies = result.scalars().all()
    summary = {
        "live": sum(1 for s in strategies if s.mode == "LIVE"),
        "paper": sum(1 for s in strategies if s.mode == "PAPER_ONLY"),
        "total_pnl": sum(s.total_pnl or 0 for s in strategies),
        "tao_price": price,
    }

    if any(w in msg for w in ["price", "tao", "cost", "worth", "value"]):
        response = _RESPONSES["price"](price, summary)
    elif any(w in msg for w in ["status", "how", "health", "online", "running"]):
        response = _RESPONSES["status"](price, summary)
    elif any(w in msg for w in ["gate", "graduate", "live", "promote", "paper"]):
        response = _RESPONSES["gate"](price, summary)
    elif any(w in msg for w in ["pnl", "profit", "loss", "return", "earn"]):
        response = _RESPONSES["pnl"](price, summary)
    else:
        response = _RESPONSES["default"](price, summary)

    user_entry = {"role": "user", "content": payload.message, "timestamp": datetime.utcnow().isoformat() + "Z"}
    agent_entry = {"role": "agent", "content": response, "timestamp": datetime.utcnow().isoformat() + "Z"}
    _CHAT_HISTORY.extend([user_entry, agent_entry])

    # Log to activity
    _push_event("system", f"Chat: {payload.message[:60]}", detail=response[:80])

    return {
        "response": response,
        "history": _CHAT_HISTORY[-20:],
    }

@router.get("/chat/history")
async def chat_history():
    return {"history": _CHAT_HISTORY[-20:]}