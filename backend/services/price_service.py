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

# Day 9 Round 2 — Open Interest source.
# OKX exposes a free, no-auth OI endpoint for TAO-USDT perpetual swaps.
# (Binance Futures was the natural first choice but is geo-blocked from
# Railway's US edge — same response on the dev sandbox: "restricted
# location" with a Terms-of-Service link. OKX answered cleanly:
#   {"data":[{"oiUsd":"17010678.4", ...}]}
# `oiUsd` is the operator-meaningful read; keeping it as our headline OI
# value. If OKX itself goes geo-blocked on Railway, the field nulls out
# and the frontend's IndRow renders '—' — same graceful degrade pattern
# as the rest of the indicator dict.)
OKX_OI_URL = "https://www.okx.com/api/v5/public/open-interest"
OKX_TAO_INST_ID = "TAO-USDT-SWAP"

# Day 9 Round 2 — MFI(14) period.
# Money Flow Index is RSI's volume-weighted cousin. We reuse the same
# WARMUP_TICKS=28 floor for symmetry with RSI; below that, MFI is None.
# Caveat documented in compute_indicators(): per-tick "volume" here is
# CoinGecko's `usd_24h_vol` snapshot (rolling 24h), not per-period
# candle volume. The signal is degraded vs an OHLCV-based MFI but still
# carries directional information from the close-vs-close price series.
# A follow-up could swap in CoinGecko market_chart 5m candles for a
# clean MFI; documented as a known limitation, not a defect.
MFI_PERIOD = 14


