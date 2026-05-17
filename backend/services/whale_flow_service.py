"""
Whale Flow Service — Phase 1 (Session XXXVII)
=============================================

Per-subnet feed of large stake / unstake events on Bittensor dTAO subnets.

This is the operator-facing answer to Mav's screenshot of Talisman's
"Whale Activity" panel. Talisman is a wallet — they have no proprietary
data; everything they show is derived from public chain extrinsics. We
piggyback on the same chain data via TaoStats' free-tier endpoint and
add intelligence Talisman does not (ping-pong detection, repeat-offender
flagging, Conviction-Era owner overlay — Phase 2).

Why this lives here
-------------------
Big-ticket stake / unstake moves are leading-indicator alpha. A
1,000-τ allocation into a quiet subnet typically front-runs the alpha
price tape by hours; an equivalent unstake telegraphs the inverse. Until
this session our only large-scale flow signal was the TaoStats top-N
holder leaderboard (services/whale_service.py), which is a static snapshot
of *who holds*, not a flow tape of *what's moving*. This service fills
the gap.

Data path
---------
* Endpoint: ``GET https://api.taostats.io/api/delegation/v1``
  - Query: ``action=all``, ``amount_min={DEFAULT_MIN_RAO}``,
           ``order=timestamp_desc``, ``limit=200``
  - Auth:  ``Authorization: <TAOSTATS_API_KEY>`` (no "Bearer" prefix —
           same convention as wallet.py and whale_service.py)
* Cadence: ``REFRESH_INTERVAL`` seconds (default 300)
* Dedup: server-supplied ``id`` field, ring-buffered to ``MAX_EVENTS``
* Persistence: disk cache survives redeploys (mirrors whale_service.py
  cache-path resolution: WHALE_FLOW_CACHE_PATH → DATA_DIR → /data
  auto-detect → repo fallback)
* Graceful degradation: missing API key → ``configured=False`` payload;
  upstream 429/5xx → serve last-good with ``stale=True``

TaoStats free-tier budget
-------------------------
At 5-minute cadence the service makes ~288 calls/day. The free tier's
hard limit is well above that, and we already share the key with two
other low-volume callers (wallet transfers + whale leaderboard).
Combined daily total stays under 500 calls.

Public surface
--------------
* ``await whale_flow_service.start()``  — schedule the poll loop
* ``await whale_flow_service.stop()``   — graceful drain
* ``whale_flow_service.snapshot()``     — full payload, no I/O
* ``whale_flow_service.events_for_subnet(netuid, window)``
* ``whale_flow_service.summary_for_subnet(netuid, window)``

Window strings
--------------
``"1d"`` / ``"1w"`` / ``"1m"`` — see ``_window_seconds``.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# ── Tunables ─────────────────────────────────────────────────────────────────
TAOSTATS_BASE     = "https://api.taostats.io"
DELEGATION_PATH   = "/api/delegation/v1"
REFRESH_INTERVAL  = int(os.environ.get("WHALE_FLOW_REFRESH_S", "300"))
HTTP_TIMEOUT_S    = 12.0
PAGE_LIMIT        = 200                # TaoStats max per page
MAX_EVENTS        = 5000               # ring-buffer cap (~ 1 month at observed rate)
RAO_PER_TAO       = 1_000_000_000      # 1 TAO = 1e9 rao

# Default whale threshold = 100 τ. Same minimum Talisman appears to use
# (their screenshot's lowest event was 122.7 τ). Configurable via env.
DEFAULT_MIN_TAO   = float(os.environ.get("WHALE_FLOW_MIN_TAO", "100"))
DEFAULT_MIN_RAO   = int(DEFAULT_MIN_TAO * RAO_PER_TAO)

# Single-event alert escalation threshold (τ). Anything ≥ this fires an
# INFO alert into the operator inbox. CRITICAL escalation reserved for
# Phase 2.
ALERT_TAO_FLOOR   = float(os.environ.get("WHALE_FLOW_ALERT_TAO", "500"))

DEFAULT_CACHE_PATH = "backend/data/whale_flow_cache.json"

# Window helpers
_WINDOW_SECONDS = {
    "1d":  86_400,
    "1w":  604_800,
    "1m":  2_592_000,   # 30 d
}


def _resolve_cache_path() -> Path:
    """Mirrors whale_service._resolve_cache_path — see that module's
    docstring for the Railway-volume rationale."""
    explicit = os.environ.get("WHALE_FLOW_CACHE_PATH", "").strip()
    if explicit:
        return Path(explicit)

    data_dir = os.environ.get("DATA_DIR", "").strip()
    if data_dir:
        return Path(data_dir) / "whale_flow_cache.json"

    railway_volume = Path("/data")
    if railway_volume.is_dir() and os.access(railway_volume, os.W_OK):
        return railway_volume / "whale_flow_cache.json"

    return Path(DEFAULT_CACHE_PATH)


CACHE_PATH = _resolve_cache_path()


def _api_key() -> str:
    return (os.environ.get("TAOSTATS_API_KEY") or "").strip()


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _short_ss58(addr: str) -> str:
    """head6…tail6 — Talisman convention."""
    if not addr or len(addr) < 14:
        return addr or ""
    return f"{addr[:6]}…{addr[-6:]}"


def _parse_iso_to_unix(ts: str) -> int:
    """TaoStats returns "2025-11-20T16:44:36Z". Tolerant parse → unix s."""
    if not ts:
        return 0
    try:
        # Handle the trailing Z without pulling in pendulum.
        s = ts.replace("Z", "+00:00")
        return int(datetime.fromisoformat(s).timestamp())
    except Exception:
        return 0


def _normalise_event(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Convert a raw TaoStats delegation row into our canonical shape.

    Returns ``None`` if the row is malformed (missing id / amount /
    nominator). Exceptions are caught to keep the poll loop liveness
    independent of any single bad row.
    """
    try:
        rid       = (raw.get("id") or "").strip()
        if not rid:
            return None
        action    = (raw.get("action") or "").upper()
        if action not in ("DELEGATE", "UNDELEGATE"):
            return None
        nom       = raw.get("nominator") or {}
        dlg       = raw.get("delegate")  or {}
        nom_ss58  = (nom.get("ss58") or "").strip()
        dlg_ss58  = (dlg.get("ss58") or "").strip()
        amount_rao = int(raw.get("amount") or 0)
        if amount_rao <= 0:
            return None
        amount_tao = amount_rao / RAO_PER_TAO
        usd_str    = (raw.get("usd") or "0").strip()
        try:
            amount_usd = float(usd_str)
        except ValueError:
            amount_usd = 0.0
        netuid    = int(raw.get("netuid") if raw.get("netuid") is not None else -1)
        ts_iso    = raw.get("timestamp") or ""
        return {
            "id":              rid,
            "extrinsic_id":    raw.get("extrinsic_id") or "",
            "block_number":    int(raw.get("block_number") or 0),
            "timestamp":       ts_iso,
            "ts_unix":         _parse_iso_to_unix(ts_iso),
            "action":          action,
            "direction":       "in" if action == "DELEGATE" else "out",
            "nominator_ss58":  _short_ss58(nom_ss58),
            "nominator_full":  nom_ss58,
            "delegate_ss58":   _short_ss58(dlg_ss58),
            "delegate_full":   dlg_ss58,
            "amount_tao":      round(amount_tao, 6),
            "amount_usd":      round(amount_usd, 2),
            "alpha_price_usd": float(raw.get("alpha_price_in_usd") or 0.0),
            "netuid":          netuid,
        }
    except Exception as e:  # pragma: no cover — defensive
        logger.debug(f"whale_flow: skipping malformed row ({e}): {raw!r:.200}")
        return None


