"""
Promotion Service — Autonomous Strategy Promotion Engine
=========================================================
Runs as a background asyncio task, checking all strategies against the
4-gate promotion criteria every PROMOTION_CHECK_INTERVAL seconds.

Promotion Gates (same as manual gate in fleet.py):
  1. cycles_completed >= 10
  2. win_rate >= 55.0%
  3. (win_trades - loss_trades) >= 2
  4. total_pnl > 0.0

Promotion Path:
  PAPER_ONLY → APPROVED_FOR_LIVE → LIVE (+ is_active = True)

Rate Limiting:
  - Max 1 promotion per cycle run (safety throttle)
  - Max 1 promotion per strategy per 12 hours (prevents flip-flopping)

Auto-Rebalance:
  - Runs the score-weighted capital rebalance algorithm every REBALANCE_INTERVAL seconds (default: 86400 = 24h)
  - Records last_rebalanced_at timestamp
  - Fires an alert on completion
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import select, update

from db.database import AsyncSessionLocal
from models.strategy import Strategy
from services.alert_service import alert_service

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
PROMOTION_CHECK_INTERVAL = 300        # seconds — check gates every 5 min
REBALANCE_INTERVAL       = 86_400     # seconds — auto-rebalance every 24h
MIN_HOURS_BETWEEN_PROMOTIONS = 12     # hours — throttle per strategy

GATE_CYCLES_REQUIRED     = 10
GATE_WIN_RATE_REQUIRED   = 55.0       # %
GATE_WIN_MARGIN_REQUIRED = 2          # wins must exceed losses by at least N
GATE_PNL_REQUIRED        = 0.0        # cumulative PnL must be positive

ALLOC_FLOOR  = 2.0
ALLOC_CAP    = 30.0
ALLOC_TOTAL  = 100.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _gates_clear(s: Strategy) -> bool:
    """Return True if strategy passes all 4 promotion gates."""
    cycles_ok = (s.cycles_completed or 0) >= GATE_CYCLES_REQUIRED
    wr_ok     = (s.win_rate or 0) >= GATE_WIN_RATE_REQUIRED
    margin_ok = ((s.win_trades or 0) - (s.loss_trades or 0)) >= GATE_WIN_MARGIN_REQUIRED
    pnl_ok    = (s.total_pnl or 0) > GATE_PNL_REQUIRED
    return cycles_ok and wr_ok and margin_ok and pnl_ok


def _recently_promoted(s: Strategy) -> bool:
    """True if strategy was promoted within the throttle window."""
    if not s.last_promoted_at:
        return False
    # last_promoted_at stored as ISO string in DB (TEXT column)
    try:
        if isinstance(s.last_promoted_at, str):
            ts = datetime.fromisoformat(s.last_promoted_at.replace("Z", "+00:00"))
        else:
            ts = s.last_promoted_at
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
        return (_now() - ts) < timedelta(hours=MIN_HOURS_BETWEEN_PROMOTIONS)
    except Exception:
        return False


class PromotionService:
    def __init__(self):
        self.is_running          = False
        self._task: Optional[asyncio.Task] = None
        self._last_rebalanced_at: Optional[datetime] = None
        self._promotions_this_session: list[dict] = []  # audit log

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        if self.is_running:
            return
        self.is_running = True
        self._task = asyncio.create_task(self._loop(), name="promotion_service")
        logger.info("PromotionService started — checking gates every %ds, rebalancing every %dh",
                    PROMOTION_CHECK_INTERVAL, REBALANCE_INTERVAL // 3600)

    async def stop(self) -> None:
        self.is_running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("PromotionService stopped")

    # ── Main loop ─────────────────────────────────────────────────────────────

    async def _loop(self) -> None:
        # Wait 30s after startup before first check (let DB seed complete)
        await asyncio.sleep(30)

        # Always run an initial rebalance on first startup so allocations
        # are DB-persisted from minute 1 (avoids stale in-memory defaults)
        logger.info("PromotionService: running initial rebalance on startup…")
        await self._run_rebalance()
        # Reset last_rebalanced_at so the 24h clock starts from now
        # (already set by _run_rebalance)

        while self.is_running:
            try:
                await self._check_promotions()
                await self._maybe_rebalance()
            except Exception as exc:
                logger.error("PromotionService loop error: %s", exc, exc_info=True)

            try:
                await asyncio.sleep(PROMOTION_CHECK_INTERVAL)
            except asyncio.CancelledError:
                break

    # ── Promotion logic ───────────────────────────────────────────────────────

    async def _check_promotions(self) -> None:
        """Evaluate all non-LIVE strategies against the promotion gates."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Strategy).where(Strategy.mode != "LIVE")
            )
            candidates = result.scalars().all()

        promoted_this_run = 0   # max 1 per cycle (rate limit)

        for s in candidates:
            if promoted_this_run >= 1:
                break  # Safety throttle — at most 1 promotion per cycle

            if _recently_promoted(s):
                continue  # Still in throttle window for this strategy

            if not _gates_clear(s):
                continue  # Gates not met — skip

            # Gates are clear — determine what promotion to make
            if s.mode == "PAPER_ONLY":
                await self._promote_to_approved(s)
                promoted_this_run += 1
            elif s.mode == "APPROVED_FOR_LIVE":
                await self._promote_to_live(s)
                promoted_this_run += 1

    async def _promote_to_approved(self, s: Strategy) -> None:
        """PAPER_ONLY → APPROVED_FOR_LIVE"""
        now_iso = _now().isoformat()
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(Strategy)
                .where(Strategy.id == s.id)
                .values(mode="APPROVED_FOR_LIVE", last_promoted_at=now_iso)
            )
            await db.commit()

        stats = (f"WR={s.win_rate:.1f}% | PnL={s.total_pnl:+.4f}τ | "
                 f"Trades={s.total_trades} | Margin={s.win_trades - s.loss_trades}")
        alert_service.gate_promotion(
            strategy_name=s.name,
            display_name=s.display_name,
            new_mode="APPROVED_FOR_LIVE",
            stats=stats,
        )
        self._promotions_this_session.append({
            "strategy": s.name,
            "from_mode": "PAPER_ONLY",
            "to_mode": "APPROVED_FOR_LIVE",
            "at": now_iso,
        })
        logger.info("🎯 AUTONOMOUS PROMOTION: %s → APPROVED_FOR_LIVE (%s)", s.name, stats)

    async def _promote_to_live(self, s: Strategy) -> None:
        """APPROVED_FOR_LIVE → LIVE + activate"""
        now_iso = _now().isoformat()
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(Strategy)
                .where(Strategy.id == s.id)
                .values(mode="LIVE", is_active=True, last_promoted_at=now_iso)
            )
            await db.commit()

        stats = (f"WR={s.win_rate:.1f}% | PnL={s.total_pnl:+.4f}τ | "
                 f"Trades={s.total_trades} | Margin={s.win_trades - s.loss_trades}")
        alert_service.gate_promotion(
            strategy_name=s.name,
            display_name=s.display_name,
            new_mode="LIVE",
            stats=stats,
        )
        self._promotions_this_session.append({
            "strategy": s.name,
            "from_mode": "APPROVED_FOR_LIVE",
            "to_mode": "LIVE",
            "at": now_iso,
        })
        logger.info("🚀 AUTONOMOUS PROMOTION: %s → LIVE + activated (%s)", s.name, stats)

    # ── Auto-rebalance ─────────────────────────────────────────────────────────

    async def _maybe_rebalance(self) -> None:
        """Run capital rebalance if 24h have passed since last run."""
        if self._last_rebalanced_at is not None:
            elapsed = (_now() - self._last_rebalanced_at).total_seconds()
            if elapsed < REBALANCE_INTERVAL:
                return  # Not time yet

        await self._run_rebalance()

    async def _run_rebalance(self) -> None:
        """Execute the score-weighted capital rebalance algorithm and persist to DB."""
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Strategy))
                strategies = result.scalars().all()

            max_pnl = max((abs(s.total_pnl or 0) for s in strategies), default=0.001) or 0.001
            scores: dict[str, float] = {}
            for s in strategies:
                pnl = s.total_pnl or 0
                wr  = s.win_rate  or 0
                raw = (wr * 0.6 + (pnl / max_pnl * 100) * 0.4) if (wr > 0 or pnl != 0) else 50.0
                scores[s.name] = max(0.1, min(100.0, raw))

            names      = [s.name for s in strategies]
            n          = len(names)
            floor_pool = ALLOC_FLOOR * n
            merit_pool = ALLOC_TOTAL - floor_pool

            total_score = sum(scores[nm] for nm in names)
            new_alloc: dict[str, float] = {}

            for nm in names:
                new_alloc[nm] = ALLOC_FLOOR + (scores[nm] / total_score) * merit_pool

            # CAP enforcement with bleed redistribution
            for _ in range(10):
                capped   = {nm for nm, v in new_alloc.items() if v >= ALLOC_CAP}
                uncapped = [nm for nm in names if nm not in capped]
                if not uncapped:
                    break
                excess = sum(new_alloc[nm] - ALLOC_CAP for nm in capped)
                for nm in capped:
                    new_alloc[nm] = ALLOC_CAP
                if excess < 0.001:
                    break
                uncap_score = sum(scores[nm] for nm in uncapped)
                for nm in uncapped:
                    new_alloc[nm] += (scores[nm] / uncap_score) * excess

            # Normalise to exactly 100%
            for nm in names:
                new_alloc[nm] = round(new_alloc[nm], 1)
            diff = round(ALLOC_TOTAL - sum(new_alloc.values()), 1)
            if diff != 0:
                top = max(names, key=lambda nm: scores[nm])
                new_alloc[top] = round(new_alloc[top] + diff, 1)

            # Persist to DB
            now_iso = _now().isoformat()
            async with AsyncSessionLocal() as db:
                for s in strategies:
                    if s.name in new_alloc:
                        await db.execute(
                            update(Strategy)
                            .where(Strategy.id == s.id)
                            .values(allocation_pct=new_alloc[s.name])
                        )
                await db.commit()

            self._last_rebalanced_at = _now()

            top3 = sorted(names, key=lambda nm: new_alloc[nm], reverse=True)[:3]
            summary = ", ".join(
                f"{nm.replace('_', ' ').title()} {new_alloc[nm]:.1f}%" for nm in top3
            )
            alert_service.system_alert(
                title=f"⚖️ Auto-Rebalance Complete",
                message=(f"Score-weighted capital reallocated across {n} strategies. "
                         f"Top allocations: {summary}."),
                level="INFO",
            )
            logger.info("⚖️ Auto-rebalance complete — persisted to DB. Top 3: %s", summary)

        except Exception as exc:
            logger.error("Auto-rebalance failed: %s", exc, exc_info=True)

    # ── Status / introspection ─────────────────────────────────────────────────

    @property
    def last_rebalanced_at(self) -> Optional[str]:
        if self._last_rebalanced_at is None:
            return None
        return self._last_rebalanced_at.isoformat().replace("+00:00", "Z")

    @property
    def promotions_this_session(self) -> list[dict]:
        return list(self._promotions_this_session)

    async def force_rebalance(self) -> None:
        """Trigger an immediate rebalance (called by manual Rebalance button)."""
        await self._run_rebalance()

    async def force_check_promotions(self) -> None:
        """Trigger an immediate gate check (for testing/debugging)."""
        await self._check_promotions()


# ── Singleton ─────────────────────────────────────────────────────────────────
promotion_service = PromotionService()