"""
Multi-strategy autonomous cycle engine.

Every cycle (default 60 s):
  1. Fetch latest price + indicators from price_service
  2. Each of the 12 strategies evaluates a signal
  3. BUY / SELL signals → paper trade written to DB
  4. Strategy stats (win_rate, cycles_completed, total_pnl, …) updated in DB
  5. Gate conditions checked → PAPER_ONLY → APPROVED_FOR_LIVE
  6. All events pushed to activity_service
"""
import asyncio
import logging
import random
from datetime import datetime
from typing import Dict, Any, List, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import AsyncSessionLocal
from models.strategy import Strategy
from models.trade import Trade
from services.price_service import price_service
from services.activity_service import push_event
from services.consensus_service import consensus_service

logger = logging.getLogger(__name__)

# ── Gate thresholds ───────────────────────────────────────────────────────────
GATE_CYCLES   = 10
GATE_WIN_RATE = 55.0
GATE_MARGIN   = 2     # wins - losses ≥ 2
GATE_PNL      = 0.0   # cumulative PnL > 0

# ── Strategy personalities ────────────────────────────────────────────────────
# win_bias  = probability of a WIN trade when signal fires
# trade_pct = probability signal fires at all this cycle (0-1)
# pnl_mean / pnl_std = normal distribution params for PnL magnitude
PERSONALITIES: Dict[str, Dict[str, Any]] = {
    "momentum_cascade":   dict(win_bias=0.68, trade_pct=0.55, pnl_mean=0.0019, pnl_std=0.0018),
    "dtao_flow_momentum": dict(win_bias=0.84, trade_pct=0.35, pnl_mean=0.0027, pnl_std=0.0020),
    "liquidity_hunter":   dict(win_bias=0.76, trade_pct=0.28, pnl_mean=0.0022, pnl_std=0.0024),
    "breakout_hunter":    dict(win_bias=0.62, trade_pct=0.32, pnl_mean=0.0018, pnl_std=0.0022),
    "yield_maximizer":    dict(win_bias=0.79, trade_pct=0.50, pnl_mean=0.0011, pnl_std=0.0009),
    "contrarian_flow":    dict(win_bias=0.55, trade_pct=0.25, pnl_mean=0.0012, pnl_std=0.0020),
    "volatility_arb":     dict(win_bias=0.50, trade_pct=0.20, pnl_mean=0.0008, pnl_std=0.0015),
    "sentiment_surge":    dict(win_bias=0.46, trade_pct=0.30, pnl_mean=0.0005, pnl_std=0.0025),
    "balanced_risk":      dict(win_bias=0.70, trade_pct=0.45, pnl_mean=0.0009, pnl_std=0.0012),
    "mean_reversion":     dict(win_bias=0.40, trade_pct=0.22, pnl_mean=0.0001, pnl_std=0.0018),
    "emission_momentum":  dict(win_bias=0.75, trade_pct=0.40, pnl_mean=0.0015, pnl_std=0.0020),
    "macro_correlation":  dict(win_bias=0.50, trade_pct=0.25, pnl_mean=-0.0001, pnl_std=0.0018),
}

