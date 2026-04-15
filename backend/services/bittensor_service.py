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

TARGET_WALLET = "5GgRojEFh5aCFNLKuSWb6WtrM5nBDB6GrRpqaqreBLcg4e7L"
NETWORK       = "finney"

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

    async def get_balance(self, address: Optional[str] = None) -> Optional[float]:
        """Query live TAO balance from Finney mainnet."""
        addr = address or self._coldkey_addr
        try:
            async with await self._subtensor() as sub:
                bal = await sub.get_balance(addr)
                result = float(bal)
                self._last_balance = result
                self._last_chain_at = datetime.now(timezone.utc).isoformat()
                self.connected = True
                return result
        except Exception as e:
            logger.warning(f"get_balance error: {e}")
            self.connected = False
            return self._last_balance  # return cached if available

    async def get_current_block(self) -> Optional[int]:
        try:
            async with await self._subtensor() as sub:
                block = await sub.get_current_block()
                self._last_block = block
                self.connected   = True
                return block
        except Exception as e:
            logger.warning(f"get_current_block error: {e}")
            return self._last_block

    async def get_chain_info(self) -> Dict[str, Any]:
        """Fetch balance + block in one connection."""
        try:
            async with await self._subtensor() as sub:
                balance, block = await asyncio.gather(
                    sub.get_balance(self._coldkey_addr),
                    sub.get_current_block(),
                )
                self._last_balance  = float(balance)
                self._last_block    = block
                self._last_chain_at = datetime.now(timezone.utc).isoformat()
                self.connected      = True
                return {
                    "address":     self._coldkey_addr,
                    "balance_tao": self._last_balance,
                    "block":       self._last_block,
                    "network":     NETWORK,
                    "connected":   True,
                    "timestamp":   self._last_chain_at,
                    "wallet_loaded": self._mnemonic_set,
                }
        except Exception as e:
            logger.warning(f"get_chain_info error: {e}")
            self.connected = False
            return {
                "address":     self._coldkey_addr,
                "balance_tao": self._last_balance,
                "block":       self._last_block,
                "network":     NETWORK,
                "connected":   False,
                "error":       str(e),
                "wallet_loaded": self._mnemonic_set,
            }

    async def get_subnet_prices(self, limit: int = 20) -> List[Dict]:
        """
        Fetch dTAO alpha prices for top subnets from Finney.
        Returns list of {netuid, price, exists} dicts.
        These prices drive the market regime + emission signals.
        """
        try:
            async with await self._subtensor() as sub:
                prices = await sub.get_subnet_prices()
                result = []
                for netuid, price in list(prices.items())[:limit]:
                    p = float(price) if price else 0.0
                    self._subnet_prices[netuid] = p
                    result.append({"netuid": int(netuid), "price": p})
                self.connected = True
                return sorted(result, key=lambda x: x["price"], reverse=True)
        except Exception as e:
            logger.warning(f"get_subnet_prices error: {e}")
            return []

    async def get_stake_info(self) -> Dict[str, Any]:
        """Return staking positions for the coldkey."""
        try:
            async with await self._subtensor() as sub:
                stakes = await sub.get_stake_info_for_coldkey(self._coldkey_addr)
                items = []
                if stakes:
                    for s in (stakes if isinstance(stakes, list) else [stakes]):
                        items.append({
                            "hotkey":  getattr(s, "hotkey_ss58", str(s)),
                            "stake":   float(getattr(s, "stake", 0)),
                            "netuid":  getattr(s, "netuid", None),
                        })
                return {"stakes": items, "total": sum(i["stake"] for i in items)}
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
        """
        if not self._mnemonic_set or not self._keypair:
            return {"success": False, "error": "Mnemonic not loaded — restore wallet first"}
        try:
            import bittensor as bt
            from bittensor_wallet import Wallet
            async with await self._subtensor() as sub:
                result = await sub.add_stake(
                    wallet          = self._keypair,
                    hotkey_ss58     = hotkey_address,
                    amount          = bt.Balance.from_tao(amount_tao),
                    netuid          = netuid,
                    wait_for_inclusion     = True,
                    wait_for_finalization  = False,
                )
                return {
                    "success": bool(result),
                    "amount":  amount_tao,
                    "netuid":  netuid,
                    "hotkey":  hotkey_address,
                }
        except Exception as e:
            logger.error(f"add_stake error: {e}")
            return {"success": False, "error": str(e)}

    async def unstake(self, hotkey_address: str, amount_tao: float, netuid: int = 1) -> Dict:
        """Unstake TAO from a hotkey on a subnet."""
        if not self._mnemonic_set or not self._keypair:
            return {"success": False, "error": "Mnemonic not loaded"}
        try:
            import bittensor as bt
            async with await self._subtensor() as sub:
                result = await sub.unstake(
                    wallet          = self._keypair,
                    hotkey_ss58     = hotkey_address,
                    amount          = bt.Balance.from_tao(amount_tao),
                    netuid          = netuid,
                    wait_for_inclusion     = True,
                    wait_for_finalization  = False,
                )
                return {"success": bool(result), "amount": amount_tao}
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