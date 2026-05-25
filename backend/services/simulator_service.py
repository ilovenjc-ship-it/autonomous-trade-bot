"""
simulator_service.py — Day 12 (Pre-Trade Simulator)
====================================================

Pure-math core for the Pre-Trade Simulator. NO chain calls, NO DB writes —
just the AMM equations applied to a (τ_in, α_in, cost) tuple. All callers
(REST endpoint, execution_guard, manual-trade preflight) share the same
arithmetic so slippage answers are consistent across the app.

Reference: docs.learnbittensor.org/learn/slippage
    "Each Bittensor subnet operates as a constant product AMM, meaning that
     it will accept trades that conserve the product of the quantities of
     the two tokens in reserve, TAO and alpha."

    τ_in · α_in = k
    (τ_in + cost)·(α_in − stake) = τ_in·α_in
    stake_received = α_in − (τ_in · α_in) / (τ_in + cost)

For unstake (sell alpha → receive TAO) the inverse formula applies:
    tao_received = τ_in − (τ_in · α_in) / (α_in + alpha_in_amount)

All quantities are TAO/alpha floats (not rao). Inputs are validated; pool
state is treated read-only.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import List, Tuple, Optional
import math

# ── Math primitives ──────────────────────────────────────────────────────────


def stake_received(tao_in: float, alpha_in: float, cost_tao: float) -> float:
    """
    Constant-product AMM: how much alpha you receive for staking `cost_tao`
    TAO into a pool with reserves (tao_in, alpha_in).

    Returns 0.0 if cost is non-positive or pool is empty.
    Always returns ≤ alpha_in (you can never drain more than the reserve).
    """
    if cost_tao <= 0 or tao_in <= 0 or alpha_in <= 0:
        return 0.0
    received = alpha_in - (tao_in * alpha_in) / (tao_in + cost_tao)
    # Numerical safety: the formula is monotone-bounded on (0, α_in) but
    # FP rounding at extreme inputs can produce tiny negatives or values
    # marginally exceeding the reserve.
    return max(0.0, min(alpha_in, received))


def tao_received(tao_in: float, alpha_in: float, alpha_amount: float) -> float:
    """Inverse: unstake `alpha_amount` α → receive how much TAO?"""
    if alpha_amount <= 0 or tao_in <= 0 or alpha_in <= 0:
        return 0.0
    received = tao_in - (tao_in * alpha_in) / (alpha_in + alpha_amount)
    return max(0.0, min(tao_in, received))


def spot_price(tao_in: float, alpha_in: float) -> float:
    """Alpha price in TAO. price = τ_in / α_in."""
    if alpha_in <= 0:
        return 0.0
    return tao_in / alpha_in


def slippage_pct(tao_in: float, alpha_in: float, cost_tao: float) -> float:
    """
    Slippage as a percentage of the ideal swap. 0.0 means a perfect fill
    (only possible at cost → 0). 100.0 means full drain.

    Definition matches the LearnBittensor docs example:
        ideal = cost / spot_price = cost · α_in / τ_in
        actual = stake_received(cost)
        slippage = (ideal - actual) / ideal · 100
    """
    if cost_tao <= 0 or tao_in <= 0 or alpha_in <= 0:
        return 0.0
    ideal  = cost_tao * alpha_in / tao_in
    actual = stake_received(tao_in, alpha_in, cost_tao)
    if ideal <= 0:
        return 0.0
    return max(0.0, (ideal - actual) / ideal * 100.0)


def cost_for_target_slippage(
    tao_in: float, alpha_in: float, target_pct: float
) -> Optional[float]:
    """
    Closed-form solve for the TAO trade size at which slippage equals
    `target_pct` (e.g., 1.0 = 1%).

    Derivation:
        slippage = (ideal − actual) / ideal
                 = 1 − (α_in − τ_in·α_in/(τ_in+c)) / (c·α_in/τ_in)
                 = 1 − (τ_in − τ_in²/(τ_in+c)) / c
                 = 1 − τ_in / (τ_in + c)
                 = c / (τ_in + c)
        ⇒  c = τ_in · s / (1 − s)        where s = target_pct/100

    Returns None if inputs are invalid or s ∉ (0, 1).
    """
    if tao_in <= 0 or alpha_in <= 0:
        return None
    s = target_pct / 100.0
    if not (0.0 < s < 1.0):
        return None
    return tao_in * s / (1.0 - s)


# ── Depth tier classification ────────────────────────────────────────────────
# From the TaoDX feature list: "deep, healthy, moderate, or thin". Tiered by
# τ_in (the TAO side of the pool) since that's what bounds how much capital
# can move through without massive slippage. Thresholds are pragmatic —
# 5,000τ would absorb a single ~50τ trade with <1% slippage; 200τ pools are
# basically untradable at any meaningful size.

_DEPTH_TIERS: List[Tuple[float, str]] = [
    (5_000.0, "deep"),
    (1_500.0, "healthy"),
    (   400.0, "moderate"),
    (     0.0, "thin"),
]


def depth_tier(tao_in: float) -> str:
    for floor, label in _DEPTH_TIERS:
        if tao_in >= floor:
            return label
    return "thin"


# ── Liquidity cliff trio ─────────────────────────────────────────────────────


@dataclass
class LiquidityCliff:
    """The exact TAO size at which a stake crosses a slippage threshold."""
    threshold_pct: float
    cost_tao:      Optional[float]   # None if pool is degenerate

    def to_dict(self) -> dict:
        return asdict(self)


def liquidity_cliffs(
    tao_in: float, alpha_in: float, thresholds: Tuple[float, ...] = (1.0, 2.0, 5.0)
) -> List[LiquidityCliff]:
    return [
        LiquidityCliff(t, cost_for_target_slippage(tao_in, alpha_in, t))
        for t in thresholds
    ]


# ── Exit scenarios (alpha price ±50%) ────────────────────────────────────────


@dataclass
class ExitScenario:
    """
    What you'd unwind back to in TAO if alpha price moved by `move_pct`
    relative to spot, *assuming the pool reserves rebalance to that price
    while preserving k = τ_in · α_in*. This is the same model TaoDX uses:
    "Exit scenarios if alpha moves ±50%".

    At the new price p' = p · (1 + move_pct/100):
        new_τ = √(k · p')
        new_α = √(k / p')
    Then unstake the operator's alpha holding (entry_alpha) into the
    rebalanced pool to get TAO out.
    """
    move_pct:        float
    new_price_tao:   float
    new_tao_in:      float
    new_alpha_in:    float
    tao_out:         float        # TAO received on full unstake of entry_alpha
    pnl_tao:         float        # tao_out − cost_tao_at_entry
    pnl_pct:         float        # pnl_tao / cost_tao_at_entry · 100

    def to_dict(self) -> dict:
        return asdict(self)


def exit_scenario(
    tao_in: float,
    alpha_in: float,
    cost_tao: float,
    entry_alpha: float,
    move_pct: float,
) -> ExitScenario:
    """
    Project a single ±X% scenario. `entry_alpha` is what the operator would
    receive at the current pool state for `cost_tao` (computed by the caller
    via stake_received() so the simulator endpoint can keep the math chain
    visible).
    """
    k       = tao_in * alpha_in
    spot    = spot_price(tao_in, alpha_in)
    new_p   = spot * (1.0 + move_pct / 100.0)
    if new_p <= 0 or k <= 0:
        return ExitScenario(move_pct, 0.0, 0.0, 0.0, 0.0, -cost_tao, -100.0)
    new_tao   = math.sqrt(k * new_p)
    new_alpha = math.sqrt(k / new_p)
    out_tao   = tao_received(new_tao, new_alpha, entry_alpha)
    pnl       = out_tao - cost_tao
    pnl_pct   = (pnl / cost_tao * 100.0) if cost_tao > 0 else 0.0
    return ExitScenario(
        move_pct      = move_pct,
        new_price_tao = new_p,
        new_tao_in    = new_tao,
        new_alpha_in  = new_alpha,
        tao_out       = out_tao,
        pnl_tao       = pnl,
        pnl_pct       = pnl_pct,
    )


# ── HODL opportunity cost ────────────────────────────────────────────────────


def hodl_opportunity_cost_usd(
    cost_tao:           float,
    entry_alpha:        float,
    tao_price_now_usd:  float,
    tao_price_30d_usd:  float,
    alpha_price_30d_tao: float,
    alpha_price_now_tao: float,
) -> dict:
    """
    Answers: "If 30 days ago I had spent `cost_tao` TAO on alpha at the
    then-spot price, would plain TAO have beaten holding this alpha?"

    Inputs are nominal (no slippage adjustment — TaoDX's headline metric is
    the simple HODL comparison, not slippage-adjusted P&L which is already
    answered by the slippage block above).

        tao_path:   cost_tao TAO held to today → cost_tao · tao_price_now_usd
        alpha_path: cost_tao bought alpha at 30d-spot, held to today →
                    (cost_tao / alpha_price_30d_tao) · alpha_price_now_tao
                    · tao_price_now_usd
        delta_usd:  alpha_path − tao_path  (positive = alpha won)

    Returns a structured dict; all USD figures rounded to 2 decimals.
    """
    if cost_tao <= 0 or alpha_price_30d_tao <= 0 or tao_price_now_usd <= 0:
        return {
            "tao_path_usd":   0.0,
            "alpha_path_usd": 0.0,
            "delta_usd":      0.0,
            "winner":         "n/a",
        }
    tao_path_usd   = cost_tao * tao_price_now_usd
    alpha_qty      = cost_tao / alpha_price_30d_tao
    alpha_path_usd = alpha_qty * alpha_price_now_tao * tao_price_now_usd
    delta_usd      = alpha_path_usd - tao_path_usd
    winner         = "alpha" if delta_usd > 0 else ("tao" if delta_usd < 0 else "tie")
    return {
        "tao_path_usd":   round(tao_path_usd, 2),
        "alpha_path_usd": round(alpha_path_usd, 2),
        "delta_usd":      round(delta_usd, 2),
        "winner":         winner,
    }


# ── Slippage curve sampler ───────────────────────────────────────────────────


def slippage_curve(
    tao_in: float, alpha_in: float, max_cost_tao: float, points: int = 64
) -> List[Tuple[float, float]]:
    """
    Returns N (cost_tao, slippage_pct) samples logarithmically spaced from
    a small floor to `max_cost_tao`. Used by the UI to render the slippage
    curve. Log spacing keeps the curve readable across 4+ orders of magnitude
    (1τ → 10,000τ pools).
    """
    if max_cost_tao <= 0 or tao_in <= 0 or alpha_in <= 0:
        return []
    # Floor: 0.1% of pool depth, capped at 0.001τ minimum so we don't
    # collapse onto the y-axis on huge pools.
    floor = max(0.001, tao_in * 0.001)
    if floor >= max_cost_tao:
        floor = max_cost_tao * 0.001
    log_lo = math.log(floor)
    log_hi = math.log(max_cost_tao)
    out: List[Tuple[float, float]] = []
    for i in range(points):
        t = i / (points - 1)
        cost = math.exp(log_lo + t * (log_hi - log_lo))
        out.append((round(cost, 6), round(slippage_pct(tao_in, alpha_in, cost), 4)))
    return out