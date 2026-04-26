"""
Human Override Router
=====================
Every action a human operator needs to take manually — without waiting for
the autonomous cycle engine. Full command authority over the fleet.

Endpoints
---------
POST /api/override/trade              — inject a manual BUY or SELL
POST /api/override/promote/{name}     — step strategy mode UP  (PAPER → APPROVED → LIVE)
POST /api/override/demote/{name}      — step strategy mode DOWN (LIVE → APPROVED → PAPER)
POST /api/override/emergency-stop     — hard halt ALL trading immediately
POST /api/override/resume             — re-enable trading after emergency stop
POST /api/override/rebalance          — force capital rebalance now
POST /api/override/force-promote-check — run promotion gate check immediately
"""

from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from models.strategy import Strategy
from services.trading_service import trading_service
from services.alert_service import alert_service

router = APIRouter(prefix="/api/override", tags=["override"])

# ── internal state ─────────────────────────────────────────────────────────────
_EMERGENCY_HALTED = False
_halted_at: Optional[str] = None


def _push(kind: str, message: str, strategy: Optional[str] = None):
    """Append to the in-process activity stream."""
    try:
        from services.activity_service import push_event
        push_event(kind=kind, message=message, strategy=strategy)
    except Exception:
        pass   # never block a command because the activity stream failed


async def _auto_rebalance(reason: str) -> None:
    """
    Trigger a capital rebalance automatically after a promote/demote.
    Called internally — never exposed as a direct human button.
    Runs the same fleet rebalance algorithm but sourced from within the process
    to avoid an HTTP round-trip.
    """
    try:
        from db.database import AsyncSessionLocal
        from sqlalchemy import select as _select
        from models.strategy import Strategy as _Strategy
        from services.promotion_service import promotion_service as _ps
        from datetime import timezone as _tz

        async with AsyncSessionLocal() as db:
            result = await db.execute(_select(_Strategy).order_by(_Strategy.id))
            strategies = result.scalars().all()

        FLOOR, CAP, TOTAL = 2.0, 30.0, 100.0
        n = len(strategies)
        if n == 0:
            return

        max_pnl = max((abs(s.total_pnl or 0) for s in strategies), default=0.001) or 0.001
        scores: dict[str, float] = {}
        for s in strategies:
            pnl = s.total_pnl or 0
            wr  = s.win_rate  or 0
            raw = (wr * 0.6 + (pnl / max_pnl * 100) * 0.4) if (wr > 0 or pnl != 0) else 50.0
            scores[s.name] = max(0.1, min(100, raw))

        names      = [s.name for s in strategies]
        floor_pool = FLOOR * n
        free_pool  = TOTAL - floor_pool
        total_score = sum(scores.values())
        raw_alloc   = {nm: FLOOR + (scores[nm] / total_score) * free_pool for nm in names}

        # cap redistribution
        capped: dict[str, float] = {}
        overflow = 0.0
        uncapped_score = 0.0
        for nm in names:
            if raw_alloc[nm] > CAP:
                overflow += raw_alloc[nm] - CAP
                capped[nm] = CAP
            else:
                capped[nm] = raw_alloc[nm]
                uncapped_score += scores[nm]
        if overflow > 0 and uncapped_score > 0:
            for nm in names:
                if capped[nm] < CAP:
                    capped[nm] += (scores[nm] / uncapped_score) * overflow

        new_alloc = {nm: round(capped[nm], 2) for nm in names}

        # persist to DB
        async with AsyncSessionLocal() as db:
            result2 = await db.execute(_select(_Strategy).order_by(_Strategy.id))
            strats2 = result2.scalars().all()
            for s_obj in strats2:
                alloc = new_alloc.get(s_obj.name, FLOOR)
                s_obj.allocation_pct = alloc
            await db.commit()

        _ps._last_rebalanced_at = datetime.now(_tz.utc)
        _push("system", f"⚖️ Auto-rebalance triggered by {reason}")

    except Exception as e:
        _push("error", f"Auto-rebalance failed after {reason}: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────
class ManualTradeRequest(BaseModel):
    action: Literal["buy", "sell"]
    amount: float = Field(..., gt=0, description="Amount in τ")
    reason: str   = Field(default="Human override — manual trade")

class PromoteRequest(BaseModel):
    pass   # no body needed; name comes from path

# ─────────────────────────────────────────────────────────────────────────────
# Mode progression map
# ─────────────────────────────────────────────────────────────────────────────
_MODE_UP: dict[str, str] = {
    "PAPER_ONLY":        "APPROVED_FOR_LIVE",
    "APPROVED_FOR_LIVE": "LIVE",
    "LIVE":              "LIVE",    # already at ceiling
}
_MODE_DOWN: dict[str, str] = {
    "LIVE":              "APPROVED_FOR_LIVE",
    "APPROVED_FOR_LIVE": "PAPER_ONLY",
    "PAPER_ONLY":        "PAPER_ONLY",   # already at floor
}
_MODE_LABEL: dict[str, str] = {
    "PAPER_ONLY":        "◌ PAPER",
    "APPROVED_FOR_LIVE": "◑ APPROVED",
    "LIVE":              "● LIVE",
}


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/trade")
async def manual_trade(payload: ManualTradeRequest):
    """Inject a manual BUY or SELL trade directly into the engine."""
    global _EMERGENCY_HALTED
    if _EMERGENCY_HALTED:
        raise HTTPException(status_code=503, detail="System is in EMERGENCY HALT. Resume first.")

    result = await trading_service.manual_trade(
        action=payload.action,
        amount=payload.amount,
        reason=payload.reason,
    )

    if result.get("success"):
        _push(
            "trade",
            f"🧑‍✈️ Manual {payload.action.upper()} {payload.amount:.4f} τ "
            f"@ ${result.get('price', 0):.2f} — {payload.reason}",
        )
        alert_service.system_alert(
            title=f"🧑‍✈️ Manual {payload.action.upper()} executed",
            message=(
                f"{payload.amount:.4f} τ @ ${result.get('price', 0):.2f} USD. "
                f"Reason: {payload.reason}"
            ),
            level="INFO",
        )
    else:
        _push("error", f"Manual trade FAILED: {result.get('message')}")

    return result


@router.post("/promote/{name}")
async def promote_strategy(name: str, db: AsyncSession = Depends(get_db)):
    """Step a strategy's mode UP one level (PAPER → APPROVED → LIVE)."""
    result = await db.execute(select(Strategy).where(Strategy.name == name))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail=f"Strategy '{name}' not found")

    current_mode = getattr(s, "mode", "PAPER_ONLY")
    new_mode = _MODE_UP.get(current_mode, current_mode)

    if new_mode == current_mode:
        return {
            "success": False,
            "message": f"{s.display_name} is already at {_MODE_LABEL[current_mode]} (ceiling)",
            "mode": current_mode,
        }

    s.mode = new_mode
    await db.commit()

    msg = (
        f"🧑‍✈️ Human promoted {s.display_name}: "
        f"{_MODE_LABEL[current_mode]} → {_MODE_LABEL[new_mode]}"
    )
    _push("promotion", msg, strategy=name)
    alert_service.system_alert(
        title=f"⬆️ {s.display_name} promoted to {_MODE_LABEL[new_mode]}",
        message=f"Human override — bypassed gate check. Previous: {_MODE_LABEL[current_mode]}. Capital rebalancing now.",
        level="INFO",
    )

    # Auto-trigger rebalance so capital immediately reflects the mode change
    await _auto_rebalance(f"promotion of {s.display_name} to {new_mode}")

    return {
        "success": True,
        "message": msg,
        "strategy": name,
        "previous_mode": current_mode,
        "new_mode": new_mode,
    }


