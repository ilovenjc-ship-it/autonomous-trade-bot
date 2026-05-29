"""
ari_fear_greed_service.py — Day 16 (Path B)
============================================

Computes Ari's Fear & Greed Index — a 5-input composite synthesized from
inputs we already compute on the dashboard.

Replaces the dependency on api.tao.app/.../fear_greed/current, which moved
behind API auth despite Swagger labeling it "Free" (Day 16 morning bug #5
investigation).

Doctrinal frame (D-45):
  This is *Ari's number*, not the TAO.app number. Per the Day 15 doctrine
  inscription, Project Ari does not disclaim its own behavior — that
  includes its own outputs. We own this synthesis, including the calibration
  decisions documented below. Mistakes here are owned, not laundered.

The five inputs (each normalized to ±100, 0 = neutral):
  1. TAO momentum     — 24h price-change-pct from CoinGecko payload, scaled.
  2. RSI(14) divergence — Wilder's RSI from price_service (D-8 INV-1), centered on 50.
  3. MACD signal      — MACD histogram (macd - macd_signal) tanh-normalized
                        against a 1%-of-price scale.
  4. Subnet breadth   — Across `_DISPLAY_UIDS`, fraction of subnets with positive
                        24h price_tao change vs negative, mapped to ±100.
  5. Consensus tilt   — Across the last N consensus rounds, (buy - sell) /
                        (buy + sell + hold) × 100.

Composite policy (Day 16 lock):
  - Equal weights (20% each) when all five inputs are present.
  - Graceful redistribution: if K of the 5 inputs are missing, the remaining
    (5-K) inputs each pick up an equal share of the missing weight.
  - All-missing → returns None (NOT 0). AP-1 (no fabricated numbers) is
    binding: a value-of-None is more honest than a fabricated neutral.
  - Cache: 5 minutes (matches the existing /fear-greed cadence).
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

# ─────────────────────────────────────────────────────────────────────────────
# Component normalizers
#
# Each helper takes a raw input and returns a value in [-100, +100], or None
# if the input is missing / cannot be normalized. Pure functions, fully
# unit-testable.
# ─────────────────────────────────────────────────────────────────────────────

def _clamp(v: float, lo: float = -100.0, hi: float = 100.0) -> float:
    if v != v:  # NaN
        return 0.0
    return max(lo, min(hi, v))


def normalize_momentum(price_change_pct_24h: Optional[float]) -> Optional[float]:
    """
    24h % change → ±100. ±10% maps to ±100; clamped beyond.

    Why ±10% as the saturation point: TAO has historically swung 5–10% on
    routine days; ±10% is roughly a "this is a real move" threshold. Anything
    beyond is already extreme — no need to discriminate further on the gauge.
    """
    if price_change_pct_24h is None:
        return None
    return _clamp(price_change_pct_24h * 10.0)  # ±10% → ±100


def normalize_rsi(rsi_14: Optional[float]) -> Optional[float]:
    """
    RSI(14) → ±100. RSI 50 = neutral (0). RSI 0 → -100, RSI 100 → +100.

    Standard interpretation: RSI > 70 = overbought (greedy), RSI < 30 =
    oversold (fearful). Linear mapping is the simplest defensible choice
    — no claim that RSI 80 is "twice as greedy" as RSI 65; the gauge already
    interprets magnitudes via its colored zones.
    """
    if rsi_14 is None:
        return None
    return _clamp((rsi_14 - 50.0) * 2.0)


def normalize_macd(
    macd: Optional[float],
    macd_signal: Optional[float],
    current_price: Optional[float],
) -> Optional[float]:
    """
    MACD histogram (macd - signal) → ±100, scaled relative to price.

    MACD magnitudes vary with the underlying price (a $400 TAO has bigger
    MACD swings than a $40 TAO). Tanh-normalize against 1% of current price
    so the output is comparable across price regimes.

    Saturation point: histogram = 1% of price → tanh(1) ≈ 76 (i.e. "strongly
    bullish"). Histogram = 2% of price → tanh(2) ≈ 96 (near-saturation).
    """
    if macd is None or macd_signal is None or current_price is None or current_price <= 0:
        return None
    hist = macd - macd_signal
    scale = current_price * 0.01
    if scale <= 0:
        return None
    return _clamp(math.tanh(hist / scale) * 100.0)


def normalize_breadth(positive_count: int, total_count: int) -> Optional[float]:
    """
    Subnet breadth → ±100. (% positive - 50%) × 2.

    100% of subnets up → +100 (extreme greed across the ecosystem).
    50/50 → 0. 100% down → -100.

    Why ×2 and not just (% - 50): we want the full ±100 range available;
    the gauge zones already discriminate magnitude.
    """
    if total_count <= 0:
        return None
    pct_positive = (positive_count / total_count) * 100.0
    return _clamp((pct_positive - 50.0) * 2.0)


def normalize_consensus_tilt(
    buy_votes: int, sell_votes: int, hold_votes: int
) -> Optional[float]:
    """
    Consensus tilt → ±100. (buy - sell) / (buy + sell + hold) × 100.

    Hold votes count in the denominator because they're a real "no signal
    either way" datapoint — including them prevents a single buy/sell vote
    in a quiet window from spiking the index. Matches the spirit of D-26
    (TBM exit-distribution honesty): undecided is information, not noise.
    """
    total = buy_votes + sell_votes + hold_votes
    if total <= 0:
        return None
    return _clamp(((buy_votes - sell_votes) / total) * 100.0)


# ─────────────────────────────────────────────────────────────────────────────
# Composite synthesis
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class AriFearGreedComponents:
    """
    Per-component normalized values. Each is ±100 or None.

    Used both by the composite synthesizer and by the persistence layer
    (forensic columns on `ari_fear_greed_daily`).
    """
    momentum:  Optional[float]
    rsi:       Optional[float]
    macd:      Optional[float]
    breadth:   Optional[float]
    consensus: Optional[float]

    def as_dict(self) -> Dict[str, Optional[float]]:
        return {
            "momentum":  self.momentum,
            "rsi":       self.rsi,
            "macd":      self.macd,
            "breadth":   self.breadth,
            "consensus": self.consensus,
        }

    def present_count(self) -> int:
        return sum(1 for v in (self.momentum, self.rsi, self.macd, self.breadth, self.consensus) if v is not None)


def synthesize(components: AriFearGreedComponents) -> Optional[float]:
    """
    Equal-weighted blend with graceful redistribution when components are missing.

    Returns None if ALL components are missing. AP-1 binding: we do not
    fabricate a neutral value when we have no inputs.
    """
    present = [v for v in components.as_dict().values() if v is not None]
    if not present:
        return None
    # Equal weights with redistribution: when K of N are present, each gets 1/K.
    # This is mathematically identical to "equal-weight the present ones."
    return _clamp(sum(present) / len(present))


def label_for(value: Optional[float]) -> Optional[str]:
    """
    Map a ±100 composite to a human-readable label. Bands match the existing
    Dashboard SentimentGauge zones (see Dashboard.tsx: Extreme Fear / Fear /
    Neutral / Greed / Extreme Greed at ±25 / ±60 thresholds).
    """
    if value is None:
        return None
    if value >=  60: return "Extreme Greed"
    if value >=  25: return "Greed"
    if value >= -25: return "Neutral"
    if value >= -60: return "Fear"
    return "Extreme Fear"


# ─────────────────────────────────────────────────────────────────────────────
# Service singleton — orchestrates fetching from the live services + caching
# ─────────────────────────────────────────────────────────────────────────────

# Window for the consensus-tilt input — last N rounds. 50 is enough to
# smooth single-round noise; small enough that the index responds within
# ~hours of a regime shift (each cycle is ~60s, so 50 rounds = ~50 min).
CONSENSUS_WINDOW = 50

# Cache TTL — 5 minutes, matching the existing /fear-greed endpoint cadence.
_CACHE_TTL_SEC = 300.0


@dataclass
class _CacheEntry:
    payload: Dict
    ts: float


class AriFearGreedService:
    def __init__(self) -> None:
        self._cache: Optional[_CacheEntry] = None

    # ── Public API ───────────────────────────────────────────────────────────
    async def compute(self, *, force_refresh: bool = False) -> Dict:
        """
        Returns:
            {
              "value": Optional[float],        # ±100 or None
              "label": Optional[str],          # "Greed" etc. or None
              "components": {momentum, rsi, macd, breadth, consensus},
              "components_present": int,       # 0..5
              "computed_at": ISO timestamp,
              "cached": bool,
            }
        """
        now = time.time()
        if not force_refresh and self._cache is not None:
            if now - self._cache.ts < _CACHE_TTL_SEC:
                payload = dict(self._cache.payload)
                payload["cached"] = True
                return payload

        components = await self._gather_components()
        value = synthesize(components)
        label = label_for(value)
        payload = {
            "value":              value,
            "label":              label,
            "components":         components.as_dict(),
            "components_present": components.present_count(),
            "computed_at":        datetime.now(timezone.utc).isoformat(),
            "cached":             False,
        }
        self._cache = _CacheEntry(payload=dict(payload), ts=now)

        # Idempotent daily-snapshot persistence — writes only if today's
        # row doesn't already exist. Failure here doesn't break the API
        # response; we log and move on.
        try:
            await self._persist_daily_snapshot(value, label, components)
        except Exception as exc:  # noqa: BLE001
            import logging
            logging.getLogger(__name__).warning(
                f"Ari F&G daily-snapshot persist failed (non-fatal): {exc}"
            )
        return payload

    async def get_history(self, days: int = 30) -> List[Dict]:
        """
        Return the last `days` daily snapshots (oldest → newest).
        """
        from db.database import AsyncSessionLocal
        from sqlalchemy import select, desc
        from models.ari_fear_greed import AriFearGreed

        days = max(1, min(days, 365))
        async with AsyncSessionLocal() as db:
            stmt = (
                select(AriFearGreed)
                .order_by(desc(AriFearGreed.date))
                .limit(days)
            )
            rows = (await db.execute(stmt)).scalars().all()
        # Oldest first for chart-friendly iteration.
        rows = list(reversed(rows))
        return [
            {
                "date":               r.date.isoformat() if r.date else None,
                "value":              r.value,
                "label":              r.label,
                "momentum":           r.momentum,
                "rsi":                r.rsi,
                "macd":               r.macd,
                "breadth":            r.breadth,
                "consensus":          r.consensus,
                "components_present": r.components_present,
                "tao_price_usd":      r.tao_price_usd,
            }
            for r in rows
        ]

    # ── Internals ───────────────────────────────────────────────────────────
    async def _gather_components(self) -> AriFearGreedComponents:
        # Lazy imports to avoid circular dependencies at module-load time.
        from services.price_service import price_service
        from services.consensus_service import consensus_service

        # 1. TAO momentum (24h % change from CoinGecko payload)
        try:
            change_pct = price_service.price_data.get("price_change_pct_24h")  # type: ignore[union-attr]
            if change_pct is not None:
                change_pct = float(change_pct)
        except Exception:
            change_pct = None
        momentum = normalize_momentum(change_pct)

        # 2 + 3. RSI + MACD (computed in one pass from price_service)
        try:
            indicators = price_service.compute_indicators()
            rsi_14      = indicators.get("rsi_14")
            macd        = indicators.get("macd")
            macd_signal = indicators.get("macd_signal")
        except Exception:
            rsi_14, macd, macd_signal = None, None, None
        current_price = price_service.current_price
        rsi  = normalize_rsi(rsi_14)
        macd_norm = normalize_macd(macd, macd_signal, current_price)

        # 4. Subnet breadth (24h Δprice_tao across tradable subnets)
        breadth = await self._compute_breadth()

        # 5. Consensus tilt (last N rounds)
        try:
            history = consensus_service.get_history(limit=CONSENSUS_WINDOW)
            buys  = sum(int(getattr(r, "buy_count",  0)) for r in history)
            sells = sum(int(getattr(r, "sell_count", 0)) for r in history)
            holds = sum(int(getattr(r, "hold_count", 0)) for r in history)
        except Exception:
            buys, sells, holds = 0, 0, 0
        consensus_tilt = normalize_consensus_tilt(buys, sells, holds)

        return AriFearGreedComponents(
            momentum=momentum,
            rsi=rsi,
            macd=macd_norm,
            breadth=breadth,
            consensus=consensus_tilt,
        )

    async def _compute_breadth(self) -> Optional[float]:
        """
        Across all tradable subnets, count how many had positive vs negative
        24h Δprice_tao using the PoolSnapshot table.
        """
        try:
            from db.database import AsyncSessionLocal
            from sqlalchemy import select, and_, desc
            from models.pool_snapshot import PoolSnapshot
        except Exception:
            return None

        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        # Window for the "now" sample — last hour is "now-ish" given the
        # 5-min snapshot cadence.
        now_window_start = datetime.now(timezone.utc) - timedelta(hours=1)

        async with AsyncSessionLocal() as db:
            # Latest snapshot per subnet (within the last hour)
            stmt_now = (
                select(PoolSnapshot.netuid, PoolSnapshot.price_tao, PoolSnapshot.recorded_at)
                .where(PoolSnapshot.recorded_at >= now_window_start)
                .order_by(PoolSnapshot.netuid, desc(PoolSnapshot.recorded_at))
            )
            now_rows = (await db.execute(stmt_now)).all()

            # Snapshot from ~24h ago per subnet (24h ± 1h tolerance window)
            window_24h_start = cutoff - timedelta(hours=1)
            window_24h_end   = cutoff + timedelta(hours=1)
            stmt_24h = (
                select(PoolSnapshot.netuid, PoolSnapshot.price_tao, PoolSnapshot.recorded_at)
                .where(and_(
                    PoolSnapshot.recorded_at >= window_24h_start,
                    PoolSnapshot.recorded_at <= window_24h_end,
                ))
                .order_by(PoolSnapshot.netuid, desc(PoolSnapshot.recorded_at))
            )
            ago_rows = (await db.execute(stmt_24h)).all()

        # Pick the most-recent row per netuid in each set.
        latest_now: Dict[int, float] = {}
        for r in now_rows:
            if r.netuid not in latest_now:
                latest_now[r.netuid] = float(r.price_tao)

        latest_24h: Dict[int, float] = {}
        for r in ago_rows:
            if r.netuid not in latest_24h:
                latest_24h[r.netuid] = float(r.price_tao)

        # Intersect — only count subnets we have both endpoints for.
        positive = 0
        total = 0
        for netuid, price_now in latest_now.items():
            price_then = latest_24h.get(netuid)
            if price_then is None or price_then <= 0:
                continue
            total += 1
            if price_now > price_then:
                positive += 1

        if total == 0:
            return None
        return normalize_breadth(positive, total)

    async def _persist_daily_snapshot(
        self,
        value: Optional[float],
        label: Optional[str],
        components: AriFearGreedComponents,
    ) -> None:
        """
        Idempotent: writes a row only if today's UTC date doesn't already
        exist. The first compute of each day "wins" — subsequent computes
        same-day are no-ops at the DB level.

        Rationale: the index is daily-grain in the chart; writing once per
        day keeps the table small and the chart shape consistent.
        """
        from db.database import AsyncSessionLocal
        from sqlalchemy import select
        from models.ari_fear_greed import AriFearGreed
        from services.price_service import price_service

        today_utc = datetime.now(timezone.utc).date()

        async with AsyncSessionLocal() as db:
            existing = await db.execute(
                select(AriFearGreed).where(AriFearGreed.date == today_utc)
            )
            if existing.scalars().first() is not None:
                return  # already persisted today

            row = AriFearGreed(
                date=today_utc,
                value=value,
                label=label,
                momentum=components.momentum,
                rsi=components.rsi,
                macd=components.macd,
                breadth=components.breadth,
                consensus=components.consensus,
                components_present=components.present_count(),
                tao_price_usd=price_service.current_price,
            )
            db.add(row)
            await db.commit()


# Module singleton — matches price_service / consensus_service convention.
ari_fear_greed_service = AriFearGreedService()