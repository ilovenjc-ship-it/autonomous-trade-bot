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
from fastapi import APIRouter, Query, HTTPException
from services.price_service import price_service
from services.subnet_cache_service import subnet_cache_service, TRADING_NETUIDS

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

# ── Subnet descriptions ───────────────────────────────────────────────────────
SUBNET_DESCRIPTIONS: dict[int, str] = {
    1:  "Text Prompting — the original Bittensor subnet for LLM inference. Validators score miner responses to diverse prompts using quality metrics.",
    2:  "Machine Translation — high-quality multilingual translation tasks. Miners compete to produce the most accurate cross-language outputs.",
    3:  "MyShell TTS — text-to-speech synthesis and voice cloning. Produces natural-sounding audio from text inputs.",
    4:  "Multi Modality (Targon) — combined text, image, and audio inference with multi-modal scoring across diverse modalities.",
    5:  "Open Kaito — decentralised web search and semantic information retrieval. Powers next-generation search without central control.",
    6:  "Nous Research — advanced LLM fine-tuning and evaluation. Focuses on producing aligned, capable open-source models.",
    7:  "SubVortex — decentralised bandwidth and storage marketplace. Routes traffic to the fastest globally-distributed nodes.",
    8:  "Taoshi PTN (Proprietary Trading Network) — real-time predictive trading signals for financial markets. TaoBot actively stakes and receives signals from this subnet.",
    9:  "Pretraining — foundational model pretraining on large text corpora. Miners prove they trained models by submitting weight commitments on-chain. TaoBot actively stakes here.",
    10: "Map Reduce — distributed compute for large-scale data aggregation and transformation pipelines.",
    11: "Dippy Roleplay — conversational roleplay and character AI. Miners fine-tune LLMs for entertainment and companion applications.",
    12: "Horde — collaborative AI horde network linking diverse inference endpoints for high-availability generation.",
    13: "Dataverse — decentralised data labelling and curation. Miners annotate, validate, and enrich training datasets.",
    14: "LLM Defender — adversarial robustness and jailbreak detection for large language models.",
    15: "Human Intelligence (HiveTrain) — human-in-the-loop task validation to augment pure AI judgement.",
    16: "BitAds — decentralised advertising attribution and analytics without invasive tracking.",
    17: "3D Gen — AI-powered 3D model generation from text and image prompts.",
    18: "Cortex — general-purpose AI API gateway aggregating multiple LLM providers with reliability guarantees. TaoBot monitors this subnet.",
    19: "Nineteen — high-throughput inference optimised for speed and low latency on diverse model types.",
    20: "BitAgent — autonomous AI agents that plan and execute multi-step tasks using tool use.",
    21: "FileTAO — decentralised file storage with cryptographic proofs of retrieval.",
    22: "Desearch — AI-augmented semantic search combining embeddings with real-time web retrieval.",
    23: "NichePT — specialised fine-tuned language models for niche domains and expert verticals.",
    24: "Omega Labs — video understanding, captioning, and multi-modal AI research.",
    25: "Protein Folding — AI-driven protein structure prediction, following in AlphaFold's footsteps on decentralised hardware.",
    26: "Gradients AI — gradient-based model optimisation and distributed fine-tuning services.",
    27: "Compute Horde — decentralised GPU compute marketplace. Miners provide verified computational work.",
    28: "ZkTensor — zero-knowledge proof generation for AI models, enabling verifiable ML without revealing weights.",
    29: "Coldint — cold-start intelligence for sparse data domains using meta-learning approaches.",
    30: "Bittensor Education — educational content generation and adaptive learning platforms.",
    31: "Nas Chain — neural architecture search and automated machine learning pipeline optimisation.",
    32: "Itsai — interactive AI tutoring and personalised learning experiences.",
    33: "Ready Player Me — AI-driven avatar generation and 3D character creation for gaming and virtual worlds.",
    34: "Logic — formal reasoning, theorem proving, and symbolic AI computation.",
    35: "Airtune — music generation, audio synthesis, and creative sound design using AI.",
    36: "Automata — workflow automation with AI agents executing complex business logic.",
    37: "Finetuning — continuous model fine-tuning competitions with on-chain weight tracking.",
    38: "Tatsu — data scraping, structuring, and ETL pipelines for AI training datasets.",
    39: "EdgeMaxxing — edge AI optimisation, model compression, and hardware-aware inference.",
    40: "ChainDual — dual-chain bridge intelligence and cross-chain analytics.",
    41: "Sportstensor — sports analytics, prediction markets, and real-time game intelligence.",
    42: "Masa — decentralised social data aggregation and Twitter/X intelligence.",
    43: "Graphite — graph neural networks and knowledge graph construction.",
    44: "Dojo — synthetic data generation and AI model training data creation at scale.",
    45: "GenLayer — generative AI smart contracts with AI-verified execution environments.",
    46: "NeuralAI — general-purpose neural inference with competitive benchmark scoring.",
    47: "Condense AI — context compression and long-document summarisation at scale.",
    48: "Nextplace AI — real estate intelligence and property market prediction models.",
    49: "AutoML — automated machine learning pipeline construction and hyperparameter optimisation.",
    50: "Rdaemon — autonomous research agents that crawl, synthesise, and report on scientific literature.",
    51: "Celium — decentralised compute scheduling and GPU cluster orchestration.",
    52: "GreenBit Labs — energy-efficient AI compute with carbon footprint tracking.",
    53: "Manifold Finance — DeFi intelligence, MEV analytics, and on-chain financial signal generation.",
    54: "Bit Mind — AI-powered image and deepfake detection for media authenticity.",
    55: "EINSTEIN AI — scientific computing and physics simulation using neural surrogates.",
    56: "Neural Condense — efficient model distillation and neural network compression research.",
    57: "Gaia — geospatial intelligence, satellite imagery analysis, and earth observation AI.",
    58: "Dippy Bittensor — conversational AI with strong safety properties and alignment research.",
    59: "Agent Arena — autonomous agent competitions and multi-agent reinforcement learning benchmarks.",
    60: "RunPod — GPU cloud inference integrated with the Bittensor incentive layer.",
    61: "Red Team — adversarial AI red-teaming and safety vulnerability discovery.",
    62: "Storb — distributed object storage with proof-of-retrieval guarantees.",
    63: "Melting Pot — multi-agent cooperation tasks and emergent collective behaviour research.",
    64: "Chutes — AI model serving infrastructure and decentralised inference orchestration. TaoBot actively stakes here.",
    96: "Subnet 96 — extended trading target in the Bittensor ecosystem.",
}