@router.post("/demote/{name}")
async def demote_strategy(name: str, db: AsyncSession = Depends(get_db)):
    """Step a strategy's mode DOWN one level (LIVE → APPROVED → PAPER)."""
    result = await db.execute(select(Strategy).where(Strategy.name == name))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail=f"Strategy '{name}' not found")

    current_mode = getattr(s, "mode", "PAPER_ONLY")
    new_mode = _MODE_DOWN.get(current_mode, current_mode)

    if new_mode == current_mode:
        return {
            "success": False,
            "message": f"{s.display_name} is already at {_MODE_LABEL[current_mode]} (floor)",
            "mode": current_mode,
        }

    s.mode = new_mode
    await db.commit()

    msg = (
        f"🧑‍✈️ Human demoted {s.display_name}: "
        f"{_MODE_LABEL[current_mode]} → {_MODE_LABEL[new_mode]}"
    )
    _push("system", msg, strategy=name)
    alert_service.system_alert(
        title=f"⬇️ {s.display_name} demoted to {_MODE_LABEL[new_mode]}",
        message=f"Human override. Previous: {_MODE_LABEL[current_mode]}. Capital rebalancing now.",
        level="WARN",
    )

    # Auto-trigger rebalance so capital immediately reflects the mode change
    await _auto_rebalance(f"demotion of {s.display_name} to {new_mode}")

    return {
        "success": True,
        "message": msg,
        "strategy": name,
        "previous_mode": current_mode,
        "new_mode": new_mode,
    }


