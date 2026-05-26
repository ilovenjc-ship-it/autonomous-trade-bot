"""
Fleet Consensus BFT API
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
    Predict the outcome of a hypothetical Fleet Consensus round at the current
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


# ─── Forecast accuracy (Session XXXVII — Phase F: model-drift gauge) ─────────

@router.get("/forecast-accuracy")
async def forecast_accuracy(
    window:        int = Query(50, ge=5, le=500, description="Rolling window size"),
    recent_limit:  int = Query(20, ge=5, le=100, description="Sparkline history length"),
):
    """
    Calibration metrics for the Fleet Consensus vote forecaster.

    Every consensus round records (forecast_prob, actual_approved).  This
    endpoint surfaces aggregate calibration across the last `window`
    rounds, plus the last `recent_limit` raw samples for a sparkline.

    Returns
    -------
    {
      "summary": {
        "samples":         int,      # in-window count
        "lifetime_total":  int,      # all-time records (incl. rotated)
        "window":          int,
        "brier_score":     float|None,    # mean((f - a)^2) — lower better
        "mean_abs_error":  float|None,    # mean(|f - a|)
        "calibration_pct": float|None,    # (1 - MAE) * 100, friendly score
        "band":            "calibrated"|"drifting"|"uncalibrated"|"cold",
        "by_direction":    {BUY:{...}, SELL:{...}},
        "approved_rate":   float|None,
        "as_of":           str,
      },
      "recent": [   # newest-first
        {round_id, timestamp, direction, forecast, actual, abs_error, sq_error, market},
        ...
      ]
    }

    The "cold" band is returned when no rounds have completed yet.
    """
    from services.forecast_accuracy_service import forecast_accuracy_service
    return {
        "summary": forecast_accuracy_service.summary(window=window),
        "recent":  forecast_accuracy_service.recent(n=recent_limit),
    }
