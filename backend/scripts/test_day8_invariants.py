"""
Day 8 invariants — regression test suite.

If this file goes red, something foundational regressed. Read STATE.md §0
LOAD-BEARING INVARIANTS before "fixing" the failing test — the test is
correct; the production code regressed against it.

Run:
    cd backend && python scripts/test_day8_invariants.py

Five invariants are exercised:

  INV-1  RSI(14) Wilder + 28-tick warmup, returns None below threshold
  INV-2  Single regime classifier (cycle_service canonical, agent_service mapper)
  INV-3  mean_reversion + contrarian_flow regime-agnostic
  INV-4  macro_correlation = symmetric BTC-vs-TAO divergence, no TAO-only fallback
  INV-5  PriceService persists every tick AND hydrates on start

Each test is self-contained. No pytest dependency — runs as a script so a
stranded successor agent can verify the system without setting up tooling.
"""
import asyncio
import os
import sys
import tempfile
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
sys.path.insert(0, BACKEND)

# CRITICAL: point DATABASE_URL at a fresh tempfile BEFORE any imports of
# services.* — the database engine binds at module-import time and prior
# imports would otherwise lock the suite onto the default ./trading_bot.db
# (which would defeat INV-5's empty-hydrate test).
_SUITE_DB = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_SUITE_DB.close()
os.environ["DATABASE_URL"]      = f"sqlite+aiosqlite:///{_SUITE_DB.name}"
os.environ["DATABASE_SYNC_URL"] = f"sqlite:///{_SUITE_DB.name}"


# ─── Reporter ────────────────────────────────────────────────────────────────

class Result:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.failures: list[tuple[str, str]] = []

    def ok(self, name: str):
        self.passed += 1
        print(f"  PASS  {name}")

    def fail(self, name: str, reason: str):
        self.failed += 1
        self.failures.append((name, reason))
        print(f"  FAIL  {name}: {reason}")


# ─── INV-1: RSI Wilder + warmup guard ────────────────────────────────────────

def test_inv1_rsi(r: Result):
    """RSI(14) is Wilder-smoothed, requires WARMUP_TICKS=28, returns None below."""
    print("\n[INV-1] RSI(14) Wilder + warmup guard")
    from services.price_service import PriceService, WARMUP_TICKS, RSI_PERIOD

    if WARMUP_TICKS != 28:
        r.fail("INV-1.warmup-constant",
               f"WARMUP_TICKS must be 28 (= 2 × RSI_PERIOD); got {WARMUP_TICKS}")
        return
    r.ok("INV-1.warmup-constant (WARMUP_TICKS=28)")

    if RSI_PERIOD != 14:
        r.fail("INV-1.period-constant", f"RSI_PERIOD must be 14; got {RSI_PERIOD}")
        return
    r.ok("INV-1.period-constant (RSI_PERIOD=14)")

    # Below threshold → None
    svc = PriceService()
    svc._price_history = [400.0 + i for i in range(14)]
    rsi = svc.compute_indicators().get("rsi_14")
    if rsi is not None:
        r.fail("INV-1.below-threshold-none",
               f"RSI must be None below WARMUP_TICKS; got {rsi}")
    else:
        r.ok("INV-1.below-threshold-none (14 ticks → None)")

    # Flat price at threshold → None (NOT 50.0 — that was the original bug)
    svc._price_history = [400.0] * 30
    rsi = svc.compute_indicators().get("rsi_14")
    if rsi == 50.0:
        r.fail("INV-1.flat-price-none",
               "RSI returned 50.0 on flat price — `else: 50.0` fallback regressed!")
    elif rsi is not None:
        r.fail("INV-1.flat-price-none",
               f"RSI must be None on flat price; got {rsi}")
    else:
        r.ok("INV-1.flat-price-none (flat → None, not 50.0)")

    # All-up → 100.0 (Wilder boundary)
    svc._price_history = [400.0 + i * 0.5 for i in range(30)]
    rsi = svc.compute_indicators().get("rsi_14")
    if rsi is None or rsi <= 95:
        r.fail("INV-1.monotone-up", f"All-up RSI should approach 100; got {rsi}")
    else:
        r.ok(f"INV-1.monotone-up (all-up → {rsi:.1f})")

    # Random walk past warmup → real number in (0, 100)
    import random
    random.seed(7)
    svc._price_history = []
    p = 400.0
    for _ in range(50):
        p += random.uniform(-0.5, 0.5)
        svc._price_history.append(p)
    rsi = svc.compute_indicators().get("rsi_14")
    if rsi is None or not (0 < rsi < 100):
        r.fail("INV-1.real-walk", f"Random walk RSI should be a real number in (0,100); got {rsi}")
    else:
        r.ok(f"INV-1.real-walk (50-tick walk → {rsi:.2f})")


