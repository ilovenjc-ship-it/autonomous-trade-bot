"""
TAO Trading Bot — The Last Revelations
A forensic brief documenting the breakthrough session:
- The ghost flag that silently killed live trading
- The three-file fix
- First confirmed live connection to Finney mainnet

Run: python generate_revelations_brief.py
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

OUTPUT = "/workspace/report/TAO_Bot_Last_Revelations.pdf"

# ─── Palette ─────────────────────────────────────────────────────────────────
NAVY       = colors.HexColor("#0d1525")
NAVY_MID   = colors.HexColor("#152030")
NAVY_LIGHT = colors.HexColor("#1c2b42")
BORDER     = colors.HexColor("#243450")
GREEN      = colors.HexColor("#00e5a0")
RED        = colors.HexColor("#ff4d6d")
BLUE       = colors.HexColor("#3b82f6")
YELLOW     = colors.HexColor("#f59e0b")
PURPLE     = colors.HexColor("#8b5cf6")
INDIGO     = colors.HexColor("#6366f1")
ORANGE     = colors.HexColor("#f97316")
WHITE      = colors.HexColor("#f1f5f9")
MUTED      = colors.HexColor("#94a3b8")
DARK_TEXT  = colors.HexColor("#0d1525")

# ─── Styles ──────────────────────────────────────────────────────────────────
def S(name, **kw):
    return ParagraphStyle(name, **kw)

HERO_LABEL = S("HeroLabel",
    fontName="Helvetica-Bold", fontSize=10, textColor=GREEN,
    alignment=TA_CENTER, spaceAfter=4, leading=14)

HERO_TITLE = S("HeroTitle",
    fontName="Helvetica-Bold", fontSize=38, textColor=NAVY,
    alignment=TA_CENTER, spaceAfter=6, leading=44)

HERO_SUB = S("HeroSub",
    fontName="Helvetica", fontSize=14, textColor=MUTED,
    alignment=TA_CENTER, spaceAfter=4, leading=18)

DATE_STYLE = S("Date",
    fontName="Helvetica", fontSize=10, textColor=MUTED,
    alignment=TA_CENTER, spaceAfter=2)

H1 = S("H1",
    fontName="Helvetica-Bold", fontSize=17, textColor=NAVY,
    spaceBefore=22, spaceAfter=8)

H2 = S("H2",
    fontName="Helvetica-Bold", fontSize=13, textColor=INDIGO,
    spaceBefore=14, spaceAfter=5)

BODY = S("Body",
    fontName="Helvetica", fontSize=10, textColor=colors.HexColor("#1e293b"),
    leading=16, spaceAfter=8)

BODY_MUTED = S("BodyMuted",
    fontName="Helvetica", fontSize=9, textColor=MUTED,
    leading=14, spaceAfter=6)

BULLET = S("Bullet",
    fontName="Helvetica", fontSize=10, textColor=colors.HexColor("#1e293b"),
    leading=16, spaceAfter=4, leftIndent=14, bulletIndent=0)

CODE = S("Code",
    fontName="Courier-Bold", fontSize=9, textColor=GREEN,
    leading=14, spaceAfter=4, leftIndent=16)

CODE_COMMENT = S("CodeComment",
    fontName="Courier", fontSize=9, textColor=MUTED,
    leading=14, spaceAfter=4, leftIndent=16)

LABEL_GREEN = S("LabelGreen",
    fontName="Helvetica-Bold", fontSize=9, textColor=GREEN,
    leading=13, spaceAfter=2)

LABEL_RED = S("LabelRed",
    fontName="Helvetica-Bold", fontSize=9, textColor=RED,
    leading=13, spaceAfter=2)

LABEL_YELLOW = S("LabelYellow",
    fontName="Helvetica-Bold", fontSize=9, textColor=YELLOW,
    leading=13, spaceAfter=2)

CALLOUT = S("Callout",
    fontName="Helvetica-Bold", fontSize=11, textColor=WHITE,
    alignment=TA_CENTER, leading=16, spaceAfter=0)

QUOTE = S("Quote",
    fontName="Helvetica-Oblique", fontSize=11, textColor=YELLOW,
    alignment=TA_CENTER, leading=17, spaceBefore=6, spaceAfter=6)

# ─── Helpers ─────────────────────────────────────────────────────────────────
def hr(color=BORDER, thickness=0.6):
    return HRFlowable(width="100%", thickness=thickness, color=color,
                      spaceAfter=10, spaceBefore=4)

def sp(h=6):
    return Spacer(1, h)

def navy_box(flowables, bg=NAVY_MID):
    """Wrap flowables in a navy background table."""
    inner = Table([[flowables]], colWidths=[6.8*inch])
    inner.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,-1), bg),
        ("ROUNDEDCORNERS", [6]),
        ("TOPPADDING",   (0,0), (-1,-1), 14),
        ("BOTTOMPADDING",(0,0), (-1,-1), 14),
        ("LEFTPADDING",  (0,0), (-1,-1), 18),
        ("RIGHTPADDING", (0,0), (-1,-1), 18),
        ("BOX",          (0,0), (-1,-1), 0.8, BORDER),
    ]))
    return inner

def stat_row(pairs, colors_list=None):
    """Horizontal stat bar — list of (label, value) pairs."""
    if colors_list is None:
        colors_list = [GREEN] * len(pairs)
    cells = []
    for (label, value), col in zip(pairs, colors_list):
        block = [
            Paragraph(value, S("sv", fontName="Helvetica-Bold", fontSize=18,
                                textColor=col, alignment=TA_CENTER, leading=22)),
            Paragraph(label, S("sl", fontName="Helvetica", fontSize=8,
                                textColor=MUTED, alignment=TA_CENTER, leading=11)),
        ]
        cells.append(block)
    t = Table([cells], colWidths=[6.8*inch / len(pairs)] * len(pairs))
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,-1), NAVY_LIGHT),
        ("TOPPADDING",   (0,0), (-1,-1), 12),
        ("BOTTOMPADDING",(0,0), (-1,-1), 12),
        ("LEFTPADDING",  (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("BOX",          (0,0), (-1,-1), 0.6, BORDER),
        ("LINEAFTER",    (0,0), (-2,-1), 0.4, BORDER),
    ]))
    return t

def two_col(left_items, right_items, left_w=3.2, right_w=3.4):
    left_table  = Table([[item] for item in left_items],  colWidths=[left_w*inch])
    right_table = Table([[item] for item in right_items], colWidths=[right_w*inch])
    left_table.setStyle(TableStyle([("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),0)]))
    right_table.setStyle(TableStyle([("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),0)]))
    wrapper = Table([[left_table, right_table]], colWidths=[left_w*inch, right_w*inch])
    wrapper.setStyle(TableStyle([
        ("VALIGN",       (0,0),(-1,-1),"TOP"),
        ("TOPPADDING",   (0,0),(-1,-1),0),
        ("BOTTOMPADDING",(0,0),(-1,-1),0),
        ("LEFTPADDING",  (0,0),(-1,-1),0),
        ("RIGHTPADDING", (0,0),(0,-1), 10),
        ("RIGHTPADDING", (1,0),(1,-1), 0),
    ]))
    return wrapper

# ─── Cover Page ──────────────────────────────────────────────────────────────
def cover():
    story = []
    # Header band
    header = Table(
        [[Paragraph("TAO TRADING BOT  ·  INTERNAL BRIEF  ·  APRIL 2025", S("hdr",
            fontName="Helvetica-Bold", fontSize=8, textColor=MUTED,
            alignment=TA_CENTER))]],
        colWidths=[7.5*inch]
    )
    header.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), NAVY_MID),
        ("TOPPADDING",   (0,0),(-1,-1), 8),
        ("BOTTOMPADDING",(0,0),(-1,-1), 8),
        ("BOX",          (0,0),(-1,-1), 0.5, BORDER),
    ]))
    story.append(header)
    story.append(sp(50))

    # Classification tag
    tag = Table(
        [[Paragraph("⚡  BREAKTHROUGH SESSION DEBRIEF", S("tag",
            fontName="Helvetica-Bold", fontSize=9, textColor=NAVY,
            alignment=TA_CENTER))]],
        colWidths=[3.2*inch]
    )
    tag.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), GREEN),
        ("TOPPADDING",   (0,0),(-1,-1), 7),
        ("BOTTOMPADDING",(0,0),(-1,-1), 7),
        ("ROUNDEDCORNERS", [4]),
    ]))
    tag_wrapper = Table([[tag]], colWidths=[7.5*inch])
    tag_wrapper.setStyle(TableStyle([("ALIGN",(0,0),(-1,-1),"CENTER")]))
    story.append(tag_wrapper)
    story.append(sp(20))

    story.append(Paragraph("The Last", HERO_LABEL))
    story.append(Paragraph("Revelations", HERO_TITLE))
    story.append(sp(8))
    story.append(Paragraph(
        "How a ghost flag silently killed live trading for days —<br/>"
        "and the three-line fix that opened the gate.",
        HERO_SUB))
    story.append(sp(12))
    story.append(Paragraph(
        f"Session date: April 16, 2025  ·  Finney block #7,977,756",
        DATE_STYLE))
    story.append(sp(50))
    story.append(hr(GREEN, 1.5))
    story.append(sp(18))

    # Live confirmation stats
    story.append(stat_row(
        [
            ("Finney Block", "#7,977,756"),
            ("Wallet Balance", "0.000451 τ"),
            ("Live Strategies", "7"),
            ("Paper Trades", "2,856"),
        ],
        [BLUE, GREEN, INDIGO, YELLOW]
    ))
    story.append(sp(18))
    story.append(hr(BORDER))
    story.append(sp(16))

    # Three-line confirmation box
    story.append(navy_box([
        Paragraph("SYSTEM STATUS — POST FIX", S("bh",
            fontName="Helvetica-Bold", fontSize=9, textColor=MUTED, leading=12, spaceAfter=10)),
        Paragraph("network_connected  :  True  ✅", CODE),
        Paragraph("simulation_mode    :  False ✅", CODE),
        Paragraph("wallet_connected   :  True  ✅", CODE),
        Paragraph("wallet_balance     :  0.000450917 τ  (on-chain confirmed)", CODE),
        Paragraph("Finney block       :  #7,977,756", CODE),
        sp(4),
        Paragraph(
            "The gate is open. The first real stake() call fires on the next LIVE signal.",
            S("bc", fontName="Helvetica-Bold", fontSize=10, textColor=GREEN, leading=15)),
    ]))
    story.append(sp(14))
    story.append(Paragraph("The problem lived in three files. The fix lived in twelve lines of Python.", QUOTE))
    story.append(sp(14))
    story.append(Paragraph(
        "Sections: I. The Scene  ·  II. The Ghost Flag  ·  III. The Forensics  ·  "
        "IV. The Fix  ·  V. The Confirmation  ·  VI. What Fires Next",
        BODY_MUTED))
    story.append(PageBreak())
    return story

# ─── Section I: The Scene ────────────────────────────────────────────────────
def section_scene():
    story = []
    story.append(Paragraph("I.  The Scene", H1))
    story.append(hr())

    story.append(Paragraph(
        "The user stepped away from the terminal for a family break, then returned to find the "
        "system looking healthy on paper — 7 LIVE-flagged strategies, an armed TaoBot hotkey, "
        "a loaded wallet, and 2,856 trades in the log. Everything pointed toward a machine "
        "that should have been placing real bets on Finney mainnet for days.", BODY))

    story.append(Paragraph("It hadn't placed a single one.", S("Bold",
        fontName="Helvetica-Bold", fontSize=11, textColor=RED,
        leading=16, spaceAfter=8)))

    story.append(Paragraph(
        "Every trade was tagged <b>paper</b>. The tx_hash column was NULL across 2,856 rows. "
        "The cycle engine was running. OpenClaw was voting. The strategies were generating "
        "signals. But the execution gate — the single boolean that separates simulation from "
        "reality — was stuck in the wrong position.", BODY))

    story.append(sp(4))

    # Scene inventory table
    data = [
        ["COMPONENT", "CONFIGURED STATE", "ACTUAL RESULT"],
        ["7 LIVE strategies", "Armed → real trades", "Paper trades only"],
        ["TaoBot hotkey", "Loaded on chain", "Never used"],
        ["Wallet balance", "0.000451 τ confirmed", "Never touched"],
        ["OpenClaw votes", "Passing consensus", "Execution gated"],
        ["Cycle engine", "Running every 5 min", "All simulated"],
        ["tx_hash column", "Should show real hashes", "NULL — 2,856 rows"],
    ]
    t = Table(data, colWidths=[2.1*inch, 2.5*inch, 2.2*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0), NAVY_MID),
        ("TEXTCOLOR",    (0,0), (-1,0), MUTED),
        ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("FONTNAME",     (0,1), (-1,-1), "Helvetica"),
        ("TEXTCOLOR",    (0,1), (-1,-1), colors.HexColor("#1e293b")),
        ("BACKGROUND",   (0,1), (-1,-1), WHITE),
        ("BACKGROUND",   (2,1), (2,-1), colors.HexColor("#fff1f2")),
        ("TEXTCOLOR",    (2,1), (2,-1), RED),
        ("FONTNAME",     (2,1), (2,-1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, colors.HexColor("#f8fafc")]),
        ("GRID",         (0,0), (-1,-1), 0.4, BORDER),
        ("TOPPADDING",   (0,0), (-1,-1), 7),
        ("BOTTOMPADDING",(0,0), (-1,-1), 7),
        ("LEFTPADDING",  (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ]))
    story.append(t)
    story.append(sp(12))

    story.append(Paragraph(
        "The system was performing a perfect simulation of a live trading bot — "
        "with none of the live trading.", QUOTE))
    story.append(PageBreak())
    return story

# ─── Section II: The Ghost Flag ──────────────────────────────────────────────
def section_ghost_flag():
    story = []
    story.append(Paragraph("II.  The Ghost Flag", H1))
    story.append(hr())

    story.append(Paragraph(
        "The execution path in <b>cycle_service.py</b> begins with a single gate check:", BODY))

    story.append(navy_box([
        Paragraph("# cycle_service.py — execution gate", CODE_COMMENT),
        Paragraph("if bittensor_service.connected and not simulation_mode:", CODE),
        Paragraph("    await bittensor_service.stake(...)   # REAL trade", CODE),
        Paragraph("else:", CODE),
        Paragraph("    record_paper_trade(...)              # simulation", CODE),
    ]))
    story.append(sp(12))

    story.append(Paragraph(
        "The condition is binary: <b>connected = True</b> → real trade. "
        "<b>connected = False</b> → paper. "
        "That single attribute — <font color='#ff4d6d'><b>bittensor_service.connected</b></font> "
        "— was the entire gate between simulation and reality.", BODY))

    story.append(Paragraph("The flag was never set.", S("BigRed",
        fontName="Helvetica-Bold", fontSize=13, textColor=RED,
        spaceBefore=6, spaceAfter=8, leading=18)))

    story.append(Paragraph(
        "The <b>BittensorService</b> class initialises with:", BODY))

    story.append(navy_box([
        Paragraph("class BittensorService:", CODE),
        Paragraph("    def __init__(self):", CODE),
        Paragraph("        self.connected = False   # initialised dead", CODE),
        Paragraph("        self.wallet_balance = 0.0", CODE),
        Paragraph("        ...", CODE_COMMENT),
    ]))
    story.append(sp(10))

    story.append(Paragraph(
        "<b>get_chain_info()</b> is the only method that ever sets <b>connected = True</b>. "
        "That method was designed to be called at startup — but the startup hook was never wired. "
        "Every time uvicorn started, the flag defaulted to False. Every cycle the engine ran, "
        "it read False. Every trade went to paper.", BODY))

    story.append(sp(6))

    # Timeline of the bug
    story.append(Paragraph("Ghost Flag Timeline", H2))

    timeline_data = [
        ["EVENT", "connected FLAG", "TRADE OUTCOME"],
        ["Server starts (uvicorn)", "False  (default)", "—"],
        ["No startup hook fires", "False  (never touched)", "—"],
        ["Cycle 1 — strategy signals", "False", "→ paper"],
        ["Cycle 2 — OpenClaw votes pass", "False", "→ paper"],
        ["Cycle 100 — 500 trades logged", "False", "→ paper"],
        ["Cycle 572 — 2,856 trades logged", "False", "→ paper"],
        ["FIX DEPLOYED", "True  ✅", "→ LIVE"],
    ]
    t = Table(timeline_data, colWidths=[2.8*inch, 2.0*inch, 2.0*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0), NAVY_MID),
        ("TEXTCOLOR",    (0,0), (-1,0), MUTED),
        ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("FONTNAME",     (0,1), (-1,-1), "Helvetica"),
        ("TEXTCOLOR",    (0,1), (-1,-1), colors.HexColor("#1e293b")),
        ("BACKGROUND",   (0,1), (-1,-1), WHITE),
        ("TEXTCOLOR",    (1,1), (1,-2), RED),
        ("FONTNAME",     (1,1), (1,-2), "Courier-Bold"),
        ("TEXTCOLOR",    (2,1), (2,-2), RED),
        ("BACKGROUND",   (0,-1), (-1,-1), colors.HexColor("#f0fdf4")),
        ("TEXTCOLOR",    (1,-1), (1,-1), GREEN),
        ("TEXTCOLOR",    (2,-1), (2,-1), GREEN),
        ("FONTNAME",     (0,-1), (-1,-1), "Helvetica-Bold"),
        ("GRID",         (0,0), (-1,-1), 0.4, BORDER),
        ("TOPPADDING",   (0,0), (-1,-1), 7),
        ("BOTTOMPADDING",(0,0), (-1,-1), 7),
        ("LEFTPADDING",  (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ]))
    story.append(t)
    story.append(sp(10))

    story.append(Paragraph(
        "The bot ran in perfect silence. No error. No warning. No exception. "
        "Just 2,856 paper trades — and a wallet that never moved.",
        BODY_MUTED))
    story.append(PageBreak())
    return story

# ─── Section III: The Forensics ──────────────────────────────────────────────
def section_forensics():
    story = []
    story.append(Paragraph("III.  The Forensics", H1))
    story.append(hr())

    story.append(Paragraph(
        "The investigation began with a direct API query against the running backend:", BODY))

    story.append(navy_box([
        Paragraph("GET /api/status", CODE),
        sp(4),
        Paragraph('"network_connected": false,', CODE),
        Paragraph('"simulation_mode":   true,', CODE),
        Paragraph('"wallet_connected":  true,', CODE),
        Paragraph('"wallet_balance":    0.000450917', CODE),
    ]))
    story.append(sp(10))

    story.append(Paragraph(
        "The contradiction was visible immediately: <b>wallet_connected: true</b> with "
        "<b>network_connected: false</b>. The wallet exists. The chain is not connected. "
        "But the wallet data came from somewhere — which meant the chain WAS reachable, "
        "just not correctly reported.", BODY))

    story.append(Paragraph(
        "The second clue was the original <b>get_chain_info()</b> implementation:", BODY))

    story.append(navy_box([
        Paragraph("# BEFORE FIX — fragile ordering", CODE_COMMENT),
        Paragraph("async def get_chain_info(self):", CODE),
        Paragraph("    try:", CODE),
        Paragraph("        balance = await substrate.get_balance(self.coldkey_address)", CODE),
        Paragraph("        self.wallet_balance = float(balance)", CODE),
        Paragraph("        block = await substrate.get_block_number()", CODE),
        Paragraph("        self.connected = True   # only reached if BOTH succeed", CODE),
        Paragraph("    except Exception:", CODE),
        Paragraph("        self.connected = False  # balance error kills connection flag", CODE),
    ]))
    story.append(sp(10))

    story.append(Paragraph(
        "<b>connected</b> was set AFTER the balance query — meaning any transient balance "
        "fetch failure (network hiccup, RPC timeout, dust balance edge case) would leave "
        "the flag at False even if the chain was fully reachable. The block query — which "
        "is the real proof of connectivity — came after, and was never reached.",BODY))

    story.append(Paragraph(
        "Two independent failure modes in a single try block. One silent. One fatal to trading.",
        S("Emph", fontName="Helvetica-Oblique", fontSize=10,
          textColor=YELLOW, leading=15, spaceAfter=8)))

    story.append(sp(4))

    story.append(Paragraph("The Three Root Causes", H2))

    causes = [
        ("1", RED, "No startup hook",
         "get_chain_info() was never called after uvicorn start. "
         "connected remained False from object initialization — forever."),
        ("2", ORANGE, "Fragile exception grouping",
         "Balance query and block query lived in the same try block. "
         "A balance failure suppressed the block query and the connection flag."),
        ("3", YELLOW, "No self-healing",
         "cycle_service never re-checked connectivity. Once False at start, "
         "it stayed False until the next full server restart — which reset it to False again."),
    ]

    for num, col, title, body_text in causes:
        box_data = [[
            Paragraph(num, S(f"n{num}", fontName="Helvetica-Bold", fontSize=20,
                             textColor=col, alignment=TA_CENTER)),
            [Paragraph(title, S(f"t{num}", fontName="Helvetica-Bold", fontSize=11,
                                textColor=col, leading=15, spaceAfter=4)),
             Paragraph(body_text, BODY)]
        ]]
        t = Table(box_data, colWidths=[0.5*inch, 6.2*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND",   (0,0),(-1,-1), NAVY_LIGHT),
            ("BOX",          (0,0),(-1,-1), 0.6, BORDER),
            ("LINEAFTER",    (0,0),(0,-1), 2.0, col),
            ("TOPPADDING",   (0,0),(-1,-1), 12),
            ("BOTTOMPADDING",(0,0),(-1,-1), 12),
            ("LEFTPADDING",  (0,0),(0,-1), 10),
            ("LEFTPADDING",  (1,0),(1,-1), 14),
            ("RIGHTPADDING", (0,0),(-1,-1), 12),
            ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
        ]))
        story.append(t)
        story.append(sp(8))

    story.append(PageBreak())
    return story

# ─── Section IV: The Fix ─────────────────────────────────────────────────────
def section_fix():
    story = []
    story.append(Paragraph("IV.  The Fix", H1))
    story.append(hr())

    story.append(Paragraph(
        "Three files. Twelve lines of Python. The entire gate unlocked.", BODY))

    story.append(sp(6))

    # File 1
    story.append(Paragraph("File 1 of 3 — bittensor_service.py", H2))
    story.append(Paragraph(
        "Decouple the block query from the balance query. "
        "Block response = connected, regardless of balance outcome.", BODY))

    story.append(navy_box([
        Paragraph("# AFTER FIX — resilient, decoupled", CODE_COMMENT),
        Paragraph("async def get_chain_info(self):", CODE),
        Paragraph("    # Block query proves connectivity — independent", CODE_COMMENT),
        Paragraph("    try:", CODE),
        Paragraph("        block = await substrate.get_block_number()", CODE),
        Paragraph("        self.connected = True   # ← chain responds = connected", CODE),
        Paragraph("    except Exception:", CODE),
        Paragraph("        self.connected = False", CODE),
        Paragraph("    # Balance query — failure is non-fatal", CODE_COMMENT),
        Paragraph("    try:", CODE),
        Paragraph("        balance = await substrate.get_balance(self.coldkey_address)", CODE),
        Paragraph("        self.wallet_balance = float(balance)", CODE),
        Paragraph("    except Exception:", CODE),
        Paragraph("        pass   # ← balance error never kills the connection flag", CODE),
    ]))
    story.append(sp(10))

    # File 2
    story.append(Paragraph("File 2 of 3 — main.py", H2))
    story.append(Paragraph(
        "Wire a startup hook. Fire get_chain_info() as a background task "
        "on every uvicorn boot, before the first cycle runs.", BODY))

    story.append(navy_box([
        Paragraph("# main.py — startup hook", CODE_COMMENT),
        Paragraph("@app.on_event('startup')", CODE),
        Paragraph("async def startup_event():", CODE),
        Paragraph("    asyncio.create_task(bittensor_service.get_chain_info())", CODE),
        Paragraph("    # connected = True before cycle 1 fires", CODE_COMMENT),
    ]))
    story.append(sp(10))

    # File 3
    story.append(Paragraph("File 3 of 3 — cycle_service.py", H2))
    story.append(Paragraph(
        "Add auto-reconnect. Once per cycle, if connected ever drops, "
        "call get_chain_info() again. Self-healing from transient RPC failures.", BODY))

    story.append(navy_box([
        Paragraph("# cycle_service.py — self-healing reconnect", CODE_COMMENT),
        Paragraph("async def run_cycle(self):", CODE),
        Paragraph("    # Reconnect if connection dropped", CODE_COMMENT),
        Paragraph("    if not bittensor_service.connected:", CODE),
        Paragraph("        await bittensor_service.get_chain_info()", CODE),
        Paragraph("    # ... rest of cycle logic", CODE_COMMENT),
    ]))
    story.append(sp(12))

    # Impact summary
    story.append(Paragraph("Fix Impact Summary", H2))
    data = [
        ["ROOT CAUSE", "FIX", "EFFECT"],
        ["No startup hook", "startup_event() fires get_chain_info()",
         "connected = True before cycle 1"],
        ["Fragile exception grouping", "Block and balance queries decoupled",
         "Balance fail ≠ disconnected"],
        ["No self-healing", "Auto-reconnect once per cycle",
         "Survives transient RPC drops"],
        ["simulation_mode stuck True", "All three above combined",
         "simulation_mode = False ✅"],
    ]
    t = Table(data, colWidths=[2.0*inch, 2.8*inch, 2.0*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0), NAVY_MID),
        ("TEXTCOLOR",    (0,0), (-1,0), MUTED),
        ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("FONTNAME",     (0,1), (-1,-1), "Helvetica"),
        ("TEXTCOLOR",    (0,1), (-1,-1), colors.HexColor("#1e293b")),
        ("BACKGROUND",   (0,1), (-1,-1), WHITE),
        ("BACKGROUND",   (0,-1), (-1,-1), colors.HexColor("#f0fdf4")),
        ("TEXTCOLOR",    (0,-1), (-1,-1), colors.HexColor("#166534")),
        ("FONTNAME",     (0,-1), (-1,-1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS",(0,1),(-1,-2),[WHITE, colors.HexColor("#f8fafc")]),
        ("GRID",         (0,0), (-1,-1), 0.4, BORDER),
        ("TOPPADDING",   (0,0), (-1,-1), 8),
        ("BOTTOMPADDING",(0,0), (-1,-1), 8),
        ("LEFTPADDING",  (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ]))
    story.append(t)
    story.append(PageBreak())
    return story

# ─── Section V: The Confirmation ─────────────────────────────────────────────
def section_confirmation():
    story = []
    story.append(Paragraph("V.  The Confirmation", H1))
    story.append(hr())

    story.append(Paragraph(
        "The three-file fix was deployed, uvicorn restarted, and the status endpoint queried "
        "within seconds. The result:", BODY))

    story.append(sp(6))
    story.append(navy_box([
        Paragraph("GET /api/status  — post-fix response", CODE_COMMENT),
        sp(4),
        Paragraph('"network_connected":  true,   ✅', CODE),
        Paragraph('"simulation_mode":    false,  ✅', CODE),
        Paragraph('"wallet_connected":   true,   ✅', CODE),
        Paragraph('"wallet_balance":     0.000450917,', CODE),
        Paragraph('"block_number":       7977756,', CODE),
        Paragraph('"active_strategies":  7', CODE),
    ]))
    story.append(sp(14))

    story.append(stat_row(
        [
            ("Chain", "LIVE"),
            ("Mode", "REAL"),
            ("Block", "#7,977,756"),
            ("Balance", "0.000451 τ"),
            ("Strategies", "7 LIVE"),
        ],
        [GREEN, GREEN, BLUE, YELLOW, INDIGO]
    ))
    story.append(sp(14))

    story.append(Paragraph("The Seven Live Strategies Armed and Ready", H2))

    strategies = [
        ("Yield Maximizer",      INDIGO,  "Chases highest emission-rate subnets"),
        ("Emission Momentum",    BLUE,    "Follows accelerating emission curves"),
        ("Balanced Risk",        GREEN,   "Equal-weight across top-tier subnets"),
        ("Liquidity Hunter",     YELLOW,  "Targets high-depth alpha pools"),
        ("dTAO Flow Momentum",   ORANGE,  "Rides institutional stake inflows"),
        ("Contrarian Flow",      PURPLE,  "Fades overcrowded subnets"),
        ("Momentum Cascade",     RED,     "Amplifies multi-subnet momentum breaks"),
    ]

    for name, col, desc in strategies:
        row = Table([[
            Paragraph("●", S("dot", fontName="Helvetica-Bold", fontSize=14,
                              textColor=col, alignment=TA_CENTER)),
            [Paragraph(name, S("sn", fontName="Helvetica-Bold", fontSize=10,
                               textColor=col, leading=14, spaceAfter=2)),
             Paragraph(desc, BODY_MUTED)]
        ]], colWidths=[0.35*inch, 6.35*inch])
        row.setStyle(TableStyle([
            ("TOPPADDING",   (0,0),(-1,-1), 6),
            ("BOTTOMPADDING",(0,0),(-1,-1), 6),
            ("LEFTPADDING",  (0,0),(0,-1), 6),
            ("LEFTPADDING",  (1,0),(1,-1), 10),
            ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
            ("LINEBELOW",    (0,0),(-1,-1), 0.3, BORDER),
        ]))
        story.append(row)

    story.append(sp(14))
    story.append(Paragraph(
        "The wallet balance confirms the chain is live and the address is real. "
        "The block number advances every ~12 seconds. The strategies are armed. "
        "OpenClaw is watching. The next signal that clears consensus will fire "
        "<b>stake()</b> — and the first real tx_hash will appear in the trade history.",
        BODY))
    story.append(PageBreak())
    return story

# ─── Section VI: What Fires Next ─────────────────────────────────────────────
def section_next():
    story = []
    story.append(Paragraph("VI.  What Fires Next", H1))
    story.append(hr())

    story.append(Paragraph(
        "The gate is open. The sequence from here is fully autonomous:", BODY))

    steps = [
        ("01", GREEN,   "Signal Generated",
         "A LIVE strategy identifies a stake opportunity — subnet APY spike, "
         "emission momentum break, or liquidity inflow — and generates a BUY signal."),
        ("02", BLUE,    "OpenClaw Consensus",
         "The signal is submitted to OpenClaw. 7 of 12 bots must vote YES "
         "for the trade to proceed. Minority dissent is logged but overridden."),
        ("03", INDIGO,  "stake() Fires",
         "cycle_service calls bittensor_service.stake(subnet_id, amount). "
         "The real TAO transfer executes on Finney mainnet via the SubstrateInterface."),
        ("04", YELLOW,  "tx_hash Recorded",
         "The chain returns a transaction hash. It is written to the trades table. "
         "This is the first non-NULL tx_hash in the entire trade history."),
        ("05", ORANGE,  "Position Tracked",
         "The staked position appears in the Wallet page under the subnet heat map. "
         "Alpha token balance (αTAO) is fetched from chain and displayed."),
        ("06", PURPLE,  "Unstake Available",
         "When the strategy signals EXIT, stake() reverses: αTAO → TAO flows back "
         "to the wallet. The full round-trip is on-chain and auditable."),
    ]

    for num, col, title, body_text in steps:
        box_data = [[
            Paragraph(num, S(f"step{num}", fontName="Helvetica-Bold", fontSize=16,
                             textColor=col, alignment=TA_CENTER)),
            [Paragraph(title, S(f"stept{num}", fontName="Helvetica-Bold", fontSize=11,
                                textColor=col, leading=15, spaceAfter=4)),
             Paragraph(body_text, BODY)]
        ]]
        t = Table(box_data, colWidths=[0.55*inch, 6.15*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND",   (0,0),(-1,-1), NAVY_LIGHT),
            ("BOX",          (0,0),(-1,-1), 0.5, BORDER),
            ("LINEBEFORE",   (0,0),(0,-1), 3.0, col),
            ("TOPPADDING",   (0,0),(-1,-1), 12),
            ("BOTTOMPADDING",(0,0),(-1,-1), 12),
            ("LEFTPADDING",  (0,0),(0,-1), 10),
            ("LEFTPADDING",  (1,0),(1,-1), 14),
            ("RIGHTPADDING", (0,0),(-1,-1), 12),
            ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
        ]))
        story.append(t)
        story.append(sp(6))

    story.append(sp(10))
    story.append(hr(GREEN, 1.0))
    story.append(sp(12))

    # Final callout
    callout = Table(
        [[Paragraph(
            "The 2,856 paper trades built the track record.\n"
            "The fix opened the gate.\n"
            "The first real tx_hash closes the loop.",
            S("final", fontName="Helvetica-Bold", fontSize=13, textColor=GREEN,
              alignment=TA_CENTER, leading=22)
        )]],
        colWidths=[6.8*inch]
    )
    callout.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), NAVY_MID),
        ("BOX",          (0,0),(-1,-1), 1.0, GREEN),
        ("TOPPADDING",   (0,0),(-1,-1), 22),
        ("BOTTOMPADDING",(0,0),(-1,-1), 22),
        ("LEFTPADDING",  (0,0),(-1,-1), 20),
        ("RIGHTPADDING", (0,0),(-1,-1), 20),
    ]))
    story.append(callout)
    story.append(sp(16))

    # Pending items
    story.append(Paragraph("Remaining Open Items", H2))
    pending = [
        ("Manual trade panel", "One button → stake() from UI. Not yet wired."),
        ("Real αTAO positions in Wallet", "Live staked balances per subnet from chain."),
        ("First real tx_hash", "Next LIVE signal + OpenClaw pass → on-chain."),
        ("PDF sections: Strategies, Trades", "Additional report sections deferred."),
        ("Agent Fleet bugs", "Toggle no-refetch, Promote CTA, demotion indicator."),
    ]
    for item, note in pending:
        row_data = [[
            Paragraph("○", S("circ", fontName="Helvetica", fontSize=12,
                              textColor=YELLOW, alignment=TA_CENTER)),
            [Paragraph(item, S("pi", fontName="Helvetica-Bold", fontSize=10,
                               textColor=colors.HexColor("#1e293b"), leading=14, spaceAfter=2)),
             Paragraph(note, BODY_MUTED)]
        ]]
        t = Table(row_data, colWidths=[0.35*inch, 6.35*inch])
        t.setStyle(TableStyle([
            ("TOPPADDING",   (0,0),(-1,-1), 5),
            ("BOTTOMPADDING",(0,0),(-1,-1), 5),
            ("LEFTPADDING",  (0,0),(0,-1), 6),
            ("LEFTPADDING",  (1,0),(1,-1), 10),
            ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
            ("LINEBELOW",    (0,0),(-1,-1), 0.3, BORDER),
        ]))
        story.append(t)

    story.append(sp(16))
    story.append(Paragraph(
        f"TAO Trading Bot  ·  The Last Revelations  ·  "
        f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}  ·  "
        f"Finney block #7,977,756  ·  CONFIDENTIAL",
        S("footer", fontName="Helvetica", fontSize=8, textColor=MUTED,
          alignment=TA_CENTER)))
    return story

# ─── Build ───────────────────────────────────────────────────────────────────
def build():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=letter,
        leftMargin=0.6*inch,
        rightMargin=0.6*inch,
        topMargin=0.55*inch,
        bottomMargin=0.55*inch,
    )

    story = []
    story += cover()
    story += section_scene()
    story += section_ghost_flag()
    story += section_forensics()
    story += section_fix()
    story += section_confirmation()
    story += section_next()

    doc.build(story)
    print(f"✅  PDF written → {OUTPUT}")

if __name__ == "__main__":
    build()