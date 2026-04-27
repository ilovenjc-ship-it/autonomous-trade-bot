"""
Bittensor SDK Integration Service (bittensor 10.x AsyncSubtensor API)
======================================================================
Handles:
  - Live Finney mainnet connection via AsyncSubtensor
  - Wallet restore from 12-word mnemonic (bittensor_wallet.Keypair)
  - Real TAO balance queries from chain
  - Subnet price data (dTAO alpha prices for all 129 subnets)
  - Staking / unstaking via mnemonic-derived keypair
  - Validator weight queries for emission-based signal generation

Target wallet: 5GgRojEFh5aCFNLKuSWb6WtrM5nBDB6GrRpqaqreBLcg4e7L
Network:       Bittensor Finney mainnet (wss://entrypoint-finney.opentensor.ai)
"""
import asyncio
import logging
import os
import warnings
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

warnings.filterwarnings("ignore")
logger = logging.getLogger(__name__)

TARGET_WALLET = "5HMXmud5v6zUz84fm3azwLyENFpbtq5CFK6ZeShA4EqcECAT"  # Session VII final — clean bot wallet, τ0.227 funded, confirmed on-chain
NETWORK       = "finney"


class _WalletAdapter:
    """
    Minimal bittensor.Wallet-compatible wrapper around a bare mnemonic-derived Keypair.

    bittensor SDK 10.x expects a Wallet object with:
      - wallet.unlock_coldkey()  → decrypts file-based coldkey (no-op for us — already in memory)
      - wallet.coldkey           → the signing Keypair

    Without this adapter, every add_stake() / remove_stake() attempt raises:
      'builtins.Keypair' object has no attribute 'unlock_coldkey'
    ...and only ~17% of live trades slip through via an SDK fallback path.
    With this adapter, the SDK gets a proper wallet interface and execution
    succeeds cleanly on every consensus-approved cycle.
    """

    def __init__(self, keypair) -> None:
        self.coldkey    = keypair          # the signing keypair (already unlocked)
        self.coldkeypub = keypair          # SDK may also access coldkeypub
        self.hotkey     = keypair          # some paths use hotkey for signing too
        self._keypair   = keypair

    def unlock_coldkey(self, password: Optional[str] = None) -> None:
        """No-op — mnemonic-derived keypairs are always unlocked in memory."""
        return

    def unlock_hotkey(self, password: Optional[str] = None) -> None:
        """No-op."""
        return

    @property
    def ss58_address(self) -> str:
        return self._keypair.ss58_address

# ── Mnemonic storage (in-memory + env file) ──────────────────────────────────
_MNEMONIC_ENV_KEY = "BT_MNEMONIC"


def _load_mnemonic_from_env() -> Optional[str]:
    """Read stored mnemonic — checks os.environ first, then pydantic settings (which reads .env file)."""
    # Check runtime environment first
    m = os.environ.get(_MNEMONIC_ENV_KEY, "").strip()
    if m and len(m.split()) >= 12:
        return m
    # Fallback: pydantic settings reads the .env file directly
    try:
        from core.config import settings
        m2 = (settings.BT_MNEMONIC or "").strip()
        if m2 and len(m2.split()) >= 12:
            os.environ[_MNEMONIC_ENV_KEY] = m2  # cache into os.environ for next time
            return m2
    except Exception:
        pass
    return None


def _save_mnemonic_to_env(mnemonic: str) -> None:
    """Persist mnemonic to the backend .env file (never committed to git)."""
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    env_path = os.path.abspath(env_path)
    try:
        lines = []
        replaced = False
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith(f"{_MNEMONIC_ENV_KEY}="):
                        lines.append(f'{_MNEMONIC_ENV_KEY}="{mnemonic}"\n')
                        replaced = True
                    else:
                        lines.append(line)
        if not replaced:
            lines.append(f'{_MNEMONIC_ENV_KEY}="{mnemonic}"\n')
        with open(env_path, "w") as f:
            f.writelines(lines)
        os.environ[_MNEMONIC_ENV_KEY] = mnemonic
        logger.info("Mnemonic persisted to .env")
    except Exception as e:
        logger.error(f"Failed to save mnemonic: {e}")


# ── Service ───────────────────────────────────────────────────────────────────

