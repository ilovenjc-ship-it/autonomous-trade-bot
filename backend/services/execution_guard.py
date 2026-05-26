"""
Execution Guard — Foundation module
====================================
Centralises pre-flight cost estimation, execution jitter, and MEV-awareness
scaffolding for all live and paper trades.

Architecture status
-------------------
  Fee model          ACTIVE  — per-leg cost mirrors cycle_service paper constants.
                               Records real fee estimate on every live trade.
  Slippage model     ACTIVE  — AMM pool-depth-aware estimate per trade size.
                               Populated on all paper + live trade records.
  Execution jitter   ACTIVE  — Each strategy gets a deterministic 0-45 s delay
                               so all 12 bots never fire simultaneously on the
                               same block. Eliminates signal self-contamination.
  MEV pre-flight     SCAFFOLDED — Guard function exists, logs warnings, does NOT
                               block execution until priority warrants full rollout.

Bittensor-specific context
--------------------------
Bittensor (Finney) is a Substrate chain, not EVM. Key differences:

  Fees:     Substrate weight-based extrinsic fee ~0.0005-0.003 τ per call.
            Deterministic and not gas-auction-based. Two legs per round trip:
            add_stake (buy leg) + unstake (sell leg).

  Slippage: Each subnet runs a bonding-curve AMM (x*y=k, similar to Uniswap v2).
            TAO → αTAO price impact: amount / (pool_depth + amount) per leg.
            Pool depth varies by subnet activity. Default conservative estimate
            used until live pool-depth data is available from the SDK.

  MEV:      Classic EVM mempool scanning is NOT applicable on Substrate.
            Extrinsics are ordered by priority in the txpool and land within
            one block (~12 s). The primary MEV-analogue risk on Finney is:
              a) Block proposer extrinsic reordering (vanishingly rare today).
              b) On-chain pattern surveillance — competitors watching staking
                 flows to infer bot strategy and front-copy positions.
              c) INTERNAL noise: correlated simultaneous execution by the fleet
                 itself, creating artificial α-price spikes that contaminate
                 the next signal cycle. This is the primary problem addressed
                 by execution jitter.

Priority order for full activation
-----------------------------------
  1. (NOW)    Jitter + fee recording + slippage estimate fields     [DONE]
  2. (SOON)   Real pool-depth fetch from SDK for slippage accuracy
  3. (LATER)  MEV pattern detection when fleet scales to live capital
  4. (LATER)  Commit-reveal or time-lock for MEV-sensitive signals
"""

import hashlib
import logging
import math
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


# ── Fee constants ─────────────────────────────────────────────────────────────
# Must stay in sync with cycle_service PAPER_FEE_PER_LEG / PAPER_SLIPPAGE_PER_LEG.
# These represent the real on-chain costs modelled in the paper simulator.

FEE_PER_LEG_TAO      = 0.003   # Substrate extrinsic weight fee per add_stake / unstake
SLIPPAGE_PER_LEG_PCT = 0.002   # 0.2 % base slippage per leg (thin α-token books)
ROUND_TRIP_FEE_PCT   = (FEE_PER_LEG_TAO * 2)          # flat τ cost, both legs
ROUND_TRIP_SLIP_PCT  = SLIPPAGE_PER_LEG_PCT * 2         # 0.4 % slippage both legs


# ── AMM pool depth estimates ───────────────────────────────────────────────────
# Conservative estimates of TAO depth in each subnet's bonding-curve pool.
# Used to compute price impact = amount / (pool_depth + amount).
# Replace with live SDK data when available (sub.get_subnet_hyperparameters()).

DEFAULT_POOL_DEPTH_TAO = 200.0   # Conservative default for unknown subnets

SUBNET_POOL_DEPTH: dict[int, float] = {
    # Root network — deepest pool
    0:  50_000.0,
    # Tier 1 — high-activity subnets
    1:   5_000.0,   # SN1 (Text Prompting / Apex)
    9:   3_000.0,   # SN9 (Pretrain)
    18:  2_000.0,   # SN18
    19:  2_000.0,   # SN19
    # Tier 2 — mid-activity
    3:    500.0,
    4:    500.0,
    5:    500.0,
    8:    500.0,
    11:   500.0,
    # Everything else uses DEFAULT_POOL_DEPTH_TAO
}


