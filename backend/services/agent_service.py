"""
II Agent — Master Orchestrator
================================
The top-level intelligence layer of the autonomous trading system.

Responsibilities:
  1. Market Regime Detection   — BULL / BEAR / SIDEWAYS / VOLATILE
  2. Fleet Health Monitoring   — per-strategy health classification
  3. Consensus Intelligence    — interprets OpenClaw voting trends
  4. Autonomous Observations   — natural-language decision log (runs every 5 min)
  5. Recommendation Engine     — actionable strategy directives
  6. System Heartbeat          — validates all subsystems are healthy

Architecture:
  II Agent (this file)
    ├── observes → price_service (live TAO price + indicators)
    ├── observes → cycle_service (cycle count, bot stats via DB)
    ├── observes → consensus_service (approval rates, round history)
    └── writes  → activity_service (observations as "signal" events)
                → internal observation ring buffer (100 items)
"""

import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

from sqlalchemy import select, func

from db.database import AsyncSessionLocal
from models.strategy import Strategy
from models.trade import Trade
from services.price_service import price_service
from services.activity_service import push_event
from services.consensus_service import consensus_service
from services.alert_service import alert_service

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
MAX_OBSERVATIONS    = 100
MAX_RECOMMENDATIONS = 20
ANALYSIS_INTERVAL   = 300   # seconds (5 min)

# Market regime thresholds
BULL_RSI_MIN   = 55.0
BEAR_RSI_MAX   = 45.0
VOLATILE_RANGE = 8.0   # RSI swing in 1 cycle

# Fleet health classification
HEALTH_HOT        = "HOT"
HEALTH_HEALTHY    = "HEALTHY"
HEALTH_WATCHING   = "WATCHING"
HEALTH_STRUGGLING = "STRUGGLING"
HEALTH_INACTIVE   = "INACTIVE"

REGIME_BULL      = "BULL"
REGIME_BEAR      = "BEAR"
REGIME_SIDEWAYS  = "SIDEWAYS"
REGIME_VOLATILE  = "VOLATILE"
REGIME_UNKNOWN   = "UNKNOWN"