# ── Service ──────────────────────────────────────────────────────────────────


class WhaleFlowService:
    """Singleton poller for TaoStats /api/delegation/v1.

    Mirrors the architecture of :pyclass:`CexListingService`:
      * single asyncio task driven by ``_run_loop``
      * ring buffer of recent events (newest first)
      * disk cache for redeploy-survivability
      * system_health heartbeat on every refresh
      * alert push on threshold-crossing single events
    """

    def __init__(self) -> None:
        self._lock          = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None
        self._stop          = asyncio.Event()
        self._events: List[Dict[str, Any]] = []   # newest first
        self._seen_ids: set = set()
        self._last_fetch_at: float = 0.0
        self._last_error:  Optional[str] = None
        self._configured:  bool = bool(_api_key())
        self._hydrate_from_disk()

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run_loop())
        logger.info(
            f"WhaleFlowService started — cache={CACHE_PATH} "
            f"min_tao={DEFAULT_MIN_TAO} interval={REFRESH_INTERVAL}s "
            f"configured={self._configured}"
        )

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=3.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                pass
            self._task = None

    # ── Public read API ───────────────────────────────────────────────────────

    def snapshot(self) -> Dict[str, Any]:
        """Cheap, no-I/O view of the current ring buffer."""
        return {
            "configured":  self._configured,
            "fetched_at":  _iso(self._last_fetch_at),
            "event_count": len(self._events),
            "min_tao":     DEFAULT_MIN_TAO,
            "stale":       self._is_stale(),
            "last_error":  self._last_error,
        }

    def events_for_subnet(
        self,
        netuid: Optional[int],
        window: str = "1w",
        limit: int  = 50,
        min_tao: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """Filter the ring buffer.

        ``netuid=None`` returns events across all subnets (used by the
        global Whale Flow tile). ``netuid=0`` is *root subnet* and is a
        valid filter value — be careful not to coerce it to falsy.
        """
        cutoff = self._cutoff_unix(window)
        floor  = (min_tao if min_tao is not None else DEFAULT_MIN_TAO)
        out: List[Dict[str, Any]] = []
        for ev in self._events:
            if cutoff and ev["ts_unix"] < cutoff:
                continue
            if netuid is not None and ev["netuid"] != netuid:
                continue
            if ev["amount_tao"] < floor:
                continue
            out.append(ev)
            if len(out) >= limit:
                break
        return out

    def summary_for_subnet(
        self,
        netuid: Optional[int],
        window: str = "1w",
        min_tao: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Aggregate flow stats over the window.

        Net flow is signed: positive = net DELEGATE (accumulation),
        negative = net UNDELEGATE (distribution).
        """
        events = self.events_for_subnet(
            netuid, window=window, limit=10_000, min_tao=min_tao
        )
        gross_in_tao  = sum(e["amount_tao"] for e in events if e["direction"] == "in")
        gross_out_tao = sum(e["amount_tao"] for e in events if e["direction"] == "out")
        gross_in_usd  = sum(e["amount_usd"] for e in events if e["direction"] == "in")
        gross_out_usd = sum(e["amount_usd"] for e in events if e["direction"] == "out")
        unique = len({e["nominator_full"] for e in events if e["nominator_full"]})

        # Top 3 single inflows / outflows by τ amount
        ins  = sorted([e for e in events if e["direction"] == "in"],  key=lambda x: -x["amount_tao"])[:3]
        outs = sorted([e for e in events if e["direction"] == "out"], key=lambda x: -x["amount_tao"])[:3]

        # Ping-pong heuristic: count pairs of (in, out) by the same address
        # within 60 s where amounts differ by < 1 %.
        pp_pairs = 0
        by_addr: Dict[str, List[Dict[str, Any]]] = {}
        for e in events:
            by_addr.setdefault(e["nominator_full"], []).append(e)
        for addr, lst in by_addr.items():
            if not addr:
                continue
            lst_sorted = sorted(lst, key=lambda x: x["ts_unix"])
            for i in range(len(lst_sorted) - 1):
                a, b = lst_sorted[i], lst_sorted[i + 1]
                if a["direction"] == b["direction"]:
                    continue
                if abs(a["ts_unix"] - b["ts_unix"]) > 60:
                    continue
                if a["amount_tao"] <= 0:
                    continue
                if abs(a["amount_tao"] - b["amount_tao"]) / a["amount_tao"] < 0.01:
                    pp_pairs += 1

        return {
            "netuid":          netuid,
            "window":          window,
            "gross_in_tao":    round(gross_in_tao,  4),
            "gross_out_tao":   round(gross_out_tao, 4),
            "net_flow_tao":    round(gross_in_tao - gross_out_tao, 4),
            "gross_in_usd":    round(gross_in_usd,  2),
            "gross_out_usd":   round(gross_out_usd, 2),
            "net_flow_usd":    round(gross_in_usd - gross_out_usd, 2),
            "unique_addresses": unique,
            "event_count":     len(events),
            "top_inflows":     ins,
            "top_outflows":    outs,
            "pingpong_pairs":  pp_pairs,
            "min_tao":         (min_tao if min_tao is not None else DEFAULT_MIN_TAO),
        }

    # ── Internals ─────────────────────────────────────────────────────────────

    def _is_stale(self) -> bool:
        return self._last_fetch_at == 0.0 or (
            time.time() - self._last_fetch_at > REFRESH_INTERVAL * 2
        )

    @staticmethod
    def _cutoff_unix(window: str) -> int:
        secs = _WINDOW_SECONDS.get(window, _WINDOW_SECONDS["1w"])
        return int(time.time()) - secs

    async def _run_loop(self) -> None:
        # 7-second grace lets boot settle; same pattern as cex_listing.
        await asyncio.sleep(7)
        while not self._stop.is_set():
            try:
                await self._refresh()
            except Exception as e:  # pragma: no cover
                logger.exception(f"WhaleFlowService refresh crashed: {e}")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=REFRESH_INTERVAL)
            except asyncio.TimeoutError:
                continue

    async def _refresh(self) -> None:
        _t0 = time.time()
        _success = True
        _err: Optional[str] = None

        if not _api_key():
            self._configured = False
            self._last_error = "TAOSTATS_API_KEY not set"
            self._heartbeat(_t0, success=False, error=self._last_error)
            return
        self._configured = True

        async with self._lock:
            new_events: List[Dict[str, Any]] = []
            try:
                rows = await self._fetch_page()
                for raw in rows:
                    ev = _normalise_event(raw)
                    if ev is None:
                        continue
                    if ev["id"] in self._seen_ids:
                        continue
                    new_events.append(ev)
                    self._seen_ids.add(ev["id"])
            except Exception as e:
                _success = False
                _err = str(e)[:200]
                self._last_error = _err
                logger.warning(f"whale_flow: fetch failed — {_err}")
                self._heartbeat(_t0, success=False, error=_err)
                return

            if new_events:
                # Newest first: incoming page is timestamp_desc, so just prepend.
                self._events = (new_events + self._events)[:MAX_EVENTS]
                # Trim seen_ids set so it doesn't grow unboundedly. Keep the
                # last MAX_EVENTS * 4 ids — generous tolerance for late
                # pagination overlap.
                if len(self._seen_ids) > MAX_EVENTS * 4:
                    self._seen_ids = set(e["id"] for e in self._events)
                self._fire_alerts(new_events)
                self._persist()
                logger.info(
                    f"WhaleFlowService: +{len(new_events)} new event(s) — "
                    f"buffer={len(self._events)}"
                )

            self._last_fetch_at = time.time()
            self._last_error    = None
            self._heartbeat(_t0, success=True, error=None)

    async def _fetch_page(self) -> List[Dict[str, Any]]:
        url = f"{TAOSTATS_BASE}{DELEGATION_PATH}"
        params = {
            "action":     "all",
            "amount_min": str(DEFAULT_MIN_RAO),
            "order":      "timestamp_desc",
            "limit":      str(PAGE_LIMIT),
            "page":       "1",
        }
        headers = {
            "Accept":        "application/json",
            "User-Agent":    "TAO-Bot/1.0 (whale-flow)",
            "Authorization": _api_key(),
        }
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_S) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code in (401, 403):
                raise RuntimeError(
                    f"taostats auth failed ({resp.status_code}) — check TAOSTATS_API_KEY"
                )
            if resp.status_code == 429:
                raise RuntimeError("taostats rate limited (429) — back off")
            resp.raise_for_status()
            payload = resp.json() or {}
            data = payload.get("data") or []
            if not isinstance(data, list):
                raise RuntimeError(f"unexpected payload shape: {type(data).__name__}")
            return data

    # ── Heartbeat / alerts / persistence ──────────────────────────────────────

    def _heartbeat(self, t0: float, success: bool, error: Optional[str]) -> None:
        try:
            from services.system_health_service import system_health
            system_health.record_run(
                name="whale_flow",
                success=success,
                error=error,
                duration_ms=round((time.time() - t0) * 1000.0, 1),
            )
        except Exception:
            pass

    def _fire_alerts(self, new_events: List[Dict[str, Any]]) -> None:
        """One INFO alert per single event ≥ ALERT_TAO_FLOOR.

        We deliberately keep this at INFO in Phase 1 so the inbox doesn't
        flood. Phase 2 adds CRITICAL escalation when net flow on a subnet
        flips direction or sustained accumulation crosses a sigma band.
        """
        try:
            from services.alert_service import alert_service, LEVEL_INFO
        except Exception:
            return
        for ev in new_events:
            if ev["amount_tao"] < ALERT_TAO_FLOOR:
                continue
            arrow = "↑" if ev["direction"] == "in" else "↓"
            verb  = "loaded" if ev["direction"] == "in" else "exited"
            try:
                alert_service.push_alert(
                    type="WHALE_FLOW",
                    level=LEVEL_INFO,
                    title=(
                        f"Whale {arrow} SN{ev['netuid']}: "
                        f"{ev['amount_tao']:,.1f} τ ({ev['nominator_ss58']}) {verb}"
                    ),
                    message=(
                        f"${ev['amount_usd']:,.0f} on subnet {ev['netuid']} "
                        f"via validator {ev['delegate_ss58']} — "
                        f"extrinsic {ev['extrinsic_id']}"
                    ),
                    detail=ev["nominator_full"],
                )
            except Exception as e:  # pragma: no cover
                logger.warning(f"whale_flow alert push failed for {ev['id']}: {e}")

    def _persist(self) -> None:
        try:
            CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "events":         self._events,
                "last_fetch_at":  self._last_fetch_at,
            }
            CACHE_PATH.write_text(json.dumps(payload))
        except Exception as e:
            logger.warning(f"whale_flow persist failed: {e}")

    def _hydrate_from_disk(self) -> None:
        try:
            if not CACHE_PATH.is_file():
                return
            payload = json.loads(CACHE_PATH.read_text() or "{}")
            events = payload.get("events") or []
            if isinstance(events, list):
                self._events = events[:MAX_EVENTS]
                self._seen_ids = {e.get("id") for e in self._events if e.get("id")}
                self._last_fetch_at = float(payload.get("last_fetch_at") or 0.0)
                logger.info(
                    f"WhaleFlowService: hydrated {len(self._events)} events from {CACHE_PATH}"
                )
        except Exception as e:
            logger.warning(f"whale_flow hydrate failed: {e}")


def _iso(ts: float) -> Optional[str]:
    if not ts:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# Singleton
whale_flow_service = WhaleFlowService()