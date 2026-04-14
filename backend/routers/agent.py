"""
II Agent Orchestrator API
GET  /api/agent/status          → regime, fleet health, last analysis
GET  /api/agent/observations    → natural-language observation log
GET  /api/agent/recommendations → actionable recommendation list
POST /api/agent/analyze         → trigger immediate analysis
"""
from fastapi import APIRouter, Query
from services.agent_service import agent_service

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.get("/status")
async def get_status():
    return agent_service.get_status()


@router.get("/observations")
async def get_observations(limit: int = Query(default=30, ge=1, le=100)):
    return {
        "observations": agent_service.get_observations(limit),
        "total":        len(agent_service.get_observations(100)),
    }


@router.get("/recommendations")
async def get_recommendations():
    return {
        "recommendations": agent_service.get_recommendations(),
    }


@router.post("/analyze")
async def trigger_analysis():
    """Trigger an immediate II Agent analysis cycle."""
    report = await agent_service.analyze()
    return {
        "message":     "Analysis complete",
        "analysis_id": report["analysis_id"],
        "regime":      report["regime"],
        "fleet_pnl":   report["fleet_pnl"],
        "hot_bots":    report["hot_bots"],
        "struggling":  report["struggling_bots"],
        "report":      report,
    }