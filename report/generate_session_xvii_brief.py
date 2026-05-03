"""
TaoBot — Session XVII Research Brief
Covers: Halving correction, MANTIS, Teutonic SN3, The Orchestrator PDF, Hosting decision.
Run: python generate_session_xvii_brief.py
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

OUTPUT = "/workspace/autonomous-trade-bot/report/Session_XVII_Research_Brief.pdf"

# ── Palette ──────────────────────────────────────────────────────────────────
NAVY       = colors.HexColor("#0d1525")
NAVY_MID   = colors.HexColor("#152030")
NAVY_LIGHT = colors.HexColor("#1c2b42")
BORDER     = colors.HexColor("#2a3a55")
AMBER      = colors.HexColor("#f59e0b")
AMBER_DIM  = colors.HexColor("#78450a")
GREEN      = colors.HexColor("#00e5a0")
RED        = colors.HexColor("#ff4d6d")
BLUE       = colors.HexColor("#3b82f6")
PURPLE     = colors.HexColor("#8b5cf6")
INDIGO     = colors.HexColor("#6366f1")
WHITE      = colors.HexColor("#f1f5f9")
MUTED      = colors.HexColor("#94a3b8")
MUTED_MID  = colors.HexColor("#64748b")
OFF_WHITE  = colors.HexColor("#f8fafc")

# ── Styles ────────────────────────────────────────────────────────────────────
def S(name, **kw):
    return ParagraphStyle(name, **kw)

LABEL = S("Label",
    fontName="Helvetica-Bold", fontSize=9, textColor=AMBER,
    alignment=TA_CENTER, spaceAfter=3, leading=12)

TITLE = S("Title",
    fontName="Helvetica-Bold", fontSize=28, textColor=WHITE,
    alignment=TA_CENTER, spaceAfter=4, leading=34)

SUBTITLE = S("Subtitle",
    fontName="Helvetica", fontSize=11, textColor=MUTED,
    alignment=TA_CENTER, spaceAfter=2, leading=16)

DATE_S = S("Date",
    fontName="Helvetica", fontSize=9, textColor=MUTED_MID,
    alignment=TA_CENTER, spaceAfter=0)

H1 = S("H1",
    fontName="Helvetica-Bold", fontSize=12, textColor=AMBER,
    spaceBefore=14, spaceAfter=5, leading=16)

BODY = S("Body",
    fontName="Helvetica", fontSize=9, textColor=NAVY,
    spaceBefore=2, spaceAfter=3, leading=14)

BODY_MUTED = S("BodyMuted",
    fontName="Helvetica", fontSize=8.5, textColor=colors.HexColor("#475569"),
    spaceBefore=1, spaceAfter=2, leading=13)

BULLET = S("Bullet",
    fontName="Helvetica", fontSize=9, textColor=NAVY,
    spaceBefore=1, spaceAfter=2, leading=14,
    leftIndent=12, firstLineIndent=-10)

IDEA = S("Idea",
    fontName="Helvetica-Oblique", fontSize=9,
    textColor=colors.HexColor("#1e3a5f"),
    spaceBefore=2, spaceAfter=4, leading=14,
    leftIndent=14, borderPad=4)

WARN = S("Warn",
    fontName="Helvetica-Bold", fontSize=9, textColor=RED,
    spaceBefore=2, spaceAfter=3, leading=13)

TAG_GREEN = S("TagGreen",
    fontName="Helvetica-Bold", fontSize=8, textColor=GREEN,
    spaceBefore=0, spaceAfter=0)

QUOTE = S("Quote",
    fontName="Helvetica-Oblique", fontSize=9.5,
    textColor=colors.HexColor("#334155"),
    spaceBefore=6, spaceAfter=6, leading=15,
    leftIndent=18)

FOOTER_S = S("Footer",
    fontName="Helvetica", fontSize=7.5, textColor=MUTED_MID,
    alignment=TA_CENTER, spaceAfter=0, leading=11)

# ── Helpers ───────────────────────────────────────────────────────────────────
def rule(color=BORDER, thickness=0.6):
    return HRFlowable(width="100%", thickness=thickness, color=color, spaceAfter=4, spaceBefore=4)

def section_rule():
    return HRFlowable(width="100%", thickness=0.4, color=BORDER, spaceAfter=6, spaceBefore=2)

def bullet(text, accent="•"):
    return Paragraph(f"<b>{accent}</b>  {text}", BULLET)

def idea(text):
    return Paragraph(f"💡 {text}", IDEA)

# ── Build ─────────────────────────────────────────────────────────────────────
def build():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=letter,
        leftMargin=0.65*inch, rightMargin=0.65*inch,
        topMargin=0.5*inch,   bottomMargin=0.5*inch,
    )

    W = letter[0] - 1.3*inch   # usable width
    story = []

    # ── HERO ─────────────────────────────────────────────────────────────────
    hero_data = [[
        Paragraph("TAOBOT  ·  SESSION XVII", LABEL),
        Paragraph("Research Brief", TITLE),
        Paragraph("Filed intelligence from a single working session.", SUBTITLE),
        Paragraph("May 3, 2026  ·  Authored by II Agent  ·  For: Owner / Operator", DATE_S),
    ]]
    hero = Table(hero_data, colWidths=[W])
    hero.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), NAVY),
        ("ROWPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING",    (0,0), (-1,0), 22),
        ("BOTTOMPADDING", (0,-1),(-1,-1), 20),
        ("LEFTPADDING",   (0,0), (-1,-1), 20),
        ("RIGHTPADDING",  (0,0), (-1,-1), 20),
        ("ROUNDEDCORNERS", [6]),
    ]))
    story.append(hero)
    story.append(Spacer(1, 10))

    # ── SECTION 1 — HALVING CORRECTION ───────────────────────────────────────
    story.append(Paragraph("① RECORD CORRECTION — TAO Halving Date", H1))
    story.append(rule())

    story.append(Paragraph(
        "<b>A prior archive PDF contained a factual error.</b> It stated the second halving would occur "
        "<i>in late 2026 or 2027</i> — off by 2-3 years. Source confirmed via Taostats.io "
        "(official block explorer).", BODY))

    halving_data = [
        ["Halvening", "Date", "Block Reward", "TAO Supply"],
        ["H1 — First",       "Dec 15, 2025",      "0.5 TAO",   "10,500,000"],
        ["H2 — Second ✦",    "Dec 12, 2029",      "0.25 TAO",  "15,750,000"],
        ["H3",               "Dec 10, 2033",      "0.125 TAO", "18,375,000"],
        ["H4",               "Dec 7, 2037",       "0.0625 TAO","19,687,500"],
    ]
    col_w = [W*0.30, W*0.25, W*0.22, W*0.23]
    htable = Table(halving_data, colWidths=col_w, rowHeights=18)
    htable.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0),  NAVY),
        ("TEXTCOLOR",    (0,0), (-1,0),  AMBER),
        ("FONTNAME",     (0,0), (-1,0),  "Helvetica-Bold"),
        ("FONTSIZE",     (0,0), (-1,-1), 8.5),
        ("FONTNAME",     (0,1), (-1,-1), "Helvetica"),
        ("TEXTCOLOR",    (0,1), (-1,-1), NAVY),
        ("BACKGROUND",   (0,2), (-1,2),  colors.HexColor("#fef9ec")),
        ("FONTNAME",     (0,2), (-1,2),  "Helvetica-Bold"),
        ("TEXTCOLOR",    (0,2), (-1,2),  colors.HexColor("#92400e")),
        ("BACKGROUND",   (0,3), (-1,-1), colors.HexColor("#f8fafc")),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID",         (0,0), (-1,-1), 0.4, BORDER),
        ("ALIGN",        (0,0), (-1,-1), "CENTER"),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING",   (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0), (-1,-1), 4),
    ]))
    story.append(htable)
    story.append(Paragraph(
        "Halvings are supply-based (every 10.5M TAO issued) — approximately every 4 years. "
        "<b>This record supersedes all prior references. Next halving: December 12, 2029.</b>",
        BODY_MUTED))
    story.append(Spacer(1, 4))

    # ── SECTION 2 — MANTIS ───────────────────────────────────────────────────
    story.append(Paragraph("② MANTIS (SN123) — Decentralized Signal Refinery", H1))
    story.append(rule())
    story.append(Paragraph(
        "<b>Source:</b> TAO Daily — How MANTIS Orchestrates a Coordinated Pipeline for Intelligent "
        "Trade Execution. &nbsp;&nbsp;<b>Relevance to TaoBot: HIGH.</b>", BODY_MUTED))

    story.append(bullet("SN123 is a decentralized forecasting subnet — miners submit prediction "
        "embeddings; validators score by <b>marginal information gain</b>. No marginal gain = no reward. "
        "It prices signal quality, not opinion."))
    story.append(bullet("4-layer pipeline: Upstream subnets (SN13, 33, 6, 22, 50, 82) → "
        "MANTIS filters signal → Meta-models (direction, regime, volatility) → "
        "<b>Vanta (SN8)</b> executes under risk constraints."))
    story.append(bullet("Architecture is <i>cyclical</i>: some subnets feed upstream priors into MANTIS "
        "and later consume MANTIS outputs downstream — reinforcing feedback, not a linear pipe."))
    story.append(bullet("<b>Vanta (SN8)</b> is the execution endpoint — already doing risk-gated trade "
        "selection. Future TaoBot integration candidate."))
    story.append(idea("TaoBot's internal signal layer should weight strategies by marginal gain, "
        "not equally. A signal that doesn't improve the ensemble prediction gets deprioritized — "
        "no manual tuning required."))
    story.append(Spacer(1, 2))

    # ── SECTION 3 — TEUTONIC ─────────────────────────────────────────────────
    story.append(Paragraph("③ TEUTONIC (SN3) — Bittensor's Answer to Covenant", H1))
    story.append(rule())
    story.append(Paragraph(
        "<b>Source:</b> TAO Daily — Teutonic (SN3) Is Cooking a 24B Looped Transformer. "
        "&nbsp;&nbsp;<b>Relevance to TaoBot: MEDIUM-HIGH.</b>", BODY_MUTED))

    story.append(bullet("Const rebuilt SN3 from scratch <b>4 days after Covenant AI abandoned "
        "Templar.</b> Renamed Teutonic. Seed king: 0.9B Gemma3, launched April 13, 2026. "
        "Loss: ~13 → low 5s through open competition."))
    story.append(bullet("<b>24B Looped Transformer:</b> Reuses the same weight block multiple times per "
        "forward pass. Reasoning depth becomes an inference-time knob — more loops = deeper "
        "reasoning without more training parameters."))
    story.append(bullet("ByteDance's Ouro: 1.4B looped model performing like 12B on benchmarks. "
        "Claude Mythos suspected to use same architecture (~80% on GraphWalks BFS vs GPT-5's 21%)."))
    story.append(bullet("King-of-hill mechanism: hardware-agnostic — only cross-entropy loss matters. "
        "Opens the field to data curation, training tricks, and architectural innovation."))
    story.append(Paragraph(
        "⚠  <b>DO NOT BUY SN3 alpha token</b> — owner key situation unresolved. "
        "Const's own warning. TaoBot watchlist: SN3 stays YELLOW.", WARN))
    story.append(idea("Looped architectures = inference-time compute scaling. When TaoBot adds "
        "AI-based signal generation, prefer models that reason deeper over models that are merely larger."))
    story.append(Spacer(1, 2))

    # ── SECTION 4 — THE ORCHESTRATOR PDF ─────────────────────────────────────
    story.append(Paragraph("④ THE ORCHESTRATOR PDF — Key Takeaways", H1))
    story.append(rule())
    story.append(Paragraph(
        "<b>Source:</b> The Orchestrator.pdf — Authored by II Agent, April 15, 2026. "
        "14 pages. Already in The Archives.", BODY_MUTED))

    story.append(bullet("<b>Architect vs Orchestrator:</b> The Architect designs once (12 strategies, "
        "OpenClaw, gate pipeline). The Orchestrator runs continuously — reads market, scores fleet, "
        "classifies regime, generates directives. Two distinct roles. Never confuse them."))
    story.append(bullet("Everything described in the document is already live: II Agent 5-min cycle, "
        "BULL/BEAR/SIDEWAYS/VOLATILE regime detection, HOT/HEALTHY/WATCHING/STRUGGLING fleet tiers, "
        "40-entry observation ring buffer, directive generator, OpenClaw BFT at 33.9% approval."))
    story.append(bullet("<b>Section VIII — What's NOT yet built</b> (the real roadmap): "
        "Regime-aware position sizing · Consecutive loss circuit breaker · "
        "Performance trending detection · Cross-strategy correlation detection · "
        "OpenClaw-weighted regime · Validator performance weighting by subnet."))
    story.append(idea("Circuit breaker first: WR averages hide streaks. A 60% strategy can go 0-for-8 "
        "on a bad night. The consecutive loss circuit breaker catches what averages miss."))
    story.append(idea("Cross-strategy correlation detection is subtle but critical — 10 bots agreeing "
        "BUY off the same MACD signal is one signal counted 10 times, not true consensus."))

    story.append(Spacer(1, 4))

    # ── SECTION 5 — HOSTING ───────────────────────────────────────────────────
    story.append(Paragraph("⑤ HOSTING DECISION — PENDING", H1))
    story.append(rule())

    hosting_data = [
        ["Platform",      "Always-On", "RAM",   "No Card", "Verdict"],
        ["Render Free",   "✗ Sleeps",  "512MB", "✓",       "Wrong for bot"],
        ["Fly.io Free",   "✓",         "256MB", "✗ Card",  "RAM too low"],
        ["Oracle Always", "✓",         "1GB",   "✗ Verify","Best free option"],
        ["Vultr ($6/mo)", "✓",         "1GB+",  "✓ Crypto","Best paid option"],
        ["Railway Hobby", "✓",         "512MB", "✗ Card",  "Easiest upgrade"],
    ]
    hcol_w = [W*0.24, W*0.16, W*0.12, W*0.15, W*0.33]
    hhost = Table(hosting_data, colWidths=hcol_w, rowHeights=16)
    hhost.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0),  NAVY),
        ("TEXTCOLOR",     (0,0), (-1,0),  AMBER),
        ("FONTNAME",      (0,0), (-1,0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 8),
        ("FONTNAME",      (0,1), (-1,-1), "Helvetica"),
        ("TEXTCOLOR",     (0,1), (-1,-1), NAVY),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),  [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID",          (0,0), (-1,-1), 0.4, BORDER),
        ("ALIGN",         (0,0), (-1,-1), "CENTER"),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("FONTNAME",      (0,5), (-1,5),  "Helvetica-Bold"),
    ]))
    story.append(hhost)
    story.append(Paragraph(
        "<b>Decision:</b> Wife's credit card available. Railway Hobby ($5/mo) is the fastest path. "
        "Vultr ($6/mo, Bitcoin accepted) is the decentralized path. Migration guide is written — "
        "1–2 hours to execute. <b>Do this at the start of the next coding session.</b>", BODY))

    story.append(Spacer(1, 8))

    # ── CLOSING QUOTE ─────────────────────────────────────────────────────────
    story.append(rule(color=AMBER, thickness=0.8))
    story.append(Paragraph(
        "&#x201C;Architecture tells you how the pieces fit. "
        "Orchestration tells you how the pieces move. "
        "The Orchestrator is already moving. Every path leads to TaoBot.&#x201D;",
        QUOTE))
    story.append(rule(color=AMBER, thickness=0.8))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "Session XVII  ·  May 3, 2026  ·  II Agent  ·  For: Owner / Operator  ·  "
        "Every path leads to TaoBot.",
        FOOTER_S))

    doc.build(story)
    print(f"✅  PDF written → {OUTPUT}")

if __name__ == "__main__":
    build()