"""
Webhook Notification Service
============================
Dispatches HTTP POST notifications to external endpoints whenever an II Agent
alert or activity event fires.

Supported endpoint types:
  discord  — rich embed with colour-coded severity, fields for type/level/strategy
  slack    — Block Kit formatted message
  generic  — flat JSON payload (compatible with Zapier, Make, n8n, PagerDuty, etc.)

Configuration persistence (three-layer):
  1. In-memory dict  — fast reads, zero latency
  2. JSON file       — backend/webhook_configs.json, survives in-container restarts
  3. ENV var         — WEBHOOK_CONFIGS (base64-encoded JSON string) for Railway cross-
                       deploy persistence; paste the exported string in Railway dashboard

Dispatch is fire-and-forget — never blocks the alert/event pipeline.
Failed deliveries are recorded in the endpoint's status fields for UI display.

Usage:
    from services.webhook_service import webhook_service

    # After push_alert():
    webhook_service.dispatch_alert(alert_dict)

    # After push_event() for high-value activity events:
    webhook_service.dispatch_activity(kind, message, strategy, detail)
"""
import asyncio
import base64
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
_CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", "webhook_configs.json")
_CONFIG_FILE = os.path.abspath(_CONFIG_FILE)
_ENV_VAR     = "WEBHOOK_CONFIGS"

# Per-endpoint delivery timeout
_DELIVERY_TIMEOUT = 8.0   # seconds

# Discord embed colours by alert level
_DISCORD_COLORS = {
    "INFO":     0x34D399,   # emerald green
    "WARNING":  0xFBBF24,   # amber
    "CRITICAL": 0xF87171,   # red
    "_default": 0x60A5FA,   # blue (activity events)
}

# Activity kinds that are dispatched via webhook (gate + trade are high-value)
_DISPATCH_ACTIVITY_KINDS = {"trade", "gate", "alert"}

