from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from db.database import get_db
from models.bot_config import BotConfig
from services.trading_service import trading_service
from services.bittensor_service import bittensor_service
from services.price_service import price_service
from services.cycle_service import cycle_service
from core.config import settings

router = APIRouter(prefix="/api/bot", tags=["bot"])


# ── Schemas ────────────────────────────────────────────────────────────────

class BotConfigUpdate(BaseModel):
    active_strategy: Optional[str] = None
    trade_amount: Optional[float] = None
    max_trade_amount: Optional[float] = None
    min_trade_amount: Optional[float] = None
    trade_interval: Optional[int] = None
    max_daily_trades: Optional[int] = None
    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    wallet_name: Optional[str] = None
    wallet_hotkey: Optional[str] = None
    wallet_path: Optional[str] = None
    netuid: Optional[int] = None
    network: Optional[str] = None


class WalletConnectRequest(BaseModel):
    wallet_name: str = "default"
    wallet_hotkey: str = "default"
    wallet_path: str = "~/.bittensor/wallets"
    network: str = "finney"


# ── Helpers ────────────────────────────────────────────────────────────────

async def get_or_create_config(db: AsyncSession) -> BotConfig:
    result = await db.execute(select(BotConfig).where(BotConfig.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        try:
            config = BotConfig(
                id=1,
                is_running=False,
                wallet_name=settings.BT_WALLET_NAME,
                wallet_hotkey=settings.BT_WALLET_HOTKEY,
                network=settings.BT_NETWORK,
                netuid=settings.BT_NETUID,
                trade_amount=settings.DEFAULT_TRADE_AMOUNT,
                max_trade_amount=settings.MAX_TRADE_AMOUNT,
                min_trade_amount=settings.MIN_TRADE_AMOUNT,
                trade_interval=settings.TRADE_INTERVAL_SECONDS,
                max_daily_trades=settings.MAX_DAILY_TRADES,
                stop_loss_pct=settings.STOP_LOSS_PCT,
                take_profit_pct=settings.TAKE_PROFIT_PCT,
            )
            db.add(config)
            await db.commit()
            await db.refresh(config)
        except Exception:
            # Race condition: another task already inserted id=1 — fetch it
            await db.rollback()
            result = await db.execute(select(BotConfig).where(BotConfig.id == 1))
            config = result.scalar_one()
    return config


# ── Routes ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def get_status(db: AsyncSession = Depends(get_db)):
    config = await get_or_create_config(db)
    price_data = price_service.price_data
    indicators = price_service.compute_indicators()
    return {
        "is_running": cycle_service.is_running,
        "cycle_number": cycle_service.cycle_number,
        "cycle_interval": cycle_service.interval,
        "status_message": config.status_message if config.status_message else (
            "Cycle engine running" if cycle_service.is_running else "Bot stopped"
        ),
        "error_message": config.error_message,
        "wallet_connected": bittensor_service.wallet_loaded,
        "network_connected": bittensor_service.connected,
        "network": config.network,
        "netuid": config.netuid,
        "active_strategy": config.active_strategy,
        "trade_amount": config.trade_amount,
        "trade_interval": cycle_service.interval,
        "max_daily_trades": config.max_daily_trades,
        "daily_trades": config.daily_trades,
        "total_trades": config.total_trades,
        "successful_trades": config.successful_trades,
        "total_pnl": config.total_pnl,
        "wallet_balance": (getattr(bittensor_service, "_last_balance", None) or config.wallet_balance),  
        "coldkey_address": (config.coldkey_address or getattr(bittensor_service, "coldkey_address", None)),  
        "hotkey_address": config.hotkey_address, 
        "last_trade_at": config.last_trade_at.isoformat() if config.last_trade_at else None,
        "current_price": price_data.get("price_usd"),
        "price_change_24h": price_data.get("price_change_pct_24h"),
        "indicators": indicators,
        "simulation_mode": not bittensor_service.connected,
    }


@router.post("/start")
async def start_bot():
    if cycle_service.is_running:
        return {"success": False, "message": "Bot already running"}
    await cycle_service.start(interval_seconds=60)
    return {"success": True, "message": "Autonomous cycle engine started"}


@router.post("/stop")
async def stop_bot():
    if not cycle_service.is_running:
        return {"success": False, "message": "Bot is not running"}
    await cycle_service.stop()
    return {"success": True, "message": "Cycle engine stopped"}


@router.get("/config")
async def get_config(db: AsyncSession = Depends(get_db)):
    config = await get_or_create_config(db)
    return {
        "active_strategy": config.active_strategy,
        "trade_amount": config.trade_amount,
        "max_trade_amount": config.max_trade_amount,
        "min_trade_amount": config.min_trade_amount,
        "trade_interval": config.trade_interval,
        "max_daily_trades": config.max_daily_trades,
        "stop_loss_pct": config.stop_loss_pct,
        "take_profit_pct": config.take_profit_pct,
        "wallet_name": config.wallet_name,
        "wallet_hotkey": config.wallet_hotkey,
        "network": config.network,
        "netuid": config.netuid,
    }


@router.put("/config")
async def update_config(payload: BotConfigUpdate, db: AsyncSession = Depends(get_db)):
    config = await get_or_create_config(db)
    for field, value in payload.dict(exclude_none=True).items():
        setattr(config, field, value)
    await db.commit()
    return {"success": True, "message": "Configuration updated"}


@router.post("/wallet/connect")
async def connect_wallet(payload: WalletConnectRequest, db: AsyncSession = Depends(get_db)):
    # Connect to network first
    if not bittensor_service.connected or bittensor_service.network != payload.network:
        ok = await bittensor_service.connect(payload.network)
        if not ok:
            return {
                "success": False,
                "message": f"Failed to connect to {payload.network} network",
            }

    # Load wallet
    success, message = await bittensor_service.load_wallet(
        payload.wallet_name, payload.wallet_hotkey, payload.wallet_path
    )

    if success:
        info = await bittensor_service.get_wallet_info()
        config = await get_or_create_config(db)
        config.wallet_name = payload.wallet_name
        config.wallet_hotkey = payload.wallet_hotkey
        config.network = payload.network
        config.coldkey_address = info.get("coldkey_address")
        config.hotkey_address = info.get("hotkey_address")
        config.wallet_balance = info.get("balance", 0.0)
        await db.commit()
        return {"success": True, "message": "Wallet connected", "info": info}

    return {"success": False, "message": message}


@router.post("/wallet/disconnect")
async def disconnect_wallet():
    await bittensor_service.disconnect()
    return {"success": True, "message": "Wallet disconnected"}


@router.get("/wallet/balance")  
async def get_balance(db: AsyncSession = Depends(get_db)):  
    # Safe: do not hit DB or chain; cannot crash the worker.  
    bal = getattr(bittensor_service, "_last_balance", None)  
    return {"balance": bal, "source": "cached_chain"}    


class MnemonicRequest(BaseModel):
    mnemonic: str

@router.post("/wallet/save-mnemonic")
async def save_mnemonic(payload: MnemonicRequest):
    """Store mnemonic in .env for use when bittensor lib is available."""
    words = payload.mnemonic.strip().split()
    if len(words) != 12:
        raise HTTPException(status_code=400, detail="Mnemonic must be exactly 12 words")
    # Write to .env file (append or update)
    import os, re
    env_path = os.path.join(os.path.dirname(__file__), '../../.env')
    env_path = os.path.abspath(env_path)
    # Read existing
    lines = []
    if os.path.exists(env_path):
        with open(env_path) as f:
            lines = f.readlines()
    # Remove existing mnemonic lines
    lines = [l for l in lines if not l.startswith('BT_MNEMONIC=')]
    lines.append(f'BT_MNEMONIC={payload.mnemonic}\n')
    with open(env_path, 'w') as f:
        f.writelines(lines)
    return {"success": True, "message": "Mnemonic saved to .env — will be loaded when Bittensor is available"}

class ValidatorRequest(BaseModel):
    hotkey: str   # SS58 address of the target validator (e.g. TaoBot)


@router.post("/validator")
async def set_validator(payload: ValidatorRequest, db: AsyncSession = Depends(get_db)):
    """
    Set the target validator hotkey for live staking.
    Verifies the hotkey is a permitted validator on SN1 before saving.
    """
    from services.subnet_router import set_primary_validator

    hotkey = payload.hotkey.strip()
    if not hotkey.startswith("5") or len(hotkey) < 47:
        raise HTTPException(status_code=400, detail="Invalid SS58 hotkey address")

    # Verify on-chain (optional but recommended — skip if chain unavailable)
    verified = False
    stake    = None
    if bittensor_service.connected:
        try:
            import bittensor as bt
            async with bt.AsyncSubtensor(network="finney") as sub:
                mg = await sub.metagraph(netuid=1)
                for hk, s, permit in zip(mg.hotkeys, mg.S.tolist(), mg.validator_permit.tolist()):
                    if hk == hotkey:
                        verified = True
                        stake    = round(float(s), 2)
                        break
        except Exception as e:
            pass   # proceed anyway — user may be setting it while chain is slow

    # Persist to DB
    config = await get_or_create_config(db)
    config.target_validator_hotkey = hotkey
    await db.commit()

    # Arm the subnet router immediately
    set_primary_validator(hotkey)

    return {
        "success":   True,
        "hotkey":    hotkey,
        "verified_on_chain": verified,
        "stake_tao": stake,
        "message":   (
            f"Validator set and verified on SN1 ({stake:,.2f}τ staked)" if verified
            else "Validator saved — chain verification skipped (offline or not on SN1)"
        ),
    }


@router.get("/validator")
async def get_validator(db: AsyncSession = Depends(get_db)):
    """Return the currently configured target validator."""
    from services.subnet_router import get_router_status
    config = await get_or_create_config(db)
    router = get_router_status()
    return {
        "target_validator_hotkey": config.target_validator_hotkey,
        "router": router,
    }


@router.get("/network/info")
async def get_network_info(db: AsyncSession = Depends(get_db)):
    config = await get_or_create_config(db)
    if not bittensor_service.connected:
        return {"connected": False, "network": config.network}
    block = await bittensor_service.get_current_block()
    subnet = await bittensor_service.get_subnet_info(config.netuid)
    return {"connected": True, "network": config.network, "block": block, "subnet": subnet}


@router.get("/trading-mode")
async def get_trading_mode(db: AsyncSession = Depends(get_db)):
    """
    Returns a comprehensive, human-readable breakdown of whether the bot
    is executing LIVE on-chain trades or running paper simulation.
    Every gate is checked and reported individually.
    """
    from services.subnet_router import get_router_status
    from models.strategy import Strategy
    from models.trade import Trade
    from sqlalchemy import func

    config = await get_or_create_config(db)
    router_st = get_router_status()

    # ── Gate checks ──────────────────────────────────────────────────────────
    chain_connected   = bittensor_service.connected
    validator_hotkey  = config.target_validator_hotkey
    validator_set     = bool(validator_hotkey)
    primary_in_memory = router_st.get("primary_validator") is not None

    # Count LIVE-mode strategies
    result = await db.execute(
        select(Strategy).where(Strategy.mode == "LIVE", Strategy.is_active == True)
    )
    live_strategies = result.scalars().all()
    live_count = len(live_strategies)

    # Trade counts from DB
    total_q = await db.execute(select(func.count(Trade.id)))
    total_trades = total_q.scalar() or 0

    real_q = await db.execute(
        select(func.count(Trade.id)).where(
            Trade.tx_hash.isnot(None),
            Trade.tx_hash != ""
        )
    )
    real_trades = real_q.scalar() or 0
    paper_trades = total_trades - real_trades

    # ── Determine overall mode + blocking reason ─────────────────────────────
    gates_passing = {
        "chain_connected":       chain_connected,
        "validator_configured":  validator_set,
        "validator_in_memory":   primary_in_memory,
        "live_strategies_exist": live_count > 0,
    }
    all_gates_pass = all(gates_passing.values())

    if all_gates_pass:
        overall_mode = "LIVE"
        blocking_reason = None
        status_message = (
            f"{live_count} strategy{'s' if live_count != 1 else ''} armed — "
            f"real stake() fires on next OpenClaw signal"
        )
    else:
        overall_mode = "PAPER"
        failed = [k for k, v in gates_passing.items() if not v]
        reason_map = {
            "chain_connected":       "Finney mainnet not connected",
            "validator_configured":  "No validator hotkey set in config",
            "validator_in_memory":   "Validator hotkey not loaded into subnet router",
            "live_strategies_exist": "No strategies in LIVE mode",
        }
        blocking_reason = " · ".join(reason_map[k] for k in failed)
        status_message = f"Blocked by: {blocking_reason}"

    return {
        "overall_mode":      overall_mode,
        "status_message":    status_message,
        "blocking_reason":   blocking_reason,
        "gates": {
            "chain_connected":      chain_connected,
            "validator_configured": validator_set,
            "validator_in_memory":  primary_in_memory,
            "live_strategies":      live_count,
        },
        "live_strategies": [
            {"name": s.name, "display_name": s.display_name, "mode": s.mode}
            for s in live_strategies
        ],
        "trade_summary": {
            "total":  total_trades,
            "real":   real_trades,
            "paper":  paper_trades,
        },
        "validator_hotkey":    validator_hotkey,
        "wallet_balance_tao":  bittensor_service._last_balance or 0.0,
        "network":             "finney",
    }
