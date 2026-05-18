"""
Whale Flow Service — Phase 1 RPC pivot (Session XXXVIII)
========================================================

Per-subnet feed of large stake / unstake events on Bittensor dTAO subnets,
sourced directly from the Finney chain via Substrate websocket RPC.

Pivot from Session XXXVII (1df367c6)
------------------------------------
Original implementation polled TaoStats /api/delegation/v1 every 5 min.
That added a third-party rate-limited dependency with a credit pool that
runs dry — observed Friday 2026-05-17. This rewrite swaps the data path
to direct Substrate RPC against ``wss://entrypoint-finney.opentensor.ai:443``,
the same chain endpoint validators read. No API key, no credit budget,
source of truth.

The public API surface and on-the-wire JSON contract are PRESERVED
EXACTLY — frontend ``WhaleActivityPanel.tsx`` and ``routers/whale_flow.py``
require zero changes.

Data path
---------
* Endpoint: ``wss://entrypoint-finney.opentensor.ai:443``
* Connection: ``async_substrate_interface.AsyncSubstrateInterface``
  (already a transitive dep of ``bittensor>=10.0.0`` — no new packages).
* Subscribe: ``subscribe_block_headers(handler, finalized_only=True)``.
  Finalized-only eliminates reorg risk on whale alerts (~12 s lag, fine
  for our threshold-based use case).
* Per-block: ``get_events(block_hash=...)`` → filter for
  ``SubtensorModule.StakeAdded`` / ``StakeRemoved`` → normalise → ring
  buffer.
* Cadence: ~12 s per finalized block (vs 300 s polling — 25× faster).
* Dedup: ``f"{block_number}-{position_in_events_list}"`` — unique because
  block_number is unique and the ``enumerate()`` index is unique within
  a block (NB: the substrate-decoded ``event_index`` field collides
  across multiple events of the same metadata type — verified live).
* Persistence: same disk cache path (Railway volume aware).
* Heartbeat: per finalized block on ``system_health``.
* Reconnect: exponential backoff, 1 s → cap 60 s, on any WS error.

Event shape preserved (identical to the Phase 1 TaoStats version)::

    {
        id, extrinsic_id, block_number, timestamp, ts_unix,
        action ("DELEGATE"|"UNDELEGATE"), direction ("in"|"out"),
        nominator_ss58, nominator_full,
        delegate_ss58, delegate_full,
        amount_tao, amount_usd, alpha_price_usd, netuid,
    }

USD pricing approximation
-------------------------
TaoStats provided per-event ``usd`` and ``alpha_price_in_usd`` fields
with historical pricing at the block. The chain itself does not — it
emits raw rao amounts. We compute ``amount_usd`` as
``amount_tao * price_service.current_price()`` (current TAO/USD from
CoinGecko, refreshed every ~60 s by ``price_service``). For events that
are seconds old, the difference is negligible. ``alpha_price_usd``
stays at 0.0 in this pivot — the field is preserved for contract
compatibility but unused by the frontend.

What we add over Talisman / TaoStats
------------------------------------
* Live latency (~12 s vs ~5 min)
* Free, no third-party budget concerns
* Source of truth — only failure mode is the public Finney node being
  unreachable, which would also break the rest of our chain stack
* Ring buffer captures the full Subtensor stake-event family
  (``StakeAdded``, ``StakeRemoved``, plus ``StakeMoved`` /
  ``StakeTransferred`` / ``StakeSwapped`` are easy adds for Phase 2)

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
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Tunables ─────────────────────────────────────────────────────────────────
FINNEY_WSS_URL    = os.environ.get(
    "WHALE_FLOW_RPC_URL",
    "wss://entrypoint-finney.opentensor.ai:443",
)
MAX_EVENTS        = 5000               # ring-buffer cap (~ 1 month at observed rate)
RAO_PER_TAO       = 1_000_000_000      # 1 TAO = 1e9 rao

# Default whale threshold = 100 τ (same minimum Talisman appears to use —
# their screenshot's lowest event was 122.7 τ). Configurable via env.
DEFAULT_MIN_TAO   = float(os.environ.get("WHALE_FLOW_MIN_TAO", "100"))

# Single-event alert escalation threshold (τ). Anything ≥ this fires an
# INFO alert into the operator inbox. CRITICAL escalation reserved for
# Phase 2.
ALERT_TAO_FLOOR   = float(os.environ.get("WHALE_FLOW_ALERT_TAO", "500"))

# Reconnect backoff bounds.
RECONNECT_BACKOFF_INITIAL = 1.0
RECONNECT_BACKOFF_MAX     = 60.0

DEFAULT_CACHE_PATH = "backend/data/whale_flow_cache.json"

# Window helpers
_WINDOW_SECONDS = {
    "1d":  86_400,
    "1w":  604_800,
    "1m":  2_592_000,   # 30 d
}


def _resolve_cache_path() -> Path:
    """Mirrors ``whale_service._resolve_cache_path`` — see that module's
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


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _iso_from_unix(ts: int) -> str:
    if not ts:
        return ""
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _short_ss58(addr: str) -> str:
    """head6…tail6 — Talisman convention."""
    if not addr or len(addr) < 14:
        return addr or ""
    return f"{addr[:6]}…{addr[-6:]}"