# Level ordering for min_level filter
_LEVEL_ORDER = {"INFO": 0, "WARNING": 1, "CRITICAL": 2}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ═══════════════════════════════════════════════════════════════════════════════
class WebhookService:
    """
    Singleton that manages webhook endpoint configs and dispatches notifications.
    """

    def __init__(self):
        self._endpoints: Dict[str, dict] = {}   # id → endpoint config
        self._loaded = False

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def load(self) -> None:
        """Load endpoint configs from JSON file or ENV var on startup."""
        if self._loaded:
            return
        self._loaded = True

        # Try ENV var first (Railway cross-deploy persistence)
        raw_env = os.environ.get(_ENV_VAR, "").strip()
        if raw_env:
            try:
                # Support both raw JSON and base64-encoded JSON
                try:
                    decoded = base64.b64decode(raw_env).decode()
                except Exception:
                    decoded = raw_env
                data = json.loads(decoded)
                for ep in (data if isinstance(data, list) else data.get("endpoints", [])):
                    self._endpoints[ep["id"]] = ep
                logger.info(f"WebhookService: loaded {len(self._endpoints)} endpoints from ENV")
                return
            except Exception as exc:
                logger.warning(f"WebhookService: ENV parse error: {exc}")

        # Fall back to JSON file
        if os.path.exists(_CONFIG_FILE):
            try:
                with open(_CONFIG_FILE) as f:
                    data = json.load(f)
                for ep in (data if isinstance(data, list) else data.get("endpoints", [])):
                    self._endpoints[ep["id"]] = ep
                logger.info(f"WebhookService: loaded {len(self._endpoints)} endpoints from {_CONFIG_FILE}")
            except Exception as exc:
                logger.warning(f"WebhookService: file load error: {exc}")

    def save(self) -> None:
        """Persist current endpoint configs to JSON file."""
        try:
            payload = {"endpoints": list(self._endpoints.values()), "exported_at": _now()}
            with open(_CONFIG_FILE, "w") as f:
                json.dump(payload, f, indent=2)
        except Exception as exc:
            logger.warning(f"WebhookService: save error: {exc}")

    def export_env_string(self) -> str:
        """Return a base64-encoded JSON string for pasting into Railway ENV vars."""
        payload = {"endpoints": list(self._endpoints.values()), "exported_at": _now()}
        return base64.b64encode(json.dumps(payload).encode()).decode()

    # ── CRUD ──────────────────────────────────────────────────────────────────

    def list_endpoints(self) -> List[dict]:
        return list(self._endpoints.values())

    def get_endpoint(self, endpoint_id: str) -> Optional[dict]:
        return self._endpoints.get(endpoint_id)

    def add_endpoint(
        self,
        name:        str,
        url:         str,
        kind:        str    = "generic",  # discord | slack | generic
        enabled:     bool   = True,
        min_level:   str    = "WARNING",  # INFO | WARNING | CRITICAL
        event_kinds: list   = None,       # ["all"] or ["trade","gate","alert",...]
        event_types: list   = None,       # ["all"] or specific alert types
    ) -> dict:
        ep_id = f"wh_{uuid.uuid4().hex[:10]}"
        ep = {
            "id":             ep_id,
            "name":           name.strip(),
            "url":            url.strip(),
            "kind":           kind,          # discord | slack | generic
            "enabled":        enabled,
            "min_level":      min_level,
            "event_kinds":    event_kinds or ["all"],
            "event_types":    event_types or ["all"],
            "last_delivered": None,
            "last_status":    None,
            "last_error":     None,
            "delivery_count": 0,
            "failure_count":  0,
            "created_at":     _now(),
        }
        self._endpoints[ep_id] = ep
        self.save()
        logger.info(f"WebhookService: added endpoint '{name}' ({kind}) → {url[:40]}…")
        return ep

    def update_endpoint(self, endpoint_id: str, **kwargs) -> Optional[dict]:
        ep = self._endpoints.get(endpoint_id)
        if not ep:
            return None
        for k, v in kwargs.items():
            if k in ("name", "url", "kind", "enabled", "min_level", "event_kinds", "event_types"):
                ep[k] = v
        self.save()
        return ep

    def delete_endpoint(self, endpoint_id: str) -> bool:
        if endpoint_id not in self._endpoints:
            return False
        del self._endpoints[endpoint_id]
        self.save()
        return True

    # ── Payload builders ──────────────────────────────────────────────────────

    def _build_discord_payload(self, title: str, message: str, level: str,
                                alert_type: str, strategy: Optional[str],
                                detail: str, timestamp: str) -> dict:
        color  = _DISCORD_COLORS.get(level, _DISCORD_COLORS["_default"])
        fields = [
            {"name": "Type",  "value": alert_type, "inline": True},
            {"name": "Level", "value": level,       "inline": True},
        ]
        if strategy:
            fields.append({"name": "Strategy", "value": strategy, "inline": True})
        if detail:
            fields.append({"name": "Detail", "value": f"`{detail}`", "inline": False})
        return {
            "username": "Ari",
            "embeds": [{
                "title":       title,
                "description": message,
                "color":       color,
                "fields":      fields,
                "footer":      {"text": "Ari · Architect & Orchestrator"},
                "timestamp":   timestamp,
            }],
        }

    def _build_slack_payload(self, title: str, message: str, level: str,
                              alert_type: str, strategy: Optional[str],
                              detail: str, timestamp: str) -> dict:
        emoji = {"INFO": "ℹ️", "WARNING": "⚠️", "CRITICAL": "🚨"}.get(level, "📢")
        color = {"INFO": "#34D399", "WARNING": "#FBBF24", "CRITICAL": "#F87171"}.get(level, "#60A5FA")
        context_elements = [
            {"type": "mrkdwn", "text": f"*Type:* `{alert_type}`"},
            {"type": "mrkdwn", "text": f"*Level:* `{level}`"},
        ]
        if strategy:
            context_elements.append({"type": "mrkdwn", "text": f"*Strategy:* `{strategy}`"})
        return {
            "attachments": [{
                "color": color,
                "blocks": [
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"{emoji} *{title}*\n{message}",
                        },
                    },
                    {"type": "context", "elements": context_elements},
                    {"type": "divider"},
                ],
                "footer": "Ari",
                "ts":     str(int(time.time())),
            }],
        }

    def _build_generic_payload(self, title: str, message: str, level: str,
                                alert_type: str, strategy: Optional[str],
                                detail: str, timestamp: str) -> dict:
        return {
            "source":     "ii_agent",
            "event":      "alert",
            "type":       alert_type,
            "level":      level,
            "title":      title,
            "message":    message,
            "strategy":   strategy,
            "detail":     detail,
            "timestamp":  timestamp,
        }

    def _build_payload(self, ep: dict, title: str, message: str, level: str,
                        alert_type: str, strategy: Optional[str],
                        detail: str, timestamp: str) -> dict:
        builders = {
            "discord": self._build_discord_payload,
            "slack":   self._build_slack_payload,
        }
        builder = builders.get(ep["kind"], self._build_generic_payload)
        return builder(title, message, level, alert_type, strategy, detail, timestamp)

    # ── Delivery ──────────────────────────────────────────────────────────────

    async def _deliver(self, ep: dict, payload: dict) -> None:
        """Send one POST and update ep delivery stats in-place."""
        ep_id   = ep["id"]
        ep_name = ep.get("name", ep_id)
        try:
            async with httpx.AsyncClient(timeout=_DELIVERY_TIMEOUT) as client:
                resp = await client.post(
                    ep["url"],
                    json=payload,
                    headers={"Content-Type": "application/json", "User-Agent": "II-Agent/1.0"},
                )
            ep["last_delivered"]  = _now()
            ep["last_status"]     = resp.status_code
            ep["last_error"]      = None if resp.is_success else f"HTTP {resp.status_code}"
            if resp.is_success:
                ep["delivery_count"] = ep.get("delivery_count", 0) + 1
                logger.debug(f"Webhook '{ep_name}': delivered ({resp.status_code})")
            else:
                ep["failure_count"] = ep.get("failure_count", 0) + 1
                logger.warning(f"Webhook '{ep_name}': HTTP {resp.status_code}")
        except httpx.TimeoutException:
            ep["last_delivered"] = _now()
            ep["last_status"]    = 0
            ep["last_error"]     = "Timeout"
            ep["failure_count"]  = ep.get("failure_count", 0) + 1
            logger.warning(f"Webhook '{ep_name}': timed out")
        except Exception as exc:
            ep["last_delivered"] = _now()
            ep["last_status"]    = 0
            ep["last_error"]     = str(exc)[:120]
            ep["failure_count"]  = ep.get("failure_count", 0) + 1
            logger.warning(f"Webhook '{ep_name}': delivery error: {exc}")

    def _should_dispatch(self, ep: dict, level: str, alert_type: str, event_kind: str) -> bool:
        """True if this endpoint should receive the event."""
        if not ep.get("enabled", True):
            return False

        # Minimum level filter
        ep_min   = _LEVEL_ORDER.get(ep.get("min_level", "INFO"), 0)
        ev_level = _LEVEL_ORDER.get(level, 0)
        if ev_level < ep_min:
            return False

        # Event kind filter
        kinds = ep.get("event_kinds", ["all"])
        if "all" not in kinds and event_kind not in kinds:
            return False

        # Alert type filter
        types = ep.get("event_types", ["all"])
        if "all" not in types and alert_type not in types:
            return False

        return True

    def dispatch_alert(self, alert: dict) -> None:
        """
        Called after alert_service.push_alert() — dispatches to all matching endpoints.
        Fire-and-forget: schedules async delivery without blocking.
        """
        if not self._endpoints:
            return
        title      = alert.get("title", "Ari Alert")
        message    = alert.get("message", "")
        level      = alert.get("level", "INFO")
        alert_type = alert.get("type", "SYSTEM")
        strategy   = alert.get("strategy")
        detail     = alert.get("detail", "")
        timestamp  = alert.get("timestamp", _now())

        for ep in self._endpoints.values():
            if not self._should_dispatch(ep, level, alert_type, "alert"):
                continue
            payload = self._build_payload(ep, title, message, level, alert_type, strategy, detail, timestamp)
            self._fire_and_forget(ep, payload)

    def dispatch_activity(self, kind: str, message: str,
                           strategy: Optional[str] = None, detail: str = "") -> None:
        """
        Called after activity_service.push_event() for trade/gate/alert events.
        Maps activity kinds to a pseudo-alert level for filtering.
        """
        if kind not in _DISPATCH_ACTIVITY_KINDS:
            return
        if not self._endpoints:
            return

        level_map  = {"trade": "INFO", "gate": "WARNING", "alert": "CRITICAL"}
        level      = level_map.get(kind, "INFO")
        alert_type = kind.upper()   # TRADE | GATE | ALERT
        title      = f"Ari {kind.capitalize()}: {message[:60]}"

        for ep in self._endpoints.values():
            if not self._should_dispatch(ep, level, alert_type, kind):
                continue
            payload = self._build_payload(ep, title, message, level, alert_type, strategy, detail, _now())
            self._fire_and_forget(ep, payload)

    def _fire_and_forget(self, ep: dict, payload: dict) -> None:
        """Schedule async delivery without blocking the caller."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self._deliver(ep, payload))
            else:
                asyncio.run(self._deliver(ep, payload))
        except Exception as exc:
            logger.debug(f"WebhookService: could not schedule delivery: {exc}")

    # ── Test delivery ─────────────────────────────────────────────────────────

    async def test_endpoint(self, endpoint_id: str) -> dict:
        """
        Send a test payload to the endpoint and return delivery result.
        Called by the frontend Test button — awaited so we can return status.
        """
        ep = self._endpoints.get(endpoint_id)
        if not ep:
            return {"success": False, "error": "Endpoint not found"}

        payload = self._build_payload(
            ep,
            title      = "✅ Ari Webhook Test",
            message    = "This is a test notification from Ari. Your webhook endpoint is configured correctly!",
            level      = "INFO",
            alert_type = "TEST",
            strategy   = None,
            detail     = f"Endpoint: {ep['name']}",
            timestamp  = _now(),
        )
        await self._deliver(ep, payload)
        return {
            "success": ep.get("last_status", 0) in range(200, 300),
            "status":  ep.get("last_status"),
            "error":   ep.get("last_error"),
        }

    # ── Status / export ───────────────────────────────────────────────────────

    def get_status(self) -> dict:
        eps = list(self._endpoints.values())
        return {
            "count":         len(eps),
            "enabled":       sum(1 for e in eps if e.get("enabled")),
            "total_sent":    sum(e.get("delivery_count", 0) for e in eps),
            "total_failed":  sum(e.get("failure_count", 0) for e in eps),
        }


# ── Singleton ─────────────────────────────────────────────────────────────────
webhook_service = WebhookService()