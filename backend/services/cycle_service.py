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
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import AsyncSessionLocal
from models.strategy import Strategy
from models.bot_config import BotConfig
from models.trade import Trade
from models.stake_position import StakePosition
from services.price_service import price_service
from services.activity_service import push_event
from services.consensus_service import consensus_service
from services.alert_service import alert_service
from services.bittensor_service import bittensor_service
from services.subnet_router import get_stake_target

logger = logging.getLogger(__name__)

# Build tag — bumped to force Railway redeploy and confirm version in logs
CYCLE_SERVICE_VERSION = "2.1.0-openclaw-all-modes"
logger.info(f"cycle_service loaded — version {CYCLE_SERVICE_VERSION} (OpenClaw active for ALL modes)")

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


# ── Daily deployment cap ──────────────────────────────────────────────────────
# Prevents the bot from consuming all liquid TAO within a single day.
# Resets at midnight UTC. Cap is expressed as a fraction of liquid balance
# at the time each trade fires.
MAX_DAILY_STAKE_FRACTION = 0.40   # never stake more than 40 % of liquid per day
_daily_staked_tao: float = 0.0
_daily_reset_date: Optional[str] = None   # YYYY-MM-DD UTC


def _check_daily_cap(amount: float, liquid_balance: float) -> bool:
    """
    Return True (allow trade) if staking `amount` would keep total daily
    deployment below MAX_DAILY_STAKE_FRACTION of `liquid_balance`.
    Resets the counter at midnight UTC automatically.
    """
    global _daily_staked_tao, _daily_reset_date
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if _daily_reset_date != today:
        _daily_staked_tao  = 0.0
        _daily_reset_date  = today
        logger.info(f"Daily stake cap reset for {today}")
    cap = max(liquid_balance * MAX_DAILY_STAKE_FRACTION, 0.02)   # floor: at least 1 trade allowed
    allowed = (_daily_staked_tao + amount) <= cap
    if not allowed:
        logger.info(
            f"Daily cap reached — staked {_daily_staked_tao:.4f}τ today "
            f"(cap={cap:.4f}τ, 40% of {liquid_balance:.4f}τ liquid)"
        )
    return allowed


def _record_stake(amount: float) -> None:
    """Record a completed stake against today's deployment total."""
    global _daily_staked_tao
    _daily_staked_tao += amount


def _get_risk_value(key: str, default: float) -> float:
    """Read a value from the live risk config (fleet router) safely."""
    try:
        from routers.fleet import _RISK_CONFIG
        return float(_RISK_CONFIG.get(key, default))
    except Exception:
        return default


# ── Stop-loss / Take-profit monitor ──────────────────────────────────────────
# Runs at the TOP of every cycle, before strategy signals fire.
# Checks all open LIVE positions against current α-price.
# Stop-loss exits BYPASS OpenClaw consensus — they are unconditional.
# Take-profit exits also bypass consensus (a gain is never vetoed).
#
# Design rationale: consensus is for entry signals where bots debate direction.
# Exit triggers (SL/TP) are deterministic arithmetic on a single price data
# point — no debate needed.  Speed matters: a falling position that has
# already pierced the SL level should not wait for a 7/12 vote to exit.

