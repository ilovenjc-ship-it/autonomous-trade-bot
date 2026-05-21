"""
Day 9 — Task #C synthetic verification.

End-to-end round trip: write N ticks to a temp SQLite, instantiate a
fresh PriceService, hydrate, and assert the in-memory buffer matches
what was persisted (chronological order, count, and values).
"""
import asyncio
import os
import sys
import tempfile

# Test must be runnable from backend/ with backend on sys.path
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
sys.path.insert(0, BACKEND)


async def main():
    # Point DATABASE_URL at a fresh tempfile SQLite BEFORE importing anything
    # that touches db.database (which reads settings at import time).
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    db_url      = f"sqlite+aiosqlite:///{tmp.name}"
    db_url_sync = f"sqlite:///{tmp.name}"
    os.environ["DATABASE_URL"]      = db_url
    os.environ["DATABASE_SYNC_URL"] = db_url_sync

    # Late imports
    from db.database import init_db, AsyncSessionLocal
    from models.price_history import PriceHistory
    from services.price_service import PriceService

    print(f"[setup] sqlite tempfile: {tmp.name}")

    # 1) Initialize schema
    await init_db()

    # 2) Cold-start hydrate: empty table → empty buffer, no warmup
    svc1 = PriceService()
    await svc1._hydrate_from_db()
    assert len(svc1._price_history) == 0,  "empty-table hydrate must yield empty buffer"
    assert not svc1.is_warmed_up(),        "empty-table hydrate must NOT report warmed_up"
    print("[t1] empty-table cold start: PASS (buffer=0, warmed_up=False)")

    # 3) Write 50 synthetic ticks (drifting random walk)
    import random
    random.seed(42)
    base = 400.0
    written = []
    async with AsyncSessionLocal() as db:
        for i in range(50):
            base += random.uniform(-0.5, 0.5)
            written.append(base)
            db.add(PriceHistory(
                symbol="TAO",
                price_usd=base,
                btc_price_usd=70_000.0 + i,
                btc_price_change_pct_24h=0.5,
                rsi_14=55.0 if i >= 28 else None,
            ))
        await db.commit()
    print(f"[t2] wrote {len(written)} ticks to price_history")

    # 4) Hydrate a fresh service and verify buffer matches
    svc2 = PriceService()
    await svc2._hydrate_from_db()
    seeded = svc2._price_history
    assert len(seeded) == 50, f"expected 50, got {len(seeded)}"
    # Order check: seeded must be chronological (oldest → newest), same as written
    for i, (got, want) in enumerate(zip(seeded, written)):
        assert abs(got - want) < 1e-6, f"order mismatch at {i}: got {got} want {want}"
    assert svc2.is_warmed_up(), "50 ticks must report warmed_up"
    print(f"[t3] 50-tick hydrate: PASS (chronological, warmed_up=True)")

    # 5) Compute indicators on hydrated buffer — must produce real RSI
    indicators = svc2.compute_indicators()
    assert indicators.get("rsi_14") is not None, "rsi_14 must be computable from hydrated 50 ticks"
    assert 0 <= indicators["rsi_14"] <= 100, f"RSI out of bounds: {indicators['rsi_14']}"
    print(f"[t4] indicators on hydrated buffer: rsi_14={indicators['rsi_14']:.2f} (valid)")

    # 6) Cap test: write 250 ticks, verify hydrate clips to _max_history (200)
    async with AsyncSessionLocal() as db:
        for i in range(200):  # +200 more = 250 total
            base += random.uniform(-0.5, 0.5)
            db.add(PriceHistory(symbol="TAO", price_usd=base))
        await db.commit()

    svc3 = PriceService()
    await svc3._hydrate_from_db()
    assert len(svc3._price_history) == 200, f"cap violated: {len(svc3._price_history)}"
    print(f"[t5] 250-row hydrate clipped to {len(svc3._price_history)} (cap respected)")

    # 7) Boundary: 14 ticks (just below WARMUP_TICKS=28) — buffer populated
    # but is_warmed_up False, indicators return None for rsi_14.
    # Pure unit check (no DB churn — t1/t3/t5 already cover the DB path).
    svc4 = PriceService()
    svc4._price_history = [400.0 + i for i in range(14)]
    assert len(svc4._price_history) == 14
    assert not svc4.is_warmed_up(), "14 ticks must NOT report warmed_up"
    indicators = svc4.compute_indicators()
    assert indicators.get("rsi_14") is None, "rsi_14 must be None below WARMUP_TICKS"
    print(f"[t6] 14-tick boundary: PASS (warmed_up=False, rsi=None)")

    # 8) BTC columns round-trip — write a row with BTC fields, read it back
    # via the same path the hydrator and /api/price/history use.
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        stmt = (
            select(
                PriceHistory.btc_price_usd,
                PriceHistory.btc_price_change_pct_24h,
            )
            .where(PriceHistory.symbol == "TAO",
                   PriceHistory.btc_price_usd.is_not(None))
            .limit(1)
        )
        row = (await db.execute(stmt)).first()
    assert row is not None, "BTC columns must be readable"
    assert row.btc_price_usd is not None
    assert row.btc_price_change_pct_24h is not None
    print(f"[t7] BTC columns round-trip: PASS "
          f"(btc_price_usd={row.btc_price_usd}, btc_change={row.btc_price_change_pct_24h})")

    print("\nAll 7 tests PASS.")
    os.unlink(tmp.name)


if __name__ == "__main__":
    asyncio.run(main())