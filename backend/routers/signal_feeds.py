"""
Signal Feeds Router
===================
GET  /api/signal-feeds              — list all feeds + live status
POST /api/signal-feeds/{id}/toggle  — enable / disable a feed
POST /api/signal-feeds/{id}/config  — save API key / bot token
POST /api/signal-feeds/{id}/test    — trigger one immediate fetch (fire-and-forget)
"""
import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.signal_ingestor import (
    get_feed_status,
    get_discord_guilds,
    configure_feed,
    toggle_feed,
    _FEEDS,
    _poll_coingecko,
    _poll_reddit_rss,
    _poll_taodaily_rss,
    _poll_taostats,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/signal-feeds", tags=["signal-feeds"])

# Session XXXIX (Day 6): perplexity removed (paid-subscription feed).
_TEST_MAP = {
    "coingecko":    _poll_coingecko,
    "reddit_rss":   _poll_reddit_rss,
    "taodaily_rss": _poll_taodaily_rss,
    "taostats":     _poll_taostats,
}


class ToggleRequest(BaseModel):
    enabled: bool


class ConfigRequest(BaseModel):
    config: Dict[str, Any]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_feeds():
    """Return all signal feeds with live status (secrets masked)."""
    return {"feeds": get_feed_status()}


@router.get("/discord/guilds")
async def discord_guilds():
    """
    Diagnostic — show which Discord servers the bot is currently a member of.

    Useful for confirming "Listening on: <server>" in the Activity Log panel
    and for verifying new invites took effect after Railway redeploys.
    Session XXXIX Day 6 Round 6 — Discord gateway closeout follow-up.
    """
    return get_discord_guilds()


@router.post("/{feed_id}/toggle")
async def toggle_feed_endpoint(feed_id: str, body: ToggleRequest):
    if feed_id not in _FEEDS:
        raise HTTPException(status_code=404, detail=f"Feed '{feed_id}' not found")
    ok = toggle_feed(feed_id, body.enabled)
    if not ok and body.enabled:
        raise HTTPException(
            status_code=400,
            detail="Discord cannot be enabled until the bot has been invited to the Bittensor server by an OTF admin.",
        )
    return {"success": True, "feed_id": feed_id, "enabled": body.enabled}


@router.post("/{feed_id}/config")
async def configure_feed_endpoint(feed_id: str, body: ConfigRequest):
    if feed_id not in _FEEDS:
        raise HTTPException(status_code=404, detail=f"Feed '{feed_id}' not found")
    ok = configure_feed(feed_id, body.config)
    if not ok:
        raise HTTPException(status_code=400, detail="Failed to update feed config")
    return {"success": True, "message": f"Config saved for '{feed_id}'"}


@router.post("/{feed_id}/test")
async def test_feed_endpoint(feed_id: str):
    """Trigger one immediate fetch for a feed (fire-and-forget) and return status."""
    if feed_id not in _FEEDS:
        raise HTTPException(status_code=404, detail=f"Feed '{feed_id}' not found")
    if feed_id == "discord":
        raise HTTPException(
            status_code=400,
            detail="Discord test is not available until the bot has been invited to the server.",
        )
    coro = _TEST_MAP.get(feed_id)
    if not coro:
        raise HTTPException(status_code=400, detail=f"No test available for '{feed_id}'")

    import asyncio
    asyncio.create_task(coro())
    return {"success": True, "message": f"Test fetch triggered for '{feed_id}' — check Activity Log"}