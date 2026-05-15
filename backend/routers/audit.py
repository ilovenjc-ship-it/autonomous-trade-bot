"""
Audit Trail router — exposes the audit_service ring buffer.

Carry-over (Session XXXIV — Phase B). Append-only log of every
operationally-meaningful mutation in the system.

Endpoints
---------
  GET /api/audit/log        — newest-first slice with optional filters
                              (?limit=, ?action=, ?category=, ?actor=)
  GET /api/audit/summary    — buffered count + lifetime + per-category
"""
from typing import Optional
from fastapi import APIRouter, Query

from services.audit_service import audit_service

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/log")
async def audit_log(
    limit:    int           = Query(200, ge=1, le=1000),
    action:   Optional[str] = Query(None, description="Exact action match"),
    category: Optional[str] = Query(None, description="config | trading | lifecycle | alert | system"),
    actor:    Optional[str] = Query(None, description="operator | system | service:<name>"),
) -> dict:
    entries = audit_service.list(
        limit=limit, action=action, category=category, actor=actor,
    )
    summary = audit_service.summary()
    return {"entries": entries, "summary": summary}


@router.get("/summary")
async def audit_summary() -> dict:
    return audit_service.summary()