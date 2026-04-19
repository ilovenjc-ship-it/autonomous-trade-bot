"""
Wallet API — real Bittensor Finney mainnet queries
GET  /api/wallet/status         → connection status, cached balance, block
GET  /api/wallet/chain          → live balance + block from Finney (slower)
GET  /api/wallet/stakes         → staking positions for the coldkey
GET  /api/wallet/subnet-prices  → dTAO alpha prices for top subnets
POST /api/wallet/mnemonic       → restore wallet from 12-word mnemonic
"""
from fastapi import APIRouter
from pydantic import BaseModel

from services.bittensor_service import bittensor_service

router = APIRouter(prefix="/api/wallet", tags=["wallet"])


class MnemonicRequest(BaseModel):
    mnemonic: str


@router.get("/status")
async def wallet_status():
    """
    Return wallet status with a fresh chain balance if cached data
    is older than 30 seconds — otherwise return cached instantly.
    """
    import time, datetime
    status = bittensor_service.get_status()
    # Check if cached balance is stale (> 30 seconds old)
    last_at = status.get("last_chain_at")
    stale = True
    if last_at:
        try:
            ts = datetime.datetime.fromisoformat(str(last_at).replace("Z", "+00:00"))
            age = time.time() - ts.timestamp()
            stale = age > 30
        except Exception:
            stale = True
    if stale and bittensor_service.connected:
        # Refresh balance from chain in background — don't block response
        import asyncio
        asyncio.create_task(bittensor_service.get_chain_info())
    return status


@router.get("/chain")
async def wallet_chain():
    """
    Query live data from Finney mainnet.
    Returns real TAO balance + current block number.
    May take 2–5s.
    """
    return await bittensor_service.get_chain_info()


@router.get("/stakes")
async def wallet_stakes():
    """Return staking positions for the coldkey address."""
    return await bittensor_service.get_stake_info()


@router.get("/subnet-prices")
async def subnet_prices(limit: int = 20):
    """
    Return dTAO alpha prices for the top N subnets from Finney.
    Used by emission_momentum and dtao_flow_momentum strategies.
    """
    prices = await bittensor_service.get_subnet_prices(limit=limit)
    return {"prices": prices, "count": len(prices)}


@router.post("/generate")
async def generate_new_wallet():
    """
    Generate a brand-new bot wallet from scratch.
    Returns the 12-word mnemonic ONCE — the user must write it down.
    The keypair is saved to .env and loaded into memory immediately.
    Previous wallet / mnemonic is replaced.
    """
    result = bittensor_service.generate_wallet()
    return result


@router.post("/mnemonic")
async def restore_from_mnemonic(body: MnemonicRequest):
    """
    Restore the wallet signing key from a 12-word BIP39 mnemonic.
    The keypair is kept in memory and saved to .env (never to git).
    """
    result = bittensor_service.set_mnemonic(body.mnemonic.strip())
    if result["success"]:
        # Immediately query the chain to confirm the address
        chain_info = await bittensor_service.get_chain_info()
        result["chain"] = chain_info
    return result