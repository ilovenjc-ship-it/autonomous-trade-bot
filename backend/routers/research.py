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
        Subset of scorecard flagged is_signal_candidate=true —
        the subnets we're actively researching for live signal integration.

The quality gate itself (`passes_quality_gate`) is consumed internally by
signal_ingestor / consensus pipelines; it isn't exposed as a public route
because the gate decision is stateful (depends on caller's min_filters).
"""

from typing import Dict

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
    candidates = subnet_scorecard_service.signal_candidates()
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
            entry.get("is_signal_candidate", False) if entry else False
        ),
    }


@router.get("/takeover-risk")
async def takeover_risk_all():
    """
    Subnet King takeover-risk score for every monitored subnet.

    Score = 1 − (owner_alpha / total_subnet_alpha). Bands: FORTRESS / DEFENDED /
    CONTESTED / VULNERABLE. v1 proxy — see subnet_cache_service for the math
    rationale and caveats (Conviction-Era day-1 effects, mg.S.sum() denominator).

    Returns rows enriched with scorecard provenance (subnet_name, scorecard_score)
    so the frontend can render 'SN8 Vanta 6/6 — DEFENDED 0.42' without a join.
    """
    from services.subnet_cache_service import subnet_cache_service
    try:
        from services.subnet_scorecard_service import subnet_scorecard_service as scs
    except Exception:
        scs = None  # type: ignore

    risks = subnet_cache_service.get_all_takeover_risks()

    rows = []
    band_counts: Dict[str, int] = {
        "FORTRESS": 0, "DEFENDED": 0, "CONTESTED": 0, "VULNERABLE": 0,
    }
    for netuid, r in sorted(risks.items()):
        sc = scs.get_subnet(netuid) if scs is not None else None
        rows.append({
            **r,
            "subnet_name":       sc.get("name") if sc else None,
            "subnet_category":   sc.get("category") if sc else None,
            "scorecard_score":   sc.get("score") if sc else None,
            "is_signal_candidate": (
                sc.get("is_signal_candidate", False) if sc else False
            ),
        })
        band_counts[r["risk_band"]] = band_counts.get(r["risk_band"], 0) + 1

    return {
        "rows":          rows,
        "count":         len(rows),
        "band_counts":   band_counts,
        "vulnerable_netuids": sorted([
            r["netuid"] for r in rows if r["risk_band"] == "VULNERABLE"
        ]),
    }


@router.get("/takeover-risk/{netuid}")
async def takeover_risk_one(netuid: int):
    """Single-subnet takeover risk lookup. 404 if denominator data isn't cached."""
    from fastapi import HTTPException
    from services.subnet_cache_service import subnet_cache_service
    r = subnet_cache_service.get_takeover_risk(netuid)
    if r is None:
        raise HTTPException(
            status_code=404,
            detail=f"SN{netuid} takeover risk unavailable — owner or stake data not yet cached",
        )
    return r


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
    candidates = subnet_scorecard_service.signal_candidates()

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