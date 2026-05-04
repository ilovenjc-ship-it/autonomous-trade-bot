"""
Inbound Signal Ingestor
=======================
Polls external feeds and pushes synthetic 'signal' events into the
activity ring buffer.  All sources are non-blocking async loops that
survive individual fetch errors.

Sources
-------
  coingecko    — TAO/USD spot price + 24h momentum        (60s,  no auth)
  reddit_rss   — r/bittensor_ community sentiment         (5min, no auth)
  taodaily_rss — TaoDaily ecosystem / subnet news         (30min, no auth)
  taostats     — Subnet alpha prices + staking events     (60s,  API key)
  perplexity   — AI-synthesised TAO news + sentiment      (15min, API key)
  discord      — Protocol announcements (scaffold only)   (WS,   bot token + OTF invite)

All sources call activity_service.push_event(kind="signal", ...)
Feed status is exposed via get_feed_status() → served by signal_feeds router.
"""

import asyncio
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Optional

import httpx

from services.activity_service import push_event

logger = logging.getLogger(__name__)

# ── Feed state ─────────────────────────────────────────────────────────────────

_FEEDS: dict = {
    "coingecko": {
        "id":             "coingecko",
        "name":           "CoinGecko",
        "description":    "TAO/USD spot price, 24h change, volume — free public API",
        "icon":           "coin",
        "auth":           "none",
        "interval_label": "60s",
        "interval_s":     60,
        "enabled":        True,
        "status":         "connecting",
        "last_fetch":     None,
        "last_value":     None,
        "error":          None,
        "events_total":   0,
        "config":         {},
    },
    "reddit_rss": {
        "id":             "reddit_rss",
        "name":           "Reddit r/bittensor_",
        "description":    "Community sentiment, subnet discussion, ecosystem news",
        "icon":           "reddit",
        "auth":           "none",
        "interval_label": "5 min",
        "interval_s":     300,
        "enabled":        True,
        "status":         "connecting",
        "last_fetch":     None,
        "last_value":     None,
        "error":          None,
        "events_total":   0,
        "config":         {},
        "_seen_ids":      set(),
    },
    "taodaily_rss": {
        "id":             "taodaily_rss",
        "name":           "TaoDaily News",
        "description":    "Ecosystem news, subnet spotlights, market narratives (RSS)",
        "icon":           "news",
        "auth":           "none",
        "interval_label": "30 min",
        "interval_s":     1800,
        "enabled":        True,
        "status":         "connecting",
        "last_fetch":     None,
        "last_value":     None,
        "error":          None,
        "events_total":   0,
        "config":         {},
        "_seen_ids":      set(),
    },
    "taostats": {
        "id":             "taostats",
        "name":           "Taostats API",
        "description":    "Subnet alpha prices, staking flows, emissions — richest Bittensor-native data",
        "icon":           "chain",
        "auth":           "api_key",
        "interval_label": "60s",
        "interval_s":     60,
        "enabled":        False,
        "status":         "disabled",
        "last_fetch":     None,
        "last_value":     None,
        "error":          None,
        "events_total":   0,
        "config":         {"api_key": ""},
        "_prev_price":    None,
    },
    "perplexity": {
        "id":             "perplexity",
        "name":           "Perplexity Sonar",
        "description":    "AI-synthesised TAO news + sentiment — searches web in real-time, 1h window",
        "icon":           "ai",
        "auth":           "api_key",
        "interval_label": "15 min",
        "interval_s":     900,
        "enabled":        False,
        "status":         "disabled",
        "last_fetch":     None,
        "last_value":     None,
        "error":          None,
        "events_total":   0,
        "config":         {"api_key": ""},
    },
    "discord": {
        "id":             "discord",
        "name":           "Discord",
        "description":    "Bittensor server: #announcements, subnet channels, governance",
        "icon":           "discord",
        "auth":           "bot_token",
        "interval_label": "Real-time",
        "interval_s":     0,
        "enabled":        False,
        "status":         "pending_invite",
        "last_fetch":     None,
        "last_value":     None,
        "error":          "Requires OTF server admin to invite your bot (discord.gg/bittensor)",
        "events_total":   0,
        "config":         {"bot_token": "", "channel_ids": ""},
    },
}


