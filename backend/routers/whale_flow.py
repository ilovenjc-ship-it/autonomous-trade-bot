"""
Whale Flow API
==============
Endpoints for the per-subnet stake/unstake whale activity feed.

GET /api/whale-flow                       → ring-buffer events (filterable)
GET /api/whale-flow/summary               → aggregate net flow (all subnets)
GET /api/whale-flow/{netuid}              → events for a single subnet
GET /api/whale-flow/{netuid}/summary      → aggregate for a single subnet
GET /api/whale-flow/status                → service health / config check

Window query param accepts ``1d`` / ``1w`` / ``1m`` (defaults to ``1w``).

Phase 1 shipped Session XXXVII — replaces the value proposition of
TaoStats Standard tier ($50/mo) with a free integration on the same
delegation-events endpoint already used by services/whale_service.py.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from services.whale_flow_service import whale_flow_service


router = APIRouter(prefix="/api/whale-flow", tags=["whale-flow"])


_VALID_WINDOWS = ("1d", "1w", "1m")


def _validate_window(window: str) -> str:
    if window not in _VALID_WINDOWS:
        raise HTTPException(
            status_code=400,
            detail=f"window must be one of {_VALID_WINDOWS}",
        )
    return window


@router.get("/status")
async def get_status() -> dict:
    """Health / configuration check — used by the UI to render setup CTAs."""
    return whale_flow_service.snapshot()


@router.get("")
async def list_events(
    netuid:  Optional[int]   = Query(None,  ge=0,   description="Filter by subnet (omit for all)"),
    window:  str             = Query("1w",  description="Rolling window: 1d / 1w / 1m"),
    limit:   int             = Query(50,    ge=1, le=200, description="Max events returned"),
    min_tao: Optional[float] = Query(None,  gt=0,   description="Override default 100 τ floor"),
) -> dict:
    _validate_window(window)
    events = whale_flow_service.events_for_subnet(
        netuid=netuid, window=window, limit=limit, min_tao=min_tao
    )
    snap = whale_flow_service.snapshot()
    return {
        "events":     events,
        "total":      len(events),
        "netuid":     netuid,
        "window":     window,
        "min_tao":    (min_tao if min_tao is not None else snap["min_tao"]),
        "fetched_at": snap["fetched_at"],
        "stale":      snap["stale"],
        "configured": snap["configured"],
    }


@router.get("/summary")
async def global_summary(
    window:  str             = Query("1w"),
    min_tao: Optional[float] = Query(None, gt=0),
) -> dict:
    """Aggregate flow across **all** subnets in the window."""
    _validate_window(window)
    return whale_flow_service.summary_for_subnet(
        netuid=None, window=window, min_tao=min_tao
    )


@router.get("/{netuid}")
async def list_events_for_subnet(
    netuid:  int,
    window:  str             = Query("1w"),
    limit:   int             = Query(50, ge=1, le=200),
    min_tao: Optional[float] = Query(None, gt=0),
) -> dict:
    if netuid < 0:
        raise HTTPException(status_code=400, detail="netuid must be ≥ 0")
    _validate_window(window)
    events = whale_flow_service.events_for_subnet(
        netuid=netuid, window=window, limit=limit, min_tao=min_tao
    )
    snap = whale_flow_service.snapshot()
    return {
        "events":     events,
        "total":      len(events),
        "netuid":     netuid,
        "window":     window,
        "min_tao":    (min_tao if min_tao is not None else snap["min_tao"]),
        "fetched_at": snap["fetched_at"],
        "stale":      snap["stale"],
        "configured": snap["configured"],
    }


@router.get("/{netuid}/summary")
async def subnet_summary(
    netuid:  int,
    window:  str             = Query("1w"),
    min_tao: Optional[float] = Query(None, gt=0),
) -> dict:
    if netuid < 0:
        raise HTTPException(status_code=400, detail="netuid must be ≥ 0")
    _validate_window(window)
    return whale_flow_service.summary_for_subnet(
        netuid=netuid, window=window, min_tao=min_tao
    )