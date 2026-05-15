"""
CEX Listing Watch Service
=========================
Carry-over #6 (Session XXXIV) — RSS MVP.

Polls the official RSS / blog feeds of the major centralised exchanges
(Coinbase, Kraken, Crypto.com, Bitfinex …) and surfaces any post whose
title or summary mentions Bittensor / TAO / dTAO / a known subnet brand.

Why this matters
----------------
A new CEX listing for TAO (or any subnet alpha that gets promoted out of
the dTAO sandbox) is the single highest-impact short-term price catalyst
in the ecosystem. Catching the announcement at the same moment Twitter
catches it is worth two orders of magnitude more than catching it five
minutes later off the price tape.

Design
------
* Singleton pattern, mirrors :pyclass:`whale_service.WhaleService`
  (async lock, disk hydrate, refresh interval, error fall-through).
* Stdlib only — RSS 2.0 + Atom 1.0 parser via ``xml.etree.ElementTree``
  so we don't pull in feedparser. CEX blog feeds are well-formed.
* Match engine = case-insensitive substring on a curated keyword set
  plus dynamic subnet-name extraction from
  :pyfunc:`subnet_scorecard_service.subnet_scorecard_service.list_subnets`.
* New matches push a single ``CEX_LISTING_DETECTED`` alert each
  (deduped by guid → subsequent polls won't re-alert).

Carry-over note: Twitter scrape (v2) is **deliberately deferred** —
auth + rate-limit minefield, not worth the lift today. RSS already
catches Coinbase/Kraken/Crypto.com listings at the same minute their
official social posts go out.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from xml.etree import ElementTree as ET

import httpx

logger = logging.getLogger(__name__)

# ── Tunables ─────────────────────────────────────────────────────────────────
REFRESH_INTERVAL = 600        # 10 min — CEX feeds rarely fire faster than this
HTTP_TIMEOUT_S   = 12.0
MAX_HITS         = 100        # ring-buffer cap on match history
DEFAULT_CACHE_PATH = "backend/data/cex_listing_cache.json"

# Default feed list — overridable via CEX_LISTING_FEEDS env var
# (comma-separated: "name=url,name2=url2"). All feeds are RSS 2.0 or Atom 1.0.
DEFAULT_FEEDS: List[Tuple[str, str]] = [
    ("Coinbase",   "https://blog.coinbase.com/feed"),
    ("Kraken",     "https://blog.kraken.com/feed/"),
    ("CryptoCom",  "https://crypto.com/exchange/announcements/feed.xml"),
    # Binance has no public RSS (JSON CMS only) — handled separately if/when
    # we add a JSON adapter. Kept here so the env override doesn't have to
    # re-list these three feeds when the operator only wants to *add* one.
]

# ── Match keywords ───────────────────────────────────────────────────────────
# Static whitelist. Augmented at runtime with subnet names from the scorecard
# service (e.g. "Vanta", "Templar", "Cortex", "Chutes" …).
STATIC_KEYWORDS = [
    "bittensor",
    "tao token",
    "$tao",
    " tao ",     # padded to dodge "tattoo", "potato" etc.
    "dtao",
    "subnet alpha",
    "alpha token",
]


def _resolve_cache_path() -> Path:
    """Mirror whale_service: env override → DATA_DIR → /data → repo fallback."""
    explicit = (os.environ.get("CEX_LISTING_CACHE_PATH") or "").strip()
    if explicit:
        return Path(explicit)
    data_dir = (os.environ.get("DATA_DIR") or "").strip()
    if data_dir:
        return Path(data_dir) / "cex_listing_cache.json"
    railway_volume = Path("/data")
    if railway_volume.is_dir() and os.access(railway_volume, os.W_OK):
        return railway_volume / "cex_listing_cache.json"
    return Path(DEFAULT_CACHE_PATH)


CACHE_PATH = _resolve_cache_path()


def _resolve_feeds() -> List[Tuple[str, str]]:
    """Parse CEX_LISTING_FEEDS env override; fall back to DEFAULT_FEEDS."""
    raw = (os.environ.get("CEX_LISTING_FEEDS") or "").strip()
    if not raw:
        return list(DEFAULT_FEEDS)
    out: List[Tuple[str, str]] = []
    for chunk in raw.split(","):
        if "=" not in chunk:
            continue
        name, url = chunk.split("=", 1)
        name, url = name.strip(), url.strip()
        if name and url:
            out.append((name, url))
    return out or list(DEFAULT_FEEDS)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ── Feed parsing ─────────────────────────────────────────────────────────────

# Strip HTML tags from RSS/Atom <description>/<summary> content.
_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    return _TAG_RE.sub(" ", text or "").strip()


def _parse_feed(name: str, body: bytes) -> List[Dict[str, Any]]:
    """
    Parse RSS 2.0 (<rss><channel><item>) or Atom 1.0 (<feed><entry>) into a
    uniform list of dicts: {exchange, guid, title, link, summary, published}.
    """
    out: List[Dict[str, Any]] = []
    try:
        root = ET.fromstring(body)
    except ET.ParseError as e:
        logger.warning(f"CEX feed parse error ({name}): {e}")
        return out

    # Atom uses XML namespaces. Pull the root namespace if present.
    tag = root.tag.lower()
    if tag.endswith("rss") or tag == "rss":
        # RSS 2.0
        for item in root.iter("item"):
            entry = {
                "exchange":  name,
                "guid":      (item.findtext("guid") or item.findtext("link") or "").strip(),
                "title":     (item.findtext("title") or "").strip(),
                "link":      (item.findtext("link") or "").strip(),
                "summary":   _strip_html(item.findtext("description") or ""),
                "published": (item.findtext("pubDate") or "").strip(),
            }
            if entry["title"] and entry["guid"]:
                out.append(entry)
    else:
        # Atom — entries are under {ns}entry and links live in <link href=…/>
        # Iterate everything tagged "entry" regardless of namespace.
        for entry in root.iter():
            if not entry.tag.lower().endswith("entry"):
                continue
            title_el = next((c for c in entry if c.tag.lower().endswith("title")), None)
            id_el    = next((c for c in entry if c.tag.lower().endswith("id")), None)
            sum_el   = next((c for c in entry if c.tag.lower().endswith("summary") or c.tag.lower().endswith("content")), None)
            pub_el   = next((c for c in entry if c.tag.lower().endswith("published") or c.tag.lower().endswith("updated")), None)
            link     = ""
            for c in entry:
                if c.tag.lower().endswith("link"):
                    link = (c.attrib.get("href") or c.text or "").strip()
                    if link:
                        break
            title = (title_el.text if title_el is not None else "") or ""
            guid  = ((id_el.text if id_el is not None else "") or link).strip()
            summary = _strip_html((sum_el.text if sum_el is not None else "") or "")
            pub   = (pub_el.text if pub_el is not None else "") or ""
            if title.strip() and guid:
                out.append({
                    "exchange":  name,
                    "guid":      guid,
                    "title":     title.strip(),
                    "link":      link,
                    "summary":   summary,
                    "published": pub.strip(),
                })
    return out


# ── Service ──────────────────────────────────────────────────────────────────


class CexListingService:
    """Polls CEX feeds, deduplicates matches, exposes them via snapshot()."""

    def __init__(self) -> None:
        self._lock           = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None
        self._stop           = asyncio.Event()
        self._hits: List[Dict[str, Any]] = []     # ring buffer of matches
        self._seen_guids: set = set()             # all-time dedup set
        self._last_fetch_at: float = 0.0
        self._last_error:  Optional[str] = None
        self._feed_status: Dict[str, Dict[str, Any]] = {}   # per-feed health
        self._hydrate_from_disk()

    # ── Public API ────────────────────────────────────────────────────────────

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run_loop())
        logger.info(f"CexListingService started — cache={CACHE_PATH}")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=3.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                pass
            self._task = None

    async def snapshot(self, force: bool = False) -> Dict[str, Any]:
        if force or (time.time() - self._last_fetch_at) > REFRESH_INTERVAL:
            await self._refresh()
        return self._payload()

    # ── Internal loop ─────────────────────────────────────────────────────────

    async def _run_loop(self) -> None:
        # First fetch immediately (after a 5-s grace so we don't trample boot).
        await asyncio.sleep(5)
        while not self._stop.is_set():
            try:
                await self._refresh()
            except Exception as e:
                logger.exception(f"CexListingService refresh crashed: {e}")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=REFRESH_INTERVAL)
            except asyncio.TimeoutError:
                continue

    async def _refresh(self) -> None:
        async with self._lock:
            keywords = self._build_keyword_list()
            feeds    = _resolve_feeds()
            new_hits: List[Dict[str, Any]] = []

            async with httpx.AsyncClient(
                timeout=HTTP_TIMEOUT_S,
                headers={"User-Agent": "TAO-Bot/1.0 (cex-listing-watch)"},
                follow_redirects=True,
            ) as client:
                for name, url in feeds:
                    status = self._feed_status.setdefault(name, {})
                    status["url"] = url
                    try:
                        resp = await client.get(url)
                        resp.raise_for_status()
                        entries = _parse_feed(name, resp.content)
                        status.update({
                            "ok": True,
                            "entries": len(entries),
                            "fetched_at": _now_iso(),
                            "error": None,
                        })
                    except Exception as e:
                        msg = str(e)[:140]
                        status.update({
                            "ok": False,
                            "fetched_at": _now_iso(),
                            "error": msg,
                        })
                        logger.warning(f"CEX feed fetch failed ({name}): {msg}")
                        continue

                    for entry in entries:
                        if entry["guid"] in self._seen_guids:
                            continue
                        haystack = (entry["title"] + " " + entry["summary"]).lower()
                        matched = [k for k in keywords if k in haystack]
                        if not matched:
                            # Still mark as seen so we don't keep re-scanning
                            # the same archive entries every poll.
                            self._seen_guids.add(entry["guid"])
                            continue
                        hit = {
                            **entry,
                            "matched_keywords": sorted(set(matched))[:8],
                            "detected_at":      _now_iso(),
                        }
                        new_hits.append(hit)
                        self._seen_guids.add(entry["guid"])

            # Prepend (newest first), cap buffer
            if new_hits:
                self._hits = (new_hits + self._hits)[:MAX_HITS]
                self._fire_alerts(new_hits)
                self._persist()
                logger.info(f"CexListingService: {len(new_hits)} new match(es) — total buffered={len(self._hits)}")

            self._last_fetch_at = time.time()
            self._last_error    = None

    # ── Match keyword construction ────────────────────────────────────────────

    def _build_keyword_list(self) -> List[str]:
        """STATIC_KEYWORDS plus subnet brand names from the scorecard service.

        Defensive: scorecard import failure (or empty list) silently falls
        back to STATIC_KEYWORDS only — never blocks the poll loop.
        """
        words = list(STATIC_KEYWORDS)
        try:
            from services.subnet_scorecard_service import subnet_scorecard_service
            for entry in (subnet_scorecard_service.list_subnets() or []):
                name = (entry.get("name") or "").strip().lower()
                # Skip very short / generic names that would false-positive
                # (e.g. "edge", "data", "ai") — only accept brand-like tokens
                # with at least 5 chars.
                if len(name) >= 5 and name.isascii():
                    words.append(name)
        except Exception:
            pass
        # Dedup, preserve order
        seen: set = set()
        out: List[str] = []
        for w in words:
            wl = w.lower()
            if wl not in seen:
                seen.add(wl)
                out.append(wl)
        return out

    # ── Alerts ────────────────────────────────────────────────────────────────

    def _fire_alerts(self, new_hits: List[Dict[str, Any]]) -> None:
        """One CEX_LISTING_DETECTED alert per new match. Soft-fail if the
        alert service isn't importable yet (boot ordering)."""
        try:
            from services.alert_service import alert_service, LEVEL_WARNING
        except Exception:
            return
        for hit in new_hits:
            try:
                alert_service.push_alert(
                    type="CEX_LISTING_DETECTED",
                    level=LEVEL_WARNING,
                    title=f"{hit['exchange']}: {hit['title'][:90]}",
                    message=(
                        f"Keywords matched: {', '.join(hit['matched_keywords'])}\n"
                        f"Source: {hit['link'] or hit['exchange']}"
                    ),
                    detail=hit.get("summary", "")[:400],
                )
            except Exception as e:
                logger.warning(f"alert push failed for CEX hit {hit.get('guid')}: {e}")

    # ── Disk persistence ──────────────────────────────────────────────────────

    def _persist(self) -> None:
        try:
            CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "hits":         self._hits,
                "seen_guids":   sorted(self._seen_guids)[-5000:],  # cap
                "last_fetch_at": self._last_fetch_at,
                "feed_status":  self._feed_status,
            }
            CACHE_PATH.write_text(json.dumps(payload, indent=2))
        except Exception as e:
            logger.warning(f"CexListingService persist failed: {e}")

    def _hydrate_from_disk(self) -> None:
        try:
            if not CACHE_PATH.exists():
                return
            data = json.loads(CACHE_PATH.read_text())
            self._hits = data.get("hits", [])[:MAX_HITS]
            self._seen_guids = set(data.get("seen_guids", []))
            self._last_fetch_at = float(data.get("last_fetch_at", 0.0))
            self._feed_status = data.get("feed_status", {})
            logger.info(
                f"CexListingService: hydrated {len(self._hits)} cached hits from {CACHE_PATH}"
            )
        except Exception as e:
            logger.warning(f"CexListingService hydrate failed: {e}")

    # ── Payload shape ─────────────────────────────────────────────────────────

    def _payload(self) -> Dict[str, Any]:
        return {
            "hits":            self._hits,
            "hit_count":       len(self._hits),
            "feeds":           [
                {"exchange": name, "url": url, **(self._feed_status.get(name) or {})}
                for (name, url) in _resolve_feeds()
            ],
            "last_fetch_at":   (
                datetime.fromtimestamp(self._last_fetch_at, tz=timezone.utc)
                .isoformat().replace("+00:00", "Z")
                if self._last_fetch_at else None
            ),
            "refresh_interval_s": REFRESH_INTERVAL,
            "cache_path":      str(CACHE_PATH),
            "keyword_count":   len(self._build_keyword_list()),
        }


cex_listing_service = CexListingService()