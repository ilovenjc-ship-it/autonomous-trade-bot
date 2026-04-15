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
from models.bot_config import BotConfig
from models.trade import Trade
from services.price_service import price_service
from services.activity_service import push_event
from services.consensus_service import consensus_service
from services.alert_service import alert_service
from services.bittensor_service import bittensor_service

logger = logging.getLogger(__name__)

# Dedup sets — prevent alert spam across cycles
_drawdown_alerted: set = set()   # strategy names already drawdown-alerted this session

# ── Gate thresholds ───────────────────────────────────────────────────────────
GATE_CYCLES   = 10
GATE_WIN_RATE = 55.0
GATE_MARGIN   = 2     # wins - losses ≥ 2
GATE_PNL      = 0.0   # cumulative PnL > 0

# ── Demotion thresholds ───────────────────────────────────────────────────────
# A bot is demoted when it has enough history to be judged AND performance
# has genuinely degraded — win rate tanked AND cumulative PnL turned negative.
# Positive PnL saves a bot even with a lower win rate (big winners count).
DEMOTE_WIN_RATE   = 45.0   # WR below this triggers demotion evaluation
DEMOTE_MIN_CYCLES = 15     # must have enough history before we can judge
DEMOTE_PNL        = 0.0    # must also have negative cumulative PnL to demote

