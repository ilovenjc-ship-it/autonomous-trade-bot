"""
pool_reserves_service.py — Day 12 (Pre-Trade Simulator)
========================================================

Pulls (τ_in, α_in) reserves from Bittensor for monitored subnets, persists
them as PoolSnapshot rows, and exposes a small in-memory cache so the
simulator API can answer requests in <5 ms without re-hitting chain.

Polling cadence: piggybacks on the existing 5-minute metagraph fetch loop
(subnet_cache_service._fetch_metagraphs) — see hook in that file. Rationale:
SDK calls to AsyncSubtensor are expensive (≈15s for the full price scan,
≈1–2s per individual subnet metagraph). Sharing the connection lifetime
with the metagraph poller saves several seconds per cycle.

Storage retention: 30 days of snapshots @ 5 min cadence ≈ 8,640 rows per
subnet × 8 monitored subnets ≈ 69k rows total. Negligible.

SDK contract (bittensor>=10.0.0):
    async with bt.AsyncSubtensor(network="finney") as sub:
        info = await sub.subnet(netuid=netuid)   # DynamicInfo
        info.tao_in     # bittensor.Balance, .tao = float TAO
        info.alpha_in   # bittensor.Balance, .tao = float alpha (rao→whole)

Both Balance objects expose `.tao` regardless of which token they wrap —
the field name is historical and just means "human-readable whole units".
"""
from __future__ import annotations
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Iterable

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import AsyncSessionLocal
from models.pool_snapshot import PoolSnapshot

logger = logging.getLogger(__name__)


# Single-subnet timeout — the chain occasionally hangs on a per-subnet RPC.
# We cap each individual subnet.subnet() call so one bad subnet can't poison
# the whole cycle. Matches the per-subnet metagraph timeout philosophy.
_PER_SUBNET_TIMEOUT_S = 8.0

# Concurrency cap for pool-reserve scans.  Day 12 R8 (Mark green-lit
# "All subnets wired"): the universe expanded from 6 trading subnets to
# the full active-subnet set returned by the price scan (~80–128 uids).
# Sequential @ ~1.5 s/subnet would burn 120–200 s of the 300 s metagraph
# cycle; bounded concurrency drops the wall time to ~15 s while keeping
# RPC pressure mild (8 in flight is well below subtensor's hot-path
# tolerance).  Tunable from env so we can dial back if Finney throttles.
_FETCH_CONCURRENCY = int(os.getenv("POOL_RESERVE_CONCURRENCY", "8"))


class _Reserves:
    """In-memory snapshot of the latest reserves seen for one subnet."""
    __slots__ = ("netuid", "tao_in", "alpha_in", "price_tao", "fetched_at")

    def __init__(
        self,
        netuid: int,
        tao_in: float,
        alpha_in: float,
        fetched_at: datetime,
    ):
        self.netuid     = netuid
        self.tao_in     = tao_in
        self.alpha_in   = alpha_in
        self.price_tao  = (tao_in / alpha_in) if alpha_in > 0 else 0.0
        self.fetched_at = fetched_at

    def to_dict(self) -> dict:
        return {
            "netuid":     self.netuid,
            "tao_in":     round(self.tao_in,    6),
            "alpha_in":   round(self.alpha_in,  6),
            "price_tao":  round(self.price_tao, 8),
            "fetched_at": self.fetched_at.isoformat(timespec="seconds"),
        }


