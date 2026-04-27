"""
TAO Trading Bot — Official Project Status Report
Generates a professional PDF for project archives / AI handoff.
Run: python3 generate_report.py
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether,
)
from reportlab.platypus.flowables import Flowable
from reportlab.graphics.shapes import Drawing, Rect, String
from datetime import datetime
import os

OUTPUT = "/workspace/TAO_TradingBot_ProjectStatus_2026-04-27.pdf"

# ── Palette ───────────────────────────────────────────────────────────────────
DARK        = colors.HexColor("#0d1117")
DARK2       = colors.HexColor("#161b22")
DARK3       = colors.HexColor("#21262d")
EMERALD     = colors.HexColor("#34d399")
EMERALD_DIM = colors.HexColor("#065f46")
BLUE        = colors.HexColor("#60a5fa")
AMBER       = colors.HexColor("#fbbf24")
RED         = colors.HexColor("#f87171")
PURPLE      = colors.HexColor("#a78bfa")
SLATE       = colors.HexColor("#94a3b8")
SLATE_DIM   = colors.HexColor("#334155")
WHITE       = colors.white
OFF_WHITE   = colors.HexColor("#e2e8f0")

# ── Styles ────────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def S(name, **kw):
    base = styles.get(name, styles["Normal"])
    return ParagraphStyle(name + str(id(kw)), parent=base, **kw)

TITLE  = S("Normal", fontSize=28, textColor=WHITE,       fontName="Helvetica-Bold",  leading=34, spaceAfter=4)
SUB    = S("Normal", fontSize=13, textColor=EMERALD,     fontName="Helvetica-Bold",  leading=17, spaceAfter=2)
META   = S("Normal", fontSize=10, textColor=SLATE,       fontName="Helvetica",       leading=14, spaceAfter=12)
H1     = S("Normal", fontSize=15, textColor=WHITE,       fontName="Helvetica-Bold",  leading=20, spaceBefore=18, spaceAfter=6)
H2     = S("Normal", fontSize=12, textColor=BLUE,        fontName="Helvetica-Bold",  leading=16, spaceBefore=12, spaceAfter=4)
H3     = S("Normal", fontSize=10, textColor=AMBER,       fontName="Helvetica-Bold",  leading=14, spaceBefore=8,  spaceAfter=3)
BODY   = S("Normal", fontSize=9,  textColor=OFF_WHITE,   fontName="Helvetica",       leading=14, spaceAfter=6)
SMALL  = S("Normal", fontSize=8,  textColor=SLATE,       fontName="Helvetica",       leading=12, spaceAfter=4)
MONO   = S("Normal", fontSize=8,  textColor=EMERALD,     fontName="Courier",         leading=12, spaceAfter=4)
MONO_W = S("Normal", fontSize=8,  textColor=OFF_WHITE,   fontName="Courier",         leading=12, spaceAfter=4)
WARN   = S("Normal", fontSize=9,  textColor=AMBER,       fontName="Helvetica-Bold",  leading=13, spaceAfter=4)
CRIT   = S("Normal", fontSize=9,  textColor=RED,         fontName="Helvetica-Bold",  leading=13, spaceAfter=4)
OK     = S("Normal", fontSize=9,  textColor=EMERALD,     fontName="Helvetica-Bold",  leading=13, spaceAfter=4)
LABEL  = S("Normal", fontSize=8,  textColor=SLATE,       fontName="Helvetica-Bold",  leading=11, spaceAfter=2)

# ── Helpers ───────────────────────────────────────────────────────────────────
def HR(color=SLATE_DIM, thickness=0.5):
    return HRFlowable(width="100%", thickness=thickness, color=color, spaceAfter=8, spaceBefore=4)

def SP(h=6):
    return Spacer(1, h)

def tbl(data, col_widths, style_cmds=None, hdr=True):
    base = [
        ("BACKGROUND",  (0, 0), (-1, 0 if hdr else -1), DARK3),
        ("TEXTCOLOR",   (0, 0), (-1, 0), BLUE if hdr else WHITE),
        ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",    (0, 0), (-1, -1), 8),
        ("FONTNAME",    (0, 1), (-1, -1), "Helvetica"),
        ("TEXTCOLOR",   (0, 1), (-1, -1), OFF_WHITE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [DARK, DARK2]),
        ("GRID",        (0, 0), (-1, -1), 0.4, SLATE_DIM),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
    ]
    if style_cmds:
        base.extend(style_cmds)
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle(base))
    return t

def section_box(title_text, content_paras, accent=BLUE):
    """Draws a titled box using a single-cell table wrapper."""
    inner = [SP(4)] + content_paras + [SP(4)]
    t = Table([[inner]], colWidths=[6.5 * inch])
    t.setStyle(TableStyle([
        ("BOX",         (0, 0), (-1, -1), 1, accent),
        ("BACKGROUND",  (0, 0), (-1, -1), DARK2),
        ("LEFTPADDING",  (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING",   (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 2),
    ]))
    return [Paragraph(title_text, H2), t, SP(8)]

# ── Page template (dark background on every page) ─────────────────────────────
class DarkBackground(Flowable):
    """Flood fills the page with DARK color as first flowable."""
    def __init__(self, w, h):
        Flowable.__init__(self)
        self.w, self.h = w, h
    def draw(self):
        pass  # background handled in onPage callback

def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(DARK)
    canvas.rect(0, 0, doc.pagesize[0], doc.pagesize[1], fill=1, stroke=0)
    # Footer bar
    canvas.setFillColor(DARK3)
    canvas.rect(0, 0, doc.pagesize[0], 28, fill=1, stroke=0)
    canvas.setFillColor(SLATE)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(inch * 0.75, 10, "CONFIDENTIAL — TAO Trading Bot · Intelligent Internet · Project Archives")
    canvas.drawRightString(doc.pagesize[0] - inch * 0.75, 10,
                           f"Page {doc.page}  ·  Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    # Top accent line
    canvas.setFillColor(EMERALD)
    canvas.rect(0, doc.pagesize[1] - 3, doc.pagesize[0], 3, fill=1, stroke=0)
    canvas.restoreState()

# ── Build content ─────────────────────────────────────────────────────────────
def build():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.7 * inch,   bottomMargin=0.55 * inch,
        title="TAO Trading Bot — Project Status Report",
        author="II Agent",
        subject="Autonomous Bittensor dTAO staking bot — project handoff document",
    )

    W = 6.5 * inch
    story = []

    # ══════════════════════════════════════════════════════════════════════════
    # COVER PAGE
    # ══════════════════════════════════════════════════════════════════════════
    story += [
        SP(60),
        Paragraph("TAO TRADING BOT", TITLE),
        Paragraph("Autonomous dTAO Staking System", SUB),
        HR(EMERALD, 1.5),
        SP(6),
        Paragraph("Official Project Status Report — Session Handoff Document", META),
        Paragraph("Prepared by: II Agent  ·  Date: April 27, 2026  ·  Classification: Internal / Archives", META),
        SP(20),
    ]

    # Status snapshot box
    snap_data = [
        ["METRIC", "VALUE", "STATUS"],
        ["Deployment", "Railway (Finney Mainnet)", "✓ LIVE"],
        ["Total Portfolio Value", "τ 0.8084", "↑ +57% from τ 0.5"],
        ["Liquid TAO", "τ 0.2783", "Available to trade"],
        ["Staked αTAO", "τ 0.5301 equivalent", "3 subnet positions"],
        ["Recovery Progress", "τ 0.8084 → τ 2.000", "40.4% of new target"],
        ["Bot Status", "RUNNING — 60-second cycles", "✓ Active"],
        ["OpenClaw Consensus", "7/12 supermajority", "✓ Enforced"],
        ["Git HEAD", "384f6b0", "main branch, origin synced"],
        ["Total Commits", "40+", "Full history on GitHub"],
    ]
    story.append(tbl(snap_data, [W*0.32, W*0.38, W*0.30],
        style_cmds=[
            ("TEXTCOLOR", (2, 1), (2, -1), EMERALD),
            ("FONTNAME",  (2, 1), (2, -1), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 1), (0, -1), SLATE),
        ]
    ))
    story += [SP(20), PageBreak()]

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 1 — PROJECT OVERVIEW
    # ══════════════════════════════════════════════════════════════════════════
    story += [
        Paragraph("1. PROJECT OVERVIEW", H1), HR(),
        Paragraph(
            "This project is a fully autonomous, 24/7 algorithmic trading bot that stakes TAO on "
            "the Bittensor Finney mainnet using the dTAO (decentralised TAO) mechanism. "
            "Instead of buying/selling on an exchange, each trade is an on-chain stake/unstake "
            "operation into a subnet's liquidity pool — purchasing subnet-native αTAO tokens "
            "and capturing price appreciation as subnet value grows.",
            BODY),
        Paragraph(
            "The system runs on Railway.app (cloud, 24/7 auto-restart) and exposes a "
            "full-featured React dashboard accessible from any browser. Twelve autonomous "
            "sub-agents (bots) each run different strategies; consensus among ≥7/12 is required "
            "before any live on-chain trade executes.",
            BODY),
        SP(4),
        Paragraph("Mission", H3),
        Paragraph(
            "Grow a seed wallet from τ0.5 → τ2.0 through disciplined, data-driven subnet "
            "staking on Bittensor Finney mainnet. Recovery Tracker shows progress toward this "
            "target in real time.",
            BODY),
        Paragraph("Core Stack", H3),
    ]

    stack_data = [
        ["Layer", "Technology", "Role"],
        ["Backend API", "FastAPI + Python 3.10", "Trade execution, chain queries, strategy engine"],
        ["Database", "SQLite → Railway Volume /data", "Trades, strategies, price history, bot config"],
        ["Blockchain", "Bittensor SDK (bt.AsyncSubtensor)", "add_stake(), get_balance(), get_stake_info()"],
        ["Network", "Finney Mainnet (finney.opentensor.ai)", "Live on-chain execution"],
        ["Frontend", "React + Vite + TypeScript + TailwindCSS", "Dashboard, 18 pages, real-time SSE updates"],
        ["Deployment", "Railway.app — auto-redeploy on git push", "Backend :8001 · Frontend :3004"],
        ["Auth / Wallet", "BIP39 mnemonic → keypair in memory + .env", "Cold key signs every stake extrinsic"],
    ]
    story.append(tbl(stack_data, [W*0.18, W*0.27, W*0.55]))
    story += [SP(8), PageBreak()]

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 2 — ARCHITECTURE
    # ══════════════════════════════════════════════════════════════════════════
    story += [Paragraph("2. SYSTEM ARCHITECTURE", H1), HR()]

    story += [Paragraph("2.1  4-Layer Safety Pipeline", H2)]
    pipeline_data = [
        ["Layer", "Gate", "Condition to Pass"],
        ["1 — Paper Mode", "Always active for new strategies", "Strategies start in PAPER_ONLY"],
        ["2 — Gate Engine", "Win-rate ≥55%, 10+ cycles, net +2 wins, PnL>0", "Promotes to APPROVED_FOR_LIVE"],
        ["3 — OpenClaw BFT", "7/12 supermajority vote among 12 bots", "Issues APPROVE signal"],
        ["4 — Live Execution", "Chain connected + mnemonic loaded + hotkey set", "Fires add_stake() on Finney"],
    ]
    story.append(tbl(pipeline_data, [W*0.18, W*0.42, W*0.40],
        style_cmds=[
            ("TEXTCOLOR", (0, 1), (0, 1), SLATE),
            ("TEXTCOLOR", (0, 2), (0, 2), AMBER),
            ("TEXTCOLOR", (0, 3), (0, 3), PURPLE),
            ("TEXTCOLOR", (0, 4), (0, 4), EMERALD),
        ]
    ))
    story += [SP(6)]

    story += [Paragraph("2.2  OpenClaw BFT Consensus", H2),
        Paragraph(
            "Before any live trade fires, all 12 bots cast a vote (BUY / SELL / HOLD). "
            "A 7/12 supermajority (58.3%) of the same direction is required to approve. "
            "Deadlock (6:6) or minority → VETOED. The threshold is now runtime-adjustable "
            "via the Risk Config page and persists across Railway redeploys to risk_config.json.",
            BODY),
    ]

    story += [Paragraph("2.3  12 Autonomous Bot Strategies", H2)]
    bot_data = [
        ["Bot Name", "Win Bias", "Trade %/cycle", "PnL Mean"],
        ["momentum_cascade",   "68%", "55%", "τ0.0019"],
        ["dtao_flow_momentum", "84%", "35%", "τ0.0027"],
        ["liquidity_hunter",   "76%", "28%", "τ0.0022"],
        ["breakout_hunter",    "62%", "32%", "τ0.0018"],
        ["yield_maximizer",    "79%", "50%", "τ0.0011"],
        ["contrarian_flow",    "55%", "25%", "τ0.0012"],
        ["volatility_arb",     "50%", "20%", "τ0.0008"],
        ["sentiment_surge",    "46%", "30%", "τ0.0005"],
        ["balanced_risk",      "70%", "45%", "τ0.0009"],
        ["mean_reversion",     "40%", "22%", "τ0.0001"],
        ["emission_momentum",  "75%", "40%", "τ0.0015"],
        ["macro_correlation",  "50%", "25%", "−τ0.0001"],
    ]
    story.append(tbl(bot_data, [W*0.38, W*0.18, W*0.22, W*0.22]))
    story += [SP(4)]

    story += [Paragraph("2.4  Stake Tier System", H2)]
    tier_data = [
        ["Tier", "Stake per Trade", "Promotion Criteria"],
        ["ELITE",   "τ 0.020", "WR ≥ 70%, PnL > 0.005τ"],
        ["STRONG",  "τ 0.015", "WR ≥ 60%, PnL > 0.002τ"],
        ["SOLID",   "τ 0.010", "WR ≥ 55%, PnL > 0"],
        ["CAUTIOUS","τ 0.006–0.008", "New / recovering strategies"],
    ]
    story.append(tbl(tier_data, [W*0.20, W*0.22, W*0.58]))
    story += [SP(8), PageBreak()]

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 3 — WALLET & PORTFOLIO STATE
    # ══════════════════════════════════════════════════════════════════════════
    story += [Paragraph("3. WALLET & PORTFOLIO STATE (2026-04-27)", H1), HR()]

    story += [Paragraph("3.1  Coldkey Address", H2),
        Paragraph("5HMXmud5v6zUz84fm3azwLyENFpbtq5CFK6ZeShA4EqcECAT", MONO_W),
        Paragraph("View on Taostats: https://taostats.io/account/5HMXmud5v6zUz84fm3azwLyENFpbtq5CFK6ZeShA4EqcECAT", SMALL),
        SP(4),
    ]

    portfolio_data = [
        ["Position", "Amount", "TAO Equivalent", "% of Portfolio"],
        ["Liquid TAO (free to stake)", "τ 0.2783", "τ 0.2783", "34.4%"],
        ["SN8 — Taoshi PTN (αTAO)", "13.1316 α × τ0.0361", "τ 0.4742", "58.7%"],
        ["SN9 — Pretrain (αTAO)",   "2.1936 α × τ0.0236",  "τ 0.0517",  "6.4%"],
        ["SN0 — Root Network",      "τ 0.0042 (TAO direct)", "τ 0.0042", "0.5%"],
        ["TOTAL PORTFOLIO",          "—",                    "τ 0.8084",  "100%"],
    ]
    story.append(tbl(portfolio_data, [W*0.38, W*0.24, W*0.22, W*0.16],
        style_cmds=[
            ("FONTNAME",    (0, -1), (-1, -1), "Helvetica-Bold"),
            ("TEXTCOLOR",   (0, -1), (-1, -1), EMERALD),
            ("BACKGROUND",  (0, -1), (-1, -1), EMERALD_DIM),
        ]
    ))
    story += [SP(6)]

    story += [Paragraph("3.2  Recovery Tracker", H2),
        Paragraph(
            "Current: τ 0.8084  ·  Target: τ 2.000  ·  Progress: 40.4%  ·  Remaining: τ 1.1916",
            BODY),
        Paragraph(
            "Target is now τ2.000 (raised this session from τ1.000). The tracker is wired to "
            "the full portfolio value (liquid + all staked positions), not just liquid TAO. "
            "The 'Edit Target' button on the Wallet page lets the user push the goal forward "
            "at any time. Value persists in localStorage across sessions.",
            BODY),
    ]

    story += [Paragraph("3.3  Runway Analysis", H2)]
    runway_data = [
        ["Trade Tier", "Stake/Trade", "Available Liquid", "Estimated Cycles"],
        ["ELITE",    "τ 0.020", "τ 0.2783 − τ 0.01 reserve", "~13 ELITE cycles"],
        ["STRONG",   "τ 0.015", "same",                        "~18 cycles"],
        ["SOLID",    "τ 0.010", "same",                        "~27 cycles"],
    ]
    story.append(tbl(runway_data, [W*0.17, W*0.17, W*0.36, W*0.30]))
    story += [SP(4),
        Paragraph("NOTE: τ0.01 liquid reserve is now hard-enforced — the bot cannot stake its "
                  "last τ0.01 and will always preserve enough TAO to pay extrinsic fees.", WARN),
        SP(8), PageBreak(),
    ]

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 4 — THIS SESSION'S CHANGES
    # ══════════════════════════════════════════════════════════════════════════
    story += [Paragraph("4. THIS SESSION'S CHANGES (2026-04-27)", H1), HR()]

    changes = [
        ("56a7810", "Railway crash loop fix",
         "Root cause: stale cached balance passed the pre-trade check → chain called with "
         "insufficient liquid TAO → SubTensor rejected with 'amount is too low'. Fix: force "
         "fresh get_balance() before every add_stake() and in trading_service.py BUY guard."),
        ("b7308a8", "SN8/SN9 price feed fix",
         "list(prices.items())[:limit] was taking arbitrary first 20 entries from an unordered "
         "dict, silently excluding SN8 and SN9. Fix: sort by value descending before slice, "
         "expand coverage to 64 subnets. Wallet stakes endpoint now returns alpha_price and "
         "tao_value per position."),
        ("a9005b8", "Wallet page — live staking positions",
         "Full rebuild of Wallet page: StakePosition interface, live /wallet/stakes polling, "
         "portfolio summary (liquid + staked), per-subnet cards with αTAO amount, price, TAO "
         "value, USD value, portfolio %, validator address, progress bar. Recovery Tracker "
         "wired to full portfolio total (not just liquid)."),
        ("6befc44", "τ0.01 liquid reserve guard",
         "The balance guard only checked amount > balance, meaning the bot could stake itself "
         "to exactly zero leaving no TAO for future fees. Fix: require balance ≥ "
         "stake_amount + 0.01τ in both bittensor_service.add_stake() and trading_service.py."),
        ("6494971", "OpenClaw 7/12 + Risk Config persistence + τ2.0 target",
         "Bug: consensus_threshold default was 0.45 → Math.ceil(0.45×12)=6, showing 6/12. "
         "Slider used float step=0.05 so 7/12=0.5833 was unreachable. Fix: integer vote slider "
         "(6–12, step=1), default=7. Risk config now persists to risk_config.json (survives "
         "Railway redeploys). consensus_service.set_supermajority() wired to Risk Config API. "
         "Recovery Tracker default target raised τ1.0 → τ2.0."),
        ("384f6b0", "Trades: Live-Only filter | Nav: RUNNING/STOPPED overhaul",
         "Trades: added '⛓ Live Only' toggle in filter bar — filters to trades with real "
         "on-chain tx_hash only. Collapsed disclosure banner to single compact pill. "
         "Layout nav: RUNNING = bright emerald-300 + green glow; STOPPED = red-400 + red glow "
         "+ pulsing red dot (unmistakable); transition = amber + spinner + STOPPING…/STARTING…."),
    ]

    for commit, title, desc in changes:
        story += [
            Paragraph(f"<font color='#60a5fa'>{commit}</font>  —  {title}", H3),
            Paragraph(desc, BODY),
            SP(2),
        ]

    story += [SP(8), PageBreak()]

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 5 — UI / FRONTEND MAP
    # ══════════════════════════════════════════════════════════════════════════
    story += [Paragraph("5. FRONTEND PAGE MAP (18 Pages)", H1), HR()]

    pages_data = [
        ["Route", "Page", "Key Feature"],
        ["/",                  "Dashboard",       "Hero slider, TradingView chart, sentiment gauge, heat map"],
        ["/mission-control",   "Mission Control", "OpenClaw council ring, subnet heat map slider, strategy grid"],
        ["/agent-fleet",       "Agent Fleet",     "12-bot cards, win rates, tier badges, mode toggles"],
        ["/ii-agent",          "II Agent",        "Chat with embedded AI assistant (floating orb)"],
        ["/open-claw",         "OpenClaw BFT",    "Live consensus rounds, vote breakdown, approval history"],
        ["/alerts",            "Alert Inbox",     "Notification centre, unread badge, alert types"],
        ["/analytics",         "Analytics",       "P&L charts, win-rate trend, strategy performance"],
        ["/pnl-summary",       "P&L Summary",     "Daily/weekly/monthly P&L breakdown"],
        ["/trades",            "Trades",          "Trade history, Live-Only filter, Manual Trade panel"],
        ["/trade-log",         "Trade Log",       "Raw trade log with all fields"],
        ["/market",            "Market Data",     "CoinGecko ticker, subnet price heat map, TAO market stats"],
        ["/strategies",        "Strategies",      "All 12 strategy cards with gate status"],
        ["/strategy/:name",    "Strategy Detail", "Per-strategy deep dive — indicators, gate checks, signals"],
        ["/activity",          "Activity Log",    "SSE event stream — trades, consensus, system events"],
        ["/risk-config",       "Risk Config",     "9 risk sliders, global halt, OpenClaw vote threshold (saves to JSON)"],
        ["/wallet",            "Wallet",          "Portfolio summary, staking positions, Recovery Tracker, Manual Wallet"],
        ["/settings",          "Settings",        "Bot config, strategy toggles, wallet setup"],
        ["/override",          "Human Override",  "Emergency controls, global halt, manual intervention"],
    ]
    story.append(tbl(pages_data, [W*0.22, W*0.20, W*0.58]))
    story += [SP(8), PageBreak()]

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 6 — TECHNICAL HANDOFF
    # ══════════════════════════════════════════════════════════════════════════
    story += [Paragraph("6. TECHNICAL HANDOFF — CRITICAL INFORMATION", H1), HR()]

    story += [Paragraph("6.1  Environment & Secrets", H2),
        Paragraph("The following env vars must be present on Railway for the system to function:", BODY),
    ]
    env_data = [
        ["Variable", "Where", "Purpose"],
        ["COLDKEY_MNEMONIC", "Railway env + backend/.env", "12-word BIP39 seed — loads wallet keypair on boot"],
        ["GITHUB_TOKEN",     "/app/.user_env.sh",          "Push access to ilovenjc-ship-it/autonomous-trade-bot"],
        ["DATABASE_URL",     "Railway Volume auto-set",     "SQLite at /data/trading_bot.db (persistent Volume)"],
    ]
    story.append(tbl(env_data, [W*0.28, W*0.28, W*0.44]))
    story += [SP(4),
        Paragraph("⚠  The mnemonic is the only thing that can sign on-chain transactions. "
                  "If it is lost, the staked αTAO is permanently inaccessible. It is stored "
                  "ONLY in Railway environment variables and backend/.env — never in git.", WARN),
        SP(6),
    ]

    story += [Paragraph("6.2  Critical Files", H2)]
    files_data = [
        ["File", "Purpose"],
        ["backend/services/bittensor_service.py", "All chain I/O: get_balance, add_stake, unstake, get_stake_info. Contains liquid reserve guard (τ0.01)."],
        ["backend/services/trading_service.py",   "Main trade execution flow. Pre-trade balance check with reserve. Routes BUY/SELL to bittensor_service."],
        ["backend/services/cycle_service.py",     "60-second autonomous cycle loop. Strategy fire probability, tier-based stake amounts, OpenClaw gate."],
        ["backend/services/consensus_service.py", "BFT voting engine. 12 bots vote; set_supermajority() wired to Risk Config. Default 7/12."],
        ["backend/services/price_service.py",     "dTAO alpha price feed. Sorted by value before slicing — SN8/SN9 always included."],
        ["backend/routers/fleet.py",              "Risk Config API. Persists to risk_config.json. Wires consensus_service on update."],
        ["backend/routers/wallet.py",             "Stakes endpoint: returns alpha_price + tao_value per position for Wallet page."],
        ["frontend/src/components/Layout.tsx",    "Global top bar. Bot RUNNING (green glow) / STOPPED (red pulse) / STOPPING… states."],
        ["frontend/src/pages/Wallet.tsx",         "Portfolio + staking positions + Recovery Tracker (wired to full portfolio total, τ2.0 default)."],
        ["frontend/src/pages/RiskConfig.tsx",     "Risk sliders + OpenClaw integer vote slider (6–12). Derives consensus_votes from server."],
        ["frontend/src/pages/Trades.tsx",         "Trade history with Live-Only filter (tx_hash guard). Manual Trade Panel fires real add_stake()."],
        ["backend/risk_config.json",              "Persisted risk config — survives Railway redeploys. Created on first Apply from UI."],
    ]
    story.append(tbl(files_data, [W*0.42, W*0.58]))
    story += [SP(8)]

    story += [Paragraph("6.3  Deployment", H2)]
    deploy_data = [
        ["Item", "Detail"],
        ["Platform",        "Railway.app — auto-redeploy on every git push to origin/main"],
        ["Repo",            "https://github.com/ilovenjc-ship-it/autonomous-trade-bot"],
        ["Backend port",    ":8001 — FastAPI (uvicorn)"],
        ["Frontend port",   ":3004 — Vite preview / static build"],
        ["Public URL",      "https://profound-expression-production-75c7.up.railway.app"],
        ["DB persistence",  "SQLite at /data/trading_bot.db — Railway Volume (survives redeploys)"],
        ["Chain endpoint",  "wss://entrypoint-finney.opentensor.ai:9944 (bt.AsyncSubtensor default)"],
        ["Restart policy",  "ALWAYS — Railway restarts the backend if it crashes"],
    ]
    story.append(tbl(deploy_data, [W*0.22, W*0.78]))
    story += [SP(6)]

    story += [Paragraph("6.4  Known Constraints & Guards", H2)]
    guards = [
        "τ0.01 LIQUID RESERVE — bot cannot stake its last τ0.01 (hard-coded floor in bittensor_service + trading_service)",
        "FRESH BALANCE FETCH — every add_stake() call fetches a live balance first; stale cache is never used for go/no-go",
        "7/12 SUPERMAJORITY — hardcoded default in consensus_service.py; runtime-adjustable via Risk Config API (persists to JSON)",
        "MIN_STAKE_TAO = 0.001τ — below this the chain rejects; all tier amounts are well above this",
        "TIMEOUT_STAKE = 90s — allows 7–8 blocks for extrinsic inclusion; prevents Railway crash on slow chains",
        "SN8/SN9 price fix — get_subnet_prices() now sorts by value before slicing; covers 64 subnets",
        "DB Volume path — SQLite is at /data/trading_bot.db (Railway Volume), NOT the ephemeral container FS",
        "Mnemonic never in git — stored only in Railway env vars and backend/.env (gitignored)",
    ]
    for g in guards:
        story.append(Paragraph(f"• {g}", BODY))
    story += [SP(8), PageBreak()]

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 7 — GIT HISTORY
    # ══════════════════════════════════════════════════════════════════════════
    story += [Paragraph("7. GIT COMMIT HISTORY (Recent — HEAD to origin)", H1), HR()]

    git_data = [
        ["Hash", "Date", "Summary"],
        ["384f6b0", "2026-04-27", "Trades: Live-Only filter + compact banner | Nav: distinct RUNNING/STOPPED states"],
        ["6494971", "2026-04-27", "OpenClaw 7/12 enforcement + Risk Config persistence + Recovery target τ2.0"],
        ["6befc44", "2026-04-27", "Add τ0.01 liquid reserve guard to prevent wallet full drain"],
        ["a9005b8", "2026-04-27", "feat: live staking positions on Wallet page — SN8/SN9 with TAO value"],
        ["b7308a8", "2026-04-27", "fix: SN8/SN9 missing from price feed + wallet stakes now show TAO value"],
        ["56a7810", "2026-04-27", "fix: pre-fetch fresh balance before stake — stops Railway crash loop"],
        ["368f46b", "2026-04-26", "fix: make mode pills clickable + fix Trading Engine OFFLINE status"],
        ["93c0a2b", "2026-04-26", "fix: II Agent chat panel; Override remove max-w cap"],
        ["c32a6d6", "2026-04-26", "feat: ET timezone on all clocks; Override 3-col controls row"],
        ["04bdad0", "2026-04-26", "feat: topbar bigger text; MC full subnet cards + OpenClaw fills"],
        ["7f31a71", "2026-04-26", "feat: 5-page UI overhaul — gauge fill, MC restructure, RiskConfig dirty-flag"],
        ["fa760c9", "2026-04-26", "feat: global top bar (title/time/cycle/bot controls/bell)"],
        ["9d1d710", "2026-04-26", "fix: remove overflow-hidden from layout wrapper; h-screen → h-full"],
        ["69fe0b9", "2026-04-25", "feat: Dashboard PageHeroSlider; heat map 8×8 fixed grid"],
        ["6a8f87b", "2026-04-25", "fix: wire /market/overview to return real stats data"],
        ["5655d83", "2026-04-25", "fix: null-safe all formatter helper functions"],
        ["5b3f6e0", "2026-04-25", "Page sliders, CoinGecko ticker, proportional layouts, font boost"],
        ["69289e6", "2026-04-24", "Mission Control: OpenClaw Council, heat map slider"],
        ["4e21a8c", "2026-04-24", "feat: Dashboard redesign — hero slider, TradingView chart, sentiment gauge"],
        ["e7c3b88", "2026-04-23", "feat: swap simulated market data for real Bittensor on-chain data"],
        ["9f4379f", "2026-04-22", "fix: write SQLite DB to Railway Volume /data (persistent)"],
        ["9763c5e", "2026-04-22", "fix: Railway backend stability — async timeouts + ALWAYS restart"],
    ]
    story.append(tbl(git_data, [W*0.11, W*0.14, W*0.75]))
    story += [SP(8), PageBreak()]

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 8 — PENDING ROADMAP
    # ══════════════════════════════════════════════════════════════════════════
    story += [Paragraph("8. PENDING ROADMAP", H1), HR()]

    story += [Paragraph("8.1  Near-Term (Next Session Priority)", H2)]
    near = [
        ("Manual Trade Panel — Wallet page", "HIGH",
         "Allow staking directly from the Wallet page UI (select subnet, amount, validator). "
         "Currently the Manual Trade panel is on the Trades page only."),
        ("Auto-demotion on drawdown breach", "HIGH",
         "If a LIVE strategy's cumulative loss exceeds a threshold, automatically demote it "
         "back to PAPER_ONLY without human intervention."),
        ("Performance decay alerts", "MEDIUM",
         "If a strategy's rolling win rate drops below GATE_WIN_RATE over the last N cycles, "
         "fire an alert and/or demote. Prevents zombie strategies running LIVE with bad WR."),
        ("Regime-based risk adjustment", "MEDIUM",
         "Detect macro regime (trending / ranging / volatile) from TAO price and adjust "
         "stake sizes and confidence thresholds accordingly."),
        ("Gate Engine promotion UI", "MEDIUM",
         "Allow the user to manually approve or reject a strategy's promotion from "
         "APPROVED_FOR_LIVE → LIVE from the Strategies page."),
    ]
    for title, prio, desc in near:
        prio_color = "#f87171" if prio == "HIGH" else "#fbbf24"
        story += [
            Paragraph(f"<font color='{prio_color}'>[{prio}]</font>  {title}", H3),
            Paragraph(desc, BODY),
            SP(2),
        ]

    story += [Paragraph("8.2  Medium-Term", H2)]
    medium = [
        "Subnet diversification — automatically spread stakes across top 3–5 subnets by "
        "emission momentum rather than routing all LIVE trades to SN8",
        "Unstake automation — when a subnet's alpha price drops below entry, trigger an "
        "unstake via the gate engine (currently bots only stake, never auto-unstake LIVE)",
        "Portfolio rebalancing — detect when one subnet position dominates (>60% of portfolio) "
        "and rebalance toward target weights",
        "Tax-year trade export — CSV/PDF export of all on-chain trades with cost basis "
        "for accounting purposes",
        "Multi-wallet support — allow the UI to monitor multiple coldkey addresses (read-only "
        "for non-primary wallets)",
        "Webhook / Discord alerts — push consensus approvals and live trades to a Discord "
        "channel in real time",
    ]
    for m in medium:
        story.append(Paragraph(f"• {m}", BODY))

    story += [SP(8), PageBreak()]

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 9 — HANDOFF NOTES FOR NEXT AI INSTANCE
    # ══════════════════════════════════════════════════════════════════════════
    story += [Paragraph("9. HANDOFF NOTES FOR NEXT AI INSTANCE", H1), HR(),
        Paragraph(
            "This section is written specifically for the next II Agent session that picks up "
            "this project. Read this first before touching any code.",
            WARN),
        SP(6),
    ]

    notes = [
        ("Repo & Access",
         "GitHub: ilovenjc-ship-it/autonomous-trade-bot\n"
         "Clone with GITHUB_TOKEN from /app/.user_env.sh. "
         "Always push to origin/main — Railway auto-redeploys within ~2 minutes."),
        ("Wallet / Mnemonic",
         "The 12-word mnemonic is in /app/.user_env.sh as COLDKEY_MNEMONIC and in "
         "backend/.env. Do NOT commit it to git. The coldkey address is "
         "5HMXmud5v6zUz84fm3azwLyENFpbtq5CFK6ZeShA4EqcECAT."),
        ("Railway Crash Loop — Already Fixed",
         "The 'SubTensor returned amount is too low' crash was root-caused and fixed (56a7810 + 6befc44). "
         "The fix: fresh balance fetch before every add_stake() + τ0.01 reserve floor. "
         "If a new crash loop appears, check bittensor_service.add_stake() first."),
        ("SN8 / SN9 Price Feed — Already Fixed",
         "The list(prices.items())[:limit] arbitrary slice was fixed in b7308a8. "
         "The price service now sorts descending by value before slicing. "
         "SN8 (Taoshi PTN) and SN9 (Pretrain) are always included."),
        ("Risk Config Persistence",
         "User settings now save to backend/risk_config.json (NOT in-memory). "
         "This file is created on first Apply and loaded on every startup. "
         "If it doesn't exist, defaults are used (7/12 consensus, standard limits)."),
        ("Bittensor SDK Version",
         "The SDK is bittensor (version as installed in Railway Docker image). "
         "AsyncSubtensor is used exclusively. The _WalletAdapter pattern "
         "wraps a bare Keypair for SDK 10.x compatibility (unlock_coldkey() no-op)."),
        ("Database",
         "SQLite at /data/trading_bot.db on the Railway Volume. "
         "The local sandbox has an empty DB. All real trade history is on Railway. "
         "Never use the local DB to infer live state."),
        ("Frontend Build",
         "cd frontend && bun install && bun run build (or npm). "
         "TypeScript check: npx tsc --noEmit. "
         "Always run tsc before pushing frontend changes."),
        ("Testing Trade Execution",
         "The Manual Trade panel on the Trades page fires real add_stake() when the system is LIVE. "
         "Use Paper mode (stop bot, demote all strategies to PAPER_ONLY) for testing "
         "without spending real TAO."),
    ]

    for heading, body in notes:
        story += [
            Paragraph(heading, H3),
            Paragraph(body, BODY),
            SP(4),
        ]

    # ══════════════════════════════════════════════════════════════════════════
    # CLOSING
    # ══════════════════════════════════════════════════════════════════════════
    story += [
        HR(EMERALD, 1),
        SP(8),
        Paragraph("END OF REPORT", S("Normal", fontSize=10, textColor=SLATE,
                  fontName="Helvetica-Bold", alignment=TA_CENTER)),
        Paragraph(
            f"Generated by II Agent · {datetime.utcnow().strftime('%A, %B %d, %Y at %H:%M UTC')} · "
            "TAO Trading Bot v1.0 · Intelligent Internet",
            S("Normal", fontSize=8, textColor=SLATE_DIM, fontName="Helvetica", alignment=TA_CENTER)),
    ]

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"✓ PDF written to {OUTPUT}")

if __name__ == "__main__":
    build()