def _current_tao_usd() -> float:
    """Best-effort TAO/USD spot price. Lazy import to avoid a hard cycle
    against price_service. Returns 0.0 if the price feed is degraded —
    callers must tolerate that.

    Note: ``price_service.current_price`` is a @property (returns float | None),
    NOT a callable — bug caught Day 5: calling it as ``current_price()``
    raises TypeError, gets swallowed here, and quietly poisons every event
    with amount_usd=0. No parens.
    """
    try:
        from services.price_service import price_service
        p = price_service.current_price
        return float(p) if p else 0.0
    except Exception:
        return 0.0


# ── Event normalisation ──────────────────────────────────────────────────────


def _normalise_stake_event(
    raw:           Dict[str, Any],
    block_number:  int,
    ts_unix:       int,
    position:      int,
) -> Optional[Dict[str, Any]]:
    """Convert one decoded ``SubtensorModule.StakeAdded`` /
    ``StakeRemoved`` event into our canonical dict shape.

    Returns ``None`` if the event is malformed (defensive — the live
    probe confirmed the 6-tuple structure but we keep guards in case
    a runtime upgrade changes it).

    Live shape verified 2026-05-18 (block 8,212,638)::

        attributes = [
            coldkey_ss58:  str   # the staker (delegator)
            hotkey_ss58:   str   # the validator being staked to
            tao_rao:       int   # TAO amount in rao (1e9 rao = 1 TAO)
            alpha_units:   int   # alpha tokens minted/burned
            netuid:        int   # subnet UID (0 = root, ≥ 1 = alpha)
            extra_u64:     int   # stake fee in rao (best-guess; not used)
        ]
    """
    try:
        event = raw.get("event") or raw
        event_id  = event.get("event_id")
        attrs     = event.get("attributes") or []
        # NB: async-substrate-interface delivers attributes as a tuple
        # (positional decoded values) for events with positional payloads,
        # and as a dict for events with named payloads (e.g. Balances.Transfer).
        # Stake events use the positional / tuple form. Accept both
        # list and tuple — the original `isinstance(attrs, list)` check
        # rejected every real stake event silently.
        if not isinstance(attrs, (list, tuple)) or len(attrs) < 5:
            return None

        coldkey_ss58 = str(attrs[0])
        hotkey_ss58  = str(attrs[1])
        tao_rao      = int(attrs[2] or 0)
        # attrs[3] = alpha_units (unused in canonical event)
        netuid       = int(attrs[4] if attrs[4] is not None else -1)

        if tao_rao <= 0:
            return None

        amount_tao = tao_rao / RAO_PER_TAO
        amount_usd = round(amount_tao * _current_tao_usd(), 2)

        if event_id == "StakeAdded":
            action    = "DELEGATE"
            direction = "in"
        elif event_id == "StakeRemoved":
            action    = "UNDELEGATE"
            direction = "out"
        else:
            return None

        ext_idx = raw.get("extrinsic_idx", event.get("extrinsic_idx", 0))

        # Dedup id MUST be unique. block_number is unique across blocks,
        # `position` (the enumerate index over the get_events() list) is
        # unique within a block. Together = globally unique.
        ev_id = f"{block_number}-{position}"

        return {
            "id":              ev_id,
            "extrinsic_id":    f"{block_number}-{ext_idx}",
            "block_number":    block_number,
            "timestamp":       _iso_from_unix(ts_unix),
            "ts_unix":         ts_unix,
            "action":          action,
            "direction":       direction,
            "nominator_ss58":  _short_ss58(coldkey_ss58),
            "nominator_full":  coldkey_ss58,
            "delegate_ss58":   _short_ss58(hotkey_ss58),
            "delegate_full":   hotkey_ss58,
            "amount_tao":      round(amount_tao, 6),
            "amount_usd":      amount_usd,
            "alpha_price_usd": 0.0,
            "netuid":          netuid,
        }
    except Exception as e:  # pragma: no cover — defensive
        logger.debug(f"whale_flow: skipping malformed stake event ({e}): {raw!r:.200}")
        return None


