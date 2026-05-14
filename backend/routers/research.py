"""
Research / Quality Framework API
================================

Exposes the Const 6-Filter Test scorecard plus quality-gate utilities to
the frontend's Research panel and to operator tooling.

Routes
------
GET  /api/research/subnet-scorecard
        Full scorecard JSON: framework metadata, all 10 seeded subnets,
        per-subnet pass/fail by filter id, version, candidate flags.

GET  /api/research/subnet-scorecard/{netuid}
        Single-subnet view. 404 if not on the scorecard.

POST /api/research/subnet-scorecard/refresh
        Re-read backend/data/subnet_scorecard.json from disk. Lets an
        operator hot-edit the file (or commit an updated quarterly score)
        without a full container redeploy.

GET  /api/research/signal-candidates
        Subset of scorecard flagged is_taobot_signal_candidate=true —
        the subnets we're actively researching for live signal integration.

The quality gate itself (`passes_quality_gate`) is consumed internally by
signal_ingestor / consensus pipelines; it isn't exposed as a public route
because the gate decision is stateful (depends on caller's min_filters).
"""

from fastapi import APIRouter, HTTPException

from services.subnet_scorecard_service import subnet_scorecard_service

router = APIRouter(prefix="/api/research", tags=["research"])


@router.get("/subnet-scorecard")
async def get_subnet_scorecard():
    """Full Const 6-Filter Test scorecard (framework + all subnet entries)."""
    return subnet_scorecard_service.get_full_scorecard()


@router.get("/subnet-scorecard/{netuid}")
async def get_subnet_scorecard_entry(netuid: int):
    """Scorecard entry for a single subnet. 404 if not present."""
    entry = subnet_scorecard_service.get_subnet(netuid)
    if entry is None:
        raise HTTPException(
            status_code=404,
            detail=f"SN{netuid} is not on the current scorecard",
        )
    return entry


@router.post("/subnet-scorecard/refresh")
async def refresh_subnet_scorecard():
    """Force a re-read of backend/data/subnet_scorecard.json from disk."""
    count = subnet_scorecard_service.refresh_from_disk()
    return {"refreshed": True, "subnet_count": count}


@router.get("/signal-candidates")
async def get_signal_candidates():
    """Subnets flagged as active research targets for live signal integration."""
    candidates = subnet_scorecard_service.taobot_signal_candidates()
    return {"candidates": candidates, "count": len(candidates)}


@router.get("/quality-gate/check/{netuid}")
async def quality_gate_check(netuid: int):
    """
    Live introspection of the Const 6-Filter quality gate decision for a netuid.

    Returns the operator-configured threshold, the subnet's actual score
    (None if off-scorecard), and the gate verdict (passes/fails).

    The gate threshold is sourced from _RISK_CONFIG['subnet_quality_min_filters'],
    so this endpoint reflects the current Risk Config UI setting in real time.
    """
    threshold = subnet_scorecard_service.get_active_threshold()
    entry = subnet_scorecard_service.get_subnet(netuid)
    score = int(entry["score"]) if entry else None
    passes = subnet_scorecard_service.passes_quality_gate(netuid)

    return {
        "netuid":         netuid,
        "subnet_name":    entry.get("name") if entry else None,
        "subnet_category": entry.get("category") if entry else None,
        "score":          score,
        "max_score":      6,
        "threshold":      threshold,
        "passes":         passes,
        "on_scorecard":   entry is not None,
        "is_signal_candidate": (
            entry.get("is_taobot_signal_candidate", False) if entry else False
        ),
    }


@router.get("/quality-gate/status")
async def quality_gate_status():
    """
    Aggregate quality-gate state — useful for the Research panel KPI strip.

    Returns the live threshold, count of subnets on the scorecard, count
    that currently pass at the active threshold, and the candidate roster.
    """
    threshold = subnet_scorecard_service.get_active_threshold()
    full = subnet_scorecard_service.get_full_scorecard()
    subnets = full.get("subnets", [])
    passing = [
        s for s in subnets
        if int(s.get("score", 0)) >= threshold
    ]
    candidates = subnet_scorecard_service.taobot_signal_candidates()

    return {
        "threshold":            threshold,
        "max_score":            6,
        "subnet_count":         len(subnets),
        "passing_count":        len(passing),
        "candidate_count":      len(candidates),
        "passing_netuids":      sorted([int(s["netuid"]) for s in passing]),
        "candidate_netuids":    sorted([int(c["netuid"]) for c in candidates]),
        "scorecard_loaded_ok":  full.get("loaded_ok", False),
        "gate_disabled":        threshold <= 0,
    }