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
from routers import bot, trades, price, strategies

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

    # Start price feed
    await price_service.start()
    logger.info("Price feed started")

    yield

    # Shutdown
    logger.info("Shutting down…")
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
                    )
                )
        await db.commit()
    logger.info("Strategies seeded")


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