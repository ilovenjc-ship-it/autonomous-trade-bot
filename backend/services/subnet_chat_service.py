"""
Subnet Chat Service
===================
Carry-over #11 (Session XXXIV) — All-subnets scoring strategy chat.

Routes natural-language subnet questions inside the existing II Agent
chat (POST /api/fleet/chat) to scorecard + on-chain data, without
adding an LLM dependency. Pattern-matched intents over the live
``subnet_scorecard_service`` and ``subnet_cache_service`` instances.

Why no LLM?
-----------
The II Agent chat in this project is rule-based by design — every
response is grounded in live, queryable system state so the operator
can trust the numbers. Hallucinated subnet stats would actively harm
trading decisions, so #11 stays in the rule-based mould but covers
the full 128-subnet surface area.

Supported intents (auto-detected from the message)
---------------------------------------------------
1. **Specific subnet** — "tell me about SN18", "what's SN3?", "sn 8"
2. **Ranking by metric** — "top 5 subnets by score", "highest APY",
   "biggest stake", "most miners"
3. **Quality gate filter** — "6/6 subnets", "subnets passing all
   filters", "elite subnets"
4. **Category filter** — "ai subnets", "inference subnets",
   "data subnets" (matches scorecard.category)
5. **Comparison** — "compare SN18 and SN64"
6. **Trading scope** — "what's the bot trading?", "which subnets are
   live?"
7. **Conviction / takeover risk** — "vulnerable subnets",
   "fortress subnets"
8. **Owner / governance** — "who owns SN18?"
9. **Fallback** — short top-3 + active threshold + total count summary
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

# Module-level service refs are imported lazily inside handlers to dodge
# circular imports — fleet.py imports this module, this module imports
# subnet_cache_service which (transitively) reads _RISK_CONFIG from fleet.

# ── Public API ───────────────────────────────────────────────────────────────


def looks_like_subnet_query(msg: str) -> bool:
    """
    Cheap pre-check: should the chat router hand this message off to us?

    True when the message references "subnet", "sn<digits>", a known
    quality-gate keyword, or a brand name from the scorecard.
    """
    msg_l = msg.lower()
    if any(
        kw in msg_l
        for kw in (
            "subnet", " sn", "bittensor", "emission", "alpha", "dtao",
            "scorecard", "filter", "fortress", "vulnerable", "owner",
            "takeover", "conviction", "templar", "vanta", "cortex",
        )
    ):
        return True
    if re.search(r"\bsn\s*\d{1,3}\b", msg_l):
        return True
    return False


def answer(msg: str) -> str:
    """Return a markdown answer string for the message; fallback summary on miss."""
    msg_l = msg.lower().strip()

    # Order matters — most specific intents first. Compare before single
    # subnet (so "compare SN3 and SN8" wins over "SN3"). Owner / trading-
    # scope before specific-subnet so "who owns SN18" gets the focused
    # governance card and "what's the bot trading" doesn't get hijacked
    # by the category handler matching the word "trading".
    for handler in (
        _handle_compare,
        _handle_owner,
        _handle_trading_scope,
        _handle_quality_gate,
        _handle_takeover_band,
        _handle_specific_subnet,
        _handle_category,
        _handle_ranking,
    ):
        out = handler(msg_l)
        if out:
            return out
    return _fallback_summary()


# ── Helpers ──────────────────────────────────────────────────────────────────


def _scorecard():
    from services.subnet_scorecard_service import subnet_scorecard_service
    return subnet_scorecard_service


def _cache():
    from services.subnet_cache_service import subnet_cache_service
    return subnet_cache_service


def _trading_set() -> set:
    try:
        from services.subnet_cache_service import TRADING_NETUIDS
        return set(TRADING_NETUIDS)
    except Exception:
        return set()


def _all_subnets() -> List[Dict[str, Any]]:
    """Scorecard subnets — sorted by rank if present, else by netuid."""
    sc = _scorecard().get_full_scorecard()
    subs = list(sc.get("subnets") or [])
    subs.sort(key=lambda s: (s.get("rank") or 999, s.get("netuid") or 999))
    return subs


def _live_apy(netuid: int) -> Optional[float]:
    meta = _cache().get_meta(netuid)
    if not meta:
        return None
    apy = meta.get("apy")
    return float(apy) if apy is not None else None


def _live_stake(netuid: int) -> Optional[float]:
    meta = _cache().get_meta(netuid)
    if not meta:
        return None
    s = meta.get("stake_tao")
    return float(s) if s is not None else None


def _fmt_tao(n: Optional[float]) -> str:
    if n is None:
        return "—"
    if n >= 1_000_000:
        return f"{n / 1_000_000:.2f}M τ"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K τ"
    return f"{n:.2f} τ"


def _fmt_pct(p: Optional[float]) -> str:
    if p is None:
        return "—"
    return f"{p * 100:.1f}%" if p < 1.0 else f"{p:.1f}%"


# ── Intent: specific subnet (highest priority) ───────────────────────────────


_SN_RE = re.compile(r"\bsn\s*0*([0-9]{1,3})\b")


def _handle_specific_subnet(msg: str) -> Optional[str]:
    """`tell me about SN18` / `what's sn 3?` — single-subnet deep dive."""
    matches = _SN_RE.findall(msg)
    if len(matches) != 1:
        return None
    netuid = int(matches[0])
    return _render_subnet_detail(netuid)


def _render_subnet_detail(netuid: int) -> str:
    sc = _scorecard().get_subnet(netuid)
    meta = _cache().get_meta(netuid)
    owner = _cache().get_owner_meta(netuid)
    risk = _cache().get_takeover_risk(netuid)
    in_trading = netuid in _trading_set()
    threshold = _scorecard().get_active_threshold()

    if not sc and not meta and not owner:
        return (
            f"**SN{netuid}** isn't on the Const 6-Filter scorecard and "
            f"hasn't been polled by the metagraph cache yet. "
            f"That usually means it's outside the monitored range or "
            f"the cache is still warming up. Ask me about a different "
            f"subnet, or try `top 5 subnets by score`."
        )

    lines: List[str] = []
    name = (sc or {}).get("name") or "Unknown"
    cat = (sc or {}).get("category") or "—"
    score = (sc or {}).get("score")
    score_max = 6
    rank = (sc or {}).get("rank")
    callouts = (sc or {}).get("callouts") or []
    is_candidate = bool((sc or {}).get("is_taobot_signal_candidate"))

    header = f"**SN{netuid} — {name}** · {cat}"
    if rank:
        header += f" · scorecard rank #{rank}"
    if in_trading:
        header += " · 🟢 LIVE TRADING"
    lines.append(header)

    if score is not None:
        gate_state = "✓ passes gate" if score >= threshold else "✗ below gate"
        lines.append(
            f"**Const 6-Filter Test:** {score}/{score_max} ({gate_state} @ ≥{threshold} threshold)"
        )

    apy = _live_apy(netuid)
    stake = _live_stake(netuid)
    if apy is not None or stake is not None:
        lines.append(
            f"**On-chain:** stake {_fmt_tao(stake)} · APY {apy * 100:.1f}%"
            if apy is not None and stake is not None
            else f"**On-chain:** stake {_fmt_tao(stake)} · APY {('—' if apy is None else f'{apy*100:.1f}%')}"
        )

    if risk:
        lines.append(
            f"**Conviction-Era takeover risk:** **{risk['risk_band']}** "
            f"(score {risk['risk_score']:.2f} · owner share {_fmt_pct(risk['owner_share'])})"
        )
    elif owner and owner.get("owner_alpha"):
        lines.append(
            f"**Owner αTAO:** {owner['owner_alpha']:.1f}τ · risk denominator pending"
        )

    if is_candidate:
        lines.append("⭐ **Signal Candidate** — actively researched for live external-signal integration.")

    if callouts:
        lines.append("**Filter callouts:**")
        for c in callouts[:3]:
            lines.append(f"  · {c}")

    return "\n".join(lines)


# ── Intent: comparison (`compare SN18 and SN64`) ─────────────────────────────


def _handle_compare(msg: str) -> Optional[str]:
    if "compare" not in msg and " vs " not in msg and " versus " not in msg:
        return None
    nums = _SN_RE.findall(msg)
    if len(nums) < 2:
        return None
    a, b = int(nums[0]), int(nums[1])
    sa = _scorecard().get_subnet(a) or {}
    sb = _scorecard().get_subnet(b) or {}
    apy_a, apy_b = _live_apy(a), _live_apy(b)
    stk_a, stk_b = _live_stake(a), _live_stake(b)
    risk_a = _cache().get_takeover_risk(a) or {}
    risk_b = _cache().get_takeover_risk(b) or {}

    def fpct(x: Optional[float]) -> str:
        return f"{x * 100:.1f}%" if x is not None else "—"

    rows = [
        ("Name",           sa.get("name") or "—",            sb.get("name") or "—"),
        ("Category",       sa.get("category") or "—",        sb.get("category") or "—"),
        ("6-Filter score", str(sa.get("score") or "—"),      str(sb.get("score") or "—")),
        ("Stake",          _fmt_tao(stk_a),                  _fmt_tao(stk_b)),
        ("APY",            fpct(apy_a),                      fpct(apy_b)),
        ("Risk band",      risk_a.get("risk_band") or "—",   risk_b.get("risk_band") or "—"),
    ]
    out = [f"**SN{a} vs SN{b}** — head-to-head:\n"]
    out.append(f"| Metric | SN{a} | SN{b} |")
    out.append("|---|---|---|")
    for label, va, vb in rows:
        out.append(f"| {label} | {va} | {vb} |")
    return "\n".join(out)


# ── Intent: quality gate / scorecard filter ──────────────────────────────────


def _handle_quality_gate(msg: str) -> Optional[str]:
    if not any(
        w in msg
        for w in ("6/6", "6 of 6", "all filters", "passing", "elite", "scorecard", "quality gate")
    ):
        return None
    threshold = _scorecard().get_active_threshold()
    subs = _all_subnets()
    # Look for explicit threshold like "5/6" or "5 of 6"
    m = re.search(r"\b([0-9])(?:/| of )6\b", msg)
    explicit = int(m.group(1)) if m else (6 if "6/6" in msg or "6 of 6" in msg or "all filter" in msg else threshold)
    passing = [s for s in subs if (s.get("score") or 0) >= explicit]
    if not passing:
        return f"No scorecard subnet hits ≥{explicit}/6 yet. Active gate is **≥{threshold}**."
    out = [
        f"**{len(passing)} subnet(s) passing ≥{explicit}/6** (active gate: ≥{threshold}/6):\n"
    ]
    for s in passing[:12]:
        live = "🟢" if int(s.get("netuid", -1)) in _trading_set() else " "
        out.append(
            f"{live} **SN{s['netuid']} {s.get('name','?')}** · {s.get('category','—')} · "
            f"{s.get('score','?')}/6"
            + (" · ⭐ candidate" if s.get("is_taobot_signal_candidate") else "")
        )
    if len(passing) > 12:
        out.append(f"\n…+{len(passing) - 12} more.")
    return "\n".join(out)


# ── Intent: category filter (`ai subnets`, `inference subnets`) ──────────────


_CATEGORY_KEYWORDS = [
    "inference", "training", "data", "ai", "vision", "trading",
    "finance", "audio", "tts", "video", "compute", "storage",
    "scraping", "search", "rag",
]


def _handle_category(msg: str) -> Optional[str]:
    hits: List[str] = [k for k in _CATEGORY_KEYWORDS if re.search(rf"\b{re.escape(k)}\b", msg)]
    if not hits:
        return None
    # AI is too broad — if message just says "ai", surface the LLM/Inference cluster
    cat_term = hits[0]
    subs = _all_subnets()
    matches: List[Dict[str, Any]] = []
    for s in subs:
        cat = (s.get("category") or "").lower()
        name = (s.get("name") or "").lower()
        if cat_term in cat or cat_term in name:
            matches.append(s)
    if not matches:
        return None  # fall through to ranking/fallback
    out = [f"**{len(matches)} scorecard subnet(s) tagged `{cat_term}`:**\n"]
    for s in matches[:10]:
        live = "🟢" if int(s.get("netuid", -1)) in _trading_set() else " "
        out.append(
            f"{live} **SN{s['netuid']} {s.get('name','?')}** · {s.get('category','—')} · "
            f"{s.get('score','?')}/6"
        )
    if len(matches) > 10:
        out.append(f"\n…+{len(matches) - 10} more.")
    return "\n".join(out)


# ── Intent: takeover risk band ───────────────────────────────────────────────


def _handle_takeover_band(msg: str) -> Optional[str]:
    band: Optional[str] = None
    if "fortress" in msg:
        band = "FORTRESS"
    elif "vulnerable" in msg:
        band = "VULNERABLE"
    elif "contested" in msg:
        band = "CONTESTED"
    elif "defended" in msg:
        band = "DEFENDED"
    if not band:
        return None
    risks = _cache().get_all_takeover_risks() or {}
    matches = [
        (netuid, r) for netuid, r in risks.items()
        if (r or {}).get("risk_band") == band
    ]
    matches.sort(key=lambda x: x[1].get("risk_score", 0), reverse=(band == "VULNERABLE"))
    if not matches:
        return f"No subnets currently in the **{band}** band — denominator data may still be warming up."
    out = [f"**{len(matches)} subnet(s) in the {band} band:**\n"]
    for netuid, r in matches[:12]:
        sc = _scorecard().get_subnet(netuid) or {}
        out.append(
            f"· **SN{netuid} {sc.get('name','?')}** · share {_fmt_pct(r.get('owner_share'))} "
            f"· risk {r.get('risk_score', 0):.2f}"
        )
    if len(matches) > 12:
        out.append(f"\n…+{len(matches) - 12} more.")
    return "\n".join(out)


# ── Intent: owner / governance ───────────────────────────────────────────────


def _handle_owner(msg: str) -> Optional[str]:
    if not any(w in msg for w in ("who owns", "owner of", "owner ss58", "who runs")):
        return None
    nums = _SN_RE.findall(msg)
    if not nums:
        return None
    netuid = int(nums[0])
    o = _cache().get_owner_meta(netuid)
    if not o:
        return f"**SN{netuid}** owner snapshot not cached yet. Owners are polled in MONITOR_OWNERS_NETUIDS only."
    sc = _scorecard().get_subnet(netuid) or {}
    risk = _cache().get_takeover_risk(netuid) or {}
    addr = o.get("owner_ss58") or "?"
    short = f"{addr[:6]}…{addr[-4:]}" if len(addr) > 12 else addr
    out = [f"**SN{netuid} {sc.get('name','?')}** governance snapshot:"]
    out.append(f"· Owner coldkey: `{short}` (UID {o.get('owner_uid', '?')})")
    out.append(f"· Owner αTAO: **{o.get('owner_alpha', 0):.1f}τ**")
    if risk:
        out.append(
            f"· Conviction band: **{risk.get('risk_band','—')}** "
            f"(share {_fmt_pct(risk.get('owner_share'))})"
        )
    return "\n".join(out)


# ── Intent: trading scope ────────────────────────────────────────────────────


def _handle_trading_scope(msg: str) -> Optional[str]:
    if not any(
        w in msg
        for w in ("trading", "live subnets", "active subnets", "what is the bot trading", "what's the bot trading")
    ):
        return None
    trading = sorted(_trading_set())
    if not trading:
        return "Bot trading scope is empty — TRADING_NETUIDS not configured."
    out = [f"**Bot is actively trading {len(trading)} subnet(s):**\n"]
    for netuid in trading:
        sc = _scorecard().get_subnet(netuid) or {}
        apy = _live_apy(netuid)
        stake = _live_stake(netuid)
        out.append(
            f"· **SN{netuid} {sc.get('name','?')}** · {sc.get('category','—')} · "
            f"{sc.get('score','?')}/6 · stake {_fmt_tao(stake)} · APY "
            + (f"{apy*100:.1f}%" if apy is not None else "—")
        )
    return "\n".join(out)


# ── Intent: ranking (top N by metric) ────────────────────────────────────────


_RANKING_METRICS = [
    ("score",     ["score", "rank", "best", "top", "leading", "highest scoring"]),
    ("apy",       ["apy", "yield", "highest apy"]),
    ("stake",     ["stake", "biggest", "largest stake", "deepest", "tvl"]),
    ("emission",  ["emission", "issuance"]),
    ("miners",    ["miners", "validators", "registered"]),
]


def _handle_ranking(msg: str) -> Optional[str]:
    metric: Optional[str] = None
    for name, kws in _RANKING_METRICS:
        if any(kw in msg for kw in kws):
            metric = name
            break
    if metric is None:
        return None

    # Parse "top N" if present, default 5; cap at 15
    m = re.search(r"\btop\s+(\d{1,2})\b", msg)
    n = int(m.group(1)) if m else 5
    n = max(1, min(n, 15))

    subs = _all_subnets()

    def keyfn(s: Dict[str, Any]):
        netuid = int(s.get("netuid") or -1)
        if metric == "score":
            return s.get("score") or 0
        if metric == "apy":
            return _live_apy(netuid) or 0.0
        if metric == "stake":
            return _live_stake(netuid) or 0.0
        if metric == "emission":
            meta = _cache().get_meta(netuid) or {}
            return float(meta.get("emission") or 0.0)
        if metric == "miners":
            meta = _cache().get_meta(netuid) or {}
            return float(meta.get("miners") or 0.0)
        return 0.0

    ranked = sorted(subs, key=keyfn, reverse=True)[:n]
    label = {
        "score":    "Const 6-Filter score",
        "apy":      "live APY",
        "stake":    "stake (τ)",
        "emission": "emission rate",
        "miners":   "miner count",
    }[metric]
    out = [f"**Top {len(ranked)} subnets by {label}:**\n"]
    for s in ranked:
        netuid = int(s.get("netuid") or -1)
        live = "🟢" if netuid in _trading_set() else " "
        apy = _live_apy(netuid)
        stake = _live_stake(netuid)
        meta_val = ""
        if metric == "apy":
            meta_val = f" · APY {apy*100:.1f}%" if apy is not None else " · APY —"
        elif metric == "stake":
            meta_val = f" · stake {_fmt_tao(stake)}"
        elif metric == "emission":
            em = (_cache().get_meta(netuid) or {}).get("emission")
            meta_val = f" · emission {em:.4f}" if em is not None else " · emission —"
        elif metric == "miners":
            ms = (_cache().get_meta(netuid) or {}).get("miners")
            meta_val = f" · miners {ms}" if ms is not None else " · miners —"
        out.append(
            f"{live} **SN{netuid} {s.get('name','?')}** · {s.get('category','—')} · "
            f"score {s.get('score','?')}/6{meta_val}"
        )
    return "\n".join(out)


# ── Fallback summary ─────────────────────────────────────────────────────────


def _fallback_summary() -> str:
    threshold = _scorecard().get_active_threshold()
    subs = _all_subnets()
    passing = [s for s in subs if (s.get("score") or 0) >= threshold]
    top3 = subs[:3]
    trading = sorted(_trading_set())
    out = [
        f"**Subnet intelligence at a glance** (active gate: ≥{threshold}/6):",
        f"· {len(subs)} scorecard entries · {len(passing)} passing · "
        f"{len(trading)} live trading",
    ]
    if top3:
        out.append("\nTop 3 by scorecard rank:")
        for s in top3:
            netuid = int(s.get("netuid") or -1)
            live = "🟢" if netuid in _trading_set() else " "
            out.append(
                f"{live} **SN{netuid} {s.get('name','?')}** · "
                f"{s.get('category','—')} · {s.get('score','?')}/6"
            )
    out.append(
        "\nTry: `tell me about SN18`, `top 5 by APY`, `compare SN18 and SN64`, "
        "`6/6 subnets`, `vulnerable subnets`, `who owns SN8?`."
    )
    return "\n".join(out)