# ── Service ──────────────────────────────────────────────────────────────────


class WhaleFlowService:
    """Singleton WS subscriber on Finney for stake events.

    Architectural shape mirrors the original poller (cex_listing_service
    family) so the service registers, persists, and heartbeats the same
    way every other service does:

    * single ``asyncio`` task driven by ``_run_subscribe_loop``
    * ring buffer of recent normalised events (newest first)
    * disk cache for redeploy-survivability
    * ``system_health`` heartbeat per finalized block
    * alert push on threshold-crossing single events
    """

    def __init__(self) -> None:
        self._lock          = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None
        self._stop          = asyncio.Event()
        self._events: List[Dict[str, Any]] = []   # newest first
        self._seen_ids: set = set()
        self._last_fetch_at: float = 0.0
        self._last_block_seen: int = 0
        self._last_error:  Optional[str] = None
        self._connected:   bool = False
        # No API key required — chain RPC is keyless. ``configured`` stays
        # True so the frontend's legacy "set TAOSTATS_API_KEY" CTA is
        # never triggered. ``stale`` carries the "we have not yet
        # received a fresh block" signal instead.
        self._configured:  bool = True
        self._hydrate_from_disk()

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run_subscribe_loop())
        logger.info(
            f"WhaleFlowService started — endpoint={FINNEY_WSS_URL} "
            f"cache={CACHE_PATH} min_tao={DEFAULT_MIN_TAO} "
            f"buffer_hydrated={len(self._events)}"
        )

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=5.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                pass
            self._task = None

    # ── Public read API ───────────────────────────────────────────────────────

    def snapshot(self) -> Dict[str, Any]:
        """Cheap, no-I/O view of current ring buffer + connection state."""
        return {
            "configured":  self._configured,
            "fetched_at":  _iso_from_unix(int(self._last_fetch_at)) or None,
            "event_count": len(self._events),
            "min_tao":     DEFAULT_MIN_TAO,
            "stale":       self._is_stale(),
            "last_error":  self._last_error,
            "connected":   self._connected,
            "last_block":  self._last_block_seen,
            "endpoint":    FINNEY_WSS_URL,
        }

    def events_for_subnet(
        self,
        netuid: Optional[int],
        window: str = "1w",
        limit: int  = 50,
        min_tao: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """Filter the ring buffer.

        ``netuid=None`` returns events across all subnets.
        ``netuid=0`` is *root subnet* — a valid filter value, do not
        coerce to falsy.
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
        # Stale = no fresh block in 60 s (~5× expected block-time).
        # Catches WS hung connections without flapping on normal pauses.
        if self._last_fetch_at == 0.0:
            return True
        return (time.time() - self._last_fetch_at) > 60

    @staticmethod
    def _cutoff_unix(window: str) -> int:
        secs = _WINDOW_SECONDS.get(window, _WINDOW_SECONDS["1w"])
        return int(time.time()) - secs

    async def _run_subscribe_loop(self) -> None:
        """Outer reconnect loop. Each iteration opens a fresh WS,
        subscribes, and runs until the connection drops or stop is
        signaled. Backoff is exponential with a hard cap.

        NB: ``subscribe_block_headers`` is itself a long-running coroutine
        — it returns only when our handler returns non-None or when the
        connection drops. We use that to drive the reconnect cycle.
        """
        # Lazy import — async_substrate_interface lives in bittensor's
        # transitive dep graph and may not always be installed in
        # local-dev / sandboxed environments. Failing soft here keeps
        # the rest of the backend bootable.
        try:
            from async_substrate_interface import AsyncSubstrateInterface  # type: ignore
        except Exception as e:
            self._last_error = f"async_substrate_interface unavailable: {e}"
            logger.error(f"whale_flow: cannot import substrate library — {e}")
            self._heartbeat(time.time(), success=False, error=self._last_error)
            return

        # Brief grace window so boot settles before we start hammering RPC.
        await asyncio.sleep(7)

        backoff = RECONNECT_BACKOFF_INITIAL
        while not self._stop.is_set():
            substrate = None
            try:
                substrate = AsyncSubstrateInterface(url=FINNEY_WSS_URL)
                async with substrate:
                    self._connected = True
                    self._last_error = None
                    backoff = RECONNECT_BACKOFF_INITIAL  # reset on connect
                    logger.info(
                        f"whale_flow: subscribed to Finney finalized heads "
                        f"({FINNEY_WSS_URL})"
                    )
                    handler = self._make_handler(substrate)
                    # subscribe_block_headers blocks until handler returns
                    # non-None (we return non-None when stop is signaled).
                    await substrate.subscribe_block_headers(
                        handler,
                        finalized_only=True,
                    )
                # Subscription returned cleanly (stop signaled).
                self._connected = False
                if self._stop.is_set():
                    break
                # Otherwise treat as a normal-exit reconnect.
                logger.info("whale_flow: subscription returned, reconnecting")
            except asyncio.CancelledError:
                self._connected = False
                raise
            except Exception as e:
                self._connected = False
                err = f"WS error: {type(e).__name__}: {e}"
                self._last_error = err[:200]
                logger.warning(
                    f"whale_flow: connection dropped — {err} — "
                    f"reconnect in {backoff:.1f}s"
                )
                self._heartbeat(time.time(), success=False, error=err[:200])

            # Wait with stop-awareness. Returns early if stop is signaled.
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=backoff)
                # If we get here, stop was signaled — exit loop.
                break
            except asyncio.TimeoutError:
                pass
            backoff = min(backoff * 2, RECONNECT_BACKOFF_MAX)

        self._connected = False
        logger.info("whale_flow: subscribe loop exited")

    def _make_handler(self, substrate):
        """Build a per-connection handler closure. Returning non-None
        tells subscribe_block_headers to unsubscribe — we use that to
        drain on stop.

        Signature flexibility: ``async-substrate-interface`` v2.x calls
        the handler with a single positional arg (the block header
        object). Older docs / older versions pass three (obj, update_nr,
        subscription_id). We accept both via ``*args`` so a future
        library version that adds args won't silently break us.
        """
        async def handler(obj, *args, **kwargs):
            if self._stop.is_set():
                return "stop"
            try:
                await self._on_block(substrate, obj)
            except Exception as e:
                # Defensive — never let a single block break the stream.
                logger.warning(f"whale_flow handler error: {e}")
            return None
        return handler

    async def _on_block(self, substrate, header_obj: Dict[str, Any]) -> None:
        """Process events for one finalized block.

        The header object delivered by ``subscribe_block_headers`` does
        NOT carry a ``hash`` field (verified against
        ``async-substrate-interface`` v2.0.4 source: ``block_data_hash``
        is only injected on non-subscribe paths). We resolve the hash
        from the block number via ``get_block_hash`` — one extra RPC
        per block, fine at ~12 s cadence.
        """
        t0 = time.time()
        header = header_obj.get("header") or header_obj

        # Block number arrives as int or hex string depending on decoder.
        bn_raw = header.get("number", 0)
        if isinstance(bn_raw, str):
            block_number = int(bn_raw, 16) if bn_raw.startswith("0x") else int(bn_raw)
        else:
            block_number = int(bn_raw or 0)
        if not block_number:
            return

        # Resolve block hash from block number (subscription path doesn't
        # provide it directly).
        try:
            block_hash = await substrate.get_block_hash(block_number)
        except Exception as e:
            err = f"get_block_hash failed at block {block_number}: {e}"
            logger.warning(f"whale_flow: {err}")
            self._heartbeat(t0, success=False, error=err[:200])
            return
        if not block_hash:
            return

        # Block timestamp — use wall clock. The chain's own Timestamp.Now
        # storage is exactly accurate but adds an RPC; finalised blocks
        # are at most ~12 s old by the time we see them, so wall clock
        # is well within human-readable accuracy and saves a round trip.
        ts_unix = int(time.time())

        # Pull events for this block.
        try:
            events = await substrate.get_events(block_hash=block_hash)
        except Exception as e:
            err = f"get_events failed at block {block_number}: {e}"
            logger.warning(f"whale_flow: {err}")
            self._heartbeat(t0, success=False, error=err[:200])
            return

        new_events: List[Dict[str, Any]] = []
        async with self._lock:
            for position, raw_ev in enumerate(events):
                event_block = raw_ev.get("event") or {}
                module_id = event_block.get("module_id") or raw_ev.get("module_id")
                event_id  = event_block.get("event_id")  or raw_ev.get("event_id")
                if module_id != "SubtensorModule":
                    continue
                if event_id not in ("StakeAdded", "StakeRemoved"):
                    continue
                normalised = _normalise_stake_event(
                    raw_ev,
                    block_number=block_number,
                    ts_unix=ts_unix,
                    position=position,
                )
                if normalised is None:
                    continue
                if normalised["amount_tao"] < DEFAULT_MIN_TAO:
                    continue
                if normalised["id"] in self._seen_ids:
                    continue
                new_events.append(normalised)
                self._seen_ids.add(normalised["id"])

            if new_events:
                # Newest first: finalised blocks arrive in order, so
                # prepend the new batch.
                self._events = (new_events + self._events)[:MAX_EVENTS]
                if len(self._seen_ids) > MAX_EVENTS * 4:
                    self._seen_ids = set(e["id"] for e in self._events)
                self._fire_alerts(new_events)
                self._persist()
                logger.info(
                    f"whale_flow: +{len(new_events)} new event(s) at block "
                    f"{block_number} — buffer={len(self._events)}"
                )

            self._last_block_seen = block_number
            self._last_fetch_at = time.time()

        self._heartbeat(t0, success=True, error=None)

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
                "last_block":     self._last_block_seen,
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
                self._last_block_seen = int(payload.get("last_block") or 0)
                logger.info(
                    f"WhaleFlowService: hydrated {len(self._events)} events "
                    f"from {CACHE_PATH} (last_block={self._last_block_seen})"
                )
        except Exception as e:
            logger.warning(f"whale_flow hydrate failed: {e}")


# Singleton
whale_flow_service = WhaleFlowService()