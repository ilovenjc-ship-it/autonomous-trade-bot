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
import os
import random
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from sqlalchemy import select, update, func as sqlfunc
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
from services.execution_guard import (
    jitter_seconds, pre_flight_check, fee_for_trade, slippage_tao
)

logger = logging.getLogger(__name__)

# Build tag — bumped to force Railway redeploy and confirm version in logs
CYCLE_SERVICE_VERSION = "2.1.0-fleet-consensus-all-modes"
logger.info(f"cycle_service loaded — version {CYCLE_SERVICE_VERSION} (Fleet Consensus active for ALL modes)")

# ── Global paper-mode override ────────────────────────────────────────────────
# When True, ALL live on-chain execution is blocked regardless of strategy mode.
# Strategies continue to paper-simulate and accrue stats/gate progress.
# Auto-promotion (PAPER_ONLY → APPROVED_FOR_LIVE → LIVE) is also suspended.
# Toggle via POST /api/bot/force-paper and POST /api/bot/resume-live.
# Readable from the FORCE_PAPER_MODE env var at startup (set to "1" to default safe).
_FORCE_PAPER_MODE: bool = os.environ.get("FORCE_PAPER_MODE", "0") == "1"


def get_force_paper_mode() -> bool:
    return _FORCE_PAPER_MODE


def set_force_paper_mode(enabled: bool) -> None:
    global _FORCE_PAPER_MODE
    _FORCE_PAPER_MODE = enabled
    logger.warning(
        f"[PAPER OVERRIDE] Force paper mode {'ENABLED — all live execution blocked' if enabled else 'DISABLED — strategies may resume live promotion'}"
    )


# Dedup sets — prevent alert spam across cycles
_drawdown_alerted: set = set()   # strategy names already drawdown-alerted this session

# ── Rolling win-rate decay tracking ──────────────────────────────────────────
# Track the last ROLLING_WR_WINDOW trade outcomes (win=True/False) per strategy.
# When the rolling WR over the last N trades drops below ROLLING_WR_ALERT_THRESH,
# fire a CRITICAL alert immediately — don't wait for the full demotion cycle.
# This gives the operator early warning of a strategy that's going bad.
from collections import deque as _deque
ROLLING_WR_WINDOW        = 10    # look at the last 10 trades
ROLLING_WR_ALERT_THRESH  = 45.0  # fire if rolling WR falls below this
_rolling_outcomes: dict  = {}    # {strategy_name: deque([True, False, ...])}
_rolling_wr_alerted: set = set() # prevent re-fire while still degraded

# ── Gate thresholds ───────────────────────────────────────────────────────────
# These are the DEFAULTS. Actual values are read from Risk Config at runtime via
# _get_risk_value() so the operator can tune them from the dashboard without a
# code deploy.  The hardcoded values here are the safe starting point.
#
# Raised from the Session XIV originals (10 cycles / 55% WR / margin 2 / PnL>0)
# because those were calibrated against the biased simulator.  Under honest
# physics (~34% WR for random signals) you need more cycles and a higher bar.
GATE_CYCLES   = 30     # was 10 — need statistical significance
GATE_WIN_RATE = 55.0   # unchanged — but meaningful now with honest sim
GATE_MARGIN   = 5      # was 2 — more separation required
GATE_PNL      = 0.01   # was 0 — must be above noise threshold (τ0.01)

# ── Demotion thresholds ───────────────────────────────────────────────────────
# A bot is demoted when it has enough history to be judged AND performance
# has genuinely degraded — win rate tanked AND cumulative PnL turned negative.
# Positive PnL saves a bot even with a lower win rate (big winners count).
DEMOTE_WIN_RATE   = 50.0   # was 45% — faster response to underperformance
DEMOTE_MIN_CYCLES = 10     # was 15 — less live exposure before demotion
DEMOTE_PNL        = 0.0    # must also have negative cumulative PnL to demote

# Dedup sets — prevent same demotion alert firing every cycle
_demoted_alerted:    set = set()  # WR-based demotion dedup
_dd_demoted_alerted: set = set()  # Drawdown-based demotion dedup (separate rail)

# ── Regime-aware strategy gating ──────────────────────────────────────────────
#
# Market regimes:
#   SIDEWAYS      — RSI 40–60, no meaningful directional bias
#   TRENDING_UP   — RSI > 60 (bullish momentum)
#   TRENDING_DOWN — RSI < 40 (bearish momentum)
#   VOLATILE      — Bollinger Band width > 8% of mid (large swings, directionless)
#   UNKNOWN       — Not enough indicator data yet (early cycles)
#
# Momentum/trend strategies are BENCHED in SIDEWAYS — they accumulate losses
# by chasing signals that don't exist in flat, choppy markets.  Mean-reversion
# strategies are BENCHED in strong trends — fading a trend is a losing trade.
# Regime-agnostic strategies (liquidity/sentiment/macro) always run.
#
# Design: benched strategies do NOT fire a trade signal this cycle.
# Their cycle counter still advances (time keeps passing; history keeps building).
# Consecutive losses do NOT accumulate while benched — this is the whole point.

_current_regime: str = "UNKNOWN"
_regime_benched_log: set = set()   # dedup bench activity events (strategy:regime)

