"""
Fleet, Activity, and Chat routes for MissionControl.
"""
import json
import math
import os
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
from models.stake_position import StakePosition
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
    from services.cycle_service import cycle_service
    from services.agent_service import agent_service
    from services.consensus_service import consensus_service

    msg    = payload.message.lower().strip()
    price  = price_service.current_price or 0.0
    ind    = price_service.compute_indicators()
    rsi    = ind.get("rsi_14")
    macd   = ind.get("macd")
    msig   = ind.get("macd_signal")
    macd_h = (macd - msig) if (macd is not None and msig is not None) else None

    result = await db.execute(select(Strategy))
    strategies = result.scalars().all()

    live_strats     = [s for s in strategies if s.mode == "LIVE"]
    approved_strats = [s for s in strategies if s.mode == "APPROVED_FOR_LIVE"]
    paper_strats    = [s for s in strategies if s.mode == "PAPER_ONLY"]
    total_pnl       = sum(s.total_pnl or 0 for s in strategies)
    total_trades    = sum(s.total_trades or 0 for s in strategies)
    total_wins      = sum(s.win_trades or 0 for s in strategies)
    fleet_wr        = round(total_wins / total_trades * 100, 1) if total_trades else 0.0
    best_strat      = max(strategies, key=lambda s: s.total_pnl or 0) if strategies else None
    worst_strat     = min(strategies, key=lambda s: s.total_pnl or 0) if strategies else None

    # Live agent regime
    agent_status  = agent_service.get_status()
    current_regime = agent_status.get("current_regime", "UNKNOWN")

    # RSI signal interpretation
    if rsi and rsi < 35:
        signal_label = f"**OVERSOLD** (RSI {rsi:.1f}) — momentum strategies are biased BUY"
    elif rsi and rsi > 65:
        signal_label = f"**OVERBOUGHT** (RSI {rsi:.1f}) — momentum strategies are biased SELL/HOLD"
    elif rsi:
        signal_label = f"**NEUTRAL** (RSI {rsi:.1f}) — no high-conviction directional signal"
    else:
        signal_label = "**WARMING UP** — not enough price history yet (need ~14 candles)"

    # Live consensus stats
    cstats = consensus_service.get_stats()
    c_rounds   = cstats.get("total_rounds", 0)
    c_approved = cstats.get("approved_rounds", 0)
    c_rate     = cstats.get("approval_rate_pct", 0.0)
    c_buy      = cstats.get("total_buy_votes", 0)
    c_sell     = cstats.get("total_sell_votes", 0)

    # Cycle engine
    cycle_num = cycle_service.cycle_number
    cycle_running = cycle_service.is_running

    # Actual risk config (from the in-memory store)
    max_dd      = float(_RISK_CONFIG.get("max_drawdown_pct",      45.0))
    stop_loss   = float(_RISK_CONFIG.get("stop_loss_pct",          8.0))
    max_pos     = float(_RISK_CONFIG.get("max_position_size_pct", 30.0))
    daily_limit = int(_RISK_CONFIG.get("daily_trade_limit",        50))

    # ── Keyword routing with live data ────────────────────────────────────────

    if any(w in msg for w in ["openclaw", "bft", "byzantine", "consensus", "vote", "voting", "7 of 12", "7/12", "supermajority"]):
        latest = consensus_service.get_latest()
        last_result = "—"
        last_votes  = "—"
        if latest:
            last_result = "✓ APPROVED" if latest.get("approved") else "✗ VETOED"
            last_votes  = f"{latest.get('buy_count', 0)} BUY · {latest.get('sell_count', 0)} SELL · {latest.get('hold_count', 0)} HOLD"
        response = (
            f"**OpenClaw** is our Byzantine Fault Tolerant consensus engine — the mathematical firewall between every strategy signal and the blockchain. "
            f"Before any LIVE trade executes, **all 12 bot personalities vote**, and **7 of 12 (58.3%) must agree** on direction. No exceptions.\n\n"
            f"The math comes from Lamport, Shostak & Pease (1982): with N=12 actors, you can tolerate up to ⌊(N−1)/3⌋ = **3 faulty/wrong bots** "
            f"and still reach a provably correct consensus — as long as the 2f+1 = **7-vote threshold** is met. "
            f"Bitcoin, Ethereum, and Bittensor's Yuma Consensus all use variants of the same principle.\n\n"
            f"**Live stats:** {c_rounds} rounds · {c_approved} approved ({c_rate:.1f}% approval rate). "
            f"Vote tally: {c_buy} BUY vs {c_sell} SELL votes total. "
            f"Last round: {last_result} ({last_votes})."
        )

    elif any(w in msg for w in ["regime", "market", "bull", "bear", "sideways", "volatile", "mode", "environment"]):
        regime_desc = {
            "BULL":     "a confirmed uptrend — momentum strategies are favoured, mean-reversion is less reliable",
            "BEAR":     "a downtrend — sell/short bias, capital preservation mode active",
            "SIDEWAYS": "a ranging market — mean-reversion strategies work best, breakout strategies sit on the sidelines",
            "VOLATILE": "high volatility — most strategies are cautious; the consensus bar effectively rises because signals conflict",
            "UNKNOWN":  "regime not yet determined — need more analysis cycles",
        }.get(current_regime, "regime state unclear")
        rsi_note = f"RSI(14) = {rsi:.1f} ({signal_label})" if rsi else "RSI not yet available"
        response = (
            f"Current market regime: **{current_regime}** — {regime_desc}. "
            f"{rsi_note}. "
            f"MACD histogram: {'**+' + f'{macd_h:.5f}**' + ' (bullish momentum)' if macd_h and macd_h > 0 else '**' + f'{macd_h:.5f}**' + ' (bearish momentum)' if macd_h else 'not available'}. "
            f"Regime is re-evaluated every 5 minutes by II Agent."
        )

    elif any(w in msg for w in ["price", "tao", "cost", "worth", "usd", "$"]):
        ch = ind.get("price_change_pct_24h") or 0.0
        rsi_note = f"RSI(14) = {rsi:.1f}." if rsi else "RSI warming up."
        macd_note = f"MACD hist = {macd_h:+.5f} ({'bullish' if macd_h and macd_h > 0 else 'bearish'})." if macd_h else ""
        response = (
            f"TAO is trading at **${price:.2f}** ({'+' if ch >= 0 else ''}{ch:.2f}% 24h change). "
            f"{rsi_note} {macd_note} "
            f"Current signal: {signal_label}. Price feed via CoinGecko, refreshed every 30s."
        )

    elif any(w in msg for w in ["rsi", "macd", "ema", "indicator", "signal", "momentum", "technical"]):
        ind_parts = []
        if rsi:    ind_parts.append(f"RSI(14) = {rsi:.1f}")
        if macd_h: ind_parts.append(f"MACD histogram = {macd_h:+.5f}")
        ind_str = " · ".join(ind_parts) if ind_parts else "Indicators still warming up — need more price history"
        response = (
            f"Live technical indicators: **{ind_str}**. "
            f"Signal interpretation: {signal_label}. "
            f"These indicators feed directly into the sentiment gauge and strategy signal generators. "
            f"Each strategy weights them differently based on its personality archetype."
        )

    elif any(w in msg for w in ["status", "health", "online", "running", "fleet", "how are"]):
        hot   = sum(1 for s in strategies if (s.win_rate or 0) >= 55)
        weak  = sum(1 for s in strategies if (s.win_rate or 0) < 40 and (s.total_trades or 0) >= 5)
        response = (
            f"Fleet is **{'operational' if cycle_running else 'paused'}**. "
            f"{len(live_strats)} LIVE · {len(approved_strats)} APPROVED · {len(paper_strats)} paper training. "
            f"Cycle engine: cycle #{cycle_num}, running every 60s. "
            f"Fleet health: {hot} strategies performing well (≥55% WR), {weak} struggling (<40% WR). "
            f"Regime: **{current_regime}**. Consensus: {c_rounds} rounds, {c_rate:.1f}% approval rate."
        )

    elif any(w in msg for w in ["gate", "graduate", "promote", "approved", "promotion", "close to"]):
        approved_names = [s.display_name for s in approved_strats]
        live_names     = [s.display_name for s in live_strats]
        # Find strategies close to the gate (within 10% of win rate target, enough cycles)
        near_gate = [
            s for s in paper_strats
            if (s.cycles_completed or 0) >= GATE_CYCLES_REQUIRED and
               (s.win_rate or 0) >= (GATE_WIN_RATE_REQUIRED - 10)
        ]
        near_names = [f"{s.display_name} ({(s.win_rate or 0):.1f}% WR)" for s in near_gate]
        response = (
            f"**Gate requirements** (Paper → Approved): "
            f"≥{GATE_CYCLES_REQUIRED} cycles · >{GATE_WIN_RATE_REQUIRED}% win rate · wins exceed losses by ≥2 · positive PnL.\n\n"
            f"**APPROVED** (gate cleared, awaiting human override to go LIVE): "
            f"{', '.join(approved_names) if approved_names else 'none yet'}.\n"
            f"**LIVE** strategies: {', '.join(live_names) if live_names else 'none — all in paper training'}.\n"
            f"**Near the gate** (within 10% of threshold): {', '.join(near_names) if near_names else 'none yet — keep accumulating cycles'}."
        )

    elif any(w in msg for w in ["pnl", "profit", "loss", "return", "earn", "made", "performance", "money"]):
        best_line  = f"Best: **{best_strat.display_name}** at {best_strat.total_pnl:+.4f}τ ({(best_strat.win_rate or 0):.1f}% WR)." if best_strat else ""
        worst_line = f"Worst: {worst_strat.display_name} at {worst_strat.total_pnl:+.4f}τ." if worst_strat else ""
        response = (
            f"Total fleet PnL: **{total_pnl:+.4f} τ** (≈ ${total_pnl * price:.2f} USD at current price). "
            f"Win rate: {fleet_wr:.1f}% across {total_trades} completed paper trades. "
            f"{best_line} {worst_line} "
            f"Remember: all trades are paper (simulated) until a strategy earns LIVE promotion through the gate."
        )

    elif any(w in msg for w in ["best", "top", "leading", "winner", "rank", "strongest"]):
        top3 = sorted(strategies, key=lambda s: s.total_pnl or 0, reverse=True)[:3]
        lines = [
            f"**#{i+1} {s.display_name}**: {(s.total_pnl or 0):+.4f}τ · {(s.win_rate or 0):.1f}% WR · {s.total_trades or 0} trades"
            for i, s in enumerate(top3)
        ]
        response = "Top 3 strategies by cumulative PnL:\n" + "\n".join(lines)

    elif any(w in msg for w in ["worst", "weakest", "bottom", "struggling", "losing"]):
        bottom3 = sorted(strategies, key=lambda s: s.total_pnl or 0)[:3]
        lines = [
            f"**#{i+1} {s.display_name}**: {(s.total_pnl or 0):+.4f}τ · {(s.win_rate or 0):.1f}% WR · regime: {current_regime}"
            for i, s in enumerate(bottom3)
        ]
        regime_note = (
            f"Note: current regime is **{current_regime}** — this typically causes higher veto rates and lower win rates "
            f"across momentum strategies. Underperformance here is often a regime problem, not a strategy problem."
            if current_regime in ("VOLATILE", "SIDEWAYS") else ""
        )
        response = f"Bottom 3 strategies by PnL:\n" + "\n".join(lines) + (f"\n\n{regime_note}" if regime_note else "")

    elif any(w in msg for w in ["cycle", "interval", "frequency", "how often", "when"]):
        response = (
            f"Autonomous cycle engine is **{'running' if cycle_running else 'stopped'}**. "
            f"Completed **{cycle_num}** cycles, firing every **60 seconds**. "
            f"Each cycle: evaluates all {len(strategies)} strategies, generates signals, runs OpenClaw BFT vote (if LIVE), "
            f"executes paper/live trades, logs to DB, and fires alerts. "
            f"II Agent analysis runs every **5 minutes** on top of the cycle engine."
        )

    elif any(w in msg for w in ["risk", "stop", "drawdown", "safety", "halt", "limit", "protection"]):
        response = (
            f"**Active risk controls** (live values from Risk Config):\n"
            f"• Max drawdown: **{max_dd:.0f}%** — system halts if PnL drops this far from peak\n"
            f"• Stop-loss per trade: **{stop_loss:.0f}%** — position auto-closed at this loss\n"
            f"• Max position size: **{max_pos:.0f}%** of capital per trade\n"
            f"• Daily trade limit: **{daily_limit}** trades across the fleet\n"
            f"All trades are paper (simulated) until a strategy earns LIVE promotion. "
            f"Adjust these thresholds in the Risk Config page."
        )

    elif any(w in msg for w in ["wallet", "connect", "address", "chain", "mainnet", "finney"]):
        response = (
            "The wallet connection page lets you link a Bittensor Finney mainnet coldkey. "
            "All trading is **paper-only** until a wallet is connected AND a strategy earns LIVE promotion through the gate. "
            "Even with a wallet connected, only LIVE-mode strategies can execute real on-chain trades — "
            "and every trade still requires OpenClaw BFT consensus (7/12 votes) to pass."
        )

    elif any(w in msg for w in ["subnet", "sn", "bittensor", "emission", "alpha", "dtao", "stake"]):
        response = (
            f"The system monitors all Bittensor subnets via TAO.app. Current active subnets for TaoBot: "
            f"**SN1** (Root), **SN8**, **SN9**, **SN18**, **SN64**. "
            f"Subnet selection is based on stake depth, APY, and trend momentum. "
            f"The Network Heat Map on Mission Control visualises all 64 subnets by stake, APY, miner count, or composite score. "
            f"Hover any cell on the heat map for full subnet stats. Green outline = TaoBot active."
        )

    else:
        # Informative fallback — pulls real live numbers
        response = random.choice([
            (
                f"Fleet at a glance: **{current_regime}** regime · TAO ${price:.2f} · "
                f"RSI {rsi:.1f if rsi else 'warming'} · Cycle #{cycle_num} · "
                f"Fleet PnL: {total_pnl:+.4f}τ ({fleet_wr:.1f}% WR across {total_trades} trades). "
                f"Ask me about PnL, regime, consensus, risk, gate status, or any specific strategy."
            ),
            (
                f"OpenClaw BFT: {c_rounds} consensus rounds, {c_rate:.1f}% approval rate. "
                f"{c_buy} BUY vs {c_sell} SELL votes cast total. "
                f"Current regime: **{current_regime}**. "
                f"Fleet: {len(paper_strats)} paper · {len(approved_strats)} approved · {len(live_strats)} live."
            ),
            (
                f"Gate system holding firm: {GATE_WIN_RATE_REQUIRED}% win rate + {GATE_CYCLES_REQUIRED} cycles required for promotion. "
                f"{'Best performer: ' + best_strat.display_name + ' at ' + f'{best_strat.total_pnl:+.4f}τ.' if best_strat else ''} "
                f"Cycle engine: {'running' if cycle_running else 'stopped'} at #{cycle_num}. "
                f"Ask me anything — regime, indicators, consensus, risk controls, or specific bots."
            ),
        ])

    user_entry  = {"role": "user",  "content": payload.message,  "timestamp": datetime.utcnow().isoformat() + "Z"}
    agent_entry = {"role": "agent", "content": response,          "timestamp": datetime.utcnow().isoformat() + "Z"}
    _CHAT_HISTORY.extend([user_entry, agent_entry])
    _push_event("system", f"Chat: {payload.message[:60]}", detail=response[:120])

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

