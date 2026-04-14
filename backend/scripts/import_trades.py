"""
Import recovered trade history from the original system into the new SQLite DB.
Run from backend/ directory: python scripts/import_trades.py
"""
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from db.database import AsyncSessionLocal, init_db
from models.trade import Trade


async def import_trades():
    data_path = Path(__file__).parent.parent.parent / "recovery-data" / "trades.json"
    if not data_path.exists():
        print(f"ERROR: {data_path} not found")
        return

    raw = json.loads(data_path.read_text())
    trades = raw if isinstance(raw, list) else raw.get("trades", raw.get("history", []))
    print(f"Importing {len(trades)} trades...")

    await init_db()

    imported = 0
    skipped = 0

    async with AsyncSessionLocal() as db:
        for t in trades:
            try:
                direction = t.get("direction", "BUY").lower()
                pnl = float(t.get("pnl_tao", 0) or 0)
                amount = float(t.get("position_size_tao", 0.031) or 0.031)
                price = float(t.get("entry_price", 0.1) or 0.1)
                outcome = t.get("outcome", "FLAT")
                executed_at_str = t.get("executed_at") or t.get("timestamp")

                if executed_at_str:
                    try:
                        executed_at = datetime.fromisoformat(executed_at_str.replace("Z", "+00:00"))
                    except Exception:
                        executed_at = datetime.utcnow()
                else:
                    executed_at = datetime.utcnow()

                trade = Trade(
                    trade_type=direction,
                    status="executed",
                    amount=amount,
                    price_at_trade=price,
                    usd_value=amount * 240.0,  # approximate TAO price at time
                    pnl=pnl,
                    pnl_pct=float(t.get("pnl_pct", 0) or 0),
                    strategy=t.get("agent") or t.get("strategy", "unknown"),
                    signal_reason=t.get("reasoning", "")[:500] if t.get("reasoning") else "",
                    netuid=t.get("netuid"),
                    network="finney",
                    created_at=executed_at,
                    executed_at=executed_at,
                )
                db.add(trade)
                imported += 1
            except Exception as e:
                print(f"  Skip trade: {e}")
                skipped += 1

        await db.commit()

    print(f"Done — imported {imported}, skipped {skipped}")


if __name__ == "__main__":
    asyncio.run(import_trades())