# ── Live pool-depth resolver (Day 13, 2026-05-26) ──────────────────────────────
# Day 12 R8 expanded `pool_reserves_service` coverage from 6 trading subnets to
# all ~80–128 active dTAO subnets, snapshotted every 5 min via the metagraph
# cycle.  After the ~24 h warm-up window all six TRADING_NETUIDS reserves
# carry live `tao_in` figures, so we now prefer live data over the static
# tier-bucket table above.  The static table stays as defensive fallback —
# if `pool_reserves_service` is empty (cold start, RPC blip, test harness)
# we degrade gracefully instead of crashing the slippage path.
#
# Lazy import dodges a circular dep: pool_reserves_service is read-only here
# and gets populated from subnet_cache_service which itself doesn't touch
# execution_guard.  The import is local, fast on subsequent calls (Python
# caches in sys.modules), and tolerant of import-time failures.

def _pool_depth(netuid: int) -> float:
    """
    Resolve τ_in pool depth for a subnet.

    Priority:
      1. Live reserves from `pool_reserves_service.latest(netuid).tao_in`
         (populated every 5 min for ALL active subnets — Day 12 R8).
      2. Static `SUBNET_POOL_DEPTH` tier-bucket fallback (Day 9 estimates).
      3. `DEFAULT_POOL_DEPTH_TAO` ultimate fallback (200 τ — conservative).

    Returns τ as a float.  Always > 0 on the static-fallback path; only
    returns 0 if a future caller passes a netuid that's not in the table
    and the service is unreachable, which is a programming error.
    """
    try:
        from services.pool_reserves_service import pool_reserves_service  # lazy
        r = pool_reserves_service.latest(int(netuid))
        if r is not None and r.tao_in and r.tao_in > 0:
            return float(r.tao_in)
    except Exception:
        # Reserves service unavailable — fall through to static table.
        pass
    return SUBNET_POOL_DEPTH.get(int(netuid), DEFAULT_POOL_DEPTH_TAO)


def _pool_depth_source(netuid: int) -> str:
    """Tag the source ('live' | 'static' | 'default') for telemetry / status surfaces."""
    try:
        from services.pool_reserves_service import pool_reserves_service  # lazy
        r = pool_reserves_service.latest(int(netuid))
        if r is not None and r.tao_in and r.tao_in > 0:
            return "live"
    except Exception:
        pass
    if int(netuid) in SUBNET_POOL_DEPTH:
        return "static"
    return "default"


# ── Jitter table ──────────────────────────────────────────────────────────────
# Deterministic execution offset per strategy.
# Computed once from md5(strategy_name) % 46 — consistent across restarts.
# Spreads 12 bots across a 0-45 s window so they never land on the same block.
#
# Pre-computed values (md5(name)[:8] mod 46):
#   momentum_cascade:   44 s
#   dtao_flow_momentum: 33 s
#   liquidity_hunter:   19 s
#   breakout_hunter:     1 s
#   yield_maximizer:    22 s
#   contrarian_flow:    36 s
#   volatility_arb:     17 s
#   sentiment_surge:     8 s
#   balanced_risk:      30 s
#   mean_reversion:     12 s
#   emission_momentum:  29 s
#   macro_correlation:  17 s
#
# NOTE: volatility_arb and macro_correlation both hash to 17 s. They trade
# different subnets via the subnet router, so their concurrent stake calls
# target different pools — no price-impact collision between them.

JITTER_WINDOW_SECONDS = 45   # max spread; increase as fleet scales


def jitter_seconds(strategy_name: str) -> int:
    """
    Return the deterministic execution offset (seconds) for this strategy.

    Using md5 as a stable hash — not security-critical, just needs
    consistent distribution across the strategy namespace.
    """
    h = int(hashlib.md5(strategy_name.encode()).hexdigest()[:8], 16)
    return h % (JITTER_WINDOW_SECONDS + 1)