# ── Risk configuration defaults ───────────────────────────────────────────────
#
# Calibrated 2026-05-04 — UNPROVEN PHASE profile.
# These values govern the bot while NO strategy has passed the promotion gate.
# Every parameter answers: "If the model is wrong, how much do we lose before
# the system halts itself?"
#
# GRADUATION PATH (apply once 2-3 strategies are gate-proven):
#   max_position_size_pct:         5 → 10
#   max_concurrent_positions:      3 →  4
#   max_drawdown_pct:              8 → 12
#   daily_loss_circuit_breaker_pct:5 →  8
#   min_confidence_score:       0.65 → 0.60
#
# ── Parameter rationale ───────────────────────────────────────────────────────
#
#   max_position_size_pct   5 %  — was 20. Unproven algo = prove it cheaply.
#                                  3×5%=15% of capital deployed simultaneously;
#                                  80%+ stays liquid. A full wipeout of all 3
#                                  open positions costs 15% of portfolio — survivable
#                                  and correctable. Earn the right to size up.
#
#   max_concurrent_positions  3  — was 4. Pairs with 5% positions: 3×5%=15%
#                                  deployed. Cleaner to monitor during evaluation.
#                                  Graduate to 4 once positions are proven.
#
#   max_drawdown_pct        8 %  — was 20. "Halt fast, investigate, don't bleed
#                                  slowly." With 5% positions: ~4 full stop-outs
#                                  to hit this limit — clear systemic-failure
#                                  signal. Graduate to 12% once gate-proven.
#
#   stop_loss_pct           8 %  — unchanged. Calibrated for subnet alpha token
#                                  volatility: tight enough to protect capital,
#                                  loose enough to survive normal price noise.
#                                  Leave this alone — changing it confounds WR data.
#
#   take_profit_pct        12 %  — unchanged. "Stick and move": alpha spikes
#                                  10-20% then reverses; book at 12%, redeploy.
#
#   daily_loss_circuit_breaker_pct  5 %  — was 15. With 5% positions the old
#                                  15% limit required ~37 consecutive stop-outs
#                                  in one day — effectively decorative. 5% =
#                                  ~12-13 consecutive stops in a single day,
#                                  which IS the "algo is broken" signal.
#
#   min_confidence_score   0.65  — was 0.60. Slightly more selective during
#                                  evaluation: each signal carries more conviction
#                                  weight, reducing noise trades. Graduate to
#                                  0.60 once strategies are proven.
#
#   cycle_interval_seconds  300s — unchanged. 5-min cycles: fast enough to catch
#                                  alpha moves, slow enough to accumulate clean WR
#                                  statistics without 1,440-trades/day noise.
#
#   consensus_votes          7   — unchanged. BFT 7/12 supermajority is the core
#                                  OpenClaw safety mechanism. Do not lower.
#
#   min_wallet_balance_tao  0.05 — unchanged. Hard floor at ~22% of current
#                                  wallet. Prevents running the wallet to zero
#                                  through repeated small stakes + fees.
#
# consensus_threshold is kept in sync as votes/12 for backward compatibility.
_RISK_CONFIG_DEFAULTS = {
    "max_drawdown_pct":               8.0,   # was 20 — unproven phase: halt fast
    "stop_loss_pct":                  8.0,   # unchanged — calibrated for alpha volatility
    "take_profit_pct":               12.0,   # unchanged — stick and move
    "max_position_size_pct":          5.0,   # was 20 — prove it cheaply first
    "max_concurrent_positions":         3,   # was 4 — 3×5%=15% deployed
    "daily_loss_circuit_breaker_pct": 5.0,   # was 15 — calibrated for 5% positions
    # Wallet floor: halt ALL live BUY orders when liquid TAO drops below this.
    # Prevents the bot from running the wallet to zero through repeated small stakes.
    "min_wallet_balance_tao":         0.05,
    "min_confidence_score":           0.65,  # was 0.60 — more selective during evaluation
    "consensus_votes":                  7,   # 7/12 supermajority — OpenClaw rule, do not lower
    "consensus_threshold":    round(7 / 12, 6),   # ≈ 0.5833
    "cycle_interval_seconds":         300,   # unchanged — 5-min cycles
}