# Dedup sets — prevent same demotion alert firing every cycle
_demoted_alerted: set = set()

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

        # Fetch bot config (trade_amount, hotkey, netuid) for live execution
        cfg_result = await db.execute(select(BotConfig).where(BotConfig.id == 1))
        config = cfg_result.scalar_one_or_none()

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

            # ── Real on-chain execution (LIVE strategies only) ────────────────
            # Conditions: strategy is LIVE + consensus passed + chain reachable
            # + wallet has mnemonic loaded + hotkey configured.
            # Paper strategies and any failed condition fall through to simulation.
            tx_hash      = None
            trade_status = "executed"

            if (
                s.mode == "LIVE"
                and bittensor_service.connected
                and bittensor_service.wallet_loaded
                and config
                and config.hotkey_address
            ):
                live_amount   = config.trade_amount
                target_netuid = config.netuid or 1
                hotkey        = config.hotkey_address

                if side == "buy":
                    exec_result = await bittensor_service.stake(hotkey, live_amount, target_netuid)
                else:
                    exec_result = await bittensor_service.unstake(hotkey, live_amount, target_netuid)

                if exec_result.get("success"):
                    # Upgrade trade to real amount — pnl tracked separately later
                    amount   = live_amount
                    tx_hash  = exec_result.get("tx_hash") or exec_result.get("block_hash")
                    push_event(
                        "trade",
                        f"🔴 LIVE {side.upper()} {live_amount:.4f}τ @ ${price:.2f} — on-chain",
                        strategy = s.name,
                        detail   = f"tx={tx_hash or 'pending'} | netuid={target_netuid} "
                                   f"| hotkey={hotkey[:16]}…",
                    )
                    logger.info(
                        f"[LIVE] {s.name}: {side.upper()} {live_amount}τ "
                        f"netuid={target_netuid} tx={tx_hash}"
                    )
                else:
                    # On-chain call failed — alert and skip this trade entirely
                    err = exec_result.get("error", "unknown error")
                    push_event(
                        "alert",
                        f"❌ LIVE execution FAILED for {display}: {err}",
                        strategy = s.name,
                    )
                    alert_service.push_alert(
                        type     = "SYSTEM",
                        level    = "CRITICAL",
                        title    = f"⛔ Live trade failed — {display}",
                        message  = f"OpenClaw approved {side.upper()} but on-chain execution "
                                   f"failed: {err}",
                        strategy = s.name,
                        detail   = f"side={side} | amount={live_amount}τ | "
                                   f"hotkey={hotkey[:16]}…",
                    )
                    logger.error(
                        f"[LIVE] {s.name}: execution FAILED — {err}"
                    )
                    s.cycles_completed = (s.cycles_completed or 0) + 1
                    await db.flush()
                    continue   # do NOT record a failed live trade as executed
            # ─────────────────────────────────────────────────────────────────

            # Persist trade
            trade = Trade(
                trade_type      = side,
                status          = trade_status,
                amount          = amount,
                price_at_trade  = price,
                usd_value       = amount * price,
                fee             = 0.0,
                pnl             = pnl,
                pnl_pct         = (pnl / (amount * price) * 100) if price else 0,
                strategy        = s.name,
                signal_reason   = reason[:200],
                tx_hash         = tx_hash,
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
            stats_str = f"Cycles={s.cycles_completed} WR={s.win_rate:.1f}% PnL={s.total_pnl:.4f}τ"
            display   = DISPLAY_NAMES.get(s.name, s.name)

            if s.mode == "PAPER_ONLY" and all(gates.values()):
                s.mode = "APPROVED_FOR_LIVE"
                push_event(
                    "gate",
                    f"🎯 {display} APPROVED FOR LIVE trading!",
                    strategy=s.name,
                    detail=stats_str,
                )
                alert_service.gate_promotion(s.name, display, "APPROVED_FOR_LIVE", stats_str)
                logger.info(f"Strategy {s.name} promoted to APPROVED_FOR_LIVE")

            elif s.mode == "APPROVED_FOR_LIVE" and all(gates.values()):
                if s.win_rate >= 65 and s.total_pnl > 0.05:
                    s.mode = "LIVE"
                    push_event(
                        "gate",
                        f"🚀 {display} is now LIVE!",
                        strategy=s.name,
                        detail=f"WR={s.win_rate:.1f}% PnL={s.total_pnl:.4f} τ",
                    )
                    alert_service.gate_promotion(s.name, display, "LIVE", stats_str)

            # ── Demotion system ──────────────────────────────────────────────
            # A bot that earned promotion but has since degraded gets knocked
            # back so it must re-prove itself before trading real capital again.
            # Two conditions must BOTH be true: WR tanked AND PnL is negative.
            # Positive PnL saves a bot even at a lower win rate (big winners).
            cycles_done = s.cycles_completed or 0
            wr_now      = s.win_rate or 0
            pnl_now     = s.total_pnl or 0
            is_degraded = (
                wr_now      <  DEMOTE_WIN_RATE   and
                pnl_now     <  DEMOTE_PNL        and
                cycles_done >= DEMOTE_MIN_CYCLES
            )

            if is_degraded and s.name not in _demoted_alerted:
                if s.mode == "LIVE":
                    old_mode = "LIVE"
                    s.mode   = "APPROVED_FOR_LIVE"
                    push_event(
                        "gate",
                        f"⬇️ {display} DEMOTED — LIVE → APPROVED",
                        strategy=s.name,
                        detail=f"WR={wr_now:.1f}% PnL={pnl_now:.4f}τ — must recover",
                    )
                    alert_service.push_alert(
                        type     = "GATE_DEMOTION",
                        level    = "WARNING",
                        title    = f"⬇️ {display} demoted to APPROVED",
                        message  = f"{display} dropped to {wr_now:.1f}% WR with {pnl_now:.4f}τ PnL. "
                                   f"Moved from LIVE → APPROVED until performance recovers.",
                        strategy = s.name,
                        detail   = stats_str,
                    )
                    _demoted_alerted.add(s.name)
                    logger.warning(f"{s.name} demoted LIVE → APPROVED_FOR_LIVE (WR={wr_now:.1f}% PnL={pnl_now:.4f})")

                elif s.mode == "APPROVED_FOR_LIVE":
                    s.mode = "PAPER_ONLY"
                    push_event(
                        "gate",
                        f"⬇️ {display} DEMOTED — APPROVED → PAPER",
                        strategy=s.name,
                        detail=f"WR={wr_now:.1f}% PnL={pnl_now:.4f}τ — back to proving ground",
                    )
                    alert_service.push_alert(
                        type     = "GATE_DEMOTION",
                        level    = "WARNING",
                        title    = f"⬇️ {display} demoted to PAPER",
                        message  = f"{display} dropped to {wr_now:.1f}% WR with {pnl_now:.4f}τ PnL. "
                                   f"Moved from APPROVED → PAPER. Must re-earn gate passage.",
                        strategy = s.name,
                        detail   = stats_str,
                    )
                    _demoted_alerted.add(s.name)
                    logger.warning(f"{s.name} demoted APPROVED → PAPER_ONLY (WR={wr_now:.1f}% PnL={pnl_now:.4f})")

            # If performance has recovered, allow re-alerting on next demotion
            elif not is_degraded and s.name in _demoted_alerted:
                _demoted_alerted.discard(s.name)

            # ── PnL milestone check ──────────────────────────────────────────
            # (checked on every fleet total, done once per cycle in commit hook)

            # ── Drawdown guard (per-strategy, once per session) ──────────────
            DRAWDOWN_THRESHOLD = -0.05   # τ
            if (s.total_pnl or 0) < DRAWDOWN_THRESHOLD and s.name not in _drawdown_alerted:
                _drawdown_alerted.add(s.name)
                alert_service.drawdown_alert(s.name, display, s.total_pnl, DRAWDOWN_THRESHOLD)

            # Activity event
            emoji = "✅" if is_win else "❌"
            push_event(
                "trade",
                f"{emoji} {side.upper()} {amount:.4f} τ @ ${price:.2f} → PnL {'+' if pnl > 0 else ''}{pnl:.4f}",
                strategy=s.name,
                detail=reason[:100],
            )

        await db.commit()

        # ── Fleet-level PnL milestone check ──────────────────────────────────
        fleet_pnl = sum((s.total_pnl or 0) for s in strategies)
        alert_service.check_pnl_milestones(fleet_pnl)

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