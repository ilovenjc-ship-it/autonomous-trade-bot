"""
Subnet Cache Service
====================
Background poller that fetches real Bittensor on-chain data and provides
it to the rest of the application via an in-memory cache.

Phase 1 — Alpha prices (every 60 s):
    get_subnet_prices() returns ALL subnet alpha prices in a single chain
    call.  We compare current vs previous snapshot to derive real trend
    direction without needing historical storage.

Phase 2 — Metagraph data for trading subnets (every 5 min):
    For the 6 subnets we actually stake into (SN0, 8, 9, 18, 64, 96) we
    pull the full metagraph to get real total stake, active miner count,
    and per-block emission.  APY is derived as:

        APY ≈ (total_emission_per_block × 7200 × 365 / total_stake) × 100

    7 200 blocks/day at ~12 s/block on Finney mainnet.

Fallback policy:
    If the chain is unreachable or a subnet has no cached data yet,
    callers receive None and must fall back to their own defaults.
    The bot never hard-errors on a missing cache entry.
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Dict, Optional

logger = logging.getLogger(__name__)


def _iso_now() -> str:
    """ISO-8601 UTC timestamp — used in owner snapshot rows."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

# ── Poll intervals ────────────────────────────────────────────────────────────
PRICE_POLL_INTERVAL = 60       # seconds  — alpha price (single bulk call)
META_POLL_INTERVAL  = 300      # seconds  — metagraph per trading subnet

# Finney block time: ~12 s  →  7 200 blocks / day
BLOCKS_PER_DAY = 7_200

# Subnets we actually stake into — priority for real metagraph data
TRADING_NETUIDS = {0, 8, 9, 18, 64, 96}

# Subnets we monitor for owner-key changes + Conviction unlock heuristics.
# Includes all trading subnets PLUS any extras flagged in research (e.g. SN3
# Templar — owner-key concern documented in STATE.md §12 Teutonic entry).
# Each subnet here costs one extra metagraph fetch per META_POLL_INTERVAL.
SN3_TEMPLAR    = 3
EXTRA_MONITOR_NETUIDS  = {SN3_TEMPLAR}
MONITOR_OWNERS_NETUIDS = TRADING_NETUIDS | EXTRA_MONITOR_NETUIDS

# Conviction unlock heuristic: SDK 10.x does not yet expose a typed Conviction
# storage accessor (Conviction launched 2026-05-13, same day as Zero Day). The
# pragmatic v1 signal is a material drop in the subnet owner's αTAO presence
# on the subnet between two consecutive metagraph snapshots. This catches
# both formal unlock extrinsics AND owner-side dumps. Tunable from config
# once we ship a UI control for it.
CONVICTION_UNLOCK_DROP_PCT = 5.0    # %: ≥5 % drop in owner alpha → fire alert
CONVICTION_UNLOCK_MIN_TAO  = 0.5    # τ: noise floor — ignore drops smaller
                                    #   than this in absolute terms

# Trend threshold: alpha price must move > 1 % to register as up/down
TREND_THRESHOLD = 0.01

# Persistence path — survives Railway redeploys so a brand-new container
# doesn't fire spurious "owner changed" alerts on first poll.
_OWNER_CACHE_PATH = os.path.join(
    os.path.dirname(__file__), "..", "subnet_owner_cache.json"
)