class PoolReservesService:
    """Singleton — populated by subnet_cache_service on each metagraph cycle."""

    def __init__(self) -> None:
        self._latest: Dict[int, _Reserves] = {}

    # ── Read API (sync, fast) ─────────────────────────────────────────────────

    def latest(self, netuid: int) -> Optional[_Reserves]:
        return self._latest.get(int(netuid))

    def all_latest(self) -> Dict[int, _Reserves]:
        return dict(self._latest)

    # ── Write API (called by subnet_cache_service inside AsyncSubtensor ctx) ──

    async def fetch_for(self, sub, netuids: Iterable[int]) -> List[_Reserves]:
        """
        Pull reserves for each netuid using the *already-open* AsyncSubtensor
        context manager `sub`. Updates the in-memory cache and returns the
        fresh snapshots so the caller can persist them in one DB transaction.

        Robust to per-subnet RPC failures — bad subnets are skipped with a
        warning and the rest of the batch proceeds.

        Day 12 R8: bounded concurrency (semaphore-gated, default 8 in flight)
        replaces the old sequential loop.  Critical now that the universe
        expanded from 6 to ~80–128 subnets.  Per-subnet failure is still
        isolated — semaphore just controls how many `sub.subnet(...)` calls
        we hold open simultaneously.
        """
        netuid_list = sorted(set(int(u) for u in netuids))
        if not netuid_list:
            return []

        now = datetime.now(timezone.utc)
        sem = asyncio.Semaphore(_FETCH_CONCURRENCY)

        # Local accumulator — bare list + lock-free since asyncio is
        # single-threaded; the gather() below collects each task's
        # individual return value and we filter Nones.
        async def _one(netuid: int) -> Optional[_Reserves]:
            async with sem:
                try:
                    info = await asyncio.wait_for(
                        sub.subnet(netuid=netuid),
                        timeout=_PER_SUBNET_TIMEOUT_S,
                    )
                    if info is None:
                        logger.warning(f"pool_reserves: SN{netuid} returned no DynamicInfo")
                        return None
                    # Bittensor Balance → float TAO/alpha. Defensive: accept
                    # either a Balance object or a raw float.
                    tao_in   = _balance_to_float(getattr(info, "tao_in",   None))
                    alpha_in = _balance_to_float(getattr(info, "alpha_in", None))
                    if tao_in <= 0 or alpha_in <= 0:
                        logger.debug(
                            f"pool_reserves: SN{netuid} degenerate pool "
                            f"(τ={tao_in}, α={alpha_in}) — skipping"
                        )
                        return None
                    snap = _Reserves(netuid, tao_in, alpha_in, now)
                    self._latest[netuid] = snap
                    return snap
                except asyncio.TimeoutError:
                    logger.warning(
                        f"pool_reserves: SN{netuid} sub.subnet() timeout "
                        f"after {_PER_SUBNET_TIMEOUT_S}s — skipping"
                    )
                except Exception as e:
                    logger.warning(f"pool_reserves: SN{netuid} fetch failed: {e}")
                return None

        gathered = await asyncio.gather(*(_one(u) for u in netuid_list))
        results = [r for r in gathered if r is not None]

        # Single aggregate log line at INFO so we don't spam ~80 lines per
        # 5-min cycle. Per-subnet success stays at DEBUG (toggle via log
        # level) — drop to one batch summary instead.
        if results:
            logger.info(
                f"pool_reserves: cycle complete — {len(results)}/{len(netuid_list)} "
                f"subnets snapshotted (concurrency={_FETCH_CONCURRENCY})"
            )

        return results

    async def persist(self, snaps: List[_Reserves]) -> int:
        """Bulk-insert fresh snapshots. Returns # rows written."""
        if not snaps:
            return 0
        async with AsyncSessionLocal() as session:
            for s in snaps:
                session.add(PoolSnapshot(
                    netuid     = s.netuid,
                    tao_in     = s.tao_in,
                    alpha_in   = s.alpha_in,
                    price_tao  = s.price_tao,
                ))
            await session.commit()
        return len(snaps)

    # ── History readers (used by /api/market/pool/{uid}) ──────────────────────

    async def history(
        self, netuid: int, lookback: timedelta, max_points: int = 200,
    ) -> List[dict]:
        """
        Return up to `max_points` evenly-distributed (downsampled) snapshots
        for `netuid` over the last `lookback` window, oldest first. Schema:
        {ts, tao_in, alpha_in, price_tao}.

        Downsampling: pull all rows in window, then take every Nth row so
        the output never exceeds `max_points`. Cheaper than time-bucketed
        aggregation for the volumes we care about (≤8.6k rows per subnet
        per 30-day window).
        """
        cutoff = datetime.now(timezone.utc) - lookback
        async with AsyncSessionLocal() as session:
            rows = (await session.execute(
                select(PoolSnapshot)
                .where(and_(
                    PoolSnapshot.netuid == int(netuid),
                    PoolSnapshot.recorded_at >= cutoff,
                ))
                .order_by(PoolSnapshot.recorded_at.asc())
            )).scalars().all()

        if not rows:
            return []
        if len(rows) <= max_points:
            return [_row_to_dict(r) for r in rows]
        step = len(rows) / max_points
        out: List[dict] = []
        i = 0.0
        while int(i) < len(rows) and len(out) < max_points:
            out.append(_row_to_dict(rows[int(i)]))
            i += step
        # Always include the latest sample so the curve ends "now".
        if rows[-1].id != out[-1]["id"]:
            out.append(_row_to_dict(rows[-1]))
        return out

    async def turnover_24h(self, netuid: int) -> dict:
        """
        24h pool turnover proxy. With reserve snapshots alone we can't
        directly observe trade volume, but we CAN observe how much the
        reserves have moved — which is a tight lower bound on actual
        turnover (a swap of size X moves the τ side by X, the α side by
        the corresponding bonded amount).

        Returns:
            {
              avg_tao_in: avg τ_in over 24h,
              tao_in_min: min τ_in,
              tao_in_max: max τ_in,
              tao_swing: max - min   (a directional turnover lower bound),
              samples:   n snapshots seen,
            }
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        async with AsyncSessionLocal() as session:
            rows = (await session.execute(
                select(PoolSnapshot)
                .where(and_(
                    PoolSnapshot.netuid == int(netuid),
                    PoolSnapshot.recorded_at >= cutoff,
                ))
                .order_by(PoolSnapshot.recorded_at.asc())
            )).scalars().all()
        if not rows:
            return {
                "avg_tao_in": 0.0, "tao_in_min": 0.0, "tao_in_max": 0.0,
                "tao_swing":  0.0, "samples":    0,
            }
        taos = [r.tao_in for r in rows]
        return {
            "avg_tao_in": round(sum(taos) / len(taos), 4),
            "tao_in_min": round(min(taos), 4),
            "tao_in_max": round(max(taos), 4),
            "tao_swing":  round(max(taos) - min(taos), 4),
            "samples":    len(rows),
        }


# ── Helpers ───────────────────────────────────────────────────────────────────


def _balance_to_float(b) -> float:
    """Accept bittensor.Balance, plain float/int, or None."""
    if b is None:
        return 0.0
    # bittensor.Balance exposes .tao for whole-unit float
    if hasattr(b, "tao"):
        try:
            return float(b.tao)
        except Exception:
            pass
    try:
        return float(b)
    except Exception:
        return 0.0


def _row_to_dict(r: PoolSnapshot) -> dict:
    return {
        "id":        r.id,
        "ts":        r.recorded_at.isoformat(timespec="seconds") if r.recorded_at else None,
        "tao_in":    round(r.tao_in,    4),
        "alpha_in":  round(r.alpha_in,  4),
        "price_tao": round(r.price_tao, 8),
    }


# Singleton — imported by subnet_cache_service for writes and routers/market
# for reads.
pool_reserves_service = PoolReservesService()