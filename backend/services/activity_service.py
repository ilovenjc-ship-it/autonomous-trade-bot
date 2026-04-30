"""
Shared in-memory activity ring buffer.
Imported by both fleet router and trading engine so all events land in one stream.
"""
from datetime import datetime
from typing import Optional, List

_activity: List[dict] = []
_MAX = 300


def push_event(
    kind: str,
    message: str,
    strategy: Optional[str] = None,
    detail: str = "",
) -> None:
    """kind: trade | signal | gate | system | alert"""
    _activity.append({
        "id":        len(_activity) + 1,
        "kind":      kind,
        "message":   message,
        "strategy":  strategy,
        "detail":    detail,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })
    if len(_activity) > _MAX:
        _activity.pop(0)

    # ── Webhook dispatch for high-value activity events (fire-and-forget) ──
    # trade, gate, alert kinds are forwarded to configured webhook endpoints.
    # signal + system are skipped to avoid webhook spam.
    if kind in ("trade", "gate", "alert"):
        try:
            from services.webhook_service import webhook_service
            webhook_service.dispatch_activity(kind, message, strategy, detail)
        except Exception:
            pass   # never let webhook errors affect the activity pipeline


def get_events(limit: int = 100) -> List[dict]:
    # Return oldest-first so the frontend can reverse to newest-first for display.
    # ActivityLog.tsx applies [...filtered].reverse() to render newest at top.
    return list(_activity[-limit:])


def seed_startup() -> None:
    push_event("system", "TAO Trading Bot backend online",     detail="All systems nominal")
    push_event("system", "CoinGecko price feed connected",     detail="Live TAO price streaming")
    push_event("system", "12-strategy fleet initialised",      detail="Paper trading gate enforcement active")