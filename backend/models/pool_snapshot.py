"""
PoolSnapshot — Day 12 (Pre-Trade Simulator)
============================================

Per-subnet AMM reserve snapshot. Bittensor's dTAO subnets each operate as a
constant-product AMM with two reserves:

    τ_in  · α_in  =  k

The price of alpha (in TAO) is τ_in / α_in. Slippage on a stake of `cost` TAO
is the deviation between the spot price and the actual fill price implied by
the bonding-curve trade math:

    Stake_received = α_in − (τ_in · α_in) / (τ_in + cost)

These reserves move continuously as miners/operators stake and unstake. To
power the Pre-Trade Simulator we snapshot them on the same 5-minute cadence
as the metagraph fetch (subnet_cache_service._fetch_metagraphs) and persist
them so the simulator can render:
    • live slippage curve from the latest snapshot,
    • 7d / 30d pool-depth sparkline,
    • 14-day stacked buy/sell flow (pairs with whale_flow_events),
    • 24h pool turnover with a depth-tier classification.

Source of truth: Bittensor SDK `AsyncSubtensor.subnet(netuid)` →
DynamicInfo with `.tao_in` (Balance) and `.alpha_in` (Balance). Both are
read once per metagraph cycle and stored in TAO / alpha float units (not
rao) for ergonomics — full precision is preserved by SQLite REAL / Postgres
DOUBLE PRECISION.
"""
from sqlalchemy import Column, Integer, Float, DateTime, Index
from sqlalchemy.sql import func
from db.database import Base


class PoolSnapshot(Base):
    __tablename__ = "pool_snapshots"

    id          = Column(Integer, primary_key=True, index=True, autoincrement=True)
    netuid      = Column(Integer, nullable=False, index=True)

    # AMM reserves at snapshot time (in TAO and alpha units, NOT rao).
    tao_in      = Column(Float, nullable=False)   # τ
    alpha_in    = Column(Float, nullable=False)   # α
    # Spot price = tao_in / alpha_in. Persisted alongside reserves so the
    # simulator can render a price-only sparkline without recomputing.
    price_tao   = Column(Float, nullable=False)

    recorded_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


# Composite index — every simulator query is "latest N snapshots for netuid X
# ordered by recorded_at DESC". A composite index on (netuid, recorded_at)
# makes that lookup O(log n) at 30-day horizon (≈8.6k rows per subnet).
Index(
    "ix_pool_snapshots_netuid_recorded_at",
    PoolSnapshot.netuid,
    PoolSnapshot.recorded_at.desc(),
)