# ── Internal helpers ──────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mark_ok(feed_id: str, value: str) -> None:
    f = _FEEDS.get(feed_id)
    if not f:
        return
    f["status"]        = "connected"
    f["last_fetch"]    = _now()
    f["last_value"]    = value
    f["error"]         = None
    f["events_total"]  = f.get("events_total", 0) + 1


def _mark_idle(feed_id: str) -> None:
    """Mark as connected but no new data this cycle."""
    f = _FEEDS.get(feed_id)
    if not f:
        return
    f["status"]     = "connected"
    f["last_fetch"] = _now()
    f["error"]      = None


def _mark_error(feed_id: str, msg: str) -> None:
    f = _FEEDS.get(feed_id)
    if not f:
        return
    f["status"]     = "error"
    f["last_fetch"] = _now()
    f["error"]      = msg[:120]


def _parse_rss(xml_text: str) -> list:
    """Parse RSS 2.0 XML → list of {guid, title, link} dicts."""
    items = []
    try:
        root = ET.fromstring(xml_text)
        for item in root.iter("item"):
            guid  = (item.findtext("guid")    or item.findtext("link") or "").strip()
            title = (item.findtext("title")   or "").strip()
            link  = (item.findtext("link")    or "").strip()
            if title and guid:
                items.append({"guid": guid, "title": title, "link": link})
    except Exception as e:
        logger.debug(f"RSS parse error: {e}")
    return items


# ── Source pollers ────────────────────────────────────────────────────────────

async def _poll_coingecko() -> None:
    """Fetch TAO/USD from CoinGecko free public API. No auth required."""
    url = (
        "https://api.coingecko.com/api/v3/simple/price"
        "?ids=bittensor&vs_currencies=usd"
        "&include_24hr_change=true"
        "&include_24hr_vol=true"
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers={"User-Agent": "TaoBot/1.0"})
        data   = resp.json().get("bittensor", {})
        price  = float(data.get("usd", 0))
        change = float(data.get("usd_24h_change", 0) or 0)
        vol    = float(data.get("usd_24h_vol",    0) or 0)
        arrow  = "▲" if change >= 0 else "▼"
        sign   = "+" if change >= 0 else ""
        msg    = (
            f"TAO ${price:,.2f}  {arrow} {sign}{change:.2f}% 24h"
            + (f"  Vol ${vol/1e6:.1f}M" if vol else "")
        )
        push_event("signal", msg, strategy=None, detail="source:coingecko")
        _mark_ok("coingecko", f"${price:,.2f}")
        logger.debug(f"CoinGecko signal: {msg}")
    except Exception as exc:
        _mark_error("coingecko", str(exc))
        logger.warning(f"CoinGecko poll failed: {exc}")


async def _poll_reddit_rss() -> None:
    """Fetch r/bittensor_ RSS and emit new posts as signal events."""
    feed = _FEEDS["reddit_rss"]
    url  = "https://www.reddit.com/r/bittensor_.rss"
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={
                "User-Agent":  "TaoBot/1.0 (signal ingestor)",
                "Accept":      "application/rss+xml, application/xml, */*",
            })
        items  = _parse_rss(resp.text)
        seen   = feed.setdefault("_seen_ids", set())
        new_ct = 0
        for it in items:
            if it["guid"] in seen:
                continue
            seen.add(it["guid"])
            push_event(
                "signal",
                f"[Reddit r/bittensor_] {it['title'][:110]}",
                detail=f"source:reddit | {it['link']}",
            )
            new_ct += 1
        if new_ct:
            _mark_ok("reddit_rss", f"{new_ct} new post(s)")
        else:
            _mark_idle("reddit_rss")
        logger.debug(f"Reddit RSS: {new_ct} new items")
    except Exception as exc:
        _mark_error("reddit_rss", str(exc))
        logger.warning(f"Reddit RSS poll failed: {exc}")