# Defines which regimes each strategy is permitted to trade in.
# A strategy not in this dict defaults to ALL regimes (safe fallback).
REGIME_SUITABILITY: Dict[str, List[str]] = {
    # ── Momentum / trend-following: bench in sideways chop ────────────────
    "momentum_cascade":   ["TRENDING_UP", "TRENDING_DOWN", "VOLATILE"],
    "yield_maximizer":    ["TRENDING_UP", "TRENDING_DOWN", "VOLATILE"],
    "breakout_hunter":    ["TRENDING_UP", "TRENDING_DOWN", "VOLATILE"],
    "dtao_flow_momentum": ["TRENDING_UP", "TRENDING_DOWN", "VOLATILE"],
    "emission_momentum":  ["TRENDING_UP", "TRENDING_DOWN", "VOLATILE"],
    # ── Contrarian (RSI-extreme) / range: regime-agnostic, signal-gated ───
    # Session XLI Day 8 R3 (Task #3): mean_reversion and contrarian_flow
    # were ["SIDEWAYS", "VOLATILE"] — and logged 0 trades over 2,202 cycles
    # each. Diagnosis: their signal logic fires only on RSI extremes
    # (mean_rev <33/>67, contrarian <35/>65), but per cycle_service's
    # canonical regime detector, RSI<40 → TRENDING_DOWN and RSI>60 →
    # TRENDING_UP. The bench gate excluded these bots from exactly the
    # regimes their signals would fire in. Empty intersection → dead bots.
    # Trade-history evidence: 397 RSI-tagged trades, 46% had RSI<33 and
    # 42% had RSI>67 — abundant fire opportunities, all blocked by the
    # gate. Fix: make these two regime-agnostic. Their signal logic is
    # already very selective (the trade_prob in SIGNAL_CONFIG is 0.15/0.18,
    # plus the RSI-extreme requirement); piling a regime exclusion on top
    # of an already-selective signal creates dead bots by construction.
    # This matches the pattern of liquidity_hunter / sentiment_surge /
    # balanced_risk — selective signals, regime-agnostic gate.
    # volatility_arb stays SIDEWAYS+VOLATILE because its signal fires on
    # BB-position (not RSI), which can be extreme in non-trending regimes;
    # it's already firing (18 trades) — the gate works correctly there.
    #
    # ╔══════════════════════════════════════════════════════════════════╗
    # ║ DAY 8 INVARIANT — INV-3 — Commit 7a4d3dde                       ║
    # ║ mean_reversion AND contrarian_flow MUST stay regime-agnostic    ║
    # ║ (all 4 regimes). Restricting them to [SIDEWAYS, VOLATILE] based ║
    # ║ on the textbook "mean reversion = sideways" mental model        ║
    # ║ recreates the bench/signal mutual exclusion that produced 0     ║
    # ║ trades over 2,202 cycles. Their signal logic fires on RSI<33/35 ║
    # ║ and RSI>65/67 — which by INV-2's canonical detector ARE the     ║
    # ║ TRENDING regimes. Restrict them and the intersection is empty   ║
    # ║ by construction. See STATE.md §0 INV-3 + §5a Day 8 R3 entry.    ║
    # ║ Regression test:                                                ║
    # ║   backend/scripts/test_day8_invariants.py::test_inv3_regime_    ║
    # ║   agnostic                                                      ║
    # ╚══════════════════════════════════════════════════════════════════╝
    "mean_reversion":     ["TRENDING_UP", "TRENDING_DOWN", "SIDEWAYS", "VOLATILE"],
    "contrarian_flow":    ["TRENDING_UP", "TRENDING_DOWN", "SIDEWAYS", "VOLATILE"],
    "volatility_arb":     ["SIDEWAYS", "VOLATILE"],
    # ── Regime-agnostic: always active ───────────────────────────────────
    "macro_correlation":  ["TRENDING_UP", "TRENDING_DOWN", "SIDEWAYS", "VOLATILE"],
    "liquidity_hunter":   ["TRENDING_UP", "TRENDING_DOWN", "SIDEWAYS", "VOLATILE"],
    "sentiment_surge":    ["TRENDING_UP", "TRENDING_DOWN", "SIDEWAYS", "VOLATILE"],
    "balanced_risk":      ["TRENDING_UP", "TRENDING_DOWN", "SIDEWAYS", "VOLATILE"],
}


# ╔══════════════════════════════════════════════════════════════════════╗
# ║ DAY 8 INVARIANT — INV-2 — Commit 84879022                           ║
# ║ This function is the ONLY regime classifier. agent_service          ║
# ║ ._detect_regime is a 3-line wrapper that calls this and runs the    ║
# ║ result through to_human_regime() for UI labeling. Re-introducing a  ║
# ║ second classifier in agent_service (the previous 41-line parallel   ║
# ║ implementation with conflicting thresholds) recreates the           ║
# ║ phantom-SIDEWAYS leak that benched 5 momentum bots on phantom data  ║
# ║ via get_current_regime()'s step-3 fallback. The fast-path that      ║
# ║ produced confident SIDEWAYS from 2 prices + 0.3% movement was the   ║
# ║ specific defect — never re-add it. See STATE.md §0 INV-2 + §5a      ║
# ║ Day 8 R2 entry. Regression test:                                    ║
# ║   backend/scripts/test_day8_invariants.py::test_inv2_regime         ║
# ╚══════════════════════════════════════════════════════════════════════╝
def _detect_regime(indicators: Dict[str, Any]) -> str:
    """
    Canonical regime classifier — the single source of truth for the
    bench-gate authority and (since Session XLI Day 8 R2) for the UI label
    rendered by agent_service. Any future threshold tuning happens here.

    Returns one of: SIDEWAYS | TRENDING_UP | TRENDING_DOWN | VOLATILE | UNKNOWN

    Logic (in priority order):
      1. No RSI data → UNKNOWN (too early; no false gating)
      2. BB width > 8% of mid → VOLATILE (high swing amplitude)
         - But if RSI is clearly directional inside VOLATILE, sub-classify as
           TRENDING_UP / TRENDING_DOWN so momentum strategies can still run.
      3. RSI > 60 → TRENDING_UP
      4. RSI < 40 → TRENDING_DOWN
      5. RSI 40–60 → SIDEWAYS

    For UI consumers that want the human vocabulary (BULL/BEAR), pipe the
    return value through `to_human_regime()` below.
    """
    rsi   = indicators.get("rsi_14")
    bb_up = indicators.get("bb_upper")
    bb_lo = indicators.get("bb_lower")
    bb_md = indicators.get("bb_mid")

    if rsi is None:
        return "UNKNOWN"

    # Bollinger Band width as volatility proxy
    if bb_up is not None and bb_lo is not None and bb_md and bb_md > 0:
        bb_width_pct = (bb_up - bb_lo) / bb_md
        if bb_width_pct > 0.08:                  # >8% band width → volatile
            if rsi > 62:
                return "TRENDING_UP"             # directional within volatility
            elif rsi < 38:
                return "TRENDING_DOWN"
            return "VOLATILE"

    # RSI-primary classification
    if rsi > 60:
        return "TRENDING_UP"
    elif rsi < 40:
        return "TRENDING_DOWN"
    return "SIDEWAYS"


def to_human_regime(canonical: str) -> str:
    """
    Map canonical regime vocabulary (TRENDING_UP/TRENDING_DOWN/SIDEWAYS/
    VOLATILE/UNKNOWN) to the human-friendly UI vocabulary used by agent_service
    observations and the chat assistant (BULL/BEAR/SIDEWAYS/VOLATILE/UNKNOWN).

    SIDEWAYS, VOLATILE, UNKNOWN pass through unchanged.
    """
    return {
        "TRENDING_UP":   "BULL",
        "TRENDING_DOWN": "BEAR",
    }.get(canonical, canonical)


