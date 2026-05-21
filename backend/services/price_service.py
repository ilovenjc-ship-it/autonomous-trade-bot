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
BTC_COINGECKO_ID = "bitcoin"

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
        # BTC reference feed (Day 8 Round 4 — macro_correlation rewrite).
        # CoinGecko's /simple/price endpoint accepts a comma-separated
        # ids list for free, so adding BTC costs zero extra rate-limit
        # budget. The macro_correlation strategy reads btc_change_24h
        # alongside the TAO 24h change to detect cross-asset divergence.
        self._btc_price: Optional[float] = None
        self._btc_data: Dict[str, Any] = {}
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

    @property
    def btc_price(self) -> Optional[float]:
        return self._btc_price

    @property
    def btc_data(self) -> Dict[str, Any]:
        return self._btc_data

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
        # Hydrate the rolling buffer from persisted ticks BEFORE the first
        # fetch (Day 9 — Task #C). Pre-Day-9, every Railway redeploy reset
        # the buffer to empty and stranded the system in a 14-minute
        # UNKNOWN window while RSI re-warmed (28 ticks × 30s). With
        # hydration, indicators are usable from t=0 of the new process.
        await self._hydrate_from_db()
        # Fetch once immediately so we have data before the loop starts
        await self._fetch_price()
        self._task = asyncio.create_task(self._loop())
        logger.info(
            f"PriceService started — buffer={len(self._price_history)} "
            f"warmed_up={self.is_warmed_up()}"
        )

    async def _hydrate_from_db(self) -> None:
        """
        Seed the in-memory _price_history buffer from the persisted
        price_history table. Pulls the last self._max_history ticks of
        TAO price ordered most-recent-first, then reverses them into
        chronological order before extending the buffer.

        Indicator columns (rsi_14, ema_*, etc.) on the persisted rows
        are intentionally NOT consumed here — they were computed under
        whatever code shipped with the bot when the row was written, and
        re-computing in-memory from raw prices keeps the math under the
        current code's control. The stored indicator columns are an
        observability/audit log, not a hot read.

        Failure modes are non-fatal: a DB hiccup at boot just leaves the
        buffer empty, which is identical to pre-Day-9 behavior.
        """
        try:
            from db.database import AsyncSessionLocal
            from models.price_history import PriceHistory
            from sqlalchemy import select, desc

            async with AsyncSessionLocal() as db:
                stmt = (
                    select(PriceHistory.price_usd)
                    .where(PriceHistory.symbol == "TAO")
                    .order_by(desc(PriceHistory.recorded_at))
                    .limit(self._max_history)
                )
                rows = (await db.execute(stmt)).scalars().all()

            if not rows:
                logger.info("PriceService hydrate: no persisted ticks (cold start)")
                return

            # rows are most-recent-first; reverse into chronological order
            seeded = [float(p) for p in reversed(rows) if p is not None]
            async with self._lock:
                self._price_history.extend(seeded)
                # In case start() is called twice or a stale loop wrote
                # ticks before hydrate landed, clip to the cap.
                if len(self._price_history) > self._max_history:
                    self._price_history = self._price_history[-self._max_history:]

            logger.info(
                f"PriceService hydrate: seeded {len(seeded)} ticks "
                f"from price_history (warmed_up={self.is_warmed_up()})"
            )
        except Exception as e:
            # Boot proceeds with an empty buffer — same as pre-Day-9.
            logger.warning(f"PriceService hydrate failed (non-fatal): {e}")

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
                        # Day 8 Round 4: fetch BTC alongside TAO in the same
                        # request — same endpoint, same rate-limit cost.
                        # macro_correlation consumes btc_change_24h as its
                        # macro reference.
                        "ids": f"{TAO_COINGECKO_ID},{BTC_COINGECKO_ID}",
                        "vs_currencies": "usd",
                        "include_market_cap": "true",
                        "include_24hr_vol": "true",
                        "include_24hr_change": "true",
                    },
                )
                resp.raise_for_status()
                payload = resp.json()
                data     = payload.get(TAO_COINGECKO_ID, {})
                btc_data = payload.get(BTC_COINGECKO_ID, {})

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

                # ── BTC reference (Day 8 Round 4 — macro_correlation) ──
                # If the BTC slice came back, refresh the cached reference.
                # If it didn't (partial response, network blip), retain the
                # last good value rather than substituting zero — but flag
                # it via the 'stale' bit so the strategy can decline to
                # trade if reference data is too old.
                btc_usd = btc_data.get("usd")
                if btc_usd is not None:
                    self._btc_price = btc_usd
                    self._btc_data = {
                        "price_usd": btc_usd,
                        "price_change_pct_24h": btc_data.get("usd_24h_change"),
                        "timestamp": datetime.utcnow().isoformat(),
                        "stale": False,
                    }
                elif self._btc_data:
                    # Mark previous reading as stale; macro_correlation will
                    # see this and abstain rather than trade on dead data.
                    self._btc_data["stale"] = True

            logger.debug(
                f"Prices updated: TAO=${self._current_price} "
                f"BTC=${self._btc_price}"
            )

            # ── Persist tick (Day 9 — Task #C) ──────────────────────────
            # Fire-and-forget so DB latency cannot stall the price loop.
            # Writes the same tick that just landed in _price_history,
            # so the hydrator on next boot reproduces this exact buffer.
            # Failures are logged but never raised — the price feed must
            # not be coupled to DB availability.
            if self._current_price is not None:
                asyncio.create_task(self._persist_tick())
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

        # ── Macro reference (Day 8 Round 4 — macro_correlation rewrite) ──
        # Surface TAO/BTC 24h % changes as first-class indicators so
        # cycle_service._compute_signal can read them through the same
        # dict it uses for everything else. None when data is missing
        # or stale; macro_correlation must defend against None and skip
        # rather than trade on a phantom zero.
        tao_chg = self._price_data.get("price_change_pct_24h")
        btc_chg = self._btc_data.get("price_change_pct_24h")
        btc_stale = self._btc_data.get("stale", True)
        result["tao_change_24h"] = float(tao_chg) if tao_chg is not None else None
        result["btc_change_24h"] = (
            float(btc_chg) if (btc_chg is not None and not btc_stale) else None
        )
        result["btc_price"] = self._btc_price

        return result

    # ------------------------------------------------------------------
    # Persist current tick (Day 9 — Task #C)
    # ------------------------------------------------------------------

    async def _persist_tick(self) -> None:
        """
        Write the most recently fetched price + indicator snapshot to
        the price_history table. Called as a fire-and-forget task from
        _fetch_price after each successful poll, so the persisted
        sequence matches the in-memory buffer one-for-one and the
        hydrator on next boot reproduces it exactly.

        Indicator columns are populated from compute_indicators() so
        the row is self-contained for replay/audit. macro_correlation's
        BTC reference is recorded alongside (Day 8 R4 columns).
        """
        try:
            from db.database import AsyncSessionLocal
            from models.price_history import PriceHistory

            indicators = self.compute_indicators()
            async with AsyncSessionLocal() as db:
                snapshot = PriceHistory(
                    symbol="TAO",
                    price_usd=self._current_price,
                    volume_24h=self._price_data.get("volume_24h"),
                    market_cap=self._price_data.get("market_cap"),
                    price_change_24h=self._price_data.get("price_change_24h"),
                    price_change_pct_24h=self._price_data.get("price_change_pct_24h"),
                    btc_price_usd=self._btc_price,
                    btc_price_change_pct_24h=(
                        self._btc_data.get("price_change_pct_24h")
                        if not self._btc_data.get("stale", True) else None
                    ),
                    # Filter Nones — let the DB defaults / nullable columns
                    # keep the schema honest about what was actually
                    # available at write time.
                    **{
                        k: v for k, v in indicators.items()
                        if v is not None and k in {
                            "rsi_14", "ema_9", "ema_21", "sma_50",
                            "macd", "macd_signal",
                            "bb_upper", "bb_lower", "bb_mid",
                        }
                    },
                )
                db.add(snapshot)
                await db.commit()
        except Exception as e:
            logger.warning(f"Price tick persist failed (non-fatal): {e}")

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