async def _poll_taodaily_rss() -> None:
    """Fetch TaoDaily news RSS and emit new articles as signal events."""
    feed = _FEEDS["taodaily_rss"]
    url  = "https://taodaily.io/feed/"
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(url, headers={
                "User-Agent": "TaoBot/1.0",
                "Accept":     "application/rss+xml, application/xml, */*",
            })
        items  = _parse_rss(resp.text)
        seen   = feed.setdefault("_seen_ids", set())
        new_ct = 0
        for it in items:
            if it["guid"] in seen:
                continue
            seen.add(it["guid"])
            push_event(
                "signal",
                f"[TaoDaily] {it['title'][:110]}",
                detail=f"source:taodaily | {it['link']}",
            )
            new_ct += 1
        if new_ct:
            _mark_ok("taodaily_rss", f"{new_ct} new article(s)")
        else:
            _mark_idle("taodaily_rss")
        logger.debug(f"TaoDaily RSS: {new_ct} new items")
    except Exception as exc:
        _mark_error("taodaily_rss", str(exc))
        logger.warning(f"TaoDaily RSS poll failed: {exc}")


async def _poll_taostats() -> None:
    """Fetch TAO price + momentum from Taostats API. Requires API key."""
    feed    = _FEEDS["taostats"]
    api_key = (feed.get("config") or {}).get("api_key", "").strip()
    if not api_key:
        return
    url = "https://api.taostats.io/api/price/latest/v1?asset=tao"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers={
                "Authorization": f"Bearer {api_key}",
                "User-Agent":    "TaoBot/1.0",
            })
        data  = resp.json()
        row   = (data.get("data") or [{}])[0]
        price = float(row.get("price",              0) or 0)
        ch24  = float(row.get("percent_change_24h", 0) or 0)
        ch7d  = float(row.get("percent_change_7d",  0) or 0)
        mcap  = float(row.get("market_cap",         0) or 0)
        arrow = "▲" if ch24 >= 0 else "▼"
        sign  = "+" if ch24 >= 0 else ""
        msg   = (
            f"TAO ${price:,.2f}  {arrow} {sign}{ch24:.2f}% 24h  "
            f"{'+' if ch7d>=0 else ''}{ch7d:.2f}% 7d"
            + (f"  MCap ${mcap/1e9:.2f}B" if mcap else "")
        )
        push_event("signal", msg, detail="source:taostats")
        _mark_ok("taostats", f"${price:,.2f}")
        # Spike / crash alert
        prev = feed.get("_prev_price")
        if prev and price and prev > 0:
            pct = (price - prev) / prev * 100
            if abs(pct) >= 3:
                direction = "🔺 spike" if pct > 0 else "🔻 crash"
                push_event(
                    "alert",
                    f"TAO price {direction}: {'+' if pct>0 else ''}{pct:.1f}% move in 60s",
                    detail="source:taostats | threshold:3%",
                )
        feed["_prev_price"] = price
        logger.debug(f"Taostats signal: {msg}")
    except Exception as exc:
        _mark_error("taostats", str(exc))
        logger.warning(f"Taostats poll failed: {exc}")


async def _poll_perplexity() -> None:
    """
    Query Perplexity Sonar for TAO news + sentiment (last 1h).
    Requires Perplexity API key (api.perplexity.ai).
    Cost: ~$0.006 / call · ~$0.55/day at 15-min interval.
    """
    feed    = _FEEDS["perplexity"]
    api_key = (feed.get("config") or {}).get("api_key", "").strip()
    if not api_key:
        return
    try:
        payload = {
            "model": "sonar",
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a concise crypto signal extractor. "
                        "Respond in ONE sentence only: "
                        "sentiment (Bullish/Bearish/Neutral), confidence 0.0–1.0, primary catalyst. "
                        "Example: 'Bullish (0.74) — OTF confirmed emission increase for SN1 starting block 4M.'"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "What are the most significant Bittensor TAO signals from the last hour? "
                        "Include subnet launches, large staking moves, OTF governance decisions, or protocol upgrades."
                    ),
                },
            ],
            "search_recency_filter": "hour",
            "search_domain_filter": [
                "taodaily.io",
                "taostats.io",
                "cointelegraph.com",
                "decrypt.co",
                "theblock.co",
                "coindesk.com",
                "reddit.com",
            ],
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.perplexity.ai/chat/completions",
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type":  "application/json",
                },
            )
        content = (
            resp.json()
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            or ""
        ).strip()
        if content:
            push_event(
                "signal",
                f"[Perplexity Sonar] {content[:200]}",
                detail="source:perplexity | model:sonar | window:1h",
            )
            _mark_ok("perplexity", content[:60])
        else:
            _mark_idle("perplexity")
        logger.debug(f"Perplexity Sonar: {content[:80]}")
    except Exception as exc:
        _mark_error("perplexity", str(exc))
        logger.warning(f"Perplexity poll failed: {exc}")


