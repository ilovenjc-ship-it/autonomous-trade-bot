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
        "wallet_connected": bittensor_service.wallet is not None,
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
        "wallet_balance": config.wallet_balance,
        "coldkey_address": config.coldkey_address,
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
    if not bittensor_service.wallet:
        config = await get_or_create_config(db)
        return {"balance": config.wallet_balance, "source": "cached"}
    balance = await bittensor_service.get_balance()
    if balance is not None:
        config = await get_or_create_config(db)
        config.wallet_balance = balance
        await db.commit()
    return {"balance": balance, "source": "live"}


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

@router.get("/network/info")
async def get_network_info(db: AsyncSession = Depends(get_db)):
    config = await get_or_create_config(db)
    if not bittensor_service.connected:
        return {"connected": False, "network": config.network}
    block = await bittensor_service.get_current_block()
    subnet = await bittensor_service.get_subnet_info(config.netuid)
    return {"connected": True, "network": config.network, "block": block, "subnet": subnet}