"""
Subnet Router
=============
Determines the best staking target (netuid + validator hotkey) for each
strategy at execution time.

Logic:
  1. Each strategy has a preferred subnet list ordered by priority.
  2. At execution time the router fetches live alpha prices from
     price_service (cached — no extra chain call).
  3. It walks the preference list and picks the first subnet whose
     alpha price clears the MIN_ALPHA_PRICE floor AND beats the
     root network yield threshold.
  4. Root network (netuid=0) is always the final fallback.

Validator selection:
  - PRIMARY_VALIDATOR (TaoBot) is used when they are registered on
    the target subnet.
  - For subnets where TaoBot is not present, the router selects the
    top-staked permitted validator on that subnet dynamically.
  - The validator cache refreshes every VALIDATOR_CACHE_TTL seconds
    to avoid hammering the chain.
"""

import asyncio
import logging
import time
from typing import Dict, List, Optional, Tuple

from services.bittensor_service import bittensor_service

logger = logging.getLogger(__name__)

# ── Primary validator ─────────────────────────────────────────────────────────
# TaoBot's hotkey — set once confirmed, used for all root-network stakes
# and any subnet where TaoBot has validator permit.
PRIMARY_VALIDATOR: Optional[str] = None   # filled in by set_primary_validator()

# ── Root network constant ─────────────────────────────────────────────────────
ROOT_NETUID        = 0      # dTAO root pool
ROOT_ALPHA_PRICE   = 1.0   # always 1:1 TAO

# ── Routing rules ─────────────────────────────────────────────────────────────
# Each strategy maps to an ordered list of (netuid, min_alpha_price) tuples.
# The router picks the FIRST subnet whose live alpha price >= min_alpha_price.
# Root (0) is appended implicitly as the final fallback.
STRATEGY_SUBNET_PREFS: Dict[str, List[Tuple[int, float]]] = {
    # TaoBot confirmed subnets (stake ≥ 1k τ, permit=True):
    #   SN0 (root) 922,869τ | SN18 274,681τ | SN8 246,867τ
    #   SN96 204,252τ | SN64 7,580τ | SN1 7,541τ | SN9 1,538τ

    # dTAO flow — follows highest α-price momentum; TaoBot on SN96 + SN64
    "dtao_flow_momentum":  [(96, 1.50), (64, 0.06), (18, 0.01)],
    # Pure momentum — hottest subnets; TaoBot on SN96
    "momentum_cascade":    [(96, 1.50), (18, 0.01), (8,  0.02)],
    # Breakouts in high-demand subnets; TaoBot on SN96 + SN18
    "breakout_hunter":     [(96, 1.00), (18, 0.01), (8,  0.02)],
    # Stable yield — root + SN18 (TaoBot has huge stake on both)
    "yield_maximizer":     [(18, 0.01), (9,  0.01)],
    # Contrarian — undervalued; TaoBot on SN9
    "contrarian_flow":     [(9,  0.01), (8,  0.02), (64, 0.06)],
    # Mean reversion in mid-tier; TaoBot on SN64
    "mean_reversion":      [(64, 0.06), (18, 0.01), (9,  0.01)],
    # Liquidity-rich; TaoBot has biggest presence on SN8
    "liquidity_hunter":    [(8,  0.02), (18, 0.01), (9,  0.01)],
    # Emission-weighted; TaoBot on SN8 + SN9
    "emission_momentum":   [(8,  0.02), (9,  0.01), (18, 0.01)],
    # High-volatility; TaoBot on SN96 + SN9
    "volatility_arb":      [(96, 1.00), (9,  0.01), (64, 0.06)],
    # Sentiment-driven; TaoBot on SN18 + SN9
    "sentiment_surge":     [(18, 0.01), (9,  0.01), (8,  0.02)],
    # Balanced; TaoBot on SN8 + SN18
    "balanced_risk":       [(8,  0.02), (18, 0.01)],
    # Macro = root is the anchor; falls through to SN0 fallback
    "macro_correlation":   [],
}

# ── Validator cache ───────────────────────────────────────────────────────────
VALIDATOR_CACHE_TTL = 300   # seconds — refresh every 5 minutes
_validator_cache:    Dict[int, Optional[str]] = {}   # netuid → best hotkey
_cache_ts:           float = 0.0
_taobot_subnets:     set   = set()   # subnets where TaoBot is confirmed present


def set_primary_validator(hotkey: str) -> None:
    """Called once at startup (or from config) with TaoBot's SS58 hotkey."""
    global PRIMARY_VALIDATOR
    PRIMARY_VALIDATOR = hotkey
    logger.info(f"Primary validator set: {hotkey[:20]}…")


