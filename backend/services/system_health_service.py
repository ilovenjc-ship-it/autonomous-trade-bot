"""
System Health Registry
======================
Session XXXIV — observability foundation (carry-over: new theme).

Lightweight in-memory registry every long-running service can self-report
into. The frontend hits ``GET /api/system/health`` to see whether each
background loop is alive, when it last ran, and what its last error was.

Why a dedicated registry?
-------------------------
Until now, knowing whether the metagraph poller / whale tracker / CEX
feed / cycle engine were *actually* running required scraping each
service's private fields (``_last_fetch_at``, ``_last_error`` …). That
worked but coupled the health endpoint to internal field names and
made it impossible to add new services without touching the endpoint.

The registry pattern flips that: services *push* a heartbeat at end-of-
cycle and the endpoint just reads the registry. Adding a service is
one ``record_run()`` call at its loop terminus.

Status semantics
----------------
A service is ``healthy`` when:
  - It has registered (so ``register()`` was called at boot)
  - Its last_run_at is within ``stale_after_s`` (per-service tunable)
  - Its last_error is None

It's ``stale`` when last_run_at is older than its stale-after window.
It's ``error`` when its most recent record_run() recorded an exception.
It's ``cold`` when registered but never recorded a run (still booting).

The audit_service (Phase B) and consensus forecasting (Phase C) can
both ride on this registry — audit events get a timing channel,
forecasting can confirm the consensus engine is fresh enough to trust.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class ServiceHealth:
    """Per-service health record. All time fields are unix epoch seconds."""
    name:             str
    label:            str            # operator-readable
    description:      str = ""
    stale_after_s:    int = 600       # default: alarm if no run in 10 min
    registered_at:    float = field(default_factory=time.time)
    last_run_at:      float = 0.0
    last_success_at:  float = 0.0
    last_error_at:    float = 0.0
    last_error:       Optional[str] = None
    last_duration_ms: Optional[float] = None
    run_count:        int = 0
    success_count:    int = 0
    error_count:      int = 0

    def to_dict(self) -> Dict:
        now = time.time()
        # Status calculation lives here so the endpoint stays trivial.
        if self.run_count == 0:
            status = "cold"
        elif self.last_error and (now - (self.last_error_at or 0)) < self.stale_after_s:
            status = "error"
        elif self.last_run_at and (now - self.last_run_at) > self.stale_after_s:
            status = "stale"
        else:
            status = "healthy"

        return {
            "name":             self.name,
            "label":            self.label,
            "description":      self.description,
            "status":           status,
            "stale_after_s":    self.stale_after_s,
            "registered_at":    _epoch_to_iso(self.registered_at),
            "last_run_at":      _epoch_to_iso(self.last_run_at)     if self.last_run_at     else None,
            "last_success_at":  _epoch_to_iso(self.last_success_at) if self.last_success_at else None,
            "last_error_at":    _epoch_to_iso(self.last_error_at)   if self.last_error_at   else None,
            "last_error":       self.last_error,
            "last_duration_ms": self.last_duration_ms,
            "run_count":        self.run_count,
            "success_count":    self.success_count,
            "error_count":      self.error_count,
            "age_seconds":      round(now - self.last_run_at, 1) if self.last_run_at else None,
        }


def _epoch_to_iso(ts: float) -> Optional[str]:
    if not ts:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


class SystemHealthRegistry:
    """Threadsafe in-memory map of service health records."""

    def __init__(self) -> None:
        self._services: Dict[str, ServiceHealth] = {}
        self._lock = threading.Lock()
        # Boot timestamp is exposed as `uptime_seconds` so the UI can
        # show "alive for 2h 14m" without having to compute it from
        # process start time.
        self._boot_at: float = time.time()

    def register(
        self,
        name:          str,
        label:         str,
        description:   str = "",
        stale_after_s: int = 600,
    ) -> None:
        """Idempotent. Calling register() twice updates the metadata only."""
        with self._lock:
            existing = self._services.get(name)
            if existing is None:
                self._services[name] = ServiceHealth(
                    name=name,
                    label=label,
                    description=description,
                    stale_after_s=stale_after_s,
                )
                logger.info(f"system_health: registered {name!r} ({label})")
            else:
                existing.label = label
                existing.description = description
                existing.stale_after_s = stale_after_s

    def record_run(
        self,
        name:        str,
        success:     bool = True,
        error:       Optional[str] = None,
        duration_ms: Optional[float] = None,
    ) -> None:
        """Record a single completed run. Idempotent on unknown names —
        services calling this before register() are auto-registered with
        sensible defaults so an out-of-order import path never silently
        drops health data."""
        with self._lock:
            svc = self._services.get(name)
            if svc is None:
                svc = ServiceHealth(name=name, label=name)
                self._services[name] = svc

            now = time.time()
            svc.run_count += 1
            svc.last_run_at = now
            svc.last_duration_ms = duration_ms

            if success:
                svc.success_count += 1
                svc.last_success_at = now
                svc.last_error = None     # clear the latched error
                svc.last_error_at = 0.0
            else:
                svc.error_count += 1
                svc.last_error = (error or "unknown error")[:300]
                svc.last_error_at = now

    def get(self, name: str) -> Optional[Dict]:
        with self._lock:
            svc = self._services.get(name)
            return svc.to_dict() if svc else None

    def get_all(self) -> List[Dict]:
        with self._lock:
            # Sort: error first, stale next, healthy last so the UI
            # gets a useful default ordering.
            ordered = sorted(
                self._services.values(),
                key=lambda s: {
                    "error":   0,
                    "stale":   1,
                    "cold":    2,
                    "healthy": 3,
                }.get(s.to_dict()["status"], 9),
            )
            return [s.to_dict() for s in ordered]

    def summary(self) -> Dict:
        """Aggregate stats — what the Mission Control card needs."""
        all_svcs = self.get_all()
        counts = {"healthy": 0, "stale": 0, "error": 0, "cold": 0}
        for s in all_svcs:
            counts[s["status"]] = counts.get(s["status"], 0) + 1
        now = time.time()
        return {
            "total":           len(all_svcs),
            "healthy":         counts["healthy"],
            "stale":           counts["stale"],
            "error":           counts["error"],
            "cold":            counts["cold"],
            "uptime_seconds":  round(now - self._boot_at, 1),
            "boot_at":         _epoch_to_iso(self._boot_at),
        }


system_health = SystemHealthRegistry()