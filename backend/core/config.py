from pydantic_settings import BaseSettings
from typing import Optional
import os


def _build_async_db_url(raw: str) -> str:
    """Convert Railway's postgres:// URL to the async SQLAlchemy dialect."""
    if raw.startswith("postgres://"):
        raw = raw.replace("postgres://", "postgresql+asyncpg://", 1)
    elif raw.startswith("postgresql://") and "+asyncpg" not in raw:
        raw = raw.replace("postgresql://", "postgresql+asyncpg://", 1)
    return raw


def _build_sync_db_url(raw: str) -> str:
    """Convert Railway's postgres:// URL to the sync SQLAlchemy dialect."""
    if raw.startswith("postgres://"):
        raw = raw.replace("postgres://", "postgresql://", 1)
    # strip async driver if present
    raw = raw.replace("postgresql+asyncpg://", "postgresql://")
    return raw


# ── Raw DATABASE_URL from environment (Railway injects this automatically) ────
_RAW_DB = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./trading_bot.db")
_IS_SQLITE = "sqlite" in _RAW_DB


class Settings(BaseSettings):
    # App
    APP_NAME: str = "TAO Trading Bot"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False  # off in production

    # Server — Railway sets $PORT dynamically
    HOST: str = "0.0.0.0"
    PORT: int = int(os.environ.get("PORT", 8001))

    # Database — auto-switches between SQLite (dev) and Postgres (Railway)
    DATABASE_URL: str = (
        _RAW_DB if _IS_SQLITE else _build_async_db_url(_RAW_DB)
    )
    DATABASE_SYNC_URL: str = (
        "sqlite:///./trading_bot.db" if _IS_SQLITE else _build_sync_db_url(_RAW_DB)
    )

    # CORS — accepts Railway frontend URL via env var + local dev origins
    FRONTEND_URL: str = os.environ.get("FRONTEND_URL", "http://localhost:3002")
    ALLOWED_ORIGINS: list = list(filter(None, [
        os.environ.get("FRONTEND_URL"),          # Railway frontend URL
        os.environ.get("RAILWAY_STATIC_URL"),    # Railway static hosting URL
        "http://localhost:3002",
        "http://localhost:3000",
        "http://localhost:3004",
        "http://127.0.0.1:3002",
    ]))

    # Bittensor
    BT_NETWORK: str = "finney"
    BT_NETUID: int = 1
    BT_WALLET_NAME: str = "default"
    BT_WALLET_HOTKEY: str = "default"
    BT_WALLET_PATH: str = "~/.bittensor/wallets"
    BT_MNEMONIC: Optional[str] = None

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