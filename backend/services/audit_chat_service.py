"""
Audit-Trail Chat Narration
==========================
Session XXXVII — Phase D extension: surface the persistent audit trail
through the II Agent chat so the operator can ask conversational
questions ("what changed today?", "any risk-config edits this hour?",
"who started bots in the last 24h?") and receive a chronological,
category-grouped narrative summary.

This service is a PURE READER over the in-memory ring buffer + disk
JSONL exposed by `services.audit_service.audit_service`.  It never
mutates state.

Public surface
--------------
  looks_like_audit_query(message: str) -> bool
      Cheap regex match used to decide whether the chat router should
      delegate this turn to the audit service.  Matches phrases like
      "what changed", "audit trail", "who edited", "any changes",
      "risk config history", "narrate", "recent edits", etc.

  answer(message: str) -> Optional[str]
      Builds a Markdown-friendly narrative response.  Returns None on
      a soft miss (so the caller can fall through to legacy branches).

Time windows recognised
-----------------------
  · "today"            → since 00:00 UTC today
  · "this hour"        → last 60 minutes
  · "this week"        → last 7 days
  · "in the last N (minutes|hours|days)" → exact window
  · default fallback   → newest 12 entries

Category filters recognised
---------------------------
  config / risk / lifecycle / bot / alert / mode / strategy / consensus

Output shape
------------
  Header line — "**5 changes today** (since 00:00 UTC):"
  Per-category buckets, newest first.  Each bucket header shows count.
  Each entry: `12:34 UTC · operator · risk_config_update · max_drawdown 5 → 3`
  Truncates at MAX_LINES total to avoid spamming the chat panel.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ── Tunables ─────────────────────────────────────────────────────────────────
MAX_LINES_PER_RESPONSE = 24       # hard cap so chat doesn't get drowned
MAX_LINES_PER_CATEGORY = 8        # within a single category bucket
DEFAULT_TAIL           = 12       # if no time window inferred


# ── Intent detection ─────────────────────────────────────────────────────────
# First-match-wins keyword regexes.  We deliberately don't include the bare
# word "audit" if it's used like "audit_log" in URLs — but in chat context
# the word almost always carries the right intent.
_INTENT_PATTERNS = [
    re.compile(r"\bwhat\s+(changed|happened|edited|updated)\b", re.I),
    re.compile(r"\baudit\s*(trail|log|history)?\b",             re.I),
    re.compile(r"\bany\s+(changes?|edits?|updates?)\b",         re.I),
    re.compile(r"\b(narrate|narration|summari[sz]e|summary)\b.*\b(change|edit|trail|log|history|today)\b", re.I),
    re.compile(r"\b(recent|latest)\s+(changes?|edits?|edits|activity|actions?)\b", re.I),
    re.compile(r"\bwho\s+(started|stopped|edited|changed|paused|forced)\b", re.I),
    re.compile(r"\b(history|timeline)\s+of\s+\w+",              re.I),
    re.compile(r"\bchange\s*log\b",                             re.I),
    re.compile(r"\b(config|risk)\s+(changes?|edits?|history)\b", re.I),
    # "changes in the last N days", "edits since yesterday", etc.
    re.compile(r"\b(changes?|edits?|mutations?)\s+(in|since|from|over|during|over|past|last)\b", re.I),
]


def looks_like_audit_query(message: str) -> bool:
    """Cheap pre-flight: decide whether this turn belongs to the audit lane."""
    if not message:
        return False
    msg = message.strip()
    if not msg:
        return False
    for pat in _INTENT_PATTERNS:
        if pat.search(msg):
            return True
    return False


# ── Time-window inference ────────────────────────────────────────────────────

_DURATION_RE = re.compile(
    r"\b(?:last|past)\s+(\d+)\s*(minutes?|mins?|hours?|hrs?|days?)\b",
    re.I,
)


def _infer_window(msg: str) -> Tuple[Optional[datetime], Optional[datetime], str]:
    """Return (start, end, label).

    `start` is None ⇒ no time filter.  `end` is None ⇒ open upper bound
    (i.e. up to "now").  Only "yesterday" returns a closed window.
    """
    lower = msg.lower()
    now = datetime.now(timezone.utc)

    # Quantified windows take priority over named windows.
    m = _DURATION_RE.search(msg)
    if m:
        n    = max(1, int(m.group(1)))
        unit = m.group(2).lower()
        if unit.startswith("min"):
            return (now - timedelta(minutes=n), None, f"last {n} minute{'s' if n != 1 else ''}")
        if unit.startswith(("hour", "hr")):
            return (now - timedelta(hours=n),   None, f"last {n} hour{'s' if n != 1 else ''}")
        if unit.startswith("day"):
            return (now - timedelta(days=n),    None, f"last {n} day{'s' if n != 1 else ''}")

    if "this hour" in lower or "past hour" in lower or "last hour" in lower:
        return (now - timedelta(hours=1), None, "the last hour")
    if "today" in lower or "since midnight" in lower:
        midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return (midnight, None, "today")
    if "yesterday" in lower:
        midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
        # Closed window: [yesterday 00:00 UTC, today 00:00 UTC)
        return (midnight - timedelta(days=1), midnight, "yesterday")
    if "this week" in lower or "past week" in lower or "last week" in lower:
        return (now - timedelta(days=7), None, "the last 7 days")
    if "this month" in lower or "past month" in lower or "last month" in lower:
        return (now - timedelta(days=30), None, "the last 30 days")

    return (None, None, "")


# ── Category-filter inference ────────────────────────────────────────────────
# Maps user words to the canonical `category` slug used by audit_service.
_CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "config":    ["config", "risk", "threshold", "limit", "drawdown", "stop-loss"],
    "lifecycle": ["lifecycle", "bot", "bots", "started", "stopped", "paused", "force-paper", "demote", "promote", "mode"],
    "trading":   ["trade", "trades", "trading", "position", "stake", "manual", "override"],
    "alert":     ["alert", "alerts", "listing", "cex", "owner", "whale"],
    "system":    ["system", "rotate", "restart", "service"],
}


def _infer_category(msg: str) -> Optional[str]:
    lower = msg.lower()
    # Score each category by hit count; require at least one explicit hit.
    best_cat: Optional[str] = None
    best_score = 0
    for cat, kws in _CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in kws if kw in lower)
        if score > best_score:
            best_score = score
            best_cat   = cat
    # Don't gate on a single "trade" mention — that's the bot's whole life.
    # Require cat == "config" or "lifecycle" or a strong (≥2) match.
    if best_cat in ("config", "lifecycle", "alert") and best_score >= 1:
        return best_cat
    if best_score >= 2:
        return best_cat
    return None


# ── Formatting helpers ───────────────────────────────────────────────────────

def _parse_iso(ts: str) -> Optional[datetime]:
    if not ts:
        return None
    try:
        # audit_service stores UTC ISO8601 with trailing 'Z'.
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _fmt_time_short(dt: datetime) -> str:
    """Compact 'HH:MM UTC' for entries in the chat narrative."""
    return dt.astimezone(timezone.utc).strftime("%H:%M UTC")


def _fmt_diff(before: Any, after: Any) -> str:
    """Compact one-line diff for an audit entry's before/after.

    Shape we expect:
      · Risk config:    {"max_drawdown_pct": 5.0} → {"max_drawdown_pct": 3.0}
      · Bot lifecycle:  None → {"running": True}  (snapshot semantics)
      · Mode change:    {"mode": "PAPER_ONLY"} → {"mode": "APPROVED_FOR_LIVE"}

    Anything that isn't a flat dict-vs-dict diff falls back to a short repr.
    """
    if before is None and after is None:
        return ""
    if isinstance(before, dict) and isinstance(after, dict):
        # Find changed keys.
        all_keys = sorted(set(before.keys()) | set(after.keys()))
        changes = []
        for k in all_keys:
            b = before.get(k)
            a = after.get(k)
            if b != a:
                changes.append(f"{k} {_brief(b)} → {_brief(a)}")
        if changes:
            return "; ".join(changes[:3]) + (f" (+{len(changes)-3} more)" if len(changes) > 3 else "")
        return ""
    if before is None and after is not None:
        return f"set: {_brief(after)}"
    if after is None and before is not None:
        return f"cleared (was {_brief(before)})"
    return f"{_brief(before)} → {_brief(after)}"


def _brief(value: Any, max_len: int = 40) -> str:
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        # Trim trailing zeros for floats.
        if isinstance(value, float):
            return f"{value:g}"
        return str(value)
    if isinstance(value, str):
        s = value.strip()
        return s if len(s) <= max_len else s[: max_len - 1] + "…"
    if isinstance(value, dict):
        # Pick first key/value for the brief.
        if not value:
            return "{}"
        k, v = next(iter(value.items()))
        return f"{{{k}={_brief(v, 16)}}}"
    if isinstance(value, list):
        if not value:
            return "[]"
        return f"[{len(value)} items]"
    return repr(value)[:max_len]


# Pretty category labels for buckets in the response.
_CATEGORY_LABELS: Dict[str, str] = {
    "config":    "⚙️ Config",
    "lifecycle": "🤖 Bot lifecycle",
    "trading":   "📈 Trading",
    "alert":     "🚨 Alerts",
    "system":    "🔧 System",
}


# ── Public answer() ──────────────────────────────────────────────────────────

def answer(message: str) -> Optional[str]:
    """Build a Markdown narrative for an audit-trail chat query.

    Returns None on soft miss (caller falls through to legacy branches).
    """
    try:
        from services.audit_service import audit_service
    except Exception as e:
        logger.warning(f"audit_chat_service: cannot import audit_service: {e}")
        return None

    start_cut, end_cut, window_label = _infer_window(message)
    cat_filter                       = _infer_category(message)

    # Pull a generous window from the ring buffer.  Filter ourselves so we
    # can detect "no entries match" and respond gracefully.
    raw = audit_service.list(limit=500, category=cat_filter)

    filtered: List[Dict[str, Any]] = []
    for entry in raw:
        if start_cut is not None or end_cut is not None:
            ts = _parse_iso(entry.get("timestamp", ""))
            if ts is None:
                continue
            if start_cut is not None and ts < start_cut:
                continue
            if end_cut is not None and ts >= end_cut:
                continue
        filtered.append(entry)

    # ── Early exits ────────────────────────────────────────────────────────
    if not filtered:
        scope = []
        if window_label:
            # "today" / "yesterday" / "this hour" stand alone; quantified
            # windows like "last 2 hours" read better with "in the".
            if window_label in ("today", "yesterday") or window_label.startswith("the "):
                scope.append(window_label)
            else:
                scope.append(f"in the {window_label}" if not window_label.startswith("last") else f"in the {window_label}")
        if cat_filter:    scope.append(f"under **{_CATEGORY_LABELS.get(cat_filter, cat_filter)}**")
        scope_str = " ".join(scope) if scope else "yet"
        summary   = audit_service.summary()
        buf_total = summary.get("buffered", 0)
        return (
            f"**No audit entries {scope_str}.**\n\n"
            f"The audit pipe is alive — {buf_total} total event{'s' if buf_total != 1 else ''} "
            f"in the ring buffer (lifetime {summary.get('lifetime_total', 0)}). "
            f"Try widening the window: \"recent changes\", \"changes this week\", or visit the **Audit Trail** page."
        )

    # If no window was inferred, take a sensible tail of the most recent.
    if start_cut is None and end_cut is None:
        filtered = filtered[:DEFAULT_TAIL]
        window_label = f"latest {len(filtered)}"

    # ── Group by category ──────────────────────────────────────────────────
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for e in filtered:
        cat = e.get("category", "system")
        buckets.setdefault(cat, []).append(e)

    # Stable order: config → lifecycle → trading → alert → system → others
    order = ["config", "lifecycle", "trading", "alert", "system"]
    sorted_cats = [c for c in order if c in buckets] + [c for c in buckets if c not in order]

    # ── Build the response ─────────────────────────────────────────────────
    total = len(filtered)
    header_scope = window_label if window_label else "most recent"
    cat_header   = f" under {_CATEGORY_LABELS.get(cat_filter, cat_filter)}" if cat_filter else ""
    lines: List[str] = [
        f"**{total} audit entr{'y' if total == 1 else 'ies'} — {header_scope}{cat_header}:**",
        "",
    ]

    rendered = 0
    for cat in sorted_cats:
        bucket = buckets[cat]
        label  = _CATEGORY_LABELS.get(cat, cat.title())
        lines.append(f"**{label}** ({len(bucket)})")
        shown = 0
        for entry in bucket:
            if rendered >= MAX_LINES_PER_RESPONSE:
                break
            if shown >= MAX_LINES_PER_CATEGORY:
                lines.append(f"  · _… +{len(bucket) - shown} more in this category_")
                break
            ts = _parse_iso(entry.get("timestamp", ""))
            ts_str = _fmt_time_short(ts) if ts else "??:??"
            actor  = entry.get("actor", "system")
            action = entry.get("action", "?")
            diff   = _fmt_diff(entry.get("before"), entry.get("after"))
            line   = f"  · `{ts_str}` · **{actor}** · {action}"
            if diff:
                line += f" — {diff}"
            lines.append(line)
            shown   += 1
            rendered += 1
        lines.append("")
        if rendered >= MAX_LINES_PER_RESPONSE:
            break

    if rendered < total:
        lines.append(f"_… {total - rendered} more not shown — visit the **Audit Trail** page for the full feed._")

    return "\n".join(lines).rstrip()