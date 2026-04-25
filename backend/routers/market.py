"""
Market Data router — Bittensor subnet table.

Data priority:
  1. Real on-chain data via SubnetCacheService (alpha prices + metagraph).
  2. Simulated random-walk fallback for subnets not yet fetched or when
     the chain is unreachable.

Trend signals are derived from real alpha price movement (current vs
previous snapshot) for every subnet the cache has seen.  Stake, miners,
and APY are real for TRADING_NETUIDS; simulated for display-only subnets.
"""
import math
import random
import time
import logging
from datetime import datetime
from fastapi import APIRouter, Query
from services.price_service import price_service
from services.subnet_cache_service import subnet_cache_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/market", tags=["market"])

# ── Subnet static metadata ────────────────────────────────────────────────────
# Subnet names from Bittensor docs (first 64 active subnets)
SUBNET_META = {
    1:  ("Text Prompting",          "apex"),
    2:  ("Machine Translation",     "translate"),
    3:  ("MyShell TTS",             "myshell"),
    4:  ("Multi Modality",          "targon"),
    5:  ("Open Kaito",              "openkaito"),
    6:  ("Nous Research",           "nous"),
    7:  ("SubVortex",               "subvortex"),
    8:  ("Taoshi PTN",              "taoshi"),
    9:  ("Pretraining",             "pretrain"),
    10: ("Map Reduce",              "sturdy"),
    11: ("Dippy Roleplay",          "dippy"),
    12: ("Horde",                   "horde"),
    13: ("Dataverse",               "dataverse"),
    14: ("LLM Defender",            "llmdefender"),
    15: ("Human Intelligence",      "hivetrain"),
    16: ("BitAds",                  "bitads"),
    17: ("3D Gen",                  "3dgen"),
    18: ("Cortext",                 "cortex"),
    19: ("Nineteen",                "nineteen"),
    20: ("BitAgent",                "bitagent"),
    21: ("FileTAO",                 "filetao"),
    22: ("Desearch",                "desearch"),
    23: ("NichePT",                 "nichept"),
    24: ("Omega Labs",              "omega"),
    25: ("Protein Folding",         "folding"),
    26: ("Gradients AI",            "gradients"),
    27: ("Compute Horde",           "compute"),
    28: ("ZkTensor",                "zktensor"),
    29: ("Coldint",                 "coldint"),
    30: ("Bittensor Education",     "edu"),
    31: ("Nas Chain",               "naschain"),
    32: ("Itsai",                   "itsai"),
    33: ("Ready Player Me",         "readyplayer"),
    34: ("Logic",                   "logic"),
    35: ("Airtune",                 "airtune"),
    36: ("Automata",                "automata"),
    37: ("Finetuning",              "finetuning"),
    38: ("Tatsu",                   "tatsu"),
    39: ("EdgeMaxxing",             "edge"),
    40: ("ChainDual",               "chaindual"),
    41: ("Sportstensor",            "sportstensor"),
    42: ("Masa",                    "masa"),
    43: ("Graphite",                "graphite"),
    44: ("Dojo",                    "dojo"),
    45: ("GenLayer",                "genlayer"),
    46: ("NeuralAI",                "neuralaim"),
    47: ("Condense AI",             "condense"),
    48: ("Nextplace AI",            "nextplace"),
    49: ("AutoML",                  "automl"),
    50: ("Rdaemon",                 "rdaemon"),
    51: ("Celium",                  "celium"),
    52: ("GreenBit Labs",           "greenbit"),
    53: ("Manifold Finance",        "manifold"),
    54: ("Bit Mind",                "bitmind"),
    55: ("EINSTEIN AI",             "einstein"),
    56: ("Neural Condense",         "neurocondense"),
    57: ("Gaia",                    "gaia"),
    58: ("Dippy Bittensor",         "dippybt"),
    59: ("Agent Arena",             "agentarena"),
    60: ("RunPod",                  "runpod"),
    61: ("Red Team",                "redteam"),
    62: ("Storb",                   "storb"),
    63: ("Melting Pot",             "meltingpot"),
    64: ("Chutes",                  "chutes"),
    # Extended subnets — trading targets beyond the original display range
    96: ("Subnet 96",               "sn96"),
}