@router.post("/emergency-stop")
async def emergency_stop():
    """
    Hard halt — stop the trading engine AND the cycle engine immediately.
    No new trades will execute until /resume is called.
    """
    global _EMERGENCY_HALTED, _halted_at

    # Stop trading engine
    try:
        await trading_service.stop_bot()
    except Exception:
        pass

    # Stop cycle engine
    try:
        from services.cycle_service import cycle_service
        await cycle_service.stop()
    except Exception:
        pass

    _EMERGENCY_HALTED = True
    _halted_at = datetime.utcnow().isoformat() + "Z"

    msg = f"🚨 EMERGENCY STOP activated at {_halted_at}"
    _push("error", msg)
    alert_service.system_alert(
        title="🚨 EMERGENCY STOP",
        message="All trading halted by human operator. Call /override/resume to restart.",
        level="CRITICAL",
    )

    return {
        "success": True,
        "halted": True,
        "halted_at": _halted_at,
        "message": msg,
    }


@router.post("/resume")
async def resume_trading():
    """Re-enable trading after an emergency stop."""
    global _EMERGENCY_HALTED, _halted_at

    _EMERGENCY_HALTED = False
    _halted_at = None

    # Restart cycle engine
    try:
        from services.cycle_service import cycle_service
        if not cycle_service.is_running:
            import asyncio
            asyncio.create_task(cycle_service.start(interval_seconds=60))
    except Exception:
        pass

    msg = "✅ Trading resumed by human operator"
    _push("system", msg)
    alert_service.system_alert(
        title="✅ Trading Resumed",
        message="Emergency halt lifted. Cycle engine restarted.",
        level="INFO",
    )

    return {"success": True, "halted": False, "message": msg}


@router.get("/status")
async def override_status():
    """Return current override/halt state."""
    from services.cycle_service import cycle_service
    return {
        "emergency_halted": _EMERGENCY_HALTED,
        "halted_at": _halted_at,
        "cycle_engine_running": cycle_service.is_running,
        # trading_engine_running mirrors cycle engine — the cycle service IS the
        # execution engine; trading_service._running is a legacy flag never set.
        "trading_engine_running": cycle_service.is_running,
    }


class SetModeRequest(BaseModel):
    mode: Literal["PAPER_ONLY", "APPROVED_FOR_LIVE", "LIVE"]


@router.post("/set-mode/{name}")
async def set_strategy_mode(name: str, payload: SetModeRequest, db: AsyncSession = Depends(get_db)):
    """Directly set a strategy's mode (bypasses step-by-step progression)."""
    result = await db.execute(select(Strategy).where(Strategy.name == name))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail=f"Strategy '{name}' not found")

    current_mode = getattr(s, "mode", "PAPER_ONLY")
    new_mode = payload.mode

    if new_mode == current_mode:
        return {
            "success": False,
            "message": f"{s.display_name} is already at {_MODE_LABEL.get(current_mode, current_mode)}",
            "mode": current_mode,
        }

    s.mode = new_mode
    await db.commit()

    msg = (
        f"🧑‍✈️ Human set {s.display_name}: "
        f"{_MODE_LABEL.get(current_mode, current_mode)} → {_MODE_LABEL.get(new_mode, new_mode)}"
    )
    _push("promotion", msg, strategy=name)
    alert_service.system_alert(
        title=f"⚙️ {s.display_name} → {_MODE_LABEL.get(new_mode, new_mode)}",
        message=f"Direct mode set by human override. Previous: {_MODE_LABEL.get(current_mode, current_mode)}. Capital rebalancing now.",
        level="INFO" if new_mode == "LIVE" else "WARN",
    )

    await _auto_rebalance(f"direct mode set of {s.display_name} to {new_mode}")

    return {
        "success": True,
        "message": msg,
        "strategy": name,
        "previous_mode": current_mode,
        "new_mode": new_mode,
    }


@router.post("/rebalance")
async def force_rebalance(db: AsyncSession = Depends(get_db)):
    """Force an immediate capital rebalance across the fleet."""
    import httpx
    try:
        # Call the existing fleet rebalance endpoint internally
        async with httpx.AsyncClient() as client:
            res = await client.post("http://localhost:8001/api/fleet/rebalance", timeout=10)
            data = res.json()
    except Exception as e:
        data = {"success": False, "message": str(e)}

    _push("system", f"🧑‍✈️ Human triggered capital rebalance — {data.get('message', '')}")
    return data


@router.post("/force-promote-check")
async def force_promote_check():
    """Run promotion gate check right now, bypass the 5-minute throttle."""
    from services.promotion_service import promotion_service as _ps
    try:
        await _ps.force_check_promotions()
        msg = "Promotion gate check completed"
    except Exception as e:
        msg = f"Check failed: {e}"

    _push("system", f"🧑‍✈️ Force promotion check — {msg}")
    return {"success": True, "message": msg}