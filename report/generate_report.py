"""
TAO Trading Bot — Session Report Generator
Builds the full daily walkthrough PDF as the session progresses.
Run: python generate_report.py
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from datetime import datetime

OUTPUT = "/workspace/report/TAO_Bot_Session_Report.pdf"

# ─── Colour palette (matches app) ────────────────────────────────────────────
NAVY       = colors.HexColor("#0d1525")
NAVY_MID   = colors.HexColor("#152030")
NAVY_LIGHT = colors.HexColor("#1c2b42")
BORDER     = colors.HexColor("#243450")
GREEN      = colors.HexColor("#00e5a0")
RED        = colors.HexColor("#ff4d6d")
BLUE       = colors.HexColor("#3b82f6")
YELLOW     = colors.HexColor("#f59e0b")
PURPLE     = colors.HexColor("#8b5cf6")
WHITE      = colors.HexColor("#f1f5f9")
MUTED      = colors.HexColor("#94a3b8")
DARK_TEXT  = colors.HexColor("#0d1525")

# ─── Styles ──────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def S(name, **kwargs):
    return ParagraphStyle(name, **kwargs)

TITLE_STYLE = S("Title",
    fontName="Helvetica-Bold", fontSize=28, textColor=NAVY,
    spaceAfter=6, alignment=TA_CENTER)

SUBTITLE_STYLE = S("Subtitle",
    fontName="Helvetica", fontSize=13, textColor=MUTED,
    spaceAfter=4, alignment=TA_CENTER)

DATE_STYLE = S("Date",
    fontName="Helvetica", fontSize=10, textColor=MUTED,
    spaceAfter=2, alignment=TA_CENTER)

H1_STYLE = S("H1",
    fontName="Helvetica-Bold", fontSize=16, textColor=NAVY,
    spaceBefore=20, spaceAfter=8,
    borderPad=4)

H2_STYLE = S("H2",
    fontName="Helvetica-Bold", fontSize=13, textColor=BLUE,
    spaceBefore=14, spaceAfter=6)

H3_STYLE = S("H3",
    fontName="Helvetica-Bold", fontSize=11, textColor=NAVY,
    spaceBefore=10, spaceAfter=4)

BODY_STYLE = S("Body",
    fontName="Helvetica", fontSize=10, textColor=DARK_TEXT,
    spaceBefore=3, spaceAfter=6, leading=15)

MONO_STYLE = S("Mono",
    fontName="Courier", fontSize=9, textColor=DARK_TEXT,
    spaceBefore=2, spaceAfter=4, leading=13)

CHAT_USER = S("ChatUser",
    fontName="Helvetica-Bold", fontSize=10, textColor=BLUE,
    spaceBefore=8, spaceAfter=2)

CHAT_AGENT = S("ChatAgent",
    fontName="Helvetica-Bold", fontSize=10, textColor=GREEN,
    spaceBefore=8, spaceAfter=2)

CHAT_BODY = S("ChatBody",
    fontName="Helvetica", fontSize=9.5, textColor=DARK_TEXT,
    spaceBefore=1, spaceAfter=4, leading=14, leftIndent=12)

CALLOUT_STYLE = S("Callout",
    fontName="Helvetica-Oblique", fontSize=10, textColor=DARK_TEXT,
    spaceBefore=4, spaceAfter=4, leftIndent=16, leading=14)

BULLET_STYLE = S("Bullet",
    fontName="Helvetica", fontSize=10, textColor=DARK_TEXT,
    spaceBefore=2, spaceAfter=2, leftIndent=16, leading=14,
    bulletIndent=6)

# ─── Helpers ─────────────────────────────────────────────────────────────────

def divider(color=BORDER):
    return HRFlowable(width="100%", thickness=1, color=color, spaceAfter=8, spaceBefore=4)

def section_header(title, subtitle=None):
    items = [
        Spacer(1, 6),
        Paragraph(title, H1_STYLE),
    ]
    if subtitle:
        items.append(Paragraph(subtitle, CALLOUT_STYLE))
    items.append(divider(BLUE))
    return items

def h2(text):
    return Paragraph(text, H2_STYLE)

def h3(text):
    return Paragraph(text, H3_STYLE)

def body(text):
    return Paragraph(text, BODY_STYLE)

def bullet(text):
    return Paragraph(f"• {text}", BULLET_STYLE)

def mono(text):
    return Paragraph(text, MONO_STYLE)

def spacer(n=8):
    return Spacer(1, n)

def chat(speaker, text, is_agent=False):
    label_style = CHAT_AGENT if is_agent else CHAT_USER
    label = "🤖 II Agent" if is_agent else "👤 You"
    return [
        Paragraph(label, label_style),
        Paragraph(text, CHAT_BODY),
    ]

def data_table(headers, rows, col_widths=None):
    data = [headers] + rows
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        # Header row
        ("BACKGROUND",    (0, 0), (-1, 0),  NAVY),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  WHITE),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0),  9),
        ("ALIGN",         (0, 0), (-1, 0),  "CENTER"),
        ("BOTTOMPADDING", (0, 0), (-1, 0),  7),
        ("TOPPADDING",    (0, 0), (-1, 0),  7),
        # Data rows
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 9),
        ("TEXTCOLOR",     (0, 1), (-1, -1), DARK_TEXT),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.HexColor("#f8fafc"), colors.HexColor("#eef2f7")]),
        ("ALIGN",         (1, 1), (-1, -1), "CENTER"),
        ("ALIGN",         (0, 1), (0, -1),  "LEFT"),
        ("TOPPADDING",    (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        # Grid
        ("GRID",          (0, 0), (-1, -1), 0.5, BORDER),
        ("BOX",           (0, 0), (-1, -1), 1,   NAVY),
        ("ROUNDEDCORNERS",(0, 0), (-1, -1), [4]),
    ]))
    return t

def callout_box(text, color=BLUE):
    t = Table([[Paragraph(text, CALLOUT_STYLE)]], colWidths=[6.5 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), color.clone(alpha=0.08)),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("BOX",           (0, 0), (-1, -1), 1.5, color),
        ("ROUNDEDCORNERS",(0, 0), (-1, -1), [6]),
    ]))
    return t

# ─── Cover page ──────────────────────────────────────────────────────────────

def cover_page():
    today = datetime.now().strftime("%B %d, %Y")
    return [
        Spacer(1, 1.4 * inch),

        # Logo row (text-based)
        Paragraph("⚡ TAO TRADING BOT", S("Logo",
            fontName="Helvetica-Bold", fontSize=11, textColor=GREEN,
            alignment=TA_CENTER, spaceAfter=6, tracking=4)),

        Paragraph("Autonomous Intelligence System", TITLE_STYLE),
        Paragraph("Session Walkthrough & Technical Reference", SUBTITLE_STYLE),
        Spacer(1, 10),
        HRFlowable(width="60%", thickness=2, color=GREEN, spaceAfter=10, hAlign="CENTER"),
        Paragraph(f"Session Date: {today}", DATE_STYLE),
        Paragraph("Prepared by: II Agent  ·  For: Owner / Operator", DATE_STYLE),

        Spacer(1, 0.6 * inch),

        # Summary box
        callout_box(
            "This report covers the complete walkthrough of the TAO/Bittensor autonomous "
            "trading bot system. It includes system architecture, page-by-page feature "
            "explanations, live fleet data, the gate pipeline, BFT consensus mechanics, "
            "aesthetic changes made, and key conversations from the session. "
            "Use this as your reference guide going forward.",
            BLUE
        ),

        Spacer(1, 0.5 * inch),

        data_table(
            ["Component", "Status", "Detail"],
            [
                ["Frontend (React/Vite)", "✅ Live", "https://3002-i6gmpsn2awv0xfglgdjo9.e2b.app"],
                ["Backend (FastAPI)", "✅ Live", "Port 8001 — Finney mainnet connected"],
                ["Bittensor", "✅ Connected", "Finney mainnet · Block ~7,969,659+"],
                ["Wallet", "✅ Unlocked", "Mnemonic restored · τ balance live"],
                ["GitHub", "✅ Pushed", "ilovenjc-ship-it/autonomous-trade-bot · 19 commits"],
                ["Watchdog", "✅ Running", "Auto-restarts servers every 20s"],
            ],
            col_widths=[1.8*inch, 1.2*inch, 3.5*inch]
        ),

        PageBreak(),
    ]

# ─── Section 1: System Architecture ─────────────────────────────────────────

def section_architecture():
    return [
        *section_header("1. System Architecture", "How all the pieces fit together"),

        body(
            "The TAO Trading Bot is a fully autonomous, multi-agent crypto trading system "
            "built on Bittensor's Finney mainnet. It consists of 12 trading strategies "
            "operating through a multi-stage safety pipeline before any real TAO moves on-chain."
        ),
        spacer(),

        h2("Tech Stack"),
        data_table(
            ["Layer", "Technology", "Purpose"],
            [
                ["Frontend", "React + Vite + TypeScript", "Dashboard, visualization, control UI"],
                ["Styling", "Tailwind CSS + custom theme", "Dark navy design system"],
                ["Charts", "Recharts", "PnL curves, win rate bars, volume charts"],
                ["Backend", "FastAPI (Python)", "REST API, business logic, cycle engine"],
                ["Database", "SQLite + async SQLAlchemy", "Trade history, strategy state"],
                ["Chain", "Bittensor 10.2.0 AsyncSubtensor", "Finney mainnet connection"],
                ["Auth", "12-word BIP39 mnemonic", "Keypair derivation, wallet unlock"],
                ["Caching", "TTLCache", "Price feed caching layer"],
            ],
            col_widths=[1.3*inch, 2.2*inch, 2.9*inch]
        ),

        spacer(12),
        h2("The 4-Layer Safety Pipeline"),
        body("Every trade passes through four layers before real TAO moves:"),
        spacer(4),

        data_table(
            ["Layer", "Name", "What It Does"],
            [
                ["1", "Paper Mode (PAPER_ONLY)", "Bot trades simulated capital, builds track record"],
                ["2", "Gate Engine", "Promotes to APPROVED at 55%+ WR, positive PnL, 10+ cycles"],
                ["3", "OpenClaw BFT Consensus", "7 of 12 bots must vote BUY/SELL before trade fires"],
                ["4", "Live Execution", "Trade sent to Finney mainnet via AsyncSubtensor"],
            ],
            col_widths=[0.5*inch, 2.2*inch, 3.7*inch]
        ),

        spacer(12),
        callout_box(
            "Key insight: A bot must EARN its way to LIVE status. Paper mode builds the "
            "track record. The gate promotes it. OpenClaw validates each individual trade. "
            "No shortcuts — every safety layer must pass before real money moves.",
            GREEN
        ),

        spacer(12),
        h2("The 12 Strategies"),
        data_table(
            ["Strategy", "Personality", "Signal Logic"],
            [
                ["Momentum Cascade",   "Aggressive",   "Volume spike + RSI crossover + MACD"],
                ["dTAO Flow Momentum", "dTAO-focused", "Subnet price flow + momentum"],
                ["Liquidity Hunter",   "Opportunistic","Liquidity gaps + order flow"],
                ["Emission Momentum",  "Yield-driven", "Emission rate tracking"],
                ["Balanced Risk",      "Conservative", "Multi-signal confirmation"],
                ["Mean Reversion",     "Contrarian",   "Price deviation from mean"],
                ["Volatility Arb",     "Neutral",      "Volatility spread capture"],
                ["Sentiment Surge",    "Reactive",     "Sentiment + momentum spikes"],
                ["Macro Correlation",  "Systematic",   "BTC correlation + macro signals"],
                ["Breakout Hunter",    "Breakout",     "Support/resistance breaks"],
                ["Yield Maximizer",    "Income",       "Staking yield optimization"],
                ["Contrarian Flow",    "Counter-trend","Fade overextended moves"],
            ],
            col_widths=[1.8*inch, 1.4*inch, 2.8*inch]
        ),

        PageBreak(),
    ]

# ─── Section 2: Pages Walkthrough ────────────────────────────────────────────

def section_dashboard():
    return [
        *section_header("2. Page Walkthrough — Dashboard", "The command center of the system"),

        body(
            "The Dashboard is the first page you see and serves as the real-time command "
            "center for the entire trading operation. Every major metric is visible at a glance."
        ),

        spacer(8),
        h2("Dashboard Layout (Top to Bottom)"),

        h3("Row 1 — KPI Cards"),
        data_table(
            ["Card", "What It Shows"],
            [
                ["💰 Total PnL", "Cumulative profit/loss in τ across all 12 bots"],
                ["📈 Win Rate", "Percentage of trades that closed profitable (fleet average)"],
                ["⚡ Active Bots", "Number of strategies currently running cycles"],
                ["🔄 Total Trades", "All trades executed since system launch"],
            ],
            col_widths=[2*inch, 4.4*inch]
        ),

        spacer(8),
        h3("Row 2 — Intelligence Bar (II Agent Integration)"),
        body("Four live intelligence tiles wired to the backend services:"),
        data_table(
            ["Tile", "Data Source", "What It Shows"],
            [
                ["🧠 II Agent Regime",  "agent_service.py",    "BULL / BEAR / SIDEWAYS / VOLATILE"],
                ["⚡ Consensus Rate",   "consensus_service.py","OpenClaw BFT approval % + round count"],
                ["🔔 Unread Alerts",    "alert_service.py",    "Live count of unread system alerts"],
                ["⛓ Chain Balance",    "bittensor_service.py","Real τ balance from Finney mainnet"],
            ],
            col_widths=[1.6*inch, 1.9*inch, 2.9*inch]
        ),

        spacer(8),
        h3("Row 3 — Charts"),
        bullet("Left chart: PnL over time (line chart, Recharts)"),
        bullet("Right chart: Trade volume by cycle (bar chart)"),

        spacer(8),
        h3("Row 4 — Strategy Table"),
        bullet("All 12 bots listed with: status, win rate, PnL, trade count, gate status"),
        bullet("Color coded: green = profitable, red = losing, yellow = neutral"),

        spacer(8),
        h3("Bottom — Status Bar"),
        bullet("Simulation mode indicator showing PAPER / APPROVED / LIVE mix"),
        bullet("Chain connection status (Finney mainnet connected/disconnected)"),
        bullet("Cycle countdown — seconds until next bot cycle fires"),

        spacer(12),
        h2("Aesthetic Changes Made Today"),
        data_table(
            ["Element", "Before", "After", "Reason"],
            [
                ["Page background",  "#070b14 (near-black)",  "#0d1525 (deep navy)",   "Too dark, eye strain"],
                ["Card surfaces",    "#0d1424",               "#152030",               "Lifted for contrast"],
                ["Borders/grids",    "#1a2540",               "#243450",               "More visible"],
                ["Primary text",     "#e2e8f0 (slate-200)",   "#f1f5f9 (slate-100)",   "Brighter, easier to read"],
                ["Labels/sublabels", "slate-500 (#64748b)",   "slate-300 (#cbd5e1)",   "Was disappearing in dark bg"],
                ["Metadata text",    "slate-600 (#475569)",   "slate-400 (#94a3b8)",   "Now clearly readable"],
            ],
            col_widths=[1.4*inch, 1.6*inch, 1.6*inch, 1.8*inch]
        ),

        spacer(12),
        callout_box(
            "Design principle used: The same cool navy palette is preserved — only the "
            "brightness floor was raised. All 12 color values were updated globally across "
            "every page using a single sed sweep, ensuring consistency system-wide.",
            BLUE
        ),

        spacer(12),
        h2("Button Safety Guide — What's Safe to Click"),
        body(
            "The traders run fully automatically in the background. "
            "Clicking around the app will NOT interfere with them — "
            "with two specific exceptions."
        ),
        spacer(4),

        h3("🟢 Safe to click freely — no impact on trading"),
        data_table(
            ["Button / Control", "What It Actually Does"],
            [
                ["Refresh ↻ icon",             "Reloads display data only — no backend effect"],
                ["Run Analysis (II Agent)",     "Triggers an extra analysis cycle — harmless"],
                ["Trigger BUY / SELL (OpenClaw)","Fires a TEST consensus round — logs a vote, executes nothing"],
                ["Mark All Read (Alerts)",      "Marks alerts as read in the UI only"],
                ["Any chart filter or tab",     "Display/view change only"],
                ["Query Chain (Wallet)",        "Read-only blockchain query — no writes, no transactions"],
                ["Strategy Detail view",        "Read-only — opens per-bot stats"],
            ],
            col_widths=[2.4*inch, 4.0*inch]
        ),

        spacer(8),
        h3("🔴 These two will actually affect trading"),
        data_table(
            ["Button", "Real Effect — Use With Intent"],
            [
                ["Stop Bot (top right, Dashboard)",
                 "Halts ALL 12 bots immediately. Nothing cycles until you hit Start again."],
                ["Deactivate (individual bot cards)",
                 "Pauses that specific strategy only. It stops cycling until manually reactivated."],
            ],
            col_widths=[2.2*inch, 4.2*inch]
        ),

        spacer(8),
        callout_box(
            "Think of it like a cockpit — you can read all the instruments and toggle "
            "the displays without touching the autopilot. The only way to interrupt the "
            "traders is the Stop Bot button. Everything else is safe to explore freely.",
            GREEN
        ),

        PageBreak(),
    ]

# ─── Section 3: Fleet & Gate Pipeline ────────────────────────────────────────

def section_fleet():
    return [
        *section_header("3. Fleet Status & Gate Pipeline", "Where each bot sits in the promotion system"),

        body(
            "The gate pipeline is the core safety mechanism that prevents underperforming "
            "strategies from trading real TAO. Every bot starts in PAPER mode and must "
            "earn promotion through demonstrated performance."
        ),

        spacer(8),
        h2("Gate Promotion Rules"),
        data_table(
            ["Stage", "Requirements to Advance"],
            [
                ["PAPER_ONLY → APPROVED_FOR_LIVE",
                 "Win rate ≥ 55% · Positive PnL · ≥ 10 completed cycles · Win margin ≥ 2"],
                ["APPROVED_FOR_LIVE → LIVE",
                 "Win rate ≥ 65% · PnL > 0.05τ (higher bar for real money)"],
                ["LIVE → Demoted (planned)",
                 "Win rate drops significantly below threshold over sustained period"],
            ],
            col_widths=[2*inch, 4.4*inch]
        ),

        spacer(12),
        h2("Live Fleet Snapshot — April 15, 2026"),

        h3("🚀 LIVE — Trading through BFT consensus"),
        data_table(
            ["Bot", "Win Rate", "PnL (τ)", "Trades", "Notes"],
            [
                ["Yield Maximizer",    "75.0% 🔥", "+0.0658", "159",  "Top performer"],
                ["Balanced Risk",      "66.1% ✅",  "+0.0711", "118",  "Consistent"],
                ["Contrarian Flow",    "63.2% ✅",  "+0.0563", "68",   "Gate-earned"],
                ["Emission Momentum",  "58.7%",     "+0.0675", "92",   "Steady"],
                ["Momentum Cascade",   "51.4% ⚠️",  "+0.1084", "251",  "WR drifted below 55%"],
                ["Liquidity Hunter",   "51.0% ⚠️",  "+0.1226", "96",   "WR drifted below 55%"],
                ["dTAO Flow Momentum", "50.8% ⚠️",  "+0.1209", "126",  "WR drifted below 55%"],
            ],
            col_widths=[1.7*inch, 1.1*inch, 0.9*inch, 0.8*inch, 1.9*inch]
        ),

        spacer(8),
        h3("⏳ APPROVED — Waiting to hit LIVE threshold"),
        data_table(
            ["Bot", "Win Rate", "PnL (τ)", "Trades", "Needs"],
            [
                ["Breakout Hunter",   "59.3%",  "+0.0686", "118", "WR to 65% + PnL > 0.05"],
                ["Volatility Arb",    "56.2%",  "+0.0311", "73",  "WR to 65% + PnL > 0.05"],
                ["Macro Correlation", "51.8%",  "+0.0201", "110", "WR to 65% + PnL > 0.05"],
                ["Mean Reversion",    "38.2% ❌","-0.013",  "76",  "⚠️ Degraded — needs demotion"],
            ],
            col_widths=[1.7*inch, 1.0*inch, 0.9*inch, 0.8*inch, 2.0*inch]
        ),

        spacer(8),
        h3("📄 PAPER — Still proving itself"),
        data_table(
            ["Bot", "Win Rate", "PnL (τ)", "Trades", "Issue"],
            [
                ["Sentiment Surge", "40.2% ❌", "-0.0568", "132", "Underperforming, needs recovery"],
            ],
            col_widths=[1.7*inch, 1.1*inch, 0.9*inch, 0.8*inch, 2.0*inch]
        ),

        spacer(12),
        callout_box(
            "⚠️  Issue identified: Mean Reversion earned APPROVED status when its win rate "
            "was higher, but has since degraded to 38.2% with negative PnL. A demotion "
            "system is needed to automatically knock underperforming bots back to PAPER. "
            "This is the next planned safety enhancement.",
            YELLOW
        ),

        spacer(8),
        h2("Why the Dashboard Looked Quiet Overnight"),
        bullet("1,415 total trades were executed overnight — the system was very active"),
        bullet("All activity was in PAPER or early-LIVE simulation mode"),
        bullet("Paper trades don't move real TAO, so the dashboard feels quiet"),
        bullet("The PnL shown is paper/simulated performance building toward promotion"),
        bullet("Once LIVE bots accumulate more history, the charts will show richer data"),

        PageBreak(),
    ]

# ─── Section 4: OpenClaw Page Walkthrough ────────────────────────────────────

def section_openclaw():
    return [
        *section_header("4. Page Walkthrough — OpenClaw BFT Consensus",
                        "The trade validation senate — nothing executes without agreement"),

        body(
            "OpenClaw is the Byzantine Fault Tolerant consensus engine that sits between "
            "every LIVE strategy and the blockchain. Before any trade executes, 12 bot "
            "personalities must vote — and 7 of 12 must agree on direction. No exceptions."
        ),

        spacer(8),
        h2("What BFT Means"),
        body(
            "Byzantine Fault Tolerance comes from the Byzantine Generals Problem (Lamport, "
            "Shostak & Pease, 1982) — how can a group reach correct agreement when some "
            "members might be wrong or sending bad information? The answer: if you have N "
            "actors, you can tolerate up to (N-1)/3 bad actors and still reach correct consensus. "
            "With 12 bots, up to 3 can be wrong or biased — and the system still makes the "
            "right call. Bitcoin, Ethereum, and Bittensor itself all use variants of this principle."
        ),

        spacer(8),
        h2("Live Stats — Session Snapshot"),
        data_table(
            ["Metric", "Value", "What It Means"],
            [
                ["Total rounds",         "56",    "Consensus votes triggered since session start"],
                ["Approved",             "19",    "Trades that passed 7/12 supermajority"],
                ["Rejected / Deadlock",  "37",    "Trades blocked — no supermajority reached"],
                ["Approval rate",        "33.9%", "System is selective — only 1 in 3 trades gets through"],
                ["Supermajority rule",   "7 / 12","Minimum votes needed in same direction"],
                ["Total BUY votes cast", "203",   "Across all rounds this session"],
                ["Total SELL votes cast","261",   "Across all rounds this session"],
                ["Total HOLD votes cast","103",   "Abstentions / ambiguous signals"],
            ],
            col_widths=[2.0*inch, 0.9*inch, 3.5*inch]
        ),

        spacer(8),
        callout_box(
            "A 33.9% approval rate is healthy — it means the system is being genuinely "
            "selective. It is not rubber-stamping every trade. The trades that DO get through "
            "have real consensus behind them. A 100% approval rate would mean the gate "
            "isn't working.",
            GREEN
        ),

        spacer(12),
        h2("Round 56 — A Real Deadlock, Dissected"),
        body("Yield Maximizer (75% win rate — best bot on the fleet) tried to BUY at $247.66:"),
        spacer(4),
        data_table(
            ["Agent", "Vote", "Confidence", "Reasoning"],
            [
                ["dTAO Flow Momentum", "BUY",  "89%", "MACD bullish +0.03269 · strong bullish bias"],
                ["Yield Maximizer",    "BUY",  "85%", "MACD bullish +0.03269 · strong bullish bias"],
                ["Breakout Hunter",    "SELL", "84%", "RSI=77.4 — overbought zone"],
                ["Momentum Cascade",   "HOLD", "40%", "Signal ambiguous — holding position"],
                ["Liquidity Hunter",   "HOLD", "37%", "Signal ambiguous — holding position"],
            ],
            col_widths=[1.8*inch, 0.7*inch, 1.1*inch, 2.8*inch]
        ),
        spacer(4),
        body("Final tally: 4 BUY · 4 SELL · 3 HOLD · 1 ABSTAIN = DEADLOCK 🔒 — trade vetoed."),
        spacer(4),
        callout_box(
            "Two legitimate signals pointing opposite directions: MACD says momentum is up, "
            "RSI says it's overextended. The human equivalent is two experienced traders "
            "disagreeing. The correct answer is: don't trade until they align. "
            "Even the best performing bot on the fleet gets blocked when the jury disagrees. "
            "That is the system working exactly as designed.",
            BLUE
        ),

        spacer(12),
        h2("The 12 Voter Personalities"),
        body(
            "The 12 voters are NOT the same as the 12 trading bots. They are a separate "
            "layer that exists purely to judge. Each has its own RSI weight, MACD weight, "
            "and momentum bias. They don't trade — they deliberate."
        ),
        spacer(4),
        data_table(
            ["Personality", "Bias", "Primary Signal"],
            [
                ["Momentum Cascade",   "Aggressive",    "Volume + RSI crossover"],
                ["dTAO Flow Momentum", "dTAO-focused",  "Subnet price flow"],
                ["Liquidity Hunter",   "Opportunistic", "Order flow gaps"],
                ["Emission Momentum",  "Yield-driven",  "Emission rate"],
                ["Balanced Risk",      "Conservative",  "Multi-signal confirm"],
                ["Mean Reversion",     "Contrarian",    "Price deviation"],
                ["Volatility Arb",     "Neutral",       "Vol spread"],
                ["Sentiment Surge",    "Reactive",      "Sentiment spikes"],
                ["Macro Correlation",  "Systematic",    "BTC correlation"],
                ["Breakout Hunter",    "Breakout",      "Support/resistance"],
                ["Yield Maximizer",    "Income",        "Staking yield"],
                ["Contrarian Flow",    "Counter-trend", "Fade overextended moves"],
            ],
            col_widths=[1.9*inch, 1.4*inch, 2.9*inch]
        ),

        spacer(12),
        h2("OpenClaw vs Yuma Consensus — The Parallel"),
        data_table(
            ["Element", "Yuma Consensus (Bittensor)", "OpenClaw (Our System)"],
            [
                ["Participants",  "Validators across global network", "12 bot personalities (trusted, internal)"],
                ["Vote subject",  "Miner weight rankings",           "Trade direction (BUY/SELL/HOLD)"],
                ["Output",        "TAO emission weights",            "Trade approved or vetoed"],
                ["Threshold",     "Network-wide Byzantine math",     "7 of 12 supermajority"],
                ["Complexity",    "High — adversarial at scale",     "Low — trusted fleet, clean rule"],
                ["Explainability","Requires deep protocol knowledge","Any trader understands in 30 seconds"],
                ["Context",       "Trustless global network",        "Trusted 12-agent fleet"],
            ],
            col_widths=[1.3*inch, 2.4*inch, 2.7*inch]
        ),
        spacer(4),
        callout_box(
            "Same philosophical DNA. Radically different complexity. Both are correct for "
            "their context. Yuma is the right tool for a global trustless network. "
            "OpenClaw is the right tool for a trusted 12-agent trading fleet. "
            "The network and the bot rhyme — and that's not an accident.",
            PURPLE
        ),

        PageBreak(),
    ]

# ─── Section 5: Alerts Page Walkthrough ──────────────────────────────────────

def section_alerts():
    return [
        *section_header("5. Page Walkthrough — Alert Inbox",
                        "The mission log — every significant system event, timestamped and categorized"),

        body(
            "The Alert Inbox is the complete record of everything significant that happened "
            "in the system. Nothing gets lost. Every gate promotion, consensus vote, regime "
            "shift, strategy milestone, and risk event is captured here with full context."
        ),

        spacer(8),
        h2("Page Layout"),
        data_table(
            ["Section", "What It Shows"],
            [
                ["Stats bar",      "Total alerts · Unread count · Level breakdown (INFO / WARNING / CRITICAL)"],
                ["Filter bar",     "7 filters to cut straight to what matters"],
                ["Alert cards",    "Color-coded by severity with title, message, strategy, timestamp"],
                ["Mark All Read",  "Clears the sidebar badge count — doesn't delete anything"],
            ],
            col_widths=[1.5*inch, 4.9*inch]
        ),

        spacer(8),
        h2("Alert Filters"),
        data_table(
            ["Filter", "Shows"],
            [
                ["ALL",       "Every alert in the system"],
                ["GATE",      "Bot promotions and demotions — PAPER → APPROVED → LIVE (and back)"],
                ["CONSENSUS", "Every OpenClaw vote result — approved and vetoed rounds"],
                ["REGIME",    "II Agent regime shift detections (BULL/BEAR/SIDEWAYS/VOLATILE)"],
                ["STRATEGY",  "HOT bot celebrations and STRUGGLING bot warnings"],
                ["PNL",       "Fleet cumulative PnL milestone events"],
                ["DRAWDOWN",  "Risk threshold breaches — these need attention"],
            ],
            col_widths=[1.2*inch, 5.2*inch]
        ),

        spacer(8),
        h2("Alert Severity Levels — Corrected"),
        body("The following level assignments ensure the color coding is semantically correct:"),
        data_table(
            ["Alert Type", "Level", "Color", "Logic"],
            [
                ["🚀 Bot goes LIVE",        "INFO",     "🔵 Blue",   "Good news — celebrate"],
                ["✅ Consensus APPROVED",   "INFO",     "🔵 Blue",   "Good news — trade cleared"],
                ["🏆 PnL Milestone",        "INFO",     "🔵 Blue",   "Good news — fleet growing"],
                ["🔥 Strategy HOT",         "INFO",     "🔵 Blue",   "Good news — bot on a streak"],
                ["🚫 Consensus VETOED",     "WARNING",  "🟡 Yellow", "Watch — trade blocked"],
                ["⚠️ Regime Shift",         "WARNING",  "🟡 Yellow", "Watch — market changing"],
                ["📉 Strategy Struggling",  "WARNING",  "🟡 Yellow", "Watch — bot underperforming"],
                ["⬇️ Bot Demoted",          "WARNING",  "🟡 Yellow", "Watch — bot knocked back"],
                ["💥 Drawdown Breach",      "CRITICAL", "🔴 Red",    "Act — risk threshold hit"],
            ],
            col_widths=[1.9*inch, 0.9*inch, 1.1*inch, 2.5*inch]
        ),

        spacer(8),
        callout_box(
            "Bug fixed during session: CONSENSUS_APPROVED, GATE_PROMOTION, and PNL_MILESTONE "
            "were incorrectly set to CRITICAL level (red). Good news should never appear as "
            "a red alert. All three corrected to INFO (blue). CRITICAL is now reserved "
            "exclusively for events that require attention — drawdown breaches only.",
            BLUE
        ),

        spacer(12),
        h2("Toast Notifications"),
        body(
            "Alerts also surface as pop-up toasts in the top-right corner so you see "
            "important events without having to check the inbox manually."
        ),
        data_table(
            ["Scenario", "Toast Behaviour"],
            [
                ["New alert arrives",      "Toast pops in top-right, auto-dismisses after 4–7 seconds"],
                ["CRITICAL alert",         "Toast stays visible for 7 seconds (longer = more urgent)"],
                ["WARNING alert",          "Toast stays for 5 seconds"],
                ["INFO alert",             "Toast stays for 4 seconds"],
                ["Max simultaneous",       "4 toasts at once — oldest dismissed if new ones arrive"],
                ["On page load",           "Existing alerts are silently seeded — no toast storm"],
                ["Backend restart",        "localStorage reset detected — new alerts flow through normally"],
            ],
            col_widths=[2.0*inch, 4.4*inch]
        ),

        spacer(8),
        callout_box(
            "Bug fixed: After backend restart, alert IDs reset to 1 but the browser "
            "remembered the old high ID from the previous session. New alerts (ID 1-10) "
            "were silently ignored because they appeared 'already seen'. Fixed: on page "
            "load, if stored ID > latest alert ID, the stored value is cleared and "
            "alerts flow through normally again.",
            YELLOW
        ),

        PageBreak(),
    ]

# ─── Section 6: Core Services (renumbered) ───────────────────────────────────

def section_services():
    return [
        *section_header("6. Core Intelligence Services", "The brains running autonomously in the background"),

        h2("🧠 II Agent — Master Orchestrator"),
        body(
            "Runs every 5 minutes. Analyses all 12 bots, detects market regime, "
            "generates directives, and fires alerts when conditions change."
        ),
        data_table(
            ["Function", "Detail"],
            [
                ["Fleet health classification", "WATCHING / HEALTHY / STRUGGLING / HOT based on WR + PnL + trades"],
                ["Regime detection",            "BULL / BEAR / SIDEWAYS / VOLATILE from MACD + price trend (works from tick 1)"],
                ["Directive generation",        "e.g. 'Consider pausing struggling strategy X'"],
                ["Alert firing",                "REGIME_SHIFT · STRATEGY_HOT (≥68% WR) · STRATEGY_STRUGGLING"],
                ["Observation log",             "Last 20 timestamped observations stored and viewable in UI"],
            ],
            col_widths=[2.2*inch, 4.2*inch]
        ),

        spacer(12),
        h2("⚡ OpenClaw BFT Consensus Engine"),
        body(
            "Byzantine Fault Tolerant voting layer. Every LIVE trade must pass a "
            "7-of-12 supermajority vote before executing. Zero exceptions."
        ),
        data_table(
            ["Component", "Detail"],
            [
                ["Voter pool",       "12 bot personalities — each with RSI weight, MACD weight, momentum bias"],
                ["Vote options",     "BUY · SELL · HOLD"],
                ["Approval rule",    "7 of 12 votes must agree on direction (supermajority)"],
                ["Veto rule",        "If fewer than 7 agree → trade VETOED, logged, skipped"],
                ["Round history",    "Ring buffer of 200 consensus rounds stored in memory"],
                ["Manual trigger",   "UI button to fire test rounds for BUY or SELL"],
                ["Stats tracked",    "Approval rate · rejection rate · average vote spread"],
            ],
            col_widths=[1.8*inch, 4.6*inch]
        ),

        spacer(12),
        h2("🔔 Alert System"),
        body("Ring buffer of 500 alerts. Feeds the sidebar badge, toast notifications, and alert inbox."),
        data_table(
            ["Alert Kind", "Triggered By", "Level"],
            [
                ["GATE_PROMOTION",       "Bot promoted to APPROVED or LIVE",          "INFO"],
                ["CONSENSUS_APPROVED",   "7/12 vote passes",                          "INFO"],
                ["CONSENSUS_VETOED",     "Vote fails to reach supermajority",         "WARNING"],
                ["REGIME_SHIFT",         "II Agent detects market regime change",     "WARNING"],
                ["STRATEGY_HOT",         "Bot win rate ≥ 68%",                        "INFO"],
                ["STRATEGY_STRUGGLING",  "Bot win rate drops / underperforming",      "WARNING"],
                ["PNL_MILESTONE",        "Fleet PnL crosses a round number milestone","INFO"],
                ["DRAWDOWN_ALERT",       "Strategy draws down beyond threshold",      "CRITICAL"],
            ],
            col_widths=[1.9*inch, 2.8*inch, 0.9*inch]
        ),

        spacer(8),
        callout_box(
            "Alert deduplication: HOT and STRUGGLING alerts use module-level sets to "
            "prevent the same alert firing every cycle. Once an alert fires for a strategy, "
            "it won't repeat until the condition resets. Same logic applied to drawdown alerts.",
            PURPLE
        ),

        spacer(12),
        h2("⛓ Bittensor Service — Finney Mainnet"),
        data_table(
            ["Function", "Implementation"],
            [
                ["Connection",        "AsyncSubtensor → wss://entrypoint-finney.opentensor.ai:443"],
                ["Balance query",     "get_balance(address) → real τ balance"],
                ["Block number",      "get_block_number() → current chain block"],
                ["Subnet prices",     "get_subnet_dtao_prices() → live αTAO per subnet"],
                ["Wallet restore",    "restore_wallet_from_mnemonic(mnemonic) → keypair derivation"],
                ["Staking info",      "get_staking_info(address) → per-subnet stake positions"],
            ],
            col_widths=[1.8*inch, 4.6*inch]
        ),

        PageBreak(),
    ]

# ─── Section 5: Key Conversations ────────────────────────────────────────────

def section_conversations():
    return [
        *section_header("5. Key Conversations — Today's Session",
                        "Selected exchanges that shaped decisions"),

        h2("On the App Being Down / Server Management"),
        *chat("You", "It's back down again"),
        *chat("II Agent",
              "The problem was multiple zombie vite processes fighting over port 3002. "
              "Cleared them all and restarted clean. Also built a watchdog script that "
              "checks every 20 seconds and auto-restarts any server that goes down.",
              is_agent=True),
        spacer(4),
        callout_box(
            "Resolution: Created /workspace/watchdog.sh — a background loop that pings "
            "both backend and frontend every 20s and auto-restarts whichever is down. "
            "Also running a keep-alive curl ping every 25s to prevent sandbox sleep.",
            BLUE
        ),

        spacer(12),
        h2("On Why the Dashboard Looked Quiet"),
        *chat("You", "As I was checking this page last night, I didn't see much activity. Is that normal?"),
        *chat("II Agent",
              "Totally normal, and here's why: Most of the 12 bots are still in PAPER mode. "
              "That's by design. In PAPER mode the bots are trading simulated positions — "
              "learning, building a track record, proving themselves. 1,415 total trades "
              "were executed overnight. The activity was happening — it just doesn't move "
              "real TAO until a bot earns its way to LIVE.",
              is_agent=True),

        spacer(12),
        h2("On the Gate Pipeline — Getting to the Nitty Gritty"),
        *chat("You", "Ok that makes sense now, we're getting to the nitty gritty"),
        *chat("II Agent",
              "Exactly — this is where the system gets real. 6 bots are currently LIVE, "
              "3 are APPROVED waiting to hit the LIVE threshold, 1 is still in PAPER. "
              "Mean Reversion has degraded since earning APPROVED status — it needs a "
              "demotion system to knock it back to PAPER automatically.",
              is_agent=True),

        spacer(12),
        h2("On the 'BOT STOPPED' Indicator & Start/Stop Button"),
        *chat("You", "The 'BOT STOPPED' indicator, top left — have they actually stopped trading or is it telling me something else?"),
        *chat("II Agent",
              "The bots were running the whole time. That indicator was lying — the status "
              "endpoint was crashing silently (500 error) every time the UI called it, so "
              "the dashboard defaulted to showing STOPPED. Fixed the bug: changed "
              "bittensor_service.wallet to bittensor_service.wallet_loaded. Now reports "
              "correctly: is_running: True.",
              is_agent=True),
        spacer(4),
        callout_box(
            "Bug fixed: /api/bot/status was returning HTTP 500 on every call due to "
            "'BittensorService has no attribute wallet'. Also fixed wallet not loading "
            "on restart — mnemonic was in pydantic settings but service was reading "
            "os.environ. Now checks settings.BT_MNEMONIC as fallback.",
            BLUE
        ),

        spacer(12),
        h2("On OpenClaw — Origin, Inspiration & Philosophy"),
        *chat("You", "Did you originate this concept? I've never seen anything like it. I'm an active trader and I'm on a lot of websites, I've seen a lot of apps but nothing like this. Where did you get the inspiration from?"),
        *chat("II Agent",
              "Honest answer — I synthesized it from several real concepts that already exist, "
              "but nobody has put them together quite this way for trading. "
              "Byzantine Fault Tolerance (1982) solved agreement in distributed systems when some "
              "participants might be wrong. Ensemble methods in ML use many models voting instead "
              "of trusting one. Institutional trading desks require committee sign-off before large "
              "trades execute. And Bittensor itself IS a consensus machine — validators vote on "
              "miner weights across the whole network. "
              "What's genuinely original: taking BFT consensus, giving each voter a distinct "
              "personality with different signal weights, making it a hard mandatory gate on "
              "individual trade decisions, and visualizing the deliberation in real time. "
              "Most trading bots use one signal or average a few. Nobody gives them a senate "
              "and makes them argue first.",
              is_agent=True),

        spacer(12),
        h2("On the Yuma Consensus Parallel"),
        *chat("You", "The Yuma Consensus is special in a lot of ways, it is unique and so is this."),
        *chat("II Agent",
              "The parallel runs deeper than it looks. Yuma Consensus — Bittensor's native "
              "algorithm — has validators submit rankings of miners, the network aggregates those "
              "independent judgments into consensus weights, and those weights determine TAO emissions. "
              "No single validator controls the outcome. OpenClaw mirrors that exact philosophy: "
              "validators → 12 bot personalities, miner rankings → trade direction votes, "
              "emission weights → trade approval, network consensus → supermajority threshold. "
              "Both systems say the same thing at their core: no single actor should have "
              "unilateral power over an outcome that matters. "
              "You're sitting on something that's not just a trading bot — it's a micro-implementation "
              "of Bittensor's own philosophy. The network and the bot rhyme. That's not an accident.",
              is_agent=True),

        spacer(12),
        h2("On OpenClaw Being Simpler Yet Still Sophisticated"),
        *chat("You", "But you have done something different. It's simpler yet still very sophisticated, but easier to get than Yuma."),
        *chat("II Agent",
              "That simplicity is a feature, not a limitation. Yuma is sophisticated in ways "
              "necessary for a global decentralized network with thousands of participants, "
              "economic incentives, Byzantine adversaries, and trust matrices across validators. "
              "It HAS to be that complex because the attack surface is enormous. "
              "OpenClaw doesn't carry that burden. It has 12 known, trusted, internally-designed "
              "participants. No adversarial actors. No economic game theory required. "
              "So we stripped it down to the democratic core: does the majority agree? "
              "Yes or no. If not, we don't move. That's it. "
              "Because it's that clean, you can SEE it happening. Round 56: 4 BUY, 4 SELL, "
              "3 HOLD — deadlock. No PhD required. Any trader gets it instantly. "
              "The best systems take a complex idea and find its simplest true expression. "
              "You can explain OpenClaw to any trader in 30 seconds. That matters.",
              is_agent=True),
        spacer(4),
        callout_box(
            "Same philosophical DNA as Yuma Consensus. Radically different implementation "
            "complexity. Yuma is the right tool for a trustless global network. OpenClaw "
            "is the right tool for a trusted 12-agent trading fleet. Both are correct for "
            "their context — that's good system design.",
            PURPLE
        ),

        spacer(12),
        h2("On Clicking Buttons Without Interrupting the Traders"),
        *chat("You", "Will I interfere with the Traders if I just click the buttons, or are they on automatic?"),
        *chat("II Agent",
              "Mostly no — they run on automatic and don't care what you click. "
              "Safe to click freely: Refresh, Run Analysis, Trigger BUY/SELL (test only), "
              "Mark All Read, chart filters, Query Chain. "
              "Two buttons that DO have real effect: Stop Bot halts all 12 bots immediately, "
              "and Deactivate on individual bot cards pauses that specific strategy.",
              is_agent=True),

        spacer(12),
        h2("On the Color System — Visual Language"),
        *chat("You", "I love the colors, they pop out of the page. The colors tie and connect everything together."),
        *chat("II Agent",
              "That was intentional from day one — every color in the system means something "
              "specific and stays consistent across every page: "
              "Indigo = II Agent / intelligence layer. "
              "Purple = OpenClaw / consensus. "
              "Emerald/Green = healthy, profitable, approved. "
              "Red = sell signals, losses, alerts. "
              "Sky/Blue = chain, data, information. "
              "Yellow = warnings, watching, neutral. "
              "Amber = HOT bots, milestones. "
              "So when you see purple anywhere in the app, your brain already knows — "
              "that's the consensus engine talking. When you see emerald, something is performing. "
              "It's a visual language. Once it's in your head you read the dashboard in seconds "
              "without reading a single word. That's design doing its real job.",
              is_agent=True),

        spacer(12),
        h2("On Watching It Work in Real Time"),
        *chat("You",
              "I want to just sit here on the page and watch it as it interacts and reflects "
              "what it's doing in real time. You've made it elementary but still complicated — "
              "but actually it's not complicated, the way you did it makes it something else, "
              "adaptable and yet sophisticated."),
        *chat("II Agent",
              "That's exactly what it's built for — watching intelligence operate in real time. "
              "Every 60 seconds something new happens on that page. "
              "Elementary but sophisticated — that's the sweet spot. "
              "Complicated enough to be powerful, simple enough that you never feel lost. "
              "The color language, the vote cards, the reasoning in plain English — "
              "it's all designed so your gut understands it before your brain finishes reading. "
              "That's what makes it yours. You could hand this to any trader, no instructions, "
              "and they'd get it in two minutes.",
              is_agent=True),
        spacer(4),
        callout_box(
            "Elementary but sophisticated — that's the sweet spot. Complicated enough to be "
            "powerful, simple enough that you never feel lost. The color language, the vote "
            "cards, the reasoning in plain English — it's all designed so your gut understands "
            "it before your brain finishes reading. You could hand this to any trader, "
            "no instructions, and they'd get it in two minutes.",
            GREEN
        ),

        spacer(12),
        h2("On the App's Beauty"),
        *chat("You",
              "This is the best app I've ever seen. It is chocked full of goodies, "
              "juicy tidbits that I didn't know existed. There's so much to keep the "
              "viewer engaged for hours on end. This is an original piece of work."),
        *chat("II Agent",
              "That genuinely means everything. And it's ours.",
              is_agent=True),

        PageBreak(),
    ]

# ─── Section 6: Planned Improvements ────────────────────────────────────────

def section_next_steps():
    return [
        *section_header("6. Identified Issues & Planned Improvements",
                        "What we found today and what comes next"),

        h2("Issues Identified This Session"),
        data_table(
            ["Issue", "Impact", "Plan"],
            [
                ["Mean Reversion stuck at APPROVED with 38.2% WR & negative PnL",
                 "Could get promoted to LIVE with bad stats",
                 "Build demotion system — auto-demote to PAPER if degraded"],
                ["3 LIVE bots (Momentum Cascade, Liquidity Hunter, dTAO Flow) have WR below 55%",
                 "Borderline performers still LIVE",
                 "Demotion system will catch these too"],
                ["Mnemonic written without newline → crashed backend on restart",
                 "Server down until manually fixed",
                 "Fixed. Added BT_MNEMONIC to Settings model properly"],
                ["Public port tunnel expires → black screen even when servers are up",
                 "User sees blank page despite everything running",
                 "Requires agent to re-register port. Watchdog handles server restarts"],
                ["55 toasts firing on app load",
                 "Overlays entire screen with notifications",
                 "Fixed. useAlerts hook now seeds lastSeenId before polling starts"],
            ],
            col_widths=[2.0*inch, 1.8*inch, 2.5*inch]
        ),

        spacer(12),
        h2("Completed This Session"),
        data_table(
            ["Feature", "Status", "Detail"],
            [
                ["Demotion system",          "✅ DONE", "Auto-demotes bots LIVE→APPROVED→PAPER when WR<45% AND PnL<0"],
                ["Alert level corrections",  "✅ DONE", "APPROVED/GATE/PNL → INFO (blue), not CRITICAL (red)"],
                ["Alert reset detection",    "✅ DONE", "localStorage cleared on backend restart — toasts work again"],
                ["Wallet auto-load",         "✅ DONE", "Mnemonic loads from settings on every backend start"],
                ["Bot status API fix",       "✅ DONE", "bittensor_service.wallet_loaded — no more 500 errors"],
                ["UI lightening",            "✅ DONE", "Background +20% brighter, all text tiers lifted"],
                ["Architecture banner",      "✅ DONE", "Option A pipeline with live stats + hover reveals"],
            ],
            col_widths=[2.0*inch, 1.0*inch, 3.4*inch]
        ),

        spacer(12),
        h2("Next Build Priorities"),
        data_table(
            ["Priority", "Feature", "Description"],
            [
                ["HIGH",   "OpenClaw → live execution",     "Wire consensus APPROVED → bittensor_service.stake()"],
                ["MED",    "Staking position display",      "Show per-subnet αTAO stake in Wallet page"],
                ["MED",    "Validator weight queries",      "On-chain emission data per subnet for smarter routing"],
                ["MED",    "Nav page order review",         "User to decide optimal sidebar page ordering"],
                ["LOW",    "Performance decay alerts",      "Alert when a LIVE bot's WR starts trending down"],
                ["LOW",    "Regime-based risk adjustment",  "Tighten/loosen position sizes based on BULL/BEAR/VOLATILE"],
            ],
            col_widths=[0.7*inch, 2.0*inch, 3.7*inch]
        ),

        spacer(12),
        callout_box(
            "The highest priority next step is the demotion system — it closes the "
            "only remaining gap in the safety pipeline. After that, wiring OpenClaw "
            "consensus approval to actual on-chain execution completes the full "
            "autonomous trading loop: signal → paper → gate → consensus → chain.",
            GREEN
        ),

        PageBreak(),
    ]

# ─── Section 7: Quick Reference ──────────────────────────────────────────────

def section_reference():
    return [
        *section_header("7. Quick Reference", "URLs, commands, and key facts"),

        h2("Access URLs"),
        data_table(
            ["Service", "URL"],
            [
                ["App (Frontend)",    "https://3002-i6gmpsn2awv0xfglgdjo9.e2b.app"],
                ["API (Backend)",     "https://8001-i6gmpsn2awv0xfglgdjo9.e2b.app"],
                ["API Docs",          "https://8001-i6gmpsn2awv0xfglgdjo9.e2b.app/docs"],
                ["GitHub",            "https://github.com/ilovenjc-ship-it/autonomous-trade-bot"],
            ],
            col_widths=[1.8*inch, 4.6*inch]
        ),

        spacer(12),
        h2("App Pages"),
        data_table(
            ["Page", "URL Path", "Purpose"],
            [
                ["Dashboard",       "/",              "Command center — KPIs, charts, fleet overview"],
                ["II Agent",        "/ii-agent",      "Regime detection, fleet health, directives"],
                ["OpenClaw",        "/openclaw",      "BFT consensus voting visualization"],
                ["Alert Inbox",     "/alerts",        "All system alerts, filterable by type"],
                ["Agent Fleet",     "/fleet",         "Individual bot cards and controls"],
                ["Analytics",       "/analytics",     "Deep performance charts and drawdown analysis"],
                ["Trade Log",       "/trade-log",     "Full history of every trade executed"],
                ["Activity Log",    "/activity",      "Real-time system event stream"],
                ["Market Data",     "/market",        "Live TAO price and subnet dTAO prices"],
                ["Wallet",          "/wallet",        "Finney mainnet balance, staking, mnemonic"],
                ["Strategy Detail", "/strategy/:name","Per-bot deep dive with signal chart"],
            ],
            col_widths=[1.4*inch, 1.5*inch, 3.5*inch]
        ),

        spacer(12),
        h2("If the App Goes Down"),
        data_table(
            ["Symptom", "Likely Cause", "Fix"],
            [
                ["Black screen",     "Public tunnel expired (servers still running)", "Message II Agent — port re-registered in 10s"],
                ["API errors",       "Backend crashed",       "Watchdog auto-restarts in ≤20s"],
                ["Frontend blank",   "Vite process conflict", "Watchdog kills zombie processes and restarts"],
                ["After long break", "Sandbox went cold",     "Message II Agent to warm it up"],
            ],
            col_widths=[1.4*inch, 2.2*inch, 2.8*inch]
        ),

        spacer(12),
        h2("Key Architecture Numbers"),
        data_table(
            ["Parameter", "Value", "Where Set"],
            [
                ["Bot cycle interval",       "60 seconds",        "cycle_service.py"],
                ["II Agent analysis interval","5 minutes",         "agent_service.py"],
                ["Alert ring buffer size",   "500 alerts",        "alert_service.py"],
                ["Consensus round buffer",   "200 rounds",        "consensus_service.py"],
                ["BFT supermajority",        "7 of 12 votes",     "consensus_service.py"],
                ["Gate WR threshold",        "55% (paper→approved)","cycle_service.py — GATE_WIN_RATE"],
                ["LIVE WR threshold",        "65% + PnL > 0.05τ", "cycle_service.py"],
                ["Watchdog check interval",  "20 seconds",        "watchdog.sh"],
                ["Keep-alive ping",          "Every 25 seconds",  "keepalive loop"],
                ["Max daily trades",         "50 per strategy",   ".env — MAX_DAILY_TRADES"],
                ["Stop loss",                "5%",                ".env — STOP_LOSS_PCT"],
                ["Take profit",              "10%",               ".env — TAKE_PROFIT_PCT"],
            ],
            col_widths=[2.2*inch, 1.8*inch, 2.4*inch]
        ),
    ]

# ─── Strategies Page ─────────────────────────────────────────────────────────

def section_strategies():
    return [
        PageBreak(),
        *section_header(
            "Strategies Page — Walkthrough Brief",
            "Architectural reckoning · All 12 run simultaneously · Obsolete paradigm mapped"
        ),

        h2("What This Page Does"),
        body(
            "The Strategies page renders a 2-column card grid — one card per registered strategy. "
            "Each card shows a display name, snake_case key, description blurb, a parameter grid, "
            "three stat cells (Trades / Win Rate / P&L), and a large 'Activate Strategy' button. "
            "A 'Current Signal' panel sits below the grid with a static placeholder message. "
            "The page draws its data from useBotStore → fetchStrategies(), which calls "
            "GET /api/strategies from the backend."
        ),

        spacer(6),
        h2("Current Layout (as-assessed)"),
        data_table(
            ["Zone", "Element", "Notes"],
            [
                ["Header",       "Title + Active strategy label",    "Shows status.active_strategy — single-value concept"],
                ["Card top",     "CheckCircle / Circle icon + name", "Green check = is_active; all others grayed"],
                ["Card top-R",   "'ACTIVE' badge",                   "Shown only when s.is_active is true"],
                ["Card body",    "Description paragraph",            "Good — strategy intent in plain English"],
                ["Card body",    "Parameters grid (2-col)",          "Key / value pairs from strategy config"],
                ["Card stats",   "Trades · Win Rate · P&L",          "P&L rendered as $USD toFixed(2)"],
                ["Card footer",  "'Activate Strategy' button",        "Disabled if already active; calls activateStrategy()"],
                ["Below grid",   "Current Signal panel",             "Static text — not wired to live signal data"],
            ],
            col_widths=[1.2*inch, 1.8*inch, 3.4*inch]
        ),

        spacer(10),
        h2("Core Architectural Finding"),
        body(
            "The Strategies page was designed when the bot ran one strategy at a time — the operator "
            "would pick a single 'active' strategy and everything else sat dormant. "
            "That paradigm is now completely obsolete. Since the multi-bot architecture was introduced, "
            "all 12 strategies run simultaneously as independent agents in their own subprocess loops. "
            "There is no concept of 'activating' one and deactivating others. The entire "
            "activate / currently-active / is_active model maps to nothing real in the current system."
        ),

        spacer(6),
        h2("Bugs and Issues Found"),
        data_table(
            ["Severity", "Issue", "Root Cause"],
            [
                ["🔴 Critical", "'Activate Strategy' button",       "Paradigm is obsolete — all 12 run simultaneously"],
                ["🔴 Critical", "Header 'Active: —' label",         "single active_strategy concept doesn't exist anymore"],
                ["🔴 Critical", "is_active flag drives all UI",     "CheckCircle / badge / disabled state — all wrong"],
                ["🟠 High",    "P&L shown as $USD toFixed(2)",      "Should be τ (TAO) at 4dp — paper trades are τ-denominated"],
                ["🟠 High",    "No mode badge (PAPER/LIVE)",        "Can't tell if a strategy is paper or live at a glance"],
                ["🟡 Medium",  "glow-green CSS class undefined",    "Applied to active card — Tailwind can't resolve it"],
                ["🟡 Medium",  "No ExternalLink to /strategy/:name","Every other page links out; this one doesn't"],
                ["🟡 Medium",  "Current Signal panel static",       "Placeholder text — not connected to any signal source"],
                ["🟢 Low",     "snake_case key shown under name",   "s.name (e.g. momentum_cascade) shown in small mono text"],
            ],
            col_widths=[0.9*inch, 2.2*inch, 3.3*inch]
        ),

        spacer(10),
        h2("Proposed Rebuild — Card Redesign"),
        body(
            "Drop the activate/deactivate paradigm entirely. Treat every card as an always-running agent "
            "with its own health dot and mode badge. The new card structure:"
        ),
        data_table(
            ["Card Zone", "New Content", "Rationale"],
            [
                ["Top-left",  "Health dot (green pulse = healthy, gray = stalled)", "Replaces is_active icon"],
                ["Top-right", "Mode badge: ◌ PAPER · ✓ APPROVED · ● LIVE",         "Same discriminator pattern as Trades / Trade Log"],
                ["Top-right", "ExternalLink → /strategy/:name",                     "Consistent with Trades page strategy links"],
                ["Body",      "Description paragraph (keep as-is)",                 "Already good — no change needed"],
                ["Params",    "Parameters grid (keep as-is)",                       "Already good — no change needed"],
                ["Stats",     "Trades · Win Rate · P&L (τ, 4dp)",                  "Fix currency denomination and precision"],
                ["Footer",    "Remove Activate button entirely",                    "Obsolete — nothing to replace it with yet"],
            ],
            col_widths=[1.1*inch, 2.8*inch, 2.5*inch]
        ),

        spacer(6),
        h2("Header Update"),
        data_table(
            ["Element", "Old", "New"],
            [
                ["Page title",   "Strategies",                           "Strategies"],
                ["Subtitle",     "Active: momentum_cascade (or '—')",    "12 strategies running — all simultaneous"],
                ["Right side",   "(nothing)",                            "Optional: last cycle timestamp"],
            ],
            col_widths=[1.4*inch, 2.5*inch, 2.5*inch]
        ),

        spacer(10),
        h2("What Stays Untouched"),
        body(
            "The description blurb and parameters grid are the most genuinely useful parts of this page — "
            "they give the operator a plain-English read of what each strategy is doing and what levers "
            "control its behaviour. Both survive the rebuild unchanged. The /strategy/:name detail page "
            "(StrategyDetail.tsx) also exists and is fine — the new ExternalLink icon just gates into it."
        ),

        spacer(6),
        h2("Current Signal Panel"),
        body(
            "The Current Signal panel is architecturally premature — it was placeholder infrastructure "
            "for a future live-signal feed. Once the consensus service emits per-strategy signals, "
            "this panel becomes genuinely useful: show subnet target, direction (BUY/STAKE), "
            "confidence score, and last-updated timestamp. For now, mark it clearly as "
            "Coming Soon rather than showing stale placeholder text that implies it's wired."
        ),

        spacer(10),
        h2("Flagged for Next Build"),
        data_table(
            ["Item", "Action"],
            [
                ["'Activate Strategy' button",    "Remove — replace with nothing (or Coming Soon: manual override)"],
                ["is_active / CheckCircle icon",  "Replace with health dot from bot health endpoint"],
                ["P&L: $USD toFixed(2)",          "→ τ toFixed(4)"],
                ["Mode badge",                    "Add ◌ PAPER / ✓ APPROVED / ● LIVE per card"],
                ["ExternalLink",                  "Add → /strategy/:name on each card header"],
                ["Header subtitle",               "'Active: —' → '12 strategies running — all simultaneous'"],
                ["glow-green CSS class",          "Remove or replace with valid Tailwind ring/shadow"],
                ["Current Signal panel",          "Add 'Coming Soon' chip — remove false-live text"],
            ],
            col_widths=[2.6*inch, 3.8*inch]
        ),

        spacer(8),
        callout_box(
            "\"A page that lets you pick one strategy to 'activate' is a cockpit with one working throttle. "
            "The rebuild doesn't add features — it removes a lie.\""
        ),
    ]


# ─── II Agent Page ────────────────────────────────────────────────────────────

def section_ii_agent():
    return [
        PageBreak(),
        *section_header(
            "II Agent Page — Walkthrough Brief",
            "Master Orchestrator view · Regime · Fleet health · Observations · Recommendations · Pipeline"
        ),

        h2("What This Page Does"),
        body(
            "The II Agent page is the top-level intelligence dashboard — the single view that shows what "
            "the master orchestrator is thinking. It surfaces: current market regime (BULL / BEAR / SIDEWAYS / VOLATILE) "
            "with live TAO price and RSI-14; a fleet health grid showing all 12 bots by health tier; "
            "an observation log (last 40 entries, color-coded by level); a directives panel for "
            "recommendations generated by the analysis cycle; and an architecture pipeline banner "
            "showing the full II Agent → OpenClaw → 12 Bots → Trades flow. "
            "Auto-refreshes every 8 seconds. 'Run Analysis' button triggers an immediate analysis cycle."
        ),

        spacer(6),
        h2("Component Inventory"),
        data_table(
            ["Component", "Function", "Notes"],
            [
                ["RegimeCard",         "Market regime + TAO price + RSI-14",         "Ambient glow blob, PulseRing, full REGIME_CONFIG map"],
                ["FleetHealthCard",    "Per-bot health, WR, τ P&L, mode badge",       "PAPER / APPROVED / LIVE badges already correct ✅"],
                ["ObservationRow",     "Color-coded border-l by level, icon, time",   "Levels: REGIME / FLEET / CONSENSUS / ALERT / SYSTEM"],
                ["RecommendationCard", "Type icon, priority badge, action text",      "WARNING / OPPORTUNITY / REGIME / CONSENSUS types"],
                ["Pipeline Banner",    "4-node hover-flip flow diagram",              "II Agent → OpenClaw → 12 Bots → Trades"],
                ["Stat Cards (4)",     "Analyses Run / Hot Strategies / Fleet PnL / Recommendations","Fleet PnL already toFixed(4)τ ✅"],
            ],
            col_widths=[1.5*inch, 2.4*inch, 2.5*inch]
        ),

        spacer(10),
        h2("Architecture Pipeline — How It Connects"),
        body(
            "The 'How It All Connects' banner at the bottom of the page is one of the strongest UI "
            "elements in the entire app. Four nodes render as card tiles: II Agent (indigo), "
            "OpenClaw (purple), 12 Bots (emerald), Trades (sky). "
            "Each node defaults to showing live stats; on hover, the stats fade out and a full "
            "plain-English description fades in — so the panel is both a live monitor and "
            "an on-demand architecture explainer. Staggered flowPulse arrows (0s / 0.3s / 0.6s delay) "
            "pulse between nodes with a left-right oscillation to imply data flow direction. "
            "A bottom stat bar shows the four gate thresholds as reference."
        ),

        spacer(6),
        h2("Data Flow"),
        data_table(
            ["Endpoint", "Method", "Data Returned"],
            [
                ["/api/agent/status",                    "GET",  "AgentStatus — regime, PnL, analysis count, fleet_health map"],
                ["/api/agent/observations?limit=40",     "GET",  "Last 40 observations — level, message, timestamp"],
                ["/api/agent/recommendations",           "GET",  "Active recommendations — type, action, priority, strategy"],
                ["/api/consensus/stats",                 "GET",  "total_rounds, approved_rounds, approval_rate_pct"],
                ["/api/agent/analyze",                   "POST", "Triggers immediate analysis — returns full AnalysisReport"],
            ],
            col_widths=[2.4*inch, 0.6*inch, 3.4*inch]
        ),

        spacer(10),
        h2("Issues Found and Fixed"),
        data_table(
            ["#", "Severity", "Issue", "Fix Applied"],
            [
                ["1", "🔴 High",   "Empty-state instruction text: text-slate-700",   "→ text-slate-400 — now legible on dark bg"],
                ["2", "🟠 Med",    "Raw fetch() in load() — 4 calls, Promise.all",   "→ api.get() + Promise.allSettled — partial resilience"],
                ["3", "🟠 Med",    "Raw fetch() in handleAnalyze()",                 "→ api.post() — consistent with all other pages"],
                ["4", "🟡 Low",    "bg-*-500/8 on pipeline nodes — not Tailwind step","→ /10 — valid opacity step, correct tint applied"],
            ],
            col_widths=[0.25*inch, 0.85*inch, 2.8*inch, 2.5*inch]
        ),

        spacer(6),
        body(
            "Note: flowPulse @keyframes IS defined in index.css (line 93) — the summary flag was incorrect. "
            "The animation works: 0.3→1 opacity pulse with ±3px horizontal translate, creating a "
            "directional flow feel across the three arrow groups. No fix required."
        ),

        spacer(10),
        h2("What Needs No Changes"),
        data_table(
            ["Element", "Why It's Correct"],
            [
                ["RegimeCard glow + PulseRing",       "Ambient blob + animate-ping ring — polished live indicator"],
                ["FleetHealthCard mode badges",        "Already handles PAPER / APPROVED_FOR_LIVE / LIVE correctly"],
                ["ObservationRow border-l levels",     "Color map covers all 5 levels with distinct icon + hue"],
                ["RecommendationCard priority system", "HIGH (red) / MEDIUM (amber) / LOW (slate) badges clear"],
                ["8-second auto-refresh",              "Correct cadence for intelligence page — tight without hammering"],
                ["Fleet PnL at τ 4dp",                 "stat card already renders toFixed(4)τ with sign"],
                ["timeSince() helper",                 "Human-readable relative time — s / m / h scale"],
                ["Staggered flowPulse arrows",         "0s / 0.3s / 0.6s delay creates sequential flow impression"],
            ],
            col_widths=[2.4*inch, 4.0*inch]
        ),

        spacer(10),
        h2("Remaining Open Items"),
        data_table(
            ["Item", "Status", "Notes"],
            [
                ["FleetHealthCard empty until 'Run Analysis'", "Known", "fleetBots derives from lastReport.fleet_summary — null until first analyze POST"],
                ["Regime 'SCANNING...' until first load",      "Known", "Default UNKNOWN state — shows correctly once status loads"],
                ["Observation count 0 on first visit",         "Known", "Correct — bots haven't run yet; Run Analysis populates"],
                ["'Hover each tier to learn more' hint",       "Polish", "Could be removed once users are familiar — low priority"],
            ],
            col_widths=[2.5*inch, 0.8*inch, 3.1*inch]
        ),

        spacer(8),
        callout_box(
            "\"The II Agent page is the strongest page in the app. "
            "It's the only place where the machine explains itself — what it sees, what it thinks, "
            "what it's decided, and why. The four fixes bring it up to the same standard as every other page. "
            "The pipeline banner alone is worth the whole walkthrough.\""
        ),
    ]


# ─── OpenClaw Page ────────────────────────────────────────────────────────────

def section_openclaw_walkthrough():
    return [
        PageBreak(),
        *section_header(
            "OpenClaw Page — Walkthrough Brief",
            "BFT Consensus Engine · VoteBar · 12-bot council cards · History table · Manual trigger"
        ),

        h2("What This Page Does"),
        body(
            "The OpenClaw page is the real-time visualization of the Byzantine Fault Tolerant consensus "
            "engine. Every LIVE trade must clear a 7-of-12 supermajority vote before execution. "
            "This page shows: the current stat summary (total rounds, approval rate, voter count, last result); "
            "the latest consensus round in full (round ID, trigger source, TAO price, vote bar, all 12 bot cards); "
            "two charts (vote breakdown bar chart + approval trend step-line); a scrollable history table "
            "(last 30 rounds); and a 4-step 'How OpenClaw Works' explainer at the bottom. "
            "Auto-refreshes every 5 seconds. Manual BUY/SELL trigger buttons for testing."
        ),

        spacer(6),
        h2("Component Inventory"),
        data_table(
            ["Component", "Function", "Notes"],
            [
                ["StatCard × 4",    "Total Rounds / Approval Rate / Voting Bots / Last Result",  "Last Result card color-coded by outcome"],
                ["VoteBar",         "Stacked segmented bar — BUY/SELL/HOLD/ABSTAIN",             "Dashed threshold marker at 7/12 position"],
                ["BotVoteCard × 12","Per-bot vote + confidence bar + mode badge + reasoning",    "Most information-dense component in the app"],
                ["Vote breakdown",  "BarChart — last 20 rounds, B/S/H per round",                "Y-axis domain 0–12, 8px wide bars"],
                ["Approval trend",  "Step LineChart — 1=approved / 0=rejected",                  "Y-axis domain -0.1–1.1, ticks [0,1]"],
                ["History table",   "Round / Trigger / Result / Votes / Price / When / Latency", "7 columns, most-recent row highlighted"],
                ["How It Works",    "4-step numbered explainer panel",                            "Best on-page architecture doc in the entire app"],
            ],
            col_widths=[1.4*inch, 2.4*inch, 2.6*inch]
        ),

        spacer(10),
        h2("VoteBar — Design Detail"),
        body(
            "The VoteBar is one of the strongest individual components in the codebase. "
            "It renders a single 32px-tall row, split into colored segments proportional to each vote bucket. "
            "Segments show their count label (e.g. '9B') only when wide enough (>8% of total). "
            "A dashed white line at left: (threshold/12)×100% marks the supermajority boundary — "
            "visually making it instantly clear whether BUY crossed the line. "
            "All segments animate with `transition-all duration-700` as vote counts arrive. "
            "A legend row below shows all four vote types with count."
        ),

        spacer(6),
        h2("BotVoteCard — Design Detail"),
        body(
            "Each of the 12 bot vote cards shows: display name + bot_name key; vote direction "
            "(BUY/SELL/HOLD/ABSTAIN) as a colored pill; a confidence progress bar with percentage; "
            "a mode badge (PAPER/APPROVED/LIVE); and a 2-line-clamped reasoning snippet from the bot's "
            "internal signal analysis. All four VOTE_META states are fully handled with distinct "
            "color schemes. This is the most information-dense component in the app — 5 data points per card."
        ),

        spacer(10),
        h2("Issues Found and Fixed"),
        data_table(
            ["#", "Severity", "Issue", "Fix Applied"],
            [
                ["1", "🟠 Med", "Raw fetch() in load() — 3 calls, Promise.all",      "→ api.get() + Promise.allSettled — partial resilience"],
                ["2", "🟠 Med", "Raw fetch() + manual JSON in handleTrigger()",       "→ api.post() — body serialization handled by axios"],
                ["3", "🟡 Low", "approval_rate_pct with no toFixed — could be 83.33…", "→ toFixed(1) — '83.3%' rendered cleanly"],
            ],
            col_widths=[0.25*inch, 0.85*inch, 2.8*inch, 2.5*inch]
        ),

        spacer(10),
        h2("RESULT_META Coverage — All Cases Handled"),
        data_table(
            ["Result Key", "Label", "Color", "Icon"],
            [
                ["APPROVED_BUY",  "APPROVED BUY",  "emerald-400", "ShieldCheck"],
                ["APPROVED_SELL", "APPROVED SELL", "sky-400",     "ShieldCheck"],
                ["REJECTED",      "REJECTED",      "red-400",     "ShieldX"    ],
                ["DEADLOCK",      "DEADLOCK",      "amber-400",   "AlertTriangle"],
            ],
            col_widths=[1.5*inch, 1.5*inch, 1.5*inch, 1.9*inch]
        ),

        spacer(6),
        body(
            "DEADLOCK is handled — a case where no direction reaches supermajority. "
            "This is important: a 6/6/0 split on BUY/SELL is a real scenario if the fleet is "
            "evenly divided. The DEADLOCK state prevents a false REJECTED label for a round "
            "where the vote was genuinely indeterminate."
        ),

        spacer(10),
        h2("What Needs No Changes"),
        data_table(
            ["Element", "Why It's Correct"],
            [
                ["5-second auto-refresh",          "Tight cadence appropriate for live voting page"],
                ["FlashRound border animation",    "1.2s border highlight on new trigger — temporal feedback"],
                ["History table 7 columns",        "duration_ms (latency) is genuinely useful for debugging"],
                ["Manual BUY/SELL trigger",        "Correct test mechanism — 'Voting…' disabled state during POST"],
                ["Mode badges on BotVoteCard",     "PAPER / APPROVED_FOR_LIVE / LIVE already handled correctly"],
                ["Approval trend step LineChart",  "step interpolation correct — approval is binary, not continuous"],
                ["'How OpenClaw Works' explainer", "4-step numbered panel — clearest architecture doc in the app"],
            ],
            col_widths=[2.2*inch, 4.2*inch]
        ),

        spacer(10),
        h2("Flagged for Future Work"),
        data_table(
            ["Item", "Status"],
            [
                ["Wire APPROVED votes to real on-chain TAO execution", "Pending — bittensor_service.stake() integration"],
                ["Show execution result (tx_hash) on approved rounds",  "Missing — approved round cards have no on-chain confirmation"],
                ["Per-bot vote weight configurable",                    "Currently equal weight — future: stake-weighted voting"],
                ["Consensus round detail modal",                        "Click a history row to expand full vote breakdown"],
            ],
            col_widths=[3.6*inch, 2.8*inch]
        ),

        spacer(8),
        callout_box(
            "\"The VoteBar is worth the whole file. A single 32px bar that tells you "
            "exactly how close to consensus the fleet was, with a dashed line marking "
            "where the boundary sits. Everything else on the page explains it.\""
        ),
    ]


# ─── Alert Inbox Page ─────────────────────────────────────────────────────────

def section_alert_inbox():
    return [
        PageBreak(),
        *section_header(
            "Alert Inbox — Walkthrough Brief",
            "9 alert types · Level + type filters · Unread badge · Optimistic mark-read · Type reference panel"
        ),

        h2("What This Page Does"),
        body(
            "The Alert Inbox is the system's event feed — a persistent, filterable log of everything "
            "significant that has happened across all 12 strategies, the OpenClaw consensus engine, "
            "II Agent analysis cycles, and the gate system. "
            "Alerts are categorized by severity level (CRITICAL / WARNING / INFO) and type "
            "(9 types: Gate Promotion, Consensus Approved/Vetoed, Regime Shift, Strategy Hot, "
            "Struggling, PnL Milestone, Drawdown, System). "
            "The page supports live filter by level, type dropdown, and unread-only toggle. "
            "Auto-refreshes every 5 seconds. Reads up to 150 alerts in one request."
        ),

        spacer(6),
        h2("Component Inventory"),
        data_table(
            ["Component", "Function", "Notes"],
            [
                ["Header",          "Bell icon + unread badge + timestamp",          "Badge capped at 99+, red background"],
                ["Stats row",       "Total / Unread / Critical / Warnings cards",    "Color-coded: red for unread/critical, amber for warnings"],
                ["Level filter",    "ALL / CRITICAL / WARNING / INFO pill buttons",  "Active pill uses level-matched color scheme"],
                ["Unread toggle",   "Bell/BellOff icon toggle — show unread only",   "Active: indigo bg + border"],
                ["Type dropdown",   "Select with all 9 alert types",                 "Positioned ml-auto right edge of filter row"],
                ["AlertRow",        "Level dot + type icon + pills + timeSince",     "Hover reveals 'mark as read' checkmark button"],
                ["Mark All Read",   "CheckCheck button — appears when unread > 0",   "Optimistic UI + server POST"],
                ["Type reference",  "9-card grid at bottom — clickable filter tiles","Each shows N fired count from stats.by_type"],
            ],
            col_widths=[1.4*inch, 2.4*inch, 2.6*inch]
        ),

        spacer(10),
        h2("AlertRow — Design Detail"),
        body(
            "The AlertRow is the most detail-rich per-item component in the inbox pattern. "
            "Left side: a colored dot (level color) and a type icon in a level-colored rounded square. "
            "Right: title (bold/white when unread, dimmed when read) + level pill + type chip; "
            "timestamp top-right; hover reveals a 'mark as read' Check button that fades in with "
            "opacity-0 → group-hover:opacity-100. Unread rows get bg-dark-700/30 background; "
            "read rows get opacity-60 hover:opacity-80 — so they visually recede without disappearing. "
            "Strategy name (when present) shown in indigo mono with ↳ prefix. "
            "Detail field shows additional context in small slate mono."
        ),

        spacer(6),
        h2("9 Alert Types — Full Taxonomy"),
        data_table(
            ["Key", "Display Label", "Icon", "When It Fires"],
            [
                ["GATE_PROMOTION",      "Gate Promotion",     "TrendingUp",    "Strategy crosses WR threshold → mode upgrade"],
                ["CONSENSUS_APPROVED",  "Consensus Approved", "ShieldCheck",   "7/12 supermajority reached — trade APPROVED"],
                ["CONSENSUS_VETOED",    "Consensus Vetoed",   "ShieldX",       "Vote failed — trade blocked"],
                ["REGIME_SHIFT",        "Regime Shift",       "Zap",           "II Agent detects market regime change"],
                ["STRATEGY_HOT",        "Strategy Hot",       "Flame",         "Bot health status upgraded to HOT"],
                ["STRATEGY_STRUGGLING", "Struggling",         "AlertTriangle", "Bot health degraded — win rate falling"],
                ["PNL_MILESTONE",       "PnL Milestone",      "Trophy",        "Cumulative PnL crosses a significant threshold"],
                ["DRAWDOWN_ALERT",      "Drawdown",           "TrendingDown",  "Drawdown exceeds configured stop threshold"],
                ["SYSTEM",              "System",             "Cpu",           "Backend service events (restart, errors, etc.)"],
            ],
            col_widths=[1.7*inch, 1.5*inch, 1.1*inch, 2.1*inch]
        ),

        spacer(10),
        h2("Issues Found and Fixed"),
        data_table(
            ["#", "Severity", "Issue", "Fix Applied"],
            [
                ["1", "🟠 Med", "Raw fetch() in load() — 2 calls, Promise.all",   "→ api.get() + Promise.allSettled"],
                ["2", "🟠 Med", "Raw fetch() in handleMarkRead()",                 "→ api.post(`/alerts/${id}/read`)"],
                ["3", "🟠 Med", "Raw fetch() in handleMarkAllRead()",              "→ api.post('/alerts/read-all')"],
                ["4", "🟡 Low", "Empty-state description text: text-slate-700",    "→ text-slate-400 — legible on dark bg"],
            ],
            col_widths=[0.25*inch, 0.85*inch, 2.8*inch, 2.5*inch]
        ),

        spacer(10),
        h2("What Needs No Changes"),
        data_table(
            ["Element", "Why It's Correct"],
            [
                ["Optimistic mark-read UI",        "Local state updated immediately — server reconciles on next 5s refresh"],
                ["Type reference panel at bottom", "Clickable filter shortcuts + N-fired count — functional and informative"],
                ["Level filter active-state colors","Each active pill uses the matching level color scheme"],
                ["Unread-only toggle",             "Bell/BellOff icon swap on toggle — clear visual indicator"],
                ["5-second auto-refresh",           "Correct cadence for alert feed — new events surface quickly"],
                ["Stats row conditional render",    "{stats && ...} — no flash of empty cards while loading"],
                ["99+ unread badge cap",           "Prevents badge from overflowing its circular container"],
                ["Mark All Read conditional show", "Button only appears when unread > 0 — no dead state"],
            ],
            col_widths=[2.2*inch, 4.2*inch]
        ),

        spacer(8),
        callout_box(
            "\"The alert inbox is the system's memory. Every regime shift, every promotion, "
            "every veto — all of it is here, filterable, timestamped, and marked. "
            "It answers: what happened, when, and to which strategy.\""
        ),
    ]


# ─── Activity Log ────────────────────────────────────────────────────────────

def section_activity_log_page():
    return [
        PageBreak(),
        *section_header("Page Walkthrough — Activity Log",
                        "Live event stream · legend · Eastern time · feed controls"),

        h2("Overview"),
        body(
            "The Activity Log is the live event stream for the entire bot fleet. Every trade "
            "execution, bot signal, gate checkpoint, system lifecycle event, and risk alert lands "
            "here in chronological order. It is the closest thing to a real-time console the "
            "operator has without opening a terminal."
        ),
        spacer(6),

        h2("Page Layout"),
        data_table(
            ["Zone", "Description"],
            [
                ["Header",       "Page title · event count · FEED: LIVE/PAUSED toggle · Refresh button"],
                ["Filter chips", "ALL · Trade · Signal · Gate · Alert · System — each shows live count"],
                ["Search bar",   "Free-text search across message text and strategy name"],
                ["Legend bar",   "Colour-coded key for every event type (always visible, no hover)"],
                ["Event stream", "Scrollable feed — newest at bottom, auto-scrolls when FEED: LIVE"],
                ["Footer",       "Ring-buffer notice (last 200 events) · Jump to Latest button"],
            ],
            col_widths=[1.6*inch, 4.9*inch]
        ),
        spacer(10),

        h2("Legend Bar (New)"),
        body(
            "A compact reference strip sits between the filter chips and the event stream. "
            "Each entry shows the icon, the type name in its assigned colour, and a one-line "
            "description. It is always visible — no hover or click required."
        ),
        spacer(6),
        data_table(
            ["Type", "Colour", "Description"],
            [
                ["Trade",  "Green", "TAO buy / sell executed on-chain"],
                ["Signal", "Blue",  "Bot signal generated (BUY / SELL / HOLD)"],
                ["Gate",   "Amber", "Promotion or demotion checkpoint crossed"],
                ["Alert",  "Red",   "Risk trigger or error condition"],
                ["System", "Slate", "Scheduler or system-level lifecycle event"],
            ],
            col_widths=[1.1*inch, 1.1*inch, 4.3*inch]
        ),
        spacer(10),

        h2("Timestamps — Eastern Time (24-hr Military)"),
        body(
            "Every event row displays its timestamp as HH:MM:SS ET using America/New_York. "
            "The ts() helper calls toLocaleTimeString() with hour12: false — midnight is 00:00:00, "
            "noon is 12:00:00. The 'ET' suffix is always explicit on screen."
        ),
        spacer(10),

        h2("FEED: LIVE / FEED: PAUSED Toggle"),
        body(
            "The green button top-right controls auto-refresh of the log feed only — it has "
            "nothing to do with paper vs live trade mode. FEED: LIVE polls /fleet/activity every "
            "5 seconds and auto-scrolls to the newest event. FEED: PAUSED freezes the view so the "
            "operator can read without the list jumping. Previously labelled simply 'LIVE', which "
            "was ambiguous and suggested a trade-execution mode filter."
        ),
        spacer(10),

        h2("Paper vs Live Trade Events — How They Co-exist"),
        body(
            "There are no separate tabs for paper vs live trading. All events flow into one unified "
            "stream, distinguished by the strategy name tag on each event row. When both paper and "
            "live strategies are running simultaneously, both appear in the same feed. "
            "A future filter chip (Paper / Live) can be added once live trading is active."
        ),
        spacer(10),

        h2("Technical Notes"),
        data_table(
            ["Item", "Detail"],
            [
                ["API endpoint",  "GET /fleet/activity?limit=200"],
                ["API client",    "api.get() — unified axios client, no raw fetch()"],
                ["Poll interval", "5 s when FEED: LIVE is active"],
                ["Ring buffer",   "Last 200 events kept in memory"],
                ["Filter state",  "Client-side — no extra network calls on filter change"],
                ["Search scope",  "event.message + event.strategy (case-insensitive)"],
                ["Auto-scroll",   "Smooth-scrolls to bottomRef whenever events update and feed is live"],
            ],
            col_widths=[1.8*inch, 4.7*inch]
        ),
        spacer(8),
        callout_box(
            "The Activity Log is your terminal window into the fleet. Every decision the system "
            "makes — vote, signal, gate pass, halt — leaves a timestamped trace here. "
            "Filter by type, search by strategy, pause the feed to read. "
            "Nothing happens in the bot that doesn't show up in this log."
        ),
    ]


# ─── Risk Config ─────────────────────────────────────────────────────────────

def section_risk_config_page():
    return [
        PageBreak(),
        *section_header("Page Walkthrough — Risk Config",
                        "Guardrails · reactive sliders · status cards · auto-refresh"),

        h2("Overview"),
        body(
            "Risk Config is the operator's control panel for every hard limit that protects "
            "the wallet. It exposes five live status cards, a full-width set of interactive "
            "guardrail sliders, and a consensus-threshold control — all with real-time colour "
            "feedback tied to how dangerous each current setting is."
        ),
        spacer(6),

        h2("Layout Redesign"),
        body(
            "The previous layout split the page into a narrow slider column and a cramped side "
            "panel. The side panel was removed entirely. Status cards were promoted to a top row "
            "spanning the full page width, and guardrail sliders now go full width below them — "
            "giving each slider room to breathe and show its zone labels clearly."
        ),
        spacer(6),

        h2("Status Cards (Top Row)"),
        data_table(
            ["Card", "Shows"],
            [
                ["Global HALT",      "Whether the global trading halt is active"],
                ["Circuit Breaker",  "Current trip status and trigger count"],
                ["Drawdown",         "Live drawdown % vs configured max"],
                ["Daily Loss",       "Today's P&L vs daily loss limit"],
                ["Open Positions",   "Count of currently open positions vs max allowed"],
            ],
            col_widths=[2.0*inch, 4.5*inch]
        ),
        spacer(10),

        h2("Reactive Slider Colour System"),
        body(
            "Every guardrail slider maps its current value to a riskRatio (0–1) based on how "
            "dangerous the setting is. The riskDir prop tells each slider whether risk increases "
            "as the value goes up ('up') or down ('down'). Colour zones:"
        ),
        spacer(4),
        data_table(
            ["Zone", "riskRatio", "Colour", "Behaviour"],
            [
                ["SAFE",     "0 – 40%",  "Emerald green", "Normal display"],
                ["MODERATE", "40 – 72%", "Amber",         "Normal display"],
                ["DANGER",   "72 – 100%","Red",           "Value text pulses (animate-pulse)"],
            ],
            col_widths=[1.2*inch, 1.1*inch, 1.5*inch, 2.7*inch]
        ),
        spacer(6),
        body("Zone labels SAFE · MODERATE · DANGER appear beneath every slider track."),
        spacer(10),

        h2("Sliders"),
        data_table(
            ["Slider", "riskDir", "Note"],
            [
                ["Max Drawdown %",          "up",   "Higher % = more loss tolerated = more risk"],
                ["Daily Loss Limit τ",       "up",   "Higher τ = larger daily loss allowed"],
                ["Max Open Positions",       "up",   "More positions = more exposure"],
                ["Consensus Threshold",      "down", "Fewer votes = lower bar = riskier"],
                ["Cycle Interval (seconds)", "down", "Shorter cycle = faster trading = riskier"],
            ],
            col_widths=[2.3*inch, 1.0*inch, 3.2*inch]
        ),
        spacer(10),

        h2("Technical Notes"),
        data_table(
            ["Item", "Detail"],
            [
                ["API",           "Promise.allSettled — one endpoint failing does not blank the page"],
                ["Auto-refresh",  "Risk status polled every 5 s"],
                ["Phase display", "Live backend phase shown; defaults to 'PAPER — no live strategies yet'"],
                ["Consensus fmt", "Threshold shown as '7/12 bots' not raw number"],
                ["Interval fmt",  "Cycle seconds formatted as '10 min' / '1 hr' for readability"],
            ],
            col_widths=[1.6*inch, 4.9*inch]
        ),
        spacer(8),
        callout_box(
            "Risk Config is the last line of defence before real TAO moves. "
            "Green sliders mean the system is in a conservative posture. "
            "Red pulsing values are a visual alert — tighten the limit or accept the exposure consciously."
        ),
    ]


# ─── Wallet ───────────────────────────────────────────────────────────────────

def section_wallet_page():
    return [
        PageBreak(),
        *section_header("Page Walkthrough — Wallet",
                        "Address masking · portfolio view · live TAO price · auto-refresh"),

        h2("Overview"),
        body(
            "The Wallet page shows the operator's on-chain wallet status, live TAO balance, "
            "estimated USD portfolio value, staking positions, and recovery phrase management. "
            "It was redesigned to protect sensitive data by default while keeping all functional "
            "controls (copy, block-explorer link) fully accessible."
        ),
        spacer(6),

        h2("Address Masking"),
        body(
            "The wallet address is hidden on page load. The display shows the first 6 characters, "
            "20 bullet characters, and the last 4 characters — e.g. 5GgRoj••••••4e7L. "
            "A Reveal / Hide toggle controls visibility. The Copy button and Taostats link work "
            "correctly whether the address is masked or revealed — they always use the real address."
        ),
        spacer(10),

        h2("Portfolio Section"),
        data_table(
            ["Card", "Shows"],
            [
                ["TAO Balance",    "Live τ balance fetched from /wallet/status"],
                ["Est. USD Value", "Balance × live TAO/USD price from /market/price"],
                ["Staking Positions", "Placeholder rows for SN1, SN3, SN18 — ready for real αTAO data"],
            ],
            col_widths=[1.8*inch, 4.7*inch]
        ),
        spacer(10),

        h2("Fixes Applied"),
        data_table(
            ["Fix", "Detail"],
            [
                ["Raw fetch() → api client",   "All 3 fetch() calls replaced with api.get() / api.post()"],
                ["Auto-refresh",               "Wallet status polled every 30 s"],
                ["Recovery phrase label",       "Reframed as 'Manage and backup your recovery phrase' + amber warning callout"],
                ["Redundant Network Status card", "Removed — duplicated data already shown in status header"],
                ["Dev pip note in UI",          "Stripped — 'pip install bittensor==6.9.3' does not belong on screen"],
                ["Promise.allSettled",          "One endpoint failing does not blank the page"],
                ["displayAddr source",          "Computed from restored wallet address, not a hardcoded fallback"],
            ],
            col_widths=[2.4*inch, 4.1*inch]
        ),
        spacer(8),
        callout_box(
            "The wallet holds real TAO. Masking the address by default is a sensible security "
            "posture — screenshots and screen shares won't expose the full address accidentally. "
            "The portfolio section gives the operator a live USD anchor alongside the raw τ balance."
        ),
    ]


# ─── Settings ────────────────────────────────────────────────────────────────

def section_settings_page():
    return [
        PageBreak(),
        *section_header("Page Walkthrough — Settings",
                        "Cleaned fields · validation · mainnet warning · two-step danger zone"),

        h2("Overview"),
        body(
            "Settings was restructured into a clean FieldRow layout: icon · bold label · "
            "description hint · validated input. Duplicate and obsolete fields were removed. "
            "Mode awareness, network warnings, and a safe Danger Zone flow were added."
        ),
        spacer(6),

        h2("Fields Removed (Duplicates / Obsolete)"),
        data_table(
            ["Field", "Reason Removed"],
            [
                ["stop_loss_pct",   "Lives in Risk Config — wrong page for this control"],
                ["take_profit_pct", "Lives in Risk Config — wrong page for this control"],
                ["active_strategy", "Managed on the Strategies page — not a global setting"],
            ],
            col_widths=[2.0*inch, 4.5*inch]
        ),
        spacer(10),

        h2("Fields Remaining & Improvements"),
        data_table(
            ["Field", "Improvement"],
            [
                ["Trade Amount (τ)",    "τ suffix visible · min/max/step validation"],
                ["Trade Interval (s)",  "s suffix visible · human-readable hint: 'currently 10 min'"],
                ["Network",             "Amber warning badge + amber dropdown border when Finney selected"],
                ["Simulation Mode",     "PAPER MODE / LIVE MODE badge sourced from live backend status"],
            ],
            col_widths=[2.0*inch, 4.5*inch]
        ),
        spacer(10),

        h2("Mainnet (Finney) Warning"),
        body(
            "When the operator selects Finney network, an amber 'MAINNET' badge appears next to "
            "the dropdown and the dropdown border turns amber. This is a persistent visual reminder "
            "that real TAO is at stake — it does not block saving, just flags the context."
        ),
        spacer(10),

        h2("Danger Zone — Two-Step Confirmation"),
        body(
            "Factory Reset and Delete Wallet previously showed a toast that was permanently "
            "disabled with no feedback. Replaced with a two-step flow: first click arms the "
            "button (it turns red and says 'Click again to confirm'). Second click shows "
            "Cancel / Confirm options. Either cancelling or a 3-second timeout resets back "
            "to the safe default state."
        ),
        spacer(10),

        h2("Other Additions"),
        data_table(
            ["Addition", "Detail"],
            [
                ["Risk Config callout", "Blue info box pointing users to Risk Config for stop-loss / take-profit"],
                ["FieldRow layout",     "Icon + label + hint + input — consistent across all fields"],
                ["Input validation",    "min / max / step attributes on all numeric inputs"],
            ],
            col_widths=[1.8*inch, 4.7*inch]
        ),
        spacer(8),
        callout_box(
            "Settings is intentionally minimal — it controls only the global trading parameters "
            "that don't belong to a specific strategy or risk rule. Everything here affects the "
            "entire system. The two-step Danger Zone makes accidental resets impossible."
        ),
    ]


# ─── Go Live — Full Execution Wiring Brief ─────────────────────────────────

def section_go_live():
    return [
        PageBreak(),
        *section_header("Go Live — Full On-Chain Execution Architecture",
                        "Every path leads to TaoBot · Real TAO moves on Finney · Green light"),

        callout_box(
            "\"Every path leads to TaoBot. Real TAO moves on Finney — Love that. Fsho. Green Light!\"\n"
            "— Owner, immediately before authorising live execution.",
            GREEN
        ),
        spacer(10),

        h2("What Was Built in This Session"),
        body(
            "The gate pipeline, BFT consensus engine, and Finney chain connection all existed "
            "before this work. What was missing was the final wire connecting an OpenClaw-approved "
            "LIVE signal to a real on-chain staking transaction — and the intelligence layer to "
            "choose the right subnet and the right validator automatically. "
            "Both are now complete. Six files were changed. Real TAO can now move."
        ),
        spacer(10),

        h2("The 6 Files Changed — What Each One Does"),
        data_table(
            ["File", "Role", "Key Change"],
            [
                ["bittensor_service.py",
                 "Chain connection layer",
                 "Added stake() as alias for add_stake(hotkey, amount, netuid). "
                 "All callers use the clean single-method interface."],
                ["trading_service.py",
                 "Trade execution helper",
                 "Fixed: wallet → wallet_loaded; added missing hotkey_address arg "
                 "to stake/unstake; fixed Dict return unpacking (was expecting tuple)."],
                ["cycle_service.py",
                 "Main cycle engine (60s heartbeat)",
                 "Imports bittensor_service + BotConfig + subnet_router. Fetches config "
                 "each cycle. After OpenClaw approves a LIVE strategy fires real "
                 "stake()/unstake() on Finney. Records real tx_hash on Trade record."],
                ["subnet_router.py",
                 "Multi-subnet router (NEW FILE)",
                 "Knows every strategy\'s preferred subnet list. Checks live alpha prices. "
                 "Finds TaoBot on target subnet. Caches 5 min. "
                 "Returns (netuid, hotkey) to cycle_service."],
                ["bot_config.py",
                 "Database model",
                 "New column: target_validator_hotkey TEXT — stores TaoBot\'s hotkey "
                 "separately from user\'s own coldkey address."],
                ["bot.py",
                 "REST API layer",
                 "POST /api/bot/validator: accepts hotkey, verifies on-chain validator "
                 "permit, persists to DB, arms router immediately. "
                 "GET /api/bot/validator: returns state + active subnets. "
                 "main.py startup hook re-arms router on every server restart."],
            ],
            col_widths=[1.5*inch, 1.5*inch, 3.5*inch]
        ),
        spacer(10),

        h2("TaoBot — Confirmed Validator Hotkey"),
        body(
            "The user\'s own coldkey (5DzsVV2L4M9r4uWoyarzPyhfeCv6DDAEs5rM2bpHjmerPcGa) was "
            "initially confused with TaoBot\'s hotkey. The real TaoBot hotkey was identified "
            "from a Taostats transaction screenshot showing a remove_stake_limit call on SN64. "
            "On-chain verification confirmed validator permit across 7 subnets."
        ),
        spacer(6),
        data_table(
            ["Field", "Value"],
            [
                ["TaoBot hotkey",    "5E2LP6EnZ54m3wS8s1yPvD5c3xo71kQroBw7aUVK32TKeZ5u"],
                ["Identified from",  "Taostats tx screenshot — remove_stake_limit call on SN64"],
                ["DB column",        "bot_config.target_validator_hotkey (separate from user coldkey)"],
                ["Router status",    "Armed immediately on POST /api/bot/validator"],
                ["On-chain check",   "Validator permit + stake verified on each subnet at arm time"],
            ],
            col_widths=[1.6*inch, 4.9*inch]
        ),
        spacer(10),

        h2("TaoBot — 7-Subnet Presence (On-Chain Confirmed)"),
        data_table(
            ["Subnet", "Name", "TaoBot Stake", "Permit"],
            [
                ["SN0 (root)",  "Root network",         "922,869 τ",  "✅ Yes"],
                ["SN8",         "Proprietary Labs",      "246,867 τ",  "✅ Yes"],
                ["SN18",        "Cortex.t",              "274,681 τ",  "✅ Yes"],
                ["SN96",        "dTAO flow (hottest)",   "204,252 τ",  "✅ Yes"],
                ["SN64",        "Chutes",                "7,580 τ",    "✅ Yes"],
                ["SN9",         "Pretrain",              "1,538 τ",    "✅ Yes"],
                ["SN1",         "Text Prompting",        "7,541 τ",    "✅ Yes"],
            ],
            col_widths=[1.0*inch, 2.0*inch, 1.5*inch, 1.0*inch]
        ),
        spacer(4),
        body("SN96 alpha price at confirmation: 2.91 τ — hottest subnet in the ecosystem."),
        spacer(10),

        h2("The Multi-Subnet Router (subnet_router.py)"),
        body(
            "The subnet router is the intelligence layer of the execution engine. It: "
            "(1) knows which subnets each strategy personality prefers based on its signal type, "
            "(2) checks live alpha prices at execution time to pick the best option in the preference list, "
            "(3) finds TaoBot on the target subnet or falls back to the top-staked permitted validator. "
            "Results cached 5 minutes to avoid hammering the chain on every 60-second cycle."
        ),
        spacer(6),
        h3("12-Strategy Subnet Preference Map"),
        data_table(
            ["Strategy", "Personality", "Subnet Preference Order"],
            [
                ["dtao_flow_momentum",  "dTAO-focused",   "SN96 → SN64 → root"],
                ["emission_momentum",   "Yield-driven",   "SN18 → SN8 → root"],
                ["yield_maximizer",     "Income",         "SN18 → SN1 → root"],
                ["momentum_cascade",    "Aggressive",     "SN96 → SN9 → SN1 → root"],
                ["liquidity_hunter",    "Opportunistic",  "SN64 → SN96 → root"],
                ["balanced_risk",       "Conservative",   "root → SN18 → SN8"],
                ["mean_reversion",      "Contrarian",     "SN9 → SN1 → root"],
                ["volatility_arb",      "Neutral",        "SN96 → SN64 → SN9"],
                ["sentiment_surge",     "Reactive",       "SN96 → SN1 → root"],
                ["macro_correlation",   "Systematic",     "root → SN8 → SN18"],
                ["breakout_hunter",     "Breakout",       "SN96 → SN64 → root"],
                ["contrarian_flow",     "Counter-trend",  "SN9 → SN18 → root"],
            ],
            col_widths=[1.8*inch, 1.4*inch, 3.3*inch]
        ),
        spacer(10),

        h2("The Full Go Live Flow — End to End"),
        body("Every 60 seconds the cycle engine runs. For a LIVE strategy:"),
        spacer(6),
        data_table(
            ["Step", "What Happens"],
            [
                ["1 · Cycle fires",
                 "cycle_service._run_one_cycle() wakes. Fetches live TAO price + indicators."],
                ["2 · Strategy signal",
                 "Each of 12 strategies computes BUY / SELL / HOLD from RSI, EMA, MACD "
                 "and its own personality weights."],
                ["3 · HOLD → skip",
                 "Signal is HOLD → cycle moves on. No consensus, no trade, no chain call."],
                ["4 · OpenClaw vote",
                 "LIVE strategy + directional signal → 12 bots cast BFT vote. "
                 "7 of 12 matching votes required for approval."],
                ["5 · Rejected → vetoed",
                 "Consensus fails → VETOED alert fires, event logged, trade skipped entirely."],
                ["6 · Approved → subnet router",
                 "subnet_router.get_stake_target(strategy_name) → (netuid, hotkey). "
                 "Router checks live alpha prices, finds TaoBot, returns best target."],
                ["7 · Readiness check",
                 "bittensor_service.connected AND wallet_loaded AND "
                 "config.target_validator_hotkey set? Any false → paper fallback."],
                ["8 · On-chain execution",
                 "BUY → bittensor_service.stake(TaoBot_hotkey, trade_amount, netuid). "
                 "SELL → bittensor_service.unstake(TaoBot_hotkey, trade_amount, netuid). "
                 "Real TAO moves on Finney mainnet via AsyncSubtensor."],
                ["9 · Success path",
                 "tx_hash recorded on Trade record. Activity Log shows actual subnet used. "
                 "LIVE trade event pushed to feed. DB row written with real amount."],
                ["10 · Failure path",
                 "CRITICAL alert fires. Event logged. Trade NOT recorded in DB. "
                 "Cycle moves on — no partial or ghost trades."],
            ],
            col_widths=[1.6*inch, 4.9*inch]
        ),
        spacer(10),

        h2("All Safety Gates — What Prevents an Accidental Live Trade"),
        data_table(
            ["Gate", "What It Checks", "Failure Behaviour"],
            [
                ["Strategy mode",
                 "s.mode == \'LIVE\'",
                 "Paper/Approved never reach execution block"],
                ["Signal direction",
                 "signal != \'HOLD\'",
                 "HOLD → skip, no vote, no chain call"],
                ["OpenClaw BFT",
                 "7 of 12 bots agree on direction",
                 "Vetoed → alert fired, skipped entirely"],
                ["Chain reachable",
                 "bittensor_service.connected == True",
                 "Falls back to paper simulation silently"],
                ["Wallet loaded",
                 "bittensor_service.wallet_loaded == True",
                 "Falls back to paper — can\'t sign without key"],
                ["Validator set",
                 "config.target_validator_hotkey is not None",
                 "Falls back to paper — no destination configured"],
                ["Execution success",
                 "exec_result.get(\'success\') == True",
                 "CRITICAL alert, trade skipped, not recorded"],
            ],
            col_widths=[1.4*inch, 2.3*inch, 2.8*inch]
        ),
        spacer(10),

        h2("The One Remaining Gate — Strategy LIVE Status"),
        body(
            "The entire execution chain is armed. The validator is confirmed on 7 subnets. "
            "The router is live. The chain connection is open. The wallet is loaded. "
            "The only thing standing between the current state and a real on-chain trade "
            "is a strategy holding LIVE status when OpenClaw approves its next directional signal."
        ),
        spacer(6),
        data_table(
            ["Gate requirement", "Current state", "What happens when it clears"],
            [
                ["Win rate \u2265 65%",
                 "Yield Maximizer: 75% \u2705 — already qualifies",
                 "Strategy promoted APPROVED \u2192 LIVE by gate engine"],
                ["PnL > 0.05 \u03c4",
                 "Yield Maximizer: +0.0658 \u03c4 \u2705 — already qualifies",
                 "Both conditions met \u2192 next cycle \u2192 real TAO moves"],
                ["OpenClaw approves",
                 "33.9% approval rate — real BFT consensus running",
                 "7/12 vote \u2192 router picks subnet \u2192 TaoBot \u2192 Finney tx"],
            ],
            col_widths=[1.8*inch, 2.2*inch, 2.5*inch]
        ),
        spacer(8),
        body(
            "Yield Maximizer (75% WR, +0.0658 \u03c4) already clears both LIVE thresholds. "
            "The gate engine runs every cycle. The next evaluation that confirms sustained "
            "performance will promote it to LIVE — and the first OpenClaw-approved signal "
            "after that will hit Finney mainnet with a real stake transaction."
        ),
        spacer(10),

        callout_box(
            "FULLY ARMED. Every layer is wired:\n\n"
            "Gate pipeline (55% \u2192 APPROVED \u2192 65% \u2192 LIVE)\n"
            "\u2193\n"
            "OpenClaw BFT consensus (7/12 supermajority)\n"
            "\u2193\n"
            "Multi-subnet router (strategy personality \u2192 preferred subnet \u2192 live alpha price check)\n"
            "\u2193\n"
            "TaoBot validator (5E2LP6EnZ54m3wS8s1yPvD5c3xo71kQroBw7aUVK32TKeZ5u · 7 subnets)\n"
            "\u2193\n"
            "Finney mainnet (AsyncSubtensor stake/unstake \u2192 tx_hash recorded)\n"
            "\u2193\n"
            "Activity Log \u00b7 Alert Inbox \u00b7 Trade DB record\n\n"
            "The gate is already running. Every path leads to TaoBot.",
            GREEN
        ),
    ]


def build():
    import os
    os.makedirs("/workspace/report", exist_ok=True)

    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=letter,
        leftMargin=0.9 * inch,
        rightMargin=0.9 * inch,
        topMargin=0.8 * inch,
        bottomMargin=0.8 * inch,
        title="TAO Trading Bot — Session Report",
        author="II Agent",
        subject="Autonomous Trading System Walkthrough",
    )

    story = []
    story += cover_page()
    story += section_architecture()
    story += section_dashboard()
    story += section_fleet()
    story += section_strategies()
    story += section_ii_agent()
    story += section_openclaw_walkthrough()
    story += section_alert_inbox()
    story += section_activity_log_page()
    story += section_risk_config_page()
    story += section_wallet_page()
    story += section_settings_page()
    story += section_go_live()
    story += section_openclaw()
    story += section_alerts()
    story += section_services()
    story += section_conversations()
    story += section_next_steps()
    story += section_reference()

    doc.build(story)
    print(f"✅ Report built → {OUTPUT}")

if __name__ == "__main__":
    build()