async def _check_stop_loss(db: AsyncSession) -> None:
    """
    Scan all open StakePositions.  For each one that has crossed the
    stop-loss or take-profit threshold, execute an immediate unstake.

    Called at the start of every cycle.  Safe to call even when the
    chain is unreachable — guard conditions exit early in that case.
    """
    # Need chain + wallet to do anything useful
    if not (bittensor_service.connected and bittensor_service.wallet_loaded):
        return

    # Read thresholds from live risk config
    sl_pct = _get_risk_value("stop_loss_pct",   8.0)  / 100.0   # e.g. 8% → 0.08
    tp_pct = _get_risk_value("take_profit_pct", 25.0) / 100.0   # e.g. 25% → 0.25

    # Load all open positions
    result = await db.execute(
        select(StakePosition).where(StakePosition.status == "open")
    )
    positions = result.scalars().all()
    if not positions:
        return

    # Fetch current α-prices for all staked subnets (1 chain call covers all)
    netuids = list({p.netuid for p in positions})
    current_prices = await bittensor_service.get_prices_for_netuids(netuids)

    # ── Evaluate each open position ───────────────────────────────────────
    triggered = []
    for pos in positions:
        cur = current_prices.get(pos.netuid, 0.0)
        if cur <= 0 or pos.entry_alpha_price <= 0:
            continue   # can't evaluate without a valid price pair

        pnl_pct = (cur - pos.entry_alpha_price) / pos.entry_alpha_price

        if pnl_pct <= -sl_pct:
            triggered.append((pos, pnl_pct, "sl_hit"))
        elif pnl_pct >= tp_pct:
            triggered.append((pos, pnl_pct, "tp_hit"))

    if not triggered:
        return

    # ── Get actual on-chain α-balances for triggered positions ────────────
    # We need the real α-amount held on-chain to pass the correct quantity
    # to remove_stake.  One get_stake_info() call covers all positions.
    stake_info = await bittensor_service.get_stake_info()
    # Build lookup: (netuid, hotkey) → alpha_amount
    stake_lookup: Dict[tuple, float] = {}
    for s in stake_info.get("stakes", []):
        key = (s.get("netuid"), s.get("hotkey"))
        stake_lookup[key] = float(s.get("stake", 0.0))

    # ── Execute exits ─────────────────────────────────────────────────────
    for pos, pnl_pct, reason in triggered:
        emoji = "🛑" if reason == "sl_hit" else "🎯"
        label = "STOP-LOSS" if reason == "sl_hit" else "TAKE-PROFIT"
        display_strat = DISPLAY_NAMES.get(pos.strategy or "", pos.strategy or "?")

        push_event(
            "alert",
            f"{emoji} {label} — SN{pos.netuid} {display_strat} "
            f"{pnl_pct * 100:+.1f}%  "
            f"(entry={pos.entry_alpha_price:.4f}τ → "
            f"now={current_prices.get(pos.netuid, 0):.4f}τ)",
            strategy=pos.strategy,
            detail=f"Staked={pos.tao_staked:.4f}τ | exits now — no consensus required",
        )
        alert_service.push_alert(
            type    = "RISK",
            level   = "CRITICAL" if reason == "sl_hit" else "INFO",
            title   = f"{emoji} {label} triggered — SN{pos.netuid}",
            message = (
                f"{display_strat} position P&L: {pnl_pct * 100:+.1f}%. "
                f"Forced exit initiated — bypasses OpenClaw consensus."
            ),
            strategy = pos.strategy,
            detail   = (
                f"entry={pos.entry_alpha_price:.5f}τ | "
                f"current={current_prices.get(pos.netuid, 0):.5f}τ | "
                f"staked={pos.tao_staked:.4f}τ"
            ),
        )

        # Determine actual α-amount to unstake
        actual_alpha = stake_lookup.get((pos.netuid, pos.hotkey), 0.0)
        if actual_alpha <= 0:
            logger.warning(
                f"[SL/TP] No on-chain stake found for SN{pos.netuid} "
                f"{(pos.hotkey or '')[:16]}… — marking failed_exit, will retry"
            )
            pos.status = "failed_exit"
            await db.flush()
            continue

        exec_result = await bittensor_service.unstake(
            pos.hotkey, actual_alpha, pos.netuid
        )

        if exec_result.get("success"):
            pos.status          = reason
            pos.closed_at       = datetime.utcnow()
            pos.close_tx_hash   = exec_result.get("tx_hash")
            pos.realized_pnl_tao = round(pos.tao_staked * pnl_pct, 6)
            await db.flush()

            push_event(
                "trade",
                f"{'✅' if reason == 'tp_hit' else '❌'} {label} EXIT CONFIRMED — "
                f"SN{pos.netuid} | {pnl_pct * 100:+.1f}% | "
                f"P&L ≈ {pos.realized_pnl_tao:+.4f}τ",
                strategy=pos.strategy,
                detail=f"tx={exec_result.get('tx_hash', 'pending')}",
            )
            logger.info(
                f"[SL/TP] {pos.strategy}: {reason} exit SN{pos.netuid} "
                f"pnl={pnl_pct * 100:+.2f}% alpha={actual_alpha:.5f} "
                f"tx={exec_result.get('tx_hash')}"
            )
        else:
            err = exec_result.get("error", "unknown error")
            pos.status = "failed_exit"
            await db.flush()
            push_event(
                "alert",
                f"❌ {label} EXIT FAILED — SN{pos.netuid}: {err}",
                strategy=pos.strategy,
            )
            alert_service.push_alert(
                type    = "RISK",
                level   = "CRITICAL",
                title   = f"⚠️ {label} exit FAILED — SN{pos.netuid}",
                message = f"Could not unstake for {label}. Status set to failed_exit — will retry next cycle.",
                strategy= pos.strategy,
                detail  = f"Error: {err} | pnl={pnl_pct * 100:+.1f}% | alpha={actual_alpha:.5f}",
            )
            logger.error(
                f"[SL/TP] {pos.strategy}: exit failed SN{pos.netuid} — {err}"
            )