# ─── INV-2: Single regime classifier ─────────────────────────────────────────

def test_inv2_regime(r: Result):
    """One regime classifier: cycle_service canonical, agent_service is wrapper."""
    print("\n[INV-2] Single regime classifier")
    from services.cycle_service import _detect_regime, to_human_regime
    from services import agent_service

    # No RSI → UNKNOWN (the critical regression case from R1)
    out = _detect_regime({"rsi_14": None})
    if out != "UNKNOWN":
        r.fail("INV-2.rsi-none-unknown",
               f"RSI=None must yield UNKNOWN; got {out}")
    else:
        r.ok("INV-2.rsi-none-unknown")

    # RSI 60.01 → TRENDING_UP (canonical boundary)
    out = _detect_regime({"rsi_14": 60.01, "bb_upper": 401, "bb_lower": 399, "bb_mid": 400})
    if out != "TRENDING_UP":
        r.fail("INV-2.rsi-up-boundary", f"RSI=60.01 should be TRENDING_UP; got {out}")
    else:
        r.ok("INV-2.rsi-up-boundary")

    # RSI 39.99 → TRENDING_DOWN
    out = _detect_regime({"rsi_14": 39.99, "bb_upper": 401, "bb_lower": 399, "bb_mid": 400})
    if out != "TRENDING_DOWN":
        r.fail("INV-2.rsi-down-boundary", f"RSI=39.99 should be TRENDING_DOWN; got {out}")
    else:
        r.ok("INV-2.rsi-down-boundary")

    # to_human_regime mapping
    expected = {"TRENDING_UP": "BULL", "TRENDING_DOWN": "BEAR",
                "SIDEWAYS": "SIDEWAYS", "VOLATILE": "VOLATILE", "UNKNOWN": "UNKNOWN"}
    bad = [(k, to_human_regime(k)) for k, v in expected.items() if to_human_regime(k) != v]
    if bad:
        r.fail("INV-2.human-mapping", f"to_human_regime mismatches: {bad}")
    else:
        r.ok("INV-2.human-mapping (5/5 vocab terms)")

    # agent_service._detect_regime must be a THIN wrapper around the canonical
    # detector. We assert this two ways:
    #   (a) the wrapper exists as a method on AgentService
    #   (b) its source body is small (≤8 lines) — if someone reintroduces a
    #       41-line parallel classifier, this trips loud.
    import inspect
    AgentClass = None
    for name, obj in vars(agent_service).items():
        if inspect.isclass(obj) and hasattr(obj, "_detect_regime"):
            AgentClass = obj; break

    if AgentClass is None:
        r.fail("INV-2.agent-wrapper-exists",
               "no class on agent_service exposes _detect_regime — wrapper deleted?")
    else:
        r.ok(f"INV-2.agent-wrapper-exists ({AgentClass.__name__}._detect_regime)")
        # Count REAL statements in the function body via AST — this excludes
        # docstrings, comments, and blank lines, so a re-introduced parallel
        # classifier is the only way the count goes up.
        import ast
        try:
            src = inspect.getsource(AgentClass._detect_regime)
            # Dedent so the function parses standalone
            import textwrap
            tree = ast.parse(textwrap.dedent(src))
            fn = tree.body[0]   # the FunctionDef
            stmts = fn.body
            # Drop the docstring node if present
            if (stmts and isinstance(stmts[0], ast.Expr)
                    and isinstance(stmts[0].value, ast.Constant)
                    and isinstance(stmts[0].value.value, str)):
                stmts = stmts[1:]
            stmt_count = len(stmts)
            # Current wrapper body is exactly 3 statements (import / assign / return).
            # Allow up to 6 for minor refactors. The pre-Day-8 parallel classifier
            # had ~25+ statements — a regression to that recreates INV-2's bug.
            if stmt_count > 6:
                r.fail("INV-2.agent-wrapper-thin",
                       f"agent_service._detect_regime has {stmt_count} body statements — "
                       f"looks like a parallel classifier was reintroduced. Must remain "
                       f"a thin wrapper around cycle_service._detect_regime.")
            else:
                r.ok(f"INV-2.agent-wrapper-thin ({stmt_count} body statements)")
        except Exception as e:
            r.fail("INV-2.agent-wrapper-thin", f"AST inspect failed: {e}")

    # The wrapper must import from cycle_service — the only canonical home for
    # regime thresholds. If a successor agent inlines new threshold logic in
    # agent_service, this trips.
    try:
        src = inspect.getsource(AgentClass._detect_regime) if AgentClass else ""
        if "cycle_service" not in src or "to_human_regime" not in src:
            r.fail("INV-2.agent-wrapper-imports",
                   "agent_service._detect_regime must reference cycle_service "
                   "and to_human_regime — single source of truth invariant violated.")
        else:
            r.ok("INV-2.agent-wrapper-imports (delegates to cycle_service)")
    except Exception as e:
        r.fail("INV-2.agent-wrapper-imports", f"inspect failed: {e}")


