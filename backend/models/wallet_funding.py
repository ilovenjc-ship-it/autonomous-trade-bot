"""
WalletFunding — records every TAO deposit into the bot's coldkey wallet.

Sources:
  "manual"    — operator-entered via the UI (always available)
  "taostats"  — pulled from Taostats public API (chain-derived, auto-detected)
  "chain"     — directly from Bittensor SDK substrate query (future)

This table is the source of truth for "how much have we put in", enabling
the Transactions page to show real net P&L accounting — not guesswork.
"""
from sqlalchemy import Column, Integer, String, Float, Text, DateTime
from sqlalchemy.sql import func

from db.database import Base


class WalletFunding(Base):
    __tablename__ = "wallet_fundings"

    id           = Column(Integer,  primary_key=True, autoincrement=True)
    amount_tao   = Column(Float,    nullable=False)                # TAO received
    from_address = Column(String(100), nullable=True)             # sender address
    tx_hash      = Column(String(255), nullable=True, unique=True) # on-chain tx hash
    block_number = Column(Integer,  nullable=True)                 # finney block
    funded_at    = Column(DateTime(timezone=True), nullable=False) # when it arrived
    note         = Column(Text,     nullable=True)                 # e.g. "Initial seed"
    source       = Column(String(50), default="manual")           # manual/taostats/chain
    created_at   = Column(DateTime(timezone=True), server_default=func.now())