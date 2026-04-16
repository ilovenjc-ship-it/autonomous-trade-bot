"""
TAO Trading Bot — The Ghost Flag
A short, sharp definition brief.
Coined April 16, 2025. First recorded instance.

Run: python generate_ghost_flag_brief.py
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from datetime import datetime

OUTPUT = "/workspace/report/TAO_Bot_Ghost_Flag.pdf"

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
GHOST      = colors.HexColor("#94a3b8")   # muted — the ghost colour
WHITE      = colors.HexColor("#f1f5f9")
MUTED      = colors.HexColor("#64748b")
SLATE      = colors.HexColor("#1e293b")
DARK_GHOST = colors.HexColor("#0f172a")   # near-black ghost bg

def S(name, **kw):
    return ParagraphStyle(name, **kw)

def hr(color=BORDER, thickness=0.6):
    return HRFlowable(width="100%", thickness=thickness,
                      color=color, spaceAfter=10, spaceBefore=4)

def sp(h=6):
    return Spacer(1, h)

def box(flowables, bg=NAVY_MID, border=BORDER, bw=0.8, pad=16):
    t = Table([[flowables]], colWidths=[6.8*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), bg),
        ("TOPPADDING",    (0,0),(-1,-1), pad),
        ("BOTTOMPADDING", (0,0),(-1,-1), pad),
        ("LEFTPADDING",   (0,0),(-1,-1), pad+2),
        ("RIGHTPADDING",  (0,0),(-1,-1), pad+2),
        ("BOX",           (0,0),(-1,-1), bw, border),
    ]))
    return t

# ─── Styles ──────────────────────────────────────────────────────────────────
CLASSIFY = S("Classify", fontName="Helvetica-Bold", fontSize=8,
    textColor=GHOST, alignment=TA_CENTER, leading=12)

DEF_WORD  = S("DefWord", fontName="Helvetica-Bold", fontSize=52,
    textColor=WHITE, alignment=TA_CENTER, leading=58, spaceAfter=0)

DEF_POS   = S("DefPos", fontName="Helvetica-Oblique", fontSize=13,
    textColor=GHOST, alignment=TA_CENTER, leading=18, spaceAfter=6)

DEF_BODY  = S("DefBody", fontName="Helvetica", fontSize=12,
    textColor=WHITE, alignment=TA_CENTER, leading=20, spaceAfter=8)

H1   = S("H1", fontName="Helvetica-Bold", fontSize=17, textColor=WHITE,
    spaceBefore=22, spaceAfter=8)
H2   = S("H2", fontName="Helvetica-Bold", fontSize=12, textColor=INDIGO,
    spaceBefore=14, spaceAfter=5)
BODY = S("Body", fontName="Helvetica", fontSize=10, textColor=colors.HexColor("#cbd5e1"),
    leading=17, spaceAfter=9)
BODY_WHITE = S("BodyW", fontName="Helvetica", fontSize=10, textColor=WHITE,
    leading=17, spaceAfter=9)
BODY_MUTED = S("BodyM", fontName="Helvetica", fontSize=9,
    textColor=GHOST, leading=14, spaceAfter=6)
CODE   = S("Code", fontName="Courier-Bold", fontSize=9, textColor=GREEN,
    leading=15, spaceAfter=3, leftIndent=14)
CODE_G = S("CodeG", fontName="Courier", fontSize=9, textColor=GHOST,
    leading=15, spaceAfter=3, leftIndent=14)
CODE_R = S("CodeR", fontName="Courier-Bold", fontSize=9, textColor=RED,
    leading=15, spaceAfter=3, leftIndent=14)
QUOTE  = S("Quote", fontName="Helvetica-BoldOblique", fontSize=13,
    textColor=YELLOW, alignment=TA_CENTER, leading=20,
    spaceBefore=8, spaceAfter=8)
ATTR   = S("Attr", fontName="Helvetica", fontSize=9,
    textColor=GHOST, alignment=TA_CENTER, leading=13)
FOOTER = S("Footer", fontName="Helvetica", fontSize=8,
    textColor=MUTED, alignment=TA_CENTER)

# ─── Cover / Definition Page ─────────────────────────────────────────────────
def cover():
    story = []

    # Full-page dark header band
    hdr = Table([[Paragraph(
        "TAO TRADING BOT  ·  ENGINEERING LEXICON  ·  APRIL 16, 2025",
        CLASSIFY)]],
        colWidths=[7.5*inch])
    hdr.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), DARK_GHOST),
        ("TOPPADDING",    (0,0),(-1,-1), 9),
        ("BOTTOMPADDING", (0,0),(-1,-1), 9),
        ("BOX",           (0,0),(-1,-1), 0.5, BORDER),
    ]))
    story.append(hdr)
    story.append(sp(52))

    # The definition card
    defn = Table([[
        [
            sp(8),
            Paragraph("ghost flag", DEF_WORD),
            sp(4),
            Paragraph("noun  /ɡōst flæɡ/  ·  software engineering", DEF_POS),
            sp(12),
            hr(GHOST, 0.5),
            sp(12),
            Paragraph(
                "A boolean variable that is initialised to a default value,<br/>"
                "checked faithfully by every system that depends on it,<br/>"
                "and <b>never set to its intended state.</b>",
                DEF_BODY),
            sp(8),
            Paragraph(
                "It does not crash. It does not warn. It does not log.<br/>"
                "It simply haunts the codebase at <b>False</b> —<br/>"
                "silently routing every decision away from reality.",
                DEF_BODY),
            sp(12),
            hr(GHOST, 0.5),
            sp(12),
            Paragraph(
                "Distinguished from a bug by the absence of error.<br/>"
                "Distinguished from a misconfiguration by the presence of intent.<br/>"
                "The flag was supposed to come alive. It never did.",
                S("di", fontName="Helvetica-Oblique", fontSize=10,
                  textColor=GHOST, alignment=TA_CENTER, leading=17)),
            sp(8),
        ]
    ]], colWidths=[6.8*inch])
    defn.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), DARK_GHOST),
        ("BOX",           (0,0),(-1,-1), 1.2, GHOST),
        ("TOPPADDING",    (0,0),(-1,-1), 24),
        ("BOTTOMPADDING", (0,0),(-1,-1), 24),
        ("LEFTPADDING",   (0,0),(-1,-1), 24),
        ("RIGHTPADDING",  (0,0),(-1,-1), 24),
    ]))
    story.append(defn)
    story.append(sp(20))
    story.append(Paragraph(
        "First recorded instance: TAO Trading Bot, April 16, 2025.",
        ATTR))
    story.append(sp(4))
    story.append(Paragraph(
        "bittensor_service.connected — initialised False, never set at startup,<br/>"
        "silently gated 2,856 trades to paper for four days.",
        ATTR))
    story.append(PageBreak())
    return story

# ─── Page 2: The Anatomy ─────────────────────────────────────────────────────
def page_anatomy():
    story = []
    story.append(Paragraph("The Anatomy of a Ghost Flag", H1))
    story.append(hr(GHOST, 0.8))
    story.append(sp(4))

    story.append(Paragraph(
        "Three elements must be present for a ghost flag to exist. "
        "Remove any one of them and it becomes a normal bug — detectable, "
        "noisy, fixable. Together, they create something quieter.", BODY))

    story.append(sp(8))

    elements = [
        (GHOST,  "Element 1 — The Initialisation",
         "The flag is born at False. This is correct and intentional. "
         "Every service that hasn't connected yet should report disconnected. "
         "Nothing suspicious here.",
         [
             "class BittensorService:",
             "    def __init__(self):",
             "        self.connected = False   # correct — not yet connected",
         ], None),

        (GHOST,  "Element 2 — The Check",
         "Everything downstream reads the flag honestly. The execution gate "
         "checks it on every cycle. The API reports it to the UI. "
         "The cycle engine branches on it. The flag is doing its job — "
         "it's just stuck in the wrong position.",
         [
             "# cycle_service.py — runs every 5 minutes",
             "if bittensor_service.connected:   # reads the flag",
             "    await stake(...)              # real trade",
             "else:",
             "    record_paper_trade(...)       # simulation",
         ], None),

        (RED,    "Element 3 — The Missing Setter",
         "The only method that ever sets connected = True is get_chain_info(). "
         "That method was never called after server startup. "
         "No startup hook. No retry. No trigger. "
         "The flag sat at False from the moment uvicorn started "
         "to the moment it was restarted — which reset it to False again.",
         [
             "# main.py — BEFORE the fix",
             "# @app.on_event('startup')    ← this line did not exist",
             "# async def startup_event():  ← this function did not exist",
             "#     get_chain_info()        ← this call never fired",
             "",
             "# Result: connected stayed False. Forever.",
         ], RED),
    ]

    for col, title, body_text, code_lines, code_col in elements:
        code_paras = []
        for line in code_lines:
            if line == "":
                code_paras.append(sp(4))
            elif line.startswith("#") or "←" in line:
                c = code_col if code_col else GHOST
                code_paras.append(Paragraph(line, S("cc", fontName="Courier",
                    fontSize=9, textColor=c, leading=15, spaceAfter=3, leftIndent=14)))
            else:
                code_paras.append(Paragraph(line, CODE))

        content = [
            Paragraph(title, S("et", fontName="Helvetica-Bold", fontSize=12,
                textColor=col, leading=16, spaceAfter=6)),
            Paragraph(body_text, BODY),
            sp(4),
        ] + code_paras

        t = Table([[content]], colWidths=[6.8*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,-1), NAVY_LIGHT),
            ("BOX",           (0,0),(-1,-1), 0.5, BORDER),
            ("LINEBEFORE",    (0,0),(0,-1), 3.0, col),
            ("TOPPADDING",    (0,0),(-1,-1), 14),
            ("BOTTOMPADDING", (0,0),(-1,-1), 14),
            ("LEFTPADDING",   (0,0),(-1,-1), 16),
            ("RIGHTPADDING",  (0,0),(-1,-1), 14),
        ]))
        story.append(t)
        story.append(sp(10))

    story.append(sp(4))
    story.append(Paragraph(
        "The system was not broken. It was working exactly as written.\n"
        "That is what makes a ghost flag so hard to find.",
        QUOTE))
    story.append(PageBreak())
    return story

# ─── Page 3: Why It's Different ──────────────────────────────────────────────
def page_different():
    story = []
    story.append(Paragraph("Why It Is Not a Bug. Not a Misconfiguration. A Ghost.", H1))
    story.append(hr(GHOST, 0.8))
    story.append(sp(4))

    story.append(Paragraph(
        "Engineering has good names for most failure modes. "
        "The ghost flag doesn't fit any of them cleanly — "
        "and that is precisely why it needed a name of its own.", BODY))

    story.append(sp(8))

    compare_data = [
        ["",              "BUG",              "MISCONFIGURATION",   "GHOST FLAG"],
        ["Error thrown?", "Usually",          "Sometimes",          "Never"],
        ["Log entry?",    "Usually",          "Sometimes",          "Never"],
        ["Code is wrong?","Yes",              "No — code is right", "No — code is right"],
        ["Config is wrong?","Sometimes",      "Yes",                "No — default is right"],
        ["Setter missing?","Not typically",   "Not typically",      "Yes — this is the ghost"],
        ["Detectable?",   "Yes — it fails",   "Yes — wrong output", "Only by knowing intent"],
        ["Silent?",       "Rarely",           "Sometimes",          "Always"],
        ["System runs?",  "Partially/crashes","Yes, wrongly",       "Yes, flawlessly — wrong"],
    ]

    col_w = [1.8*inch, 1.5*inch, 1.8*inch, 1.5*inch]
    t = Table(compare_data, colWidths=col_w)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0), DARK_GHOST),
        ("TEXTCOLOR",     (0,0),(-1,0), GHOST),
        ("FONTNAME",      (0,0),(-1,0), "Helvetica-Bold"),
        ("BACKGROUND",    (3,0),(3,0), DARK_GHOST),
        ("TEXTCOLOR",     (3,0),(3,0), WHITE),
        ("FONTNAME",      (0,0),(-1,-1), "Helvetica"),
        ("FONTSIZE",      (0,0),(-1,-1), 8.5),
        ("BACKGROUND",    (0,1),(0,-1), DARK_GHOST),
        ("TEXTCOLOR",     (0,1),(0,-1), GHOST),
        ("FONTNAME",      (0,1),(0,-1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS",(1,1),(-1,-1),[NAVY_LIGHT, NAVY_MID]),
        ("TEXTCOLOR",     (1,1),(-1,-1), colors.HexColor("#94a3b8")),
        # Ghost flag column — highlight
        ("BACKGROUND",    (3,1),(3,-1), DARK_GHOST),
        ("TEXTCOLOR",     (3,1),(3,-1), WHITE),
        ("FONTNAME",      (3,5),(3,5), "Helvetica-Bold"),
        ("TEXTCOLOR",     (3,5),(3,5), RED),
        # Always / Never — bold white
        ("FONTNAME",      (3,1),(3,1), "Helvetica-Bold"),
        ("TEXTCOLOR",     (3,1),(3,1), GREEN),
        ("FONTNAME",      (3,7),(3,7), "Helvetica-Bold"),
        ("TEXTCOLOR",     (3,7),(3,7), RED),
        ("FONTNAME",      (3,8),(3,8), "Helvetica-Bold"),
        ("TEXTCOLOR",     (3,8),(3,8), YELLOW),
        ("GRID",          (0,0),(-1,-1), 0.4, BORDER),
        ("TOPPADDING",    (0,0),(-1,-1), 8),
        ("BOTTOMPADDING", (0,0),(-1,-1), 8),
        ("LEFTPADDING",   (0,0),(-1,-1), 8),
        ("RIGHTPADDING",  (0,0),(-1,-1), 8),
        ("ALIGN",         (1,0),(-1,-1), "CENTER"),
    ]))
    story.append(t)
    story.append(sp(14))

    story.append(Paragraph("The Diagnostic Problem", H2))
    story.append(Paragraph(
        "A bug announces itself. A ghost flag never does. "
        "The only way to find a ghost flag is to ask: "
        "<i>'Is there a variable that controls critical behaviour "
        "whose setter is never called?'</i> "
        "That question is not in any standard debugging playbook. "
        "You have to already suspect it to look for it.", BODY))

    story.append(Paragraph(
        "In the TAO Bot, the discovery came from reading the status API "
        "and noticing a contradiction: wallet connected, balance confirmed, "
        "but network reported disconnected. Something was reporting wrong. "
        "That anomaly led to the flag. The flag led to the missing startup hook. "
        "The startup hook led to the fix.", BODY))

    story.append(sp(6))
    story.append(Paragraph(
        "The ghost doesn't leave footprints.\nYou find it by noticing what should be there — and isn't.",
        QUOTE))
    story.append(PageBreak())
    return story

# ─── Page 4: The Case File ───────────────────────────────────────────────────
def page_case_file():
    story = []
    story.append(Paragraph("Case File — First Recorded Instance", H1))
    story.append(hr(GHOST, 0.8))
    story.append(sp(4))

    story.append(Paragraph(
        "For the record. Exactly as it happened.", BODY_MUTED))
    story.append(sp(8))

    # Case file card
    case_content = [
        Paragraph("GHOST FLAG INCIDENT REPORT", S("cfh",
            fontName="Helvetica-Bold", fontSize=9, textColor=GHOST,
            leading=12, spaceAfter=10)),
        Paragraph("System        :  TAO Autonomous Trading Bot", CODE_G),
        Paragraph("Flag          :  bittensor_service.connected", CODE),
        Paragraph("Default value :  False", CODE_G),
        Paragraph("Intended value:  True (after chain connection confirmed)", CODE_G),
        Paragraph("Set by        :  get_chain_info()  ←  never called at startup", CODE_R),
        Paragraph("Duration      :  Unknown — likely since first deployment", CODE_G),
        Paragraph("Trades lost   :  2,856  (all routed to paper)", CODE_R),
        Paragraph("Real tx_hash  :  NULL — 2,856 rows", CODE_R),
        Paragraph("TAO on-chain  :  0.000450917 τ — untouched", CODE_G),
        sp(6),
        Paragraph("Discovery method:", CODE_G),
        Paragraph(
            "  GET /api/status → wallet_connected: true + network_connected: false",
            CODE),
        Paragraph(
            "  Contradiction: wallet data exists, chain unreachable? Impossible.",
            CODE_G),
        Paragraph(
            "  → Inspected get_chain_info() → missing startup hook confirmed.",
            CODE),
        sp(6),
        Paragraph("Fix — three files, twelve lines:", CODE_G),
        Paragraph("  1. bittensor_service.py — decouple block/balance queries", CODE),
        Paragraph("  2. main.py             — startup hook fires get_chain_info()", CODE),
        Paragraph("  3. cycle_service.py    — auto-reconnect once per cycle", CODE),
        sp(6),
        Paragraph("Post-fix status:", CODE_G),
        Paragraph("  network_connected: true  ·  simulation_mode: false", CODE),
        Paragraph("  Finney block #7,977,756  ·  Gate open.", CODE),
    ]

    story.append(box(case_content, bg=DARK_GHOST, border=GHOST, bw=1.0, pad=18))
    story.append(sp(16))

    story.append(Paragraph(
        "The ghost lived in three lines.\nThe fix took twelve.\nThe silence lasted 2,856 trades.",
        QUOTE))

    story.append(sp(20))
    story.append(hr(GHOST, 0.5))
    story.append(sp(10))

    # Closing
    story.append(Paragraph(
        "ghost flag  (n.)  —  coined April 16, 2025, during the TAO Bot breakthrough session.",
        ATTR))
    story.append(sp(4))
    story.append(Paragraph(
        "If you found this term useful, you probably just survived one.",
        S("cl", fontName="Helvetica-Oblique", fontSize=10,
          textColor=GHOST, alignment=TA_CENTER, leading=15)))
    story.append(sp(20))
    story.append(Paragraph(
        f"TAO Trading Bot  ·  Engineering Lexicon  ·  "
        f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}  ·  CONFIDENTIAL",
        FOOTER))
    return story

# ─── Build ────────────────────────────────────────────────────────────────────
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
    story += page_anatomy()
    story += page_different()
    story += page_case_file()
    doc.build(story)
    print(f"✅  PDF written → {OUTPUT}")

if __name__ == "__main__":
    build()