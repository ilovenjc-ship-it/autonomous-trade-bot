"""
Trading strategies — each strategy returns a signal dict:
  { "action": "buy" | "sell" | "hold", "reason": str, "confidence": float }
"""
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)


class Signal:
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"


def momentum_strategy(
    prices: List[float],
    indicators: Dict[str, Any],
    params: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Momentum: buy when RSI < oversold and price crosses above short EMA.
    Sell when RSI > overbought or price drops below stop-loss EMA.
    """
    rsi_oversold = params.get("rsi_oversold", 35)
    rsi_overbought = params.get("rsi_overbought", 70)
    ema_short = params.get("ema_short", 9)
    ema_long = params.get("ema_long", 21)

    rsi = indicators.get("rsi_14")
    ema9 = indicators.get("ema_9")
    ema21 = indicators.get("ema_21")
    current_price = prices[-1] if prices else None

    if not all([rsi, ema9, ema21, current_price]):
        return {"action": Signal.HOLD, "reason": "Insufficient indicator data", "confidence": 0.0}

    if rsi < rsi_oversold and ema9 > ema21 and current_price > ema9:
        return {
            "action": Signal.BUY,
            "reason": f"RSI={rsi:.1f} oversold + EMA9({ema9:.2f}) > EMA21({ema21:.2f})",
            "confidence": min(1.0, (rsi_oversold - rsi) / rsi_oversold + 0.5),
        }

    if rsi > rsi_overbought or (ema9 < ema21 and current_price < ema9):
        return {
            "action": Signal.SELL,
            "reason": f"RSI={rsi:.1f} overbought or EMA death-cross",
            "confidence": min(1.0, (rsi - rsi_overbought) / (100 - rsi_overbought) + 0.5) if rsi > rsi_overbought else 0.6,
        }

    return {"action": Signal.HOLD, "reason": f"No signal (RSI={rsi:.1f})", "confidence": 0.0}


def mean_reversion_strategy(
    prices: List[float],
    indicators: Dict[str, Any],
    params: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Mean reversion: buy when price touches lower Bollinger Band, sell at upper.
    """
    bb_upper = indicators.get("bb_upper")
    bb_lower = indicators.get("bb_lower")
    bb_mid = indicators.get("bb_mid")
    current_price = prices[-1] if prices else None

    if not all([bb_upper, bb_lower, bb_mid, current_price]):
        return {"action": Signal.HOLD, "reason": "Bollinger Bands unavailable", "confidence": 0.0}

    band_width = bb_upper - bb_lower
    if band_width == 0:
        return {"action": Signal.HOLD, "reason": "Zero band width", "confidence": 0.0}

    if current_price <= bb_lower:
        conf = min(1.0, (bb_lower - current_price) / band_width * 10 + 0.6)
        return {
            "action": Signal.BUY,
            "reason": f"Price ${current_price:.2f} at/below BB lower ${bb_lower:.2f}",
            "confidence": conf,
        }

    if current_price >= bb_upper:
        conf = min(1.0, (current_price - bb_upper) / band_width * 10 + 0.6)
        return {
            "action": Signal.SELL,
            "reason": f"Price ${current_price:.2f} at/above BB upper ${bb_upper:.2f}",
            "confidence": conf,
        }

    return {"action": Signal.HOLD, "reason": f"Price within bands (mid=${bb_mid:.2f})", "confidence": 0.0}


def macd_strategy(
    prices: List[float],
    indicators: Dict[str, Any],
    params: Dict[str, Any],
) -> Dict[str, Any]:
    """
    MACD crossover strategy.
    """
    macd = indicators.get("macd")
    signal = indicators.get("macd_signal")

    if macd is None or signal is None:
        return {"action": Signal.HOLD, "reason": "MACD unavailable", "confidence": 0.0}

    hist = macd - signal

    if hist > 0 and abs(hist) > params.get("min_histogram", 0.001):
        return {
            "action": Signal.BUY,
            "reason": f"MACD({macd:.4f}) > Signal({signal:.4f}), hist={hist:.4f}",
            "confidence": min(1.0, abs(hist) * 100 + 0.5),
        }

    if hist < 0 and abs(hist) > params.get("min_histogram", 0.001):
        return {
            "action": Signal.SELL,
            "reason": f"MACD({macd:.4f}) < Signal({signal:.4f}), hist={hist:.4f}",
            "confidence": min(1.0, abs(hist) * 100 + 0.5),
        }

    return {"action": Signal.HOLD, "reason": f"MACD histogram flat ({hist:.5f})", "confidence": 0.0}


def rsi_strategy(
    prices: List[float],
    indicators: Dict[str, Any],
    params: Dict[str, Any],
) -> Dict[str, Any]:
    """Pure RSI strategy."""
    rsi = indicators.get("rsi_14")
    oversold = params.get("oversold", 30)
    overbought = params.get("overbought", 70)

    if rsi is None:
        return {"action": Signal.HOLD, "reason": "RSI unavailable", "confidence": 0.0}

    if rsi < oversold:
        return {
            "action": Signal.BUY,
            "reason": f"RSI={rsi:.1f} below oversold threshold {oversold}",
            "confidence": min(1.0, (oversold - rsi) / oversold + 0.5),
        }
    if rsi > overbought:
        return {
            "action": Signal.SELL,
            "reason": f"RSI={rsi:.1f} above overbought threshold {overbought}",
            "confidence": min(1.0, (rsi - overbought) / (100 - overbought) + 0.5),
        }

    return {"action": Signal.HOLD, "reason": f"RSI neutral at {rsi:.1f}", "confidence": 0.0}


STRATEGY_MAP = {
    "momentum": momentum_strategy,
    "mean_reversion": mean_reversion_strategy,
    "macd": macd_strategy,
    "rsi": rsi_strategy,
}

DEFAULT_STRATEGIES = [
    {
        "name": "momentum_cascade",
        "display_name": "Momentum Cascade",
        "description": "Volume spike + RSI crossover + MACD confirmation. Exits on ATR trailing stop.",
        "parameters": {"rsi_threshold": 55, "volume_ratio": 2.0, "adx_min": 25, "atr_stop": 2.0, "atr_target": 3.0},
        "is_active": False,
        "mode": "PAPER_ONLY",
        "win_trades":  0, "loss_trades":  0, "total_trades":  0,
        "win_rate":  0.0, "total_pnl":  0.0,
    },
    {
        "name": "dtao_flow_momentum",
        "display_name": "dTAO Flow Momentum",
        "description": "Tracks dTAO flow signals across subnets. Buys on positive momentum divergence.",
        "parameters": {"flow_threshold": 100, "momentum_period": 5, "min_pool_depth": 20},
        "is_active": False,
        "mode": "PAPER_ONLY",
        "win_trades":  0, "loss_trades":  0, "total_trades":  0,
        "win_rate":  0.0, "total_pnl":  0.0,
    },
    {
        "name": "liquidity_hunter",
        "display_name": "Liquidity Hunter",
        "description": "Identifies high-liquidity subnets with anomalous flow. Enters on depth imbalance.",
        "parameters": {"min_pool_depth": 1000, "flow_imbalance": 1.5, "price_impact_max": 0.01},
        "is_active": False,
        "mode": "PAPER_ONLY",
        "win_trades":  0, "loss_trades":  0, "total_trades":  0,
        "win_rate":  0.0, "total_pnl":  0.0,
    },
    {
        "name": "emission_momentum",
        "display_name": "Emission Momentum",
        "description": "Targets subnets with rising emission rates. Enters before validator rebalancing.",
        "parameters": {"emission_threshold": 0.12, "momentum_bars": 3, "max_drawdown": 0.05},
        "is_active": True,
        "mode": "PAPER_ONLY",
        "win_trades":  0, "loss_trades":  0, "total_trades":  0,
        "win_rate":  0.0, "total_pnl":  0.0,
    },
    {
        "name": "balanced_risk",
        "display_name": "Balanced Risk",
        "description": "Equal-weight exposure across top subnets. Kelly criterion position sizing.",
        "parameters": {"kelly_fraction": 0.5, "max_positions": 4, "rebalance_threshold": 0.05},
        "is_active": True,
        "mode": "PAPER_ONLY",
        "win_trades":  0, "loss_trades":  0, "total_trades":  0,
        "win_rate":  0.0, "total_pnl":  0.0,
    },
    {
        # Session XXXVIII: re-enabled. Was set is_active=False in Session XXXIV
        # to stop dormant strategies from absorbing 24% allocation each via the
        # 50.0 bootstrap-score quirk in promotion_service. That quirk is fixed
        # — bootstrap is now 10.0 and inactive strategies are routed to
        # ALLOC_FLOOR. Mean Reversion's RSI<33 / RSI>67 trigger is sound and
        # the regime-suitability gate (SIDEWAYS, VOLATILE) is correct. Wake up.
        "name": "mean_reversion",
        "display_name": "Mean Reversion",
        "description": "BB squeeze + Z-score extreme entry. Target middle band. Stop at 1.5x band distance.",
        "parameters": {"bb_period": 20, "bb_std": 2, "zscore_entry": 2.0, "zscore_exit": 0.0},
        "is_active": True,
        "mode": "PAPER_ONLY",
        "win_trades":  0, "loss_trades":  0, "total_trades":  0,
        "win_rate":  0.0, "total_pnl":  0.0,
    },
    {
        "name": "volatility_arb",
        "display_name": "Volatility Arb",
        "description": "Exploits implied vs realised vol spread across correlated subnet pairs.",
        "parameters": {"vol_threshold": 0.3, "correlation_min": 0.7, "holding_period": 2},
        "is_active": False,
        "mode": "PAPER_ONLY",
        "win_trades":  0, "loss_trades":  0, "total_trades":  0,
        "win_rate":  0.0, "total_pnl":  0.0,
    },
    {
        "name": "sentiment_surge",
        "display_name": "Sentiment Surge",
        "description": "NLP sentiment + price momentum hybrid. Targets announcement alpha.",
        "parameters": {"sentiment_threshold": 0.4, "momentum_confirm": True, "decay_hours": 4},
        "is_active": True,
        "mode": "PAPER_ONLY",
        "win_trades":  0, "loss_trades":  0, "total_trades":  0,
        "win_rate":  0.0, "total_pnl":  0.0,
    },
    {
        # Day 8 Round 4 rewrite (2026-05-21).
        # Pre-rewrite, this was a TAO-only strategy (price vs SMA50 + RSI)
        # with three structural defects: asymmetric BUY-AND / SELL-OR
        # triggers (5.2:1 SELL:BUY ratio over 193 live trades, both sides
        # negative-edge), thresholds so loose it bought RSI 80+ and sold
        # RSI <10, and an EMA fallback that silently cloned yield_maximizer
        # when SMA50 wasn't ready. The original description ("TAO/subnet
        # correlation divergence vs BTC macro trend") was fiction — no BTC
        # reference existed in the code. The rewrite wires BTC into
        # price_service alongside TAO and trades the divergence: BUY when
        # BTC outperforms TAO by ≥divergence_threshold% over the last 24h
        # (TAO catch-up long), SELL when BTC underperforms TAO by ≥same
        # threshold (TAO catch-down short). Returns no signal when the
        # macro reference is unavailable — no falsely-confident fallback.
        "name": "macro_correlation",
        "display_name": "Macro Correlation",
        "description": (
            "Cross-asset divergence: BUY when BTC outperforms TAO by "
            "≥divergence_threshold % over the last 24h, SELL when BTC "
            "underperforms TAO by the same. Abstains when the macro "
            "reference is missing or BTC moved less than min_btc_move %."
        ),
        "parameters": {
            "divergence_threshold": 1.5,   # percentage points (BTC% − TAO%)
            "min_btc_move":         1.0,   # require BTC to have moved ≥1% / 24h
        },
        "is_active": False,
        "mode": "PAPER_ONLY",
        "win_trades":  0, "loss_trades":  0, "total_trades":  0,
        "win_rate":  0.0, "total_pnl":  0.0,
    },
    {
        "name": "breakout_hunter",
        "display_name": "Breakout Hunter",
        "description": "Volume spike + RSI breakout entry with ADX trend confirmation.",
        "parameters": {"volume_ratio": 2.0, "rsi_level": 55, "adx_min": 25, "atr_stop": 2.0},
        "is_active": True,
        "mode": "PAPER_ONLY",
        "win_trades":  0, "loss_trades":  0, "total_trades":  0,
        "win_rate":  0.0, "total_pnl":  0.0,
    },
    {
        "name": "yield_maximizer",
        "display_name": "Yield Maximizer",
        "description": "Emission-first strategy targeting highest staking APY subnets.",
        "parameters": {"min_apy": 0.12, "max_positions": 5, "rebalance_period": 10},
        "is_active": True,
        "mode": "PAPER_ONLY",
        "win_trades":  0, "loss_trades":  0, "total_trades":  0,
        "win_rate":  0.0, "total_pnl":  0.0,
    },
    {
        # Session XXXVIII: re-enabled — paired wake-up with mean_reversion. Same
        # rationale: Session XXXIV merit-pool fix neutralised the original
        # reason for benching it. RSI<35 / RSI>65 contrarian trigger is sound
        # and TAO is currently sitting at RSI=77 — a textbook fire condition.
        "name": "contrarian_flow",
        "display_name": "Contrarian Flow",
        "description": "Fades extreme dTAO flow moves. Enters against consensus when flow z-score > 2.5.",
        "parameters": {"flow_zscore": 2.5, "reversal_confirm": 2, "max_hold_cycles": 3},
        "is_active": True,
        "mode": "PAPER_ONLY",
        "win_trades":  0, "loss_trades":  0, "total_trades":  0,
        "win_rate":  0.0, "total_pnl":  0.0,
    },
]


def get_signal(
    strategy_name: str,
    prices: List[float],
    indicators: Dict[str, Any],
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    fn = STRATEGY_MAP.get(strategy_name, momentum_strategy)
    return fn(prices, indicators, params or {})