REGIME_COLORS = {
    REGIME_BULL:     "#10b981",
    REGIME_BEAR:     "#ef4444",
    REGIME_SIDEWAYS: "#f59e0b",
    REGIME_VOLATILE: "#8b5cf6",
    REGIME_UNKNOWN:  "#6b7280",
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


# ── Data structures ───────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _strategy_health(s: Strategy) -> str:
    wr  = s.win_rate   or 0.0
    pnl = s.total_pnl  or 0.0
    cyc = s.cycles_completed or 0

    if cyc < 3:
        return HEALTH_INACTIVE
    if wr >= 68 and pnl > 0.05:
        return HEALTH_HOT
    if wr >= 53 and pnl >= 0:
        return HEALTH_HEALTHY
    if wr >= 43:
        return HEALTH_WATCHING
    return HEALTH_STRUGGLING


# ── Observation templates ─────────────────────────────────────────────────────

def _regime_observation(regime: str, rsi: Optional[float], macd_hist: Optional[float], price: float) -> str:
    rsi_str  = f"RSI={rsi:.1f}" if rsi else ""
    macd_str = f"MACD_hist={macd_hist:+.5f}" if macd_hist else ""
    indicators = " · ".join(x for x in [rsi_str, macd_str] if x)
    msgs = {
        REGIME_BULL:     f"Market regime confirmed BULL. TAO @ ${price:.2f}. {indicators}. Increasing weight on momentum and breakout strategies.",
        REGIME_BEAR:     f"Market regime confirmed BEAR. TAO @ ${price:.2f}. {indicators}. Elevating contrarian and mean-reversion strategies. Tightening consensus threshold.",
        REGIME_SIDEWAYS: f"Market regime SIDEWAYS. TAO @ ${price:.2f}. {indicators}. Yield maximizer and balanced risk strategies optimal in range-bound conditions.",
        REGIME_VOLATILE: f"VOLATILE conditions detected. TAO @ ${price:.2f}. {indicators}. Activating volatility arb. Increasing HOLD vote bias across council.",
        REGIME_UNKNOWN:  f"Regime undetermined. TAO @ ${price:.2f}. Insufficient indicator data. Maintaining baseline allocation.",
    }
    return msgs.get(regime, msgs[REGIME_UNKNOWN])


def _fleet_observation(hot: List[str], struggling: List[str], promotable: List[str], total_pnl: float) -> str:
    parts = []
    if hot:
        names = ", ".join(DISPLAY_NAMES.get(n, n) for n in hot[:3])
        parts.append(f"🔥 Top performers: {names}")
    if struggling:
        names = ", ".join(DISPLAY_NAMES.get(n, n) for n in struggling[:2])
        parts.append(f"⚠️ Watching underperformers: {names}")
    if promotable:
        names = ", ".join(DISPLAY_NAMES.get(n, n) for n in promotable)
        parts.append(f"🎯 {len(promotable)} strategies eligible for promotion review")
    parts.append(f"Fleet cumulative PnL: {total_pnl:+.4f} τ")
    return " | ".join(parts) if parts else "Fleet nominal — no significant deviations detected."


def _consensus_observation(stats: Dict) -> str:
    total    = stats.get("total_rounds", 0)
    approval = stats.get("approval_rate_pct", 0.0)
    buy_v    = stats.get("total_buy_votes", 0)
    sell_v   = stats.get("total_sell_votes", 0)
    hold_v   = stats.get("total_hold_votes", 0)

    if total == 0:
        return "OpenClaw council has not been convened yet. Awaiting first LIVE strategy signal."

    bias = "BULLISH" if buy_v > sell_v else ("BEARISH" if sell_v > buy_v else "NEUTRAL")
    return (
        f"OpenClaw council — {total} rounds completed. Approval rate: {approval:.1f}%. "
        f"Vote distribution: {buy_v}B / {sell_v}S / {hold_v}H. "
        f"Council consensus bias: {bias}."
    )


def _generate_recommendation(hot: List[str], struggling: List[str], regime: str, approval: float) -> Optional[Dict]:
    """Generate one actionable recommendation based on current state."""
    choices = []

    if struggling:
        s = random.choice(struggling)
        choices.append({
            "type":     "WARNING",
            "strategy": s,
            "action":   f"Monitor {DISPLAY_NAMES.get(s, s)} — win rate below threshold. Consider reducing trade allocation.",
            "priority": "HIGH",
        })

    if hot:
        s = random.choice(hot)
        choices.append({
            "type":     "OPPORTUNITY",
            "strategy": s,
            "action":   f"{DISPLAY_NAMES.get(s, s)} is outperforming. Consider increasing position size multiplier.",
            "priority": "MEDIUM",
        })

    if regime == REGIME_BULL:
        choices.append({
            "type":     "REGIME",
            "strategy": None,
            "action":   "BULL regime active — momentum_cascade and breakout_hunter have highest edge. Prioritise their signals.",
            "priority": "MEDIUM",
        })
    elif regime == REGIME_BEAR:
        choices.append({
            "type":     "REGIME",
            "strategy": None,
            "action":   "BEAR regime — contrarian_flow and mean_reversion historically outperform. Increase their consensus weight.",
            "priority": "HIGH",
        })
    elif regime == REGIME_VOLATILE:
        choices.append({
            "type":     "REGIME",
            "strategy": None,
            "action":   "Volatile conditions — raise OpenClaw supermajority to 8/12 until regime stabilises.",
            "priority": "HIGH",
        })

    if approval < 30:
        choices.append({
            "type":     "CONSENSUS",
            "strategy": None,
            "action":   f"OpenClaw approval rate critically low ({approval:.1f}%). Fleet is divided — review market conditions before LIVE execution.",
            "priority": "HIGH",
        })
    elif approval > 80:
        choices.append({
            "type":     "CONSENSUS",
            "strategy": None,
            "action":   f"OpenClaw approval rate high ({approval:.1f}%). Strong fleet consensus — conditions favourable for LIVE trading.",
            "priority": "LOW",
        })

    return random.choice(choices) if choices else None


# ── II Agent Service ──────────────────────────────────────────────────────────

class IIAgentService:
    def __init__(self):
        self._running           = False
        self._task: Optional[asyncio.Task] = None
        self._observations:     List[Dict] = []
        self._recommendations:  List[Dict] = []
        self._analysis_count    = 0
        self._last_regime       = REGIME_UNKNOWN
        self._last_analysis_at: Optional[str] = None
        self._alerted_keys:     set = set()   # dedup HOT/STRUGGLING alerts

        # Live state (updated each cycle)
        self.current_regime:   str            = REGIME_UNKNOWN
        self.regime_color:     str            = REGIME_COLORS[REGIME_UNKNOWN]
        self.fleet_health:     Dict[str, str] = {}
        self.total_pnl:        float          = 0.0
        self.cycle_count:      int            = 0

    # ── Regime detection ──────────────────────────────────────────────────────

    def _detect_regime(self, rsi: Optional[float], macd_hist: Optional[float], price_history: List[float]) -> str:
        # Price trend is always available — use it as fast-path
        trend_up = False
        trend_dn = False
        trend_strong = False

        if len(price_history) >= 3:
            recent   = price_history[-min(6, len(price_history)):]
            first, last = recent[0], recent[-1]
            pct_change = ((last - first) / first * 100) if first else 0
            trend_up     = last > first
            trend_dn     = last < first
            trend_strong = abs(pct_change) > 0.3   # >0.3% move is meaningful

        macd_bull = macd_hist is not None and macd_hist > 0
        macd_bear = macd_hist is not None and macd_hist < 0

        # ── Full RSI-based detection (15+ data points) ──
        if rsi is not None:
            if rsi > 68 or rsi < 32:
                return REGIME_VOLATILE
            if rsi >= BULL_RSI_MIN and (macd_bull or trend_up):
                return REGIME_BULL
            if rsi <= BEAR_RSI_MAX and (macd_bear or trend_dn):
                return REGIME_BEAR
            return REGIME_SIDEWAYS

        # ── Fast-path regime (RSI warming up, use price trend + MACD) ──
        if len(price_history) >= 2:
            if trend_strong and trend_up and (macd_bull or macd_hist is None):
                return REGIME_BULL
            if trend_strong and trend_dn and (macd_bear or macd_hist is None):
                return REGIME_BEAR
            if macd_bull and trend_up:
                return REGIME_BULL
            if macd_bear and trend_dn:
                return REGIME_BEAR
            # Tiny movement → sideways
            return REGIME_SIDEWAYS

        return REGIME_UNKNOWN

    # ── Core analysis ─────────────────────────────────────────────────────────

    async def analyze(self) -> Dict[str, Any]:
        """
        Run a full II Agent analysis cycle.
        Returns a structured report and side-effects:
          - Appends observations to ring buffer
          - Fires activity events
          - Updates recommendations
        """
        self._analysis_count += 1
        analysis_id = self._analysis_count
        now = _now_iso()

        price      = price_service.current_price or 0.0
        indicators = price_service.compute_indicators()
        rsi        = indicators.get("rsi_14")
        macd       = indicators.get("macd")
        macd_sig   = indicators.get("macd_signal")
        macd_hist  = (macd - macd_sig) if (macd and macd_sig) else None
        px_history = price_service.get_price_history_list()[-15:]

        # ── Regime ──
        regime       = self._detect_regime(rsi, macd_hist, px_history)
        regime_changed = (regime != self._last_regime and self._last_regime != REGIME_UNKNOWN)
        self._last_regime    = regime
        self.current_regime  = regime
        self.regime_color    = REGIME_COLORS.get(regime, "#6b7280")
        self._last_analysis_at = now

        # ── Fleet health (from DB) ──
        hot_bots        = []
        struggling_bots = []
        promotable_bots = []
        fleet_summary   = []
        total_pnl       = 0.0
        total_trades    = 0

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Strategy))
            strategies: List[Strategy] = result.scalars().all()

            for s in strategies:
                health = _strategy_health(s)
                self.fleet_health[s.name] = health
                pnl  = s.total_pnl or 0.0
                wr   = s.win_rate  or 0.0
                cyc  = s.cycles_completed or 0
                total_pnl   += pnl
                total_trades += s.total_trades or 0

                fleet_summary.append({
                    "name":        s.name,
                    "display_name": DISPLAY_NAMES.get(s.name, s.name),
                    "mode":        s.mode or "PAPER_ONLY",
                    "health":      health,
                    "win_rate":    wr,
                    "total_pnl":   round(pnl, 6),
                    "cycles":      cyc,
                    "total_trades": s.total_trades or 0,
                })

                if health == HEALTH_HOT:
                    hot_bots.append(s.name)
                    # Alert only once per session when first classified HOT
                    _hot_key = f"hot_{s.name}"
                    if _hot_key not in self._alerted_keys:
                        self._alerted_keys.add(_hot_key)
                        alert_service.strategy_hot(
                            s.name, DISPLAY_NAMES.get(s.name, s.name),
                            s.win_rate or 0, s.total_pnl or 0,
                        )
                elif health == HEALTH_STRUGGLING:
                    struggling_bots.append(s.name)
                    # Alert once per session when first flagged
                    _str_key = f"struggling_{s.name}"
                    if _str_key not in self._alerted_keys:
                        self._alerted_keys.add(_str_key)
                        alert_service.strategy_struggling(
                            s.name, DISPLAY_NAMES.get(s.name, s.name),
                            s.win_rate or 0, s.total_pnl or 0,
                        )

                # Promotable = PAPER_ONLY but all gates would pass
                if s.mode == "PAPER_ONLY":
                    wins = s.win_trades or 0
                    losses = s.loss_trades or 0
                    if (cyc >= 10 and wr >= 55 and (wins - losses) >= 2 and pnl > 0):
                        promotable_bots.append(s.name)

            # Trade count from last hour for velocity metric
            from sqlalchemy import text
            velocity_res = await db.execute(
                text("SELECT COUNT(*) FROM trades WHERE executed_at > datetime('now', '-1 hour')")
            )
            velocity = velocity_res.scalar() or 0

        self.total_pnl  = round(total_pnl, 6)
        self.cycle_count += 1

        # ── Consensus intel ──
        c_stats    = consensus_service.get_stats()
        c_approval = c_stats.get("approval_rate_pct", 0.0)

        # ── Build observations ──
        obs_list = []

        # 1. Regime observation
        obs_list.append(self._push_observation(
            level   = "REGIME",
            message = _regime_observation(regime, rsi, macd_hist, price),
            data    = {"regime": regime, "rsi": rsi, "price": price},
        ))

        # 2. Fleet observation
        obs_list.append(self._push_observation(
            level   = "FLEET",
            message = _fleet_observation(hot_bots, struggling_bots, promotable_bots, total_pnl),
            data    = {"hot": hot_bots, "struggling": struggling_bots, "promotable": promotable_bots},
        ))

        # 3. Consensus observation
        obs_list.append(self._push_observation(
            level   = "CONSENSUS",
            message = _consensus_observation(c_stats),
            data    = c_stats,
        ))

        # 4. Regime change alert
        if regime_changed:
            self._push_observation(
                level   = "ALERT",
                message = f"⚡ Regime shift detected: {self._last_regime} → {regime}. Rebalancing strategy weights.",
                data    = {"from": self._last_regime, "to": regime},
            )
            push_event(
                "alert",
                f"⚡ II Agent: Regime shifted to {regime}",
                detail = f"TAO=${price:.2f} RSI={f'{rsi:.1f}' if rsi else 'n/a'}",
            )
            alert_service.regime_shift(
                from_regime = self._last_regime,
                to_regime   = regime,
                price       = price,
                rsi         = rsi,
            )

        # 5. Push activity event
        push_event(
            "signal",
            f"🧠 II Agent #{analysis_id} — Regime: {regime} | Fleet PnL: {total_pnl:+.4f}τ | Velocity: {velocity} trades/hr",
            detail = f"Hot: {len(hot_bots)} | Struggling: {len(struggling_bots)} | Consensus approval: {c_approval:.1f}%",
        )

        # ── Recommendation ──
        rec = _generate_recommendation(hot_bots, struggling_bots, regime, c_approval)
        if rec:
            rec["timestamp"] = now
            rec["analysis_id"] = analysis_id
            self._recommendations.insert(0, rec)
            if len(self._recommendations) > MAX_RECOMMENDATIONS:
                self._recommendations.pop()

        return {
            "analysis_id":    analysis_id,
            "timestamp":      now,
            "regime":         regime,
            "regime_color":   REGIME_COLORS.get(regime, "#6b7280"),
            "price":          price,
            "rsi":            rsi,
            "fleet_summary":  fleet_summary,
            "fleet_pnl":      round(total_pnl, 6),
            "total_trades":   total_trades,
            "velocity":       velocity,
            "hot_bots":       hot_bots,
            "struggling_bots": struggling_bots,
            "promotable_bots": promotable_bots,
            "consensus":      c_stats,
            "observations":   [o for o in obs_list if o],
        }

    def _push_observation(self, level: str, message: str, data: Optional[Dict] = None) -> Dict:
        obs = {
            "id":        len(self._observations) + 1,
            "level":     level,   # REGIME | FLEET | CONSENSUS | ALERT | SYSTEM
            "message":   message,
            "data":      data or {},
            "timestamp": _now_iso(),
        }
        self._observations.insert(0, obs)
        if len(self._observations) > MAX_OBSERVATIONS:
            self._observations.pop()
        return obs

    # ── Query helpers ─────────────────────────────────────────────────────────

    def get_observations(self, limit: int = 30) -> List[Dict]:
        return self._observations[:limit]

    def get_recommendations(self) -> List[Dict]:
        return list(self._recommendations)

    def get_status(self) -> Dict:
        return {
            "analysis_count":    self._analysis_count,
            "last_analysis_at":  self._last_analysis_at,
            "current_regime":    self.current_regime,
            "regime_color":      self.regime_color,
            "total_pnl":         self.total_pnl,
            "is_running":        self._running,
            "observation_count": len(self._observations),
            "recommendation_count": len(self._recommendations),
            "fleet_health":      self.fleet_health,
            "price":             price_service.current_price,
        }

    # ── Scheduler ─────────────────────────────────────────────────────────────

    async def start(self, interval: int = ANALYSIS_INTERVAL) -> None:
        if self._running:
            return
        self._running = True
        self._interval = interval
        self._task = asyncio.create_task(self._loop())
        self._push_observation(
            level="SYSTEM",
            message="🧠 II Agent online — Master orchestrator initialised. Monitoring fleet, market regime, and consensus engine.",
        )
        push_event("system", "🧠 II Agent orchestrator online", detail=f"Analysis interval: {interval}s")
        logger.info(f"II Agent started (interval={interval}s)")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("II Agent stopped")

    async def _loop(self) -> None:
        # Initial analysis after a short warmup
        await asyncio.sleep(15)
        while self._running:
            try:
                await self.analyze()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"II Agent analysis error: {e}", exc_info=True)
                self._push_observation(level="ALERT", message=f"Analysis error: {str(e)[:120]}")
            await asyncio.sleep(self._interval)


agent_service = IIAgentService()