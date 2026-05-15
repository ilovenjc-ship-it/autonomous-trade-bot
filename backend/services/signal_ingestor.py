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
import os
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Optional

import discord
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
        "interval_label": "120s",
        "interval_s":     120,
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
    # ─── SN8 Vanta — Conviction-Era candidate signal source ───────────────────
    # Research filed Session XXXII: Taoshi runs SN8 (DEFENDED band, owner share
    # 27.7% as of 2026-05-14). Signal types are LONG/SHORT/FLAT for Crypto,
    # Forex, Equities. Realtime trade-data subscription at request.taoshi.io
    # (paid, login-gated, no public pricing on docs.taoshi.io). Per-position
    # leverage cap [0.01, 0.5] on crypto, [0.1, 5] on Forex/Equities.
    #
    # Integration plan (when subscription is acquired):
    #   1. Set subnet_netuid=8 → quality gate auto-applies (currently passes 6/6)
    #   2. Poll Vanta REST endpoint (URL TBD post-subscription) every 60s
    #   3. Parse position deltas → push as signal events with detail="source:vanta_sn8"
    #   4. Routing: feed into consensus as a 13th BFT contributor weighted by
    #      Vanta's omega score / portfolio metric
    #   5. Quality gate: passes_quality_gate(8) is True at default 6/6 threshold
    #
    # Status: DISABLED until paid subscription + endpoint URL acquired.
    "vanta_sn8": {
        "id":             "vanta_sn8",
        "name":           "Vanta SN8 Trading Signals",
        "description":    "Taoshi Vanta — LONG/SHORT/FLAT signals across Crypto/Forex/Equities (subnet candidate, 6/6 quality gate)",
        "icon":           "ai",
        "auth":           "subscription",
        "interval_label": "60s",
        "interval_s":     60,
        "enabled":        False,
        "status":         "pending_subscription",
        "last_fetch":     None,
        "last_value":     None,
        "error":          "Requires paid subscription at request.taoshi.io/login (no public pricing on docs)",
        "events_total":   0,
        "config":         {"api_key": "", "endpoint": "https://request.taoshi.io"},
        "subnet_netuid":  8,
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
    """
    Emit a TAO/USD signal from CoinGecko.

    Strategy to avoid double-hitting the free-tier public API:
      1. price_service already polls CoinGecko every 30 s — use its cache first.
      2. Only make a fresh HTTP call when the cache is stale (>90 s old).
      3. On HTTP 429 / any error: mark feed error, do NOT emit a $0.00 signal.
         The last known good price from price_service is surfaced instead,
         so the activity log always shows a meaningful price, never $0.00.
    """
    from services.price_service import price_service
    from datetime import datetime, timezone as _tz

    url = (
        "https://api.coingecko.com/api/v3/simple/price"
        "?ids=bittensor&vs_currencies=usd"
        "&include_24hr_change=true"
        "&include_24hr_vol=true"
    )

    # ── Prefer the already-cached price from price_service ────────────────
    cached   = price_service.price_data          # dict with price_usd, timestamp …
    cached_ts_str = cached.get("timestamp")
    cache_age = 999.0
    if cached_ts_str:
        try:
            ts        = datetime.fromisoformat(cached_ts_str)
            cache_age = (datetime.now(_tz.utc) - ts.replace(tzinfo=_tz.utc)).total_seconds()
        except Exception:
            pass

    price  = float(cached.get("price_usd") or 0)
    change = float(cached.get("price_change_pct_24h") or 0)
    vol    = float(cached.get("volume_24h") or 0)

    # ── Only do a live HTTP call when the cache is stale (>90 s) ─────────
    if cache_age > 90 or price == 0:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url, headers={"User-Agent": "TaoBot/1.0"})

            if resp.status_code == 429:
                # Rate-limited — back off, do NOT emit $0.00 noise
                _mark_error("coingecko", "429 Too Many Requests — using cached price")
                logger.warning("CoinGecko 429: rate-limited; skipping signal emission")
                # Fall through with whatever `price` is from cache
            else:
                resp.raise_for_status()
                data   = resp.json().get("bittensor", {})
                price  = float(data.get("usd",            0) or 0)
                change = float(data.get("usd_24h_change", 0) or 0)
                vol    = float(data.get("usd_24h_vol",    0) or 0)

        except Exception as exc:
            _mark_error("coingecko", str(exc))
            logger.warning(f"CoinGecko poll failed: {exc}")
            # Use whatever price we have from the cache; if still 0 → skip
            if price == 0:
                return

    # ── Guard: never emit a $0.00 signal ─────────────────────────────────
    if price == 0:
        logger.debug("CoinGecko: price is 0 — skipping signal (no data yet)")
        _mark_error("coingecko", "No price data available yet")
        return

    arrow = "▲" if change >= 0 else "▼"
    sign  = "+" if change >= 0 else ""
    msg   = (
        f"TAO ${price:,.2f}  {arrow} {sign}{change:.2f}% 24h"
        + (f"  Vol ${vol/1e6:.1f}M" if vol else "")
    )
    push_event("signal", msg, strategy=None, detail="source:coingecko")
    _mark_ok("coingecko", f"${price:,.2f}")
    logger.debug(f"CoinGecko signal: {msg}")


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
                "Authorization": api_key,   # raw key — no "Bearer" prefix (matches Taostats v1 spec)
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