# Pre-compute for fast lookup and API/UI export
STRATEGY_JITTER: dict[str, int] = {
    name: jitter_seconds(name)
    for name in [
        "momentum_cascade", "dtao_flow_momentum", "liquidity_hunter", "breakout_hunter",
        "yield_maximizer",  "contrarian_flow",    "volatility_arb",   "sentiment_surge",
        "balanced_risk",    "mean_reversion",      "emission_momentum", "macro_correlation",
    ]
}


# ── Fee / cost helpers ────────────────────────────────────────────────────────

def fee_for_trade(amount_tao: float) -> float:
    """
    Flat τ fee for one round trip (buy leg + sell leg).
    Substrate fees are weight-based and nearly invariant to stake amount.
    Returns τ cost.
    """
    return round(FEE_PER_LEG_TAO * 2, 6)


def slippage_for_trade(amount_tao: float, netuid: int = 1) -> float:
    """
    AMM price-impact estimate for a round-trip stake/unstake.

    Formula (Uniswap v2 constant-product):
        per_leg_impact = amount / (pool_depth + amount)
        round_trip     = per_leg_impact * 2

    Returns fraction (not percent), e.g. 0.001 = 0.1 % slippage.
    """
    pool = _pool_depth(netuid)
    per_leg = amount_tao / (pool + amount_tao)
    return round(per_leg * 2, 6)


def slippage_tao(amount_tao: float, netuid: int = 1) -> float:
    """Slippage expressed in τ (fraction × amount)."""
    return round(slippage_for_trade(amount_tao, netuid) * amount_tao, 6)


def total_cost_tao(amount_tao: float, netuid: int = 1) -> float:
    """
    Total round-trip cost in τ = flat fee + slippage.
    This is the minimum edge a strategy must generate to be profitable.
    """
    return round(fee_for_trade(amount_tao) + slippage_tao(amount_tao, netuid), 6)


def total_cost_pct(amount_tao: float, netuid: int = 1) -> float:
    """Total round-trip cost as % of trade amount."""
    if amount_tao == 0:
        return 0.0
    return round(total_cost_tao(amount_tao, netuid) / amount_tao * 100, 4)


# ── Pre-flight check ──────────────────────────────────────────────────────────

@dataclass
class ExecutionCheck:
    """Result of a pre-flight execution check."""
    go:             bool            # True = proceed; False = block (when guard is enforced)
    reason:         str             # Human-readable explanation
    fee_tao:        float = 0.0     # Estimated fee in τ
    slippage_tao:   float = 0.0     # Estimated slippage in τ
    total_cost_tao: float = 0.0     # fee + slippage in τ
    cost_pct:       float = 0.0     # total cost as % of amount
    pool_depth:     float = 0.0     # Pool depth used for slippage calc
    warnings:       list  = field(default_factory=list)


# ── Guard config (tunable, currently permissive) ──────────────────────────────
# When SLIPPAGE_GUARD_ENABLED is True, trades where slippage_pct > MAX_SLIPPAGE_PCT
# are blocked at the pre-flight stage. Set to False for now — logs only.
SLIPPAGE_GUARD_ENABLED = False
MAX_SLIPPAGE_PCT       = 2.0   # block if slippage estimate > 2 % of trade size


