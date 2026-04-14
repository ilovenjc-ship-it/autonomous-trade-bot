from sqlalchemy import Column, Integer, Float, DateTime, String
from sqlalchemy.sql import func
from db.database import Base


class PriceHistory(Base):
    __tablename__ = "price_history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    symbol = Column(String(20), default="TAO", nullable=False)
    price_usd = Column(Float, nullable=False)
    volume_24h = Column(Float, nullable=True)
    market_cap = Column(Float, nullable=True)
    price_change_24h = Column(Float, nullable=True)
    price_change_pct_24h = Column(Float, nullable=True)

    # Technical indicators (pre-computed)
    rsi_14 = Column(Float, nullable=True)
    ema_9 = Column(Float, nullable=True)
    ema_21 = Column(Float, nullable=True)
    sma_50 = Column(Float, nullable=True)
    macd = Column(Float, nullable=True)
    macd_signal = Column(Float, nullable=True)
    bb_upper = Column(Float, nullable=True)
    bb_lower = Column(Float, nullable=True)
    bb_mid = Column(Float, nullable=True)

    recorded_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)