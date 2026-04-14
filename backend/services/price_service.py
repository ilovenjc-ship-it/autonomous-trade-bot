"""
Price feed service — polls CoinGecko for TAO/USD price and computes
technical indicators (RSI, EMA, MACD, Bollinger Bands).
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

    # ------------------------------------------------------------------
    # Technical indicators
    # ------------------------------------------------------------------

    def compute_indicators(self) -> Dict[str, Optional[float]]:
        prices = self.get_price_history_list()
        if len(prices) < 2:
            return {}

        s = pd.Series(prices, dtype=float)
        result: Dict[str, Optional[float]] = {}

        # RSI-14
        if len(s) >= 14:
            delta = s.diff()
            gain = delta.clip(lower=0).rolling(14).mean()
            loss = (-delta.clip(upper=0)).rolling(14).mean()
            rs = gain / loss.replace(0, np.nan)
            rsi = 100 - (100 / (1 + rs))
            result["rsi_14"] = float(rsi.iloc[-1]) if not np.isnan(rsi.iloc[-1]) else None
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