from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, Enum
from sqlalchemy.sql import func
import enum
from db.database import Base


class TradeType(str, enum.Enum):
    BUY = "buy"
    SELL = "sell"


class TradeStatus(str, enum.Enum):
    PENDING = "pending"
    EXECUTED = "executed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    trade_type = Column(String(10), nullable=False)       # buy / sell
    status = Column(String(20), default="pending")

    # Amounts
    amount = Column(Float, nullable=False)                 # TAO amount
    price_at_trade = Column(Float, nullable=False)         # USD price when trade executed
    usd_value = Column(Float, nullable=False)              # amount * price_at_trade
    fee = Column(Float, default=0.0)                       # network fee in TAO

    # P&L
    pnl = Column(Float, default=0.0)                       # realised P&L in USD
    pnl_pct = Column(Float, default=0.0)                   # P&L %

    # Strategy & signal
    strategy = Column(String(100), nullable=True)
    signal_reason = Column(Text, nullable=True)
    tx_hash = Column(String(255), nullable=True)           # on-chain tx hash

    # Bittensor specifics
    netuid = Column(Integer, nullable=True)
    network = Column(String(50), default="finney")

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    executed_at = Column(DateTime(timezone=True), nullable=True)

    # Error
    error_message = Column(Text, nullable=True)