# Deterministic base stats per subnet (seeded so they don't flicker wildly)
# Used as fallback when real chain data is unavailable.
_rng = random.Random(42)

# Cover all UIDs that may be displayed or traded (1-64 + extended trading targets)
_DISPLAY_UIDS = list(range(1, 65)) + sorted(
    uid for uid in SUBNET_META if uid > 64
)

_BASE: dict[int, dict] = {}
for uid in _DISPLAY_UIDS:
    base_stake    = _rng.uniform(10_000, 2_000_000)
    base_emission = _rng.uniform(0.001, 0.04)
    base_apy      = _rng.uniform(8.0, 48.0)
    active_miners = _rng.randint(5, 256)
    _BASE[uid] = {
        "stake":    base_stake,
        "emission": base_emission,
        "apy":      base_apy,
        "miners":   active_miners,
    }

def _live_subnet(uid: int, tao_price: float) -> dict:
    """
    Return subnet data, preferring real on-chain values where available.

    Data source hierarchy:
      - stake_tao / miners / emission / apy: real metagraph (TRADING_NETUIDS)
        or seeded simulation (display-only subnets).
      - trend: real alpha price movement if the cache has two snapshots,
        otherwise derived from simulation noise.
      - score: always computed fresh from whichever stake/APY we resolved.
    """
    b = _BASE[uid]
    name, ticker = SUBNET_META.get(uid, (f"Subnet {uid}", f"sn{uid}"))

    # ── Try real metagraph data (trading subnets only) ────────────────────
    meta = subnet_cache_service.get_meta(uid)

    if meta and meta["stake_tao"] > 0:
        stake_tao = meta["stake_tao"]
        emission  = meta["emission"]
        apy       = meta["apy"]
        miners    = meta["miners"]
        data_src  = "live"
    else:
        # Simulated random walk on top of seeded base
        noise     = random.uniform(-0.03, 0.03)
        stake_tao = b["stake"]   * (1 + noise)
        emission  = b["emission"] * (1 + noise * 0.5)
        apy       = b["apy"]     * (1 + noise * 0.5)
        miners    = b["miners"]
        data_src  = "simulated"

    # ── Trend: real alpha price movement, fallback to noise ───────────────
    real_trend = subnet_cache_service.get_trend(uid)
    if real_trend is not None:
        trend    = real_trend
        data_src = "live" if data_src == "live" else "live_trend"
    else:
        # Derive from the noise that was already computed (or neutral if meta path)
        if data_src == "live":
            trend = "neutral"
        else:
            # noise is defined from the simulated branch above
            trend = "up" if noise > 0.01 else "down" if noise < -0.01 else "neutral"

    stake_usd = stake_tao * tao_price

    # Score = log₁₀(stake_tao) × 10 + APY
    score = math.log10(max(stake_tao, 1)) * 10 + apy
    score = round(score, 1)

    return {
        "uid":         uid,
        "name":        name,
        "ticker":      ticker,
        "stake_tao":   round(stake_tao, 2),
        "stake_usd":   round(stake_usd, 0),
        "emission":    round(emission, 8),
        "apy":         round(apy, 2),
        "miners":      miners,
        "trend":       trend,
        "score":       score,
        "data_source": data_src,   # "live" | "live_trend" | "simulated"
    }


@router.get("/subnets")
async def get_subnets(
    sort: str = Query("stake_tao", description="Field to sort by"),
    order: str = Query("desc", description="asc | desc"),
    min_apy: float = Query(0.0, description="Minimum APY filter"),
    search: str = Query("", description="Filter by subnet name"),
):
    """Return live subnet table for all known subnets."""
    tao_price = price_service.current_price or 250.0

    subnets = [_live_subnet(uid, tao_price) for uid in _DISPLAY_UIDS]

    # Apply filters
    if min_apy > 0:
        subnets = [s for s in subnets if s["apy"] >= min_apy]
    if search:
        subnets = [s for s in subnets if search.lower() in s["name"].lower() or search.lower() in s["ticker"]]

    # Sort
    reverse = order == "desc"
    if sort in ("stake_tao", "stake_usd", "emission", "apy", "miners", "score", "uid"):
        subnets.sort(key=lambda s: s[sort], reverse=reverse)

    live_count = sum(1 for s in subnets if s["data_source"] == "live")
    return {
        "subnets":        subnets,
        "count":          len(subnets),
        "live_count":     live_count,
        "simulated_count": len(subnets) - live_count,
        "tao_price":      tao_price,
        "updated":        datetime.utcnow().isoformat() + "Z",
        "cache_status":   subnet_cache_service.get_status(),
    }