class PriceService:
    def __init__(self):
        self._current_price: Optional[float] = None
        self._price_data: Dict[str, Any] = {}
        self._price_history: List[float] = []   # rolling window for indicators
        # Day 9 Round 2 — parallel volume buffer, written paired with each
        # price tick. Used by MFI(14). Same cap as _price_history so the
        # two series stay aligned index-by-index. Stores Optional[float]
        # because CoinGecko occasionally returns price without volume.
        self._volume_history: List[Optional[float]] = []
        self._max_history = 200
        # BTC reference feed (Day 8 Round 4 — macro_correlation rewrite).
        # CoinGecko's /simple/price endpoint accepts a comma-separated
        # ids list for free, so adding BTC costs zero extra rate-limit
        # budget. The macro_correlation strategy reads btc_change_24h
        # alongside the TAO 24h change to detect cross-asset divergence.
        self._btc_price: Optional[float] = None
        self._btc_data: Dict[str, Any] = {}
        # Day 9 Round 2 — Open Interest snapshot from OKX TAO-USDT-SWAP.
        # Polled on the same 30s loop as the CoinGecko price call. Stale
        # flag carries forward the last good reading rather than nulling
        # on a transient blip; compute_indicators() respects the flag.
        self._open_interest: Optional[float] = None
        self._oi_data: Dict[str, Any] = {}
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

    # ╔══════════════════════════════════════════════════════════════════╗
    # ║ DAY 8 INVARIANT — INV-5 (hydrator half) — Commit bcd6d56b       ║
    # ║ This method MUST be called from start() BEFORE the first        ║
    # ║ _fetch_price. It seeds _price_history from the persisted        ║
    # ║ price_history table so indicators are usable from tick 1 of a   ║
    # ║ new process (instead of waiting 14 minutes for WARMUP_TICKS=28  ║
    # ║ to climb from empty). Removing this call recreates the          ║
    # ║ post-redeploy UNKNOWN window that benched 5 momentum bots after ║
    # ║ every Railway boot. The writer (_persist_tick) and the reader   ║
    # ║ (/api/price/history?source=local) are the other two legs of the ║
    # ║ same loop; all three must remain. See STATE.md §0 INV-5 + §5a   ║
    # ║ Day 8 R5 entry. Regression test:                                ║
    # ║   backend/scripts/test_day8_invariants.py::test_inv5_persistence║
    # ╚══════════════════════════════════════════════════════════════════╝
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
                # Day 9 Round 2: pull volume_24h alongside price_usd so
                # the volume buffer hydrates in lockstep. Without this,
                # MFI(14) would face a 14-min cold window after every
                # redeploy even though the price buffer is hot — exactly
                # the post-redeploy-UNKNOWN class of bug Day 8 R5 fixed
                # for RSI/regime. Same loop, same fix, broader scope.
                stmt = (
                    select(PriceHistory.price_usd, PriceHistory.volume_24h)
                    .where(PriceHistory.symbol == "TAO")
                    .order_by(desc(PriceHistory.recorded_at))
                    .limit(self._max_history)
                )
                rows = (await db.execute(stmt)).all()

            if not rows:
                logger.info("PriceService hydrate: no persisted ticks (cold start)")
                return

            # rows are most-recent-first; reverse into chronological order
            chrono = list(reversed(rows))
            seeded_prices = [float(r[0]) for r in chrono if r[0] is not None]
            seeded_volumes: List[Optional[float]] = []
            for r in chrono:
                if r[0] is None:
                    continue
                v = r[1]
                seeded_volumes.append(float(v) if v is not None else None)

            async with self._lock:
                self._price_history.extend(seeded_prices)
                self._volume_history.extend(seeded_volumes)
                # In case start() is called twice or a stale loop wrote
                # ticks before hydrate landed, clip both buffers to the
                # cap. They hydrate in lockstep so a single trim covers
                # both, but trim independently to be defensive.
                if len(self._price_history) > self._max_history:
                    self._price_history = self._price_history[-self._max_history:]
                if len(self._volume_history) > self._max_history:
                    self._volume_history = self._volume_history[-self._max_history:]

            logger.info(
                f"PriceService hydrate: seeded {len(seeded_prices)} ticks "
                f"({sum(1 for v in seeded_volumes if v is not None)} with volume) "
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
                    # Day 9 Round 2 — paired write into the volume buffer.
                    # Whatever volume_24h came back this tick (possibly
                    # None on a partial response) is stored at the same
                    # index as the price. MFI(14) reads both series.
                    self._volume_history.append(data.get("usd_24h_vol"))
                    if len(self._price_history) > self._max_history:
                        self._price_history.pop(0)
                    if len(self._volume_history) > self._max_history:
                        self._volume_history.pop(0)

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

            # ── Open Interest (Day 9 Round 2 — OKX TAO-USDT-SWAP) ───────
            # Independent fetch. Failure here cannot stall the price loop
            # or affect indicator publication — OI is observability-tier,
            # not load-bearing for any current strategy gate. If OKX is
            # geo-blocked from Railway's edge, this nulls out and the
            # frontend renders '—' (graceful degrade pattern).
            await self._fetch_open_interest()

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
    # Open Interest fetcher (Day 9 Round 2)
    # ------------------------------------------------------------------

    async def _fetch_open_interest(self) -> None:
        """
        Poll OKX for TAO-USDT-SWAP open interest. Fire-and-quiet: any
        failure (network, geo-block, schema drift) marks the cached value
        stale rather than raising — OI is an ambient observability
        indicator, not a load-bearing signal. compute_indicators() reads
        the staleness flag and returns None when set, which the frontend
        IndRow renders as '—'.

        Response shape:
            {"code":"0","data":[{"oiUsd":"17010678.4", ...}],"msg":""}
        We pull `oiUsd` because that's the operator-meaningful read
        (USD-denominated, comparable across exchanges if we ever add a
        second source).
        """
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    OKX_OI_URL,
                    params={"instType": "SWAP", "instId": OKX_TAO_INST_ID},
                )
                resp.raise_for_status()
                payload = resp.json()
            data_list = payload.get("data") or []
            if not data_list:
                # Legitimate empty response — mark stale, keep last good.
                async with self._lock:
                    if self._oi_data:
                        self._oi_data["stale"] = True
                return
            row = data_list[0]
            oi_usd = row.get("oiUsd")
            oi_ccy = row.get("oiCcy")        # in TAO units
            oi_contracts = row.get("oi")     # in contracts
            if oi_usd is None:
                async with self._lock:
                    if self._oi_data:
                        self._oi_data["stale"] = True
                return
            async with self._lock:
                self._open_interest = float(oi_usd)
                self._oi_data = {
                    "oi_usd": float(oi_usd),
                    "oi_tao": float(oi_ccy) if oi_ccy is not None else None,
                    "oi_contracts": float(oi_contracts) if oi_contracts is not None else None,
                    "source": "okx_swap",
                    "timestamp": datetime.utcnow().isoformat(),
                    "stale": False,
                }
            logger.debug(f"OI updated (OKX TAO-USDT-SWAP): ${self._open_interest:,.0f}")
        except Exception as e:
            # Mark stale; preserve last good value. compute_indicators
            # will null the field out so the frontend shows '—'.
            logger.debug(f"OI fetch failed (non-fatal): {e}")
            async with self._lock:
                if self._oi_data:
                    self._oi_data["stale"] = True

    # ------------------------------------------------------------------
    # Technical indicators
    # ------------------------------------------------------------------

    def compute_indicators(self) -> Dict[str, Optional[float]]:
        prices = self.get_price_history_list()
        if len(prices) < 2:
            return {}

        s = pd.Series(prices, dtype=float)
        result: Dict[str, Optional[float]] = {}

        # ╔══════════════════════════════════════════════════════════════════╗
        # ║ DAY 8 INVARIANT — INV-1 — Commit 26782ff1                       ║
        # ║ RSI(14) MUST use Wilder's smoothing (alpha=1/14) with the       ║
        # ║ WARMUP_TICKS=28 guard. Below threshold returns None — never a   ║
        # ║ neutral default. Reverting to simple-rolling-mean OR lowering   ║
        # ║ the warmup OR re-adding `else: 50.0` reintroduces the           ║
        # ║ phantom-RSI / phantom-regime cascade that benched 5 momentum    ║
        # ║ bots after every Railway redeploy. See STATE.md §0 INV-1 +      ║
        # ║ §5a Day 8 R1 entry. Regression test:                            ║
        # ║   backend/scripts/test_day8_invariants.py::test_inv1_rsi        ║
        # ╚══════════════════════════════════════════════════════════════════╝
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

        # ── Volume (Day 9 Round 2) ────────────────────────────────────────
        # Direct passthrough of CoinGecko's `usd_24h_vol` for the current
        # tick. This is the rolling 24h volume in USD, NOT a per-period
        # candle volume — useful as an ambient liquidity reading on the
        # Live Indicators panel; not used as a strategy gate.
        vol_24h = self._price_data.get("volume_24h")
        result["volume_24h"] = float(vol_24h) if vol_24h is not None else None

        # ── MFI(14) — Money Flow Index (Day 9 Round 2) ────────────────────
        # ╔══════════════════════════════════════════════════════════════════╗
        # ║ Caveat: per-tick "volume" here is `usd_24h_vol` (rolling 24h),  ║
        # ║ not per-period candle volume. The signal is degraded vs an      ║
        # ║ OHLCV-based MFI — most of the volume value is unchanged from    ║
        # ║ tick to tick, so the volume weighting carries less signal than  ║
        # ║ on candle-derived MFI. This is OBSERVABILITY-TIER, not a        ║
        # ║ strategy gate. Documented as a known limitation; future work    ║
        # ║ could pull CoinGecko market_chart 5m candles for clean OHLCV    ║
        # ║ MFI on a slower cadence. WARMUP_TICKS=28 floor mirrors RSI for  ║
        # ║ symmetry. Below that, MFI is None (frontend renders '—').       ║
        # ╚══════════════════════════════════════════════════════════════════╝
        if (
            len(self._price_history) >= WARMUP_TICKS
            and len(self._volume_history) >= WARMUP_TICKS
        ):
            try:
                # Align lengths defensively (paired writes should keep
                # them in lockstep, but a hydrate-only path may differ).
                n = min(len(self._price_history), len(self._volume_history))
                prices_arr = self._price_history[-n:]
                vols_arr = self._volume_history[-n:]
                # Drop any tick where volume is None (None-safe pairing).
                paired = [
                    (p, v) for p, v in zip(prices_arr, vols_arr)
                    if v is not None and p is not None
                ]
                if len(paired) >= MFI_PERIOD + 1:
                    p_series = pd.Series([p for p, _ in paired], dtype=float)
                    v_series = pd.Series([v for _, v in paired], dtype=float)
                    # Typical price = close (no OHLC available).
                    typical = p_series
                    raw_money_flow = typical * v_series
                    # Direction: +1 when typical price rose vs prior tick.
                    delta = typical.diff()
                    pos_mf = raw_money_flow.where(delta > 0, 0.0)
                    neg_mf = raw_money_flow.where(delta < 0, 0.0)
                    # Wilder-smoothed sums over MFI_PERIOD for stability —
                    # mirrors RSI(14) treatment, less choppy than the
                    # textbook simple-rolling-sum.
                    pos_smooth = pos_mf.ewm(alpha=1.0 / MFI_PERIOD, adjust=False).mean()
                    neg_smooth = neg_mf.ewm(alpha=1.0 / MFI_PERIOD, adjust=False).mean()
                    last_pos = float(pos_smooth.iloc[-1])
                    last_neg = float(neg_smooth.iloc[-1])
                    if last_pos == 0.0 and last_neg == 0.0:
                        result["mfi_14"] = None
                    elif last_neg == 0.0:
                        result["mfi_14"] = 100.0
                    elif last_pos == 0.0:
                        result["mfi_14"] = 0.0
                    else:
                        money_ratio = last_pos / last_neg
                        mfi_val = 100.0 - (100.0 / (1.0 + money_ratio))
                        result["mfi_14"] = (
                            float(mfi_val) if not np.isnan(mfi_val) else None
                        )
                else:
                    result["mfi_14"] = None
            except Exception:
                # Don't let an MFI math hiccup poison the indicator dict —
                # the rest of the indicators are independent of this block.
                result["mfi_14"] = None
        else:
            result["mfi_14"] = None

        # ── Open Interest (Day 9 Round 2 — OKX TAO-USDT-SWAP) ────────────
        # USD-denominated OI from OKX perpetual swap. None when the OKX
        # call has never succeeded OR the most recent fetch marked the
        # cache stale. Stale handling mirrors the BTC reference pattern:
        # don't fabricate a number we don't have, but don't drop the
        # whole indicator dict either.
        oi_stale = self._oi_data.get("stale", True)
        result["open_interest"] = (
            float(self._open_interest)
            if self._open_interest is not None and not oi_stale
            else None
        )

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