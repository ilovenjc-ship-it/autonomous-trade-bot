"""
Price feed service — polls CoinGecko for TAO/USD price and computes
technical indicators (RSI, EMA, MACD, Bollinger Bands).

RSI implementation note (Day 8, Session XLI — fixed 2026-05-21):
- RSI(14) uses Wilder's smoothing (exponential moving average with
  alpha=1/14), not simple rolling mean. Wilder's is the canonical formula
  and is more stable during the warmup window.
- A stable Wilder's RSI requires roughly 2× the period of price ticks
  before its reading converges. Hence the WARMUP_TICKS=28 guard below:
  RSI is reported as None until we have at least 28 prices in the buffer.
- NaN-on-flat-price is now reported as None (was: 50.0). A confident
  "neutral" reading on broken/flat data is worse than "unknown" — the
  regime classifiers downstream can defend against None and treat it as
  UNKNOWN; they can't defend against a falsely-neutral 50.

Cadence note: update_interval=30s. RSI(14) at this cadence reads on a
~7-minute price window, which is intrinsically noisy. Whether the regime
classifier should be reading on this short a window is a separate
architectural question (Task #2 — regime architecture review).
"""
import asyncio
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List

import httpx
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

COINGECKO_BASE = "https://api.coingecko.com/api/v3"
TAO_COINGECKO_ID = "bittensor"

# RSI(14) needs approximately 2× the period of price ticks before its
# Wilder-smoothed average stabilizes. Below this, RSI is reported as
# None and downstream regime classifiers fall back to UNKNOWN.
RSI_PERIOD = 14
WARMUP_TICKS = 28          # 2 × RSI_PERIOD — minimum for a stable reading


