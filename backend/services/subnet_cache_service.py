"""
Subnet Cache Service
====================
Background poller that fetches real Bittensor on-chain data and provides
it to the rest of the application via an in-memory cache.

Phase 1 — Alpha prices (every 60 s):
    get_subnet_prices() returns ALL subnet alpha prices in a single chain
    call.  We compare current vs previous snapshot to derive real trend
    direction without needing historical storage.

Phase 2 — Metagraph data for trading subnets (every 5 min):
    For the 6 subnets we actually stake into (SN0, 8, 9, 18, 64, 96) we
    pull the full metagraph to get real total stake, active miner count,
    and per-block emission.  APY is derived as:

        APY ≈ (total_emission_per_block × 7200 × 365 / total_stake) × 100

    7 200 blocks/day at ~12 s/block on Finney mainnet.

Fallback policy:
    If the chain is unreachable or a subnet has no cached data yet,
    callers receive None and must fall back to their own defaults.
    The bot never hard-errors on a missing cache entry.
"""

import asyncio
import logging
import time
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# ── Poll intervals ────────────────────────────────────────────────────────────
PRICE_POLL_INTERVAL = 60       # seconds  — alpha price (single bulk call)
META_POLL_INTERVAL  = 300      # seconds  — metagraph per trading subnet

# Finney block time: ~12 s  →  7 200 blocks / day
BLOCKS_PER_DAY = 7_200

# Subnets we actually stake into — priority for real metagraph data
TRADING_NETUIDS = {0, 8, 9, 18, 64, 96}

# Trend threshold: alpha price must move > 1 % to register as up/down
TREND_THRESHOLD = 0.01


