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
from routers import bot, trades, price, strategies, fleet, analytics, market, consensus, agent, alerts, wallet, pnl

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ── Startup / Shutdown ──────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting TAO Trading Bot backend…")

    # Init DB & tables
    await init_db()
    logger.info("Database initialised")

    # Seed default strategies
    await seed_strategies()

    # Seed activity log startup events
    seed_activity()

    # Load primary validator (TaoBot) from config if already set
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
                logger.warning(
                    "No target_validator_hotkey in config — subnet router will paper-mode "
                    "LIVE strategies until hotkey is set via POST /api/bot/validator"
                )
    except Exception as e:
        logger.error(f"Failed to load primary validator from config: {e}")

    # Attempt initial Finney mainnet connection (non-blocking background task)
    # Sets bittensor_service.connected = True so the first LIVE cycle can fire.
    import asyncio as _aio
    async def _connect():
        try:
            info = await bittensor_service.get_chain_info()
            if info.get("connected"):
                logger.info(
                    f"Finney connected at startup — block #{info.get('block')} "
                    f"balance τ{info.get('balance_tao', 0):.4f}"
                )
            else:
                logger.warning("Finney connection attempted at startup but not yet reachable — "
                               "cycle_service will retry each cycle.")
        except Exception as _e:
            logger.warning(f"Startup Finney connect failed: {_e} — will retry each cycle.")
    _aio.create_task(_connect())

    # Start price feed
    await price_service.start()
    logger.info("Price feed started")

    # Wait briefly for first price tick, then start autonomous cycle engine
    import asyncio
    await asyncio.sleep(3)
    await cycle_service.start(interval_seconds=60)
    logger.info("Autonomous cycle engine started (60s interval)")

    # Start II Agent orchestrator (analyses every 5 minutes)
    await agent_service.start(interval=300)
    logger.info("II Agent orchestrator started (300s interval)")

    # Start Autonomous Promotion Engine (checks gates every 5 min, rebalances every 24h)
    await promotion_service.start()
    logger.info("Autonomous promotion engine started (gate check 300s, rebalance 86400s)")

    yield

    # Shutdown
    logger.info("Shutting down…")
    await promotion_service.stop()
    await agent_service.stop()
    await cycle_service.stop()
    await price_service.stop()


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
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