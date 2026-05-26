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
from services.webhook_service import webhook_service
from services import signal_ingestor
from routers import bot, trades, price, strategies, fleet, analytics, market, consensus, agent, alerts, wallet, pnl, override
from routers import webhooks as webhooks_router
from routers import signal_feeds as signal_feeds_router
from routers import research as research_router
from routers import tools as tools_router
from routers import system as system_router
from routers import audit as audit_router
from routers import whale_flow as whale_flow_router

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

    # ── Fleet Consensus round counter restore is DEFERRED ──────────────────────────
    # Session XXVII (2026-05-12): moved to AFTER the FORCE_PAPER_MODE wipe
    # block. Previously loaded BEFORE the wipe, which caused a race:
    #   1. load_from_db() pulls old round counter into consensus_service
    #   2. wipe zeroes the BotConfig round-counter columns in DB
    #   3. next consensus round _persist_to_db() writes in-memory (pre-wipe)
    #      counter back to DB, obliterating the wipe.
    # Loading after the wipe ensures consensus_service reads the zeroed row.

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

    # ── Load webhook configs ─────────────────────────────────────────────────
    try:
        webhook_service.load()
        logger.info(f"WebhookService: {webhook_service.get_status()['count']} endpoint(s) loaded")
    except Exception as _e:
        logger.warning(f"WebhookService load failed: {_e}")

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

    # ── FOSSIL CLEANUP — schema/data-version pattern (Session XXVIII) ────────
    # Self-triggering wipe based on FOSSIL_CLEANUP_THRESHOLD alone. DECOUPLED
    # from FORCE_PAPER_MODE in Session XXVIII after discovering that XXV/XXVI/
    # XXVII wipes never actually fired on Railway: the entire wipe block was
    # nested inside `if FORCE_PAPER_MODE == "1"`, but that env var is "0" in
    # production (cleared in Session XVIII). Three sessions of "wipe fixes"
    # were dead code from Railway's perspective. Smoking gun from May 12
    # deploy log:  `Fleet Consensus loaded from DB — total=13651 approved=7611`.
    #
    # New architecture — two independent concerns, two independent blocks:
    #
    #   (1) FOSSIL CLEANUP (this block, unconditional):
    #       Idempotent data-integrity wipe gated by FOSSIL_CLEANUP_THRESHOLD.
    #       Bumping the constant in source forces a one-time re-wipe on next
    #       deploy. No env-var dependency. Wipes Strategy stats counters,
    #       paper trades, and BotConfig singleton. Does NOT touch Strategy.mode
    #       — fossil cleanup is about data integrity, not operational state.
    #
    #   (2) FORCE_PAPER_MODE override (next block, conditional):
    #       In-memory live-execution lock + demote-to-PAPER_ONLY in DB.
    #       Operational mode override. Independent of fossil cleanup.
    #
    # This separation lets us reset fossil data without demoting LIVE
    # strategies, AND lets us force paper mode without wiping data. The wipe
    # also runs reliably regardless of how FORCE_PAPER_MODE is configured.
    try:
        from sqlalchemy import update, select as _select
        from db.database import AsyncSessionLocal
        from models.strategy import Strategy
        from models.trade import Trade
        from models.bot_config import BotConfig
        from datetime import datetime, timezone as _tz
        _reset_ts = datetime.now(_tz.utc)

        # FOSSIL_CLEANUP_THRESHOLD — bump to force a one-time re-wipe on the
        # next deploy. After the wipe, every Strategy.stats_reset_at is stamped
        # with _reset_ts (now-UTC) which is > threshold, so subsequent restarts
        # skip the wipe automatically (idempotent).
        #
        # Session XXVIII (2026-05-13): bumped to 2026-05-13 14:00 UTC. This is
        # the FIRST time the wipe will actually run on Railway, because XXVIII
        # is the first session where the wipe is no longer gated by
        # FORCE_PAPER_MODE.
        # Session XXVIII patch-2 (2026-05-13 16:30 UTC): bumped again to
        # 17:00 UTC to force a re-run after the FIRST attempt threw on a tz
        # mismatch (`can't compare offset-naive and offset-aware datetimes`).
        # Despite the `DateTime(timezone=True)` column declaration, the asyncpg
        # driver was returning Strategy.stats_reset_at as offset-naive on this
        # deploy, and the comparison `naive < aware` raised TypeError before
        # the wipe block was reached. Defensive coercion added below.
        FOSSIL_CLEANUP_THRESHOLD = datetime(2026, 5, 13, 17, 0, 0, tzinfo=_tz.utc)

        def _as_utc_aware(dt):
            """Coerce a possibly-naive datetime to UTC-aware. Idempotent.
            Needed because asyncpg/SQLAlchemy occasionally hand back naive
            datetimes from `DateTime(timezone=True)` columns depending on
            connection settings — a known footgun."""
            if dt is None:
                return None
            return dt if dt.tzinfo is not None else dt.replace(tzinfo=_tz.utc)

        async with AsyncSessionLocal() as db:
            _existing = await db.execute(_select(Strategy).limit(1))
            _first = _existing.scalar_one_or_none()
            _first_reset = _as_utc_aware(_first.stats_reset_at) if _first else None
            _needs_wipe = (
                _first is None
                or _first_reset is None
                or _first_reset < FOSSIL_CLEANUP_THRESHOLD
            )

            if _needs_wipe:
                # Wipe Strategy stats counters (NOT mode — operational state
                # is preserved; LIVE strategies stay LIVE through a fossil
                # cleanup). FORCE_PAPER_MODE block below handles mode override
                # if the operator wants that.
                await db.execute(update(Strategy).values(
                    cycles_completed = 0,
                    win_trades       = 0,
                    loss_trades      = 0,
                    total_trades     = 0,
                    win_rate         = 0.0,
                    total_pnl        = 0.0,
                    avg_return       = 0.0,
                    stats_reset_at   = _reset_ts,
                ))
                # Purge paper trades from trades table (no tx_hash = paper).
                # Live on-chain trades preserved (tx_hash IS NOT NULL guard).
                _del_result = await db.execute(
                    Trade.__table__.delete().where(Trade.tx_hash.is_(None))
                )
                # Reset BotConfig singleton — fleet-wide aggregates AND
                # Fleet Consensus round counters (XXVII added these to the wipe set;
                # XXVIII makes the wipe actually run).
                _bot_reset = await db.execute(update(BotConfig).values(
                    total_trades             = 0,
                    successful_trades        = 0,
                    total_pnl                = 0.0,
                    daily_trades             = 0,
                    fleet_consensus_total_rounds    = 0,
                    fleet_consensus_approved_rounds = 0,
                    fleet_consensus_rejected_rounds = 0,
                ))
                await db.commit()
                logger.warning(
                    f"FOSSIL CLEANUP (Session XXVIII) — wiped 12 Strategy rows "
                    f"(stats only, mode preserved), deleted "
                    f"{_del_result.rowcount} paper trades, reset "
                    f"{_bot_reset.rowcount} BotConfig singleton (incl. "
                    f"Fleet Consensus round counters). "
                    f"New Zero Day: {_reset_ts.isoformat()}."
                )
            else:
                logger.info(
                    f"FOSSIL CLEANUP: skipped — stats_reset_at "
                    f"({_first_reset.isoformat()}) is at/past "
                    f"threshold ({FOSSIL_CLEANUP_THRESHOLD.isoformat()})"
                )
    except Exception as _e:
        logger.error(f"Fossil cleanup failed: {_e}")

    # ── FORCE_PAPER_MODE env var — operational mode override ─────────────────
    # Independent of the fossil cleanup above. When FORCE_PAPER_MODE=1:
    #   1. In-memory override flag set True (blocks all live execution)
    #   2. All strategies demoted to PAPER_ONLY in DB (persistent)
    # Stats data is NOT touched here — fossil cleanup owns data integrity.
    import os as _os2
    if _os2.environ.get("FORCE_PAPER_MODE", "0") == "1":
        try:
            from sqlalchemy import update
            from db.database import AsyncSessionLocal
            from models.strategy import Strategy
            from services.cycle_service import set_force_paper_mode
            set_force_paper_mode(True)
            async with AsyncSessionLocal() as db:
                await db.execute(update(Strategy).values(mode="PAPER_ONLY"))
                await db.commit()
            logger.warning(
                "FORCE_PAPER_MODE=1 — all strategies demoted to PAPER_ONLY "
                "(operational override, no data wipe)"
            )
        except Exception as _e:
            logger.error(f"Force paper mode override failed: {_e}")

    # ── Restore Fleet Consensus round counter from DB (DEFERRED) ────────────────────
    # Runs AFTER the fossil cleanup block so that when a wipe happens, the
    # consensus_service loads zeroed counters into memory instead of the
    # pre-wipe values (which would otherwise be persisted back and undo the
    # wipe on the next round). XXVII fix preserved through XXVIII decoupling.
    try:
        from services.consensus_service import consensus_service as _cs
        await _cs.load_from_db()
    except Exception as _e:
        logger.warning(f"Fleet Consensus round counter restore failed: {_e}")

    # ── Register all background services with the system_health registry ────
    # (Session XXXIV) so the /api/system/health endpoint knows what should
    # be running before any service has reported its first heartbeat.
    try:
        from services.system_health_service import system_health
        system_health.register("price_service",  "Price Feed",
            "CoinGecko TAO/USD spot price + indicators", stale_after_s=180)
        system_health.register("subnet_cache",   "Subnet Cache",
            "Alpha prices + metagraph snapshots from Finney chain", stale_after_s=180)
        system_health.register("cycle_service",  "Cycle Engine",
            "Strategy evaluation + trade emission loop", stale_after_s=900)
        # Session XXXIX (Day 6): whale_service / "Whale Tracker" registration
        # removed — the Dashboard Whale Tracker tile was retired in XXXIX
        # (TaoStats free-tier 429s made it perma-empty). The Whale Flow
        # registration below covers the canonical operator-facing whale
        # surface (live Finney WS RPC). The /tools route still exposes the
        # legacy snapshot endpoint for ad-hoc queries — it just doesn't
        # need a permanent System Health row anymore.
        system_health.register("cex_listing",    "CEX Listing Watch",
            "RSS poller — Coinbase / Kraken / Crypto.com", stale_after_s=1800)
        # Phase B — audit_service has no loop; it heartbeats on every record().
        # Set a long stale window so a quiet day doesn't flag it as stale.
        system_health.register("audit_service",  "Audit Trail",
            "Append-only audit log of operator + system mutations", stale_after_s=86400)
        # Phase F — forecast_accuracy_service heartbeats on every consensus
        # round (~5 min cadence in steady state).  Stale after 30 min so a
        # paused cycle engine surfaces visibly on the health page.
        system_health.register("forecast_accuracy_service", "Forecast Accuracy",
            "Forecast vs actual calibration tracker for Fleet Consensus", stale_after_s=1800)
        # Phase 1 (Session XXXVIII) — direct Finney WS subscribe to
        # SubtensorModule.StakeAdded/StakeRemoved. Per-block heartbeat
        # (~12 s cadence). Stale after 120 s ≈ 10 missed finalized
        # blocks — tight enough to surface a real WS hang, generous
        # enough to absorb a brief reconnect.
        system_health.register("whale_flow",     "Whale Flow",
            "Per-subnet stake/unstake whale activity (Finney chain RPC)",
            stale_after_s=120)
    except Exception as _e:
        logger.error(f"system_health pre-registration failed: {_e}")

    # ── Schedule all heavy services as background task ───────────────────────
    # Fires AFTER yield — guarantees /health responds before any I/O starts.
    async def _boot_services():
        await _aio.sleep(3)  # let healthcheck pass first

        # Signal ingestor (Discord, Taostats, etc.) starts immediately —
        # it has no dependency on Finney/bittensor and should never be blocked by it.
        try:
            await signal_ingestor.start_all()
        except Exception as _e:
            logger.error(f"SignalIngestor start failed: {_e}")

        # Finney chain probe omitted at boot — bittensor's substrate-interface
        # blocks the event loop thread on connect. The cycle service handles
        # reconnection automatically once running.

        try:
            await price_service.start()
            logger.info("Price feed started")
        except Exception as _e:
            logger.error(f"Price feed start failed: {_e}")

        # CEX Listing Watch (carry-over #6) — RSS-only MVP. Pure HTTP, no
        # chain dependency, so it boots alongside the lightweight services.
        try:
            from services.cex_listing_service import cex_listing_service
            await cex_listing_service.start()
            logger.info("CEX listing watch started — RSS poller active")
        except Exception as _e:
            logger.error(f"CEX listing watch start failed: {_e}")

        # Whale Flow (Phase 1 RPC pivot, Session XXXVIII) — direct WS
        # subscribe to Finney chain finalized heads. async-substrate-interface
        # connection has its own reconnect/backoff inside the service.
        # Started here alongside the other lightweight services (no
        # bittensor SDK dependency on the boot path; the substrate
        # connection is opened lazily inside the service task).
        try:
            from services.whale_flow_service import whale_flow_service
            await whale_flow_service.start()
            logger.info("Whale flow service started — Finney chain RPC subscribe active")
        except Exception as _e:
            logger.error(f"Whale flow service start failed: {_e}")

        # Services that require Finney chain access run as fire-and-forget tasks.
        # bittensor's substrate-interface blocks the event loop thread on connect;
        # running them as tasks lets Discord Gateway and other async work proceed.
        async def _start_chain_services():
            await _aio.sleep(1)
            try:
                await subnet_cache_service.start()
                logger.info("Subnet cache started — real on-chain data active")
            except Exception as _e:
                logger.error(f"Subnet cache start failed: {_e}")

            await _aio.sleep(3)

            try:
                from routers.fleet import _RISK_CONFIG as _RC
                _cycle_interval = max(30, int(_RC.get("cycle_interval_seconds", 300)))
                await cycle_service.start(interval_seconds=_cycle_interval)
                logger.info(f"Cycle engine started — interval={_cycle_interval}s")
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

        _aio.create_task(_start_chain_services())

    _aio.create_task(_boot_services())

    logger.info("=== Lifespan ready — /health is live ===")
    yield  # ← Railway healthcheck passes from here

    # ── Graceful shutdown ────────────────────────────────────────────────────
    logger.info("Shutting down services…")
    # Stop CEX listing watch first — pure HTTP, fastest to drain.
    try:
        from services.cex_listing_service import cex_listing_service
        await cex_listing_service.stop()
    except Exception as _e:
        logger.error(f"CEX listing watch stop failed: {_e}")

    try:
        from services.whale_flow_service import whale_flow_service
        await whale_flow_service.stop()
    except Exception as _e:
        logger.error(f"Whale flow service stop failed: {_e}")

    for svc in [promotion_service, agent_service, cycle_service, price_service, subnet_cache_service]:
        try:
            await svc.stop()
        except Exception as _e:
            logger.error(f"Stop failed for {svc}: {_e}")


