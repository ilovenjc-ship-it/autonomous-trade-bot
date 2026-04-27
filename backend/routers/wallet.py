"""
Wallet API — real Bittensor Finney mainnet queries
GET  /api/wallet/status             → connection status, cached balance, block
GET  /api/wallet/chain              → live balance + block from Finney (slower)
GET  /api/wallet/stakes             → staking positions for the coldkey
GET  /api/wallet/subnet-prices      → dTAO alpha prices for top subnets
POST /api/wallet/mnemonic           → restore wallet from 12-word mnemonic
POST /api/wallet/unstake-position   → manually unstake one position (netuid + hotkey)
POST /api/wallet/unstake-all        → unstake every position for this coldkey
"""
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from services.bittensor_service import bittensor_service
from services.activity_service import push_event

logger = logging.getLogger(__name__)

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
    """
    Return staking positions for the coldkey address, enriched with
    live TAO value per position. Fetches prices for staked subnets
    specifically — not limited to the top-20 price feed.
    """
    stake_data = await bittensor_service.get_stake_info()
    stakes = stake_data.get("stakes", [])

    if stakes:
        netuids = list({s["netuid"] for s in stakes})
        prices = await bittensor_service.get_prices_for_netuids(netuids)

        total_tao_value = 0.0
        for s in stakes:
            netuid = s["netuid"]
            price = prices.get(netuid, 0.0)
            alpha = s.get("stake", 0.0)
            # SN0 (root) stakes are denominated in TAO directly — no conversion needed
            tao_value = alpha if netuid == 0 else alpha * price
            s["alpha_price"] = price          # TAO per αTAO
            s["tao_value"]   = tao_value      # estimated TAO value of this position
            total_tao_value += tao_value

        stake_data["total_tao_value"] = total_tao_value

    return stake_data


@router.get("/subnet-prices")
async def subnet_prices(limit: int = 64):
    """
    Return dTAO alpha prices for the top N subnets from Finney.
    Default limit raised to 64 (full heat map) — covers all active subnets.
    Used by emission_momentum, dtao_flow_momentum strategies, and Wallet heat map.
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

class UnstakePositionRequest(BaseModel):
    netuid: int
    hotkey: str


@router.post("/unstake-position")
async def unstake_position(body: UnstakePositionRequest):
    """
    Manually unstake a full position identified by netuid + hotkey.

    Fetches the actual on-chain alpha balance for that (netuid, hotkey)
    pair so the caller never has to know the exact amount — just point
    at the position and it exits cleanly.

    Safe guards:
      - Requires mnemonic loaded (wallet armed)
      - Requires chain connection
      - Fetches fresh stake balance before attempting (no stale-cache errors)
    """
    if not bittensor_service.wallet_loaded:
        return {"success": False, "error": "Wallet mnemonic not loaded — restore wallet first"}
    if not bittensor_service.connected:
        return {"success": False, "error": "Not connected to Finney mainnet"}

    # Get the actual on-chain alpha balance for this position
    stake_data = await bittensor_service.get_stake_info()
    alpha_amount = 0.0
    for s in stake_data.get("stakes", []):
        if s.get("netuid") == body.netuid and s.get("hotkey") == body.hotkey:
            alpha_amount = float(s.get("stake", 0.0))
            break

    if alpha_amount <= 0:
        return {
            "success": False,
            "error": f"No stake found for SN{body.netuid} / {body.hotkey[:20]}… — already unstaked?"
        }

    push_event(
        "system",
        f"🔓 Manual unstake initiated — SN{body.netuid} | {alpha_amount:.5f} α",
        detail=f"hotkey={body.hotkey[:20]}…",
    )
    logger.info(f"[MANUAL UNSTAKE] SN{body.netuid} hotkey={body.hotkey[:20]} alpha={alpha_amount}")

    result = await bittensor_service.unstake(body.hotkey, alpha_amount, body.netuid)

    if result.get("success"):
        push_event(
            "trade",
            f"✅ Unstake confirmed — SN{body.netuid} | {alpha_amount:.5f} α returned",
            detail=f"tx={result.get('tx_hash', 'pending')}",
        )
        logger.info(f"[MANUAL UNSTAKE] SN{body.netuid} success tx={result.get('tx_hash')}")
    else:
        push_event(
            "alert",
            f"❌ Unstake FAILED — SN{body.netuid}: {result.get('error', 'unknown')}",
        )
        logger.error(f"[MANUAL UNSTAKE] SN{body.netuid} FAILED: {result.get('error')}")

    return {
        "success":      result.get("success", False),
        "netuid":       body.netuid,
        "hotkey":       body.hotkey,
        "alpha_amount": alpha_amount,
        "tx_hash":      result.get("tx_hash"),
        "error":        result.get("error"),
    }


@router.post("/unstake-all")
async def unstake_all():
    """
    Unstake every position for this coldkey — one chain call per position.
    Returns a per-position result list so the caller knows exactly what
    succeeded and what failed.
    """
    if not bittensor_service.wallet_loaded:
        return {"success": False, "error": "Wallet mnemonic not loaded"}
    if not bittensor_service.connected:
        return {"success": False, "error": "Not connected to Finney mainnet"}

    stake_data = await bittensor_service.get_stake_info()
    stakes = stake_data.get("stakes", [])

    if not stakes:
        return {"success": True, "results": [], "message": "No open positions found"}

    push_event(
        "system",
        f"🔓 Manual UNSTAKE ALL initiated — {len(stakes)} position(s)",
    )

    results = []
    for s in stakes:
        netuid       = s.get("netuid")
        hotkey       = s.get("hotkey", "")
        alpha_amount = float(s.get("stake", 0.0))

        if alpha_amount <= 0:
            results.append({"netuid": netuid, "skipped": True, "reason": "zero balance"})
            continue

        logger.info(f"[UNSTAKE ALL] SN{netuid} alpha={alpha_amount:.5f}")
        result = await bittensor_service.unstake(hotkey, alpha_amount, netuid)

        entry = {
            "netuid":       netuid,
            "hotkey":       hotkey,
            "alpha_amount": alpha_amount,
            "success":      result.get("success", False),
            "tx_hash":      result.get("tx_hash"),
            "error":        result.get("error"),
        }
        results.append(entry)

        status = "✅" if result.get("success") else "❌"
        push_event(
            "trade" if result.get("success") else "alert",
            f"{status} Unstake SN{netuid} — {alpha_amount:.5f} α "
            f"| tx={result.get('tx_hash', result.get('error', 'failed'))}",
        )

    all_ok  = all(r.get("success", r.get("skipped")) for r in results)
    success = sum(1 for r in results if r.get("success"))
    failed  = sum(1 for r in results if not r.get("success") and not r.get("skipped"))

    push_event(
        "system",
        f"Unstake All complete — {success} succeeded, {failed} failed",
    )

    return {
        "success": all_ok,
        "results": results,
        "summary": {"total": len(stakes), "succeeded": success, "failed": failed},
    }