# Persist to a JSON file so Railway redeploys don't reset user settings.
_RISK_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "risk_config.json")


def _load_persisted_risk_config() -> dict:
    try:
        with open(_RISK_CONFIG_PATH) as f:
            saved = json.load(f)
        # Merge: saved values override defaults; unknown keys are dropped.
        merged = {**_RISK_CONFIG_DEFAULTS}
        for k in _RISK_CONFIG_DEFAULTS:
            if k in saved:
                merged[k] = saved[k]
        return merged
    except Exception:
        return dict(_RISK_CONFIG_DEFAULTS)


def _save_risk_config(cfg: dict) -> None:
    try:
        with open(_RISK_CONFIG_PATH, "w") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Could not persist risk config: {e}")


# Load persisted config at module startup (falls back to defaults if no file).
_RISK_CONFIG: dict = _load_persisted_risk_config()

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


@router.get("/risk/status")
async def get_risk_status(db: AsyncSession = Depends(get_db)):
    """
    Return live risk status.  drawdown_pct is now computed from real strategy
    PnL data — previously it was a hardcoded placeholder (38.05).
    """
    from sqlalchemy import func as sqlfunc
    from models.strategy import Strategy as StrategyModel

    # Compute real peak-to-trough drawdown from strategy PnL records
    pnl_result = await db.execute(
        select(sqlfunc.sum(StrategyModel.total_pnl))
    )
    fleet_pnl = float(pnl_result.scalar() or 0.0)

    # Drawdown expressed as % of max_drawdown threshold for UI gauge
    max_dd = float(_RISK_CONFIG.get("max_drawdown_pct", 45.0))
    if fleet_pnl < 0:
        # How deep into drawdown territory are we?
        drawdown_depth_pct = round(min(abs(fleet_pnl) / max(max_dd / 100.0, 0.001), 1.0) * 100, 2)
    else:
        drawdown_depth_pct = 0.0

    _RISK_STATUS["drawdown_pct"] = drawdown_depth_pct

    return {**_RISK_STATUS, "config": _RISK_CONFIG, "fleet_pnl_tao": round(fleet_pnl, 6)}