# ─── INV-3: Regime-agnostic gate for mean_reversion + contrarian_flow ───────

def test_inv3_regime_agnostic(r: Result):
    """mean_reversion + contrarian_flow MUST stay regime-agnostic (all 4 regimes)."""
    print("\n[INV-3] mean_reversion + contrarian_flow regime-agnostic")
    from services.cycle_service import REGIME_SUITABILITY

    REQUIRED = {"TRENDING_UP", "TRENDING_DOWN", "SIDEWAYS", "VOLATILE"}

    for bot in ("mean_reversion", "contrarian_flow"):
        regs = set(REGIME_SUITABILITY.get(bot, []))
        if regs != REQUIRED:
            r.fail(f"INV-3.{bot}",
                   f"must be regime-agnostic (all 4); got {sorted(regs)}. "
                   f"This recreates the 0-trade dead-bot bug from Day 8 R3.")
        else:
            r.ok(f"INV-3.{bot} (regime-agnostic)")


# ─── INV-4: macro_correlation BTC-divergence logic ──────────────────────────

def test_inv4_macro_corr(r: Result):
    """macro_correlation MUST be symmetric BTC-vs-TAO divergence with no TAO fallback."""
    print("\n[INV-4] macro_correlation BTC-divergence")
    from services.cycle_service import (
        _compute_signal,
        MACRO_CORR_MIN_DIVERGENCE_PCT as DIV,
        MACRO_CORR_MIN_BTC_MOVE_PCT as FLOOR,
    )

    if DIV != 1.5:
        r.fail("INV-4.divergence-threshold", f"divergence must be ±1.5pp; got {DIV}")
        return
    if FLOOR != 1.0:
        r.fail("INV-4.activity-floor", f"BTC activity floor must be 1.0%; got {FLOOR}")
        return
    r.ok("INV-4.thresholds (±1.5pp divergence, 1.0% BTC floor)")

    # Missing BTC → None (no TAO-only fallback)
    out = _compute_signal("macro_correlation",
                          {"btc_change_24h": None, "tao_change_24h": 5.0,
                           "rsi_14": 80, "ema_9": 405, "ema_21": 400, "sma_50": 395},
                          400.0)
    if out is not None:
        r.fail("INV-4.no-tao-fallback",
               f"missing BTC must abstain; got {out}. "
               f"SMA50/EMA fallback regressed — this clones yield_maximizer.")
    else:
        r.ok("INV-4.no-tao-fallback (missing BTC → None)")

    # Below activity floor → None (quiet macro day discipline)
    out = _compute_signal("macro_correlation",
                          {"btc_change_24h": 0.5, "tao_change_24h": 5.0}, 400.0)
    if out is not None:
        r.fail("INV-4.activity-floor-abstain",
               f"BTC <1.0% must abstain; got {out}")
    else:
        r.ok("INV-4.activity-floor-abstain (BTC=0.5% → None)")

    # +divergence (BTC up, TAO lagging) → BUY
    out = _compute_signal("macro_correlation",
                          {"btc_change_24h": 5.0, "tao_change_24h": 1.0}, 400.0)
    if out != "buy":
        r.fail("INV-4.tao-lagging-up", f"BTC+5/TAO+1 should BUY; got {out}")
    else:
        r.ok("INV-4.tao-lagging-up (BUY)")

    # −divergence (BTC down hard, TAO holding) → SELL
    out = _compute_signal("macro_correlation",
                          {"btc_change_24h": -5.0, "tao_change_24h": -1.0}, 400.0)
    if out != "sell":
        r.fail("INV-4.tao-leading-down", f"BTC-5/TAO-1 should SELL; got {out}")
    else:
        r.ok("INV-4.tao-leading-down (SELL)")

    # In-band (BTC moved, TAO tracking) → None
    out = _compute_signal("macro_correlation",
                          {"btc_change_24h": 3.0, "tao_change_24h": 2.5}, 400.0)
    if out is not None:
        r.fail("INV-4.in-band-abstain",
               f"|divergence|=0.5pp should abstain; got {out}")
    else:
        r.ok("INV-4.in-band-abstain (TAO tracking BTC → None)")