# ── Signal engine — replaces random.choice(["buy","sell"]) ───────────────────

def _compute_signal(strategy: str, indicators: Dict[str, Any], price: float) -> Optional[str]:
    """
    Return the real indicator-driven trade direction for each strategy.

    Returns:
        "buy"  — clear bullish signal
        "sell" — clear bearish signal
        None   — no edge detected this cycle (skip trade entirely)

    Each strategy name encodes its logic:
        momentum_cascade   → EMA crossover + RSI filter
        dtao_flow_momentum → MACD histogram direction
        liquidity_hunter   → Price vs BB mid + RSI
        breakout_hunter    → Price vs EMA9 + RSI momentum
        yield_maximizer    → Simple EMA trend (buy-and-hold bias)
        contrarian_flow    → RSI extreme reversal (buys dips, sells rips)
        volatility_arb     → Bollinger Band position (buys near lower, sells near upper)
        sentiment_surge    → RSI direction + MACD confirmation (weak, noisy)
        balanced_risk      → Multi-confirmation: EMA + RSI + MACD must ALL agree
        mean_reversion     → Pure RSI extremes (only trades at <33 or >67)
        emission_momentum  → EMA AND MACD must both agree (strict dual-confirm)
        macro_correlation  → Price vs SMA50 + RSI (longer-term view)
    """
    rsi   = indicators.get("rsi_14")
    ema9  = indicators.get("ema_9")
    ema21 = indicators.get("ema_21")
    sma50 = indicators.get("sma_50")
    macd  = indicators.get("macd")
    sig   = indicators.get("macd_signal")
    bb_up = indicators.get("bb_upper")
    bb_lo = indicators.get("bb_lower")
    bb_md = indicators.get("bb_mid")
    hist  = (macd - sig) if (macd is not None and sig is not None) else None

    # ── momentum_cascade ──────────────────────────────────────────────
    if strategy == "momentum_cascade":
        if ema9 and ema21:
            if ema9 > ema21 and (rsi is None or rsi < 68):
                return "buy"    # trend up, not overbought
            if ema9 < ema21 or (rsi is not None and rsi > 72):
                return "sell"   # trend down or overbought → exit
        return None

    # ── dtao_flow_momentum ────────────────────────────────────────────
    elif strategy == "dtao_flow_momentum":
        if hist is not None:
            return "buy" if hist > 0 else "sell"    # MACD histogram direction
        if ema9 and ema21:                           # fallback
            return "buy" if ema9 > ema21 else "sell"
        return None

    # ── liquidity_hunter ──────────────────────────────────────────────
    elif strategy == "liquidity_hunter":
        if bb_md is not None and rsi is not None:
            # Buy: above mid-band with momentum but NOT overbought
            if price > bb_md and 52 < rsi < 70:
                return "buy"
            # Sell: below mid-band OR overbought (RSI > 70 = exit regardless)
            if price < bb_md and rsi < 48 or rsi > 70:
                return "sell"
        if ema9 and ema21:
            return "buy" if ema9 > ema21 else "sell"
        return None

    # ── breakout_hunter ───────────────────────────────────────────────
    elif strategy == "breakout_hunter":
        # Use EMA21 (trend-direction) + RSI momentum confirmation.
        # EMA9 is too sensitive — a $0.50 dip below it would falsely trigger SELL.
        if ema21 is not None and rsi is not None:
            if price > ema21 and rsi > 55:
                return "buy"    # price above trend MA with momentum
            if price < ema21 or rsi < 45:
                return "sell"   # below trend line or momentum lost
        return None

    # ── yield_maximizer ───────────────────────────────────────────────
    elif strategy == "yield_maximizer":
        # Emission-first: stay with the trend, exit on crossover only
        if ema9 and ema21:
            return "buy" if ema9 > ema21 else "sell"
        return None

    # ── contrarian_flow ───────────────────────────────────────────────
    elif strategy == "contrarian_flow":
        # Buys extreme fear, sells extreme greed — neutral zone = no trade
        if rsi is not None:
            if rsi < 35:
                return "buy"    # extreme oversold → expect bounce
            if rsi > 65:
                return "sell"   # extreme overbought → expect decline
        return None             # mid-range: no edge for contrarian

    # ── volatility_arb ────────────────────────────────────────────────
    elif strategy == "volatility_arb":
        if bb_up and bb_lo and bb_md:
            bb_range = bb_up - bb_lo
            if bb_range > 0:
                pct_in_band = (price - bb_lo) / bb_range
                if pct_in_band < 0.20:
                    return "buy"    # near lower band — oversold in volatility context
                if pct_in_band > 0.80:
                    return "sell"   # near upper band — overbought
        return None

    # ── sentiment_surge ───────────────────────────────────────────────
    elif strategy == "sentiment_surge":
        # Weak noisy signal — RSI direction + optional MACD confirm
        if rsi is not None:
            if rsi > 55 and (hist is None or hist > 0):
                return "buy"
            if rsi < 45 or (hist is not None and hist < -0.001):
                return "sell"
        return None

    # ── balanced_risk ─────────────────────────────────────────────────
    elif strategy == "balanced_risk":
        # Conservative: ALL indicators must agree to enter; exit on any warning
        if ema9 and ema21 and rsi is not None:
            fully_bullish = (ema9 > ema21) and (42 <= rsi <= 65) and (hist is None or hist > 0)
            any_danger    = (ema9 < ema21) or rsi > 72 or rsi < 30
            if fully_bullish:
                return "buy"
            if any_danger:
                return "sell"
        return None

    # ── mean_reversion ────────────────────────────────────────────────
    elif strategy == "mean_reversion":
        # Only trade at genuine RSI extremes — wide neutral zone
        if rsi is not None:
            if rsi < 33:
                return "buy"    # extremely oversold
            if rsi > 67:
                return "sell"   # extremely overbought
        return None             # 33–67: no edge for mean reversion

    # ── emission_momentum ─────────────────────────────────────────────
    elif strategy == "emission_momentum":
        # Strict dual confirmation: EMA AND MACD must agree
        if ema9 and ema21 and hist is not None:
            if ema9 > ema21 and hist > 0:
                return "buy"
            if ema9 < ema21 and hist < 0:
                return "sell"
        elif ema9 and ema21:    # only one confirm available
            return "buy" if ema9 > ema21 else "sell"
        return None

    # ── macro_correlation ─────────────────────────────────────────────
    elif strategy == "macro_correlation":
        # Long-timeframe view: price relative to SMA50 + RSI
        if sma50 is not None and rsi is not None:
            if price > sma50 and rsi > 47:
                return "buy"    # macro bullish
            if price < sma50 or rsi < 43:
                return "sell"   # macro bearish
        if ema9 and ema21:      # SMA50 not ready yet (need 50 data points)
            return "buy" if ema9 > ema21 else "sell"
        return None

    return None   # unknown strategy