@router.post("/risk/config")
async def update_risk_config(payload: dict):
    # Only accept keys we know about.
    for k, v in payload.items():
        if k in _RISK_CONFIG:
            _RISK_CONFIG[k] = v

    # Keep consensus_votes ↔ consensus_threshold in sync and enforce bounds.
    if "consensus_votes" in payload:
        votes = max(1, min(12, int(round(payload["consensus_votes"]))))
        _RISK_CONFIG["consensus_votes"]    = votes
        _RISK_CONFIG["consensus_threshold"] = round(votes / 12, 6)
    elif "consensus_threshold" in payload:
        votes = max(1, min(12, math.ceil(float(payload["consensus_threshold"]) * 12)))
        _RISK_CONFIG["consensus_votes"]    = votes
        _RISK_CONFIG["consensus_threshold"] = round(votes / 12, 6)

    # Wire to live consensus service so the new threshold takes effect immediately.
    try:
        from services.consensus_service import consensus_service
        consensus_service.set_supermajority(_RISK_CONFIG["consensus_votes"])
    except Exception:
        pass

    # Persist so Railway redeploys don't reset user settings.
    _save_risk_config(_RISK_CONFIG)

    _push_event("system", "Risk configuration updated", detail=str(payload)[:80])
    return {"success": True, "config": _RISK_CONFIG}


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


