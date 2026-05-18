"""
Audit Logging Service
=====================
Session XXXIV — observability hardening (Phase B).

Persistent, append-only audit trail for every operationally-meaningful
mutation in the system. Two storage layers:

  1. In-memory ring buffer (last 1000 events) for the UI page
  2. JSONL file on disk for long-term forensics, written through the
     same 4-tier path resolution we use for whale_cache and the CEX
     listing cache (Railway volume aware).

What gets audited (initial scope)
---------------------------------
  • risk_config_update      — every /api/fleet/risk/config POST
                              (before / after diff per key)
  • bot_lifecycle           — bot start / stop / pause / force-paper /
                              resume-live
  • strategy_mode_change    — promotion / demotion between
                              PAPER_ONLY / APPROVED_FOR_LIVE / LIVE
  • human_override          — manual trade emit, manual subnet stake,
                              human-override panel actions
  • consensus_threshold     — set_supermajority(N) on the consensus
                              engine (lives in risk_config too but
                              recorded separately for clarity)
  • subnet_owner_change     — fired by subnet_cache_service when an
                              on-chain SUBNET_OWNER_CHANGE alert lands
  • cex_listing_detected    — when a CEX RSS hit fires its alert

Each record carries:
  id          monotonic int (ring-buffer position; resets on restart)
  timestamp   ISO-8601 UTC
  action      slug (kebab-case-ish) — see categories above
  actor       "operator" | "system" | "service:<name>"
  before      arbitrary JSON-serialisable snapshot (or None)
  after       arbitrary JSON-serialisable snapshot (or None)
  metadata    free-form string-keyed dict (route, ip, session, …)
  category    grouping for the UI filter ("config", "trading",
              "lifecycle", "alert", "system")

Public API (sync, threadsafe)
-----------------------------
  audit_service.record(action, actor="operator", before=None, after=None,
                       category="config", metadata=None) -> dict
  audit_service.list(limit=200, action=None, category=None, actor=None) -> list
  audit_service.summary() -> dict   # counts per category + buffer state
  audit_service.tail(n=10) -> list  # newest-first, for chat surfacing

The record() entrypoint also pushes a system_health heartbeat so the
audit pipe shows up on the System Health page like any other service.

Soft-fail throughout: an audit write must NEVER raise into a caller's
control flow. Exceptions are logged + suppressed.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional

logger = logging.getLogger(__name__)


# ── Tunables ─────────────────────────────────────────────────────────────────
MAX_RING            = 1000           # in-memory event count
DEFAULT_LOG_PATH    = "backend/data/audit_log.jsonl"
MAX_DISK_BYTES      = 16 * 1024 * 1024   # 16 MB → rotate
ROTATION_KEEP       = 3                  # keep 3 rotated archives


def _resolve_log_path() -> Path:
    """4-tier resolution mirroring whale_service / cex_listing_service."""
    explicit = (os.environ.get("AUDIT_LOG_PATH") or "").strip()
    if explicit:
        return Path(explicit)
    data_dir = (os.environ.get("DATA_DIR") or "").strip()
    if data_dir:
        return Path(data_dir) / "audit_log.jsonl"
    railway_volume = Path("/data")
    if railway_volume.is_dir() and os.access(railway_volume, os.W_OK):
        return railway_volume / "audit_log.jsonl"
    return Path(DEFAULT_LOG_PATH)


LOG_PATH = _resolve_log_path()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ── Service ──────────────────────────────────────────────────────────────────


class AuditService:
    """Append-only audit trail. Threadsafe."""

    def __init__(self) -> None:
        self._lock: threading.Lock = threading.Lock()
        self._ring: Deque[Dict[str, Any]] = deque(maxlen=MAX_RING)
        self._counter: int = 0
        self._lifetime_total: int = 0
        # Hydrate the ring buffer from disk on cold-start so the UI doesn't
        # show an empty trail after a Railway redeploy.
        self._hydrate_from_disk()

    # ── Public ────────────────────────────────────────────────────────────────

    def record(
        self,
        action:   str,
        actor:    str = "operator",
        before:   Any = None,
        after:    Any = None,
        category: str = "config",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Record one audit event. Returns the stored entry or None on failure.

        before/after may be any JSON-serialisable value; non-serialisable
        objects fall back to repr() so the audit pipe never blocks on a
        weird payload.
        """
        try:
            with self._lock:
                self._counter += 1
                self._lifetime_total += 1
                entry: Dict[str, Any] = {
                    "id":        self._counter,
                    "timestamp": _now_iso(),
                    "action":    str(action),
                    "actor":     str(actor),
                    "category":  str(category),
                    "before":    _safe_json(before),
                    "after":     _safe_json(after),
                    "metadata":  _safe_json(metadata) if metadata else {},
                }
                self._ring.append(entry)
            self._append_to_disk(entry)
            self._heartbeat(success=True)
            return entry
        except Exception as e:
            logger.exception(f"audit_service.record failed: {e}")
            self._heartbeat(success=False, error=str(e)[:200])
            return None

    def list(
        self,
        limit:    int = 200,
        action:   Optional[str] = None,
        category: Optional[str] = None,
        actor:    Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Newest-first slice of the ring buffer with optional filters."""
        with self._lock:
            out = list(self._ring)
        out.reverse()
        if action:   out = [e for e in out if e["action"]   == action]
        if category: out = [e for e in out if e["category"] == category]
        if actor:    out = [e for e in out if e["actor"]    == actor]
        return out[: max(1, min(limit, MAX_RING))]

    def tail(self, n: int = 10) -> List[Dict[str, Any]]:
        """Newest-first short tail — suitable for chat surfacing."""
        return self.list(limit=max(1, min(n, 50)))

    def summary(self) -> Dict[str, Any]:
        with self._lock:
            entries = list(self._ring)
        cat_counts: Dict[str, int] = {}
        for e in entries:
            cat_counts[e["category"]] = cat_counts.get(e["category"], 0) + 1
        return {
            "buffered":       len(entries),
            "buffer_max":     MAX_RING,
            "lifetime_total": self._lifetime_total,
            "by_category":    cat_counts,
            "log_path":       str(LOG_PATH),
            "log_exists":     LOG_PATH.exists(),
        }

    # ── Internal ──────────────────────────────────────────────────────────────

    def _append_to_disk(self, entry: Dict[str, Any]) -> None:
        try:
            LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
            line = json.dumps(entry, separators=(",", ":")) + "\n"
            # Rotate if we're about to exceed MAX_DISK_BYTES.
            try:
                if LOG_PATH.exists() and (LOG_PATH.stat().st_size + len(line)) > MAX_DISK_BYTES:
                    self._rotate()
            except OSError:
                pass
            with open(LOG_PATH, "a", encoding="utf-8") as fh:
                fh.write(line)
        except Exception as e:
            logger.warning(f"audit_service disk append failed: {e}")

    def _rotate(self) -> None:
        """Numeric suffix rotation: audit_log.jsonl → .1 → .2 → .3 (drop)."""
        try:
            base = LOG_PATH
            for i in range(ROTATION_KEEP, 0, -1):
                src = Path(f"{base}.{i}")
                dst = Path(f"{base}.{i + 1}")
                if i == ROTATION_KEEP and src.exists():
                    src.unlink(missing_ok=True)
                elif src.exists():
                    src.rename(dst)
            if base.exists():
                base.rename(Path(f"{base}.1"))
            logger.info(f"audit_service rotated log @ {base}")
        except Exception as e:
            logger.warning(f"audit_service rotate failed: {e}")

    def _hydrate_from_disk(self) -> None:
        try:
            if LOG_PATH.exists():
                # Read tail of the file — last MAX_RING lines.
                with open(LOG_PATH, "r", encoding="utf-8", errors="replace") as fh:
                    lines = fh.readlines()
                tail = lines[-MAX_RING:]
                for line in tail:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                        # Fix counter so post-hydrate IDs continue monotonically.
                        self._counter = max(self._counter, int(entry.get("id", 0)))
                        self._lifetime_total += 1
                        self._ring.append(entry)
                    except json.JSONDecodeError:
                        continue
                logger.info(
                    f"audit_service hydrated {len(self._ring)} entries from {LOG_PATH}"
                )
        except Exception as e:
            logger.warning(f"audit_service hydrate failed: {e}")
        # ── Boot-time heartbeat (Session XXXVIII) ────────────────────────────
        # The audit pipe is event-driven — record() is the only path that
        # heartbeats on its own. That's correct, but it means a process
        # restart followed by a quiet stretch leaves system_health.run_count
        # at 0 and the service stuck in "cold" status, even though the pipe
        # is fully functional. Pulse once on every hydration attempt so the
        # registry reflects "this service booted and is ready" — fresh
        # installs (no log file) and existing logs are both covered.
        # The 24h stale window remains intact: if zero qualifying events
        # fire in a real day, the page will correctly flag it as stale.
        self._heartbeat(success=True)

    def _heartbeat(self, success: bool, error: Optional[str] = None) -> None:
        try:
            from services.system_health_service import system_health
            system_health.record_run(
                name="audit_service",
                success=success,
                error=error,
            )
        except Exception:
            pass


def _safe_json(value: Any) -> Any:
    """Best-effort JSON normalisation — non-serialisable values become repr()."""
    if value is None:
        return None
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        try:
            return {"_repr": repr(value)[:500]}
        except Exception:
            return {"_repr": "<unrepresentable>"}


audit_service = AuditService()