# ── Background loop ───────────────────────────────────────────────────────────

_STAGGER = {
    "coingecko":    2,
    "reddit_rss":   8,
    "taodaily_rss": 16,
    "taostats":     5,
    "perplexity":   22,
}


async def _run_loop(feed_id: str, coro_factory) -> None:
    """Run a poller in an infinite loop with its configured interval."""
    feed = _FEEDS[feed_id]
    await asyncio.sleep(_STAGGER.get(feed_id, 3))
    while True:
        if feed.get("enabled", False):
            try:
                await coro_factory()
            except Exception as exc:
                _mark_error(feed_id, str(exc))
                logger.warning(f"SignalIngestor loop error [{feed_id}]: {exc}")
        await asyncio.sleep(max(feed.get("interval_s", 60) or 60, 10))


# ── Public API (used by signal_feeds router) ──────────────────────────────────

def get_feed_status() -> list:
    """Return a serialisable list of feed status dicts for the frontend."""
    result = []
    for f in _FEEDS.values():
        safe = {k: v for k, v in f.items() if not k.startswith("_")}
        # Mask secrets — show only last 4 chars
        cfg = dict(safe.get("config") or {})
        for secret_key in ("api_key", "bot_token"):
            val = cfg.get(secret_key, "")
            if val:
                cfg[secret_key] = "••••••••" + val[-4:]
        safe["config"] = cfg
        result.append(safe)
    return result


def configure_feed(feed_id: str, config: dict) -> bool:
    """
    Persist config (api_key / bot_token / etc.) for a feed.
    Auto-enables the feed when a key is supplied (except Discord which
    needs OTF invite separately).
    """
    feed = _FEEDS.get(feed_id)
    if not feed:
        return False
    existing = feed.setdefault("config", {})
    existing.update({k: v for k, v in config.items() if isinstance(v, str)})
    # Auto-enable when a key is now present (skip Discord — needs invite)
    if feed_id != "discord":
        has_key = any(v.strip() for v in existing.values() if isinstance(v, str))
        if has_key or feed["auth"] == "none":
            feed["enabled"] = True
            if feed["status"] in ("disabled",):
                feed["status"] = "connecting"
    return True


def toggle_feed(feed_id: str, enabled: bool) -> bool:
    """Enable or disable a feed. Returns False if Discord is toggled ON without invite."""
    feed = _FEEDS.get(feed_id)
    if not feed:
        return False
    if feed_id == "discord" and enabled:
        # Cannot enable until OTF invite — keep pending_invite status
        return False
    feed["enabled"] = enabled
    feed["status"]  = "connecting" if enabled else "disabled"
    return True


async def start_all() -> None:
    """
    Launch all polling loops as background asyncio tasks.
    Called from main.py lifespan after yield (i.e. after the server is up).
    """
    logger.info("SignalIngestor: starting feed pollers")
    asyncio.create_task(_run_loop("coingecko",    _poll_coingecko))
    asyncio.create_task(_run_loop("reddit_rss",   _poll_reddit_rss))
    asyncio.create_task(_run_loop("taodaily_rss", _poll_taodaily_rss))
    asyncio.create_task(_run_loop("taostats",     _poll_taostats))
    asyncio.create_task(_run_loop("perplexity",   _poll_perplexity))
    # Discord: scaffold only — Gateway loop deferred until bot token + OTF invite
    _FEEDS["discord"]["status"] = "pending_invite"
    logger.info("SignalIngestor: CoinGecko/Reddit/TaoDaily auto-started · Taostats/Perplexity await keys · Discord awaits OTF invite")