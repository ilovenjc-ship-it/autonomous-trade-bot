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
    from models import bot_config, trade, price_history, strategy, wallet_funding, pool_snapshot  # noqa: F401

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
        # Added Session XV (originally as openclaw_*): Fleet Consensus BFT
        # round counters persisted across redeployments. Renamed Day 13
        # 2026-05-26 — see _column_renames below for the in-place rename
        # against Railway prod. These ADD entries are defensive — they catch
        # fresh-DB cases where create_all bypassed creating these columns
        # (and they're no-op idempotent when the columns already exist).
        ("bot_config", "fleet_consensus_total_rounds",    "INTEGER DEFAULT 0"),
        ("bot_config", "fleet_consensus_approved_rounds", "INTEGER DEFAULT 0"),
        ("bot_config", "fleet_consensus_rejected_rounds", "INTEGER DEFAULT 0"),
        # Added in Session XIX: Execution Guard — AMM slippage estimate per trade.
        # Populated by cycle_service for all paper and live trades going forward.
        ("trades", "slippage_est", "REAL DEFAULT 0.0"),
        # Added Day 9 (Task #C): macro reference columns on price_history.
        # BTC was added to the live indicator dict in Day 8 R4 for the
        # macro_correlation rewrite. Persisting it alongside TAO lets us
        # replay macro_correlation against history and lets the local
        # /api/price/history reader serve a full picture without
        # re-querying CoinGecko's market_chart endpoint.
        ("price_history", "btc_price_usd",            "REAL"),
        ("price_history", "btc_price_change_pct_24h", "REAL"),
    ]

    # ── Column renames — Day 13 2026-05-26 (OpenClaw → Fleet Consensus) ──
    # Run BEFORE the ADD list so Railway prod data is preserved (the rename
    # moves the existing values onto the new column names). On fresh DBs,
    # the rename fails harmlessly (old column doesn't exist) and the ADD
    # list above creates the new columns. On second-and-later boots the
    # rename also fails harmlessly (old columns no longer exist).
    # Idempotent across (a) Railway prod existing DB, (b) fresh dev DB,
    # (c) every subsequent boot. Same try/except discipline as ADD.
    # Both Postgres and SQLite 3.25+ accept this RENAME COLUMN syntax.
    _column_renames = [
        ("bot_config", "openclaw_total_rounds",    "fleet_consensus_total_rounds"),
        ("bot_config", "openclaw_approved_rounds", "fleet_consensus_approved_rounds"),
        ("bot_config", "openclaw_rejected_rounds", "fleet_consensus_rejected_rounds"),
    ]

    async with async_engine.begin() as conn:
        # Renames first — preserves data on existing DBs.
        for table, old_col, new_col in _column_renames:
            try:
                await conn.execute(
                    _text(f"ALTER TABLE {table} RENAME COLUMN {old_col} TO {new_col}")
                )
                _log.warning(
                    f"DB migration: renamed {table}.{old_col} → {new_col} "
                    f"(OpenClaw → Fleet Consensus rename Day 13 2026-05-26)"
                )
            except Exception:
                # Old column doesn't exist (fresh DB) or new column already
                # exists (post-rename boot) — both are no-op cases.
                pass

        # Adds second — defensive for fresh DBs (create_all should already
        # have made these, but if not, the ADD catches it).
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