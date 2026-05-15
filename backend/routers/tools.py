"""
Operator Tools router — Whale Tracker + TAO Calculator.

Three endpoint families under ``/api/tools``:

* GET  /api/tools/whales              → top-N TAO holder leaderboard
* GET  /api/tools/calc/quote          → live TAO price + multi-fiat conversions
* GET  /api/tools/calc/historical     → TAO/USD on a specific date (CoinGecko)
* GET  /api/tools/calc/chart          → recent OHLCV-lite for the calc tab

Session XXXIII addition.  Designed to be self-contained: the whale tracker
fails closed (configured=False payload) when no TAOSTATS_API_KEY is set, and
historical lookups proxy CoinGecko's free public endpoint with a small
in-memory LRU.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

from services.price_service import price_service
from services.whale_service import whale_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tools", tags=["tools"])

# ── Tunables ────────────────────────────────────────────────────────────────
COINGECKO_BASE = "https://api.coingecko.com/api/v3"
TAO_CG_ID      = "bittensor"

# Tiny in-memory historical cache: { "DD-MM-YYYY": (fetched_at, price_usd) }
_HISTORICAL_CACHE: Dict[str, Dict[str, Any]] = {}
_HISTORICAL_TTL_S = 60 * 60 * 6   # 6 h — historical data doesn't change


# ════════════════════════════════════════════════════════════════════════════
# WHALES
# ════════════════════════════════════════════════════════════════════════════

@router.get("/whales")
async def whales_leaderboard(
    limit: int = Query(100, ge=1, le=100, description="Top-N wallets"),
    tier:  Optional[str] = Query(None, regex="^(whale|dolphin|shrimp)$"),
    refresh: bool = Query(False, description="Force re-fetch from TaoStats"),
):
    """
    Top-N TAO holder leaderboard.

    Returns ``configured=False`` and a ``setup_hint`` if ``TAOSTATS_API_KEY``
    is missing — the frontend renders a friendly empty-state instead of
    crashing.

    Optional ``tier`` filter narrows the result set to whales / dolphins /
    shrimp using the standard >1% / 0.1–1% / <0.1% supply tiering.
    """
    payload = await whale_service.snapshot(limit=limit, force=refresh)
    if tier and payload.get("leaderboard"):
        filtered = [r for r in payload["leaderboard"] if r["tier"] == tier]
        payload = {**payload, "leaderboard": filtered, "filtered_tier": tier, "filtered_count": len(filtered)}
    return payload


@router.get("/whales/cache-status")
async def whales_cache_status():
    """
    Diagnostic for the whale-cache disk persistence (carry-over #5 + #10).

    Used to verify a Railway volume mount: after attaching a volume at
    /data, this endpoint should report `cache_path` rooted there and
    `exists=true` once at least one successful refresh has run.
    """
    from services.whale_service import CACHE_PATH
    import os, time
    info: Dict[str, Any] = {
        "cache_path":   str(CACHE_PATH),
        "exists":       CACHE_PATH.exists(),
        "writable_dir": os.access(CACHE_PATH.parent, os.W_OK) if CACHE_PATH.parent.exists() else False,
        "is_volume":    str(CACHE_PATH).startswith("/data/"),
    }
    if info["exists"]:
        try:
            stat = CACHE_PATH.stat()
            info["size_bytes"] = stat.st_size
            info["mtime"]      = int(stat.st_mtime)
            info["age_s"]      = max(0, int(time.time() - stat.st_mtime))
        except Exception as e:    # noqa: BLE001
            info["stat_error"] = str(e)
    return info


# ════════════════════════════════════════════════════════════════════════════
# CALCULATOR
# ════════════════════════════════════════════════════════════════════════════

# Hard-coded fallback cross-rates — used when CoinGecko's per-call fiat
# normalisation isn't available.  These get refreshed any time `/quote` or
# `/historical` is hit with a non-USD currency.
_FIAT_RATES_FALLBACK = {
    "usd": 1.0,
    "eur": 0.92,
    "gbp": 0.79,
    "jpy": 156.0,
    "btc": 1 / 65_000.0,  # very rough — only used if CoinGecko denies us
}
_FIAT_CACHE: Dict[str, Any] = {"fetched_at": 0.0, "rates": dict(_FIAT_RATES_FALLBACK)}


async def _cross_rate(target: str) -> float:
    """USD→target multiplier, cached 5 min from CoinGecko `/exchange_rates`."""
    target = target.lower()
    if target == "usd":
        return 1.0
    import time
    if (time.time() - _FIAT_CACHE["fetched_at"]) < 300 and target in _FIAT_CACHE["rates"]:
        return _FIAT_CACHE["rates"][target]
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            # Use simple price endpoint instead of exchange_rates (more reliable for fiats)
            r = await client.get(
                f"{COINGECKO_BASE}/simple/price",
                params={"ids": "tether", "vs_currencies": "usd,eur,gbp,jpy,btc"},
            )
            r.raise_for_status()
            data = r.json().get("tether", {})
            # USDT≈1 USD, so the values *are* the USD→fiat rates.
            new_rates = {k: float(v) for k, v in data.items() if v}
            new_rates.setdefault("usd", 1.0)
            _FIAT_CACHE["rates"]      = {**_FIAT_CACHE["rates"], **new_rates}
            _FIAT_CACHE["fetched_at"] = time.time()
    except Exception as e:
        logger.debug(f"cross-rate fetch failed, using fallback: {e}")
    return _FIAT_CACHE["rates"].get(target, _FIAT_RATES_FALLBACK.get(target, 1.0))


@router.get("/calc/quote")
async def calc_quote(
    amount:    float = Query(1.0, ge=0, description="TAO amount"),
    currency:  str   = Query("usd", regex="^(usd|eur|gbp|jpy|btc)$"),
):
    """
    Current TAO price + the ``amount`` × price conversion in the requested
    fiat (or BTC). Reuses the existing PriceService 30-s polling loop so we
    don't hammer CoinGecko per request.
    """
    px_usd = price_service.current_price
    pdata  = price_service.price_data or {}
    if px_usd is None:
        raise HTTPException(503, detail="TAO price not available yet — service still warming up")

    rate = await _cross_rate(currency)
    px_target  = px_usd * rate
    converted  = amount * px_target

    return {
        "tao_amount":       amount,
        "currency":         currency.upper(),
        "tao_price_usd":    px_usd,
        "tao_price_target": round(px_target, 6),
        "converted_amount": round(converted, 6),
        "fx_rate":          rate,
        "market_cap":       pdata.get("market_cap"),
        "volume_24h":       pdata.get("volume_24h"),
        "price_change_24h": pdata.get("price_change_24h"),
        "fetched_at":       int(datetime.now(timezone.utc).timestamp()),
    }


@router.get("/calc/historical")
async def calc_historical(
    date:      str   = Query(..., regex=r"^\d{4}-\d{2}-\d{2}$", description="ISO date YYYY-MM-DD"),
    amount:    float = Query(1.0, ge=0),
    currency:  str   = Query("usd", regex="^(usd|eur|gbp|jpy|btc)$"),
):
    """
    Historical TAO price for a given date (UTC) via CoinGecko's
    ``/coins/{id}/history`` endpoint.  Returns the close-of-day USD price
    plus a derived conversion in the requested target currency.

    CoinGecko expects DD-MM-YYYY, so we convert ISO → CG format internally.
    """
    try:
        d = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(400, detail="Invalid date — must be YYYY-MM-DD")

    today = datetime.now(timezone.utc).date()
    if d.date() > today:
        raise HTTPException(400, detail="Date is in the future")

    cg_date = d.strftime("%d-%m-%Y")
    import time
    cached = _HISTORICAL_CACHE.get(cg_date)
    if cached and (time.time() - cached["fetched_at"]) < _HISTORICAL_TTL_S:
        price_usd = cached["price_usd"]
        market_cap = cached.get("market_cap")
        total_volume = cached.get("total_volume")
    else:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.get(
                    f"{COINGECKO_BASE}/coins/{TAO_CG_ID}/history",
                    params={"date": cg_date, "localization": "false"},
                )
                r.raise_for_status()
                data = r.json()
            mp = (data.get("market_data") or {}).get("current_price") or {}
            price_usd = float(mp.get("usd", 0.0)) if mp.get("usd") is not None else None
            market_cap = (data.get("market_data") or {}).get("market_cap", {}).get("usd")
            total_volume = (data.get("market_data") or {}).get("total_volume", {}).get("usd")
            if price_usd is None or price_usd <= 0:
                raise HTTPException(404, detail=f"No TAO price data for {date}")
            _HISTORICAL_CACHE[cg_date] = {
                "fetched_at":   time.time(),
                "price_usd":    price_usd,
                "market_cap":   market_cap,
                "total_volume": total_volume,
            }
        except HTTPException:
            raise
        except httpx.HTTPStatusError as e:
            raise HTTPException(e.response.status_code, detail=f"CoinGecko error: {e.response.text[:120]}")
        except Exception as e:
            raise HTTPException(502, detail=f"Failed to fetch historical price: {e}")

    rate = await _cross_rate(currency)
    px_target = price_usd * rate
    converted = amount * px_target

    px_now = price_service.current_price or 0.0
    delta_pct = ((px_now - price_usd) / price_usd * 100.0) if price_usd > 0 else None

    return {
        "date":             date,
        "tao_amount":       amount,
        "currency":         currency.upper(),
        "price_usd_on_date": round(price_usd, 6),
        "price_target_on_date": round(px_target, 6),
        "converted_amount": round(converted, 6),
        "current_price_usd": round(px_now, 6) if px_now else None,
        "delta_pct_since":  round(delta_pct, 2) if delta_pct is not None else None,
        "market_cap_on_date": market_cap,
        "volume_on_date":   total_volume,
        "fx_rate":          rate,
    }


@router.get("/calc/chart")
async def calc_chart(days: int = Query(7, ge=1, le=365)):
    """
    Lightweight OHLCV-lite series for the calculator's price-chart card.
    Reuses ``price_service.fetch_ohlcv`` so we don't open a second pipe to
    CoinGecko.
    """
    series = await price_service.fetch_ohlcv(days=days)
    if not series:
        return {"days": days, "data": [], "error": "no data"}
    return {
        "days":      days,
        "count":     len(series),
        "first":     series[0]["price"] if series else None,
        "last":      series[-1]["price"] if series else None,
        "min_price": min(p["price"] for p in series),
        "max_price": max(p["price"] for p in series),
        "data":      series,
    }