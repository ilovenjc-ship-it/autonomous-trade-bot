from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Optional
import os


def _build_async_db_url(raw: str) -> str:
    """Convert any postgres:// or postgresql:// URL to postgresql+asyncpg://.

    Railway injects DATABASE_URL as postgres:// or postgresql:// — SQLAlchemy
    requires the asyncpg dialect prefix. Also strips ?sslmode=require because
    asyncpg doesn't parse sslmode from the URL; we pass ssl="require" via
    connect_args instead.
    """
    if not raw or "sqlite" in raw:
        return raw  # leave SQLite URLs unchanged
    if raw.startswith("postgres://"):
        raw = raw.replace("postgres://", "postgresql+asyncpg://", 1)
    elif raw.startswith("postgresql://") and "+asyncpg" not in raw:
        raw = raw.replace("postgresql://", "postgresql+asyncpg://", 1)
    # Strip sslmode — handled via connect_args ssl="require"
    raw = raw.split("?sslmode=")[0].split("&sslmode=")[0]
    return raw


def _build_sync_db_url(raw: str) -> str:
    """Convert to sync SQLAlchemy dialect (psycopg2)."""
    if not raw or "sqlite" in raw:
        return raw
    if raw.startswith("postgres://"):
        raw = raw.replace("postgres://", "postgresql://", 1)
    raw = raw.replace("postgresql+asyncpg://", "postgresql://")
    # Strip sslmode from sync URL too (psycopg2 uses different SSL config)
    raw = raw.split("?sslmode=")[0].split("&sslmode=")[0]
    return raw


# ── Raw DATABASE_URL from environment ────────────────────────────────────────
_RAW_DB = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./trading_bot.db")
_IS_SQLITE = "sqlite" in _RAW_DB


class Settings(BaseSettings):
    # App
    APP_NAME: str = "TAO Trading Bot"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Server — Railway sets $PORT dynamically
    HOST: str = "0.0.0.0"
    PORT: int = int(os.environ.get("PORT", 8001))

    # Database — Railway injects DATABASE_URL as raw postgres:// URL.
    # The field_validator below converts it to the asyncpg dialect at load time
    # so settings.DATABASE_URL is always a valid SQLAlchemy async URL.
    DATABASE_URL: str = (
        _RAW_DB if _IS_SQLITE else _build_async_db_url(_RAW_DB)
    )
    DATABASE_SYNC_URL: str = (
        "sqlite:///./trading_bot.db" if _IS_SQLITE else _build_sync_db_url(_RAW_DB)
    )

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalise_async_db_url(cls, v: object) -> str:
        """Ensure pydantic-settings always stores the asyncpg-compatible URL.

        Without this, pydantic reads DATABASE_URL from the environment and
        stores it verbatim (postgres://...), then db/database.py calls
        create_async_engine() with that raw URL → SQLAlchemy crashes at import
        time because 'postgres' is not a recognised async dialect.
        """
        if not v or not isinstance(v, str):
            return "sqlite+aiosqlite:///./trading_bot.db"
        return _build_async_db_url(v)

    @field_validator("DATABASE_SYNC_URL", mode="before")
    @classmethod
    def normalise_sync_db_url(cls, v: object) -> str:
        if not v or not isinstance(v, str):
            return "sqlite:///./trading_bot.db"
        return _build_sync_db_url(v)

    # CORS
    FRONTEND_URL: str = os.environ.get("FRONTEND_URL", "http://localhost:3002")
    ALLOWED_ORIGINS: list = list(filter(None, [
        os.environ.get("FRONTEND_URL"),
        os.environ.get("RAILWAY_STATIC_URL"),
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
    DEFAULT_TRADE_AMOUNT: float = 0.1
    MAX_TRADE_AMOUNT: float = 10.0
    MIN_TRADE_AMOUNT: float = 0.001
    TRADE_INTERVAL_SECONDS: int = 300
    MAX_DAILY_TRADES: int = 50
    STOP_LOSS_PCT: float = 5.0
    TAKE_PROFIT_PCT: float = 10.0

    # Price feed
    PRICE_FEED_URL: str = "https://api.coingecko.com/api/v3"
    PRICE_UPDATE_INTERVAL: int = 30

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()