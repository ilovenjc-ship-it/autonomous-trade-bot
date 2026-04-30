"""
Webhook Configuration Router
GET    /api/webhooks              → list all configured endpoints
POST   /api/webhooks              → create a new endpoint
PUT    /api/webhooks/{id}         → update an existing endpoint
DELETE /api/webhooks/{id}         → remove an endpoint
POST   /api/webhooks/{id}/test    → send test payload and return result
GET    /api/webhooks/status       → delivery stats overview
GET    /api/webhooks/export       → return base64 env-var string for Railway
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl

from services.webhook_service import webhook_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


# ── Request / Response models ──────────────────────────────────────────────────

class CreateWebhookRequest(BaseModel):
    name:        str
    url:         str
    kind:        str        = "generic"   # discord | slack | generic
    enabled:     bool       = True
    min_level:   str        = "WARNING"   # INFO | WARNING | CRITICAL
    event_kinds: List[str]  = ["all"]     # ["all"] or ["trade","gate","alert","signal","system"]
    event_types: List[str]  = ["all"]     # ["all"] or specific alert types


class UpdateWebhookRequest(BaseModel):
    name:        Optional[str]        = None
    url:         Optional[str]        = None
    kind:        Optional[str]        = None
    enabled:     Optional[bool]       = None
    min_level:   Optional[str]        = None
    event_kinds: Optional[List[str]]  = None
    event_types: Optional[List[str]]  = None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("")
async def list_webhooks():
    """Return all configured webhook endpoints (URLs are masked for security)."""
    endpoints = webhook_service.list_endpoints()
    masked = []
    for ep in endpoints:
        safe = dict(ep)
        url = safe.get("url", "")
        # Mask everything after the domain for display
        if url:
            try:
                from urllib.parse import urlparse
                parsed = urlparse(url)
                domain = f"{parsed.scheme}://{parsed.netloc}"
                path   = parsed.path
                # Show domain + first 12 chars of path, then …
                visible = domain + (path[:12] + "…" if len(path) > 12 else path)
                safe["url_display"] = visible
            except Exception:
                safe["url_display"] = url[:30] + "…"
        masked.append(safe)
    return {"endpoints": masked, "status": webhook_service.get_status()}


@router.post("")
async def create_webhook(body: CreateWebhookRequest):
    """Add a new webhook endpoint."""
    if not body.url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")
    if body.kind not in ("discord", "slack", "generic"):
        raise HTTPException(status_code=400, detail="kind must be discord | slack | generic")
    if body.min_level not in ("INFO", "WARNING", "CRITICAL"):
        raise HTTPException(status_code=400, detail="min_level must be INFO | WARNING | CRITICAL")

    ep = webhook_service.add_endpoint(
        name        = body.name,
        url         = body.url,
        kind        = body.kind,
        enabled     = body.enabled,
        min_level   = body.min_level,
        event_kinds = body.event_kinds,
        event_types = body.event_types,
    )
    logger.info(f"Webhook created: {ep['name']} ({ep['kind']}) id={ep['id']}")
    return {"endpoint": ep, "message": f"Webhook '{body.name}' created"}


@router.put("/{endpoint_id}")
async def update_webhook(endpoint_id: str, body: UpdateWebhookRequest):
    """Update fields on an existing webhook endpoint."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "url" in updates and not updates["url"].startswith("http"):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")

    ep = webhook_service.update_endpoint(endpoint_id, **updates)
    if not ep:
        raise HTTPException(status_code=404, detail=f"Endpoint {endpoint_id} not found")
    return {"endpoint": ep, "message": "Webhook updated"}


@router.delete("/{endpoint_id}")
async def delete_webhook(endpoint_id: str):
    """Remove a webhook endpoint."""
    ok = webhook_service.delete_endpoint(endpoint_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Endpoint {endpoint_id} not found")
    return {"success": True, "message": "Webhook deleted"}


@router.post("/{endpoint_id}/test")
async def test_webhook(endpoint_id: str):
    """Send a test payload to the endpoint and return delivery result."""
    if not webhook_service.get_endpoint(endpoint_id):
        raise HTTPException(status_code=404, detail=f"Endpoint {endpoint_id} not found")
    result = await webhook_service.test_endpoint(endpoint_id)
    return result


@router.get("/status")
async def webhook_status():
    """Return aggregate delivery stats."""
    return webhook_service.get_status()


@router.get("/export")
async def export_webhooks():
    """
    Export current webhook configs as a base64-encoded string.
    Paste the returned value as the WEBHOOK_CONFIGS Railway environment variable
    to preserve your webhook configuration across redeploys.
    """
    env_string = webhook_service.export_env_string()
    return {
        "env_var":     "WEBHOOK_CONFIGS",
        "value":       env_string,
        "instruction": "Add this as a Railway environment variable to preserve webhooks across redeploys.",
        "count":       len(webhook_service.list_endpoints()),
    }