class SubnetCacheService:
    """
    Provides get_trend(), get_alpha_price(), and get_meta() to market.py.
    All methods are synchronous reads from an in-memory cache; the async
    pollers run as background tasks and write to the cache.
    """

    def __init__(self):
        # Alpha prices
        self._cur_prices:  Dict[int, float] = {}   # netuid → current alpha price
        self._prev_prices: Dict[int, float] = {}   # netuid → previous alpha price
        self._price_ts:    float = 0.0              # monotonic timestamp of last update

        # Metagraph data (trading subnets only)
        self._meta: Dict[int, dict] = {}            # netuid → {stake_tao, miners, emission, apy}
        self._meta_ts: float = 0.0

        self._running = False
        self._task: Optional[asyncio.Task] = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        if self._running:
            return
        self._running = True

        # Prime alpha prices immediately — single fast chain call, all subnets.
        # Metagraph fetch (6 subnets, 10-30 s each) is deferred to the background
        # loop so we don't block cycle_service.start() at boot time.
        await self._fetch_prices()
        asyncio.create_task(self._fetch_metagraphs(), name="subnet_meta_prime")

        self._task = asyncio.create_task(self._loop(), name="subnet_cache_loop")
        logger.info("SubnetCacheService started — alpha prices live, metagraph priming in background")

    async def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("SubnetCacheService stopped")

    # ── Background loop ───────────────────────────────────────────────────────

    async def _loop(self) -> None:
        ticks_since_meta = 0
        meta_every = META_POLL_INTERVAL // PRICE_POLL_INTERVAL   # 5

        while self._running:
            await asyncio.sleep(PRICE_POLL_INTERVAL)
            await self._fetch_prices()

            ticks_since_meta += 1
            if ticks_since_meta >= meta_every:
                await self._fetch_metagraphs()
                ticks_since_meta = 0

    # ── Data fetchers ─────────────────────────────────────────────────────────

    async def _fetch_prices(self) -> None:
        """Pull all subnet alpha prices in one chain call."""
        try:
            from services.bittensor_service import bittensor_service

            # Bump limit high enough to capture all active subnets (100+ on Finney)
            raw = await bittensor_service.get_subnet_prices(limit=200)
            if not raw:
                logger.debug("SubnetCacheService: no price data returned (chain may be slow)")
                return

            new_prices = {int(p["netuid"]): float(p["price"]) for p in raw}

            # Rotate snapshots for trend computation
            self._prev_prices = dict(self._cur_prices)
            self._cur_prices  = new_prices
            self._price_ts    = time.monotonic()

            logger.info(
                f"SubnetCacheService: alpha prices updated — "
                f"{len(new_prices)} subnets | "
                f"age={round(time.monotonic() - self._price_ts, 1)}s"
            )

        except Exception as exc:
            logger.warning(f"SubnetCacheService._fetch_prices error: {exc}")

    async def _fetch_metagraphs(self) -> None:
        """Pull metagraph for each trading subnet to get real stake / emission."""
        try:
            import bittensor as bt

            async with bt.AsyncSubtensor(network="finney") as sub:
                for netuid in sorted(TRADING_NETUIDS):
                    try:
                        mg = await sub.metagraph(netuid=netuid)

                        # Total stake on this subnet (sum across all UIDs)
                        stake_tao = float(mg.S.sum()) if hasattr(mg, "S") else 0.0

                        # Active neuron count
                        miners = int(mg.n) if hasattr(mg, "n") else 0

                        # Per-block emission sum across all UIDs
                        emission_pb = (
                            float(mg.emission.sum()) if hasattr(mg, "emission") else 0.0
                        )

                        # Derived APY — annual yield if you held proportional stake
                        if stake_tao > 0 and emission_pb > 0:
                            apy = (emission_pb * BLOCKS_PER_DAY * 365 / stake_tao) * 100
                            apy_raw = apy
                            apy = round(min(apy, 150.0), 2)   # cap at realistic max for display
                            if apy_raw > 150.0:
                                logger.debug(
                                    f"SN{netuid} APY capped: raw={apy_raw:.1f}% → 150% "
                                    f"(emission_pb={emission_pb:.6f} stake={stake_tao:.0f})"
                                )
                        else:
                            apy = 0.0

                        self._meta[netuid] = {
                            "stake_tao": round(stake_tao, 2),
                            "miners":    miners,
                            "emission":  round(emission_pb, 8),
                            "apy":       apy,
                        }

                        logger.info(
                            f"SN{netuid} metagraph: "
                            f"stake={stake_tao:,.0f}τ  "
                            f"miners={miners}  "
                            f"emission={emission_pb:.6f}/block  "
                            f"APY≈{apy:.1f}%"
                        )

                    except Exception as exc:
                        logger.warning(f"SN{netuid} metagraph fetch error: {exc}")

            self._meta_ts = time.monotonic()

        except Exception as exc:
            logger.warning(f"SubnetCacheService._fetch_metagraphs error: {exc}")

    # ── Public read interface ─────────────────────────────────────────────────

    def get_trend(self, netuid: int) -> Optional[str]:
        """
        Returns "up", "down", or "neutral" based on alpha price movement.
        Returns None if we don't have two consecutive snapshots yet.
        """
        cur  = self._cur_prices.get(netuid)
        prev = self._prev_prices.get(netuid)

        if cur is None or prev is None or prev == 0.0:
            return None

        change = (cur - prev) / prev
        if change > TREND_THRESHOLD:
            return "up"
        if change < -TREND_THRESHOLD:
            return "down"
        return "neutral"

    def get_alpha_price(self, netuid: int) -> Optional[float]:
        """Current dTAO alpha price for the subnet. None if not yet fetched."""
        return self._cur_prices.get(netuid)

    def get_meta(self, netuid: int) -> Optional[dict]:
        """
        Real metagraph data for trading subnets.
        Returns None for non-trading subnets or before first poll completes.
        """
        return self._meta.get(netuid)

    # ── Status / diagnostics ─────────────────────────────────────────────────

    @property
    def has_price_data(self) -> bool:
        return bool(self._cur_prices)

    @property
    def price_age_seconds(self) -> float:
        return (time.monotonic() - self._price_ts) if self._price_ts else float("inf")

    @property
    def meta_age_seconds(self) -> float:
        return (time.monotonic() - self._meta_ts) if self._meta_ts else float("inf")

    def get_status(self) -> dict:
        return {
            "price_subnets":    len(self._cur_prices),
            "meta_subnets":     len(self._meta),
            "price_age_s":      round(self.price_age_seconds, 1),
            "meta_age_s":       round(self.meta_age_seconds, 1),
            "has_price_data":   self.has_price_data,
            "trading_netuids":  sorted(TRADING_NETUIDS),
        }


# ── Singleton ─────────────────────────────────────────────────────────────────
subnet_cache_service = SubnetCacheService()