async def _refresh_validator_cache(netuids: List[int]) -> None:
    """
    For each netuid in the list, find the best validator hotkey.
    Prefers PRIMARY_VALIDATOR if they have permit; otherwise picks
    the top-staked permitted validator.
    """
    global _validator_cache, _cache_ts, _taobot_subnets

    try:
        import bittensor as bt
        async with bt.AsyncSubtensor(network="finney") as sub:
            for netuid in netuids:
                try:
                    mg = await sub.metagraph(netuid=netuid)
                    validators = list(zip(
                        mg.hotkeys,
                        mg.S.tolist(),
                        mg.validator_permit.tolist(),
                    ))
                    # Check if TaoBot is present and permitted on this subnet
                    taobot_here = False
                    if PRIMARY_VALIDATOR:
                        for hk, stake, permit in validators:
                            if hk == PRIMARY_VALIDATOR and permit:
                                taobot_here = True
                                break
                    if taobot_here:
                        _validator_cache[netuid] = PRIMARY_VALIDATOR
                        _taobot_subnets.add(netuid)
                        logger.info(f"SN{netuid}: TaoBot present — using primary validator")
                    else:
                        # Pick top-staked permitted validator
                        permitted = [(hk, s) for hk, s, p in validators if p]
                        if permitted:
                            best = max(permitted, key=lambda x: x[1])
                            _validator_cache[netuid] = best[0]
                            logger.info(
                                f"SN{netuid}: TaoBot absent — top validator "
                                f"{best[0][:16]}… ({best[1]:.0f}τ)"
                            )
                        else:
                            _validator_cache[netuid] = None
                            logger.warning(f"SN{netuid}: no permitted validators found")
                except Exception as e:
                    logger.warning(f"SN{netuid} metagraph error: {e}")
                    _validator_cache.setdefault(netuid, None)
    except Exception as e:
        logger.error(f"Validator cache refresh failed: {e}")

    _cache_ts = time.monotonic()


async def get_stake_target(strategy_name: str) -> Tuple[int, Optional[str]]:
    """
    Returns (netuid, validator_hotkey) for the given strategy.

    Algorithm:
      1. Walk the strategy's preferred subnet list.
      2. For each subnet, check live alpha price >= threshold.
      3. First qualifying subnet wins.
      4. Fall back to root (netuid=0) with PRIMARY_VALIDATOR.

    Returns (0, PRIMARY_VALIDATOR) if no preferred subnet qualifies
    or if the strategy has no preferences configured.
    """
    global _validator_cache, _cache_ts

    prefs = STRATEGY_SUBNET_PREFS.get(strategy_name, [])

    # Fetch live subnet prices from bittensor_service cache (no extra chain call)
    subnet_prices: Dict[int, float] = {}
    try:
        raw = bittensor_service._subnet_prices   # {netuid: price} populated by get_subnet_prices()
        subnet_prices = {int(k): float(v) for k, v in raw.items()}
    except Exception:
        pass

    # If cache is empty, trigger a background refresh so next cycle has data
    if not subnet_prices:
        asyncio.create_task(bittensor_service.get_subnet_prices())

    # Determine which subnets we need validators for
    candidate_netuids = [netuid for netuid, _ in prefs]

    # Refresh validator cache if stale
    if (time.monotonic() - _cache_ts) > VALIDATOR_CACHE_TTL:
        await _refresh_validator_cache(candidate_netuids)

    # Walk preference list
    for netuid, min_price in prefs:
        live_price = subnet_prices.get(netuid, 0.0)
        if live_price >= min_price:
            validator = _validator_cache.get(netuid)
            if not validator:
                # Cache miss for this subnet — trigger refresh and fall through
                asyncio.create_task(_refresh_validator_cache([netuid]))
                continue
            logger.debug(
                f"{strategy_name} → SN{netuid} "
                f"(α={live_price:.4f}τ >= {min_price:.4f}τ min)"
            )
            return netuid, validator

    # Fallback: root network with primary validator
    logger.debug(f"{strategy_name} → SN{ROOT_NETUID} (root fallback)")
    return ROOT_NETUID, PRIMARY_VALIDATOR


def get_router_status() -> dict:
    """Snapshot for API / debugging."""
    return {
        "primary_validator":    PRIMARY_VALIDATOR,
        "taobot_subnets":       sorted(_taobot_subnets),
        "cached_validators":    {
            f"SN{k}": (v[:16] + "…" if v else None)
            for k, v in _validator_cache.items()
        },
        "cache_age_seconds":    round(time.monotonic() - _cache_ts, 1),
        "strategy_preferences": {
            k: [f"SN{n}(min={p}τ)" for n, p in v]
            for k, v in STRATEGY_SUBNET_PREFS.items()
        },
    }