class PriceService:
    def __init__(self):
        self._current_price: Optional[float] = None
        self._price_data: Dict[str, Any] = {}
        self._price_history: List[float] = []   # rolling window for indicators
        self._max_history = 200
        self._lock = asyncio.Lock()
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self.update_interval = 30                # seconds

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    @property
    def current_price(self) -> Optional[float]:
        return self._current_price

    @property
    def price_data(self) -> Dict[str, Any]:
        return self._price_data

    def get_price_history_list(self) -> List[float]:
        return list(self._price_history)

    def is_warmed_up(self) -> bool:
        """
        True when the price-history buffer contains enough ticks for
        RSI(14) to produce a stable Wilder-smoothed reading.

        Indicator panel + regime classifiers should treat False as
        "indicators not yet available; regime UNKNOWN" rather than
        substituting any neutral default.
        """
        return len(self._price_history) >= WARMUP_TICKS

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self):
        if self._running:
            return
        self._running = True
        # Fetch once immediately so we have data before the loop starts
        await self._fetch_price()
        self._task = asyncio.create_task(self._loop())
        logger.info("PriceService started")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("PriceService stopped")

    # ------------------------------------------------------------------
    # Internal loop
    # ------------------------------------------------------------------

    async def _loop(self):
        while self._running:
            await asyncio.sleep(self.update_interval)
            await self._fetch_price()

    async def _fetch_price(self):
        import time as _time
        _t0 = _time.time()
        _success = True
        _err: Optional[str] = None
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{COINGECKO_BASE}/simple/price",
                    params={
                        "ids": TAO_COINGECKO_ID,
                        "vs_currencies": "usd",
                        "include_market_cap": "true",
                        "include_24hr_vol": "true",
                        "include_24hr_change": "true",
                    },
                )
                resp.raise_for_status()
                data = resp.json().get(TAO_COINGECKO_ID, {})

            async with self._lock:
                self._current_price = data.get("usd", self._current_price)
                self._price_data = {
                    "price_usd": data.get("usd"),
                    "market_cap": data.get("usd_market_cap"),
                    "volume_24h": data.get("usd_24h_vol"),
                    "price_change_24h": data.get("usd_24h_change"),
                    "price_change_pct_24h": data.get("usd_24h_change"),
                    "timestamp": datetime.utcnow().isoformat(),
                }
                if self._current_price:
                    self._price_history.append(self._current_price)
                    if len(self._price_history) > self._max_history:
                        self._price_history.pop(0)

            logger.debug(f"TAO price updated: ${self._current_price}")
        except Exception as e:
            logger.warning(f"Price fetch failed: {e}")
            _success = False
            _err = str(e)[:300]
        finally:
            try:
                from services.system_health_service import system_health
                system_health.record_run(
                    name="price_service",
                    success=_success,
                    error=_err,
                    duration_ms=round((_time.time() - _t0) * 1000.0, 1),
                )
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Technical indicators
    # ------------------------------------------------------------------

    def compute_indicators(self) -> Dict[str, Optional[float]]:
        prices = self.get_price_history_list()
        if len(prices) < 2:
            return {}

        s = pd.Series(prices, dtype=float)
        result: Dict[str, Optional[float]] = {}

        # RSI-14 — Wilder's smoothing with warmup guard (see module docstring).
        # Guard requires WARMUP_TICKS samples (= 2 × RSI_PERIOD) before any
        # value is reported. Below the guard, return None so downstream
        # regime classifiers fall back to UNKNOWN cleanly.
        if len(s) >= WARMUP_TICKS:
            delta = s.diff()
            gain = delta.clip(lower=0)
            loss = -delta.clip(upper=0)
            # Wilder's smoothing == EMA with alpha = 1/period
            avg_gain = gain.ewm(alpha=1.0 / RSI_PERIOD, adjust=False).mean()
            avg_loss = loss.ewm(alpha=1.0 / RSI_PERIOD, adjust=False).mean()
            last_gain = float(avg_gain.iloc[-1])
            last_loss = float(avg_loss.iloc[-1])

            if last_gain == 0.0 and last_loss == 0.0:
                # Truly flat price (e.g. CoinGecko 429 cache repeats or
                # a stuck feed). No movement → no momentum signal.
                # Return None rather than a falsely-confident 50.
                result["rsi_14"] = None
            elif last_loss == 0.0:
                # All up-moves over the smoothed window → max bullish.
                result["rsi_14"] = 100.0
            elif last_gain == 0.0:
                # All down-moves over the smoothed window → max bearish.
                result["rsi_14"] = 0.0
            else:
                rs = last_gain / last_loss
                rsi_val = 100.0 - (100.0 / (1.0 + rs))
                result["rsi_14"] = float(rsi_val) if not np.isnan(rsi_val) else None
        else:
            result["rsi_14"] = None

        # EMAs
        for span in [9, 21, 50]:
            key = f"ema_{span}" if span != 50 else "sma_50"
            if len(s) >= span:
                val = s.ewm(span=span, adjust=False).mean().iloc[-1] if span <= 21 else s.rolling(span).mean().iloc[-1]
                result[key] = float(val) if not np.isnan(val) else None
            else:
                result[key] = None

        # MACD (12, 26, 9)
        if len(s) >= 26:
            ema12 = s.ewm(span=12, adjust=False).mean()
            ema26 = s.ewm(span=26, adjust=False).mean()
            macd_line = ema12 - ema26
            signal_line = macd_line.ewm(span=9, adjust=False).mean()
            result["macd"] = float(macd_line.iloc[-1])
            result["macd_signal"] = float(signal_line.iloc[-1])
        else:
            result["macd"] = None
            result["macd_signal"] = None

        # Bollinger Bands (20, 2)
        if len(s) >= 20:
            sma20 = s.rolling(20).mean()
            std20 = s.rolling(20).std()
            result["bb_upper"] = float(sma20.iloc[-1] + 2 * std20.iloc[-1])
            result["bb_mid"] = float(sma20.iloc[-1])
            result["bb_lower"] = float(sma20.iloc[-1] - 2 * std20.iloc[-1])
        else:
            result["bb_upper"] = None
            result["bb_mid"] = None
            result["bb_lower"] = None

        return result

    # ------------------------------------------------------------------
    # Fetch historical OHLCV from CoinGecko (for charting)
    # ------------------------------------------------------------------

    async def fetch_ohlcv(self, days: int = 7) -> List[Dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{COINGECKO_BASE}/coins/{TAO_COINGECKO_ID}/market_chart",
                    params={"vs_currency": "usd", "days": days},
                )
                resp.raise_for_status()
                data = resp.json()

            prices = data.get("prices", [])
            volumes = data.get("total_volumes", [])
            vol_map = {int(v[0]): v[1] for v in volumes}

            return [
                {
                    "timestamp": int(p[0]),
                    "price": p[1],
                    "volume": vol_map.get(int(p[0])),
                }
                for p in prices
            ]
        except Exception as e:
            logger.error(f"fetch_ohlcv failed: {e}")
            return []


# Singleton
price_service = PriceService()