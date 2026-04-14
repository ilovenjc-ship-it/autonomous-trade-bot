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
    """Return cached wallet status (no chain call — instant)."""
    return bittensor_service.get_status()


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