# ── Discord Gateway client ────────────────────────────────────────────────────

_DISCORD_CHANNEL_KEYWORDS = [
    "subnet", "announce", "alpha", "governance", "validator",
    "weight", "staking", "bittensor", "tao", "signal",
]

# Channels the bot will read — empty = all channels it can see
_DISCORD_TARGET_CHANNELS: set[int] = set()

_discord_client: Optional["discord.Client"] = None
_discord_task: Optional[asyncio.Task] = None


def _message_is_relevant(content: str) -> bool:
    """Return True if the message contains at least one TAO/subnet keyword."""
    lc = content.lower()
    return any(kw in lc for kw in _DISCORD_CHANNEL_KEYWORDS)


async def _run_discord_gateway() -> None:
    """
    Long-running Discord Gateway connection using discord.py.
    Connects when a bot_token is present, reconnects automatically on drop.
    Pushes relevant messages to the activity log as signal events.
    """
    global _discord_client

    RETRY_BACKOFF = [5, 15, 30, 60, 120]
    attempt = 0

    while True:
        token = _FEEDS["discord"]["config"].get("bot_token", "").strip()
        if not token:
            logger.debug("DiscordGateway: no token — sleeping 60 s")
            await asyncio.sleep(60)
            continue

        intents = discord.Intents.default()
        intents.message_content = True          # requires Message Content Intent
        intents.messages = True

        client = discord.Client(intents=intents)
        _discord_client = client

        @client.event
        async def on_ready():
            nonlocal attempt
            attempt = 0                         # reset backoff on successful connect
            guild_list = ", ".join(g.name for g in client.guilds) or "(none)"
            logger.info(f"DiscordGateway: connected as {client.user} · guilds: {guild_list}")
            _FEEDS["discord"]["enabled"] = True
            _FEEDS["discord"]["status"]  = "connected"
            _FEEDS["discord"]["error"]   = None
            _FEEDS["discord"]["last_fetch"] = _now()

        @client.event
        async def on_message(message: discord.Message):
            if message.author.bot:
                return
            # Filter by target channels if configured
            if _DISCORD_TARGET_CHANNELS and message.channel.id not in _DISCORD_TARGET_CHANNELS:
                return
            if not _message_is_relevant(message.content):
                return

            channel_name = getattr(message.channel, "name", str(message.channel.id))
            author       = str(message.author.display_name)
            snippet      = message.content[:280].replace("\n", " ")

            summary = f"[#{channel_name}] {author}: {snippet}"
            _mark_ok("discord", summary)

            await push_event(
                category="signal",
                title=f"Discord · #{channel_name}",
                detail=snippet,
                metadata={
                    "author":     author,
                    "channel":    channel_name,
                    "message_id": str(message.id),
                    "guild":      message.guild.name if message.guild else "DM",
                },
            )

        @client.event
        async def on_disconnect():
            logger.warning("DiscordGateway: disconnected")
            _FEEDS["discord"]["status"] = "connecting"

        @client.event
        async def on_error(event, *args, **kwargs):
            logger.error(f"DiscordGateway: error in {event}")

        try:
            await client.start(token)
        except discord.LoginFailure as exc:
            err = f"Invalid bot token: {exc}"
            logger.error(f"DiscordGateway: {err}")
            _mark_error("discord", err)
            await asyncio.sleep(300)            # don't spam on bad token
        except Exception as exc:
            delay = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
            logger.warning(f"DiscordGateway: {exc} — retry in {delay}s (attempt {attempt+1})")
            _mark_error("discord", str(exc))
            attempt += 1
            await asyncio.sleep(delay)
        finally:
            try:
                await client.close()
            except Exception:
                pass
            _discord_client = None


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
        # Only allow if we have a token — the Gateway loop handles connection
        has_token = bool(_FEEDS["discord"]["config"].get("bot_token", "").strip())
        if not has_token:
            return False   # still waiting for token
    feed["enabled"] = enabled
    feed["status"]  = "connecting" if enabled else "disabled"
    return True