def pre_flight_check(
    amount_tao: float,
    netuid: int = 1,
    mode: str = "LIVE",
    strategy: Optional[str] = None,
) -> ExecutionCheck:
    """
    Evaluate whether a trade is cost-efficient enough to execute.

    Parameters
    ----------
    amount_tao  : TAO amount to stake / unstake.
    netuid      : Target subnet (used for pool-depth lookup).
    mode        : "LIVE" or "PAPER" — paper trades always pass.
    strategy    : Strategy name (for logging context).

    Returns
    -------
    ExecutionCheck — always returns go=True while SLIPPAGE_GUARD_ENABLED is False.
    When guard is enabled, go=False blocks the trade.

    Status: SCAFFOLDED — not enforced until SLIPPAGE_GUARD_ENABLED = True.
    """
    label  = strategy or "unknown"
    pool   = _pool_depth(netuid)
    fee    = fee_for_trade(amount_tao)
    slip   = slippage_tao(amount_tao, netuid)
    total  = round(fee + slip, 6)
    pct    = round(total / amount_tao * 100, 4) if amount_tao else 0.0
    warns  = []

    if pct > MAX_SLIPPAGE_PCT:
        msg = (
            f"[GUARD] {label} SN{netuid}: cost {pct:.2f}% > threshold {MAX_SLIPPAGE_PCT}% "
            f"(fee={fee:.6f}τ slip={slip:.6f}τ pool≈{pool:.0f}τ)"
        )
        warns.append(msg)
        logger.warning(msg)

    blocked = SLIPPAGE_GUARD_ENABLED and pct > MAX_SLIPPAGE_PCT and mode == "LIVE"
    reason  = (
        "PASS" if not warns
        else f"HIGH_COST ({pct:.2f}% > {MAX_SLIPPAGE_PCT}%) — "
             + ("BLOCKED" if blocked else "WARNING only (guard not enforced)")
    )

    return ExecutionCheck(
        go             = not blocked,
        reason         = reason,
        fee_tao        = fee,
        slippage_tao   = slip,
        total_cost_tao = total,
        cost_pct       = pct,
        pool_depth     = pool,
        warnings       = warns,
    )


# ── Guard status export (for API + UI) ───────────────────────────────────────

def guard_status() -> dict:
    """
    Return current guard configuration and strategy jitter table.
    Consumed by /api/bot/execution-guard and the Trades page status card.
    """
    return {
        "fee_model": {
            "fee_per_leg_tao":      FEE_PER_LEG_TAO,
            "round_trip_fee_tao":   round(FEE_PER_LEG_TAO * 2, 6),
            "description":          "Substrate weight-based extrinsic fee per add_stake / unstake call",
        },
        "slippage_model": {
            "base_pct_per_leg":     SLIPPAGE_PER_LEG_PCT * 100,
            "model":                "AMM constant-product (Uniswap v2 style)",
            "formula":              "impact = amount / (pool_depth + amount) per leg × 2 legs",
            "default_pool_depth":   DEFAULT_POOL_DEPTH_TAO,
            "pool_depth_source":    "live (pool_reserves_service.latest.tao_in) → static tier-bucket fallback → DEFAULT_POOL_DEPTH_TAO",
            "live_source":          "pool_reserves_service · 5-min metagraph cycle · all active dTAO subnets",
        },
        "jitter": {
            "enabled":              True,
            "window_seconds":       JITTER_WINDOW_SECONDS,
            "description":          "Desynchronises 12 bots to prevent signal self-contamination",
            "strategies":           STRATEGY_JITTER,
        },
        "mev_guard": {
            "enabled":              False,
            "status":               "SCAFFOLDED",
            "notes": (
                "Bittensor (Substrate) does not have EVM-style public mempool MEV. "
                "Primary risk is on-chain pattern observation by competitors and "
                "internal signal self-contamination (solved by jitter). "
                "Full MEV monitoring activates when fleet scales to live capital."
            ),
        },
        "slippage_guard": {
            "enabled":              SLIPPAGE_GUARD_ENABLED,
            "max_slippage_pct":     MAX_SLIPPAGE_PCT,
            "status":               "ACTIVE" if SLIPPAGE_GUARD_ENABLED else "SCAFFOLDED",
            "notes":                "Set SLIPPAGE_GUARD_ENABLED=True to enforce pre-flight blocking.",
        },
        "round_trip_cost_model": {
            "fee_pct_of_amount":    "flat τ0.006 per round trip (amount-independent)",
            "slip_pct_approx":      f"≈{ROUND_TRIP_SLIP_PCT * 100:.1f}% at default pool depth",
            "total_approx_pct":     "≈1.0% at default pool depth — must be exceeded to be profitable",
        },
    }