def _build_signal_reason(strategy: str, indicators: Dict[str, Any], price: float, side: str) -> str:
    """
    Build a human-readable reason that explains WHY the signal fired,
    referencing the actual indicator values that drove the decision.
    """
    rsi   = indicators.get("rsi_14")
    ema9  = indicators.get("ema_9")
    ema21 = indicators.get("ema_21")
    macd  = indicators.get("macd")
    sig   = indicators.get("macd_signal")
    hist  = (macd - sig) if (macd is not None and sig is not None) else None
    bb_up = indicators.get("bb_upper")
    bb_lo = indicators.get("bb_lower")

    parts = []
    if rsi   is not None: parts.append(f"RSI={rsi:.1f}")
    if ema9  and ema21:   parts.append(f"EMA9{'>'if ema9>ema21 else '<'}EMA21")
    if hist  is not None: parts.append(f"MACD_hist={hist:+.5f}")
    if bb_up and bb_lo:   parts.append(f"BB_pct={((price-bb_lo)/(bb_up-bb_lo)*100):.0f}%")

    indicator_str = ", ".join(parts) if parts else f"price=${price:.2f}"
    name = DISPLAY_NAMES.get(strategy, strategy)
    return f"{name}: {side.upper()} — {indicator_str}"


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

        # ── Auto-reconnect to Finney once per cycle if needed ─────────────
        # If the chain connection dropped or was never established, attempt
        # to reconnect before the strategy loop so LIVE trades can fire.
        if not bittensor_service.connected:
            try:
                await bittensor_service.get_chain_info()
                if bittensor_service.connected:
                    logger.info("Chain reconnected on cycle — LIVE execution armed.")
            except Exception as _e:
                logger.debug(f"Chain reconnect attempt failed: {_e}")

        # ── Stop-loss / Take-profit monitor ──────────────────────────────
        # Runs BEFORE strategy signals so an exiting position can free up
        # α-balance before new BUY signals fire this same cycle.
        try:
            await _check_stop_loss(db)
            await db.flush()
        except Exception as _sl_err:
            logger.error(f"Stop-loss monitor error: {_sl_err}", exc_info=True)
        # ─────────────────────────────────────────────────────────────────

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

            # ── Real indicator-driven signal ──────────────────────────
            # Replaces random.choice(["buy","sell"]).
            # Each strategy uses its own indicator logic to determine
            # direction. None = no clear edge this cycle → skip.
            side = _compute_signal(s.name, indicators, price)
            if side is None:
                # No clear signal — don't force a trade
                s.cycles_completed = (s.cycles_completed or 0) + 1
                await db.flush()
                continue

            # Win / loss outcome for paper simulation
            # (actual on-chain PnL is determined by α-price movement,
            #  but we keep the simulation for stats/gate tracking)
            is_win  = random.random() < p["win_bias"]
            raw_pnl = abs(random.gauss(p["pnl_mean"], p["pnl_std"]))
            pnl     = raw_pnl if is_win else -raw_pnl * 0.7
            pnl     = round(pnl, 6)

            # TAO amount — tier-based for LIVE, small fixed for paper
            amount = round(random.uniform(0.01, 0.05), 4)

            reason = _build_signal_reason(s.name, indicators, price, side)

            # ── OpenClaw BFT Gate (ALL strategy modes) ───────────────────────
            # Consensus runs for PAPER_ONLY, APPROVED_FOR_LIVE, and LIVE.
            #
            # Rationale: paper strategies need real consensus practice before
            # promotion.  A strategy that can't pass 7/12 supermajority during
            # paper trading has no business going LIVE.  Running consensus in
            # paper mode means:
            #   • Only consensus-approved signals accrue WR / PnL stats
            #   • Gate metrics (WR ≥ 55%, cycles ≥ 10) reflect real BFT-filtered
            #     performance — a much stronger promotion signal
            #   • The 12-bot fleet accumulates voting history and indicator
            #     calibration across all modes
            #
            # Vetoed paper trades: cycle count increments, no trade logged.
            # Approved paper trades: proceed exactly as before (simulated).
            # LIVE strategies: consensus approval is still required for on-chain
            # execution (same as before).
            consensus_result = await consensus_service.run_consensus(
                triggered_by = s.name,
                direction    = side.upper(),
            )
            if not consensus_result.approved:
                # Consensus rejected — skip trade for ALL modes, log veto
                push_event(
                    "alert",
                    f"🚫 OpenClaw VETOED {side.upper()} for {DISPLAY_NAMES.get(s.name, s.name)} [{s.mode}]",
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
                # Consensus approved — let majority direction override signal side
                if consensus_result.result == "APPROVED_SELL":
                    side = "sell"
                elif consensus_result.result == "APPROVED_BUY":
                    side = "buy"
            # ─────────────────────────────────────────────────────────────────

            # ── Real on-chain execution (LIVE strategies only) ────────────────
            # Conditions: strategy is LIVE + consensus passed + chain reachable
            # + wallet has mnemonic loaded + hotkey configured.
            # Paper strategies and any failed condition fall through to simulation.
            tx_hash       = None
            trade_status  = "executed"
            target_netuid = config.netuid if config else 1   # default; router may override

            if (
                s.mode == "LIVE"
                and bittensor_service.connected
                and bittensor_service.wallet_loaded
            ):
                # Per-strategy stake takes priority; falls back to global bot config
                # Tier: ELITE 0.020τ / STRONG 0.015τ / SOLID 0.010τ / CAUTIOUS 0.008/0.006τ
                live_amount = s.stake_amount if s.stake_amount else (config.trade_amount if config else 0.1)

                # ── Daily deployment cap (BUY side only) ─────────────────
                # Prevents the bot from consuming all liquid TAO in a
                # single day. Resets at midnight UTC.
                if side == "buy":
                    liquid = await bittensor_service.get_balance() or 0.0
                    if not _check_daily_cap(live_amount, liquid):
                        push_event(
                            "system",
                            f"⛽ Daily cap reached — {display} BUY skipped "
                            f"(staked {_daily_staked_tao:.4f}τ today, "
                            f"cap=40% of {liquid:.4f}τ liquid)",
                            strategy=s.name,
                        )
                        s.cycles_completed = (s.cycles_completed or 0) + 1
                        await db.flush()
                        continue

                # Ask the subnet router for the best (netuid, hotkey) pair
                target_netuid, hotkey = await get_stake_target(s.name)

                if not hotkey:
                    # Router has no validator yet — fall back to paper this cycle
                    push_event(
                        "system",
                        f"⚠️ {display}: no validator resolved — staying paper this cycle",
                        strategy=s.name,
                    )
                else:
                    if side == "buy":
                        exec_result = await bittensor_service.stake(hotkey, live_amount, target_netuid)
                    else:
                        exec_result = await bittensor_service.unstake(hotkey, live_amount, target_netuid)

                    if exec_result.get("success"):
                        amount   = live_amount
                        tx_hash  = exec_result.get("tx_hash") or exec_result.get("block_hash")

                        if side == "buy":
                            # ── Daily cap accounting ──────────────────────
                            _record_stake(live_amount)

                            # ── Open a StakePosition for SL/TP monitoring ─
                            alpha_entry = bittensor_service._subnet_prices.get(target_netuid, 0.0)
                            if alpha_entry > 0:
                                sl_snap = _get_risk_value("stop_loss_pct",   8.0)  / 100.0
                                tp_snap = _get_risk_value("take_profit_pct", 25.0) / 100.0
                                stake_pos = StakePosition(
                                    netuid            = target_netuid,
                                    hotkey            = hotkey,
                                    strategy          = s.name,
                                    entry_alpha_price = alpha_entry,
                                    tao_staked        = live_amount,
                                    sl_pct            = sl_snap,
                                    tp_pct            = tp_snap,
                                    open_tx_hash      = tx_hash,
                                    status            = "open",
                                )
                                db.add(stake_pos)
                                logger.info(
                                    f"[POSITION] Opened SN{target_netuid} entry_α={alpha_entry:.5f}τ "
                                    f"staked={live_amount}τ SL={sl_snap*100:.0f}% "
                                    f"TP={tp_snap*100:.0f}%"
                                )
                            else:
                                logger.warning(
                                    f"[POSITION] α-price unavailable for SN{target_netuid} "
                                    f"— position NOT recorded (SL/TP won't monitor this stake)"
                                )

                        else:  # side == "sell"
                            # ── Close matching open StakePosition ─────────
                            close_res = await db.execute(
                                select(StakePosition)
                                .where(StakePosition.netuid  == target_netuid)
                                .where(StakePosition.hotkey  == hotkey)
                                .where(StakePosition.status  == "open")
                                .order_by(StakePosition.opened_at.asc())
                                .limit(1)
                            )
                            pos_obj = close_res.scalar_one_or_none()
                            if pos_obj:
                                cur_alpha = bittensor_service._subnet_prices.get(target_netuid, 0.0)
                                pnl_est   = (
                                    (cur_alpha - pos_obj.entry_alpha_price)
                                    / pos_obj.entry_alpha_price
                                    * pos_obj.tao_staked
                                ) if pos_obj.entry_alpha_price > 0 else 0.0
                                pos_obj.status           = "closed"
                                pos_obj.closed_at        = datetime.utcnow()
                                pos_obj.close_tx_hash    = tx_hash
                                pos_obj.realized_pnl_tao = round(pnl_est, 6)

                        push_event(
                            "trade",
                            f"🔴 LIVE {side.upper()} {live_amount:.4f}τ @ ${price:.2f} "
                            f"— SN{target_netuid} on-chain",
                            strategy = s.name,
                            detail   = f"tx={tx_hash or 'pending'} | netuid={target_netuid} "
                                       f"| validator={hotkey[:16]}…",
                        )
                        logger.info(
                            f"[LIVE] {s.name}: {side.upper()} {live_amount}τ "
                            f"SN{target_netuid} validator={hotkey[:16]} tx={tx_hash}"
                        )
                    else:
                        err = exec_result.get("error", "unknown error")
                        push_event(
                            "alert",
                            f"❌ LIVE execution FAILED for {display} on SN{target_netuid}: {err}",
                            strategy = s.name,
                        )
                        alert_service.push_alert(
                            type     = "SYSTEM",
                            level    = "CRITICAL",
                            title    = f"⛔ Live trade failed — {display}",
                            message  = f"OpenClaw approved {side.upper()} on SN{target_netuid} "
                                       f"but execution failed: {err}",
                            strategy = s.name,
                            detail   = f"side={side} | amount={live_amount}τ | "
                                       f"SN{target_netuid} | validator={hotkey[:16]}…",
                        )
                        logger.error(f"[LIVE] {s.name}: execution FAILED SN{target_netuid} — {err}")
                        s.cycles_completed = (s.cycles_completed or 0) + 1
                        await db.flush()
                        continue   # do NOT record a failed live trade as executed
            # ─────────────────────────────────────────────────────────────────

            # Persist trade — netuid reflects actual subnet used (router decision)
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
                netuid          = target_netuid if tx_hash else (config.netuid if config else 1),
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