async def start_all() -> None:
    """
    Launch all polling loops as background asyncio tasks.
    Called from main.py lifespan after yield (i.e. after the server is up).

    Environment variable seeding (runs before any loop starts):
      TAOSTATS_API_KEY   → _FEEDS["taostats"]["config"]["api_key"]
      PERPLEXITY_API_KEY → _FEEDS["perplexity"]["config"]["api_key"]
      DISCORD_BOT_TOKEN  → _FEEDS["discord"]["config"]["bot_token"]

    This ensures keys survive Railway redeployments — Railway env vars are
    the persistent store; the UI drawer lets operators update without a redeploy.
    """
    # ── Seed keys from environment variables ──────────────────────────────────
    taostats_key  = os.environ.get("TAOSTATS_API_KEY",   "").strip()
    perplexity_key = os.environ.get("PERPLEXITY_API_KEY", "").strip()
    discord_token  = os.environ.get("DISCORD_BOT_TOKEN",  "").strip()

    if taostats_key:
        _FEEDS["taostats"]["config"]["api_key"] = taostats_key
        logger.info("SignalIngestor: TAOSTATS_API_KEY loaded from environment")
    if perplexity_key:
        _FEEDS["perplexity"]["config"]["api_key"] = perplexity_key
        logger.info("SignalIngestor: PERPLEXITY_API_KEY loaded from environment")
    if discord_token:
        _FEEDS["discord"]["config"]["bot_token"] = discord_token
        logger.info("SignalIngestor: DISCORD_BOT_TOKEN loaded from environment")

    # ── Start pollers ─────────────────────────────────────────────────────────
    logger.info("SignalIngestor: starting feed pollers")
    asyncio.create_task(_run_loop("coingecko",    _poll_coingecko))
    asyncio.create_task(_run_loop("reddit_rss",   _poll_reddit_rss))
    asyncio.create_task(_run_loop("taodaily_rss", _poll_taodaily_rss))
    asyncio.create_task(_run_loop("taostats",     _poll_taostats))
    asyncio.create_task(_run_loop("perplexity",   _poll_perplexity))

    # ── Discord Gateway — starts immediately; waits internally for a valid token
    global _discord_task
    _discord_task = asyncio.create_task(_run_discord_gateway())
    if discord_token:
        _FEEDS["discord"]["status"] = "connecting"
        logger.info("DiscordGateway: task started — connecting with token from env")
    else:
        _FEEDS["discord"]["status"] = "pending_invite"
        logger.info("DiscordGateway: task started — waiting for DISCORD_BOT_TOKEN")

    active = sum(1 for k in ("taostats", "perplexity", "discord")
                 if _FEEDS[k]["config"].get("api_key") or _FEEDS[k]["config"].get("bot_token"))
    logger.info(
        f"SignalIngestor: CoinGecko/Reddit/TaoDaily auto-started · "
        f"{active}/3 keyed feeds pre-loaded from env · Discord awaits OTF invite"
    )