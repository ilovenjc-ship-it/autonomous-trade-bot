"""
StakePosition — tracks every on-chain LIVE stake so the stop-loss /
take-profit monitor can compare entry α-price against current price
and force-exit underwater positions.

Lifecycle:
  open       ← created when a LIVE BUY (add_stake) confirms on-chain
  sl_hit     ← stop-loss triggered, unstake executed
  tp_hit     ← take-profit triggered, unstake executed
  closed     ← closed by a normal LIVE SELL cycle signal
  failed_exit← exit attempted but unstake failed; will retry next cycle
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Index
from sqlalchemy.sql import func
from db.database import Base


class StakePosition(Base):
    __tablename__ = "stake_positions"

    id      = Column(Integer, primary_key=True, autoincrement=True)

    # ── Position identity ────────────────────────────────────────────────────
    netuid   = Column(Integer,       nullable=False, index=True)
    hotkey   = Column(String(255),   nullable=False)
    strategy = Column(String(100),   nullable=True)

    # ── Entry price ──────────────────────────────────────────────────────────
    # α-price is the rate 1 αTAO ↔ 1 TAO at the moment of staking.
    # Captured from bittensor_service._subnet_prices[netuid] immediately after
    # the on-chain add_stake call confirms.
    entry_alpha_price = Column(Float, nullable=False)

    # TAO amount sent into the subnet (what we paid)
    tao_staked = Column(Float, nullable=False)

    # ── Thresholds (snapshot at open time for auditability) ──────────────────
    sl_pct = Column(Float, nullable=True)   # e.g. 0.08 = stop-loss at -8%
    tp_pct = Column(Float, nullable=True)   # e.g. 0.25 = take-profit at +25%

    # ── Lifecycle ────────────────────────────────────────────────────────────
    # open | sl_hit | tp_hit | closed | failed_exit
    status = Column(String(20), default="open", index=True)

    # ── Transaction hashes ───────────────────────────────────────────────────
    open_tx_hash  = Column(String(255), nullable=True)
    close_tx_hash = Column(String(255), nullable=True)

    # ── Realized P&L ─────────────────────────────────────────────────────────
    # Approximate TAO recovered minus TAO staked.
    # Negative = loss, positive = profit.
    realized_pnl_tao = Column(Float, nullable=True)

    # ── Timestamps ───────────────────────────────────────────────────────────
    opened_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    # ── Compound index for fast open-position lookups ─────────────────────────
    __table_args__ = (
        Index("ix_stake_pos_open", "status", "netuid"),
    )