@router.get("/overview")
async def market_overview():
    """Basic market overview — placeholder."""
    return {"status": "ok"}


# ── CoinGecko crypto ticker ────────────────────────────────────────────────────
# In-memory cache — refreshed at most every 90s to respect CoinGecko free tier.
_CG_CACHE: dict = {"coins": [], "ts": 0.0, "tao_mcap": 0.0}

@router.get("/crypto-ticker")
async def crypto_ticker():
    """
    Return a ticker list of major crypto assets with market cap ≥ Bittensor TAO.
    Data source: CoinGecko public API (no key required, 90-second server-side cache).
    Response: { coins: [{symbol, name, price, change_24h, market_cap, highlight}], cached: bool }
    """
    import httpx

    now = time.time()
    if now - _CG_CACHE["ts"] < 90 and _CG_CACHE["coins"]:
        return {"coins": _CG_CACHE["coins"], "cached": True}

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(
                "https://api.coingecko.com/api/v3/coins/markets",
                params={
                    "vs_currency": "usd",
                    "order": "market_cap_desc",
                    "per_page": 120,
                    "page": 1,
                    "sparkline": "false",
                    "price_change_percentage": "24h",
                },
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            raw: list = resp.json()
    except Exception as exc:
        logger.warning(f"CoinGecko fetch failed: {exc}")
        # Return stale cache if available, else empty
        return {"coins": _CG_CACHE.get("coins", []), "cached": True, "error": str(exc)}

    # Locate TAO (Bittensor) to get its market cap as the threshold
    tao_raw = next((c for c in raw if c.get("id") == "bittensor"), None)
    tao_mcap = (tao_raw or {}).get("market_cap") or _CG_CACHE["tao_mcap"] or 2_000_000_000

    def _coin(c: dict, highlight: bool = False) -> dict:
        return {
            "id":         c.get("id", ""),
            "symbol":     (c.get("symbol") or "").upper(),
            "name":       c.get("name", ""),
            "price":      c.get("current_price") or 0.0,
            "change_24h": c.get("price_change_percentage_24h") or 0.0,
            "market_cap": c.get("market_cap") or 0,
            "highlight":  highlight,
        }

    coins: list[dict] = []
    # TAO always first (highlighted)
    if tao_raw:
        coins.append(_coin(tao_raw, highlight=True))

    # Coins with market cap strictly greater than TAO's (and not TAO itself)
    for c in raw:
        if c.get("id") == "bittensor":
            continue
        if (c.get("market_cap") or 0) > tao_mcap:
            coins.append(_coin(c))

    _CG_CACHE["coins"]    = coins
    _CG_CACHE["ts"]       = now
    _CG_CACHE["tao_mcap"] = tao_mcap

    return {"coins": coins, "cached": False}


@router.get("/stats")
async def market_stats():
    """Top-level market summary stats."""
    tao_price = price_service.current_price or 250.0
    all_s = [_live_subnet(uid, tao_price) for uid in _DISPLAY_UIDS]

    total_stake = sum(s["stake_tao"] for s in all_s)
    avg_apy     = sum(s["apy"] for s in all_s) / len(all_s) if all_s else 0.0
    top_subnet  = max(all_s, key=lambda s: s["stake_tao"]) if all_s else {}

    return {
        "tao_price":       round(tao_price, 2),
        "total_subnets":   64,
        "total_stake_tao": round(total_stake, 0),
        "total_stake_usd": round(total_stake * tao_price, 0),
        "avg_apy":         round(avg_apy, 1),
        "top_subnet":      top_subnet,
        "up_subnets":      sum(1 for s in all_s if s["trend"] == "up"),
        "down_subnets":    sum(1 for s in all_s if s["trend"] == "down"),
    }