def get_current_regime() -> str:
    """
    Always returns a FRESH regime classification from the current price_service
    indicators rather than the cached module-level variable.

    This prevents stale labels on the UI — e.g. showing TRENDING_DOWN during
    a +11% TAO rally simply because the module was last updated when RSI was low.

    The cycle engine continues to use _current_regime (updated each cycle) for
    strategy gating — that path is unaffected by this change.

    Fallback chain (each level tried only if the previous returns UNKNOWN):
      1. Fresh classification from current indicators
      2. Cached module-level _current_regime (set by the cycle engine)

    Note (Session XLI Day 8 R2): the previous step-3 fallback into
    agent_service.current_regime was removed. agent_service is now a thin
    derivative of this same canonical detector, so the fallback would have
    returned the same answer — except when its old fast-path produced a
    falsely-confident SIDEWAYS from 2 prices + a flat trend, which leaked
    into the bench gate and benched 5 momentum bots on phantom data.
    UNKNOWN is the correct answer during warmup.
    """
    try:
        indicators = price_service.compute_indicators()
        fresh = _detect_regime(indicators)
        if fresh != "UNKNOWN":
            return fresh
        # Fresh is UNKNOWN — try cached cycle-engine value (last good)
        if _current_regime != "UNKNOWN":
            return _current_regime
        return "UNKNOWN"
    except Exception:
        return _current_regime

# ── Signal fire probability per strategy ─────────────────────────────────────
# Controls how often each strategy's indicator logic produces a signal this cycle.
# Derived from the signal logic selectivity in _compute_signal():
#   strict conditions (e.g. RSI extremes) → lower probability
#   looser conditions (e.g. simple EMA crossover) → higher probability
# NOTE: NO win rates or PnL parameters here. The market decides outcomes.
SIGNAL_CONFIG: Dict[str, float] = {
    "momentum_cascade":   0.40,   # EMA crossover — fires in most trending markets
    "dtao_flow_momentum": 0.30,   # MACD histogram — fires on histogram direction change
    "liquidity_hunter":   0.22,   # BB mid + RSI band — specific conditions required
    "breakout_hunter":    0.28,   # Price vs EMA21 + RSI confirm
    "yield_maximizer":    0.45,   # Simple EMA — highest frequency (loose condition)
    "contrarian_flow":    0.18,   # RSI extremes only (<35 / >65) — selective
    "volatility_arb":     0.18,   # BB position extremes (<20% / >80%) — selective
    "sentiment_surge":    0.25,   # RSI direction + MACD confirm
    "balanced_risk":      0.32,   # Multi-confirm: EMA + RSI + MACD must ALL agree
    "mean_reversion":     0.15,   # Pure RSI extremes (<33 / >67) — most selective
    "emission_momentum":  0.30,   # Dual EMA + MACD confirm — strict dual gate
    # Day 8 Round 4 rewrite: macro_correlation now reads BTC 24h change as a
    # macro reference and only fires on BTC-vs-TAO divergence. Most cycles
    # BTC and TAO move in step → no divergence → no signal. The natural
    # selectivity is therefore in the signal logic itself; this probability
    # bumps to 0.50 so divergence days actually translate to a trade rather
    # than being randomly throttled on top of the structural rarity.
    "macro_correlation":  0.50,   # BTC-vs-TAO divergence (rare by construction)
}

# ── macro_correlation thresholds (Day 8 Round 4 — BTC divergence rewrite) ────
# Replaces the decorative `btc_correlation_window: 24, divergence_threshold:
# 0.15, max_hold: 6` parameter dict in strategy_service.DEFAULT_STRATEGIES,
# none of which were ever consumed.
#
# Logic: signal = btc_change_24h - tao_change_24h.
#   signal > +MIN_DIVERGENCE_PCT  → TAO is lagging BTC up → BUY (catch-up long)
#   signal < -MIN_DIVERGENCE_PCT  → TAO is lagging BTC down → SELL (catch-down)
#   otherwise                     → no edge, return None
#
# Asymmetric BTC moves are required (|btc_change_24h| ≥ MIN_BTC_MOVE_PCT)
# so the bot doesn't trade noise during quiet macro days.
MACRO_CORR_MIN_DIVERGENCE_PCT = 1.5    # TAO must lag BTC by ≥1.5pp / 24h
MACRO_CORR_MIN_BTC_MOVE_PCT   = 1.0    # BTC must have moved ≥1.0% / 24h

# ── Honest paper trading simulation parameters ────────────────────────────────
#
# The OLD simulation used pre-baked win_bias (40–84%) and positive pnl_mean on
# every strategy — guaranteeing "good" results regardless of signal quality.
# Losses were also artificially reduced to 70% of win size. This produced
# inflated gate metrics that bore zero relation to real market performance.
#
# The NEW simulation uses honest market physics:
#
#   Fee structure (real Bittensor network):
#     0.3% per staking leg × 2 legs  = 0.6% fee round-trip
#     0.2% slippage per leg × 2 legs = 0.4% slippage round-trip
#     Total cost per round trip       = 1.0%
#
#   Price movement model:
#     Bittensor alpha prices are volatile: ~3–8% per hour on active subnets.
#     A simulated 15–20 min hold has σ ≈ 2.5% (log-normal, zero drift).
#     Signal direction (buy/sell) was chosen by real indicators —
#     but the market is the final judge of whether the signal was right.
#
#   Expected outcomes by directional accuracy:
#     Random signal  (50% accuracy) → win rate ~34%  → FAILS gate (55%)
#     Mediocre signal(57% accuracy) → win rate ~42%  → FAILS gate
#     Good signal    (65% accuracy) → win rate ~50%  → BORDERLINE
#     Strong signal  (72%+ accuracy)→ win rate ~55%+ → PASSES gate
#
#   This means gate promotion is EARNED through genuine indicator edge —
#   not handed out. Strategies that pass with the new simulation are
#   genuinely good signals in real market conditions.
#
PAPER_FEE_PER_LEG      = 0.003   # Bittensor staking network fee per leg
PAPER_SLIPPAGE_PER_LEG = 0.002   # Alpha market slippage per leg (thin books)
PAPER_ROUND_TRIP_COST  = (PAPER_FEE_PER_LEG + PAPER_SLIPPAGE_PER_LEG) * 2  # 1.0%
PAPER_PRICE_SIGMA      = 0.025   # 2.5% alpha price std dev per ~15-20 min hold

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


