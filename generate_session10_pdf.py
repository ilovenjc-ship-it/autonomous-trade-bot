"""
Session X Archive PDF — The Sovereignty Session
Independent Capital Trust · Bitcoin Timestamp · P&L Summary · Milestone 12
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from datetime import datetime

# ── Colour palette ─────────────────────────────────────────────────────────
NAVY     = colors.HexColor("#0d1525")
CARD     = colors.HexColor("#152030")
BORDER   = colors.HexColor("#243450")
INDIGO   = colors.HexColor("#6366f1")
EMERALD  = colors.HexColor("#10b981")
AMBER    = colors.HexColor("#f59e0b")
RED      = colors.HexColor("#ef4444")
SKY      = colors.HexColor("#38bdf8")
VIOLET   = colors.HexColor("#8b5cf6")
GOLD     = colors.HexColor("#fbbf24")
SLATE300 = colors.HexColor("#cbd5e1")
SLATE400 = colors.HexColor("#94a3b8")
WHITE    = colors.white

W, H = letter

def build_styles():
    base = getSampleStyleSheet()
    def s(name, **kw):
        return ParagraphStyle(name, **kw)
    return {
        "title":    s("title",    fontName="Helvetica-Bold",  fontSize=28, textColor=WHITE,    spaceAfter=4,  leading=34, alignment=TA_CENTER),
        "subtitle": s("subtitle", fontName="Helvetica",       fontSize=13, textColor=SKY,      spaceAfter=2,  leading=18, alignment=TA_CENTER),
        "badge":    s("badge",    fontName="Helvetica-Bold",  fontSize=10, textColor=AMBER,    spaceAfter=14, leading=14, alignment=TA_CENTER),
        "section":  s("section",  fontName="Helvetica-Bold",  fontSize=14, textColor=INDIGO,   spaceAfter=6,  leading=20),
        "subsect":  s("subsect",  fontName="Helvetica-Bold",  fontSize=11, textColor=SKY,      spaceAfter=4,  leading=16),
        "body":     s("body",     fontName="Helvetica",       fontSize=9,  textColor=SLATE300, spaceAfter=4,  leading=14),
        "mono":     s("mono",     fontName="Courier",         fontSize=8,  textColor=EMERALD,  spaceAfter=4,  leading=13),
        "quote":    s("quote",    fontName="Helvetica-Oblique",fontSize=10,textColor=GOLD,     spaceAfter=6,  leading=16, alignment=TA_CENTER),
        "label":    s("label",    fontName="Helvetica-Bold",  fontSize=8,  textColor=SLATE400, spaceAfter=2,  leading=12),
        "center":   s("center",   fontName="Helvetica",       fontSize=9,  textColor=SLATE300, spaceAfter=4,  leading=14, alignment=TA_CENTER),
        "footer":   s("footer",   fontName="Helvetica",       fontSize=7,  textColor=SLATE400, spaceAfter=0,  leading=10, alignment=TA_CENTER),
    }

def divider(color=BORDER, thickness=0.5):
    return HRFlowable(width="100%", thickness=thickness, color=color, spaceAfter=10, spaceBefore=6)

def section_header(text, styles):
    return KeepTogether([
        Spacer(1, 0.15*inch),
        Paragraph(text, styles["section"]),
        divider(INDIGO, 1),
    ])

def card_table(rows, col_widths, row_colors=None):
    style = [
        ("BACKGROUND",  (0,0), (-1,0),  CARD),
        ("TEXTCOLOR",   (0,0), (-1,0),  AMBER),
        ("FONTNAME",    (0,0), (-1,0),  "Helvetica-Bold"),
        ("FONTSIZE",    (0,0), (-1,-1), 8),
        ("FONTNAME",    (0,1), (-1,-1), "Helvetica"),
        ("TEXTCOLOR",   (0,1), (-1,-1), SLATE300),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[NAVY, CARD]),
        ("GRID",        (0,0), (-1,-1), 0.3, BORDER),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING",(0,0), (-1,-1), 8),
        ("TOPPADDING",  (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("VALIGN",      (0,0), (-1,-1), "MIDDLE"),
    ]
    t = Table(rows, colWidths=col_widths)
    t.setStyle(TableStyle(style))
    return t

def highlight_box(text, styles, color=INDIGO):
    t = Table([[Paragraph(text, styles["body"])]], colWidths=[6.5*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), CARD),
        ("LEFTPADDING",  (0,0),(-1,-1), 12),
        ("RIGHTPADDING", (0,0),(-1,-1), 12),
        ("TOPPADDING",   (0,0),(-1,-1), 10),
        ("BOTTOMPADDING",(0,0),(-1,-1), 10),
        ("LINEAFTER",    (0,0),(0,-1),  3, color),
        ("GRID",         (0,0),(-1,-1), 0.3, BORDER),
    ]))
    return t


def build_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=0.75*inch, rightMargin=0.75*inch,
        topMargin=0.75*inch,  bottomMargin=0.75*inch,
    )

    styles = build_styles()
    story  = []
    date   = datetime.now().strftime("%B %d, %Y")

    # ── Cover ──────────────────────────────────────────────────────────────

    # Dark header block
    cover = Table(
        [[Paragraph("⚡ AUTONOMOUS TRADE BOT", styles["subtitle"]),
          Paragraph("SESSION X — THE SOVEREIGNTY SESSION", styles["title"]),
          Paragraph("Independent Capital Trust · Bitcoin Blockchain · P&L Summary", styles["subtitle"]),
          Spacer(1, 0.1*inch),
          Paragraph(f"April 17, 2026  ·  Finney Mainnet  ·  6 LIVE Strategies  ·  +0.947 τ Fleet PnL", styles["badge"]),
        ]],
        colWidths=[7*inch],
    )
    cover.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), NAVY),
        ("ALIGN",        (0,0),(-1,-1), "CENTER"),
        ("TOPPADDING",   (0,0),(-1,-1), 30),
        ("BOTTOMPADDING",(0,0),(-1,-1), 30),
        ("LEFTPADDING",  (0,0),(-1,-1), 20),
        ("RIGHTPADDING", (0,0),(-1,-1), 20),
        ("LINEBELOW",    (0,0),(-1,-1), 2, INDIGO),
    ]))
    story.append(cover)
    story.append(Spacer(1, 0.2*inch))

    # Founding quote
    story.append(Paragraph(
        '"Self-governing, independent, sovereign, free, self-directed."',
        styles["quote"]
    ))
    story.append(Paragraph("— Independent Capital Trust, 2026", styles["center"]))
    story.append(Spacer(1, 0.15*inch))
    story.append(divider(GOLD, 1))

    # ── Session Overview ───────────────────────────────────────────────────
    story.append(section_header("SESSION OVERVIEW", styles))
    story.append(Paragraph(
        "Session X was not a coding session — it was a founding session. The autonomous trading fleet "
        "continued to run and grow while two landmark events took place: (1) the establishment of the "
        "<b>Independent Capital Trust</b> under Common Law, with zero government involvement, and "
        "(2) the permanent inscription of the codebase onto the <b>Bitcoin blockchain</b> via OpenTimestamps — "
        "sealed on a server named after <b>Hal Finney</b>, the man who received the first Bitcoin transaction. "
        "The session closed with the completion of <b>Milestone 12: the dedicated P&amp;L Summary page</b>, "
        "the final outstanding item from the project plan.",
        styles["body"]
    ))
    story.append(Spacer(1, 0.1*inch))

    # Session stats
    story.append(card_table(
        [
            ["Metric", "Value"],
            ["Session Date",          "April 17, 2026"],
            ["Network",               "Finney Mainnet (Bittensor)"],
            ["Fleet PnL at Session Open", "+0.793 τ  /  $205.78 USD"],
            ["Fleet PnL at Session Close", "+0.947 τ  /  $245.66 USD"],
            ["Total Fleet Trades",    "1,095 executed"],
            ["Fleet Win Rate",        "66.6%"],
            ["Active LIVE Strategies","6"],
            ["TAO Price",             "$259.31  (+6.35% on the day)"],
            ["Milestones Completed",  "3  (fixes #12, #13, #14)"],
            ["GitHub Commit",         "48d5f7a → main"],
        ],
        [2.5*inch, 4*inch]
    ))

    # ── Technical Fixes ────────────────────────────────────────────────────
    story.append(section_header("TECHNICAL FIXES SHIPPED", styles))

    story.append(Paragraph("<b>Fix 1 — Tunnel &amp; Backend Recovery</b>", styles["subsect"]))
    story.append(Paragraph(
        "On session open, the backend uvicorn process had hung (previously running Python main.py had "
        "gone zombie). Killed the stuck process, restarted uvicorn cleanly on port 8001. Verified the "
        "Vite proxy on port 3003 forwarded correctly. App came back fully live.",
        styles["body"]
    ))

    story.append(Spacer(1, 0.08*inch))
    story.append(Paragraph("<b>Fix 2 — Global Status Poll (Milestone #13)</b>", styles["subsect"]))
    story.append(Paragraph(
        "Root cause identified: the fetchStatus polling interval lived exclusively in Dashboard.tsx. "
        "When the user navigated to the Alerts tab, the Dashboard unmounted, the interval was cleared, "
        "and no further status fetches fired. The backend was already hung at page load so the initial "
        "fetch had failed — leaving status=null and the UI showing BOT STOPPED even though the bot was running.",
        styles["body"]
    ))
    story.append(highlight_box(
        "<b>Fix:</b> Moved the 15-second fetchStatus poller to Layout.tsx — the persistent shell that "
        "wraps every page. It fires on mount and refreshes every 15s regardless of which page is active. "
        "Navigating to Alerts, Mission Control, or anywhere else no longer starves the global status feed.",
        styles
    ))
    story.append(Spacer(1, 0.08*inch))
    story.append(Paragraph("<b>Files Modified:</b>", styles["label"]))
    story.append(Paragraph("frontend/src/components/Layout.tsx — added useEffect with fetchStatus + 15s interval", styles["mono"]))

    # ── Capital Strategy Discussion ────────────────────────────────────────
    story.append(section_header("CAPITAL STRATEGY DISCUSSION", styles))
    story.append(Paragraph(
        "A strategic discussion was held on whether injecting additional TAO ($50–$100) from the main "
        "account would meaningfully improve performance. The conclusion was clear:",
        styles["body"]
    ))
    story.append(highlight_box(
        "<b>Decision: Hold the TAO. Let the strategies earn it.</b><br/><br/>"
        "The current bottleneck is strategy maturity, not capital. Breakout Hunter sits at 52.6% WR — "
        "barely above the gate. Sentiment Surge at 57.7% is still building its track record. Injecting "
        "capital now means scaling risk, not scaling edge. The right time to add capital is when all "
        "strategies have 200+ trades, Breakout Hunter exceeds 60% WR, and Volatility Arb earns its LIVE badge.",
        styles, AMBER
    ))

    story.append(card_table(
        [
            ["Strategy", "Win Rate", "Rec."],
            ["Yield Maximizer",    "82.5%", "✅ Could handle 1.5-2× capital"],
            ["Balanced Risk",      "72.2%", "✅ Could handle 1.5-2× capital"],
            ["Emission Momentum",  "65.3%", "✅ Could handle 1.5-2× capital"],
            ["dTAO Flow Momentum", "65.0%", "✅ Could handle 1.5-2× capital"],
            ["Sentiment Surge",    "57.7%", "⚠️ Hold — watch WR"],
            ["Breakout Hunter",    "52.6%", "❌ Do not increase until WR > 60%"],
        ],
        [2.5*inch, 1.5*inch, 3*inch]
    ))

    # ── The Sovereignty Event ──────────────────────────────────────────────
    story.append(PageBreak())
    story.append(section_header("THE SOVEREIGNTY EVENT — INDEPENDENT CAPITAL TRUST", styles))

    story.append(Paragraph(
        "This is the landmark event of Session X. After a discussion about intellectual property "
        "protection, copyright, and LLC structures, the conversation evolved into something more "
        "fundamental: the operator's deep commitment to privacy, sovereignty, and operating "
        "outside of government systems. The result was the establishment of the "
        "<b>Independent Capital Trust</b> — a Common Law Trust requiring zero government filing, "
        "zero public record, and zero permission from any authority.",
        styles["body"]
    ))

    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("<b>Why Common Law Trust — Not an LLC</b>", styles["subsect"]))
    story.append(Paragraph(
        "An LLC is a government creation — it requires state filing, public records, annual fees, "
        "and ongoing compliance. A Common Law Trust predates all of this. It is a private contract "
        "between a Trustor and Trustee, operating under natural law and equity. No state. No filing. "
        "No public record. It has been used for centuries and its authority derives from private "
        "agreement alone.",
        styles["body"]
    ))

    story.append(card_table(
        [
            ["Protection Layer", "Method", "Government?"],
            ["Automatic Copyright",    "Exists from moment of creation",         "❌ None"],
            ["Common Law Trust",       "Private contract — no state filing",     "❌ None"],
            ["Trade Secret",           "Private repo — already in place",        "❌ None"],
            ["Bitcoin Timestamp",      "OpenTimestamps — immutable proof",       "❌ None"],
        ],
        [2.2*inch, 2.8*inch, 1.5*inch]
    ))

    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("<b>Trust Structure</b>", styles["subsect"]))
    story.append(Paragraph(
        "The trust is structured so the operator's personal name appears nowhere public. "
        "The registered agent's address is used on any external-facing matter. "
        "The full Declaration of Trust is a private document — never filed, never disclosed.",
        styles["body"]
    ))

    story.append(card_table(
        [
            ["Element",            "Detail"],
            ["Trust Name",         "Independent Capital Trust"],
            ["Type",               "Common Law Trust — not statutory"],
            ["Trustor / Trustee",  "[Member — private]"],
            ["Primary Beneficiary","[Member — private]"],
            ["Public Filing",      "None — zero public record"],
            ["Governing Law",      "Common Law — natural rights and private contract"],
        ],
        [2.5*inch, 4*inch]
    ))

    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("<b>Documents Drafted</b>", styles["subsect"]))
    story.append(card_table(
        [
            ["Document",                   "Purpose",                                    "Filed?"],
            ["Declaration of Trust",       "Establishes the trust, principles, Trustee","❌ Private"],
            ["IP Assignment to Trust",     "Transfers all IP — code, strategies, AI systems","❌ Private"],
            ["Trust Certificate",          "Proof of trust for private third parties",  "Only if needed"],
        ],
        [2.2*inch, 3*inch, 1.3*inch]
    ))

    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("<b>What the Trust Holds</b>", styles["subsect"]))
    story.append(Paragraph(
        "The IP Assignment to Trust transfers the following to the Independent Capital Trust:",
        styles["body"]
    ))
    ip_items = [
        "Autonomous Trade Bot — complete codebase (all source code, schemas, documentation)",
        "All 12 trading strategies and their signal logic",
        "OpenClaw BFT — Byzantine Fault Tolerant consensus governance engine",
        "II Agent — autonomous market regime detection system",
        "Autonomous Promotion Engine — gate-based strategy promotion framework",
        "Score-Weighted Capital Allocation System",
        "All derivative works and future improvements",
    ]
    for item in ip_items:
        story.append(Paragraph(f"• {item}", styles["body"]))

    # ── Bitcoin Blockchain Timestamp ───────────────────────────────────────
    story.append(section_header("THE BITCOIN TIMESTAMP — HAL FINNEY MOMENT", styles))

    story.append(highlight_box(
        "<b>\"That's a sign from the Universe.\"</b><br/><br/>"
        "The complete codebase was hashed and submitted to the Bitcoin blockchain via OpenTimestamps "
        "on April 17, 2026. Of the four independent Bitcoin calendar servers that recorded the timestamp, "
        "one bore the name: <b>finney.calendar.eternitywall.com</b> — named after Hal Finney, "
        "the man who received the first Bitcoin transaction in history.",
        styles, GOLD
    ))

    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("<b>The Lineage</b>", styles["subsect"]))
    story.append(Paragraph(
        "Satoshi Nakamoto → Hal Finney (first Bitcoin transaction, January 12, 2009) → "
        "Finney Mainnet (Bittensor named their mainnet in his honor) → "
        "Independent Capital Trust (timestamped on finney.calendar.eternitywall.com, April 17, 2026)",
        styles["body"]
    ))

    story.append(Spacer(1, 0.08*inch))
    story.append(Paragraph("<b>Who Was Hal Finney?</b>", styles["subsect"]))
    story.append(Paragraph(
        "Harold Thomas Finney II (1956–2014) was a world-class cryptographer, PGP Corporation developer, "
        "and early cypherpunk. He was the second person to run the Bitcoin node after Satoshi, and on "
        "January 12, 2009, he received the first Bitcoin transaction in history — 10 BTC from Satoshi "
        "himself. He had previously built RPOW (Reusable Proof of Work) in 2004, a proto-Bitcoin system. "
        "In 2009 — the same year Bitcoin launched — he was diagnosed with ALS. He continued coding Bitcoin "
        "as his body failed, communicating through eye-tracking software in his final years. He died in 2014 "
        "and is cryonically preserved at the Alcor Life Extension Foundation, waiting for science to arrive. "
        "A man who helped birth digital currency — now waiting for the future.",
        styles["body"]
    ))

    story.append(Spacer(1, 0.1*inch))
    story.append(card_table(
        [
            ["Timestamp Detail",    "Value"],
            ["Method",              "OpenTimestamps — Bitcoin blockchain"],
            ["Date",                "April 17, 2026"],
            ["SHA-256 Hash",        "6f214c957a05e0b7ee82ac0907bfdd9f7a04aef34fc89894d07b6986bd9f55b4"],
            ["Calendar Server 1",   "alice.btc.calendar.opentimestamps.org"],
            ["Calendar Server 2",   "bob.btc.calendar.opentimestamps.org"],
            ["Calendar Server 3",   "btc.calendar.catallaxy.com"],
            ["Calendar Server 4",   "finney.calendar.eternitywall.com ⭐"],
            ["Certificate File",    "codebase_snapshot.tar.gz.ots"],
            ["Government Involved", "Zero"],
        ],
        [2.5*inch, 4*inch]
    ))

    # ── Milestone 12 — P&L Summary ─────────────────────────────────────────
    story.append(section_header("MILESTONE 12 — P&L SUMMARY PAGE", styles))
    story.append(Paragraph(
        "The final outstanding milestone from the project plan was completed: a dedicated "
        "P&amp;L Summary page surfaced as a new sidebar entry. The page gives the operator a "
        "complete financial picture of the fleet — by strategy, by trade type, by day/week, "
        "and as a cumulative equity curve.",
        styles["body"]
    ))

    story.append(Spacer(1, 0.08*inch))
    story.append(Paragraph("<b>Backend — /api/pnl/summary</b>", styles["subsect"]))
    story.append(Paragraph(
        "New FastAPI router at /api/pnl/summary returns a single comprehensive payload including: "
        "fleet totals, per-strategy breakdown with mode and win rate, BUY/SELL type comparison, "
        "daily PnL (14 days), weekly PnL (8 weeks), and full cumulative equity series (500 trades).",
        styles["body"]
    ))
    story.append(Paragraph("backend/routers/pnl.py  →  registered in main.py", styles["mono"]))

    story.append(Spacer(1, 0.08*inch))
    story.append(Paragraph("<b>Frontend — P&amp;L Summary Page</b>", styles["subsect"]))
    story.append(card_table(
        [
            ["Section",               "Detail"],
            ["Fleet Hero Cards",      "Total PnL τ/USD · Win Rate · Total Trades · Volume"],
            ["Equity Curve",          "Cumulative area chart — all 500+ trades, green gradient"],
            ["Strategy Leaderboard",  "Ranked table · progress bar · mode badge · PnL share %"],
            ["BUY vs SELL Panel",     "Side-by-side breakdown: trades, WR, avg PnL, volume"],
            ["Daily/Weekly Bar Chart","Toggle view · green/red bars by sign · Recharts"],
            ["Best / Worst Trade",    "Single trade extremes with τ and USD values"],
        ],
        [2.2*inch, 4.3*inch]
    ))
    story.append(Paragraph("frontend/src/pages/PnLSummary.tsx  →  route /pnl  →  sidebar: 'P&L Summary'", styles["mono"]))

    story.append(Spacer(1, 0.08*inch))
    story.append(Paragraph("<b>Fleet Snapshot at Milestone 12 Completion</b>", styles["subsect"]))
    story.append(card_table(
        [
            ["Metric",         "Value"],
            ["Total PnL",      "+0.947 τ  /  $245.66 USD"],
            ["Total Trades",   "1,095 executed"],
            ["Win Rate",       "66.6%  (729W / 366L)"],
            ["Best Trade",     "+0.008128 τ"],
            ["Worst Trade",    "-0.006847 τ"],
            ["Volume",         "$6,018.13 USD"],
        ],
        [2.5*inch, 4*inch]
    ))

    # ── Complete Milestone Registry ────────────────────────────────────────
    story.append(section_header("COMPLETE MILESTONE REGISTRY — ALL SESSIONS", styles))
    story.append(card_table(
        [
            ["#", "Milestone",                                    "Status"],
            ["0",  "PDF Session IX plan",                         "✅ Complete"],
            ["1",  "Session VIII PDF archive",                    "✅ Complete"],
            ["2",  "Persist capital allocations to DB",           "✅ Complete"],
            ["3",  "Autonomous promotion engine",                 "✅ Complete"],
            ["4",  "Scheduled auto-rebalance",                    "✅ Complete"],
            ["5",  "Sentiment Surge promotion — D-13",            "✅ Complete"],
            ["6",  "Alert & notification system",                 "✅ Complete"],
            ["7",  "Paper trade archive decision",                "✅ Complete"],
            ["8",  "UI Polish — Dashboard & Mission Control",     "✅ Complete"],
            ["9",  "UI Polish — Activity Log",                    "✅ Complete"],
            ["10", "Emission Momentum + dTAO is_active fix",      "✅ Complete"],
            ["11", "Session X — P&L Summary view",               "✅ Complete"],
            ["12", "Global status poll fix (Layout.tsx)",         "✅ Complete"],
            ["13", "Independent Capital Trust + Bitcoin timestamp","✅ Complete"],
        ],
        [0.4*inch, 4.4*inch, 1.7*inch]
    ))

    # ── GitHub ──────────────────────────────────────────────────────────────
    story.append(section_header("REPOSITORY STATUS", styles))
    story.append(card_table(
        [
            ["Item",              "Detail"],
            ["Repository",        "github.com/ilovenjc-ship-it/autonomous-trade-bot"],
            ["Branch",            "main"],
            ["Latest Commit",     "48d5f7a — Milestone 12: P&L Summary page"],
            ["Previous Commit",   "9d90973 — Fix: Global status poll in Layout"],
            ["Status",            "Clean — all changes pushed"],
        ],
        [2*inch, 4.5*inch]
    ))

    # ── Closing ─────────────────────────────────────────────────────────────
    story.append(PageBreak())

    closing = Table(
        [[
            Paragraph("INDEPENDENT CAPITAL TRUST", styles["subtitle"]),
            Spacer(1, 0.1*inch),
            Paragraph(
                "Self-governing. Independent. Sovereign. Free. Self-directed.",
                styles["quote"]
            ),
            Spacer(1, 0.15*inch),
            Paragraph(
                "The fleet runs. The trust is established. The code is sealed on Bitcoin.<br/>"
                "Hal Finney's name is on the certificate.<br/>"
                "The lineage is complete.",
                styles["center"]
            ),
            Spacer(1, 0.2*inch),
            divider(GOLD, 1.5),
            Spacer(1, 0.1*inch),
            Paragraph("Satoshi Nakamoto  →  Hal Finney  →  Finney Mainnet  →  Independent Capital Trust", styles["center"]),
            Spacer(1, 0.2*inch),
            Paragraph(f"Session X — April 17, 2026  ·  Filed to The Archives", styles["footer"]),
            Paragraph("autonomous-trade-bot  ·  Finney Mainnet  ·  Independent Capital Trust", styles["footer"]),
        ]],
        colWidths=[7*inch],
    )
    closing.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), NAVY),
        ("ALIGN",        (0,0),(-1,-1), "CENTER"),
        ("TOPPADDING",   (0,0),(-1,-1), 40),
        ("BOTTOMPADDING",(0,0),(-1,-1), 40),
        ("LEFTPADDING",  (0,0),(-1,-1), 30),
        ("RIGHTPADDING", (0,0),(-1,-1), 30),
        ("LINEABOVE",    (0,0),(-1,-1), 2, GOLD),
    ]))
    story.append(closing)

    doc.build(story)
    print(f"✅  Generated: {filename}")


if __name__ == "__main__":
    out = "/workspace/archives/Session_X_The_Sovereignty_Session.pdf"
    build_pdf(out)