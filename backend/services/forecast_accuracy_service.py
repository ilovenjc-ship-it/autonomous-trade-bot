"""
Forecast Accuracy Service
=========================
Session XXXVII — Phase F (model-drift indicator).

Closes the loop on the OpenClaw vote forecasting feature shipped in
2c3d81a0 (Phase C).  Every consensus round now records:

  · forecast_prob — P(approval | current market state, this direction),
                    estimated from a 200-trial Monte Carlo over the
                    SAME vote engine the live round is about to run
  · actual_approved — 1 if the live round approved, 0 otherwise

We persist the (round_id, direction, forecast_prob, actual_approved)
tuple in a ring buffer (in-memory, last 500) + JSONL on disk
(4-tier path resolution mirroring whale / audit / cex caches).  From
those samples we compute calibration metrics:

  · Brier score   — mean((forecast - actual)^2). Lower = better.
                    Theoretical minimum for binary outcomes with true
                    probability p is p*(1-p), NOT zero — so absolute
                    Brier alone is misleading.
  · Brier baseline = p_base * (1 - p_base) where p_base = approval rate
                    in the window.  This is what a "predict base rate"
                    forecaster would score.
  · Brier Skill Score (BSS) = 1 - Brier/Baseline
        > 0  → forecaster is sharper than naïve base-rate prediction
        = 0  → forecaster is no better than predicting base rate
        < 0  → forecaster is HURTING us (worse than the trivial bench)
  · Mean absolute error (MAE) — descriptive only.
  · Calibration band — derived from BSS:
        BSS ≥ 0.10  → "calibrated"     (sharper than baseline)
        BSS ≥ -0.05 → "drifting"       (~same as baseline)
        BSS <  -0.05→ "uncalibrated"   (worse than baseline — investigate)
  · calibration_pct — BSS rendered to [0, 100] for the UI gauge:
        BSS ≥ 1.0   → 100%
        BSS = 0.0   →  50%
        BSS ≤ -1.0  →   0%

Why Brier Skill Score?
----------------------
For binary outcomes, raw Brier always shows "high error" (a perfectly
calibrated 60%-true forecaster scores 0.24, not 0).  Skill scores
normalise against the no-skill baseline so the operator sees a clean
"is the model adding value?" answer.

Public API (sync, threadsafe)
-----------------------------
  forecast_accuracy_service.record(round_id, direction,
                                   forecast_prob, actual_approved,
                                   market=None)
  forecast_accuracy_service.summary(window=50) -> dict
  forecast_accuracy_service.recent(n=20)       -> list  # newest-first
  forecast_accuracy_service.reset()                     # zero ring (admin)

Soft-fail throughout: a recording failure must NEVER raise into the
consensus_service caller's control flow.  Exceptions are logged +
suppressed, and a heartbeat is filed against system_health under
'forecast_accuracy_service'.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional

logger = logging.getLogger(__name__)


# ── Tunables ─────────────────────────────────────────────────────────────────
MAX_RING            = 500
DEFAULT_LOG_PATH    = "backend/data/forecast_accuracy.jsonl"
MAX_DISK_BYTES      = 8 * 1024 * 1024    # 8 MB ⇒ rotate
ROTATION_KEEP       = 2

# Calibration band thresholds expressed in BRIER SKILL SCORE units.
# BSS in [-∞, 1].  See module docstring for derivation.
BAND_CALIBRATED_MIN_BSS  =  0.10   # ≥ +10% improvement over baseline
BAND_DRIFTING_MIN_BSS    = -0.05   # within 5% of baseline either way
# Anything below DRIFTING_MIN is "uncalibrated".

# Window for the headline summary (rolling).
DEFAULT_SUMMARY_WINDOW = 50


def _resolve_log_path() -> Path:
    """4-tier resolution mirroring whale_service / audit_service / cex_listing."""
    explicit = (os.environ.get("FORECAST_ACCURACY_PATH") or "").strip()
    if explicit:
        return Path(explicit)
    data_dir = (os.environ.get("DATA_DIR") or "").strip()
    if data_dir:
        return Path(data_dir) / "forecast_accuracy.jsonl"
    railway_volume = Path("/data")
    if railway_volume.is_dir() and os.access(railway_volume, os.W_OK):
        return railway_volume / "forecast_accuracy.jsonl"
    return Path(DEFAULT_LOG_PATH)


LOG_PATH = _resolve_log_path()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _band(bss: float) -> str:
    """Band derived from Brier Skill Score (positive = better than baseline)."""
    if bss >= BAND_CALIBRATED_MIN_BSS:
        return "calibrated"
    if bss >= BAND_DRIFTING_MIN_BSS:
        return "drifting"
    return "uncalibrated"


def _bss_to_pct(bss: float) -> float:
    """Map BSS in (-∞, 1] to a friendly 0-100 calibration score for the UI.

    BSS  ≥  1.0 → 100% (impossible — perfect)
    BSS  =  0.0 →  50% (no skill, equal to baseline)
    BSS  ≤ -1.0 →   0% (model is hurting us)
    """
    return round(max(0.0, min(100.0, (bss + 1.0) * 50.0)), 1)


def _brier_baseline(approved_rate: float) -> float:
    """Baseline Brier score for a 'predict base rate every time' forecaster."""
    p = max(0.0, min(1.0, float(approved_rate)))
    return p * (1.0 - p)


def _bss(brier: float, approved_rate: float) -> float:
    """Brier Skill Score: 1 - Brier/Baseline.  Returns 0 when baseline is 0
    (degenerate window where every round had the same outcome — the
    forecaster has no signal to predict against, so we report no skill)."""
    base = _brier_baseline(approved_rate)
    if base <= 1e-9:
        return 0.0
    return 1.0 - (brier / base)


# ── Service ──────────────────────────────────────────────────────────────────


class ForecastAccuracyService:
    """Persistent, threadsafe forecast-vs-actual tracker."""

    def __init__(self) -> None:
        self._lock: threading.Lock = threading.Lock()
        self._ring: Deque[Dict[str, Any]] = deque(maxlen=MAX_RING)
        self._lifetime_total: int = 0
        self._hydrate_from_disk()

    # ── Public ────────────────────────────────────────────────────────────────

    def record(
        self,
        round_id:        int,
        direction:       str,                # "BUY" | "SELL"
        forecast_prob:   float,              # P(approval | this direction)
        actual_approved: bool,
        market:          Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Record one (forecast, actual) sample.  Soft-fails on any error."""
        try:
            try:
                fp = float(forecast_prob)
            except (TypeError, ValueError):
                logger.warning(f"forecast_accuracy.record: invalid forecast_prob={forecast_prob!r}")
                self._heartbeat(success=False, error="invalid_forecast_prob")
                return None
            # Clamp to [0, 1] — defensive against probabilistic noise
            fp = max(0.0, min(1.0, fp))
            actual = 1 if actual_approved else 0
            entry: Dict[str, Any] = {
                "round_id":   int(round_id),
                "timestamp":  _now_iso(),
                "direction":  str(direction),
                "forecast":   round(fp, 4),
                "actual":     actual,
                "abs_error":  round(abs(fp - actual), 4),
                "sq_error":   round((fp - actual) ** 2, 6),
                "market":     _safe_json(market) if market else None,
            }
            with self._lock:
                self._ring.append(entry)
                self._lifetime_total += 1
            self._append_to_disk(entry)
            self._heartbeat(success=True)
            return entry
        except Exception as e:
            logger.exception(f"forecast_accuracy.record failed: {e}")
            self._heartbeat(success=False, error=str(e)[:200])
            return None

    def summary(self, window: int = DEFAULT_SUMMARY_WINDOW) -> Dict[str, Any]:
        """Headline metrics over the most-recent `window` samples.

        Returns even when empty (samples=0) — caller should branch on
        samples == 0 to render the cold-start UI.
        """
        with self._lock:
            entries = list(self._ring)
        n_total = len(entries)
        # Take the last `window` samples (newest end of the deque).
        win = entries[-max(1, int(window)):] if entries else []
        n = len(win)
        if n == 0:
            return {
                "samples":         0,
                "lifetime_total":  self._lifetime_total,
                "window":          window,
                "brier_score":     None,
                "mean_abs_error":  None,
                "calibration_pct": None,        # (1 - sqrt(brier)) * 100
                "band":            "cold",      # special UI state
                "by_direction":    {},
                "approved_rate":   None,
                "as_of":           _now_iso(),
            }

        brier         = sum(e["sq_error"]  for e in win) / n
        mae           = sum(e["abs_error"] for e in win) / n
        approved_rate = sum(e["actual"]    for e in win) / n
        baseline      = _brier_baseline(approved_rate)
        bss           = _bss(brier, approved_rate)

        # Per-direction breakdown
        by_dir: Dict[str, Dict[str, Any]] = {}
        for d in ("BUY", "SELL"):
            d_win = [e for e in win if e["direction"] == d]
            if not d_win:
                continue
            d_n = len(d_win)
            d_brier = sum(e["sq_error"]  for e in d_win) / d_n
            d_mae   = sum(e["abs_error"] for e in d_win) / d_n
            d_appr  = sum(e["actual"]    for e in d_win) / d_n
            d_bss   = _bss(d_brier, d_appr)
            by_dir[d] = {
                "samples":         d_n,
                "brier_score":     round(d_brier, 4),
                "brier_baseline":  round(_brier_baseline(d_appr), 4),
                "brier_skill":     round(d_bss, 4),
                "mean_abs_error":  round(d_mae, 4),
                "calibration_pct": _bss_to_pct(d_bss),
                "band":            _band(d_bss),
                "approved_rate":   round(d_appr, 4),
            }

        return {
            "samples":         n,
            "lifetime_total":  self._lifetime_total,
            "window":          window,
            "brier_score":     round(brier, 4),
            "brier_baseline":  round(baseline, 4),
            "brier_skill":     round(bss, 4),       # NEW: skill score
            "mean_abs_error":  round(mae, 4),
            "calibration_pct": _bss_to_pct(bss),    # 0-100 derived from BSS
            "band":            _band(bss),
            "by_direction":    by_dir,
            "approved_rate":   round(approved_rate, 4),
            "as_of":           _now_iso(),
        }

    def recent(self, n: int = 20) -> List[Dict[str, Any]]:
        """Newest-first slice for the sparkline / drift chart."""
        with self._lock:
            entries = list(self._ring)
        return list(reversed(entries))[: max(1, min(int(n), MAX_RING))]

    def reset(self) -> Dict[str, Any]:
        """Zero the in-memory ring (does NOT delete the disk log).  Admin only."""
        with self._lock:
            cleared = len(self._ring)
            self._ring.clear()
        return {"cleared": cleared, "lifetime_total": self._lifetime_total}

    # ── Internal ──────────────────────────────────────────────────────────────

    def _append_to_disk(self, entry: Dict[str, Any]) -> None:
        try:
            LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
            line = json.dumps(entry, separators=(",", ":")) + "\n"
            try:
                if LOG_PATH.exists() and (LOG_PATH.stat().st_size + len(line)) > MAX_DISK_BYTES:
                    self._rotate()
            except OSError:
                pass
            with open(LOG_PATH, "a", encoding="utf-8") as fh:
                fh.write(line)
        except Exception as e:
            logger.warning(f"forecast_accuracy disk append failed: {e}")

    def _rotate(self) -> None:
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
            logger.info(f"forecast_accuracy rotated log @ {base}")
        except Exception as e:
            logger.warning(f"forecast_accuracy rotate failed: {e}")

    def _hydrate_from_disk(self) -> None:
        try:
            if not LOG_PATH.exists():
                return
            with open(LOG_PATH, "r", encoding="utf-8", errors="replace") as fh:
                lines = fh.readlines()
            tail = lines[-MAX_RING:]
            for line in tail:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    self._lifetime_total += 1
                    self._ring.append(entry)
                except json.JSONDecodeError:
                    continue
            logger.info(f"forecast_accuracy hydrated {len(self._ring)} entries from {LOG_PATH}")
        except Exception as e:
            logger.warning(f"forecast_accuracy hydrate failed: {e}")

    def _heartbeat(self, success: bool, error: Optional[str] = None) -> None:
        try:
            from services.system_health_service import system_health
            system_health.record_run(
                name="forecast_accuracy_service",
                success=success,
                error=error,
            )
        except Exception:
            pass


def _safe_json(value: Any) -> Any:
    if value is None:
        return None
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        try:
            return {"_repr": repr(value)[:300]}
        except Exception:
            return {"_repr": "<unrepresentable>"}


forecast_accuracy_service = ForecastAccuracyService()