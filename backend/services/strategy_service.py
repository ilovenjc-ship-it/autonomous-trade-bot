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
        "name": "momentum",
        "display_name": "Momentum",
        "description": "Buy on RSI oversold + EMA golden cross; sell on RSI overbought or death cross.",
        "parameters": {"rsi_oversold": 35, "rsi_overbought": 70, "ema_short": 9, "ema_long": 21},
        "is_active": True,
    },
    {
        "name": "mean_reversion",
        "display_name": "Mean Reversion",
        "description": "Buy at lower Bollinger Band, sell at upper band.",
        "parameters": {"bb_period": 20, "bb_std": 2},
        "is_active": False,
    },
    {
        "name": "macd",
        "display_name": "MACD Crossover",
        "description": "Buy on MACD bullish crossover, sell on bearish crossover.",
        "parameters": {"fast": 12, "slow": 26, "signal": 9, "min_histogram": 0.001},
        "is_active": False,
    },
    {
        "name": "rsi",
        "display_name": "RSI Only",
        "description": "Simple RSI-based buy/sell triggers.",
        "parameters": {"oversold": 30, "overbought": 70},
        "is_active": False,
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