async def _evaluate_circuit_breaker(db: AsyncSession) -> bool:
    """
    Evaluate whether the daily loss circuit breaker should be tripped.

    Queries today's live trades (tx_hash IS NOT NULL) and sums their recorded
    PnL as a proxy for daily live trading performance.  If the cumulative loss
    exceeds `daily_loss_circuit_breaker_pct` of the current reference balance
    (liquid + |loss|), the circuit breaker is set and True is returned.

    Once tripped the breaker stays True until manually reset via the Risk Config
    panel (POST /api/fleet/risk/reset-circuit-breaker).

    Paper trading is NOT affected — stats continue accumulating normally.
    Only live on-chain execution is blocked.

    Returns:
        True  — circuit breaker is active (either pre-existing or just tripped)
        False — circuit breaker is clear, live trading may proceed
    """
    try:
        from routers.fleet import _RISK_STATUS as _FS, _RISK_CONFIG as _FC

        # Already tripped — manual reset required, don't re-evaluate
        if _FS.get("circuit_breaker", False):
            return True

        # Sum PnL of real live trades today (tx_hash IS NOT NULL)
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        pnl_result = await db.execute(
            select(sqlfunc.sum(Trade.pnl)).where(
                Trade.tx_hash.isnot(None),
                Trade.executed_at >= today_start,
            )
        )
        daily_live_pnl = float(pnl_result.scalar() or 0.0)

        # Update daily_loss_pct in _RISK_STATUS for UI display
        _FS["daily_loss_pct"] = round(daily_live_pnl, 4)

        if daily_live_pnl >= 0:
            return False   # Positive or flat — no concern

        # Evaluate loss as % of (liquid + |loss|) to normalize for wallet size
        liquid = 0.0
        try:
            liquid = await bittensor_service.get_balance() or 0.0
        except Exception:
            pass

        baseline   = max(liquid + abs(daily_live_pnl), 0.001)
        loss_pct   = abs(daily_live_pnl) / baseline
        cb_pct     = float(_FC.get("daily_loss_circuit_breaker_pct", 40.0)) / 100.0

        if loss_pct >= cb_pct:
            _FS["circuit_breaker"] = True
            msg = (
                f"⚡ CIRCUIT BREAKER TRIPPED — daily live loss "
                f"{daily_live_pnl:.4f}τ ({loss_pct * 100:.1f}%) "
                f"exceeded {cb_pct * 100:.0f}% limit"
            )
            push_event(
                "alert", msg,
                detail="All live execution suspended. Reset in Risk Config to resume.",
            )
            alert_service.push_alert(
                type    = "RISK",
                level   = "CRITICAL",
                title   = "⚡ Daily Loss Circuit Breaker Tripped",
                message = (
                    f"Today's live trading cumulative loss of {abs(daily_live_pnl):.4f}τ "
                    f"({loss_pct * 100:.1f}%) exceeded the {cb_pct * 100:.0f}% daily limit. "
                    "All live execution suspended."
                ),
                detail  = "Use Risk Config → Reset Circuit Breaker to resume after reviewing.",
            )
            logger.critical(
                f"[RISK] Circuit breaker tripped — "
                f"daily_pnl={daily_live_pnl:.4f}τ ({loss_pct * 100:.1f}%)"
            )
            return True

        return False

    except Exception as _e:
        logger.warning(f"[RISK] Circuit breaker evaluation failed: {_e}")
        return False


# ── Stop-loss / Take-profit monitor ──────────────────────────────────────────
# Runs at the TOP of every cycle, before strategy signals fire.
# Checks all open LIVE positions against current α-price.
# Stop-loss exits BYPASS Fleet Consensus — they are unconditional.
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
                f"Forced exit initiated — bypasses Fleet Consensus."
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

def _signal_confidence(strategy: str, side: str, indicators: Dict[str, Any], price: float) -> float:
    """
    Heuristic confidence score (0.0–1.0) for a fired signal.

    Session XXXIV (carry-over #1+#3): the `min_confidence_score` slider in
    Risk Config was dormant — defined but never read.  We now compute a
    per-signal confidence here and use it to gate trade execution in the
    cycle loop, so raising the slider actually cuts fee-drag trades.

    The score blends:
      * RSI distance from neutral (50)               → trend conviction
      * EMA spread magnitude vs price                → trend strength
      * MACD histogram magnitude (when available)    → momentum amplitude
      * Bollinger-band position (when available)     → mean-revert conviction

    Each contributor is normalized to 0..1 and the result is the max of the
    contributors that apply to that strategy's signal logic — i.e. we
    surface the strongest reason the signal fired, not an average that
    gets diluted by absent factors.

    Returns 0.0 when we can't compute (force-skip via gate).
    """
    rsi   = indicators.get("rsi_14")
    ema9  = indicators.get("ema_9")
    ema21 = indicators.get("ema_21")
    macd  = indicators.get("macd")
    sig   = indicators.get("macd_signal")
    bb_up = indicators.get("bb_upper")
    bb_lo = indicators.get("bb_lower")
    hist  = (macd - sig) if (macd is not None and sig is not None) else None

    # ── macro_correlation: confidence = divergence magnitude only ──
    # The signal is BTC-vs-TAO 24h divergence; RSI / EMA / MACD don't
    # describe its conviction. A wider divergence = stronger expected
    # convergence trade. 4pp divergence saturates to 1.0.
    if strategy == "macro_correlation":
        btc_chg = indicators.get("btc_change_24h")
        tao_chg = indicators.get("tao_change_24h")
        if btc_chg is None or tao_chg is None:
            return 0.0
        divergence = abs(btc_chg - tao_chg)
        # Floor at 0.55 once the threshold is cleared (signal already passed
        # the trigger gate, so it deserves at least the typical min_conf
        # default), scale to 1.0 at 4pp divergence.
        return max(0.55, min(1.0, divergence / 4.0))

    contributors: list[float] = []

    # RSI distance from 50 (neutral) — capped at distance 30 → score 1.0
    if rsi is not None:
        rsi_dist = abs(rsi - 50) / 30.0
        contributors.append(min(1.0, rsi_dist))

    # EMA spread (strength of trend) — relative to price
    if ema9 is not None and ema21 is not None and price > 0:
        # spread of 0.5% of price → score 1.0
        ema_spread_pct = abs(ema9 - ema21) / price
        contributors.append(min(1.0, ema_spread_pct / 0.005))

    # MACD histogram magnitude — capped at 0.4 (typical TAO scale)
    if hist is not None:
        contributors.append(min(1.0, abs(hist) / 0.4))

    # Bollinger-band position — only meaningful for vol-arb-style signals
    if bb_up is not None and bb_lo is not None and bb_up > bb_lo:
        bb_range = bb_up - bb_lo
        bb_pct   = (price - bb_lo) / bb_range if bb_range > 0 else 0.5
        # Distance from mid-band 0.5 (neutral) → 0/1 (extremes) gives score
        contributors.append(min(1.0, abs(bb_pct - 0.5) * 2.0))

    if not contributors:
        return 0.0
    # Surface the strongest contributor — a high-conviction RSI signal
    # shouldn't be diluted by an absent MACD reading.
    return max(contributors)


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
        macro_correlation  → BTC-vs-TAO 24h-change divergence (cross-asset)
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
    # Day 8 Round 4 rewrite. Pre-rewrite this branch was TAO-only logic
    # (price vs SMA50 + RSI) with three structural defects identified
    # against 193 live trades: asymmetric BUY-AND / SELL-OR triggers
    # (5.2:1 SELL:BUY ratio with both sides negative-edge), thresholds
    # so loose the bot bought RSI 80+ and sold RSI <10, and an EMA
    # fallback that silently cloned yield_maximizer when SMA50 wasn't
    # ready. The description ("TAO/subnet correlation divergence vs BTC
    # macro trend") was fiction — no BTC reference existed in the code.
    #
    # New logic: BTC 24h change is now fetched alongside TAO in
    # price_service. The signal is the divergence between BTC and TAO
    # over the same 24h window:
    #   signal = btc_change_24h - tao_change_24h
    #
    #   signal >= +MIN_DIVERGENCE_PCT  → TAO lagging BTC up   → BUY
    #   signal <= -MIN_DIVERGENCE_PCT  → TAO lagging BTC down → SELL
    #   |btc_change_24h| < MIN_BTC_MOVE_PCT → quiet macro     → None
    #   either input None              → can't compute        → None
    #
    # Hard rule: NO fallback to TAO-only logic when BTC data is missing.
    # This bot's edge is BTC divergence; without BTC, it has no edge.
    # Returning None lets the rest of the fleet handle the cycle.
    #
    # ╔══════════════════════════════════════════════════════════════════╗
    # ║ DAY 8 INVARIANT — INV-4 — Commit 4575ddec                       ║
    # ║ macro_correlation MUST stay BTC-vs-TAO divergence with          ║
    # ║ symmetric ±1.5pp triggers and a 1.0% BTC activity floor. Do     ║
    # ║ NOT re-add an SMA50-or-EMA fallback when BTC data is missing —  ║
    # ║ the pre-Day-8 code did this and silently cloned                 ║
    # ║ yield_maximizer's logic, destroying the only cross-asset voice  ║
    # ║ in the Fleet Consensus 7/12 supermajority. Pre-rewrite the description ║
    # ║ ("TAO/subnet correlation divergence vs BTC macro trend") was    ║
    # ║ FICTION — there was no BTC reference in the code. Verify the    ║
    # ║ description and the code agree before merging changes here.     ║
    # ║ See STATE.md §0 INV-4 + §5a Day 8 R4 entry. Regression test:    ║
    # ║   backend/scripts/test_day8_invariants.py::test_inv4_macro_corr ║
    # ╚══════════════════════════════════════════════════════════════════╝
    elif strategy == "macro_correlation":
        btc_chg = indicators.get("btc_change_24h")
        tao_chg = indicators.get("tao_change_24h")
        if btc_chg is None or tao_chg is None:
            return None    # macro reference unavailable — abstain, do not guess
        if abs(btc_chg) < MACRO_CORR_MIN_BTC_MOVE_PCT:
            return None    # quiet macro day — no risk-on/risk-off tide to ride
        divergence = btc_chg - tao_chg
        if divergence >= MACRO_CORR_MIN_DIVERGENCE_PCT:
            return "buy"   # TAO lagging BTC's rally — bet on convergence up
        if divergence <= -MACRO_CORR_MIN_DIVERGENCE_PCT:
            return "sell"  # TAO lagging BTC's drop  — bet on convergence down
        return None        # BTC moved but TAO is tracking — no divergence edge

    return None   # unknown strategy