# ─── INV-5: PriceService persistence (writer + hydrator + reader) ────────────

async def test_inv5_persistence(r: Result):
    """PriceService persists every tick AND hydrates on start; reader reads local."""
    print("\n[INV-5] Price-history persistence")

    # Use the suite-level temp DB (set at module top before imports).
    from db.database import init_db, AsyncSessionLocal
    from models.price_history import PriceHistory
    from services.price_service import PriceService
    from sqlalchemy import delete

    await init_db()

    # Clear price_history so empty-hydrate test starts clean.
    async with AsyncSessionLocal() as db:
        await db.execute(delete(PriceHistory))
        await db.commit()

    # Hydrator method exists and is async
    svc = PriceService()
    if not hasattr(svc, "_hydrate_from_db"):
        r.fail("INV-5.hydrator-exists",
               "_hydrate_from_db method missing — hydrator was deleted!")
        os.unlink(tmp.name); return
    r.ok("INV-5.hydrator-exists")

    if not hasattr(svc, "_persist_tick"):
        r.fail("INV-5.writer-exists",
               "_persist_tick method missing — writer was deleted!")
        os.unlink(tmp.name); return
    r.ok("INV-5.writer-exists")

    # BTC columns exist on the model
    cols = {c.name for c in PriceHistory.__table__.columns}
    for required in ("btc_price_usd", "btc_price_change_pct_24h"):
        if required not in cols:
            r.fail(f"INV-5.col-{required}",
                   f"column {required} missing from PriceHistory model!")
            os.unlink(tmp.name); return
    r.ok("INV-5.btc-columns (btc_price_usd + btc_price_change_pct_24h)")

    # Empty-table hydrate is non-fatal and yields empty buffer
    await svc._hydrate_from_db()
    if len(svc._price_history) != 0:
        r.fail("INV-5.empty-hydrate",
               f"empty-table hydrate should yield empty buffer; got {len(svc._price_history)}")
        os.unlink(tmp.name); return
    r.ok("INV-5.empty-hydrate")

    # Write 30 ticks → fresh service hydrates → buffer populated chronologically
    async with AsyncSessionLocal() as db:
        for i in range(30):
            db.add(PriceHistory(symbol="TAO", price_usd=400.0 + i * 0.1))
        await db.commit()

    svc2 = PriceService()
    await svc2._hydrate_from_db()
    if len(svc2._price_history) != 30:
        r.fail("INV-5.hydrate-count",
               f"30 persisted ticks should hydrate to buffer of 30; got {len(svc2._price_history)}")
    else:
        r.ok("INV-5.hydrate-count (30 ticks restored)")

    # Hydrated buffer is chronological (oldest first)
    expected = [400.0 + i * 0.1 for i in range(30)]
    if any(abs(g - w) > 1e-6 for g, w in zip(svc2._price_history, expected)):
        r.fail("INV-5.hydrate-order",
               "hydrated buffer not in chronological order")
    else:
        r.ok("INV-5.hydrate-order (chronological)")

    # is_warmed_up reflects hydrated state (30 ≥ 28)
    if not svc2.is_warmed_up():
        r.fail("INV-5.warmed-up-after-hydrate",
               "30 hydrated ticks should mark service as warmed_up")
    else:
        r.ok("INV-5.warmed-up-after-hydrate")

    # Indicators compute from hydrated buffer (not waiting for new ticks)
    rsi = svc2.compute_indicators().get("rsi_14")
    if rsi is None:
        r.fail("INV-5.indicators-from-hydrate",
               "rsi_14 must be computable from hydrated buffer (proves the loop is closed)")
    else:
        r.ok(f"INV-5.indicators-from-hydrate (rsi_14={rsi:.2f})")

    # /api/price/history reader defaults to source=local
    # (we verify by checking the route signature accepts that default)
    from routers.price import get_price_history
    import inspect
    sig = inspect.signature(get_price_history)
    src = sig.parameters.get("source")
    if src is None or "local" not in str(src.default):
        r.fail("INV-5.reader-default-local",
               "/api/price/history default should be source=local; "
               f"got {src.default if src else 'no source param'}")
    else:
        r.ok("INV-5.reader-default-local (source=local)")


