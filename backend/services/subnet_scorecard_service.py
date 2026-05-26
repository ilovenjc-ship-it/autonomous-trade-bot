"""
Subnet Scorecard Service
========================

Loads and exposes Const's 6-Filter Test scorecard (TAO Daily — April 3, 2026)
plus a configurable quality gate used to weight or filter any external signal
source by subnet provenance.

Source data:    backend/data/subnet_scorecard.json
Memory bank:    STATE.md §12 — "Putting Bittensor's Top 10 Subnets Through
                Const's 6-Filter Test"
Default policy: require all 6 filters passed (`min_filters_passed = 6`).

Philosophy
----------
Const's six binary filters are the cleanest shorthand for "real vs. grift" in
the Bittensor ecosystem. We treat the framework as a weighting prior on any
data source rooted at a specific subnet. Before we trust an external signal
from SN8 Vanta or SN50 Synth, we check that the source subnet still passes
the filter we configured (default 6/6).

The scorecard JSON is expected to be edited quarterly (or whenever the
top-10 composition shifts materially) — composition shift is itself a signal,
per the original article.

Public API
----------
    subnet_scorecard_service.get_full_scorecard()  → dict   (full JSON)
    subnet_scorecard_service.get_subnet(netuid)    → dict | None
    subnet_scorecard_service.passes_quality_gate(netuid, min_filters=None)
                                                   → bool
    subnet_scorecard_service.signal_candidates() → list[dict]
    subnet_scorecard_service.refresh_from_disk()   → int   (subnet count)

The service is a stateless singleton. It loads on first access and holds
the deserialized JSON in-memory; refresh_from_disk() forces a re-read so an
operator can hot-edit the JSON without redeploy.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────────

_DATA_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "data", "subnet_scorecard.json")
)


class SubnetScorecardService:
    """Thread-safe lazy-loaded scorecard. Singleton — see module-level instance."""

    DEFAULT_MIN_FILTERS = 6

    def __init__(self, data_path: str = _DATA_PATH) -> None:
        self._path = data_path
        self._lock = threading.Lock()
        self._raw: Optional[Dict[str, Any]] = None
        self._by_netuid: Dict[int, Dict[str, Any]] = {}
        self._loaded_ok = False

    # ── Loader ────────────────────────────────────────────────────────────────

    def _ensure_loaded(self) -> None:
        if self._raw is not None:
            return
        with self._lock:
            if self._raw is not None:
                return
            try:
                with open(self._path, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                self._raw = raw
                self._by_netuid = {
                    int(s["netuid"]): s for s in raw.get("subnets", [])
                }
                self._loaded_ok = True
                logger.info(
                    f"SubnetScorecardService: loaded {len(self._by_netuid)} subnets "
                    f"from {os.path.basename(self._path)} "
                    f"(framework={raw.get('framework', {}).get('name')})"
                )
            except FileNotFoundError:
                logger.warning(
                    f"SubnetScorecardService: {self._path} not found — "
                    f"all quality-gate checks will return True (open mode)"
                )
                self._raw = {"framework": {}, "subnets": []}
                self._by_netuid = {}
            except Exception as exc:
                logger.exception(
                    f"SubnetScorecardService: failed to load {self._path}: {exc}"
                )
                self._raw = {"framework": {}, "subnets": []}
                self._by_netuid = {}

    def refresh_from_disk(self) -> int:
        """Force a re-read; returns the number of subnets loaded."""
        with self._lock:
            self._raw = None
            self._by_netuid = {}
            self._loaded_ok = False
        self._ensure_loaded()
        return len(self._by_netuid)

    # ── Public read API ───────────────────────────────────────────────────────

    def get_full_scorecard(self) -> Dict[str, Any]:
        """Full deserialized JSON (framework metadata + subnets list)."""
        self._ensure_loaded()
        # Shallow copy so callers can't mutate our cache.
        return {
            "framework": dict(self._raw.get("framework", {})),
            "scorecard_version": self._raw.get("scorecard_version"),
            "scorecard_filed":   self._raw.get("scorecard_filed"),
            "subnets":           list(self._raw.get("subnets", [])),
            "loaded_ok":         self._loaded_ok,
            "subnet_count":      len(self._by_netuid),
        }

    def get_subnet(self, netuid: int) -> Optional[Dict[str, Any]]:
        """Scorecard entry for a netuid, or None if not on the scorecard."""
        self._ensure_loaded()
        return self._by_netuid.get(int(netuid))

    def get_active_threshold(self) -> int:
        """
        Returns the operator-configured minimum filters threshold.

        Reads from _RISK_CONFIG['subnet_quality_min_filters'] (live-tunable
        via the Risk Config UI). Falls back to DEFAULT_MIN_FILTERS if the
        risk config is unreachable (test contexts, missing key, import cycle).
        """
        try:
            from routers.fleet import _RISK_CONFIG
            v = _RISK_CONFIG.get("subnet_quality_min_filters", self.DEFAULT_MIN_FILTERS)
            return int(v)
        except Exception:
            return self.DEFAULT_MIN_FILTERS

    def passes_quality_gate(
        self,
        netuid: int,
        min_filters: Optional[int] = None,
    ) -> bool:
        """
        Returns True iff the subnet has a scorecard entry AND its `score`
        meets the threshold.

        - When min_filters is None (default), reads the live operator-tuned
          threshold from _RISK_CONFIG['subnet_quality_min_filters'] so the
          UI slider on the Risk Config page directly controls the gate.
        - When min_filters is passed explicitly, that value is used (lets
          callers force a one-off threshold for backtests / dry-runs).
        - Subnets NOT on the scorecard FAIL the gate by default — caller
          can opt-in to ungated sources by setting min_filters=0.

        Used by signal_ingestor and consensus_service to weight external
        signals by source-subnet quality. Open-mode (no scorecard loaded)
        returns True so the bot stays operational if the JSON is missing.
        """
        self._ensure_loaded()

        # Open mode — no scorecard available, fail open so bot stays alive.
        if not self._loaded_ok or not self._by_netuid:
            return True

        threshold = (
            self.get_active_threshold()
            if min_filters is None
            else int(min_filters)
        )
        if threshold <= 0:
            return True

        entry = self._by_netuid.get(int(netuid))
        if entry is None:
            return False
        return int(entry.get("score", 0)) >= threshold

    def signal_candidates(self) -> List[Dict[str, Any]]:
        """
        Subset of scorecard flagged is_signal_candidate=true.
        These are the subnets we're actively researching for live signal
        integration (currently SN3 Templar + SN8 Vanta).
        """
        self._ensure_loaded()
        return [
            s for s in self._raw.get("subnets", [])
            if s.get("is_signal_candidate") is True
        ]


# ── Module singleton ──────────────────────────────────────────────────────────

subnet_scorecard_service = SubnetScorecardService()