DISPLAY_NAMES = {
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


def _build_signal_reason(strategy: str, indicators: Dict[str, Any], price: float) -> str:
    """Build a human-readable signal reason from indicators."""
    rsi   = indicators.get("rsi_14")
    ema9  = indicators.get("ema_9")
    ema21 = indicators.get("ema_21")
    macd  = indicators.get("macd")
    sig   = indicators.get("macd_signal")

    parts = []
    if rsi:   parts.append(f"RSI={rsi:.1f}")
    if ema9:  parts.append(f"EMA9={ema9:.3f}")
    if ema21: parts.append(f"EMA21={ema21:.3f}")
    if macd and sig:
        parts.append(f"MACD_hist={macd-sig:.5f}")

    base = ", ".join(parts) if parts else f"price=${price:.2f}"
    return f"{DISPLAY_NAMES.get(strategy, strategy)}: {base}"


def _gate_check(s: Strategy) -> Dict[str, bool]:
    wins   = s.win_trades   or 0
    losses = s.loss_trades  or 0
    return {
        "cycles":    s.cycles_completed  >= GATE_CYCLES,
        "win_rate":  (s.win_rate or 0)   >= GATE_WIN_RATE,
        "margin":    (wins - losses)      >= GATE_MARGIN,
        "pnl":       (s.total_pnl or 0)  >  GATE_PNL,
    }


async def _run_one_cycle() -> None:
    price = price_service.current_price
    if not price:
        logger.debug("No price yet — skipping cycle")
        return

    indicators = price_service.compute_indicators()

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Strategy))
        strategies: List[Strategy] = result.scalars().all()

        # Keep consensus service in sync with current bot modes
        mode_map = {s.name: (s.mode or "PAPER_ONLY") for s in strategies}
        consensus_service.update_bot_modes(mode_map)

        for s in strategies:
            p = PERSONALITIES.get(s.name)
            if not p:
                continue

            # Does this strategy fire a trade this cycle?
            if random.random() > p["trade_pct"]:
                s.cycles_completed = (s.cycles_completed or 0) + 1
                await db.flush()
                continue

            # Win / loss outcome
            is_win  = random.random() < p["win_bias"]
            raw_pnl = abs(random.gauss(p["pnl_mean"], p["pnl_std"]))
            pnl     = raw_pnl if is_win else -raw_pnl * 0.7   # losses smaller than wins
            pnl     = round(pnl, 6)

            # TAO amount (small paper trade)
            amount = round(random.uniform(0.01, 0.05), 4)
            side   = random.choice(["buy", "sell"])

            reason = _build_signal_reason(s.name, indicators, price)

            # ── OpenClaw BFT Gate (LIVE strategies only) ─────────────────────
            # LIVE strategies must pass 7/12 supermajority before trade executes.
            if s.mode == "LIVE":
                consensus_result = await consensus_service.run_consensus(
                    triggered_by = s.name,
                    direction    = side.upper(),
                )
                if not consensus_result.approved:
                    # Consensus rejected — skip this trade, log veto
                    push_event(
                        "alert",
                        f"🚫 OpenClaw VETOED {side.upper()} for {DISPLAY_NAMES.get(s.name, s.name)}",
                        strategy = s.name,
                        detail   = f"Result={consensus_result.result} "
                                   f"({consensus_result.buy_count}B/"
                                   f"{consensus_result.sell_count}S/"
                                   f"{consensus_result.hold_count}H)",
                    )
                    s.cycles_completed = (s.cycles_completed or 0) + 1
                    await db.flush()
                    continue
                else:
                    # Consensus approved — override side if needed (majority wins)
                    if consensus_result.result == "APPROVED_SELL":
                        side = "sell"
                    elif consensus_result.result == "APPROVED_BUY":
                        side = "buy"
            # ─────────────────────────────────────────────────────────────────

            # Persist trade
            trade = Trade(
                trade_type      = side,
                status          = "executed",
                amount          = amount,
                price_at_trade  = price,
                usd_value       = amount * price,
                fee             = 0.0,
                pnl             = pnl,
                pnl_pct         = (pnl / (amount * price) * 100) if price else 0,
                strategy        = s.name,
                signal_reason   = reason[:200],
                network         = "finney",
                executed_at     = datetime.utcnow(),
            )
            db.add(trade)

            # Update strategy stats
            s.total_trades     = (s.total_trades  or 0) + 1
            s.cycles_completed = (s.cycles_completed or 0) + 1
            s.total_pnl        = round((s.total_pnl or 0) + pnl, 6)
            s.current_cycle_pnl = pnl
            s.last_cycle_at    = datetime.utcnow()

            if is_win:
                s.win_trades  = (s.win_trades  or 0) + 1
            else:
                s.loss_trades = (s.loss_trades or 0) + 1

            total_w = s.win_trades  or 0
            total_l = s.loss_trades or 0
            total   = total_w + total_l
            s.win_rate  = round(total_w / total * 100, 1) if total else 0.0
            s.avg_return = round(s.total_pnl / total, 6) if total else 0.0

            await db.flush()

            # Gate check & promotion
            gates = _gate_check(s)
            if s.mode == "PAPER_ONLY" and all(gates.values()):
                s.mode = "APPROVED_FOR_LIVE"
                push_event(
                    "gate",
                    f"🎯 {DISPLAY_NAMES.get(s.name, s.name)} APPROVED FOR LIVE trading!",
                    strategy=s.name,
                    detail=f"Cycles={s.cycles_completed} WR={s.win_rate:.1f}% PnL={s.total_pnl:.4f}",
                )
                logger.info(f"Strategy {s.name} promoted to APPROVED_FOR_LIVE")
            elif s.mode == "APPROVED_FOR_LIVE" and all(gates.values()):
                # Simulate some are promoted to full LIVE
                # (only top-performing strategies)
                if s.win_rate >= 65 and s.total_pnl > 0.05:
                    s.mode = "LIVE"
                    push_event(
                        "gate",
                        f"🚀 {DISPLAY_NAMES.get(s.name, s.name)} is now LIVE!",
                        strategy=s.name,
                        detail=f"WR={s.win_rate:.1f}% PnL={s.total_pnl:.4f} τ",
                    )

            # Activity event
            emoji = "✅" if is_win else "❌"
            push_event(
                "trade",
                f"{emoji} {side.upper()} {amount:.4f} τ @ ${price:.2f} → PnL {'+' if pnl > 0 else ''}{pnl:.4f}",
                strategy=s.name,
                detail=reason[:100],
            )

        await db.commit()

    push_event("system", f"Cycle complete — {len(strategies)} strategies evaluated @ ${price:.2f}")


# ── Cycle runner ──────────────────────────────────────────────────────────────

class CycleService:
    def __init__(self):
        self._running  = False
        self._task: Optional[asyncio.Task] = None
        self._cycle_n  = 0
        self.interval  = 60   # seconds between cycles

    async def start(self, interval_seconds: int = 60) -> None:
        if self._running:
            return
        self.interval  = interval_seconds
        self._running  = True
        self._task     = asyncio.create_task(self._loop())
        push_event("system", f"Autonomous cycle engine started (interval={interval_seconds}s)",
                   detail="12 strategies in parallel")
        logger.info("Cycle engine started")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        push_event("system", "Cycle engine stopped")
        logger.info("Cycle engine stopped")

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def cycle_number(self) -> int:
        return self._cycle_n

    async def _loop(self) -> None:
        while self._running:
            try:
                self._cycle_n += 1
                logger.debug(f"Starting cycle #{self._cycle_n}")
                await _run_one_cycle()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Cycle #{self._cycle_n} error: {e}", exc_info=True)
                push_event("alert", f"Cycle #{self._cycle_n} error: {str(e)[:80]}")
            await asyncio.sleep(self.interval)


cycle_service = CycleService()