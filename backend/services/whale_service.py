"""
Whale Tracker Service
=====================

Pulls the top-N TAO holder leaderboard from TaoStats Pro API and exposes a
clean, cached snapshot to the frontend.

Why this lives here (Session XXXIII)
------------------------------------
Whale flow is a leading signal for stake redirection events: when a top-100
coldkey rebalances 5–10K τ across subnets, that movement front-runs price
discovery on the affected α pools by hours.  Surfacing the leaderboard +
24-hour deltas lets the operator eyeball the shifts and feeds the dataset
that the consensus stack will consume in a future session.

Data path
---------
* Primary: ``GET https://api.taostats.io/api/account/v1`` ordered by
  ``balance_total:desc`` (requires ``TAOSTATS_API_KEY`` — same key already
  used by ``routers/wallet.py`` for transfer history).
* Cache: in-memory snapshot refreshed every ``REFRESH_INTERVAL`` seconds
  on first read; instantaneous reads thereafter.  Backend never blocks
  on TaoStats during a UI poll.
* Total supply for share calc: derived from TaoStats response when the
  payload exposes ``total_supply``; otherwise falls back to the hard
  Bittensor cap (21 M) which gives a conservative-low share %.
* Graceful degradation: if no API key is configured, ``snapshot()``
  returns an explicit ``configured=False`` payload so the frontend can
  render a setup CTA instead of an error toast.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# ── Tunables ────────────────────────────────────────────────────────────────
TAOSTATS_BASE     = "https://api.taostats.io"
DEFAULT_LIMIT     = 100
REFRESH_INTERVAL  = 90      # seconds — TaoStats free tier is rate-limited
HTTP_TIMEOUT_S    = 12.0
# Bittensor max supply (21 M TAO) — used when TaoStats payload omits total
TAO_MAX_SUPPLY    = 21_000_000.0

# ── Persistent cache (Session XXXIV carry-overs #5 + #10) ───────────────────
# When TaoStats credits are exhausted (HTTP 429) or the upstream is otherwise
# unreachable, we still want the Whale Tracker page to render the most recent
# good snapshot rather than an empty error state.  We considered a Subscan
# fallback first, but Subscan does not actually run a Bittensor explorer
# instance (bittensor.api.subscan.io 404s on every endpoint).  TaoStats is
# the canonical Bittensor explorer, full stop.
#
# Solution: persist the last successful snapshot to disk and serve it with a
# `stale=True` flag when upstream fails.
#
# Path resolution (most-specific → least-specific):
#   1. WHALE_CACHE_PATH        — explicit override (e.g. "/data/whale.json")
#   2. DATA_DIR                — Railway-volume mount root (e.g. "/data");
#                                we append "whale_cache.json" automatically
#   3. /data/whale_cache.json  — auto-detected if /data exists & is writable
#                                (zero-config Railway volume support)
#   4. backend/data/whale_cache.json  — local-dev fallback, lives in the repo
#
# Operator setup for Railway (carry-over #5): in the backend service's
# Settings → Volumes, attach a 1 GB volume mounted at /data.  No code
# change is needed afterwards — the auto-detect (rule 3) will start
# writing whale_cache.json there on the next deploy and the disk cache
# will survive redeploys.
DEFAULT_CACHE_PATH = "backend/data/whale_cache.json"


def _resolve_cache_path() -> Path:
    explicit = os.environ.get("WHALE_CACHE_PATH", "").strip()
    if explicit:
        return Path(explicit)

    data_dir = os.environ.get("DATA_DIR", "").strip()
    if data_dir:
        return Path(data_dir) / "whale_cache.json"

    # Auto-detect a mounted Railway volume at /data.  We check writability
    # too (volumes mounted readonly should fall back to the in-repo path).
    railway_volume = Path("/data")
    if railway_volume.is_dir() and os.access(railway_volume, os.W_OK):
        return railway_volume / "whale_cache.json"

    return Path(DEFAULT_CACHE_PATH)


CACHE_PATH = _resolve_cache_path()


def _api_key() -> str:
    return (os.environ.get("TAOSTATS_API_KEY") or "").strip()


def _classify(share_pct: float) -> str:
    """Whale / Dolphin / Shrimp tiering — matches industry convention."""
    if share_pct >= 1.0:
        return "whale"
    if share_pct >= 0.1:
        return "dolphin"
    return "shrimp"


def _short_addr(addr: str) -> str:
    if not addr or len(addr) < 12:
        return addr or ""
    return f"{addr[:6]}…{addr[-4:]}"


class WhaleService:
    """
    Singleton snapshot of the top-N TAO holders.

    Public surface:
        await snapshot(limit=100)  → {configured, fetched_at, count, total_supply,
                                      top_balance, kpi, leaderboard:[{rank,address,...}]}
    """

    def __init__(self) -> None:
        self._lock          = asyncio.Lock()
        self._last_payload: Optional[Dict[str, Any]] = None
        self._last_fetch_at: float = 0.0
        self._last_error:  Optional[str] = None
        # Hydrate from disk so a fresh process after redeploy starts with the
        # most recent good snapshot rather than an empty leaderboard.
        self._hydrate_from_disk()

    # ── Public ─────────────────────────────────────────────────────────────

    async def snapshot(self, limit: int = DEFAULT_LIMIT, force: bool = False) -> Dict[str, Any]:
        """Return a cached payload; refresh if stale or requested."""
        if not _api_key():
            # Even without a key we may still have a disk cache from a prior
            # deployment that DID have a key — surface it as stale so the
            # Operator sees real data instead of a setup screen.
            if self._last_payload is not None:
                return self._stale_payload("api_key_missing")
            return self._unconfigured_payload(limit)

        now = time.time()
        is_stale = (now - self._last_fetch_at) > REFRESH_INTERVAL
        if force or is_stale or self._last_payload is None:
            async with self._lock:
                # Double-check after lock — another caller may have refreshed.
                if force or (time.time() - self._last_fetch_at) > REFRESH_INTERVAL or self._last_payload is None:
                    _t0 = time.time()
                    await self._refresh(limit)
                    # Session XXXIV — record_run for system_health observability.
                    try:
                        from services.system_health_service import system_health
                        system_health.record_run(
                            name="whale_service",
                            success=(self._last_error is None),
                            error=self._last_error,
                            duration_ms=round((time.time() - _t0) * 1000.0, 1),
                        )
                    except Exception:
                        pass

        if self._last_payload is None:
            return self._error_payload(limit, self._last_error or "no data yet")
        # If the most recent refresh attempt failed but we still have data
        # from a previous successful fetch, mark the payload stale so the UI
        # can render a "data-frozen" badge.
        if self._last_error:
            return self._stale_payload(self._last_error)
        return self._last_payload

    # ── Internal ───────────────────────────────────────────────────────────

    async def _refresh(self, limit: int) -> None:
        # Endpoint per docs.taostats.io/reference/get-account:
        #   /api/account/latest/v1?order=balance_total_desc&limit=N
        # Note: ordering uses underscore_desc (not colon syntax) and the
        # path is /latest/v1 (not /v1).
        url = f"{TAOSTATS_BASE}/api/account/latest/v1"
        params = {
            "network": "finney",
            "order":   "balance_total_desc",
            "page":    "1",
            "limit":   str(min(max(limit, 1), 200)),  # max per docs is 200
        }
        headers = {
            "Accept": "application/json",
            "User-Agent": "TAO-Bot/1.0 (whale-tracker)",
            "Authorization": _api_key(),
        }

        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_S) as client:
                resp = await client.get(url, params=params, headers=headers)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            self._last_error = f"taostats {e.response.status_code}: {e.response.text[:120]}"
            logger.warning(f"WhaleService refresh failed: {self._last_error}")
            return
        except Exception as e:
            self._last_error = f"network: {e}"
            logger.warning(f"WhaleService refresh failed: {self._last_error}")
            return

        # ── Normalise payload ────────────────────────────────────────────────
        # Schema per docs.taostats.io/reference/get-account:
        #   { "pagination": {...}, "data": [
        #       { "address": {"ss58": "5...", "hex": "0x..."},
        #         "rank": 1,
        #         "balance_total":          "868823010835513",   ← rao string
        #         "balance_total_24hr_ago": null | "<rao string>",
        #         "balance_free":           "...", "balance_staked": "...",
        #         ...
        #       }, ... ]
        #   }
        rows = data.get("data") if isinstance(data, dict) else data
        if not isinstance(rows, list):
            rows = []

        # Total supply not present on this endpoint — fall back to 21 M cap.
        total_supply = TAO_MAX_SUPPLY

        leaderboard: List[Dict[str, Any]] = []
        cumulative_tao = 0.0
        for idx, raw in enumerate(rows, start=1):
            # Address is a nested {"ss58": "...", "hex": "..."} object
            addr_field = raw.get("address")
            if isinstance(addr_field, dict):
                addr = addr_field.get("ss58") or addr_field.get("hex") or ""
            else:
                addr = addr_field or raw.get("ss58") or raw.get("hotkey") or ""

            # balance_total is a string in rao — always divide by 1e9 for TAO
            balance_tao_opt = _rao_string_to_tao(raw.get("balance_total"))
            balance_24h_ago = _rao_string_to_tao(raw.get("balance_total_24hr_ago"))
            balance_tao = balance_tao_opt or 0.0   # treat null as 0 for math

            # Δ vs 24h ago, expressed in TAO (positive = accumulation, negative = sell)
            delta_24h_tao = (
                round(balance_tao - balance_24h_ago, 4)
                if balance_24h_ago is not None and balance_tao_opt is not None
                else None
            )

            share_pct = (balance_tao / total_supply * 100.0) if total_supply > 0 else 0.0
            cumulative_tao += balance_tao

            # Server gives us `rank`; fall back to enumeration index.
            rank = _safe_int(raw.get("rank"), default=idx) or idx

            leaderboard.append({
                "rank":               rank,
                "address":            addr,
                "address_short":      _short_addr(addr),
                "balance_tao":        round(balance_tao, 4),
                "balance_24h_ago_tao": round(balance_24h_ago, 4) if balance_24h_ago is not None else None,
                "share_pct":          round(share_pct, 4),
                "tier":               _classify(share_pct),
                "balance_change_24h": delta_24h_tao,
                "rank_change_24h":    _safe_int(raw.get("rank_change_24hr"), default=None),
                "block_number":       _safe_int(raw.get("block_number"), default=None),
                "taostats_url":       f"https://taostats.io/account/{addr}" if addr else None,
            })

        # KPI summary
        whales   = sum(1 for r in leaderboard if r["tier"] == "whale")
        dolphins = sum(1 for r in leaderboard if r["tier"] == "dolphin")
        shrimp   = sum(1 for r in leaderboard if r["tier"] == "shrimp")
        share_total = sum(r["share_pct"] for r in leaderboard)

        from services.price_service import price_service as _ps
        px = _ps.current_price or 0.0

        self._last_payload = {
            "configured":   True,
            "fetched_at":   int(time.time()),
            "count":        len(leaderboard),
            "total_supply": round(total_supply, 2),
            "tao_price_usd": px,
            "kpi": {
                "tracked_wallets": len(leaderboard),
                "total_tao":       round(cumulative_tao, 2),
                "share_pct":       round(share_total, 3),
                "usd_value":       round(cumulative_tao * px, 2) if px else None,
                "whales":          whales,
                "dolphins":        dolphins,
                "shrimp":          shrimp,
                "top_balance_tao": leaderboard[0]["balance_tao"] if leaderboard else 0.0,
            },
            "leaderboard": leaderboard,
        }
        self._last_fetch_at = time.time()
        self._last_error    = None
        # Persist the fresh snapshot to disk so we can survive restarts and
        # credit-out windows without rendering an empty leaderboard.
        self._persist_to_disk()
        logger.info(f"WhaleService refreshed: {len(leaderboard)} wallets, {round(share_total,2)}% supply tracked")

    # ── Disk persistence (Session XXXIV) ───────────────────────────────────

    def _hydrate_from_disk(self) -> None:
        """Load the last persisted snapshot at process start.  Best-effort."""
        try:
            if not CACHE_PATH.exists():
                return
            raw = CACHE_PATH.read_text()
            if not raw.strip():
                return
            blob = json.loads(raw)
            payload = blob.get("payload")
            saved_at = float(blob.get("saved_at", 0.0))
            if isinstance(payload, dict) and payload.get("leaderboard"):
                self._last_payload  = payload
                self._last_fetch_at = saved_at
                age_s = max(0, int(time.time() - saved_at))
                logger.info(
                    f"WhaleService hydrated from disk cache: "
                    f"{len(payload['leaderboard'])} wallets, age={age_s}s"
                )
        except Exception as e:    # noqa: BLE001 — never fail startup over cache
            logger.warning(f"WhaleService disk hydrate failed (non-fatal): {e}")

    def _persist_to_disk(self) -> None:
        """Write the current snapshot to disk.  Best-effort."""
        if self._last_payload is None:
            return
        try:
            CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            blob = {
                "saved_at": time.time(),
                "schema_version": 1,
                "payload": self._last_payload,
            }
            tmp = CACHE_PATH.with_suffix(CACHE_PATH.suffix + ".tmp")
            tmp.write_text(json.dumps(blob, separators=(",", ":")))
            tmp.replace(CACHE_PATH)   # atomic on POSIX
        except Exception as e:        # noqa: BLE001
            logger.warning(f"WhaleService disk persist failed (non-fatal): {e}")

    # ── Fallbacks ──────────────────────────────────────────────────────────

    def _stale_payload(self, reason: str) -> Dict[str, Any]:
        """
        Return the most recent good snapshot but tagged stale + reason.
        Used when the upstream refresh failed (credits out, network) yet we
        still have a cached payload from an earlier successful fetch.
        """
        base = dict(self._last_payload or {})
        base["stale"]        = True
        base["stale_reason"] = reason
        base["stale_age_s"]  = max(0, int(time.time() - self._last_fetch_at))
        # Keep the leaderboard / KPI intact — only the metadata changes.
        return base

    def _unconfigured_payload(self, limit: int) -> Dict[str, Any]:
        return {
            "configured":   False,
            "fetched_at":   int(time.time()),
            "count":        0,
            "total_supply": TAO_MAX_SUPPLY,
            "tao_price_usd": 0.0,
            "kpi":          {},
            "leaderboard": [],
            "setup_hint":  (
                "Set TAOSTATS_API_KEY in the backend environment to enable the "
                "whale tracker. Free tier available at taostats.io/pro."
            ),
        }

    def _error_payload(self, limit: int, err: str) -> Dict[str, Any]:
        return {
            "configured":   True,
            "fetched_at":   int(time.time()),
            "count":        0,
            "total_supply": TAO_MAX_SUPPLY,
            "tao_price_usd": 0.0,
            "kpi":          {},
            "leaderboard": [],
            "error":        err,
        }


# ── helpers ─────────────────────────────────────────────────────────────────

def _rao_string_to_tao(v: Any) -> Optional[float]:
    """
    Convert a TaoStats rao field (string or number, possibly null) to TAO float.
    Returns None when the input is null/empty/unparseable. Always divides by
    1e9 since this endpoint encodes balances in rao without exception.
    """
    if v is None or v == "":
        return None
    try:
        return float(v) / 1e9
    except Exception:
        return None


def _safe_float(v: Any, default: Optional[float] = None) -> Optional[float]:
    try:
        if v is None or v == "":
            return default
        return float(v)
    except Exception:
        return default


def _safe_int(v: Any, default: Optional[int] = None) -> Optional[int]:
    try:
        if v is None or v == "":
            return default
        return int(v)
    except Exception:
        return default


# Singleton
whale_service = WhaleService()