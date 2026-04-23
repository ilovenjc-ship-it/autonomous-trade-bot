"""
TAO Autonomous Trading Bot — FastAPI backend (port 8001)
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from db.database import init_db
from services.price_service import price_service
from services.strategy_service import DEFAULT_STRATEGIES
from services.activity_service import seed_startup as seed_activity
from services.cycle_service import cycle_service
from services.agent_service import agent_service
from services.bittensor_service import bittensor_service
from services.subnet_router import set_primary_validator
from services.promotion_service import promotion_service
from services.subnet_cache_service import subnet_cache_service
from routers import bot, trades, price, strategies, fleet, analytics, market, consensus, agent, alerts, wallet, pnl, override

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ── Startup / Shutdown ──────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup sequence designed to pass Railway healthchecks:
    - ALL setup is wrapped in try/except so crashes don't prevent yield
    - yield happens as early as possible → /health is reachable immediately
    - Heavy services (chain, cycles, agents) start in background AFTER yield
    """
    import asyncio as _aio
    import os as _os

    logger.info("=== TAO Trading Bot starting ===")
    from core.config import settings as _settings
    _db_display = _settings.DATABASE_URL.split("@")[-1] if "@" in _settings.DATABASE_URL else _settings.DATABASE_URL
    logger.info(f"PORT={_os.environ.get('PORT', 'NOT SET')} DB={_db_display}")

    # ── DB init (required, but catch failures) ──────────────────────────────
    try:
        await init_db()
        logger.info("Database initialised")
    except Exception as _e:
        logger.error(f"DB init failed: {_e} — continuing with degraded mode")

    # ── Seed default strategies ──────────────────────────────────────────────
    try:
        await seed_strategies()
    except Exception as _e:
        logger.error(f"Strategy seed failed: {_e}")

    # ── Seed activity log ────────────────────────────────────────────────────
    try:
        seed_activity()
    except Exception as _e:
        logger.error(f"Activity seed failed: {_e}")

    # ── Load primary validator from config ───────────────────────────────────
    try:
        from sqlalchemy import select
        from db.database import AsyncSessionLocal
        from models.bot_config import BotConfig
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(BotConfig).where(BotConfig.id == 1))
            cfg = result.scalar_one_or_none()
            if cfg and cfg.target_validator_hotkey:
                set_primary_validator(cfg.target_validator_hotkey)
                logger.info(f"Primary validator loaded: {cfg.target_validator_hotkey[:20]}…")
            else:
                logger.warning("No target_validator_hotkey in config — paper mode until set")
    except Exception as _e:
        logger.error(f"Validator load failed: {_e}")

    # ── Schedule all heavy services as background task ───────────────────────
    # Fires AFTER yield — guarantees /health responds before any I/O starts.
    async def _boot_services():
        await _aio.sleep(3)  # let healthcheck pass first

        try:
            info = await bittensor_service.get_chain_info()
            if info.get("connected"):
                logger.info(f"Finney connected — block #{info.get('block')}")
            else:
                logger.warning("Finney not reachable at boot — cycle will retry")
        except Exception as _e:
            logger.warning(f"Finney connect skipped: {_e}")

        try:
            await price_service.start()
            logger.info("Price feed started")
        except Exception as _e:
            logger.error(f"Price feed start failed: {_e}")

        try:
            await subnet_cache_service.start()
            logger.info("Subnet cache started — real on-chain data active")
        except Exception as _e:
            logger.error(f"Subnet cache start failed: {_e}")

        await _aio.sleep(3)

        try:
            await cycle_service.start(interval_seconds=60)
            logger.info("Cycle engine started")
        except Exception as _e:
            logger.error(f"Cycle engine start failed: {_e}")

        try:
            await agent_service.start(interval=300)
            logger.info("Agent orchestrator started")
        except Exception as _e:
            logger.error(f"Agent start failed: {_e}")

        try:
            await promotion_service.start()
            logger.info("Promotion engine started")
        except Exception as _e:
            logger.error(f"Promotion engine start failed: {_e}")

    _aio.create_task(_boot_services())

    logger.info("=== Lifespan ready — /health is live ===")
    yield  # ← Railway healthcheck passes from here

    # ── Graceful shutdown ────────────────────────────────────────────────────
    logger.info("Shutting down services…")
    for svc in [promotion_service, agent_service, cycle_service, price_service, subnet_cache_service]:
        try:
            await svc.stop()
        except Exception as _e:
            logger.error(f"Stop failed for {svc}: {_e}")


async def seed_strategies():
    """Insert default strategy rows if they don't exist."""
    from db.database import AsyncSessionLocal
    from sqlalchemy import select
    from models.strategy import Strategy

    async with AsyncSessionLocal() as db:
        for s in DEFAULT_STRATEGIES:
            result = await db.execute(
                select(Strategy).where(Strategy.name == s["name"])
            )
            existing = result.scalar_one_or_none()
            if not existing:
                db.add(
                    Strategy(
                        name=s["name"],
                        display_name=s["display_name"],
                        description=s["description"],
                        parameters=s["parameters"],
                        is_active=s.get("is_active", False),
                        mode=s.get("mode", "PAPER_ONLY"),
                        win_trades=s.get("win_trades", 0),
                        loss_trades=s.get("loss_trades", 0),
                        total_trades=s.get("total_trades", 0),
                        win_rate=s.get("win_rate", 0.0),
                        total_pnl=s.get("total_pnl", 0.0),
                        cycles_completed=s.get("cycles_completed", 0),
                    )
                )
        await db.commit()
    logger.info("Strategies seeded — 12 strategies initialised")


# ── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Autonomous TAO trading bot on Bittensor Finney mainnet",
    lifespan=lifespan,
)

# On Railway, allow all origins initially — tighten by setting FRONTEND_URL env var
# once both services are deployed and URLs are known.
import os as _os
_cors_origins = (
    ["*"] if _os.environ.get("RAILWAY_ENVIRONMENT")
    else settings.ALLOWED_ORIGINS
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_origins != ["*"],  # can't combine wildcard + credentials
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bot.router)
app.include_router(trades.router)
app.include_router(price.router)
app.include_router(strategies.router)
app.include_router(fleet.router)
app.include_router(analytics.router)
app.include_router(market.router)
app.include_router(consensus.router)
app.include_router(agent.router)
app.include_router(alerts.router)
app.include_router(wallet.router)
app.include_router(pnl.router)
app.include_router(override.router)


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "online",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )