"""
OpenClaw BFT Consensus API
GET  /api/consensus/latest       → most recent round (full vote breakdown)
GET  /api/consensus/history      → last N rounds
GET  /api/consensus/stats        → aggregate approval stats
POST /api/consensus/trigger      → manually trigger a consensus round
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional

from services.consensus_service import consensus_service, BOT_PERSONALITIES, VOTE_BUY, VOTE_SELL

router = APIRouter(prefix="/api/consensus", tags=["consensus"])


class TriggerRequest(BaseModel):
    triggered_by: str = "manual"
    direction: str    = "BUY"   # BUY | SELL


@router.get("/latest")
async def get_latest():
    """Return the most recent consensus round with full vote breakdown."""
    data = consensus_service.get_latest()
    if not data:
        return {"round": None, "message": "No consensus rounds yet"}
    return {"round": data}


@router.get("/history")
async def get_history(limit: int = Query(default=20, ge=1, le=200)):
    """Return last N consensus rounds (newest first)."""
    return {
        "rounds": consensus_service.get_history(limit),
        "total":  consensus_service.round_count,
    }


@router.get("/stats")
async def get_stats():
    """Aggregate BFT consensus statistics."""
    return consensus_service.get_stats()


@router.post("/trigger")
async def trigger_consensus(body: TriggerRequest):
    """
    Manually trigger a consensus round.
    Useful for UI testing and manual overrides.
    """
    direction = body.direction.upper()
    if direction not in (VOTE_BUY, VOTE_SELL):
        direction = VOTE_BUY

    result = await consensus_service.run_consensus(
        triggered_by = body.triggered_by,
        direction    = direction,
    )

    return {
        "round_id":  result.round_id,
        "approved":  result.approved,
        "result":    result.result,
        "direction": result.direction,
        "buy_count":  result.buy_count,
        "sell_count": result.sell_count,
        "hold_count": result.hold_count,
        "detail":    consensus_service.get_latest(),
    }


@router.get("/bots")
async def get_bot_list():
    """Return the list of all voting bots and their personalities."""
    bots = []
    for name, p in BOT_PERSONALITIES.items():
        from services.consensus_service import BOT_DISPLAY_NAMES
        bots.append({
            "name":             name,
            "display_name":     BOT_DISPLAY_NAMES.get(name, name),
            "directional_bias": p["directional_bias"],
            "conviction":       p["conviction"],
            "rsi_sensitivity":  p["rsi_sensitivity"],
        })
    return {"bots": bots}