# ─── Main ────────────────────────────────────────────────────────────────────

async def main():
    r = Result()
    print("=" * 64)
    print("DAY 8 INVARIANTS — REGRESSION TEST SUITE")
    print("Read STATE.md §0 LOAD-BEARING INVARIANTS before 'fixing' anything.")
    print("=" * 64)

    suites = [
        ("INV-1 RSI",         test_inv1_rsi,        False),
        ("INV-2 regime",      test_inv2_regime,     False),
        ("INV-3 regime-agno", test_inv3_regime_agnostic, False),
        ("INV-4 macro_corr",  test_inv4_macro_corr, False),
        ("INV-5 persistence", test_inv5_persistence, True),
    ]

    for name, fn, is_async in suites:
        try:
            if is_async:
                await fn(r)
            else:
                fn(r)
        except Exception as e:
            r.fail(name, f"suite raised: {e}\n{traceback.format_exc()}")

    print("\n" + "=" * 64)
    print(f"  RESULT: {r.passed} passed, {r.failed} failed")
    if r.failed:
        print("\n  FAILURES:")
        for name, reason in r.failures:
            print(f"    • {name}\n        {reason}")
        print("\n  STOP. Read STATE.md §0 and SUCCESSOR_BRIEF.md §5 before "
              "modifying production code. The test is correct; the code regressed.")
        sys.exit(1)
    print("  All Day 8 invariants intact.")
    print("=" * 64)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        try:
            os.unlink(_SUITE_DB.name)
        except Exception:
            pass