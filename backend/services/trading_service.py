"""
Core trading engine.
Orchestrates: price data → strategy signal → risk check → execute trade → persist.
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from db.database import AsyncSessionLocal
from models.bot_config import BotConfig
from models.trade import Trade
from models.price_history import PriceHistory
from services.bittensor_service import bittensor_service
from services.price_service import price_service
from services.strategy_service import get_signal, Signal

logger = logging.getLogger(__name__)


class TradingService:
    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Bot lifecycle
    # ------------------------------------------------------------------

    async def start_bot(self) -> Dict[str, Any]:
        async with self._lock:
            if self._running:
                return {"success": False, "message": "Bot is already running"}
            self._running = True
            self._task = asyncio.create_task(self._trading_loop())
            await self._update_bot_status(is_running=True, message="Bot started")
            logger.info("Trading bot started")
            return {"success": True, "message": "Trading bot started"}

    async def stop_bot(self) -> Dict[str, Any]:
        async with self._lock:
            if not self._running:
                return {"success": False, "message": "Bot is not running"}
            self._running = False
            if self._task:
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
            await self._update_bot_status(is_running=False, message="Bot stopped by user")
            logger.info("Trading bot stopped")
            return {"success": True, "message": "Trading bot stopped"}

    @property
    def is_running(self) -> bool:
        return self._running

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _trading_loop(self):
        while self._running:
            try:
                await self._trading_cycle()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Trading cycle error: {e}", exc_info=True)
                await self._update_bot_status(
                    is_running=True, message=f"Cycle error: {str(e)[:120]}"
                )

            # Wait for next interval
            config = await self._get_config()
            interval = config.trade_interval if config else 300
            await asyncio.sleep(interval)

    async def _trading_cycle(self):
        config = await self._get_config()
        if not config:
            logger.warning("No bot config found — skipping cycle")
            return

        # Daily trade limit check
        if config.daily_trades >= config.max_daily_trades:
            await self._update_bot_status(
                is_running=True, message="Daily trade limit reached"
            )
            return

        # Ensure price is available
        current_price = price_service.current_price
        if not current_price:
            await self._update_bot_status(
                is_running=True, message="Waiting for price data…"
            )
            return

        # Persist price snapshot
        await self._save_price_snapshot(current_price, price_service.price_data)

        # Get indicators and signal
        prices = price_service.get_price_history_list()
        indicators = price_service.compute_indicators()
        signal = get_signal(
            config.active_strategy, prices, indicators, {}
        )
        logger.info(
            f"Strategy={config.active_strategy} "
            f"action={signal['action']} reason={signal['reason']}"
        )

        action = signal["action"]
        if action == Signal.HOLD:
            await self._update_bot_status(
                is_running=True, message=f"HOLD — {signal['reason']}"
            )
            return

        # Risk check: balance
        wallet_balance = await bittensor_service.get_balance() or config.wallet_balance
        if action == Signal.BUY and wallet_balance < config.trade_amount:
            await self._update_bot_status(
                is_running=True,
                message=f"Insufficient balance ({wallet_balance:.4f} TAO) to buy {config.trade_amount} TAO",
            )
            return

        # Execute
        success, msg, tx_hash = await self._execute_trade(
            action=action,
            amount=config.trade_amount,
            price=current_price,
            strategy=config.active_strategy,
            reason=signal["reason"],
            netuid=config.netuid,
        )

        if success:
            await self._update_bot_status(
                is_running=True,
                message=f"Executed {action.upper()} {config.trade_amount} TAO @ ${current_price:.2f}",
            )
        else:
            await self._update_bot_status(is_running=True, message=f"Trade failed: {msg}")

    # ------------------------------------------------------------------
    # Trade execution
    # ------------------------------------------------------------------

    async def _execute_trade(
        self,
        action: str,
        amount: float,
        price: float,
        strategy: str,
        reason: str,
        netuid: int = 1,
    ) -> tuple:
        """Execute a trade on-chain (or simulate if wallet not connected)."""
        async with AsyncSessionLocal() as db:
            trade = Trade(
                trade_type=action,
                status="pending",
                amount=amount,
                price_at_trade=price,
                usd_value=amount * price,
                strategy=strategy,
                signal_reason=reason,
                netuid=netuid,
            )
            db.add(trade)
            await db.flush()

            tx_hash = None
            success = False
            error_msg = None

            # Resolve the validator hotkey for staking
            cfg = await self._get_config()
            hotkey = cfg.hotkey_address if cfg else None

            if bittensor_service.connected and bittensor_service.wallet_loaded and hotkey:
                if action == Signal.BUY:
                    result = await bittensor_service.stake(hotkey, amount, netuid)
                else:
                    result = await bittensor_service.unstake(hotkey, amount, netuid)
                success   = result.get("success", False)
                tx_hash   = result.get("tx_hash") or result.get("block_hash")
                msg       = "OK" if success else result.get("error", "execution failed")
                error_msg = None if success else msg
            else:
                # Simulation mode — wallet not connected or hotkey not configured
                success = True
                msg = f"[PAPER] {action} {amount} TAO @ ${price:.2f}"
                logger.info(msg)

            trade.status = "executed" if success else "failed"
            trade.executed_at = datetime.utcnow()
            trade.tx_hash = tx_hash
            trade.error_message = error_msg

            await db.commit()

            if success:
                await self._update_stats_after_trade(action, amount, price)

            return success, msg if not success else "OK", tx_hash

    # ------------------------------------------------------------------
    # Manual trade trigger
    # ------------------------------------------------------------------

    async def manual_trade(
        self, action: str, amount: float, reason: str = "Manual trade"
    ) -> Dict[str, Any]:
        current_price = price_service.current_price
        if not current_price:
            return {"success": False, "message": "No price data available"}

        config = await self._get_config()
        strategy = config.active_strategy if config else "manual"
        netuid = config.netuid if config else 1

        success, msg, tx_hash = await self._execute_trade(
            action=action,
            amount=amount,
            price=current_price,
            strategy=strategy,
            reason=reason,
            netuid=netuid,
        )
        return {
            "success": success,
            "message": msg,
            "tx_hash": tx_hash,
            "price": current_price,
            "amount": amount,
        }

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    async def _get_config(self) -> Optional[BotConfig]:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(BotConfig).where(BotConfig.id == 1))
            return result.scalar_one_or_none()

    async def _update_bot_status(self, is_running: bool, message: str):
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(BotConfig)
                .where(BotConfig.id == 1)
                .values(is_running=is_running, status_message=message)
            )
            await db.commit()

    async def _update_stats_after_trade(self, action: str, amount: float, price: float):
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(BotConfig).where(BotConfig.id == 1))
            config = result.scalar_one_or_none()
            if config:
                config.total_trades = (config.total_trades or 0) + 1
                config.successful_trades = (config.successful_trades or 0) + 1
                config.daily_trades = (config.daily_trades or 0) + 1
                config.last_trade_at = datetime.utcnow()
                await db.commit()

    async def _save_price_snapshot(self, price: float, data: Dict[str, Any]):
        async with AsyncSessionLocal() as db:
            indicators = price_service.compute_indicators()
            snapshot = PriceHistory(
                symbol="TAO",
                price_usd=price,
                volume_24h=data.get("volume_24h"),
                market_cap=data.get("market_cap"),
                price_change_24h=data.get("price_change_24h"),
                price_change_pct_24h=data.get("price_change_pct_24h"),
                **{k: v for k, v in indicators.items() if v is not None},
            )
            db.add(snapshot)
            await db.commit()


# Singleton
trading_service = TradingService()