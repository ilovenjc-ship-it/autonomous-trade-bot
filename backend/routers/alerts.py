"""
Alerts API
GET  /api/alerts              → list alerts (limit, unread_only params)
GET  /api/alerts/unread-count → badge count for sidebar
GET  /api/alerts/stats        → breakdown by level and type
POST /api/alerts/{id}/read    → mark single alert read
POST /api/alerts/read-all     → mark all alerts read
"""
from fastapi import APIRouter, Query
from services.alert_service import alert_service

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
async def get_alerts(
    limit:       int  = Query(default=50, ge=1, le=150),
    unread_only: bool = Query(default=False),
):
    alerts = alert_service.get_alerts(limit=limit, unread_only=unread_only)
    return {
        "alerts":       alerts,
        "total":        len(alert_service.get_alerts(limit=150)),
        "unread_count": alert_service.get_unread_count(),
    }


@router.get("/unread-count")
async def get_unread_count():
    return {"unread_count": alert_service.get_unread_count()}


@router.get("/stats")
async def get_stats():
    return alert_service.get_stats()


@router.post("/{alert_id}/read")
async def mark_read(alert_id: int):
    found = alert_service.mark_read(alert_id)
    return {
        "success":      found,
        "unread_count": alert_service.get_unread_count(),
    }


@router.post("/read-all")
async def mark_all_read():
    count = alert_service.mark_all_read()
    return {
        "marked_read":  count,
        "unread_count": 0,
    }