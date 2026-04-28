"""
Wallet API — real Bittensor Finney mainnet queries
GET  /api/wallet/status             → connection status, cached balance, block
GET  /api/wallet/chain              → live balance + block from Finney (slower)
GET  /api/wallet/stakes             → staking positions for the coldkey
GET  /api/wallet/subnet-prices      → dTAO alpha prices for top subnets
POST /api/wallet/mnemonic           → restore wallet from 12-word mnemonic
POST /api/wallet/unstake-position   → manually unstake one position (netuid + hotkey)
POST /api/wallet/unstake-all        → unstake every position for this coldkey

GET  /api/wallet/transactions       → unified ledger: fundings + trades + chain data
GET  /api/wallet/funding            → list all recorded funding events
POST /api/wallet/funding            → manually record a wallet funding event
DELETE /api/wallet/funding/{id}     → delete a manual funding entry
GET  /api/wallet/chain-transfers    → pull transfer history from Taostats public API
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db, AsyncSessionLocal
from models.wallet_funding import WalletFunding
from models.trade import Trade
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


# ── Wallet Transactions / Funding Ledger ──────────────────────────────────────

class FundingRequest(BaseModel):
    amount_tao:   float
    funded_at:    str               # ISO-8601 datetime string
    note:         Optional[str] = None
    from_address: Optional[str] = None
    tx_hash:      Optional[str] = None
    block_number: Optional[int] = None


async def _fetch_taostats_transfers(address: str) -> list:
    """
    Pull transfer history from the Taostats public REST API.
    Returns a list of dicts with normalised fields.
    Fails silently — returns [] on any error so the page still loads.
    """
    import urllib.request, json, ssl

    urls = [
        f"https://api.taostats.io/api/transfer/v1/?address={address}&limit=100",
        f"https://api.taostats.io/api/v1/transfer?address={address}&limit=100",
    ]

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    for url in urls:
        try:
            req = urllib.request.Request(
                url,
                headers={"Accept": "application/json", "User-Agent": "TAO-Bot/1.0"},
            )
            with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
                raw = json.loads(resp.read().decode())

            # Normalise — Taostats may return {"data": [...]} or {"results": [...]}
            rows = raw.get("data") or raw.get("results") or (raw if isinstance(raw, list) else [])
            out = []
            for r in rows:
                # Amount may be a string like "0.500000000 τ" or a float in rao
                raw_amount = r.get("amount") or r.get("amount_tao") or 0
                if isinstance(raw_amount, str):
                    try:
                        amount_tao = float(raw_amount.replace("τ", "").replace(",", "").strip())
                    except Exception:
                        amount_tao = 0.0
                elif isinstance(raw_amount, (int, float)):
                    # Could be in rao (1e9 rao = 1 TAO) — detect by magnitude
                    amount_tao = float(raw_amount) / 1e9 if float(raw_amount) > 1000 else float(raw_amount)
                else:
                    amount_tao = 0.0

                out.append({
                    "from_address":  r.get("from") or r.get("from_address") or "",
                    "to_address":    r.get("to")   or r.get("to_address")   or "",
                    "amount_tao":    round(amount_tao, 6),
                    "block_number":  r.get("block_number") or r.get("block") or 0,
                    "tx_hash":       r.get("hash") or r.get("tx_hash") or r.get("extrinsic_id") or "",
                    "timestamp":     r.get("timestamp") or r.get("created_at") or "",
                    "source":        "taostats",
                })
            if out:
                return out
        except Exception as _e:
            logger.debug(f"Taostats fetch attempt failed ({url}): {_e}")
            continue

    return []


@router.get("/chain-transfers")
async def get_chain_transfers():
    """
    Fetch wallet transfer history from the Taostats public API.
    Returns the raw normalised list — useful for reconciliation.
    Filtered to INBOUND transfers to our coldkey address only.
    """
    address = bittensor_service._coldkey_address or ""
    if not address:
        return {"transfers": [], "error": "No coldkey address configured — restore wallet first"}

    transfers = await asyncio.get_running_loop().run_in_executor(
        None, _fetch_taostats_transfers_sync, address
    )
    inbound = [t for t in transfers if t.get("to_address") == address]
    return {"transfers": inbound, "count": len(inbound), "address": address}


def _fetch_taostats_transfers_sync(address: str) -> list:
    """Synchronous wrapper for executor."""
    import urllib.request, json, ssl

    urls = [
        f"https://api.taostats.io/api/transfer/v1/?address={address}&limit=100",
    ]
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    for url in urls:
        try:
            req = urllib.request.Request(
                url,
                headers={"Accept": "application/json", "User-Agent": "TAO-Bot/1.0"},
            )
            with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
                raw = json.loads(resp.read().decode())

            rows = raw.get("data") or raw.get("results") or (raw if isinstance(raw, list) else [])
            out = []
            for r in rows:
                raw_amount = r.get("amount") or r.get("amount_tao") or 0
                if isinstance(raw_amount, str):
                    try:
                        amount_tao = float(raw_amount.replace("τ", "").replace(",", "").strip())
                    except Exception:
                        amount_tao = 0.0
                elif isinstance(raw_amount, (int, float)):
                    amount_tao = float(raw_amount) / 1e9 if float(raw_amount) > 1000 else float(raw_amount)
                else:
                    amount_tao = 0.0

                out.append({
                    "from_address":  r.get("from") or r.get("from_address") or "",
                    "to_address":    r.get("to")   or r.get("to_address")   or "",
                    "amount_tao":    round(amount_tao, 6),
                    "block_number":  r.get("block_number") or r.get("block") or 0,
                    "tx_hash":       r.get("hash") or r.get("tx_hash") or r.get("extrinsic_id") or "",
                    "timestamp":     r.get("timestamp") or r.get("created_at") or "",
                    "source":        "taostats",
                })
            return out
        except Exception as _e:
            logger.debug(f"Taostats sync fetch failed: {_e}")

    return []


@router.get("/db-check")
async def db_check(db: AsyncSession = Depends(get_db)):
    """
    Diagnostic endpoint — verifies the wallet_fundings table exists and is
    queryable. Returns row count and table status. Used to diagnose
    'Failed to load transaction data' errors.
    """
    from sqlalchemy import text, inspect
    results: dict = {}

    # 1. Check table exists via direct SQL
    try:
        row = await db.execute(text("SELECT COUNT(*) FROM wallet_fundings"))
        count = row.scalar()
        results["wallet_fundings_table"] = "EXISTS"
        results["wallet_fundings_count"] = count
    except Exception as e:
        results["wallet_fundings_table"] = f"MISSING or ERROR: {e}"
        results["wallet_fundings_count"] = None

    # 2. Check trades table (sanity check that DB works at all)
    try:
        row2 = await db.execute(text("SELECT COUNT(*) FROM trades"))
        results["trades_count"] = row2.scalar()
        results["db_connection"] = "OK"
    except Exception as e:
        results["db_connection"] = f"ERROR: {e}"

    # 3. DB path
    from core.config import settings
    results["db_url_tail"] = settings.DATABASE_URL.split("///")[-1]

    return results


@router.get("/funding")
async def list_fundings(db: AsyncSession = Depends(get_db)):
    """Return all recorded wallet funding events, newest first."""
    result = await db.execute(
        select(WalletFunding).order_by(desc(WalletFunding.funded_at))
    )
    rows = result.scalars().all()
    return {
        "fundings": [
            {
                "id":           r.id,
                "amount_tao":   r.amount_tao,
                "from_address": r.from_address,
                "tx_hash":      r.tx_hash,
                "block_number": r.block_number,
                "funded_at":    r.funded_at.isoformat() if r.funded_at else None,
                "note":         r.note,
                "source":       r.source,
                "created_at":   r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total_funded_tao": round(sum(r.amount_tao for r in rows), 6),
        "count": len(rows),
    }


@router.post("/funding")
async def add_funding(body: FundingRequest, db: AsyncSession = Depends(get_db)):
    """
    Manually record a wallet funding event (TAO received from outside).
    Used to track every time the operator sends TAO to the bot wallet.
    If a tx_hash is provided, it is deduplicated — same hash cannot be entered twice.
    """
    if body.amount_tao <= 0:
        raise HTTPException(status_code=400, detail="amount_tao must be positive")

    

    # Parse funded_at
    try:
        funded_at = datetime.fromisoformat(body.funded_at.replace("Z", "+00:00"))
    except Exception:
        funded_at = datetime.now(timezone.utc)

    # Dedup by tx_hash
    if body.tx_hash:
        existing = await db.execute(
            select(WalletFunding).where(WalletFunding.tx_hash == body.tx_hash)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Transaction hash already recorded")

    funding = WalletFunding(
        amount_tao   = round(body.amount_tao, 6),
        from_address = body.from_address,
        tx_hash      = body.tx_hash or None,
        block_number = body.block_number,
        funded_at    = funded_at,
        note         = body.note,
        source       = "manual",
    )
    db.add(funding)
    await db.flush()
    await db.commit()

    push_event(
        "system",
        f"💰 Wallet funding recorded — τ{body.amount_tao:.4f}",
        detail=body.note or f"tx={body.tx_hash or 'no hash provided'}",
    )
    logger.info(f"[FUNDING] Manual entry: τ{body.amount_tao:.4f} at {funded_at.isoformat()}")

    return {
        "success":    True,
        "id":         funding.id,
        "amount_tao": funding.amount_tao,
        "funded_at":  funding.funded_at.isoformat(),
    }


@router.delete("/funding/{funding_id}")
async def delete_funding(funding_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a manually entered funding record."""
    result = await db.execute(
        select(WalletFunding).where(WalletFunding.id == funding_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Funding record not found")
    if row.source != "manual":
        raise HTTPException(status_code=403, detail="Only manually-entered records can be deleted")
    await db.delete(row)
    await db.commit()
    return {"success": True, "deleted_id": funding_id}


@router.get("/transactions")
async def get_transactions(db: AsyncSession = Depends(get_db)):
    """
    Unified wallet transaction ledger.

    Combines three data sources into a single sorted timeline:
      1. WalletFunding table — every recorded funding event (inflows)
      2. Local Trade table   — all staking/unstaking activity (outflows / realised P&L)
      3. Taostats API        — on-chain transfer history (best-effort, may timeout)

    Also returns an accounting summary:
      total_funded   — sum of all recorded funding events
      current_balance — live liquid TAO from chain (cached)
      total_staked   — estimated staked TAO value
      net_pnl        — total_funded - (current + staked)  [negative = loss]
    """
    # ── 1. Local fundings ─────────────────────────────────────────────────────
    fund_result = await db.execute(
        select(WalletFunding).order_by(desc(WalletFunding.funded_at))
    )
    fundings = fund_result.scalars().all()
    total_funded = round(sum(f.amount_tao for f in fundings), 6)

    funding_entries = [
        {
            "type":         "FUNDING",
            "subtype":      "inbound",
            "id":           f"fund-{r.id}",
            "amount_tao":   r.amount_tao,
            "from_address": r.from_address,
            "tx_hash":      r.tx_hash,
            "block_number": r.block_number,
            "timestamp":    r.funded_at.isoformat() if r.funded_at else None,
            "note":         r.note,
            "source":       r.source,
            "deletable":    r.source == "manual",
            "db_id":        r.id,
        }
        for r in fundings
    ]

    # ── 2. Local trade records ────────────────────────────────────────────────
    trade_result = await db.execute(
        select(Trade).order_by(desc(Trade.executed_at)).limit(500)
    )
    trades = trade_result.scalars().all()

    trade_entries = [
        {
            "type":         "STAKE"   if t.trade_type == "buy"  else "UNSTAKE",
            "subtype":      "live"    if t.tx_hash else "paper",
            "id":           f"trade-{t.id}",
            "amount_tao":   t.amount,
            "tx_hash":      t.tx_hash,
            "timestamp":    t.executed_at.isoformat() if t.executed_at else None,
            "strategy":     t.strategy,
            "netuid":       t.netuid,
            "pnl":          t.pnl,
            "fee":          t.fee,
            "note":         t.signal_reason[:80] if t.signal_reason else None,
            "source":       "local_db",
            "live":         bool(t.tx_hash),
        }
        for t in trades
    ]

    # ── 3. Current wallet state (best-effort — chain calls may be unavailable) ──
    # NOTE: these are wrapped individually so a failed chain call never prevents
    # funding records from loading. The funding ledger must always be readable.
    status = bittensor_service.get_status()
    current_balance = status.get("balance_cached") or 0.0

    staked_tao = 0.0
    try:
        stake_info = await bittensor_service.get_stake_info()
        stakes = stake_info.get("stakes", [])
        if stakes:
            netuids = list({s["netuid"] for s in stakes})
            try:
                prices = await bittensor_service.get_prices_for_netuids(netuids)
            except Exception as _pe:
                logger.debug(f"[TRANSACTIONS] get_prices_for_netuids failed: {_pe}")
                prices = {}
            for s in stakes:
                netuid = s["netuid"]
                alpha  = float(s.get("stake", 0.0))
                price  = prices.get(netuid, 0.0)
                staked_tao += alpha if netuid == 0 else alpha * price
    except Exception as _se:
        logger.debug(f"[TRANSACTIONS] get_stake_info failed: {_se}")

    total_value = current_balance + staked_tao
    net_pnl     = round(total_value - total_funded, 6)

    # ── 4. Taostats chain transfers (best-effort) ─────────────────────────────
    coldkey = status.get("coldkey_address") or bittensor_service._coldkey_address or ""
    chain_transfers: list = []
    chain_error: str = ""
    if coldkey:
        try:
            loop = asyncio.get_running_loop()
            all_transfers = await loop.run_in_executor(
                None, _fetch_taostats_transfers_sync, coldkey
            )
            # Only inbound transfers to our address
            chain_transfers = [
                {
                    "type":         "TRANSFER_IN",
                    "subtype":      "chain",
                    "id":           f"chain-{t.get('tx_hash', i)}",
                    "amount_tao":   t["amount_tao"],
                    "from_address": t["from_address"],
                    "to_address":   t["to_address"],
                    "tx_hash":      t["tx_hash"],
                    "block_number": t["block_number"],
                    "timestamp":    t["timestamp"],
                    "source":       "taostats",
                }
                for i, t in enumerate(all_transfers)
                if t.get("to_address") == coldkey
            ]
        except Exception as _e:
            chain_error = str(_e)
            logger.debug(f"[TRANSACTIONS] Taostats fetch failed: {_e}")

    # ── Build unified ledger (sorted newest first) ────────────────────────────
    unified = funding_entries + trade_entries + chain_transfers
    unified.sort(
        key=lambda x: x.get("timestamp") or "1970-01-01T00:00:00",
        reverse=True,
    )

    return {
        "summary": {
            "total_funded_tao":   total_funded,
            "funding_count":      len(fundings),
            "current_balance_tao": round(current_balance, 6),
            "staked_tao":         round(staked_tao, 6),
            "total_value_tao":    round(total_value, 6),
            "net_pnl_tao":        net_pnl,
            "net_pnl_pct":        round((net_pnl / total_funded * 100), 2) if total_funded > 0 else 0.0,
            "coldkey_address":    coldkey,
            "taostats_url":       f"https://taostats.io/account/{coldkey}" if coldkey else "",
        },
        "fundings":       funding_entries,
        "trades":         trade_entries,
        "chain_transfers": chain_transfers,
        "chain_error":    chain_error,
        "unified_ledger": unified,
    }