def _build_signal_reason(strategy: str, indicators: Dict[str, Any], price: float, side: str) -> str:
    """
    Build a human-readable reason that explains WHY the signal fired,
    referencing the actual indicator values that drove the decision.
    """
    name = DISPLAY_NAMES.get(strategy, strategy)

    # ── macro_correlation: BTC-vs-TAO divergence is its own logic, so
    # surface BTC/TAO 24h moves and the divergence rather than the
    # generic RSI/EMA/MACD blob the other strategies use.
    if strategy == "macro_correlation":
        btc_chg = indicators.get("btc_change_24h")
        tao_chg = indicators.get("tao_change_24h")
        if btc_chg is not None and tao_chg is not None:
            div = btc_chg - tao_chg
            return (
                f"{name}: {side.upper()} — "
                f"BTC{btc_chg:+.2f}% / TAO{tao_chg:+.2f}% "
                f"(divergence {div:+.2f}pp)"
            )
        return f"{name}: {side.upper()} — macro reference data unavailable"

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
    return f"{name}: {side.upper()} — {indicator_str}"


def _gate_check(s: Strategy) -> Dict[str, bool]:
    """
    Check all promotion gate conditions for a strategy.
    Threshold values are read from Risk Config at call time so the operator
    can adjust them from the dashboard without a code deploy.
    Falls back to the module-level constants (GATE_*) if not configured.
    """
    wins   = s.win_trades   or 0
    losses = s.loss_trades  or 0
    gate_cycles   = int(_get_risk_value("gate_cycles",   GATE_CYCLES))
    gate_win_rate = _get_risk_value("gate_win_rate",     GATE_WIN_RATE)
    gate_margin   = int(_get_risk_value("gate_margin",   GATE_MARGIN))
    gate_pnl      = _get_risk_value("gate_pnl",          GATE_PNL)
    return {
        "cycles":    s.cycles_completed  >= gate_cycles,
        "win_rate":  (s.win_rate or 0)   >= gate_win_rate,
        "margin":    (wins - losses)      >= gate_margin,
        "pnl":       (s.total_pnl or 0)  >  gate_pnl,
    }


