"""
Market Data router — 64-subnet Bittensor network table with simulated live data.
Provides subnet metadata, TAO staked, emission rates, and trend signals.
"""
import math
import random
from datetime import datetime
from fastapi import APIRouter, Query
from services.price_service import price_service

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
}

# Deterministic base stats per subnet (seeded so they don't flicker wildly)
_rng = random.Random(42)

_BASE: dict[int, dict] = {}
for uid in range(1, 65):
    base_stake = _rng.uniform(10_000, 2_000_000)
    base_emission = _rng.uniform(0.001, 0.04)
    base_apy = _rng.uniform(8.0, 48.0)
    active_miners = _rng.randint(5, 256)
    _BASE[uid] = {
        "stake":   base_stake,
        "emission": base_emission,
        "apy":     base_apy,
        "miners":  active_miners,
    }

def _live_subnet(uid: int, tao_price: float) -> dict:
    """Add small random walk on top of base to simulate live data."""
    b = _BASE[uid]
    name, ticker = SUBNET_META.get(uid, (f"Subnet {uid}", f"sn{uid}"))

    noise = random.uniform(-0.03, 0.03)
    stake_tao  = b["stake"]  * (1 + noise)
    emission   = b["emission"] * (1 + noise * 0.5)
    apy        = b["apy"] * (1 + noise * 0.5)
    stake_usd  = stake_tao * tao_price

    # Trend: positive if noise > 0.01, negative if < -0.01
    trend = "up" if noise > 0.01 else "down" if noise < -0.01 else "neutral"

    # Score = weighted combo of stake + APY
    score = math.log10(max(stake_tao, 1)) * 10 + apy
    score = round(score, 1)

    return {
        "uid":         uid,
        "name":        name,
        "ticker":      ticker,
        "stake_tao":   round(stake_tao, 2),
        "stake_usd":   round(stake_usd, 0),
        "emission":    round(emission, 5),
        "apy":         round(apy, 2),
        "miners":      b["miners"],
        "trend":       trend,
        "score":       score,
    }


@router.get("/subnets")
async def get_subnets(
    sort: str = Query("stake_tao", description="Field to sort by"),
    order: str = Query("desc", description="asc | desc"),
    min_apy: float = Query(0.0, description="Minimum APY filter"),
    search: str = Query("", description="Filter by subnet name"),
):
    """Return live subnet table for all 64 subnets."""
    tao_price = price_service.current_price or 250.0

    subnets = [_live_subnet(uid, tao_price) for uid in range(1, 65)]

    # Apply filters
    if min_apy > 0:
        subnets = [s for s in subnets if s["apy"] >= min_apy]
    if search:
        subnets = [s for s in subnets if search.lower() in s["name"].lower() or search.lower() in s["ticker"]]

    # Sort
    reverse = order == "desc"
    if sort in ("stake_tao", "stake_usd", "emission", "apy", "miners", "score", "uid"):
        subnets.sort(key=lambda s: s[sort], reverse=reverse)

    return {
        "subnets":   subnets,
        "count":     len(subnets),
        "tao_price": tao_price,
        "updated":   datetime.utcnow().isoformat() + "Z",
    }


@router.get("/overview")
async def market_overview():
    """Top-level market summary stats."""
    tao_price = price_service.current_price or 250.0
    all_s = [_live_subnet(uid, tao_price) for uid in range(1, 65)]

    total_stake = sum(s["stake_tao"] for s in all_s)
    avg_apy     = sum(s["apy"] for s in all_s) / len(all_s)
    top_subnet  = max(all_s, key=lambda s: s["stake_tao"])

    return {
        "tao_price":     round(tao_price, 2),
        "total_subnets": 64,
        "total_stake_tao": round(total_stake, 0),
        "total_stake_usd": round(total_stake * tao_price, 0),
        "avg_apy":       round(avg_apy, 1),
        "top_subnet":    top_subnet,
        "up_subnets":    sum(1 for s in all_s if s["trend"] == "up"),
        "down_subnets":  sum(1 for s in all_s if s["trend"] == "down"),
    }