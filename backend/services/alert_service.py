"""
Alert Service
=============
Centralised alert engine for the TAO trading system.

All subsystems call push_alert() and the ring buffer stores the last 150 alerts.
The frontend polls /api/alerts every few seconds; new unread alerts are surfaced
as toast notifications and logged in the Alert Inbox page.

Alert lifecycle:
  push_alert()  →  ring buffer  →  GET /api/alerts  →  frontend toast + inbox

Alert types:
  GATE_PROMOTION     — strategy promoted to APPROVED_FOR_LIVE or LIVE
  CONSENSUS_APPROVED — OpenClaw approved a LIVE trade
  CONSENSUS_VETOED   — OpenClaw vetoed a LIVE trade
  REGIME_SHIFT       — II Agent detected market regime change
  STRATEGY_HOT       — strategy classified HOT (≥68% WR)
  STRATEGY_STRUGGLING— strategy flagged as underperformer
  PNL_MILESTONE      — fleet cumulative PnL crosses a milestone
  DRAWDOWN_ALERT     — strategy PnL drops below threshold
  SYSTEM             — backend system events

Alert levels:
  INFO     — informational (blue/green)
  WARNING  — requires attention (amber)
  CRITICAL — immediate action / major event (red)
"""

from datetime import datetime, timezone
from typing import List, Optional

# ── Constants ─────────────────────────────────────────────────────────────────
MAX_ALERTS = 150

# Alert types
TYPE_GATE_PROMOTION      = "GATE_PROMOTION"
TYPE_CONSENSUS_APPROVED  = "CONSENSUS_APPROVED"
TYPE_CONSENSUS_VETOED    = "CONSENSUS_VETOED"
TYPE_REGIME_SHIFT        = "REGIME_SHIFT"
TYPE_STRATEGY_HOT        = "STRATEGY_HOT"
TYPE_STRATEGY_STRUGGLING = "STRATEGY_STRUGGLING"
TYPE_PNL_MILESTONE       = "PNL_MILESTONE"
TYPE_DRAWDOWN_ALERT      = "DRAWDOWN_ALERT"
TYPE_SYSTEM              = "SYSTEM"

# Alert levels
LEVEL_INFO     = "INFO"
LEVEL_WARNING  = "WARNING"
LEVEL_CRITICAL = "CRITICAL"

