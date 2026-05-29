"""
Audit Trail router — exposes the audit_service ring buffer.

Carry-over (Session XXXIV — Phase B). Append-only log of every
operationally-meaningful mutation in the system.

Endpoints
---------
  GET  /api/audit/log           — newest-first slice with optional filters
                                  (?limit=, ?action=, ?category=, ?actor=)
  GET  /api/audit/summary       — buffered count + lifetime + per-category
  POST /api/audit/clear-buffer  — Day 16 #13: soft-reset the in-memory ring
                                  buffer while preserving the JSONL on disk
                                  (Mark's "Read A" semantics — clear active
                                  queue, keep forensic record).
"""
from typing import Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel

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


# ── Day 16 #13 — Soft-reset endpoint ──────────────────────────────────────────
class ClearBufferRequest(BaseModel):
    """Optional reason text the operator can attach to the reset audit event.

    Empty string is fine; the field exists so a future UI can prompt
    'Why are you clearing the buffer?' for forensic clarity.
    """
    reason: Optional[str] = ""


@router.post("/clear-buffer")
async def clear_buffer(payload: Optional[ClearBufferRequest] = None) -> dict:
    """Soft-reset the in-memory ring buffer; preserve the JSONL on disk.

    Mark's "Read A" semantics: the operator-visible active queue clears,
    but every entry the system has ever recorded is still on disk for
    forensics. The reset itself is recorded as an `audit_buffer_clear`
    event of category=system, so the disk log contains an explicit
    tombstone marking when and why the buffer was cleared.
    """
    reason = ""
    if payload and payload.reason:
        reason = payload.reason
    result = audit_service.clear_buffer(actor="operator", reason=reason)
    return result