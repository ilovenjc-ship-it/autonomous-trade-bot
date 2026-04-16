"""
TAO Trading Bot — Master State Brief
The permanent handoff document.
Any future II Agent reads this first.
Updated at the end of every session.

Run: python generate_master_state_brief.py
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from datetime import datetime

OUTPUT = "/workspace/report/TAO_Bot_Master_State_Brief.pdf"

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
MUTED      = colors.HexColor("#64748b")
GHOST      = colors.HexColor("#94a3b8")
SLATE      = colors.HexColor("#1e293b")

def S(name, **kw):  return ParagraphStyle(name, **kw)
def hr(c=BORDER, t=0.6): return HRFlowable(width="100%", thickness=t, color=c, spaceAfter=10, spaceBefore=4)
def sp(h=6):        return Spacer(1, h)

def box(items, bg=NAVY_MID, bc=BORDER, bw=0.8, pad=14):
    t = Table([[items]], colWidths=[6.8*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), bg),
        ("TOPPADDING",    (0,0),(-1,-1), pad),
        ("BOTTOMPADDING", (0,0),(-1,-1), pad),
        ("LEFTPADDING",   (0,0),(-1,-1), pad+4),
        ("RIGHTPADDING",  (0,0),(-1,-1), pad+4),
        ("BOX",           (0,0),(-1,-1), bw, bc),
    ]))
    return t

def left_bar(items, color=GREEN):
    t = Table([[items]], colWidths=[6.8*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), NAVY_LIGHT),
        ("LINEBEFORE",    (0,0),(0,-1), 3.5, color),
        ("TOPPADDING",    (0,0),(-1,-1), 12),
        ("BOTTOMPADDING", (0,0),(-1,-1), 12),
        ("LEFTPADDING",   (0,0),(-1,-1), 16),
        ("RIGHTPADDING",  (0,0),(-1,-1), 14),
        ("BOX",           (0,0),(-1,-1), 0.4, BORDER),
    ]))
    return t

# ─── Styles ──────────────────────────────────────────────────────────────────
HERO_TAG   = S("HTag",  fontName="Helvetica-Bold", fontSize=9,  textColor=GREEN,  alignment=TA_CENTER, spaceAfter=4)
HERO_TITLE = S("HTitle",fontName="Helvetica-Bold", fontSize=40, textColor=NAVY,   alignment=TA_CENTER, leading=46, spaceAfter=4)
HERO_SUB   = S("HSub",  fontName="Helvetica",      fontSize=13, textColor=MUTED,  alignment=TA_CENTER, leading=18, spaceAfter=4)
DATE_S     = S("Date",  fontName="Helvetica",      fontSize=9,  textColor=MUTED,  alignment=TA_CENTER)
H1         = S("H1",    fontName="Helvetica-Bold", fontSize=16, textColor=WHITE,  spaceBefore=20, spaceAfter=7)
H2         = S("H2",    fontName="Helvetica-Bold", fontSize=12, textColor=INDIGO, spaceBefore=12, spaceAfter=5)
BODY       = S("Body",  fontName="Helvetica",      fontSize=10, textColor=colors.HexColor("#cbd5e1"), leading=16, spaceAfter=7)
BODY_SL    = S("BSL",   fontName="Helvetica",      fontSize=9,  textColor=GHOST,  leading=14, spaceAfter=5)
CODE       = S("Code",  fontName="Courier-Bold",   fontSize=9,  textColor=GREEN,  leading=14, spaceAfter=3, leftIndent=12)
CODE_G     = S("CodeG", fontName="Courier",        fontSize=9,  textColor=GHOST,  leading=14, spaceAfter=3, leftIndent=12)
QUOTE      = S("Quote", fontName="Helvetica-BoldOblique", fontSize=12, textColor=YELLOW, alignment=TA_CENTER, leading=19, spaceBefore=6, spaceAfter=6)
BULLET     = S("Bul",   fontName="Helvetica",      fontSize=10, textColor=colors.HexColor("#cbd5e1"), leading=16, spaceAfter=4, leftIndent=14)
FOOTER     = S("Foot",  fontName="Helvetica",      fontSize=8,  textColor=MUTED,  alignment=TA_CENTER)

# ─── Cover ────────────────────────────────────────────────────────────────────
def cover():
    s = []
    hdr = Table([[Paragraph(
        "TAO TRADING BOT  ·  MASTER STATE BRIEF  ·  THE HANDOFF DOCUMENT",
        S("h", fontName="Helvetica-Bold", fontSize=8, textColor=MUTED, alignment=TA_CENTER)
    )]], colWidths=[7.5*inch])
    hdr.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1),NAVY_MID),("TOPPADDING",(0,0),(-1,-1),9),
        ("BOTTOMPADDING",(0,0),(-1,-1),9),("BOX",(0,0),(-1,-1),0.5,BORDER)]))
    s.append(hdr); s.append(sp(44))

    tag = Table([[Paragraph("📋  LIVING DOCUMENT — UPDATE EVERY SESSION",
        S("t",fontName="Helvetica-Bold",fontSize=9,textColor=NAVY,alignment=TA_CENTER)
    )]], colWidths=[3.6*inch])
    tag.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),GREEN),
        ("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7)]))
    tw = Table([[tag]], colWidths=[7.5*inch])
    tw.setStyle(TableStyle([("ALIGN",(0,0),(-1,-1),"CENTER")]))
    s.append(tw); s.append(sp(16))

    s.append(Paragraph("Master State Brief", HERO_TAG))
    s.append(Paragraph("TAO Trading Bot", HERO_TITLE))
    s.append(sp(6))
    s.append(Paragraph(
        "The permanent handoff document.<br/>"
        "What this system is. How it thinks. Where it stands. What comes next.<br/>"
        "Any future II Agent reads this first — before touching a single file.",
        HERO_SUB))
    s.append(sp(10))
    s.append(Paragraph(
        f"Last updated: April 16, 2025  ·  Finney block #7,977,756  ·  "
        f"simulation_mode: False  ·  NightWatch: LIVE", DATE_S))
    s.append(sp(38))
    s.append(hr(GREEN, 1.5))
    s.append(sp(14))

    # Stat row
    stats = [("Status","LIVE"),("Wallet","0.000451 τ"),("Strategies","7 LIVE"),
             ("Trades","2,856"),("Real tx_hash","PENDING"),("Cost/month","$0")]
    cols  = [GREEN, YELLOW, INDIGO, BLUE, ORANGE, GREEN]
    cells = []
    for (lbl, val), col in zip(stats, cols):
        cells.append([
            Paragraph(val, S("sv",fontName="Helvetica-Bold",fontSize=14,
                textColor=col,alignment=TA_CENTER,leading=18)),
            Paragraph(lbl, S("sl",fontName="Helvetica",fontSize=7,
                textColor=MUTED,alignment=TA_CENTER,leading=11)),
        ])
    t = Table([cells], colWidths=[6.8*inch/6]*6)
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1),NAVY_LIGHT),
        ("TOPPADDING",(0,0),(-1,-1),10),("BOTTOMPADDING",(0,0),(-1,-1),10),
        ("LEFTPADDING",(0,0),(-1,-1),4),("RIGHTPADDING",(0,0),(-1,-1),4),
        ("BOX",(0,0),(-1,-1),0.6,BORDER),("LINEAFTER",(0,0),(-2,-1),0.4,BORDER)]))
    s.append(t); s.append(sp(14)); s.append(hr(BORDER)); s.append(sp(12))

    s.append(box([
        Paragraph("SECTIONS IN THIS BRIEF", S("sh",fontName="Helvetica-Bold",
            fontSize=8,textColor=MUTED,leading=12,spaceAfter=8)),
        Paragraph("1 · Mission          2 · Architecture       3 · The Vocabulary", BODY_SL),
        Paragraph("4 · Decision Log     5 · Current State      6 · The Archives", BODY_SL),
        Paragraph("7 · Pending Items    8 · Working Relationship   9 · How to Resume", BODY_SL),
    ]))
    s.append(PageBreak())
    return s

# ─── Section 1: Mission ───────────────────────────────────────────────────────
def sec_mission():
    s = []
    s.append(Paragraph("1.  Mission", H1)); s.append(hr())
    s.append(Paragraph(
        "Build a fully autonomous TAO cryptocurrency trading bot that runs 24/7 "
        "without human intervention, deploys a fleet of 12 AI strategy agents, "
        "routes all trades through a consensus council, and executes real stake/unstake "
        "calls on Bittensor Finney mainnet.", BODY))
    s.append(Paragraph(
        "This is not a demo. Not a prototype. It is a live system with a real funded "
        "wallet executing real on-chain transactions.", BODY))
    s.append(sp(6))
    s.append(Paragraph(
        "The human sets direction. The machine does the work. "
        "The Archives hold the memory. The agent carries it forward.", QUOTE))
    s.append(sp(8))

    pillars = [
        (INDIGO, "Autonomous",  "Runs unattended. NightWatch keeps it alive. Cycle engine runs every 5 min."),
        (GREEN,  "Real",        "Real wallet. Real chain. Real TAO. First real tx_hash is the next milestone."),
        (BLUE,   "Fleet-based", "12 strategy agents. Each independent. All subject to OpenClaw consensus."),
        (YELLOW, "Accountable", "Every trade logged. Every decision traceable. The Archives explain everything."),
    ]
    for col, title, body in pillars:
        t = Table([[
            Paragraph("▐", S("b",fontName="Helvetica-Bold",fontSize=18,textColor=col,alignment=TA_CENTER)),
            [Paragraph(title, S("pt",fontName="Helvetica-Bold",fontSize=11,textColor=col,leading=15,spaceAfter=3)),
             Paragraph(body, BODY)]
        ]], colWidths=[0.4*inch, 6.2*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(-1,-1),NAVY_LIGHT),("BOX",(0,0),(-1,-1),0.4,BORDER),
            ("TOPPADDING",(0,0),(-1,-1),10),("BOTTOMPADDING",(0,0),(-1,-1),10),
            ("LEFTPADDING",(0,0),(0,-1),8),("LEFTPADDING",(1,0),(1,-1),12),
            ("RIGHTPADDING",(0,0),(-1,-1),12),("VALIGN",(0,0),(-1,-1),"MIDDLE")]))
        s.append(t); s.append(sp(7))
    s.append(PageBreak())
    return s

# ─── Section 2: Architecture ──────────────────────────────────────────────────
def sec_architecture():
    s = []
    s.append(Paragraph("2.  Architecture", H1)); s.append(hr())

    s.append(box([
        Paragraph("STACK", S("sh",fontName="Helvetica-Bold",fontSize=8,textColor=MUTED,leading=12,spaceAfter=8)),
        Paragraph("Frontend :  React + Vite + TailwindCSS  →  port 3002", CODE),
        Paragraph("Backend  :  Python + FastAPI + uvicorn  →  port 8001", CODE),
        Paragraph("Database :  SQLite  →  backend/tao_bot.db", CODE),
        Paragraph("Chain    :  Bittensor Finney mainnet  (bt.AsyncSubtensor)", CODE),
        Paragraph("Repo     :  github.com/ilovenjc-ship-it/autonomous-trade-bot", CODE_G),
        Paragraph("Location :  /workspace/autonomous-trade-bot/", CODE_G),
        Paragraph("Keepalive:  nightwatch.sh  (PID 63675, bash, always running)", CODE_G),
    ]))
    s.append(sp(12))

    s.append(Paragraph("Key Backend Files", H2))
    be_data = [
        ["FILE","ROLE"],
        ["backend/main.py","FastAPI entry point — startup hook fires get_chain_info()"],
        ["backend/services/bittensor_service.py","Chain connection, wallet, stake/unstake"],
        ["backend/services/cycle_service.py","Main trading loop — runs every 5 minutes"],
        ["backend/services/price_service.py","CoinGecko TAO/USD price + technicals (RSI, EMA, MACD, BB)"],
        ["backend/services/openclaw_service.py","12-bot consensus — 7/12 required to execute"],
        ["backend/services/subnet_router.py","Subnet scoring and selection logic"],
        ["backend/routers/","All REST API endpoints"],
    ]
    t = Table(be_data, colWidths=[2.6*inch, 4.2*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),NAVY_MID),("TEXTCOLOR",(0,0),(-1,0),MUTED),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),9),
        ("FONTNAME",(0,1),(-1,-1),"Helvetica"),("TEXTCOLOR",(0,1),(-1,-1),SLATE),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,colors.HexColor("#f8fafc")]),
        ("GRID",(0,0),(-1,-1),0.4,BORDER),
        ("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7),
        ("LEFTPADDING",(0,0),(-1,-1),10),("RIGHTPADDING",(0,0),(-1,-1),10)]))
    s.append(t); s.append(sp(10))

    s.append(Paragraph("Key Frontend Pages", H2))
    fe_data = [
        ["PAGE","ROLE"],
        ["pages/Dashboard.tsx","Live overview — strategy status, bot health, market data"],
        ["pages/Trade.tsx","Full trade history — 2,856 paper trades, filters, stats"],
        ["pages/Wallet.tsx","Coldkey, balance, recovery phrase, 64-subnet heat map"],
        ["pages/AgentFleet.tsx","12 bots — ON/OFF toggle, LIVE/PAPER badge, performance"],
        ["pages/Analytics.tsx","Charts — P&L, win rate, drawdown, RSI, MACD"],
        ["pages/OpenClaw.tsx","Consensus council — vote breakdown per trade, bot scores"],
    ]
    t = Table(fe_data, colWidths=[2.6*inch, 4.2*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),NAVY_MID),("TEXTCOLOR",(0,0),(-1,0),MUTED),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),9),
        ("FONTNAME",(0,1),(-1,-1),"Helvetica"),("TEXTCOLOR",(0,1),(-1,-1),SLATE),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,colors.HexColor("#f8fafc")]),
        ("GRID",(0,0),(-1,-1),0.4,BORDER),
        ("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7),
        ("LEFTPADDING",(0,0),(-1,-1),10),("RIGHTPADDING",(0,0),(-1,-1),10)]))
    s.append(t)
    s.append(PageBreak())
    return s

# ─── Section 3: Vocabulary ────────────────────────────────────────────────────
def sec_vocabulary():
    s = []
    s.append(Paragraph("3.  The Vocabulary", H1)); s.append(hr())
    s.append(Paragraph(
        "These terms are specific to this project. They are not generic industry terms. "
        "Use them. The owner knows them. They are part of the project's identity.", BODY))
    s.append(sp(6))

    vocab = [
        (GREEN,  "The Archives",
         "The collection of PDF reports in /report/, all pushed to GitHub. Every major "
         "discovery, decision, and breakthrough gets a PDF. They are institutional memory — "
         "not documentation. They survive any agent reset."),
        (GHOST,  "Ghost Flag",
         "A boolean initialised to False, checked faithfully by everything that depends on it, "
         "and never set to its intended state. Coined April 16, 2025. "
         "First instance: bittensor_service.connected — gated 2,856 trades to paper silently."),
        (BLUE,   "NightWatch",
         "Background bash script (nightwatch.sh) that pings the backend every 20 seconds, "
         "auto-restarts uvicorn or vite if they crash, and logs heartbeat every 5 minutes. "
         "Solved the tunnel shutdown problem. Runs independently of Python."),
        (INDIGO, "OpenClaw",
         "The 12-bot consensus council. Every trade signal goes to OpenClaw for a vote. "
         "7-of-12 bots must vote YES for the trade to execute. The gate between signal and action."),
        (PURPLE, "The Fleet",
         "The 12 autonomous strategy agents that generate trade signals. Each has a name, "
         "a strategy, a risk profile, and an ON/OFF switch. 7 are currently LIVE."),
        (YELLOW, "LIVE / PAPER",
         "A strategy flagged LIVE executes real on-chain trades when its signals pass OpenClaw. "
         "PAPER runs simulation only. The gate is bittensor_service.connected."),
        (ORANGE, "dTAO as DEX",
         "Staking TAO into a subnet buys αTAO (subnet alpha token). Unstaking sells it back for TAO. "
         "Floating market rate. No middleman. Structurally identical to Uniswap. "
         "The entire trading system is built on this mechanic."),
        (RED,    "tx_hash",
         "The on-chain transaction hash returned by Finney after a real stake/unstake call. "
         "NULL = paper trade. Non-NULL = real on-chain trade. First real tx_hash is still pending."),
        (BLUE,   "Finney",
         "Bittensor mainnet. Block time ~12 seconds. "
         "Public RPC: wss://entrypoint-finney.opentensor.ai (free, Opentensor Foundation)."),
        (MUTED,  "The Tunnel",
         "The platform's temporary public URL exposing the sandbox to the internet. "
         "Was dying from inactivity. NightWatch's 20-second ping solved it permanently."),
    ]

    for col, term, defn in vocab:
        row = Table([[
            Paragraph(term, S("vt",fontName="Helvetica-Bold",fontSize=10,
                textColor=col,leading=14,spaceAfter=3)),
            Paragraph(defn, BODY_SL)
        ]], colWidths=[1.4*inch, 5.2*inch])
        row.setStyle(TableStyle([
            ("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),8),
            ("LEFTPADDING",(0,0),(0,-1),0),("LEFTPADDING",(1,0),(1,-1),12),
            ("RIGHTPADDING",(0,0),(-1,-1),0),("VALIGN",(0,0),(-1,-1),"TOP"),
            ("LINEBELOW",(0,0),(-1,-1),0.3,BORDER)]))
        s.append(row)
    s.append(PageBreak())
    return s

# ─── Section 4: Decision Log ──────────────────────────────────────────────────
def sec_decisions():
    s = []
    s.append(Paragraph("4.  The Decision Log", H1)); s.append(hr())
    s.append(Paragraph(
        "Every major architectural decision. When made. Why. "
        "Do not revisit a closed decision without reading this first.", BODY))
    s.append(sp(6))

    decisions = [
        ("D-01", GREEN,  "SQLite over Postgres",
         "Zero infrastructure cost, zero setup, sufficient for current scale. "
         "Upgrade path to Postgres exists when wallet grows."),
        ("D-02", BLUE,   "AsyncSubtensor throughout",
         "The cycle engine is fully async. Mixing sync chain calls blocks the event loop. "
         "Every chain call is awaited via bt.AsyncSubtensor (bittensor 10.x API)."),
        ("D-03", INDIGO, "OpenClaw threshold: 7-of-12",
         "58.3% majority — strict enough to filter noise, permissive enough to act on genuine signals. "
         "Prevents a single rogue strategy from triggering a trade unilaterally."),
        ("D-04", RED,    "Simulation gate: bittensor_service.connected",
         "Single boolean = single source of truth. If the chain is unreachable, fall back to paper. "
         "INCIDENT: this flag was never set at startup (Ghost Flag). "
         "Fixed April 16 2025 — startup hook in main.py now fires get_chain_info() on every boot. "
         "cycle_service also auto-reconnects once per cycle if connection drops."),
        ("D-05", YELLOW, "NightWatch in bash, not Python",
         "Must survive Python process crashes. A bash script has no dependency on the app it watches. "
         "Polls backend health, restarts processes, logs heartbeat."),
        ("D-06", GREEN,  "PDF reports as institutional memory",
         "Context windows are finite. PDFs persist forever. The Archives survive any agent reset. "
         "Every major discovery goes in as a formatted, pushed, permanent brief."),
        ("D-07", INDIGO, "16-column subnet heat map",
         "64 subnets ÷ 16 columns = exactly 4 clean rows, no partial rows. "
         "Maximum information density. Tiles colour from cold-blue → indigo → amber → red by APY score."),
        ("D-08", GHOST,  "No paid APIs",
         "Finney public RPC (free) + CoinGecko free tier (2 calls/min, limit 30/min = 7% used). "
         "At current wallet scale, paid infrastructure would dwarf the portfolio value. "
         "Revisit when balance justifies it."),
        ("D-09", PURPLE, "STATE.md as living handoff document",
         "Created April 16, 2025. A single markdown file in the repo root that any future "
         "II Agent reads first. Updated at the end of every session. "
         "This is the institutional memory layer above the code and below the Archives."),
    ]

    for code, col, title, body in decisions:
        content = [
            Table([[
                Paragraph(code, S("dc",fontName="Helvetica-Bold",fontSize=9,
                    textColor=NAVY,alignment=TA_CENTER)),
                Paragraph(title, S("dt",fontName="Helvetica-Bold",fontSize=11,
                    textColor=col,leading=15))
            ]], colWidths=[0.65*inch, 5.9*inch]),
            sp(5),
            Paragraph(body, BODY),
        ]
        t = Table([[content]], colWidths=[6.8*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(-1,-1),NAVY_LIGHT),("BOX",(0,0),(-1,-1),0.4,BORDER),
            ("LINEBEFORE",(0,0),(0,-1),3.0,col),
            ("TOPPADDING",(0,0),(-1,-1),12),("BOTTOMPADDING",(0,0),(-1,-1),12),
            ("LEFTPADDING",(0,0),(-1,-1),14),("RIGHTPADDING",(0,0),(-1,-1),14)]))
        s.append(t); s.append(sp(8))

    # Code badge colour for D-01 inner table fix
    for item in s:
        if isinstance(item, Table):
            pass  # tables already styled above

    s.append(PageBreak())
    return s

# ─── Section 5: Current State ─────────────────────────────────────────────────
def sec_current_state():
    s = []
    s.append(Paragraph("5.  Current State", H1)); s.append(hr())
    s.append(Paragraph(
        "As of April 16, 2025. Update this section at the end of every session.", BODY_SL))
    s.append(sp(6))

    s.append(Paragraph("System Status", H2))
    s.append(box([
        Paragraph("network_connected  :  True   ✅", CODE),
        Paragraph("simulation_mode    :  False  ✅", CODE),
        Paragraph("wallet_connected   :  True   ✅", CODE),
        Paragraph("wallet_address     :  5GgRojEFh5aCFNLKuSWb6WtrM5nBDB6GrRpqaqreBLcg4e7L", CODE),
        Paragraph("wallet_balance     :  0.000450917 τ  (confirmed on-chain)", CODE),
        Paragraph("Finney block       :  #7,977,756", CODE),
        Paragraph("NightWatch         :  Running  —  PID 63675  —  nominal 24h", CODE),
    ]))
    s.append(sp(10))

    s.append(Paragraph("Trading Status", H2))
    trade_data = [
        ["METRIC","VALUE","NOTES"],
        ["Total trades logged","2,856","All paper — real gate just opened April 16"],
        ["Real trades (tx_hash non-NULL)","0","First one fires on next LIVE signal + OpenClaw pass"],
        ["Paper trades","2,856","Real algorithms, real market data — tx_hash = NULL"],
        ["Active period","April 12–16, 2025","~5 days of paper trading history"],
        ["LIVE strategies","7","Armed — executing real stake() on valid signals"],
        ["PAPER strategies","5","Not yet promoted — simulation only"],
    ]
    t = Table(trade_data, colWidths=[2.2*inch, 1.8*inch, 2.8*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),NAVY_MID),("TEXTCOLOR",(0,0),(-1,0),MUTED),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),9),
        ("FONTNAME",(0,1),(-1,-1),"Helvetica"),("TEXTCOLOR",(0,1),(-1,-1),SLATE),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,colors.HexColor("#f8fafc")]),
        ("BACKGROUND",(0,2),(-1,2),colors.HexColor("#fff7ed")),
        ("TEXTCOLOR",(1,2),(1,2),ORANGE),("FONTNAME",(1,2),(1,2),"Helvetica-Bold"),
        ("GRID",(0,0),(-1,-1),0.4,BORDER),
        ("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7),
        ("LEFTPADDING",(0,0),(-1,-1),10),("RIGHTPADDING",(0,0),(-1,-1),10)]))
    s.append(t); s.append(sp(10))

    s.append(Paragraph("The Seven Armed Strategies", H2))
    strats = [
        ("Yield Maximizer",    INDIGO,  "Chases highest emission-rate subnets"),
        ("Emission Momentum",  BLUE,    "Follows accelerating emission curves"),
        ("Balanced Risk",      GREEN,   "Equal-weight across top-tier subnets"),
        ("Liquidity Hunter",   YELLOW,  "Targets high-depth alpha pools"),
        ("dTAO Flow Momentum", ORANGE,  "Rides institutional stake inflows"),
        ("Contrarian Flow",    PURPLE,  "Fades overcrowded, overvalued subnets"),
        ("Momentum Cascade",   RED,     "Amplifies multi-subnet momentum breaks"),
    ]
    for name, col, desc in strats:
        row = Table([[
            Paragraph("●", S("d",fontName="Helvetica-Bold",fontSize=12,
                textColor=col,alignment=TA_CENTER)),
            Paragraph(f"<b>{name}</b>  —  {desc}",
                S("sd",fontName="Helvetica",fontSize=9,textColor=SLATE,leading=14))
        ]], colWidths=[0.3*inch, 6.3*inch])
        row.setStyle(TableStyle([
            ("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),
            ("LEFTPADDING",(0,0),(0,-1),4),("LEFTPADDING",(1,0),(1,-1),10),
            ("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LINEBELOW",(0,0),(-1,-1),0.3,BORDER)]))
        s.append(row)

    s.append(sp(10))
    s.append(Paragraph("External Dependencies", H2))
    dep_data = [
        ["SERVICE","ENDPOINT","COST","CALL RATE","STATUS"],
        ["Finney RPC","wss://entrypoint-finney.opentensor.ai","Free","Per cycle (5 min)","✅ Live"],
        ["CoinGecko","api.coingecko.com/api/v3","Free","Every 30s (~7% of limit)","✅ Live"],
    ]
    t = Table(dep_data, colWidths=[1.1*inch, 2.5*inch, 0.7*inch, 1.5*inch, 0.8*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),NAVY_MID),("TEXTCOLOR",(0,0),(-1,0),MUTED),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),8.5),
        ("FONTNAME",(0,1),(-1,-1),"Helvetica"),("TEXTCOLOR",(0,1),(-1,-1),SLATE),
        ("BACKGROUND",(0,1),(-1,-1),WHITE),
        ("TEXTCOLOR",(4,1),(4,-1),GREEN),("FONTNAME",(4,1),(4,-1),"Helvetica-Bold"),
        ("GRID",(0,0),(-1,-1),0.4,BORDER),
        ("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7),
        ("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8)]))
    s.append(t)
    s.append(PageBreak())
    return s

# ─── Section 6: The Archives ──────────────────────────────────────────────────
def sec_archives():
    s = []
    s.append(Paragraph("6.  The Archives", H1)); s.append(hr())
    s.append(Paragraph(
        "Every PDF report pushed to /report/ and to GitHub. "
        "These are not documentation. They are institutional memory. "
        "They survive any agent reset, any context window limit, any sandbox restart.", BODY))
    s.append(sp(6))

    archive_data = [
        ["FILE","SUBJECT","DATE"],
        ["TAO_Bot_Session_Report.pdf",
         "First session recap — full system build overview","Early April 2025"],
        ["TAO_Bot_Orchestrator_Brief.pdf",
         "The II Agent as master orchestrator — 8 sections, full role map","April 2025"],
        ["TAO_Bot_DEX_Realization.pdf",
         "dTAO is a DEX — buy/sell TAO with no middleman, Uniswap parallel","April 2025"],
        ["TAO_Bot_Last_Revelations.pdf",
         "Ghost flag forensics — 3-file fix — live trading unlocked","April 16, 2025"],
        ["TAO_Bot_Connectivity_Uptime.pdf",
         "APIs, zero cost, tunnel problem, NightWatch, path to 24/7","April 16, 2025"],
        ["TAO_Bot_Ghost_Flag.pdf",
         "Engineering Lexicon Entry #1 — definition, anatomy, case file","April 16, 2025"],
        ["TAO_Bot_Master_State_Brief.pdf",
         "This document — the permanent handoff brief","April 16, 2025"],
    ]
    t = Table(archive_data, colWidths=[2.5*inch, 3.2*inch, 1.1*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),NAVY_MID),("TEXTCOLOR",(0,0),(-1,0),MUTED),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),8.5),
        ("FONTNAME",(0,1),(-1,-1),"Helvetica"),("TEXTCOLOR",(0,1),(-1,-1),SLATE),
        ("BACKGROUND",(0,-1),(-1,-1),colors.HexColor("#f0fdf4")),
        ("FONTNAME",(0,-1),(-1,-1),"Helvetica-Bold"),
        ("TEXTCOLOR",(0,-1),(0,-1),GREEN),
        ("ROWBACKGROUNDS",(0,1),(-1,-2),[WHITE,colors.HexColor("#f8fafc")]),
        ("GRID",(0,0),(-1,-1),0.4,BORDER),
        ("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),8),
        ("LEFTPADDING",(0,0),(-1,-1),10),("RIGHTPADDING",(0,0),(-1,-1),10)]))
    s.append(t); s.append(sp(10))

    s.append(left_bar([
        Paragraph("Archive Rule", S("ar",fontName="Helvetica-Bold",fontSize=10,
            textColor=GREEN,leading=14,spaceAfter=5)),
        Paragraph(
            "If it mattered enough to discover, it goes in The Archives. "
            "If it changed the system, it gets a PDF. "
            "If it named something new, it gets an entry in the Engineering Lexicon. "
            "The Archives are how this project remembers itself.", BODY),
    ], GREEN))
    s.append(PageBreak())
    return s

# ─── Section 7: Pending Items ─────────────────────────────────────────────────
def sec_pending():
    s = []
    s.append(Paragraph("7.  Pending Items", H1)); s.append(hr())
    s.append(Paragraph(
        "What was open at the end of the last session. "
        "Update this section every session.", BODY_SL))
    s.append(sp(8))

    items = [
        (ORANGE, "HIGH", "First real tx_hash",
         "Autonomous — gate is open. Next LIVE strategy signal + 7/12 OpenClaw votes → "
         "stake() fires on Finney → first non-NULL tx_hash recorded. No code needed."),
        (BLUE,   "MED",  "Manual trade panel",
         "Allow the owner to fire a stake() directly from the UI without waiting for "
         "a strategy signal. One button, one subnet selector, one amount input. "
         "Confirms end-to-end real chain execution on demand."),
        (BLUE,   "MED",  "Real αTAO positions in Wallet",
         "Fetch live staked balance per subnet from chain and display in the heat map tiles. "
         "Currently showing subnet metadata only — actual staked position data not pulled yet."),
        (GHOST,  "LOW",  "Agent Fleet UI bugs",
         "ON/OFF toggle no-refetch, Promote to LIVE CTA, demotion indicator, "
         "consecutive losses display. All cosmetic/UX — trading logic unaffected."),
        (GHOST,  "LOW",  "Additional PDF report sections",
         "Strategies brief, Trades brief, Trade Log brief — not yet written. "
         "The Archives are otherwise comprehensive."),
        (GREEN,  "NEXT", "The Next Project",
         "Writing and PDF-heavy project after this one reaches full automation. "
         "ReportLab infrastructure already built and proven. Details TBD by owner."),
    ]

    for col, priority, title, body in items:
        badge = Table([[Paragraph(priority, S("bp",fontName="Helvetica-Bold",
            fontSize=8,textColor=NAVY,alignment=TA_CENTER))]],
            colWidths=[0.55*inch])
        badge.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),col),
            ("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),3)]))
        header = Table([[badge, Paragraph(title,S("pit",fontName="Helvetica-Bold",
            fontSize=11,textColor=col,leading=15))]],
            colWidths=[0.7*inch, 5.9*inch])
        header.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE"),
            ("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),0),
            ("LEFTPADDING",(1,0),(1,-1),10)]))
        content = [header, sp(5), Paragraph(body, BODY)]
        t = Table([[content]], colWidths=[6.8*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(-1,-1),NAVY_LIGHT),("BOX",(0,0),(-1,-1),0.4,BORDER),
            ("LINEBEFORE",(0,0),(0,-1),3.0,col),
            ("TOPPADDING",(0,0),(-1,-1),12),("BOTTOMPADDING",(0,0),(-1,-1),12),
            ("LEFTPADDING",(0,0),(-1,-1),14),("RIGHTPADDING",(0,0),(-1,-1),14)]))
        s.append(t); s.append(sp(8))
    s.append(PageBreak())
    return s

# ─── Section 8: Working Relationship ──────────────────────────────────────────
def sec_relationship():
    s = []
    s.append(Paragraph("8.  The Working Relationship", H1)); s.append(hr())
    s.append(Paragraph(
        "This section exists so future II Agent instances understand how this "
        "partnership operates — not just what was built. Read it. Honour it.", BODY))
    s.append(sp(8))

    principles = [
        (GREEN,  "The owner leads direction. The agent executes.",
         "Direction comes from the owner. The agent executes, advises, and pushes back "
         "only when something is technically wrong or genuinely risky. No unsolicited opinions "
         "on strategy. Full commitment once direction is set."),
        (BLUE,   "Archive first. Delete never.",
         "Nothing significant gets deleted without discussion. Screenshots, old files, "
         "draft code — archive it. The workspace history has value. "
         "If space is needed, move to archive, not to trash."),
        (YELLOW, "Everything significant gets a PDF.",
         "If it mattered enough to discover, it goes in The Archives. "
         "If it changed the system, it gets a PDF. If it named something new, "
         "it gets an entry in the Engineering Lexicon. This is not optional — "
         "it is the memory system."),
        (INDIGO, "Vocabulary matters.",
         "Use the terms in Section 3. Ghost flag. NightWatch. OpenClaw. The Fleet. "
         "The Archives. They are part of the project's identity. A future agent "
         "that doesn't know these terms is not up to speed."),
        (GHOST,  "The agent speaks plainly.",
         "No flattery. No hedging. No filler. Direct answers, honest limits, "
         "clear blockers. If something can't be done, say so immediately and say why. "
         "If something is ready, deliver it without ceremony."),
        (GREEN,  "End-of-session ritual.",
         "At the end of every session: update Section 5 (Current State) and "
         "Section 7 (Pending Items) in STATE.md. Push any new PDFs to The Archives. "
         "Commit and push to GitHub. The handoff must always be current."),
    ]

    for col, title, body in principles:
        t = Table([[
            Paragraph("—", S("dash",fontName="Helvetica-Bold",fontSize=14,
                textColor=col,alignment=TA_CENTER)),
            [Paragraph(title,S("pt",fontName="Helvetica-Bold",fontSize=10,
                textColor=col,leading=15,spaceAfter=4)),
             Paragraph(body, BODY)]
        ]], colWidths=[0.35*inch, 6.25*inch])
        t.setStyle(TableStyle([
            ("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),8),
            ("LEFTPADDING",(0,0),(0,-1),4),("LEFTPADDING",(1,0),(1,-1),12),
            ("RIGHTPADDING",(0,0),(-1,-1),0),("VALIGN",(0,0),(-1,-1),"TOP"),
            ("LINEBELOW",(0,0),(-1,-1),0.3,BORDER)]))
        s.append(t)
    s.append(PageBreak())
    return s

# ─── Section 9: How to Resume ─────────────────────────────────────────────────
def sec_resume():
    s = []
    s.append(Paragraph("9.  How to Resume — Checklist for New Agent", H1)); s.append(hr())
    s.append(Paragraph(
        "If you are a new II Agent instance picking this project back up — "
        "run through this checklist before touching any file. In order.", BODY))
    s.append(sp(8))

    steps = [
        (GREEN,  "01", "Read STATE.md in full",
         "This file. All nine sections. Takes 3 minutes. Saves 3 hours."),
        (GREEN,  "02", "Read the most recent Archive PDF",
         "Sort /report/ by date. Read the newest one. Understand the last session's outcome."),
        (BLUE,   "03", "Check git log",
         "Run: git log --oneline -20\n"
         "Understand what changed in the last session before writing anything new."),
        (BLUE,   "04", "Confirm live status",
         "Run: curl http://localhost:8001/api/bot/status\n"
         "Check: network_connected, simulation_mode, wallet_balance."),
        (INDIGO, "05", "Confirm NightWatch",
         "Run: tail -20 /workspace/autonomous-trade-bot/nightwatch.log\n"
         "Should show '💚 All systems nominal' entries. If not, restart it."),
        (INDIGO, "06", "Confirm servers",
         "Run: ps aux | grep uvicorn\n"
         "Run: ps aux | grep vite\n"
         "Both must be running. If not, check nightwatch.log for restart events."),
        (YELLOW, "07", "Read Section 7 (Pending Items)",
         "Pick up from exactly where the last session left off. "
         "Do not start something new without checking what was already in progress."),
        (YELLOW, "08", "Check Section 4 (Decision Log)",
         "Before introducing any new pattern or architecture, "
         "verify it doesn't conflict with a closed decision."),
        (ORANGE, "09", "End-of-session: update and push",
         "Before closing: update Section 5 and 7 in STATE.md. "
         "Push any new PDFs. Commit everything to GitHub. Leave the handoff current."),
    ]

    for col, num, title, body in steps:
        content = [
            Table([[
                Paragraph(num, S("sn",fontName="Helvetica-Bold",fontSize=18,
                    textColor=col,alignment=TA_CENTER)),
                [Paragraph(title,S("st",fontName="Helvetica-Bold",fontSize=11,
                    textColor=col,leading=15,spaceAfter=4)),
                 Paragraph(body.replace("\n","<br/>"),
                    S("sb",fontName="Courier" if "\n" in body else "Helvetica",
                    fontSize=9,textColor=colors.HexColor("#94a3b8"),leading=14))]
            ]], colWidths=[0.5*inch, 6.1*inch]),
        ]
        t = Table([[content]], colWidths=[6.8*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(-1,-1),NAVY_LIGHT),("BOX",(0,0),(-1,-1),0.4,BORDER),
            ("LINEBEFORE",(0,0),(0,-1),3.0,col),
            ("TOPPADDING",(0,0),(-1,-1),11),("BOTTOMPADDING",(0,0),(-1,-1),11),
            ("LEFTPADDING",(0,0),(-1,-1),12),("RIGHTPADDING",(0,0),(-1,-1),12)]))
        s.append(t); s.append(sp(7))

    s.append(sp(14)); s.append(hr(GREEN,1.0)); s.append(sp(12))

    final = Table([[Paragraph(
        "The code lives on GitHub.\n"
        "The memory lives in STATE.md.\n"
        "The record lives in The Archives.\n"
        "The work continues.",
        S("fin",fontName="Helvetica-Bold",fontSize=13,textColor=GREEN,
          alignment=TA_CENTER,leading=22)
    )]], colWidths=[6.8*inch])
    final.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1),NAVY_MID),("BOX",(0,0),(-1,-1),1.0,GREEN),
        ("TOPPADDING",(0,0),(-1,-1),22),("BOTTOMPADDING",(0,0),(-1,-1),22),
        ("LEFTPADDING",(0,0),(-1,-1),20),("RIGHTPADDING",(0,0),(-1,-1),20)]))
    s.append(final); s.append(sp(16))

    s.append(Paragraph(
        f"TAO Trading Bot  ·  Master State Brief  ·  "
        f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}  ·  "
        f"Update this document every session  ·  CONFIDENTIAL",
        FOOTER))
    return s

# ─── Build ────────────────────────────────────────────────────────────────────
def build():
    doc = SimpleDocTemplate(OUTPUT, pagesize=letter,
        leftMargin=0.6*inch, rightMargin=0.6*inch,
        topMargin=0.55*inch, bottomMargin=0.55*inch)
    story = []
    story += cover()
    story += sec_mission()
    story += sec_architecture()
    story += sec_vocabulary()
    story += sec_decisions()
    story += sec_current_state()
    story += sec_archives()
    story += sec_pending()
    story += sec_relationship()
    story += sec_resume()
    doc.build(story)
    print(f"✅  PDF written → {OUTPUT}")

if __name__ == "__main__":
    build()