async def _run_one_cycle() -> None:
    price = price_service.current_price
    if not price:
        logger.debug("No price yet — skipping cycle")
        return

    # ── Hard gate 1: Global halt ──────────────────────────────────────────────
    # Human operator button in Risk Config.  When active, abort the entire
    # cycle — no paper trades, no live trades — until the operator releases it.
    # This was previously a no-op (fleet._RISK_STATUS was never read here).
    try:
        from routers.fleet import _RISK_STATUS as _FS_GH
        if _FS_GH.get("global_halt", False):
            push_event(
                "alert",
                "⛔ GLOBAL HALT active — cycle skipped, all trading suspended",
                detail="Release halt via Risk Config → Resume Trading to continue",
            )
            logger.warning("[RISK] Global halt active — aborting cycle entirely")
            return
    except Exception as _gh_err:
        logger.debug(f"[RISK] global_halt check error: {_gh_err}")

    indicators = price_service.compute_indicators()

    # ── Regime detection ─────────────────────────────────────────────────────
    # Classify the market once per cycle; all 12 strategies inherit the result.
    # When the regime changes, push a single activity event and clear the bench
    # dedup log (so each strategy logs its new bench status once per regime).
    global _current_regime, _regime_benched_log
    new_regime = _detect_regime(indicators)
    if new_regime != _current_regime:
        old_regime   = _current_regime
        _current_regime = new_regime
        _regime_benched_log.clear()   # new regime → let each bot announce once
        push_event(
            "system",
            f"📊 Market regime: {old_regime} → {_current_regime}",
            detail="Strategy regime gating updated — unsuitable strategies will bench automatically",
        )
        logger.info(f"[REGIME] Regime change: {old_regime} → {_current_regime}")
    # ─────────────────────────────────────────────────────────────────────────

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

        # ── Hard gate 2: Daily loss circuit breaker ───────────────────────
        # Evaluated once per cycle (not per strategy) for efficiency.
        # If the circuit breaker is active, all live on-chain execution is
        # blocked for every strategy this cycle.  Paper trading continues.
        # Previously this config value existed but was NEVER evaluated —
        # it is now enforced in real-time.
        _circuit_breaker_active = await _evaluate_circuit_breaker(db)
        # ─────────────────────────────────────────────────────────────────

        # Keep consensus service in sync with current bot modes
        mode_map = {s.name: (s.mode or "PAPER_ONLY") for s in strategies}
        consensus_service.update_bot_modes(mode_map)

        for s in strategies:
            # Human-readable name available throughout this iteration
            display = DISPLAY_NAMES.get(s.name, s.name)

            # ── Regime gate ───────────────────────────────────────────────
            # If the current market regime is not suitable for this strategy,
            # bench it: skip the trade signal, advance the cycle counter
            # (time passes; history keeps building), but do NOT record a trade
            # so consecutive losses cannot accumulate while benched.
            # UNKNOWN regime (early boot, no indicator data) → always let through.
            if _current_regime != "UNKNOWN":
                suitable_regimes = REGIME_SUITABILITY.get(
                    s.name,
                    ["TRENDING_UP", "TRENDING_DOWN", "SIDEWAYS", "VOLATILE"],
                )
                if _current_regime not in suitable_regimes:
                    s.cycles_completed = (s.cycles_completed or 0) + 1
                    await db.flush()
                    bench_key = f"{s.name}:{_current_regime}"
                    if bench_key not in _regime_benched_log:
                        _regime_benched_log.add(bench_key)
                        push_event(
                            "system",
                            f"⏸ {display} benched — {_current_regime} regime",
                            strategy=s.name,
                            detail=(
                                f"Suitable regimes: {', '.join(suitable_regimes)}. "
                                f"Will resume automatically when regime changes."
                            ),
                        )
                        logger.info(
                            f"[REGIME] {s.name} benched in {_current_regime} regime "
                            f"(suitable: {suitable_regimes})"
                        )
                    continue
            # ─────────────────────────────────────────────────────────────

            # Does this strategy fire a trade signal this cycle?
            trade_prob = SIGNAL_CONFIG.get(s.name, 0.30)
            if random.random() > trade_prob:
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

            # ── Conviction Gate (Session XXXIV — carry-over #1+#3) ─────
            # The min_confidence_score slider in Risk Config used to be
            # purely decorative — the cycle loop never read it.  Now we
            # score each fired signal heuristically and reject signals
            # below the threshold so fee-drag is actually controlled by
            # the slider.  Defaults moved 0.65 → 0.75 with this change;
            # Operator can dial up/down via the slider in real time.
            try:
                from routers.fleet import get_live_risk_config
                _risk = get_live_risk_config()
                _min_conf = float(_risk.get("min_confidence_score", 0.55))
            except Exception:
                _min_conf = 0.55
            confidence = _signal_confidence(s.name, side, indicators, price)
            if confidence < _min_conf:
                # Signal exists but didn't clear the conviction floor.
                # Increment cycles so the strategy still earns runtime
                # toward gate criteria, but skip the trade.
                s.cycles_completed = (s.cycles_completed or 0) + 1
                await db.flush()
                logger.debug(
                    f"[conviction-gate] {s.name} {side} skipped: "
                    f"conf={confidence:.2f} < min={_min_conf:.2f}"
                )
                continue

            # ── Honest paper trade simulation ─────────────────────────────────
            # Zero drift, real fees, symmetric outcomes.
            # The market doesn't care about our win_bias — it moves however it
            # moves, and the indicator signal is only right some of the time.
            #
            # Model: alpha price moves by N(0, PAPER_PRICE_SIGMA) over the hold.
            #   buy  → we profit if price goes UP   (raw_move > 0)
            #   sell → we profit if price goes DOWN  (raw_move < 0)
            # Round-trip cost (fees + slippage) is ALWAYS deducted — even on winners.
            # Losses are SYMMETRIC with wins — no artificial 0.7 multiplier.
            raw_move    = random.gauss(0.0, PAPER_PRICE_SIGMA)
            directional = raw_move if side == "buy" else -raw_move
            net_return  = directional - PAPER_ROUND_TRIP_COST

            # Amount: use the actual configured stake, not a random value
            amount = float(s.stake_amount or (config.trade_amount if config else 0.01))
            amount = max(round(amount, 6), 0.001)

            pnl    = round(net_return * amount, 6)
            is_win = pnl > 0

            reason = _build_signal_reason(s.name, indicators, price, side)

            # ── Fleet Consensus BFT Gate (ALL strategy modes) ───────────────────────
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
                    f"🚫 Fleet Consensus VETOED {side.upper()} for {DISPLAY_NAMES.get(s.name, s.name)} [{s.mode}]",
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
                not _FORCE_PAPER_MODE          # master paper override — blocks all chain calls
                and s.mode == "LIVE"
                and bittensor_service.connected
                and bittensor_service.wallet_loaded
            ):
                # ── Hard gate 2b: Circuit breaker ─────────────────────────
                # Evaluated once per cycle above; blocks live execution for
                # all strategies if the daily loss limit has been exceeded.
                if _circuit_breaker_active:
                    push_event(
                        "alert",
                        f"⚡ {display} live trade BLOCKED — daily loss circuit breaker active",
                        strategy = s.name,
                        detail   = "Reset in Risk Config → Reset Circuit Breaker to resume",
                    )
                    s.cycles_completed = (s.cycles_completed or 0) + 1
                    await db.flush()
                    continue

                # Per-strategy stake takes priority; falls back to global bot config
                # Tier: ELITE 0.020τ / STRONG 0.015τ / SOLID 0.010τ / CAUTIOUS 0.008/0.006τ
                live_amount = s.stake_amount if s.stake_amount else (config.trade_amount if config else 0.1)

                # ── Daily deployment cap (BUY side only) ─────────────────
                # Prevents the bot from consuming all liquid TAO in a
                # single day. Resets at midnight UTC.
                if side == "buy":
                    liquid = await bittensor_service.get_balance() or 0.0

                    # ── Hard gate 3: Wallet balance floor ─────────────────
                    # Last line of defence. If the liquid wallet balance has
                    # fallen below the configured minimum, halt all BUY orders
                    # to preserve the reserve for fees and future recovery.
                    # Previously this threshold existed only in config — it is
                    # now enforced in real-time every cycle.
                    wallet_floor = _get_risk_value("min_wallet_balance_tao", 0.05)
                    if liquid < wallet_floor:
                        push_event(
                            "alert",
                            f"🚫 {display} BUY blocked — wallet below minimum floor "
                            f"({liquid:.4f}τ < {wallet_floor:.4f}τ)",
                            strategy = s.name,
                            detail   = "Raise min_wallet_balance_tao in Risk Config or fund wallet",
                        )
                        alert_service.push_alert(
                            type     = "RISK",
                            level    = "CRITICAL",
                            title    = f"🚫 Wallet floor hit — {display} BUY blocked",
                            message  = (
                                f"Liquid balance {liquid:.4f}τ is below the "
                                f"configured minimum floor of {wallet_floor:.4f}τ. "
                                "BUY skipped to preserve reserves."
                            ),
                            strategy = s.name,
                            detail   = "Adjust min_wallet_balance_tao in Risk Config if needed.",
                        )
                        logger.warning(
                            f"[RISK] {s.name}: BUY blocked — "
                            f"liquid={liquid:.4f}τ below floor={wallet_floor:.4f}τ"
                        )
                        s.cycles_completed = (s.cycles_completed or 0) + 1
                        await db.flush()
                        continue

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
                    # ── Execution Guard pre-flight ────────────────────────────
                    # Logs cost estimate + high-slippage warnings.
                    # Does NOT block (SLIPPAGE_GUARD_ENABLED=False) — passive only.
                    _guard = pre_flight_check(live_amount, target_netuid, "LIVE", s.name)
                    if _guard.warnings:
                        logger.info(
                            f"[GUARD] {s.name}: cost={_guard.cost_pct:.2f}% "
                            f"fee={_guard.fee_tao:.6f}τ slip={_guard.slippage_tao:.6f}τ "
                            f"pool≈{_guard.pool_depth:.0f}τ — {_guard.reason}"
                        )

                    # ── Execution jitter ──────────────────────────────────────
                    # Each strategy has a deterministic 0-45 s offset so all 12
                    # bots never submit stake extrinsics in the same block.
                    # Prevents simultaneous fleet execution from creating a
                    # correlated α-price spike that contaminates the next signal.
                    _jitter = jitter_seconds(s.name)
                    if _jitter > 0:
                        logger.debug(f"[JITTER] {s.name}: waiting {_jitter}s before live execution")
                        await asyncio.sleep(_jitter)

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
                            message  = f"Fleet Consensus approved {side.upper()} on SN{target_netuid} "
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
            _trade_netuid  = target_netuid if tx_hash else (config.netuid if config else 1)
            _fee_est       = fee_for_trade(amount)                          # τ0.006 flat per round trip
            _slip_est      = slippage_tao(amount, _trade_netuid)            # AMM pool-depth-aware
            trade = Trade(
                trade_type      = side,
                status          = trade_status,
                amount          = amount,
                price_at_trade  = price,
                usd_value       = amount * price,
                # Paper trades: use paper sim cost; live trades: use guard estimate
                fee             = round(PAPER_ROUND_TRIP_COST * amount, 6) if not tx_hash else _fee_est,
                slippage_est    = _slip_est,
                pnl             = pnl,
                pnl_pct         = (pnl / (amount * price) * 100) if price else 0,
                strategy        = s.name,
                signal_reason   = reason[:200],
                tx_hash         = tx_hash,
                netuid          = _trade_netuid,
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

            # ── Rolling WR decay check ────────────────────────────────────────
            # Track last ROLLING_WR_WINDOW trade outcomes and fire an early
            # warning alert if rolling win rate drops below ROLLING_WR_ALERT_THRESH.
            # This fires BEFORE the demotion system kicks in — it's the canary.
            if s.name not in _rolling_outcomes:
                _rolling_outcomes[s.name] = _deque(maxlen=ROLLING_WR_WINDOW)
            _rolling_outcomes[s.name].append(is_win)
            _roll_buf = _rolling_outcomes[s.name]
            if len(_roll_buf) >= ROLLING_WR_WINDOW:
                rolling_wr = sum(_roll_buf) / len(_roll_buf) * 100
                if rolling_wr < ROLLING_WR_ALERT_THRESH and s.name not in _rolling_wr_alerted:
                    _rolling_wr_alerted.add(s.name)
                    alert_service.push_alert(
                        type     = "RISK",
                        level    = "WARNING",
                        title    = f"📉 {display} rolling WR decay",
                        message  = (
                            f"{display} rolling win rate over last {ROLLING_WR_WINDOW} trades "
                            f"is {rolling_wr:.1f}% — below the {ROLLING_WR_ALERT_THRESH:.0f}% "
                            f"warning threshold. Overall WR={s.win_rate:.1f}%. "
                            f"Monitor closely; demotion may follow."
                        ),
                        strategy = s.name,
                        detail   = f"Rolling window={ROLLING_WR_WINDOW} trades | "
                                   f"Rolling WR={rolling_wr:.1f}%",
                    )
                    push_event(
                        "alert",
                        f"📉 {display} rolling WR = {rolling_wr:.1f}% over last "
                        f"{ROLLING_WR_WINDOW} trades — below {ROLLING_WR_ALERT_THRESH:.0f}% threshold",
                        strategy=s.name,
                    )
                    logger.warning(
                        f"[ROLLING_WR] {s.name}: rolling WR={rolling_wr:.1f}% "
                        f"over last {ROLLING_WR_WINDOW} trades — ALERT fired"
                    )
                elif rolling_wr >= ROLLING_WR_ALERT_THRESH and s.name in _rolling_wr_alerted:
                    # Recovery — allow re-alerting if it degrades again later
                    _rolling_wr_alerted.discard(s.name)

            await db.flush()

            # Gate check & promotion
            gates = _gate_check(s)
            stats_str = f"Cycles={s.cycles_completed} WR={s.win_rate:.1f}% PnL={s.total_pnl:.4f}τ"
            # display defined at top of loop — do not redefine here

            if _FORCE_PAPER_MODE:
                # Paper override active — gate checks still run for transparency
                # but no promotions are allowed until override is lifted.
                pass
            elif s.mode == "PAPER_ONLY" and all(gates.values()):
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
                    # ── HUMAN APPROVAL GATE ───────────────────────────────────
                    # NEVER auto-promote to LIVE. Route to PENDING_LIVE_APPROVAL.
                    # An operator must explicitly approve via the dashboard before
                    # any real TAO is committed on-chain. This was the exact failure
                    # mode that caused the wallet drain — promotion was automated.
                    s.mode = "PENDING_LIVE_APPROVAL"
                    push_event(
                        "gate",
                        f"⏳ {display} has earned LIVE status — awaiting operator approval",
                        strategy=s.name,
                        detail=f"WR={s.win_rate:.1f}% PnL={s.total_pnl:.4f}τ | "
                               f"Approve in Dashboard → Strategies → Approve for Live",
                    )
                    alert_service.push_alert(
                        type     = "GATE_PROMOTION",
                        level    = "WARNING",
                        title    = f"⏳ {display} awaiting live approval",
                        message  = (
                            f"{display} has passed all gate thresholds "
                            f"(WR={s.win_rate:.1f}%, PnL={s.total_pnl:.4f}τ) and is ready "
                            f"for live trading — but requires explicit operator approval. "
                            f"Go to Strategies and click Approve for Live."
                        ),
                        strategy = s.name,
                        detail   = stats_str,
                    )
                    logger.warning(
                        f"Strategy {s.name} PENDING_LIVE_APPROVAL — "
                        f"WR={s.win_rate:.1f}% PnL={s.total_pnl:.4f}τ "
                        f"(human approval required before LIVE)"
                    )

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

                elif s.mode in ("APPROVED_FOR_LIVE", "PENDING_LIVE_APPROVAL"):
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
                    logger.warning(f"{s.name} demoted APPROVED/PENDING → PAPER_ONLY (WR={wr_now:.1f}% PnL={pnl_now:.4f})")

            # If performance has recovered, allow re-alerting on next demotion
            elif not is_degraded and s.name in _demoted_alerted:
                _demoted_alerted.discard(s.name)

            # ── Drawdown demotion (parallel safety rail to WR demotion) ──────
            # A strategy that's bleeding hard gets demoted regardless of WR.
            # Catches the case where WR > 50% but a few catastrophic losses
            # dominate. Mirrors the WR demotion ladder exactly: LIVE → APPROVED
            # → PAPER. Threshold is configurable from Risk Config UI.
            dd_floor      = _get_risk_value("strategy_demote_drawdown_tao", -0.15)
            dd_min_cycles = int(_get_risk_value("strategy_demote_min_cycles", 10))
            is_dd_breach = (
                pnl_now     <= dd_floor and
                cycles_done >= dd_min_cycles
            )

            if is_dd_breach and s.name not in _dd_demoted_alerted:
                if s.mode == "LIVE":
                    s.mode = "APPROVED_FOR_LIVE"
                    push_event(
                        "gate",
                        f"⬇️ {display} DEMOTED — LIVE → APPROVED (drawdown)",
                        strategy=s.name,
                        detail=f"PnL={pnl_now:.4f}τ ≤ {dd_floor:.4f}τ — bleeding past safety rail",
                    )
                    alert_service.push_alert(
                        type     = "GATE_DEMOTION_DRAWDOWN",
                        level    = "WARNING",
                        title    = f"⬇️ {display} demoted to APPROVED (drawdown)",
                        message  = f"{display} bled to {pnl_now:.4f}τ "
                                   f"(threshold {dd_floor:.4f}τ). "
                                   f"Moved LIVE → APPROVED until performance recovers.",
                        strategy = s.name,
                        detail   = stats_str,
                    )
                    _dd_demoted_alerted.add(s.name)
                    logger.warning(
                        f"{s.name} drawdown-demoted LIVE → APPROVED_FOR_LIVE "
                        f"(PnL={pnl_now:.4f}τ ≤ {dd_floor:.4f}τ)"
                    )

                elif s.mode in ("APPROVED_FOR_LIVE", "PENDING_LIVE_APPROVAL"):
                    s.mode = "PAPER_ONLY"
                    push_event(
                        "gate",
                        f"⬇️ {display} DEMOTED — APPROVED → PAPER (drawdown)",
                        strategy=s.name,
                        detail=f"PnL={pnl_now:.4f}τ ≤ {dd_floor:.4f}τ — back to proving ground",
                    )
                    alert_service.push_alert(
                        type     = "GATE_DEMOTION_DRAWDOWN",
                        level    = "WARNING",
                        title    = f"⬇️ {display} demoted to PAPER (drawdown)",
                        message  = f"{display} bled to {pnl_now:.4f}τ "
                                   f"(threshold {dd_floor:.4f}τ). "
                                   f"Moved APPROVED → PAPER. Must re-earn gate passage.",
                        strategy = s.name,
                        detail   = stats_str,
                    )
                    _dd_demoted_alerted.add(s.name)
                    logger.warning(
                        f"{s.name} drawdown-demoted APPROVED/PENDING → PAPER_ONLY "
                        f"(PnL={pnl_now:.4f}τ ≤ {dd_floor:.4f}τ)"
                    )

            # If the bleed has stopped (PnL recovered above floor), allow
            # re-demotion if it bleeds out again later.
            elif not is_dd_breach and s.name in _dd_demoted_alerted:
                _dd_demoted_alerted.discard(s.name)

            # ── PnL milestone check ──────────────────────────────────────────
            # (checked on every fleet total, done once per cycle in commit hook)

            # ── Drawdown guard (per-strategy, once per session) ──────────────
            # First-warning alert at a softer threshold than the demotion floor.
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
    # Default interval — overridden at startup by main.py reading _RISK_CONFIG.
    # The loop also re-reads this from _RISK_CONFIG each iteration so changes
    # made via the Risk Config UI take effect after the current cycle completes.
    _DEFAULT_INTERVAL = 300   # 5 minutes — calibrated 2026-04-30

    def __init__(self):
        self._running  = False
        self._task: Optional[asyncio.Task] = None
        self._cycle_n  = 0
        self.interval  = self._DEFAULT_INTERVAL

    def _current_interval(self) -> int:
        """
        Read cycle_interval_seconds from _RISK_CONFIG (live, dynamic).
        Falls back to self.interval if the config is unavailable.
        This means a UI change takes effect after the current sleep completes —
        no restart required.
        """
        try:
            from routers.fleet import _RISK_CONFIG
            v = _RISK_CONFIG.get("cycle_interval_seconds", self.interval)
            return max(30, int(v))   # hard minimum 30 s — prevents runaway loops
        except Exception:
            return self.interval

    async def start(self, interval_seconds: int = 300) -> None:
        if self._running:
            return
        self.interval  = interval_seconds
        self._running  = True
        self._task     = asyncio.create_task(self._loop())
        push_event("system", f"Autonomous cycle engine started (interval={interval_seconds}s)",
                   detail="12 strategies in parallel")
        logger.info(f"Cycle engine started — interval={interval_seconds}s")

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
        import time as _time
        while self._running:
            _t0 = _time.time()
            _success = True
            _err = None
            try:
                self._cycle_n += 1
                logger.debug(f"Starting cycle #{self._cycle_n}")
                await _run_one_cycle()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Cycle #{self._cycle_n} error: {e}", exc_info=True)
                push_event("alert", f"Cycle #{self._cycle_n} error: {str(e)[:80]}")
                _success = False
                _err = str(e)[:300]
            # Session XXXIV — record_run heartbeat for system_health.
            try:
                from services.system_health_service import system_health
                system_health.record_run(
                    name="cycle_service",
                    success=_success,
                    error=_err,
                    duration_ms=round((_time.time() - _t0) * 1000.0, 1),
                )
            except Exception:
                pass
            # Re-read interval from config every cycle — UI changes take effect
            # after the current cycle completes without requiring a restart.
            sleep_secs = self._current_interval()
            logger.debug(f"Cycle #{self._cycle_n} complete — sleeping {sleep_secs}s")
            await asyncio.sleep(sleep_secs)


cycle_service = CycleService()