class BittensorService:
    """
    Real bittensor 10.x AsyncSubtensor integration.
    Uses async context managers; maintains a cached connection pool.
    """

    def __init__(self):
        self.connected       = False
        self.network         = NETWORK
        self._keypair        = None        # bittensor_wallet.Keypair
        self._coldkey_addr   = TARGET_WALLET
        self._mnemonic_set   = False
        self._last_balance   = None        # cached TAO balance
        self._last_block     = None        # cached block number
        self._subnet_prices  = {}          # netuid → alpha price
        self._last_chain_at  = None        # last successful chain query
        self._lock           = asyncio.Lock()

        # Try loading mnemonic from env on startup
        m = _load_mnemonic_from_env()
        if m:
            self._restore_keypair(m)

    # ── Keypair / wallet ──────────────────────────────────────────────────────

    def _restore_keypair(self, mnemonic: str) -> bool:
        try:
            from bittensor_wallet import Keypair
            self._keypair      = Keypair.create_from_mnemonic(mnemonic)
            self._coldkey_addr = self._keypair.ss58_address
            self._mnemonic_set = True
            logger.info(f"Keypair restored: {self._coldkey_addr[:16]}…")
            return True
        except Exception as e:
            logger.error(f"Failed to restore keypair: {e}")
            return False

    def generate_wallet(self) -> Dict[str, Any]:
        """
        Generate a brand-new wallet from scratch.
        Creates a fresh 12-word mnemonic, derives the keypair, saves to .env.
        The mnemonic is returned ONCE — the caller must display it to the user
        and the user must write it down. It will not be returned again.
        """
        try:
            from bittensor_wallet import Keypair
            mnemonic = Keypair.generate_mnemonic()
            ok = self._restore_keypair(mnemonic)
            if ok:
                _save_mnemonic_to_env(mnemonic)
                logger.info(f"New wallet generated: {self._coldkey_addr}")
                return {
                    "success":  True,
                    "mnemonic": mnemonic,
                    "address":  self._coldkey_addr,
                    "message":  "New wallet generated. Save the mnemonic — it will not be shown again.",
                }
            return {"success": False, "error": "Keypair derivation failed"}
        except Exception as e:
            logger.error(f"generate_wallet error: {e}")
            return {"success": False, "error": str(e)}

    def set_mnemonic(self, mnemonic: str) -> Dict[str, Any]:
        """Restore wallet from 12-word mnemonic. Persists to .env."""
        words = mnemonic.strip().split()
        if len(words) not in (12, 24):
            return {"success": False, "error": f"Expected 12 or 24 words, got {len(words)}"}
        ok = self._restore_keypair(mnemonic.strip())
        if ok:
            _save_mnemonic_to_env(mnemonic.strip())
            return {
                "success": True,
                "address": self._coldkey_addr,
                "message": "Wallet restored from mnemonic",
            }
        return {"success": False, "error": "Failed to derive keypair from mnemonic"}

    @property
    def coldkey_address(self) -> str:
        return self._coldkey_addr

    @property
    def wallet_loaded(self) -> bool:
        return self._mnemonic_set

    # ── Chain queries ─────────────────────────────────────────────────────────

    async def _subtensor(self):
        """Create a fresh AsyncSubtensor context."""
        import bittensor as bt
        return bt.AsyncSubtensor(network=NETWORK)

    # ── Timeout constants ─────────────────────────────────────────────────────
    # All chain calls are wrapped with asyncio.wait_for() so a degraded or
    # non-responsive Finney RPC node cannot hang the event loop indefinitely.
    # Hanging calls were the primary cause of Railway process kills.
    _TIMEOUT_FAST  = 20.0   # seconds — block number, balance (single lightweight query)
    _TIMEOUT_PRICE = 35.0   # seconds — get_subnet_prices (scans all 100+ subnets)
    _TIMEOUT_STAKE = 90.0   # seconds — add_stake / remove_stake (waits for block inclusion ~12 s/block)
    _TIMEOUT_META  = 45.0   # seconds — per-subnet metagraph (large payload, slower)

    async def get_balance(self, address: Optional[str] = None) -> Optional[float]:
        """Query live TAO balance from Finney mainnet."""
        addr = address or self._coldkey_addr
        try:
            async with await self._subtensor() as sub:
                bal = await asyncio.wait_for(sub.get_balance(addr), timeout=self._TIMEOUT_FAST)
                result = float(bal)
                self._last_balance = result
                self._last_chain_at = datetime.now(timezone.utc).isoformat()
                self.connected = True
                return result
        except asyncio.TimeoutError:
            logger.warning(f"get_balance timed out after {self._TIMEOUT_FAST}s — using cached value")
            return self._last_balance
        except Exception as e:
            logger.warning(f"get_balance error: {e}")
            self.connected = False
            return self._last_balance  # return cached if available

    async def get_current_block(self) -> Optional[int]:
        try:
            async with await self._subtensor() as sub:
                block = await asyncio.wait_for(sub.get_current_block(), timeout=self._TIMEOUT_FAST)
                self._last_block = block
                self.connected   = True
                return block
        except asyncio.TimeoutError:
            logger.warning(f"get_current_block timed out after {self._TIMEOUT_FAST}s — using cached value")
            return self._last_block
        except Exception as e:
            logger.warning(f"get_current_block error: {e}")
            return self._last_block

    async def get_chain_info(self) -> Dict[str, Any]:
        """Fetch balance + block in one connection.
        Block query is the connectivity proof — balance is best-effort.
        connected = True as long as the block query succeeds.
        """
        try:
            async with await self._subtensor() as sub:
                # Block query proves connectivity; balance is best-effort
                block = await asyncio.wait_for(sub.get_current_block(), timeout=self._TIMEOUT_FAST)
                self._last_block    = block
                self._last_chain_at = datetime.now(timezone.utc).isoformat()
                self.connected      = True   # chain is reachable

                # Balance — independent best-effort
                if self._coldkey_addr:
                    try:
                        bal = await asyncio.wait_for(
                            sub.get_balance(self._coldkey_addr),
                            timeout=self._TIMEOUT_FAST,
                        )
                        self._last_balance = float(bal)
                    except asyncio.TimeoutError:
                        logger.debug("Balance query timed out (non-fatal) — using cached")
                    except Exception as _be:
                        logger.debug(f"Balance query failed (non-fatal): {_be}")

                return {
                    "address":       self._coldkey_addr,
                    "balance_tao":   self._last_balance,
                    "block":         self._last_block,
                    "network":       NETWORK,
                    "connected":     True,
                    "timestamp":     self._last_chain_at,
                    "wallet_loaded": self._mnemonic_set,
                }
        except asyncio.TimeoutError:
            logger.warning(f"get_chain_info block query timed out after {self._TIMEOUT_FAST}s")
            self.connected = False
            return {
                "address":       self._coldkey_addr,
                "balance_tao":   self._last_balance,
                "block":         self._last_block,
                "network":       NETWORK,
                "connected":     False,
                "error":         "chain query timed out",
                "wallet_loaded": self._mnemonic_set,
            }
        except Exception as e:
            logger.warning(f"get_chain_info error: {e}")
            self.connected = False
            return {
                "address":       self._coldkey_addr,
                "balance_tao":   self._last_balance,
                "block":         self._last_block,
                "network":       NETWORK,
                "connected":     False,
                "error":         str(e),
                "wallet_loaded": self._mnemonic_set,
            }

    async def get_subnet_prices(self, limit: int = 20) -> List[Dict]:
        """
        Fetch dTAO alpha prices for top subnets from Finney.
        Returns list of {netuid, price} dicts sorted by price descending.
        These prices drive the market regime + emission signals.

        Fix: sort ALL prices by value descending before slicing so the top N
        by price are always returned (previous code sliced an unordered dict,
        causing staked subnets like SN8/SN9 to be silently excluded).
        """
        try:
            async with await self._subtensor() as sub:
                prices = await asyncio.wait_for(sub.get_subnet_prices(), timeout=self._TIMEOUT_PRICE)
                # Build full list, cache all prices
                all_prices = []
                for netuid, price in prices.items():
                    p = float(price) if price else 0.0
                    self._subnet_prices[int(netuid)] = p
                    all_prices.append({"netuid": int(netuid), "price": p})
                self.connected = True
                # Sort by price descending, return top N
                all_prices.sort(key=lambda x: x["price"], reverse=True)
                return all_prices[:limit]
        except asyncio.TimeoutError:
            logger.warning(f"get_subnet_prices timed out after {self._TIMEOUT_PRICE}s — returning empty")
            return []
        except Exception as e:
            logger.warning(f"get_subnet_prices error: {e}")
            return []

    async def get_prices_for_netuids(self, netuids: List[int]) -> Dict[int, float]:
        """
        Fetch alpha prices for a specific set of netuids.
        Used by wallet/stakes to value staked positions regardless of price ranking.
        Returns {netuid: price_in_tao} dict.
        """
        # If we already have cached prices from a recent get_subnet_prices call, use them
        cached = {n: self._subnet_prices[n] for n in netuids if n in self._subnet_prices}
        missing = [n for n in netuids if n not in self._subnet_prices]

        if not missing:
            return cached

        # Fetch all subnet prices to populate cache for missing netuids
        try:
            async with await self._subtensor() as sub:
                prices = await asyncio.wait_for(sub.get_subnet_prices(), timeout=self._TIMEOUT_PRICE)
                for netuid, price in prices.items():
                    self._subnet_prices[int(netuid)] = float(price) if price else 0.0
            return {n: self._subnet_prices.get(n, 0.0) for n in netuids}
        except Exception as e:
            logger.warning(f"get_prices_for_netuids error: {e}")
            return {n: self._subnet_prices.get(n, 0.0) for n in netuids}

    async def get_stake_info(self) -> Dict[str, Any]:
        """Return staking positions for the coldkey."""
        try:
            async with await self._subtensor() as sub:
                stakes = await asyncio.wait_for(
                    sub.get_stake_info_for_coldkey(self._coldkey_addr),
                    timeout=self._TIMEOUT_FAST,
                )
                items = []
                if stakes:
                    for s in (stakes if isinstance(stakes, list) else [stakes]):
                        items.append({
                            "hotkey":  getattr(s, "hotkey_ss58", str(s)),
                            "stake":   float(getattr(s, "stake", 0)),
                            "netuid":  getattr(s, "netuid", None),
                        })
                return {"stakes": items, "total": sum(i["stake"] for i in items)}
        except asyncio.TimeoutError:
            logger.warning(f"get_stake_info timed out after {self._TIMEOUT_FAST}s")
            return {"stakes": [], "total": 0.0, "error": "query timed out"}
        except Exception as e:
            logger.warning(f"get_stake_info error: {e}")
            return {"stakes": [], "total": 0.0, "error": str(e)}

    # ── Staking (requires mnemonic) ───────────────────────────────────────────

    async def stake(self, hotkey_address: str, amount_tao: float, netuid: int = 1) -> Dict:
        """Alias for add_stake — used by trading_service and cycle_service."""
        return await self.add_stake(hotkey_address, amount_tao, netuid)

    async def add_stake(self, hotkey_address: str, amount_tao: float, netuid: int = 1) -> Dict:
        """
        Stake TAO to a hotkey on a subnet.
        Requires mnemonic to be loaded (signing key).
        Returns tx_hash / block_hash so the trade can be marked as real.
        """
        if not self._mnemonic_set or not self._keypair:
            return {"success": False, "error": "Mnemonic not loaded — restore wallet first"}

        # Chain minimum stake — Bittensor rejects anything below this
        MIN_STAKE_TAO    = 0.001
        # Always keep at least this much liquid: covers extrinsic fees and
        # ensures the wallet can never be fully drained by the staking loop.
        LIQUID_RESERVE   = 0.01   # τ

        if amount_tao < MIN_STAKE_TAO:
            return {
                "success": False,
                "error": f"Amount {amount_tao:.6f}τ is below Bittensor minimum stake ({MIN_STAKE_TAO}τ)"
            }

        # Always fetch a fresh balance before attempting — never rely solely on cache.
        # Stale cache is the root cause of 'amount is too low' errors on Railway:
        # get_balance() times out → returns old cached (higher) value → check passes
        # → chain call fires → Bittensor rejects because real balance is too low.
        fresh_balance = await self.get_balance()
        current_balance = fresh_balance if fresh_balance is not None else self._last_balance

        if current_balance is not None:
            # Must have enough to cover the stake AND maintain the liquid reserve.
            # Without the reserve, fees for future transactions (including unstake)
            # cannot be paid once balance hits zero.
            if amount_tao > current_balance - LIQUID_RESERVE:
                return {
                    "success": False,
                    "error": (
                        f"Insufficient balance after reserve: have {current_balance:.6f}τ, "
                        f"need {amount_tao:.6f}τ + {LIQUID_RESERVE}τ reserve = "
                        f"{amount_tao + LIQUID_RESERVE:.6f}τ"
                    )
                }

        try:
            import bittensor as bt
            # Wrap bare Keypair in Wallet-compatible adapter so SDK 10.x
            # unlock_coldkey() call succeeds (no-op) instead of raising AttributeError.
            wallet_adapter = _WalletAdapter(self._keypair)

            async with await self._subtensor() as sub:
                # 90s timeout: wait_for_inclusion = True means we wait up to
                # ~12s per block for the extrinsic to land. Allow 7-8 blocks.
                result = await asyncio.wait_for(
                    sub.add_stake(
                        wallet                = wallet_adapter,
                        netuid                = netuid,
                        hotkey_ss58           = hotkey_address,
                        amount                = bt.Balance.from_tao(amount_tao),
                        wait_for_inclusion    = True,
                        wait_for_finalization = False,
                        raise_error           = False,
                    ),
                    timeout=self._TIMEOUT_STAKE,
                )
                # SDK 10.x returns ExtrinsicResponse — bool(response) == True on success
                success = bool(result)

                # Extract block hash / tx hash from the ExtrinsicResponse
                tx_hash = None
                if hasattr(result, "block_hash") and result.block_hash:
                    tx_hash = result.block_hash
                elif hasattr(result, "extrinsic_hash") and result.extrinsic_hash:
                    tx_hash = result.extrinsic_hash
                elif isinstance(result, dict):
                    tx_hash = result.get("block_hash") or result.get("tx_hash")

                # If no hash returned but call succeeded, record the current block
                if success and not tx_hash:
                    tx_hash = f"block:{self._last_block}" if self._last_block else "confirmed"

                logger.info(
                    f"add_stake {'SUCCESS' if success else 'FAILED'} — "
                    f"{amount_tao}τ → {hotkey_address[:16]}… SN{netuid} | hash={tx_hash}"
                )
                return {
                    "success":    success,
                    "tx_hash":    tx_hash if success else None,
                    "block_hash": tx_hash if success else None,
                    "amount":     amount_tao,
                    "netuid":     netuid,
                    "hotkey":     hotkey_address,
                }
        except asyncio.TimeoutError:
            logger.error(f"add_stake timed out after {self._TIMEOUT_STAKE}s — SN{netuid} {hotkey_address[:16]}")
            return {"success": False, "error": f"stake timed out after {self._TIMEOUT_STAKE}s"}
        except Exception as e:
            logger.error(f"add_stake error: {e}")
            return {"success": False, "error": str(e)}

    async def unstake(self, hotkey_address: str, amount_tao: float, netuid: int = 1) -> Dict:
        """Unstake TAO from a hotkey on a subnet."""
        if not self._mnemonic_set or not self._keypair:
            return {"success": False, "error": "Mnemonic not loaded"}
        try:
            import bittensor as bt
            wallet_adapter = _WalletAdapter(self._keypair)
            async with await self._subtensor() as sub:
                result = await asyncio.wait_for(
                    sub.unstake(
                        wallet                = wallet_adapter,
                        netuid                = netuid,
                        hotkey_ss58           = hotkey_address,
                        amount                = bt.Balance.from_tao(amount_tao),
                        wait_for_inclusion    = True,
                        wait_for_finalization = False,
                        raise_error           = False,
                    ),
                    timeout=self._TIMEOUT_STAKE,
                )
                success = bool(result)
                tx_hash = None
                if success:
                    if hasattr(result, "block_hash") and result.block_hash:
                        tx_hash = result.block_hash
                    else:
                        tx_hash = f"block:{self._last_block}" if self._last_block else "confirmed"
                logger.info(
                    f"remove_stake {'SUCCESS' if success else 'FAILED'} — "
                    f"{amount_tao}τ ← {hotkey_address[:16]}… SN{netuid} | hash={tx_hash}"
                )
                return {
                    "success":    success,
                    "tx_hash":    tx_hash if success else None,
                    "block_hash": tx_hash if success else None,
                    "amount":     amount_tao,
                    "netuid":     netuid,
                    "hotkey":     hotkey_address,
                }
        except asyncio.TimeoutError:
            logger.error(f"unstake timed out after {self._TIMEOUT_STAKE}s — SN{netuid} {hotkey_address[:16]}")
            return {"success": False, "error": f"unstake timed out after {self._TIMEOUT_STAKE}s"}
        except Exception as e:
            logger.error(f"unstake error: {e}")
            return {"success": False, "error": str(e)}

    # ── Status ────────────────────────────────────────────────────────────────

    def get_status(self) -> Dict[str, Any]:
        return {
            "connected":      self.connected,
            "network":        NETWORK,
            "address":        self._coldkey_addr,
            "wallet_loaded":  self._mnemonic_set,
            "balance_cached": self._last_balance,
            "block_cached":   self._last_block,
            "last_chain_at":  self._last_chain_at,
        }


# ── Singleton ─────────────────────────────────────────────────────────────────
bittensor_service = BittensorService()