# ── Monitored subnets (TaoBot actively stakes into these) ────────────────────
_TAOBOT_MONITORED = TRADING_NETUIDS  # {0, 8, 9, 18, 64, 96}

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

    # ── Sparkline (normalised 0-1 for SVG rendering) ──────────────────────
    raw_history = subnet_cache_service.get_price_history(uid)
    if len(raw_history) >= 2:
        mn = min(raw_history)
        mx = max(raw_history)
        rng_ = mx - mn
        if rng_ > 0:
            sparkline = [round((p - mn) / rng_, 4) for p in raw_history]
        else:
            sparkline = [0.5] * len(raw_history)
    else:
        # Deterministic synthetic sparkline seeded by uid + hourly bucket
        _sk_rng = random.Random(uid * 17 + int(time.time() // 3600))
        _pts: list[float] = []
        _v = 0.5
        for _ in range(8):
            _v = max(0.05, min(0.95, _v + _sk_rng.uniform(-0.12, 0.12)))
            _pts.append(round(_v, 4))
        # Bias the last point towards the current trend direction
        if trend == "up":
            _pts[-1] = min(0.95, _pts[-1] + 0.08)
        elif trend == "down":
            _pts[-1] = max(0.05, _pts[-1] - 0.08)
        sparkline = _pts

    # Current alpha price (None if not yet cached)
    alpha_price = subnet_cache_service.get_alpha_price(uid)

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
        "sparkline":   sparkline,
        "alpha_price": round(alpha_price, 6) if alpha_price else None,
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
    """
    Full market overview — TAO price, total stake, avg APY, subnet counts, top subnet.
    Delegates to the same logic as /stats.
    """
    tao_price = price_service.current_price or 250.0
    all_s = [_live_subnet(uid, tao_price) for uid in _DISPLAY_UIDS]

    total_stake = sum(s["stake_tao"] for s in all_s)
    avg_apy     = sum(s["apy"] for s in all_s) / len(all_s) if all_s else 0.0
    top_subnet  = max(all_s, key=lambda s: s["stake_tao"]) if all_s else {}

    return {
        "tao_price":       round(tao_price, 2),
        "total_subnets":   len(all_s),
        "total_stake_tao": round(total_stake, 0),
        "total_stake_usd": round(total_stake * tao_price, 0),
        "avg_apy":         round(avg_apy, 1),
        "top_subnet":      top_subnet,
        "up_subnets":      sum(1 for s in all_s if s["trend"] == "up"),
        "down_subnets":    sum(1 for s in all_s if s["trend"] == "down"),
    }


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


# ── TAO.app Fear & Greed ──────────────────────────────────────────────────────
# Free endpoint — no API key required. Cache for 5 minutes.
_FG_CACHE: dict = {"value": None, "label": None, "ts": 0.0}

@router.get("/fear-greed")
async def fear_greed():
    """
    Return the current Bittensor Fear & Greed index from TAO.app.
    Cached for 5 minutes. Falls back to null on network failure.
    Value range: -100 (Extreme Fear) → +100 (Extreme Greed).
    """
    import httpx

    now = time.time()
    if now - _FG_CACHE["ts"] < 300 and _FG_CACHE["value"] is not None:
        return {
            "value":  _FG_CACHE["value"],
            "label":  _FG_CACHE["label"],
            "cached": True,
        }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                "https://api.tao.app/api/beta/analytics/macro/fear_greed/current",
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()

        # TAO.app returns values 0–100 (0 = Extreme Fear, 100 = Extreme Greed).
        # Normalise to our -100 → +100 scale to match the existing gauge.
        raw_value = None
        if isinstance(data, dict):
            # Try common field names
            for key in ("value", "fear_greed_value", "score", "index"):
                if key in data and data[key] is not None:
                    raw_value = float(data[key])
                    break
            # If not found, try first numeric value in dict
            if raw_value is None:
                for v in data.values():
                    if isinstance(v, (int, float)):
                        raw_value = float(v)
                        break
        elif isinstance(data, (int, float)):
            raw_value = float(data)

        if raw_value is not None:
            # TAO.app 0-100 → our -100 to +100
            normalised = (raw_value - 50) * 2
            normalised = max(-100.0, min(100.0, normalised))
        else:
            normalised = None

        label = None
        if normalised is not None:
            label = (
                "Extreme Greed" if normalised >= 60 else
                "Greed"         if normalised >= 25 else
                "Neutral"       if normalised >= -25 else
                "Fear"          if normalised >= -60 else
                "Extreme Fear"
            )

        _FG_CACHE["value"] = normalised
        _FG_CACHE["label"] = label
        _FG_CACHE["ts"]    = now

        return {"value": normalised, "label": label, "cached": False, "raw": raw_value}

    except Exception as exc:
        logger.warning(f"TAO.app fear/greed fetch failed: {exc}")
        # Return stale cache if available
        if _FG_CACHE["value"] is not None:
            return {"value": _FG_CACHE["value"], "label": _FG_CACHE["label"],
                    "cached": True, "stale": True}
        return {"value": None, "label": None, "cached": False, "error": str(exc)}


@router.get("/subnet/{uid}")
async def get_subnet_detail(uid: int):
    """
    Full detail view for a single subnet — includes sparkline history,
    description, TaoBot monitoring status, and external resource links.
    """
    if uid not in SUBNET_META and uid not in range(1, 200):
        raise HTTPException(status_code=404, detail=f"Subnet {uid} not found")

    tao_price = price_service.current_price or 250.0
    subnet    = _live_subnet(uid, tao_price)

    # Full price history for the detail chart (raw prices, not normalised)
    raw_history = subnet_cache_service.get_price_history(uid)

    description  = SUBNET_DESCRIPTIONS.get(uid, f"Subnet {uid} on the Bittensor network. A decentralised AI compute market secured by the Yuma Consensus mechanism.")
    is_monitored = uid in _TAOBOT_MONITORED

    return {
        **subnet,
        "description":   description,
        "is_monitored":  is_monitored,
        "price_history": [round(p, 6) for p in raw_history],
        "taostats_url":  f"https://taostats.io/subnet/{uid}",
        "tao_app_url":   f"https://tao.app/subnet/{uid}",
        "taobot_label":  "TaoBot Active" if is_monitored else "Monitor Only",
    }


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