class SubnetCacheService:
    """
    Provides get_trend(), get_alpha_price(), and get_meta() to market.py.
    All methods are synchronous reads from an in-memory cache; the async
    pollers run as background tasks and write to the cache.
    """

    # How many historical price snapshots to retain per subnet (for sparklines)
    _HISTORY_DEPTH = 12

    def __init__(self):
        # Alpha prices
        self._cur_prices:  Dict[int, float] = {}   # netuid → current alpha price
        self._prev_prices: Dict[int, float] = {}   # netuid → previous alpha price
        self._price_ts:    float = 0.0              # monotonic timestamp of last update

        # Rolling price history (up to _HISTORY_DEPTH snapshots per subnet)
        self._price_history: Dict[int, list] = {}  # netuid → [price_0, price_1, …]

        # Metagraph data (trading subnets only)
        self._meta: Dict[int, dict] = {}            # netuid → {stake_tao, miners, emission, apy}
        self._meta_ts: float = 0.0

        # Owner / Conviction monitoring (all subnets in MONITOR_OWNERS_NETUIDS)
        # Shape per netuid:
        #   {
        #     "owner_ss58":   "5Foo..."   — subnet owner coldkey (None if undetected),
        #     "owner_alpha":   123.456    — αTAO held by owner coldkey on this subnet,
        #     "owner_uid":     7          — owner hotkey UID (best-effort, may be None),
        #     "fetched_at":    "2026-…"  — ISO timestamp,
        #   }
        self._owners_meta: Dict[int, dict] = {}
        self._owners_meta_ts: float = 0.0

        self._running = False
        self._task: Optional[asyncio.Task] = None

        # Load persisted owner snapshot — ensures fresh container restarts
        # don't fire spurious "owner changed" alerts on the first poll.
        try:
            if os.path.exists(_OWNER_CACHE_PATH):
                with open(_OWNER_CACHE_PATH) as f:
                    saved = json.load(f)
                # JSON keys come back as strings — normalise to int.
                self._owners_meta = {int(k): v for k, v in saved.items()}
                logger.info(
                    f"SubnetCacheService: loaded owner cache for "
                    f"{len(self._owners_meta)} subnets from disk"
                )
        except Exception as exc:
            logger.warning(f"SubnetCacheService: owner cache load failed: {exc}")
            self._owners_meta = {}

    def _persist_owners_meta(self) -> None:
        """Write _owners_meta to disk — called after each successful refresh."""
        try:
            with open(_OWNER_CACHE_PATH, "w") as f:
                # Stringify keys for JSON — int keys aren't valid JSON.
                json.dump({str(k): v for k, v in self._owners_meta.items()}, f, indent=2)
        except Exception as exc:
            logger.warning(f"SubnetCacheService: owner cache persist failed: {exc}")

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        if self._running:
            return
        self._running = True

        # Prime alpha prices immediately — single fast chain call, all subnets.
        # Metagraph fetch (6 subnets, 10-30 s each) is deferred to the background
        # loop so we don't block cycle_service.start() at boot time.
        await self._fetch_prices()
        asyncio.create_task(self._fetch_metagraphs(), name="subnet_meta_prime")

        self._task = asyncio.create_task(self._loop(), name="subnet_cache_loop")
        logger.info("SubnetCacheService started — alpha prices live, metagraph priming in background")

    async def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("SubnetCacheService stopped")

    # ── Timeout constants ─────────────────────────────────────────────────────
    # Metagraph fetches are the slowest chain calls (large payloads, 6 subnets).
    # Without timeouts a stalled RPC node can hold this background task open
    # for the entire poll interval, eventually causing event-loop starvation.
    _META_PER_SUBNET_TIMEOUT = 45.0    # seconds — per metagraph() call
    _META_TOTAL_TIMEOUT      = 270.0   # seconds — entire _fetch_metagraphs() run

    # ── Background loop ───────────────────────────────────────────────────────

    async def _loop(self) -> None:
        ticks_since_meta = 0
        meta_every = META_POLL_INTERVAL // PRICE_POLL_INTERVAL   # 5

        while self._running:
            await asyncio.sleep(PRICE_POLL_INTERVAL)
            import time as _time
            _t0 = _time.time()
            _success = True
            _err: Optional[str] = None
            try:
                await self._fetch_prices()

                ticks_since_meta += 1
                if ticks_since_meta >= meta_every:
                    # Wrap the entire metagraph cycle in an outer timeout so a
                    # completely stalled Finney node cannot hold the loop open
                    # longer than META_TOTAL_TIMEOUT seconds.
                    try:
                        await asyncio.wait_for(
                            self._fetch_metagraphs(),
                            timeout=self._META_TOTAL_TIMEOUT,
                        )
                    except asyncio.TimeoutError:
                        logger.warning(
                            f"SubnetCacheService: _fetch_metagraphs() exceeded "
                            f"{self._META_TOTAL_TIMEOUT}s — skipping this round"
                        )
                        _success = False
                        _err = f"metagraph timeout >{self._META_TOTAL_TIMEOUT}s"
                    ticks_since_meta = 0
            except Exception as e:
                _success = False
                _err = str(e)[:300]
                logger.exception(f"SubnetCacheService loop iteration failed: {e}")
            finally:
                try:
                    from services.system_health_service import system_health
                    system_health.record_run(
                        name="subnet_cache",
                        success=_success,
                        error=_err,
                        duration_ms=round((_time.time() - _t0) * 1000.0, 1),
                    )
                except Exception:
                    pass

    # ── Data fetchers ─────────────────────────────────────────────────────────

    async def _fetch_prices(self) -> None:
        """Pull all subnet alpha prices in one chain call."""
        try:
            from services.bittensor_service import bittensor_service

            # Bump limit high enough to capture all active subnets (100+ on Finney)
            raw = await bittensor_service.get_subnet_prices(limit=200)
            if not raw:
                logger.debug("SubnetCacheService: no price data returned (chain may be slow)")
                return

            new_prices = {int(p["netuid"]): float(p["price"]) for p in raw}

            # Rotate snapshots for trend computation
            self._prev_prices = dict(self._cur_prices)
            self._cur_prices  = new_prices
            self._price_ts    = time.monotonic()

            # Append to rolling history (capped at _HISTORY_DEPTH)
            for netuid, price in new_prices.items():
                hist = self._price_history.get(netuid, [])
                hist.append(price)
                if len(hist) > self._HISTORY_DEPTH:
                    hist = hist[-self._HISTORY_DEPTH:]
                self._price_history[netuid] = hist

            logger.info(
                f"SubnetCacheService: alpha prices updated — "
                f"{len(new_prices)} subnets | "
                f"age={round(time.monotonic() - self._price_ts, 1)}s"
            )

        except Exception as exc:
            logger.warning(f"SubnetCacheService._fetch_prices error: {exc}")

    async def _fetch_metagraphs(self) -> None:
        """
        Pull metagraph for each subnet in MONITOR_OWNERS_NETUIDS (superset of
        TRADING_NETUIDS). Each pass populates:
          - trading metadata (_meta) for trading subnets
          - owner snapshot (_owners_meta) for ALL monitored subnets
        Owner change → SUBNET_OWNER_CHANGE (CRITICAL).
        Material owner-α drop → CONVICTION_UNLOCK (WARNING — Conviction Era heuristic).
        """
        try:
            import bittensor as bt

            new_owners_snapshot: Dict[int, dict] = {}

            async with bt.AsyncSubtensor(network="finney") as sub:
                for netuid in sorted(MONITOR_OWNERS_NETUIDS):
                    try:
                        # Per-subnet timeout: metagraph is a large payload query.
                        # If a single subnet's RPC call hangs, we skip it and
                        # continue to the next rather than blocking the whole cycle.
                        mg = await asyncio.wait_for(
                            sub.metagraph(netuid=netuid),
                            timeout=self._META_PER_SUBNET_TIMEOUT,
                        )

                        # ── Stake / supply metric for takeover-risk calc ───────────
                        # We compute mg.S.sum() (total registered hotkey alpha stake)
                        # for ALL monitored subnets, not just trading ones, so the
                        # Subnet King takeover-risk score has a denominator for SN3.
                        stake_tao = float(mg.S.sum()) if hasattr(mg, "S") else 0.0

                        # ── Trading metadata (only for subnets we actually trade) ─
                        if netuid in TRADING_NETUIDS:
                            miners    = int(mg.n) if hasattr(mg, "n") else 0
                            emission_pb = (
                                float(mg.emission.sum()) if hasattr(mg, "emission") else 0.0
                            )
                            if stake_tao > 0 and emission_pb > 0:
                                apy_raw = (emission_pb * BLOCKS_PER_DAY * 365 / stake_tao) * 100
                                apy = round(min(apy_raw, 150.0), 2)
                                if apy_raw > 150.0:
                                    logger.debug(
                                        f"SN{netuid} APY capped: raw={apy_raw:.1f}% → 150% "
                                        f"(emission_pb={emission_pb:.6f} stake={stake_tao:.0f})"
                                    )
                            else:
                                apy = 0.0

                            self._meta[netuid] = {
                                "stake_tao": round(stake_tao, 2),
                                "miners":    miners,
                                "emission":  round(emission_pb, 8),
                                "apy":       apy,
                            }
                            logger.info(
                                f"SN{netuid} metagraph: "
                                f"stake={stake_tao:,.0f}τ  miners={miners}  "
                                f"emission={emission_pb:.6f}/block  APY≈{apy:.1f}%"
                            )
                        else:
                            # Non-trading monitored subnets (e.g., SN3 Templar):
                            # we still want stake_tao for the takeover-risk
                            # denominator but skip the APY/miners trading metadata.
                            self._meta.setdefault(netuid, {})
                            self._meta[netuid]["stake_tao"] = round(stake_tao, 2)

                        # ── Owner snapshot (for ALL monitored subnets) ────────────
                        owner_ss58, owner_uid, owner_alpha = await self._extract_owner_snapshot(
                            sub, mg, netuid
                        )
                        if owner_ss58 is not None:
                            new_owners_snapshot[netuid] = {
                                "owner_ss58":  owner_ss58,
                                "owner_uid":   owner_uid,
                                "owner_alpha": round(owner_alpha, 6),
                                "fetched_at":  _iso_now(),
                            }
                            logger.info(
                                f"SN{netuid} owner: {owner_ss58[:6]}…{owner_ss58[-4:]} "
                                f"uid={owner_uid} α={owner_alpha:.4f}τ"
                            )
                        else:
                            logger.debug(f"SN{netuid} owner — none detected this cycle")

                    except asyncio.TimeoutError:
                        logger.warning(
                            f"SN{netuid} metagraph timed out after "
                            f"{self._META_PER_SUBNET_TIMEOUT}s — skipping"
                        )
                    except Exception as exc:
                        logger.warning(f"SN{netuid} metagraph fetch error: {exc}")

            # ── Owner-change + Conviction-unlock detection ────────────────────────
            # Only run detection if we got at least one valid snapshot this pass —
            # avoids false positives when the chain is unreachable for a cycle.
            if new_owners_snapshot:
                self._detect_owner_events(new_owners_snapshot)
                # Merge new snapshot over the cached one (preserve subnets we
                # failed to fetch this cycle so the next compare uses real data).
                self._owners_meta.update(new_owners_snapshot)
                self._owners_meta_ts = time.monotonic()
                self._persist_owners_meta()

            self._meta_ts = time.monotonic()

        except Exception as exc:
            logger.warning(f"SubnetCacheService._fetch_metagraphs error: {exc}")

    async def _extract_owner_snapshot(self, sub, mg, netuid: int):
        """
        Best-effort owner-coldkey + owner-alpha extraction. Tries multiple SDK
        paths because subnet-owner accessors moved across Bittensor releases:
          1. Metagraph attribute (fastest if present in SDK 10.x+).
          2. AsyncSubtensor.get_subnet_owner / get_subnet_info typed call.
          3. Raw Substrate query SubtensorModule::SubnetOwner — universal fallback.
        Returns (owner_ss58 | None, owner_uid | None, owner_alpha_tao).
        """
        owner_ss58 = None

        # Path 1 — metagraph attribute.
        for attr in ("owner_coldkey", "owner_ss58", "subnet_owner"):
            v = getattr(mg, attr, None)
            if v:
                owner_ss58 = str(v)
                break

        # Path 2 — typed Subtensor call.
        if owner_ss58 is None:
            for method_name in ("get_subnet_owner", "get_subnet_info"):
                method = getattr(sub, method_name, None)
                if not callable(method):
                    continue
                try:
                    res = await asyncio.wait_for(method(netuid=netuid), timeout=10.0)
                    if isinstance(res, str):
                        owner_ss58 = res
                        break
                    for f in ("owner_ss58", "owner_coldkey_ss58", "owner_coldkey", "owner"):
                        v = getattr(res, f, None)
                        if v:
                            owner_ss58 = str(v)
                            break
                    if owner_ss58:
                        break
                except Exception:
                    continue

        # Path 3 — raw substrate query.
        if owner_ss58 is None:
            try:
                substrate = getattr(sub, "substrate", None)
                if substrate is not None:
                    res = await asyncio.wait_for(
                        substrate.query("SubtensorModule", "SubnetOwner", [netuid]),
                        timeout=10.0,
                    )
                    val = getattr(res, "value", res)
                    if val:
                        owner_ss58 = str(val)
            except Exception:
                pass

        if owner_ss58 is None:
            return None, None, 0.0

        # Find the owner's UID and α stake.
        #
        # Path A — metagraph coldkey scan: catches owners that are also
        # registered miners on their own subnet. Only counts stake from
        # registered UIDs (the legacy pre-Conviction pattern).
        #
        # Path B — get_stake_info_for_coldkey(owner_ss58): catches the
        # Conviction-era reality where 100% of owner emissions auto-lock
        # 1,296 α/day directly to the owner's coldkey, INDEPENDENT of UID
        # registration. This is the dominant Conviction-Era signal — without
        # it, owner_alpha returns 0 for owners that don't run their own
        # miners (which is most of them post-Conviction).
        owner_alpha = 0.0
        owner_uid: Optional[int] = None

        # Path A — metagraph UID-stake match.
        try:
            coldkeys = list(getattr(mg, "coldkeys", []) or [])
            stakes   = list(getattr(mg, "S", []) or [])
            for i, ck in enumerate(coldkeys):
                if ck == owner_ss58:
                    if owner_uid is None:
                        owner_uid = i
                    if i < len(stakes):
                        owner_alpha += float(stakes[i])
        except Exception as exc:
            logger.debug(f"SN{netuid} Path-A owner-alpha sum failed: {exc}")

        # Path B — owner coldkey direct alpha lookup (Conviction-Era critical).
        try:
            method = getattr(sub, "get_stake_info_for_coldkey", None)
            if callable(method):
                stake_positions = await asyncio.wait_for(
                    method(owner_ss58),
                    timeout=10.0,
                )
                if stake_positions:
                    items = (
                        stake_positions if isinstance(stake_positions, list)
                        else [stake_positions]
                    )
                    locked_alpha = 0.0
                    for s in items:
                        s_netuid = getattr(s, "netuid", None)
                        if s_netuid is None or int(s_netuid) != int(netuid):
                            continue
                        s_amount = float(getattr(s, "stake", 0) or 0)
                        locked_alpha += s_amount
                    # Owner-coldkey alpha is the canonical Conviction signal.
                    # Use it whenever it's non-zero — it supersedes the UID-stake
                    # heuristic, which only catches the rare case of owners
                    # who also run their own registered miner.
                    if locked_alpha > 0:
                        owner_alpha = locked_alpha
        except asyncio.TimeoutError:
            logger.debug(
                f"SN{netuid} Path-B owner-alpha (coldkey={owner_ss58[:6]}…) "
                f"timed out — falling back to Path A value {owner_alpha:.4f}τ"
            )
        except Exception as exc:
            logger.debug(f"SN{netuid} Path-B owner-alpha lookup failed: {exc}")

        return owner_ss58, owner_uid, owner_alpha

    def _detect_owner_events(self, new_snapshot: Dict[int, dict]) -> None:
        """
        Compare new owner snapshot against cached one, fire alerts on:
          - owner ss58 mismatch  → SUBNET_OWNER_CHANGE (CRITICAL).
          - owner alpha drop ≥ CONVICTION_UNLOCK_DROP_PCT
            AND drop ≥ CONVICTION_UNLOCK_MIN_TAO  → CONVICTION_UNLOCK (WARNING).
        Imports alert_service lazily to avoid circular imports at module load.
        """
        try:
            from services.alert_service import alert_service
        except Exception as exc:
            logger.warning(f"alert_service unavailable for owner-change detection: {exc}")
            return

        # Optional: enrich alerts with the subnet's Const 6-Filter scorecard
        # entry. Lazy import + try/except so the cache service stays operational
        # even if the scorecard JSON is missing.
        try:
            from services.subnet_scorecard_service import subnet_scorecard_service
        except Exception:
            subnet_scorecard_service = None  # type: ignore

        def _scorecard_label(netuid: int) -> str:
            """Returns ' (Templar 6/6)' or ' (off-scorecard)' suffix string."""
            if subnet_scorecard_service is None:
                return ""
            entry = subnet_scorecard_service.get_subnet(netuid)
            if entry is None:
                return " [off-scorecard]"
            return f" [{entry.get('name', '?')} {entry.get('score', '?')}/6]"

        for netuid, new in new_snapshot.items():
            prev = self._owners_meta.get(netuid)
            if not prev:
                # First-ever snapshot for this subnet — nothing to compare to,
                # just baseline it and move on.
                continue

            prev_owner = prev.get("owner_ss58")
            new_owner  = new.get("owner_ss58")
            prev_alpha = float(prev.get("owner_alpha", 0.0) or 0.0)
            new_alpha  = float(new.get("owner_alpha",  0.0) or 0.0)
            sc_label   = _scorecard_label(netuid)

            # ── A. Owner-key change (governance event) ───────────────────────
            if prev_owner and new_owner and prev_owner != new_owner:
                p_short = f"{prev_owner[:6]}…{prev_owner[-4:]}"
                n_short = f"{new_owner[:6]}…{new_owner[-4:]}"
                alert_service.push_alert(
                    type="SUBNET_OWNER_CHANGE",
                    level="CRITICAL",
                    title=f"🚨 SN{netuid}{sc_label} owner key rotated",
                    message=(
                        f"Subnet {netuid}{sc_label} owner coldkey changed from "
                        f"{p_short} to {n_short}. "
                        f"This is an on-chain governance event — investigate before "
                        f"adjusting positions."
                    ),
                    detail=f"prev={prev_owner} new={new_owner}",
                )
                logger.warning(
                    f"SN{netuid}{sc_label} OWNER CHANGE detected: "
                    f"{prev_owner} → {new_owner}"
                )

            # ── B. Conviction-unlock heuristic (owner-α drop) ────────────────
            if prev_owner and new_owner and prev_owner == new_owner and prev_alpha > 0:
                drop_tao = prev_alpha - new_alpha
                drop_pct = (drop_tao / prev_alpha) * 100.0
                if drop_pct >= CONVICTION_UNLOCK_DROP_PCT and drop_tao >= CONVICTION_UNLOCK_MIN_TAO:
                    alert_service.push_alert(
                        type="CONVICTION_UNLOCK",
                        level="WARNING",
                        title=f"🔓 SN{netuid}{sc_label} owner α dropped {drop_pct:.1f}%",
                        message=(
                            f"Owner coldkey alpha on SN{netuid}{sc_label} fell from "
                            f"{prev_alpha:.4f}τ → {new_alpha:.4f}τ "
                            f"(−{drop_tao:.4f}τ, −{drop_pct:.1f}%). "
                            f"Possible Conviction unlock or owner-side dump — "
                            f"bearish 21-day-out signal for this subnet's alpha."
                        ),
                        detail=(
                            f"owner={new_owner[:6]}…{new_owner[-4:]} "
                            f"prev_α={prev_alpha:.4f} new_α={new_alpha:.4f}"
                        ),
                    )
                    logger.warning(
                        f"SN{netuid}{sc_label} CONVICTION_UNLOCK heuristic: owner α "
                        f"{prev_alpha:.4f} → {new_alpha:.4f} ({drop_pct:.1f}% drop)"
                    )

            # ── C. Subnet King takeover-risk band transition ─────────────────
            # Fires CRITICAL when a subnet drops INTO the VULNERABLE band
            # (incumbent owner's defensive stake is collapsing). Dedupes
            # against the previous snapshot's band so we don't spam the
            # alert every poll while the subnet stays VULNERABLE.
            try:
                # Compute new-snapshot risk using the freshly-fetched alpha
                # plus the cached metagraph stake_tao.
                meta = self._meta.get(netuid)
                if meta and meta.get("stake_tao", 0) > 0 and new_alpha >= 0:
                    new_share = max(0.0, min(1.0, new_alpha / float(meta["stake_tao"])))
                    new_risk_band = self._risk_band(round(1.0 - new_share, 4))

                    # Previous band: prefer cached snapshot's stored risk_band if we
                    # ever stored it; otherwise recompute from prev_alpha.
                    prev_band = None
                    if prev_alpha > 0 and meta.get("stake_tao", 0) > 0:
                        prev_share = max(
                            0.0, min(1.0, prev_alpha / float(meta["stake_tao"]))
                        )
                        prev_band = self._risk_band(round(1.0 - prev_share, 4))

                    if new_risk_band == "VULNERABLE" and prev_band != "VULNERABLE":
                        alert_service.push_alert(
                            type="SUBNET_KING_TAKEOVER_RISK",
                            level="CRITICAL",
                            title=(
                                f"👑 SN{netuid}{sc_label} entered VULNERABLE band"
                            ),
                            message=(
                                f"Subnet King takeover-risk score crossed into "
                                f"VULNERABLE on SN{netuid}{sc_label} — owner α "
                                f"{new_alpha:.2f}τ vs total {meta['stake_tao']:,.0f}τ "
                                f"(owner share {new_share*100:.2f}%). "
                                f"A challenger may be amassing conviction faster than "
                                f"the incumbent. Investigate before adjusting positions."
                            ),
                            detail=(
                                f"owner_share={new_share:.4f} band={new_risk_band} "
                                f"prev_band={prev_band}"
                            ),
                        )
                        logger.warning(
                            f"SN{netuid}{sc_label} SUBNET_KING_TAKEOVER_RISK "
                            f"transition: {prev_band} → VULNERABLE "
                            f"(owner_share={new_share:.4f})"
                        )
            except Exception as exc:
                logger.debug(
                    f"SN{netuid} takeover-risk band check failed: {exc}"
                )

    # ── Public read interface ─────────────────────────────────────────────────

    def get_trend(self, netuid: int) -> Optional[str]:
        """
        Returns "up", "down", or "neutral" based on alpha price movement.
        Returns None if we don't have two consecutive snapshots yet.
        """
        cur  = self._cur_prices.get(netuid)
        prev = self._prev_prices.get(netuid)

        if cur is None or prev is None or prev == 0.0:
            return None

        change = (cur - prev) / prev
        if change > TREND_THRESHOLD:
            return "up"
        if change < -TREND_THRESHOLD:
            return "down"
        return "neutral"

    def get_alpha_price(self, netuid: int) -> Optional[float]:
        """Current dTAO alpha price for the subnet. None if not yet fetched."""
        return self._cur_prices.get(netuid)

    def get_meta(self, netuid: int) -> Optional[dict]:
        """
        Real metagraph data for trading subnets.
        Returns None for non-trading subnets or before first poll completes.
        """
        return self._meta.get(netuid)

    def get_owner_meta(self, netuid: int) -> Optional[dict]:
        """
        Owner snapshot for any subnet in MONITOR_OWNERS_NETUIDS:
            {owner_ss58, owner_uid, owner_alpha, fetched_at}.
        Returns None if the subnet is not monitored or has no snapshot yet.
        """
        return self._owners_meta.get(netuid)

    def get_all_owners(self) -> dict:
        """All cached owner snapshots — keyed by netuid."""
        return dict(self._owners_meta)

    # ── Subnet King takeover-risk score (Conviction Era) ─────────────────────
    #
    # Article #1 (Conviction Upgrade Goes Live) flagged Subnet King takeover as
    # a real vulnerability for low-conviction subnets:
    #   *"Biggest risk we see is that low value subnets could be taken over.
    #     It may be cheaper to do this than buy a new slot."* — Gareth (SN85 Vidaio)
    #
    # We compute a proxy score using two on-chain quantities we already cache:
    #   - owner_alpha   : owner coldkey αTAO holdings on this subnet (Path B)
    #   - stake_tao     : mg.S.sum() — total alpha across all registered hotkeys
    #
    # Owner Conviction Share = owner_alpha / stake_tao
    #   (fraction of total registered hotkey alpha controlled by owner)
    #
    # Takeover Risk Score = 1 − Share, in [0, 1]:
    #   0.0   = owner controls 100% of alpha (impossible but theoretically safest)
    #   1.0   = owner controls 0% of alpha (maximally vulnerable)
    #
    # Categorical bands tuned for operator readability:
    #   FORTRESS   risk < 0.50  — owner has majority; takeover virtually impossible
    #   DEFENDED   risk < 0.80  — owner has strong defensive stake
    #   CONTESTED  risk < 0.95  — owner exposed; cheap challenger could win
    #   VULNERABLE risk ≥ 0.95  — minimal incumbent defense; immediate watch target
    #
    # Caveats (documented for operator understanding):
    #  - mg.S.sum() includes ALL registered hotkey stake, not just conviction-locked.
    #    The "true" denominator (conviction-eligible alpha) requires a typed
    #    SDK accessor that doesn't exist yet. v1 proxy is conservative — overstates
    #    risk slightly because some staked alpha won't be conviction-locked yet.
    #  - Doesn't account for the 62-day half-life ramp. Day-1-of-Conviction snapshots
    #    will look more vulnerable than they actually are once the auto-lock
    #    accumulates 1,296 α/day. Re-evaluate quarterly.
    #  - Returns None for subnets where stake_tao is 0 or owner_alpha is unknown.

    @staticmethod
    def _risk_band(score: float) -> str:
        """Map numerical takeover-risk score to operator-readable band."""
        if score < 0.50:
            return "FORTRESS"
        if score < 0.80:
            return "DEFENDED"
        if score < 0.95:
            return "CONTESTED"
        return "VULNERABLE"

    def get_takeover_risk(self, netuid: int) -> Optional[dict]:
        """
        Subnet King takeover risk for a single subnet.

        Returns dict with: owner_share, risk_score, risk_band, owner_alpha,
        subnet_total_alpha. Or None if denominator data isn't cached yet.
        """
        owner_meta = self._owners_meta.get(netuid)
        meta = self._meta.get(netuid)
        if not owner_meta or not meta:
            return None

        owner_alpha = float(owner_meta.get("owner_alpha", 0.0) or 0.0)
        total_alpha = float(meta.get("stake_tao", 0.0) or 0.0)
        if total_alpha <= 0:
            return None

        owner_share = max(0.0, min(1.0, owner_alpha / total_alpha))
        risk_score  = round(1.0 - owner_share, 4)
        return {
            "netuid":             netuid,
            "owner_alpha":        round(owner_alpha, 4),
            "subnet_total_alpha": round(total_alpha, 4),
            "owner_share":        round(owner_share, 6),
            "risk_score":         risk_score,
            "risk_band":          self._risk_band(risk_score),
        }

    def get_all_takeover_risks(self) -> dict:
        """Takeover risk for every monitored subnet that has the data we need."""
        out: Dict[int, dict] = {}
        for netuid in MONITOR_OWNERS_NETUIDS:
            r = self.get_takeover_risk(netuid)
            if r is not None:
                out[netuid] = r
        return out

    def get_price_history(self, netuid: int) -> list:
        """
        Rolling alpha price history for sparklines (up to _HISTORY_DEPTH points).
        Returns an empty list if no history is available yet.
        """
        return list(self._price_history.get(netuid, []))

    # ── Status / diagnostics ─────────────────────────────────────────────────

    @property
    def has_price_data(self) -> bool:
        return bool(self._cur_prices)

    @property
    def price_age_seconds(self) -> float:
        return (time.monotonic() - self._price_ts) if self._price_ts else float("inf")

    @property
    def meta_age_seconds(self) -> float:
        return (time.monotonic() - self._meta_ts) if self._meta_ts else float("inf")

    def get_status(self) -> dict:
        return {
            "price_subnets":           len(self._cur_prices),
            "meta_subnets":            len(self._meta),
            "owner_subnets":           len(self._owners_meta),
            "price_age_s":             round(self.price_age_seconds, 1),
            "meta_age_s":              round(self.meta_age_seconds, 1),
            "has_price_data":          self.has_price_data,
            "trading_netuids":         sorted(TRADING_NETUIDS),
            "monitor_owner_netuids":   sorted(MONITOR_OWNERS_NETUIDS),
        }


# ── Singleton ─────────────────────────────────────────────────────────────────
subnet_cache_service = SubnetCacheService()