"""
System health router — exposes the system_health_service registry.

Carry-over (Session XXXIV — observability hardening). Lets the frontend
render a per-service health card without scraping each service's
private fields.

Endpoints
---------
  GET /api/system/health         — full registry (services[] + summary)
  GET /api/system/health/summary — just the aggregate counts
"""
from fastapi import APIRouter

from services.system_health_service import system_health

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/health")
async def health() -> dict:
    return {
        "summary":  system_health.summary(),
        "services": system_health.get_all(),
    }


@router.get("/health/summary")
async def health_summary() -> dict:
    return system_health.summary()