# PnL milestones (τ)
PNL_MILESTONES = [0.25, 0.5, 1.0, 2.0, 5.0, 10.0]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class AlertService:
    def __init__(self):
        self._alerts: List[dict] = []
        self._counter = 0
        self._milestones_hit: set = set()   # Track which PnL milestones already alerted

    # ── Core push ─────────────────────────────────────────────────────────────

    def push_alert(
        self,
        type:     str,
        level:    str,
        title:    str,
        message:  str,
        strategy: Optional[str] = None,
        detail:   str = "",
    ) -> dict:
        self._counter += 1
        alert = {
            "id":        self._counter,
            "type":      type,
            "level":     level,
            "title":     title,
            "message":   message,
            "strategy":  strategy,
            "detail":    detail,
            "read":      False,
            "timestamp": _now(),
        }
        self._alerts.insert(0, alert)          # newest first
        if len(self._alerts) > MAX_ALERTS:
            self._alerts.pop()
        return alert

    # ── Convenience helpers (called by subsystems) ─────────────────────────────

    def gate_promotion(self, strategy_name: str, display_name: str, new_mode: str, stats: str) -> None:
        if new_mode == "LIVE":
            self.push_alert(
                type     = TYPE_GATE_PROMOTION,
                level    = LEVEL_CRITICAL,
                title    = f"🚀 {display_name} is now LIVE",
                message  = f"{display_name} has passed all four gates and is cleared for LIVE execution on Bittensor Finney mainnet.",
                strategy = strategy_name,
                detail   = stats,
            )
        else:
            self.push_alert(
                type     = TYPE_GATE_PROMOTION,
                level    = LEVEL_WARNING,
                title    = f"🎯 {display_name} approved for LIVE",
                message  = f"{display_name} has met all gate requirements and is now APPROVED_FOR_LIVE. OpenClaw consensus required before execution.",
                strategy = strategy_name,
                detail   = stats,
            )

    def consensus_approved(self, strategy_name: str, direction: str, buy: int, sell: int, hold: int, round_id: int) -> None:
        self.push_alert(
            type     = TYPE_CONSENSUS_APPROVED,
            level    = LEVEL_CRITICAL,
            title    = f"✅ OpenClaw APPROVED {direction}",
            message  = f"Round #{round_id}: Council approved a {direction} signal from {strategy_name} with {max(buy, sell)}/12 votes.",
            strategy = strategy_name,
            detail   = f"{buy}B / {sell}S / {hold}H",
        )

    def consensus_vetoed(self, strategy_name: str, direction: str, result: str, buy: int, sell: int, hold: int, round_id: int) -> None:
        self.push_alert(
            type     = TYPE_CONSENSUS_VETOED,
            level    = LEVEL_WARNING,
            title    = f"🚫 OpenClaw VETOED {direction}",
            message  = f"Round #{round_id}: Council blocked {strategy_name}'s {direction} — {result}. No supermajority reached.",
            strategy = strategy_name,
            detail   = f"{buy}B / {sell}S / {hold}H",
        )

    def regime_shift(self, from_regime: str, to_regime: str, price: float, rsi: Optional[float]) -> None:
        self.push_alert(
            type    = TYPE_REGIME_SHIFT,
            level   = LEVEL_WARNING,
            title   = f"⚡ Regime Shift: {from_regime} → {to_regime}",
            message = f"II Agent detected a market regime change. TAO @ ${price:.2f}. Strategy weights are being rebalanced.",
            detail  = f"RSI={rsi:.1f}" if rsi else "RSI insufficient data",
        )

    def strategy_hot(self, strategy_name: str, display_name: str, win_rate: float, pnl: float) -> None:
        self.push_alert(
            type     = TYPE_STRATEGY_HOT,
            level    = LEVEL_INFO,
            title    = f"🔥 {display_name} is running HOT",
            message  = f"{display_name} has achieved {win_rate:.1f}% win rate with {pnl:+.4f} τ PnL — top performer in the fleet.",
            strategy = strategy_name,
            detail   = f"WR={win_rate:.1f}% PnL={pnl:+.4f}τ",
        )

    def strategy_struggling(self, strategy_name: str, display_name: str, win_rate: float, pnl: float) -> None:
        self.push_alert(
            type     = TYPE_STRATEGY_STRUGGLING,
            level    = LEVEL_WARNING,
            title    = f"⚠️ {display_name} underperforming",
            message  = f"{display_name} is below threshold with {win_rate:.1f}% win rate. II Agent has flagged it for review.",
            strategy = strategy_name,
            detail   = f"WR={win_rate:.1f}% PnL={pnl:+.4f}τ",
        )

    def pnl_milestone(self, total_pnl: float) -> None:
        key = str(total_pnl)
        if key in self._milestones_hit:
            return
        self._milestones_hit.add(key)
        self.push_alert(
            type    = TYPE_PNL_MILESTONE,
            level   = LEVEL_CRITICAL,
            title   = f"🏆 Fleet PnL milestone: +{total_pnl} τ",
            message = f"The autonomous fleet has crossed {total_pnl} τ cumulative profit. All systems performing.",
            detail  = f"Milestone: {total_pnl}τ",
        )

    def check_pnl_milestones(self, current_pnl: float) -> None:
        for milestone in PNL_MILESTONES:
            if current_pnl >= milestone:
                self.pnl_milestone(milestone)

    def drawdown_alert(self, strategy_name: str, display_name: str, pnl: float, threshold: float) -> None:
        self.push_alert(
            type     = TYPE_DRAWDOWN_ALERT,
            level    = LEVEL_CRITICAL,
            title    = f"🚨 Drawdown alert: {display_name}",
            message  = f"{display_name} PnL has fallen to {pnl:+.4f} τ, breaching the -{abs(threshold):.4f} τ threshold.",
            strategy = strategy_name,
            detail   = f"PnL={pnl:+.4f}τ threshold={threshold:+.4f}τ",
        )

    def system_alert(self, title: str, message: str, level: str = LEVEL_INFO) -> None:
        self.push_alert(
            type    = TYPE_SYSTEM,
            level   = level,
            title   = title,
            message = message,
        )

    # ── Query helpers ─────────────────────────────────────────────────────────

    def get_alerts(self, limit: int = 50, unread_only: bool = False) -> List[dict]:
        alerts = [a for a in self._alerts if not a["read"]] if unread_only else self._alerts
        return alerts[:limit]

    def get_unread_count(self) -> int:
        return sum(1 for a in self._alerts if not a["read"])

    def mark_read(self, alert_id: int) -> bool:
        for a in self._alerts:
            if a["id"] == alert_id:
                a["read"] = True
                return True
        return False

    def mark_all_read(self) -> int:
        count = 0
        for a in self._alerts:
            if not a["read"]:
                a["read"] = True
                count += 1
        return count

    def get_stats(self) -> dict:
        total    = len(self._alerts)
        unread   = self.get_unread_count()
        by_level = {LEVEL_INFO: 0, LEVEL_WARNING: 0, LEVEL_CRITICAL: 0}
        by_type  = {}
        for a in self._alerts:
            by_level[a["level"]] = by_level.get(a["level"], 0) + 1
            by_type[a["type"]]   = by_type.get(a["type"], 0) + 1
        return {
            "total":    total,
            "unread":   unread,
            "by_level": by_level,
            "by_type":  by_type,
        }


# ── Singleton ─────────────────────────────────────────────────────────────────
alert_service = AlertService()