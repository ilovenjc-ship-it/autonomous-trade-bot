from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text
from sqlalchemy.sql import func
from db.database import Base


class BotConfig(Base):
    __tablename__ = "bot_config"

    id = Column(Integer, primary_key=True, index=True, default=1)
    is_running = Column(Boolean, default=False, nullable=False)

    # Wallet
    wallet_name = Column(String(100), default="default")
    wallet_hotkey = Column(String(100), default="default")
    wallet_path = Column(String(255), default="~/.bittensor/wallets")
    coldkey_address = Column(String(255), nullable=True)
    hotkey_address = Column(String(255), nullable=True)
    wallet_balance = Column(Float, default=0.0)

    # Network
    network = Column(String(50), default="finney")
    netuid = Column(Integer, default=1)

    # Strategy
    active_strategy = Column(String(100), default="momentum")
    trade_amount = Column(Float, default=0.1)
    max_trade_amount = Column(Float, default=10.0)
    min_trade_amount = Column(Float, default=0.001)
    trade_interval = Column(Integer, default=300)
    max_daily_trades = Column(Integer, default=50)
    stop_loss_pct = Column(Float, default=5.0)
    take_profit_pct = Column(Float, default=10.0)

    # Stats
    total_trades = Column(Integer, default=0)
    successful_trades = Column(Integer, default=0)
    total_pnl = Column(Float, default=0.0)
    daily_trades = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_trade_at = Column(DateTime(timezone=True), nullable=True)
    daily_reset_at = Column(DateTime(timezone=True), nullable=True)

    # Status
    status_message = Column(Text, default="Bot initialized")
    error_message = Column(Text, nullable=True)