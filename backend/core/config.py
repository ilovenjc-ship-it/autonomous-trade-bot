from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    # App
    APP_NAME: str = "TAO Trading Bot"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8001

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./trading_bot.db"
    DATABASE_SYNC_URL: str = "sqlite:///./trading_bot.db"

    # CORS
    FRONTEND_URL: str = "http://localhost:3002"
    ALLOWED_ORIGINS: list = [
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3000",
    ]

    # Bittensor
    BT_NETWORK: str = "finney"
    BT_NETUID: int = 1
    BT_WALLET_NAME: str = "default"
    BT_WALLET_HOTKEY: str = "default"
    BT_WALLET_PATH: str = "~/.bittensor/wallets"

    # Trading defaults
    DEFAULT_TRADE_AMOUNT: float = 0.1        # TAO
    MAX_TRADE_AMOUNT: float = 10.0           # TAO
    MIN_TRADE_AMOUNT: float = 0.001          # TAO
    TRADE_INTERVAL_SECONDS: int = 300        # 5 min
    MAX_DAILY_TRADES: int = 50
    STOP_LOSS_PCT: float = 5.0               # %
    TAKE_PROFIT_PCT: float = 10.0            # %

    # Price feed
    PRICE_FEED_URL: str = "https://api.coingecko.com/api/v3"
    PRICE_UPDATE_INTERVAL: int = 30          # seconds

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()