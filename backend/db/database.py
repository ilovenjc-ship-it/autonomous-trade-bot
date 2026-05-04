from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import create_engine
from core.config import settings

# SQLite requires check_same_thread=False; Postgres does not need it
_is_sqlite = "sqlite" in settings.DATABASE_URL

# Railway's managed PostgreSQL requires SSL — asyncpg won't connect without it.
# SQLite needs check_same_thread=False.
if _is_sqlite:
    _async_connect_args: dict = {"check_same_thread": False}
    _sync_connect_args: dict = {"check_same_thread": False}
else:
    # asyncpg accepts ssl=True or ssl="require" via connect_args
    _async_connect_args = {"ssl": "require"}
    _sync_connect_args = {}  # psycopg2 reads sslmode from URL

# Async engine for FastAPI
async_engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args=_async_connect_args,
    pool_pre_ping=True,    # detect stale connections
    pool_recycle=300,      # recycle connections every 5 min
)

# Sync engine for Alembic migrations
sync_engine = create_engine(
    settings.DATABASE_SYNC_URL,
    connect_args=_sync_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """
    Create all tables on startup.

    Uses create_all(checkfirst=True) which is idempotent — safe to call on
    every restart. New tables added in later deploys are created automatically
    without affecting existing data.

    Also runs explicit ALTER TABLE migrations for columns added to existing
    tables after initial deployment (SQLAlchemy create_all does NOT alter
    existing tables — only creates missing ones).
    """
    # Import every model module so SQLAlchemy's metadata knows about them.
    # Any model NOT imported here will NOT be created by create_all.
    from models import bot_config, trade, price_history, strategy, wallet_funding  # noqa: F401

    async with async_engine.begin() as conn:
        # checkfirst=True (default) — skips tables that already exist
        await conn.run_sync(Base.metadata.create_all)

    # ── SQLite column migrations ─────────────────────────────────────────────
    # For columns added to existing models after the table was first created,
    # SQLite requires an explicit ALTER TABLE. We attempt each migration and
    # silently ignore "duplicate column" errors — making these idempotent.
    from sqlalchemy import text as _text
    import logging as _logging
    _log = _logging.getLogger(__name__)

    _column_migrations = [
        # Added in Session XV: tracks when FORCE_PAPER_MODE wiped stats.
        # Required by analytics router and cycle service.
        ("strategies", "stats_reset_at", "DATETIME"),
        # Added in Session XV: OpenClaw BFT round counters persisted across
        # redeployments so the all-time consensus record survives restarts.
        ("bot_config", "openclaw_total_rounds",    "INTEGER DEFAULT 0"),
        ("bot_config", "openclaw_approved_rounds", "INTEGER DEFAULT 0"),
        ("bot_config", "openclaw_rejected_rounds", "INTEGER DEFAULT 0"),
        # Added in Session XIX: Execution Guard — AMM slippage estimate per trade.
        # Populated by cycle_service for all paper and live trades going forward.
        ("trades", "slippage_est", "REAL DEFAULT 0.0"),
    ]

    async with async_engine.begin() as conn:
        for table, column, col_type in _column_migrations:
            try:
                await conn.execute(
                    _text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
                )
                _log.info(f"DB migration: added {table}.{column} ({col_type})")
            except Exception:
                # Column already exists — this is the normal case after first run
                pass

    # Explicit per-table verification log so startup confirms each table
    from sqlalchemy import inspect as sa_inspect
    async with async_engine.connect() as conn:
        try:
            tables = await conn.run_sync(
                lambda sync_conn: sa_inspect(sync_conn).get_table_names()
            )
            _log.info(f"DB tables confirmed: {sorted(tables)}")
        except Exception as _e:
            _log.warning(f"DB table list check failed: {_e}")