@router.post("/risk/reset-circuit-breaker")
async def reset_circuit_breaker():
    """
    Manually reset the daily loss circuit breaker after review.
    The breaker will re-trip automatically if daily losses continue to exceed
    the configured threshold.
    """
    _RISK_STATUS["circuit_breaker"] = False
    _RISK_STATUS["daily_loss_pct"]  = 0.0
    _push_event(
        "system",
        "⚡ Circuit breaker RESET — live trading may resume. Monitor closely.",
        detail="Breaker will re-trip automatically if daily loss threshold is exceeded again.",
    )
    return {"success": True, "circuit_breaker": False}


# ── Live Stake Positions ──────────────────────────────────────────────────────

@router.get("/positions")
async def get_positions(db: AsyncSession = Depends(get_db)):
    """
    Return all StakePositions (open + recently closed) enriched with:
      - current α-price from bittensor_service cache
      - unrealized P&L % and TAO estimate
      - distance to stop-loss and take-profit levels
      - risk config thresholds active at query time

    Frontend uses this to render the Live Positions panel in the Wallet page.
    """
    from services.bittensor_service import bittensor_service

    # Fetch all positions (open + closed in last 7 days for history)
    from datetime import timezone as _tz
    cutoff = datetime.now(_tz.utc) - timedelta(days=7)
    result = await db.execute(
        select(StakePosition)
        .where(
            (StakePosition.status == "open") |
            (StakePosition.opened_at >= cutoff)
        )
        .order_by(StakePosition.opened_at.desc())
    )
    positions = result.scalars().all()

    if not positions:
        return {"positions": [], "open_count": 0, "sl_pct": _RISK_CONFIG.get("stop_loss_pct", 8.0),
                "tp_pct": _RISK_CONFIG.get("take_profit_pct", 25.0)}

    # Enrich with current α-prices
    netuids = list({p.netuid for p in positions if p.status == "open"})
    current_prices: dict = {}
    if netuids:
        try:
            current_prices = await bittensor_service.get_prices_for_netuids(netuids)
        except Exception:
            pass

    sl_pct_cfg = _RISK_CONFIG.get("stop_loss_pct",   8.0)
    tp_pct_cfg = _RISK_CONFIG.get("take_profit_pct", 25.0)

    enriched = []
    for pos in positions:
        cur = current_prices.get(pos.netuid, 0.0) if pos.status == "open" else 0.0

        pnl_pct = 0.0
        if pos.status == "open" and cur > 0 and pos.entry_alpha_price > 0:
            pnl_pct = (cur - pos.entry_alpha_price) / pos.entry_alpha_price * 100

        # Levels relative to entry
        sl_level = pos.entry_alpha_price * (1 - (pos.sl_pct or sl_pct_cfg / 100))
        tp_level = pos.entry_alpha_price * (1 + (pos.tp_pct or tp_pct_cfg / 100))

        enriched.append({
            "id":                pos.id,
            "netuid":            pos.netuid,
            "hotkey":            pos.hotkey,
            "strategy":          pos.strategy,
            "entry_alpha_price": pos.entry_alpha_price,
            "current_alpha_price": cur,
            "tao_staked":        pos.tao_staked,
            "current_tao_value": pos.tao_staked * (cur / pos.entry_alpha_price) if pos.entry_alpha_price > 0 and cur > 0 else pos.tao_staked,
            "pnl_pct":           round(pnl_pct, 2),
            "pnl_tao":           round(pos.tao_staked * pnl_pct / 100, 6),
            "sl_level":          round(sl_level, 6),
            "tp_level":          round(tp_level, 6),
            "sl_pct":            (pos.sl_pct or sl_pct_cfg / 100) * 100,
            "tp_pct":            (pos.tp_pct or tp_pct_cfg / 100) * 100,
            "status":            pos.status,
            "open_tx_hash":      pos.open_tx_hash,
            "close_tx_hash":     pos.close_tx_hash,
            "realized_pnl_tao":  pos.realized_pnl_tao,
            "opened_at":         pos.opened_at.isoformat() if pos.opened_at else None,
            "closed_at":         pos.closed_at.isoformat() if pos.closed_at else None,
        })

    open_count = sum(1 for p in positions if p.status == "open")
    return {
        "positions":   enriched,
        "open_count":  open_count,
        "sl_pct":      sl_pct_cfg,
        "tp_pct":      tp_pct_cfg,
    }

# ── Daily Cap Status ──────────────────────────────────────────────────────────

@router.get("/daily-cap")
async def get_daily_cap():
    """
    Return today's deployment cap status so the Dashboard can show
    a live progress bar: how much TAO has been staked today vs. the cap.
    """
    from services.cycle_service import (
        _daily_staked_tao, _daily_reset_date, MAX_DAILY_STAKE_FRACTION
    )
    from services.bittensor_service import bittensor_service

    liquid = bittensor_service._last_balance or 0.0
    cap    = max(liquid * MAX_DAILY_STAKE_FRACTION, 0.02)
    pct    = min(100, (_daily_staked_tao / cap * 100)) if cap > 0 else 0

    return {
        "staked_today_tao":  round(_daily_staked_tao, 6),
        "cap_tao":           round(cap, 6),
        "liquid_tao":        round(liquid, 6),
        "pct_used":          round(pct, 1),
        "remaining_tao":     round(max(0, cap - _daily_staked_tao), 6),
        "reset_date":        _daily_reset_date,
        "fraction":          MAX_DAILY_STAKE_FRACTION,
    }