async def seed_strategies():
    """Insert default strategy rows if they don't exist.

    Session XXXVIII: also runs an idempotent wake-up migration for
    mean_reversion + contrarian_flow. Both were set is_active=False in
    Session XXXIV to stop them from absorbing 24% allocation each while
    idle (legacy 50.0 bootstrap-score quirk). That quirk is fixed —
    inactive strategies now get only ALLOC_FLOOR. We can safely re-enable
    them. The migration only touches rows that match the original
    Session XXXIV freeze fingerprint (is_active=False AND total_trades=0)
    so any operator-driven disable with real history is preserved.
    """
    from db.database import AsyncSessionLocal
    from sqlalchemy import select
    from models.strategy import Strategy

    WAKE_UP_NAMES = {"mean_reversion", "contrarian_flow"}

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
            else:
                # Wake-up migration (Session XXXVIII): only touch the named
                # zero-trade pair, idempotent — won't override a row the
                # operator legitimately disabled later (those will have
                # total_trades > 0).
                if (
                    existing.name in WAKE_UP_NAMES
                    and existing.is_active is False
                    and (existing.total_trades or 0) == 0
                ):
                    existing.is_active = True
                    logger.info(
                        f"Strategy '{existing.name}' woken up (Session XXXVIII migration)"
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

# CORS — allow all origins unconditionally so Railway / any deployment works
# without environment variable coordination between frontend and backend services.
# POST preflights (OPTIONS) from any domain will be accepted.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # must be False when allow_origins=["*"]
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
app.include_router(webhooks_router.router)
app.include_router(signal_feeds_router.router)
app.include_router(research_router.router)
app.include_router(tools_router.router)
app.include_router(system_router.router)
app.include_router(audit_router.router)
app.include_router(whale_flow_router.router)


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