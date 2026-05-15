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
import logging
import os
import time
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

    # ── Public ─────────────────────────────────────────────────────────────

    async def snapshot(self, limit: int = DEFAULT_LIMIT, force: bool = False) -> Dict[str, Any]:
        """Return a cached payload; refresh if stale or requested."""
        if not _api_key():
            return self._unconfigured_payload(limit)

        now = time.time()
        is_stale = (now - self._last_fetch_at) > REFRESH_INTERVAL
        if force or is_stale or self._last_payload is None:
            async with self._lock:
                # Double-check after lock — another caller may have refreshed.
                if force or (time.time() - self._last_fetch_at) > REFRESH_INTERVAL or self._last_payload is None:
                    await self._refresh(limit)

        if self._last_payload is None:
            return self._error_payload(limit, self._last_error or "no data yet")
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
        logger.info(f"WhaleService refreshed: {len(leaderboard)} wallets, {round(share_total,2)}% supply tracked")

    # ── Fallbacks ──────────────────────────────────────────────────────────

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