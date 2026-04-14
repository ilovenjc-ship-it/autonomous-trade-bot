"""
Bittensor SDK integration service.
Handles wallet management, subtensor connection, and on-chain transactions.
"""
import asyncio
import logging
from typing import Optional, Dict, Any, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)


class BittensorService:
    """
    Wraps the Bittensor SDK for async use.
    All blocking SDK calls are run in a thread pool executor.
    """

    def __init__(self):
        self.subtensor = None
        self.wallet = None
        self.connected = False
        self.network = "finney"
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    async def connect(self, network: str = "finney") -> bool:
        """Connect to Bittensor network (Finney mainnet by default)."""
        async with self._lock:
            try:
                import bittensor as bt
                loop = asyncio.get_event_loop()
                self.subtensor = await loop.run_in_executor(
                    None, lambda: bt.subtensor(network=network)
                )
                self.network = network
                self.connected = True
                logger.info(f"Connected to Bittensor network: {network}")
                return True
            except Exception as e:
                logger.error(f"Failed to connect to Bittensor: {e}")
                self.connected = False
                return False

    async def disconnect(self):
        async with self._lock:
            self.subtensor = None
            self.wallet = None
            self.connected = False
            logger.info("Disconnected from Bittensor network")

    # ------------------------------------------------------------------
    # Wallet
    # ------------------------------------------------------------------

    async def load_wallet(
        self,
        name: str = "default",
        hotkey: str = "default",
        path: str = "~/.bittensor/wallets",
    ) -> Tuple[bool, str]:
        """Load a Bittensor wallet. Returns (success, message)."""
        try:
            import bittensor as bt
            loop = asyncio.get_event_loop()

            def _load():
                w = bt.wallet(name=name, hotkey=hotkey, path=path)
                # Attempt to access addresses to verify existence
                _ = w.coldkey.ss58_address
                _ = w.hotkey.ss58_address
                return w

            self.wallet = await loop.run_in_executor(None, _load)
            logger.info(
                f"Loaded wallet: {name}/{hotkey} "
                f"coldkey={self.wallet.coldkey.ss58_address[:12]}…"
            )
            return True, "Wallet loaded successfully"
        except Exception as e:
            logger.error(f"Failed to load wallet: {e}")
            self.wallet = None
            return False, str(e)

    async def get_wallet_info(self) -> Dict[str, Any]:
        """Return wallet addresses and TAO balance."""
        if not self.wallet:
            return {"error": "No wallet loaded"}
        try:
            loop = asyncio.get_event_loop()

            def _info():
                result = {
                    "coldkey_address": self.wallet.coldkey.ss58_address,
                    "hotkey_address": self.wallet.hotkey.ss58_address,
                    "balance": 0.0,
                }
                if self.subtensor:
                    bal = self.subtensor.get_balance(
                        self.wallet.coldkey.ss58_address
                    )
                    result["balance"] = float(bal.tao)
                return result

            return await loop.run_in_executor(None, _info)
        except Exception as e:
            logger.error(f"get_wallet_info error: {e}")
            return {"error": str(e)}

    async def get_balance(self) -> Optional[float]:
        """Return TAO balance of the loaded wallet."""
        if not self.wallet or not self.subtensor:
            return None
        try:
            loop = asyncio.get_event_loop()
            balance = await loop.run_in_executor(
                None,
                lambda: self.subtensor.get_balance(
                    self.wallet.coldkey.ss58_address
                ),
            )
            return float(balance.tao)
        except Exception as e:
            logger.error(f"get_balance error: {e}")
            return None

    # ------------------------------------------------------------------
    # Staking / Trading (stake = "buy TAO into subnet", unstake = "sell")
    # ------------------------------------------------------------------

    async def stake(
        self, amount: float, netuid: int = 1
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Stake TAO to a subnet (equivalent to buying exposure).
        Returns (success, message, tx_hash).
        """
        if not self.wallet or not self.subtensor:
            return False, "Wallet or subtensor not initialised", None
        try:
            import bittensor as bt
            loop = asyncio.get_event_loop()

            def _stake():
                result = self.subtensor.add_stake(
                    wallet=self.wallet,
                    hotkey_ss58=self.wallet.hotkey.ss58_address,
                    amount=bt.Balance.from_tao(amount),
                    wait_for_inclusion=True,
                    wait_for_finalization=False,
                )
                return result

            success = await loop.run_in_executor(None, _stake)
            if success:
                return True, f"Staked {amount} TAO to netuid {netuid}", None
            return False, "Stake transaction failed", None
        except Exception as e:
            logger.error(f"stake error: {e}")
            return False, str(e), None

    async def unstake(
        self, amount: float, netuid: int = 1
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Unstake TAO from a subnet (equivalent to selling exposure).
        Returns (success, message, tx_hash).
        """
        if not self.wallet or not self.subtensor:
            return False, "Wallet or subtensor not initialised", None
        try:
            import bittensor as bt
            loop = asyncio.get_event_loop()

            def _unstake():
                result = self.subtensor.unstake(
                    wallet=self.wallet,
                    hotkey_ss58=self.wallet.hotkey.ss58_address,
                    amount=bt.Balance.from_tao(amount),
                    wait_for_inclusion=True,
                    wait_for_finalization=False,
                )
                return result

            success = await loop.run_in_executor(None, _unstake)
            if success:
                return True, f"Unstaked {amount} TAO from netuid {netuid}", None
            return False, "Unstake transaction failed", None
        except Exception as e:
            logger.error(f"unstake error: {e}")
            return False, str(e), None

    # ------------------------------------------------------------------
    # Network info
    # ------------------------------------------------------------------

    async def get_subnet_info(self, netuid: int = 1) -> Dict[str, Any]:
        if not self.subtensor:
            return {"error": "Not connected"}
        try:
            loop = asyncio.get_event_loop()

            def _info():
                metagraph = self.subtensor.metagraph(netuid=netuid)
                return {
                    "netuid": netuid,
                    "n_neurons": metagraph.n,
                    "total_stake": float(metagraph.total_stake.sum()),
                    "block": self.subtensor.block,
                }

            return await loop.run_in_executor(None, _info)
        except Exception as e:
            logger.error(f"get_subnet_info error: {e}")
            return {"error": str(e)}

    async def get_current_block(self) -> Optional[int]:
        if not self.subtensor:
            return None
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, lambda: self.subtensor.block)
        except Exception as e:
            logger.error(f"get_current_block error: {e}")
            return None


# Singleton
bittensor_service = BittensorService()