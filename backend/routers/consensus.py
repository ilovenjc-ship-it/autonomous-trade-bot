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
async def get_history(limit: int = Query(default=20, ge=1, le=500)):  # Session XXX: 200 → 500
    """Return last N consensus rounds (newest first).
    Session XXX: `lifetime_total` is the monotonic round counter (survives
    buffer rotation); `total` is the current in-memory buffer size."""
    return {
        "rounds":         consensus_service.get_history(limit),
        "total":          len(consensus_service.get_history(500)),
        "lifetime_total": consensus_service.round_count,
        "buffer_max":     500,
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

# ─── Vote forecasting (Session XXXIV — Phase C) ──────────────────────────────

@router.get("/forecast")
async def forecast(
    direction:    str = Query("BUY", description="BUY or SELL"),
    triggered_by: str = Query("forecast", description="Strategy name or 'forecast'"),
    trials:       int = Query(1000, ge=50, le=5000, description="Monte Carlo sample size"),
):
    """
    Predict the outcome of a hypothetical OpenClaw round at the current
    market state. Runs N Monte Carlo trials over the same vote engine
    used for live consensus, returning expected vote counts, per-bot
    lean probabilities, and the overall pass probability.

    See ``consensus_service.forecast_vote`` for the full schema.
    """
    direction = direction.upper()
    if direction not in (VOTE_BUY, VOTE_SELL):
        direction = VOTE_BUY
    return consensus_service.forecast_vote(
        triggered_by = triggered_by,
        direction    = direction,
        trials       = trials,
    )
