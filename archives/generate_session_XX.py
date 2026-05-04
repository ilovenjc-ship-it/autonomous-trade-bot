"""
Session XX Archive — The UI Completion Sprint
Autonomous Trade Bot · May 4 2026

Covers:
  1. Strategies — Allocation Tier Key relocated to top; Promotion Gate → OpenClaw
  2. Activity Log — Signal Feeds drawer (6 inbound feeds)
  3. Risk Management — 5 parameters recalibrated; phase-aware graduation path
  4. P&L Summary — Recovery Tracker relocated from Wallet
  5. Transactions — Taostats 404 fixed; v1 schema; API key surfaced
  6. Strategies — Strategy Mode Override relocated from Human Override

Commits: 064722d1 · f44d6c4c · db6e4819 · 7179b34c · 35646f70 · e1b6a660
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

OUTPUT = "/workspace/autonomous-trade-bot/archives/Session_XX_The_UI_Completion_Sprint.pdf"

# ── colour palette (matches the app's dark theme) ────────────────────────────
NEAR_BLACK = colors.HexColor("#070e1a")
DARK_BG    = colors.HexColor("#0a1220")
CARD_BG    = colors.HexColor("#0f1929")
BORDER     = colors.HexColor("#1e3a5f")
CYAN       = colors.HexColor("#22d3ee")
EMERALD    = colors.HexColor("#34d399")
AMBER      = colors.HexColor("#fbbf24")
VIOLET     = colors.HexColor("#a78bfa")
ORANGE     = colors.HexColor("#fb923c")
RED        = colors.HexColor("#f87171")
SLATE      = colors.HexColor("#94a3b8")
WHITE      = colors.HexColor("#f1f5f9")
BLUE       = colors.HexColor("#60a5fa")

# ── paragraph styles ──────────────────────────────────────────────────────────
def S(name, **kw):
    return ParagraphStyle(name, **kw)

title_style = S("Title",
    fontSize=22, textColor=CYAN, fontName="Helvetica-Bold",
    spaceAfter=4, alignment=TA_CENTER)

subtitle_style = S("Subtitle",
    fontSize=11, textColor=SLATE, fontName="Helvetica-Oblique",
    spaceAfter=2, alignment=TA_CENTER)

session_tag = S("Tag",
    fontSize=9, textColor=AMBER, fontName="Helvetica-Bold",
    spaceAfter=16, alignment=TA_CENTER)

h1_style = S("H1",
    fontSize=13, textColor=CYAN, fontName="Helvetica-Bold",
    spaceBefore=10, spaceAfter=5)

h2_style = S("H2",
    fontSize=10, textColor=EMERALD, fontName="Helvetica-Bold",
    spaceBefore=7, spaceAfter=3)

h3_style = S("H3",
    fontSize=9, textColor=AMBER, fontName="Helvetica-Bold",
    spaceBefore=5, spaceAfter=2)

body_style = S("Body",
    fontSize=8.5, textColor=SLATE, fontName="Helvetica",
    spaceBefore=2, spaceAfter=2, leading=13)

white_style = S("White",
    fontSize=8.5, textColor=WHITE, fontName="Helvetica",
    spaceBefore=2, spaceAfter=2, leading=13)

mono_style = S("Mono",
    fontSize=7.5, textColor=BLUE, fontName="Courier",
    spaceBefore=2, spaceAfter=2, leading=11)

caption_style = S("Caption",
    fontSize=7, textColor=SLATE, fontName="Helvetica-Oblique",
    spaceBefore=1, spaceAfter=4, alignment=TA_CENTER)

def sp(n=6):
    return Spacer(1, n)

def HR():
    return HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=4, spaceBefore=4)

def bullet(text, color=SLATE):
    style = S("b", fontSize=8.5, textColor=color, fontName="Helvetica",
              spaceBefore=1, spaceAfter=1, leading=12, leftIndent=12)
    return Paragraph(f"• {text}", style)

def sub_bullet(text):
    style = S("sb", fontSize=7.5, textColor=colors.HexColor("#64748b"), fontName="Helvetica",
              spaceBefore=0, spaceAfter=0, leading=11, leftIndent=24)
    return Paragraph(f"◦ {text}", style)


# ── table helpers ─────────────────────────────────────────────────────────────
BASE_TABLE = TableStyle([
    ("BACKGROUND",    (0, 0), (-1, 0),  DARK_BG),
    ("TEXTCOLOR",     (0, 0), (-1, 0),  CYAN),
    ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
    ("FONTSIZE",      (0, 0), (-1, 0),  8),
    ("ROWBACKGROUNDS",(0, 1), (-1, -1), [NEAR_BLACK, DARK_BG]),
    ("TEXTCOLOR",     (0, 1), (-1, -1), SLATE),
    ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
    ("FONTSIZE",      (0, 1), (-1, -1), 7.5),
    ("GRID",          (0, 0), (-1, -1), 0.3, BORDER),
    ("ALIGN",         (0, 0), (-1, -1), "LEFT"),
    ("TOPPADDING",    (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING",   (0, 0), (-1, -1), 6),
    ("VALIGN",        (0, 0), (-1, -1), "TOP"),
])

def make_table(data, col_widths, extra_styles=None):
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = list(BASE_TABLE._cmds)
    if extra_styles:
        style.extend(extra_styles)
    t.setStyle(TableStyle(style))
    return t


# ═════════════════════════════════════════════════════════════════════════════
def build():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title="Session XX — The UI Completion Sprint",
        author="II Agent",
    )
    story = []

    # ─── COVER ───────────────────────────────────────────────────────────────
    story += [
        sp(30),
        Paragraph("AUTONOMOUS TRADE BOT", session_tag),
        Paragraph("Session XX", title_style),
        Paragraph("The UI Completion Sprint", subtitle_style),
        sp(6),
        Paragraph("May 4 2026  ·  II Agent", caption_style),
        sp(4),
        Paragraph(
            "Six UI/UX relocations, one backend bug fix, and one signal ingestion "
            "architecture — all committed in sequence, zero TypeScript errors.",
            caption_style,
        ),
        sp(30),
        HR(),
        sp(6),

        Paragraph("Session Summary", h2_style),
        Paragraph(
            "Session XX completed the final wave of component relocations requested across "
            "Sessions XVIII–XIX, fixed a silent Taostats API bug that had been returning 404 "
            "on the Chain Transfers tab, and built a full inbound Signal Feeds infrastructure "
            "into the Activity Log. Every change followed the established net-zero-line "
            "philosophy: TypeScript validation before every commit, surgical moves with all "
            "dependencies (state, fetch logic, types, JSX) relocated together.",
            body_style,
        ),
        sp(16),
    ]

    # ─── SECTION 1 — STRATEGIES PAGE RELOCATIONS ────────────────────────────
    story += [
        HR(),
        Paragraph("1. Strategies Page — Two Component Relocations", h1_style),
        Paragraph(
            "Commit 064722d1. Two boxes were repositioned from the Strategies page bottom "
            "grid into more contextually appropriate homes.",
            body_style,
        ),

        Paragraph("1.1  Allocation Tier Key → Top of Strategies Page", h2_style),
        Paragraph(
            "The Allocation Tier Key was moved from the bottom grid to the very first element "
            "in the scrollable content area — above FleetSummary, above filters. The operator "
            "now reads the legend (what each tier means and its capital multiplier) before "
            "looking at fleet stats or touching filters. This is the natural reading order.",
            body_style,
        ),
        bullet("Position: first scrollable element, above FleetSummary"),
        bullet("Rationale: operators need the legend before interacting with the data it describes"),
        bullet("Shield import retained in Strategies (still used at line 111)"),
        bullet("BarChart2 retained (line 143)"),

        Paragraph("1.2  Promotion Gate → OpenClaw Page", h2_style),
        Paragraph(
            "The Promotion Gate box was relocated from the Strategies bottom grid to the "
            "OpenClaw page — placed between the Consensus History table and the 'How OpenClaw "
            "Works' section. The narrative rationale: after watching rounds of consensus "
            "history, the operator immediately sees what criteria a strategy needs to earn "
            "LIVE status.",
            body_style,
        ),
        bullet("Position: between Consensus History table and 'How it Works' section in OpenClaw"),
        bullet("Subtitle added: '— criteria a strategy must clear before any real trade fires'"),
        bullet("Shield added to OpenClaw icon imports (was not previously imported there)"),
        sp(6),
    ]

    # ─── SECTION 2 — SIGNAL FEEDS ────────────────────────────────────────────
    story += [
        HR(),
        Paragraph("2. Activity Log — Inbound Signal Feeds Drawer", h1_style),
        Paragraph(
            "Commit f44d6c4c. A full Signal Feeds infrastructure was built into the Activity "
            "Log. The architecture consists of a backend service with 5 async polling loops "
            "and a frontend drawer accessed via the new 'Signal Feeds' button in the filter bar.",
            body_style,
        ),

        Paragraph("2.1  Backend: signal_ingestor.py (new file)", h2_style),
        Paragraph("Six signal sources, each with independent enable/disable and staggered startup:", body_style),
    ]

    feeds_data = [
        ["Feed",              "Interval", "Auth Required", "Auto-Start", "What It Provides"],
        ["CoinGecko",         "60s",      "None",          "Yes",        "TAO/USD price, 24h change, volume"],
        ["Reddit r/bittensor_","5 min",   "None",          "Yes",        "RSS community sentiment headlines"],
        ["TaoDaily RSS",      "30 min",   "None",          "Yes",        "Ecosystem editorial content (WordPress RSS)"],
        ["Taostats API",      "60s",      "API Key",       "No",         "Subnet alpha prices, staking flows, emissions"],
        ["Perplexity Sonar",  "15 min",   "API Key",       "No",         "AI-synthesised TAO news (1h live web search)"],
        ["Discord Gateway",   "Event",    "Bot Token",     "No",         "Real-time announcements (scaffold, OTF invite pending)"],
    ]
    story.append(make_table(feeds_data,
        [1.1*inch, 0.55*inch, 0.75*inch, 0.65*inch, 3.0*inch],
        [("TEXTCOLOR", (3, 1), (3, -1), EMERALD),
         ("TEXTCOLOR", (2, 1), (2, -1), AMBER)]))
    story.append(sp(6))

    story += [
        Paragraph("2.2  Key Architecture Decisions", h2_style),
        bullet("Perplexity.ai/finance/crypto page does NOT list TAO — only BTC/ETH/SOL/XRP. "
               "The Perplexity Sonar API (search endpoint) is used instead, querying the live web."),
        bullet("TaoDaily.io has no API or webhook push — it is a WordPress editorial site. "
               "RSS polling is the only machine-readable path and was implemented as such."),
        bullet("Discord Gateway WebSocket requires a bot token and admin invite to the OTF server. "
               "Scaffold built and ready; pending invite."),
        bullet("CoinGecko/Reddit/TaoDaily auto-start (no auth). Taostats/Perplexity/Discord "
               "require operator-provided credentials before activating."),

        Paragraph("2.3  Signal Events in Activity Log", h2_style),
        bullet("Signal events flow in as kind='signal' — filterable via the existing SIGNAL chip"),
        bullet("Taostats 3% price spike/crash auto-escalates to kind='alert'"),
        bullet("LegendBar updated to document inbound signal feeds"),

        Paragraph("2.4  Backend: signal_feeds.py (new router)", h2_style),
        Paragraph("Four REST endpoints serve the Signal Feeds drawer:", body_style),
    ]

    endpoints_data = [
        ["Endpoint",                    "Purpose"],
        ["GET  /api/signal-feeds",      "List all 6 feeds with status badges"],
        ["POST /api/signal-feeds/{id}/toggle", "Enable / disable individual feed"],
        ["POST /api/signal-feeds/{id}/key",    "Configure API key per feed"],
        ["POST /api/signal-feeds/{id}/test",   "Test-fetch from individual feed"],
    ]
    story.append(make_table(endpoints_data,
        [2.8*inch, 3.7*inch],
        [("FONTNAME", (0, 1), (0, -1), "Courier"),
         ("FONTSIZE", (0, 1), (0, -1), 7),
         ("TEXTCOLOR", (0, 1), (0, -1), BLUE)]))
    story.append(sp(10))

    # ─── SECTION 3 — RISK MANAGEMENT ─────────────────────────────────────────
    story += [
        HR(),
        Paragraph("3. Risk Management — Parameter Recalibration", h1_style),
        Paragraph(
            "Commit db6e4819. All 10 risk parameters were re-evaluated for the unproven/"
            "paper-only phase. Five were changed; five were left unchanged. A three-phase "
            "graduation path was added to the UI.",
            body_style,
        ),

        Paragraph("3.1  Parameter Changes", h2_style),
    ]

    risk_data = [
        ["Parameter",            "Old Value", "New Value", "Rationale"],
        ["Max Position Size",    "20%",       "5%",        "Unproven strategies — protect capital"],
        ["Max Concurrent Pos.",  "4",         "3",         "Tighter exposure during paper-only phase"],
        ["Max Drawdown",         "20%",       "8%",        "Realistic operational threshold"],
        ["Daily Circuit Breaker","15%",       "5%",        "Coherence fix: at 5% position, 15% CB needs ~37 stops (decorative). 5% CB = ~12 stops = real signal"],
        ["Min Confidence Score", "0.60",      "0.65",      "Higher bar for unproven strategies"],
        ["Stop Loss",            "8%",        "8%",        "Unchanged — appropriate"],
        ["Take Profit",          "12%",       "12%",       "Unchanged — appropriate"],
        ["Consensus Votes",      "7/12",      "7/12",      "Unchanged — BFT supermajority"],
        ["Cycle Interval",       "300s",      "300s",      "Unchanged — 5-min cycle"],
        ["Min Wallet Balance",   "0.05τ",     "0.05τ",     "Unchanged — safety floor"],
    ]
    story.append(make_table(risk_data,
        [1.6*inch, 0.7*inch, 0.7*inch, 3.5*inch],
        [("TEXTCOLOR", (2, 1), (2, 5), EMERALD),
         ("TEXTCOLOR", (2, 6), (2, -1), SLATE),
         ("FONTWEIGHT",(2, 1), (2, 5), "Bold")]))
    story.append(sp(6))

    story += [
        Paragraph("3.2  Circuit Breaker Coherence Fix (Critical Insight)", h2_style),
        Paragraph(
            "The Daily Circuit Breaker at 15% with 5% position size was effectively decorative: "
            "it required ~37 consecutive stop-outs to trigger. That's not 'something is broken' — "
            "that's an infinite loop. The fix to 5% daily means it trips at ~12 consecutive stops, "
            "which is the real 'something is systemically wrong' signal. Parameter coherence "
            "requires all parameters to be evaluated as a system, not individually.",
            white_style,
        ),

        Paragraph("3.3  Three-Phase Graduation Path (UI Panel)", h2_style),
    ]

    grad_data = [
        ["Phase",                   "Trigger",                    "Position", "Concurrent", "Drawdown", "Daily CB"],
        ["Phase 1 (current)",       "All strategies unproven",    "5%",       "3",          "8%",       "5%"],
        ["Phase 2",                 "2+ strategies gate-proven",  "10%",      "4",          "12%",      "8%"],
        ["Phase 3",                 "Fully proven fleet",         "Operator", "Operator",   "Operator", "Operator"],
    ]
    story.append(make_table(grad_data,
        [1.3*inch, 1.7*inch, 0.75*inch, 0.8*inch, 0.75*inch, 0.75*inch],
        [("TEXTCOLOR", (0, 1), (0, 1), AMBER),
         ("TEXTCOLOR", (0, 2), (0, 2), BLUE),
         ("TEXTCOLOR", (0, 3), (0, 3), EMERALD)]))
    story.append(sp(10))

    # ─── SECTION 4 — RECOVERY TRACKER RELOCATION ─────────────────────────────
    story += [
        HR(),
        Paragraph("4. Wallet → P&L Summary: Recovery Tracker Relocation", h1_style),
        Paragraph(
            "Commit 7179b34c. The RecoveryTracker component was surgically relocated from "
            "Wallet.tsx to PnLSummary.tsx — placed as the first scrollable element above "
            "the Fleet Hero Cards. Net-zero line philosophy: 207 lines removed from Wallet, "
            "206 lines added to PnLSummary.",
            body_style,
        ),

        Paragraph("What moved:", h2_style),
        bullet("RecoveryTracker component definition (~206 lines)"),
        bullet("Trophy, Target, Edit3 icon imports (exclusive to the block)"),
        bullet("taoPrice and balance state variables"),
        bullet("fetch/polling logic for /price/current and /wallet/status (30s poll)"),
        bullet("<RecoveryTracker /> JSX — now first visible element in PnLSummary"),

        Paragraph("What was preserved:", h2_style),
        bullet("localStorage key 'tao_recovery_target' — any target set in Wallet persists seamlessly"),
        bullet("fetch endpoints unchanged: /price/current + /wallet/status"),
        bullet("30s polling interval identical to original"),

        Paragraph("Placement rationale:", h2_style),
        Paragraph(
            "Recovery Tracker is a P&L instrument — it tracks progress toward recovering "
            "from a loss event. It belongs on the P&L page where the operator evaluates "
            "strategy performance, not on the Wallet page where the focus is balance and funding.",
            body_style,
        ),
        sp(8),
    ]

    # ─── SECTION 5 — TRANSACTIONS / TAOSTATS FIX ─────────────────────────────
    story += [
        HR(),
        Paragraph("5. Transactions — Taostats API Bug Fix", h1_style),
        Paragraph(
            "Commit 35646f70. The Chain Transfers tab was silently returning 'No chain "
            "transfers detected' for all wallets due to three compounding bugs. The 404 "
            "error the operator saw was the result of a trailing slash in the API URL that "
            "had been wrong since initial implementation.",
            body_style,
        ),

        Paragraph("5.1  Root Cause Analysis", h2_style),
    ]

    bugs_data = [
        ["Bug",                         "Detail",                                             "Severity"],
        ["Trailing slash → 404",
         "api.taostats.io/api/transfer/v1/ (wrong) vs /api/transfer/v1 (correct). "
         "Both fallback URLs were wrong. Verified live: correct URL returns 401, not 404.",
         "High"],
        ["Response schema changed",
         "New v1 API: to/from are nested {ss58, hex} objects (not plain strings). "
         "amount is a rao string (e.g. '6500000000', divide by 1e9). "
         "Field renamed: hash → transaction_hash. New field: extrinsic_id.",
         "High"],
        ["Errors swallowed silently",
         "All HTTPErrors caught internally → function returns [] → chain_error='' → "
         "UI shows 'No chain transfers detected' with no explanation. "
         "Operator had no way to know the API was failing.",
         "Medium"],
    ]
    story.append(make_table(bugs_data,
        [1.4*inch, 3.8*inch, 0.8*inch],
        [("TEXTCOLOR", (2, 1), (2, 1), RED),
         ("TEXTCOLOR", (2, 2), (2, 2), RED),
         ("TEXTCOLOR", (2, 3), (2, 3), AMBER)]))
    story.append(sp(6))

    story += [
        Paragraph("5.2  Fixes Applied", h2_style),
        bullet("URL corrected: /api/transfer/v1 (no trailing slash)"),
        bullet("_parse_taostats_rows() helper: handles nested to.ss58/from.ss58, rao→TAO conversion, "
               "transaction_hash field, extrinsic_id field"),
        bullet("_taostats_headers() helper: reads TAOSTATS_API_KEY from environment, "
               "adds Authorization header when present"),
        bullet("Errors now propagate as RuntimeError with user-visible messages:"),
        sub_bullet("401 → 'Taostats API key required — sign up free at taostats.io/pro then add TAOSTATS_API_KEY'"),
        sub_bullet("Other HTTP errors → 'Taostats API {code}: {reason}'"),
        bullet("chain_error now surfaces in UI — actionable amber banner with link to taostats.io/pro"),
        bullet("Frontend ChainTransfer type: added extrinsic_id field"),
        bullet("Chain Transfers table: uses extrinsic_id for Taostats link (more stable than tx_hash)"),
        bullet("Info banner updated: explains API key requirement upfront with free signup link"),

        Paragraph("5.3  Taostats v1 API Response Schema (for reference)", h2_style),
    ]

    schema_data = [
        ["Field",            "Type",   "Notes"],
        ["data[]",           "array",  "Top-level array (previously 'results' or direct array)"],
        ["data[].to.ss58",   "string", "Recipient SS58 address (nested object, not plain string)"],
        ["data[].from.ss58", "string", "Sender SS58 address (nested object, not plain string)"],
        ["data[].amount",    "string", "Amount in rao as string, e.g. '6500000000' (÷1e9 = 6.5 TAO)"],
        ["data[].transaction_hash", "string", "Full 0x… hash (was 'hash' in old schema)"],
        ["data[].extrinsic_id",     "string", "'block-index' format, e.g. '6925022-0021'"],
        ["data[].fee",       "string", "Network fee in rao"],
        ["data[].block_number", "int", "Block number"],
        ["data[].timestamp", "string", "ISO 8601 datetime"],
    ]
    story.append(make_table(schema_data,
        [1.8*inch, 0.7*inch, 4.0*inch],
        [("FONTNAME", (0, 1), (0, -1), "Courier"),
         ("FONTSIZE", (0, 1), (0, -1), 7),
         ("TEXTCOLOR", (0, 1), (0, -1), BLUE)]))
    story.append(sp(10))

    # ─── SECTION 6 — STRATEGY MODE OVERRIDE RELOCATION ───────────────────────
    story += [
        HR(),
        Paragraph("6. Strategies — Strategy Mode Override Relocation", h1_style),
        Paragraph(
            "Commit e1b6a660. The Strategy Mode Override section was relocated from the "
            "Human Override page to the bottom half of the Strategies page, below the "
            "card grid. This is where the operator already lives when managing strategy "
            "performance — the override controls now follow naturally from what they see.",
            body_style,
        ),

        Paragraph("6.1  What Moved (from HumanOverride.tsx)", h2_style),
    ]

    removed_data = [
        ["Removed from HumanOverride",          "Disposition"],
        ["StrategyRow interface",               "Replaced by direct strategies[] from store"],
        ["MODE_ORDER constant",                 "Moved to Strategies"],
        ["MODE_META constant",                  "Merged into existing Strategies MODE_META (added 'short' field)"],
        ["STRATEGIES_LIST constant",            "Removed — Strategies uses live strategies[] directly"],
        ["fmtTao helper function",              "Already existed as fmt() in Strategies — call renamed"],
        ["ModeStep sub-component",              "Moved to Strategies"],
        ["opPending / stakeEditing / stakeInput state", "Moved to Strategies"],
        ["doPromote / doDemote / doSetMode / doSetStake", "Moved to Strategies"],
        ["rows const (STRATEGIES_LIST.map)",    "Replaced by strategies.filter() for hero slide counts"],
        ["ArrowUp, ArrowDown, ShieldOff imports","Removed — unused after removal"],
        ["Strategy Mode Override JSX block",    "Moved to Strategies bottom"],
    ]
    story.append(make_table(removed_data,
        [2.8*inch, 3.7*inch],
        [("TEXTCOLOR", (1, 1), (1, -1), EMERALD)]))
    story.append(sp(6))

    story += [
        Paragraph("6.2  What Was Added (to Strategies.tsx)", h2_style),
        bullet("ArrowUp, ArrowDown, ChevronRight icon imports"),
        bullet("toast from 'react-hot-toast' and api from '@/api/client' imports"),
        bullet("MODE_ORDER constant (PAPER_ONLY → APPROVED_FOR_LIVE → LIVE)"),
        bullet("short field added to existing MODE_META (shared by cards + ModeStep buttons)"),
        bullet("ModeStep sub-component — three mode buttons with active/pending states"),
        bullet("opPending, stakeEditing, stakeInput state"),
        bullet("doPromote, doDemote, doSetMode, doSetStake functions"),
        bullet("Strategy Mode Override JSX panel — full fleet always shown regardless of active filter"),

        Paragraph("6.3  Quality-of-Life Addition", h2_style),
        Paragraph(
            "The panel footer note reads: 'The full fleet is always shown here regardless of the "
            "filter applied above.' This is intentional — if the operator has filtered the card "
            "grid to show only LIVE strategies, the override table below still shows all 12. "
            "Override authority is unconditional.",
            body_style,
        ),
        sp(8),
    ]

    # ─── SECTION 7 — FILES CHANGED ───────────────────────────────────────────
    story += [
        HR(),
        Paragraph("7. Complete File Change Log", h1_style),
    ]

    files_data = [
        ["File",                                         "Change",    "Description"],
        ["frontend/src/pages/Strategies.tsx",            "Modified",  "Allocation Tier Key → top; +MODE_ORDER/ModeStep; +mode override state+functions+JSX at bottom"],
        ["frontend/src/pages/OpenClaw.tsx",              "Modified",  "Promotion Gate panel inserted between Consensus History and 'How it Works'; +Shield import"],
        ["frontend/src/pages/ActivityLog.tsx",           "Modified",  "Signal Feeds button + SignalFeedsDrawer (6 source cards, API key inputs, test buttons); LegendBar update"],
        ["backend/services/signal_ingestor.py",          "NEW",       "5 async polling loops: CoinGecko/Reddit/TaoDaily/Taostats/Perplexity + Discord scaffold"],
        ["backend/routers/signal_feeds.py",              "NEW",       "4 REST endpoints: list feeds, toggle, configure key, test-fetch"],
        ["backend/main.py",                              "Modified",  "signal_ingestor startup wired into FastAPI lifecycle"],
        ["backend/services/risk_service.py",             "Modified",  "5 parameter defaults recalibrated (position 5%, concurrent 3, DD 8%, CB 5%, confidence 0.65)"],
        ["frontend/src/pages/RiskConfig.tsx",            "Modified",  "DEFAULTS updated; phase-aware slider descriptions; three-phase graduation path panel added"],
        ["frontend/src/pages/Wallet.tsx",                "Modified",  "RecoveryTracker removed (207 lines); Trophy/Target/Edit3 imports removed; taoPrice/balance state removed"],
        ["frontend/src/pages/PnLSummary.tsx",            "Modified",  "RecoveryTracker added (206 lines); Target/Edit3 imports; taoPrice/balance state + 30s polling"],
        ["backend/routers/wallet.py",                    "Modified",  "_parse_taostats_rows(); _taostats_headers(); corrected URL; v1 schema; errors now propagate"],
        ["frontend/src/pages/WalletTransactions.tsx",    "Modified",  "ChainTransfer.extrinsic_id; actionable 401 error banner; extrinsic_id in table links; info banner update"],
        ["frontend/src/pages/HumanOverride.tsx",         "Modified",  "Strategy Mode Override removed (~257 lines); StrategyRow/MODE_META/ModeStep/state/functions removed; rows→strategies"],
    ]
    story.append(make_table(files_data,
        [2.55*inch, 0.7*inch, 3.25*inch],
        [("TEXTCOLOR", (1, 1), (1, -1), EMERALD),
         ("TEXTCOLOR", (1, 9), (1, 9), AMBER),    # NEW files in amber
         ("TEXTCOLOR", (1, 5), (1, 6), AMBER)]))
    story.append(sp(10))

    # ─── SECTION 8 — COMMIT LOG ───────────────────────────────────────────────
    story += [
        HR(),
        Paragraph("8. Session XX Git Commit Log", h1_style),
    ]

    commits = [
        ("064722d1", "ui: relocate Promotion Gate → OpenClaw page; Allocation Tier Key → top of Strategies page"),
        ("f44d6c4c", "feat: Activity Log — inbound Signal Feeds (CoinGecko/Reddit/TaoDaily/Taostats/Perplexity/Discord scaffold)"),
        ("db6e4819", "risk: tighten unproven-phase defaults — 5% position, 3 concurrent, 8% DD, 5% daily CB, 0.65 confidence; add graduation path"),
        ("7179b34c", "ui: relocate Recovery Tracker — Wallet → P&L Summary (top of scrollable, north-star position)"),
        ("35646f70", "Transactions: fix Taostats 404 — correct API URL, new v1 schema, API key support, surface auth errors"),
        ("e1b6a660", "Strategies: relocate Strategy Mode Override from Human Override to bottom of Strategies page"),
    ]
    for sha, msg in commits:
        story.append(Paragraph(f"<b>{sha}</b>  {msg}", mono_style))
    story.append(sp(10))

    # ─── SECTION 9 — PENDING ITEMS ────────────────────────────────────────────
    story += [
        HR(),
        Paragraph("9. Pending Items / Next Steps", h1_style),

        Paragraph("API Keys to Activate (immediate)", h2_style),
        bullet("TAOSTATS_API_KEY — free tier at taostats.io/pro → enables Chain Transfers tab + Taostats signal feed", AMBER),
        bullet("PERPLEXITY_API_KEY — api.perplexity.ai (~$16/month) → enables AI-synthesised TAO news signal", AMBER),
        bullet("Discord bot token + OTF server invite → enables real-time Discord announcement feed", AMBER),

        Paragraph("Carried Forward (Sessions XVIII–XIX)", h2_style),
        bullet("Verify wallet 0.227τ balance on Taostats independently"),
        bullet("Fix DATABASE_UR typo (missing L) in Railway environment variables"),
        bullet("Monitor strategy win rates toward 55% WR (APPROVED_FOR_LIVE threshold)"),
        bullet("Activate Execution Guard blocking (SLIPPAGE_GUARD_ENABLED = True in execution_guard.py)"),
        bullet("MEV guard scaffold in place (MEV_GUARD_ENABLED = False) — deferred until priority calls"),

        Paragraph("Risk Parameter Graduation", h2_style),
        bullet("When 2+ strategies clear the promotion gate → advance to Phase 2 risk parameters"),
        sub_bullet("Phase 2: position 10%, concurrent 4, drawdown 12%, daily circuit breaker 8%"),
        bullet("Phase 3 parameters: operator discretion after fully proven fleet"),

        Paragraph("Taostats Data Gaps", h2_style),
        bullet("SN65–128 subnet names in SUBNET_META are placeholders — populate as subnets establish identities"),
        bullet("Chain Transfers tab will populate fully once TAOSTATS_API_KEY is set in Railway"),
        sp(8),
    ]

    # ─── SECTION 10 — SYSTEM STATE ────────────────────────────────────────────
    story += [
        HR(),
        Paragraph("10. Current System State", h1_style),

        Paragraph("Fully operational:", h2_style),
        bullet("✅  Strategies — Tier Key at top; Promotion Gate in OpenClaw; Mode Override at bottom", EMERALD),
        bullet("✅  Activity Log — Signal Feeds drawer with 3 auto-start feeds (CoinGecko/Reddit/TaoDaily)", EMERALD),
        bullet("✅  Risk Config — recalibrated parameters, graduation path embedded in UI", EMERALD),
        bullet("✅  P&L Summary — Recovery Tracker as first scrollable element", EMERALD),
        bullet("✅  Transactions — correct Taostats API URL, v1 schema parsed, auth errors surfaced", EMERALD),
        bullet("✅  Human Override — Strategy Mode Override successfully removed; page remains fully functional", EMERALD),
        bullet("✅  All 6 commits pushed to GitHub origin/main, working tree clean", EMERALD),

        Paragraph("Awaiting API keys:", h2_style),
        bullet("⏳  Taostats signal feed (TAOSTATS_API_KEY) — key signed up, not yet configured", AMBER),
        bullet("⏳  Perplexity Sonar signal feed (PERPLEXITY_API_KEY) — pending", AMBER),
        bullet("⏳  Discord Gateway (bot token + OTF invite) — pending", AMBER),

        Paragraph("Training / live trading status:", h2_style),
        bullet("Paper mode active — FORCE_PAPER_MODE=1 — all live execution blocked"),
        bullet("Cycle engine running — 300s interval — 288 cycles/day"),
        bullet("Risk parameters: Phase 1 operational levels (5% position, 3 concurrent, 8% DD, 5% CB)"),
        bullet("DO NOT return to live trading before 2+ strategies clear the promotion gate"),
        sp(8),
    ]

    # ─── SECTION 11 — LESSONS LEARNED ────────────────────────────────────────
    story += [
        HR(),
        Paragraph("11. Lessons Learned", h1_style),

        Paragraph("Trailing slash matters — and silent failures are the worst kind:", h2_style),
        Paragraph(
            "The /api/transfer/v1/ → 404 bug had been in the codebase since initial implementation. "
            "It was silently swallowed by a try/except, returning [] without ever propagating "
            "an error. The Chain Transfers tab appeared to work (it loaded) — it just never "
            "had data. The lesson: never swallow HTTP errors silently. Always propagate them "
            "to the UI with actionable context. 'No data' is not the same as 'API unavailable.'",
            body_style,
        ),

        Paragraph("API schemas evolve — parse defensively:", h2_style),
        Paragraph(
            "The Taostats v1 API changed from flat strings to nested objects for to/from "
            "addresses, changed the amount field from float to rao string, and renamed "
            "the hash field. The new parser handles both old and new schema patterns. "
            "External API schemas are contracts that can change — always parse with "
            "fallback logic, never assume field names are stable across API versions.",
            body_style,
        ),

        Paragraph("Place controls where operators already live:", h2_style),
        Paragraph(
            "Strategy Mode Override was on the Human Override page, but operators spend most "
            "of their time on the Strategies page evaluating win rates and tiers. Moving the "
            "override controls to where the operator already is eliminates a navigation step "
            "at the exact moment they want to act. The best UI is the one where the thing "
            "you need is already where you're looking.",
            body_style,
        ),

        Paragraph("Parameter coherence: evaluate as a system, not individually:", h2_style),
        Paragraph(
            "A 15% Daily Circuit Breaker with 5% position size is not merely conservative — "
            "it is inoperative. 37 consecutive stops is not 'something is wrong'; it is "
            "the system executing exactly as designed for three consecutive days of 100% loss. "
            "Every parameter must be evaluated in the context of every other parameter. "
            "Internal coherence is as important as the values themselves.",
            body_style,
        ),
        sp(8),
    ]

    # ─── CLOSING ──────────────────────────────────────────────────────────────
    story += [
        sp(6), HR(), sp(6),
        Paragraph("Closing Note", h1_style),
        Paragraph(
            "Session XX closed the loop on the UI/UX relocation sprint that began in "
            "Session XVIII. Every component now lives where it belongs operationally: "
            "the Tier Key before the fleet, the Promotion Gate beside the consensus history, "
            "the Recovery Tracker on the P&L page, the Mode Override at the bottom of "
            "the Strategies page. The Human Override page is now a focused emergency "
            "control panel — not a kitchen sink.",
            body_style,
        ),
        Paragraph(
            "The Taostats bug fix was the sleeper find of the session: a one-character "
            "trailing slash that had silently prevented chain transfer data from loading "
            "since the feature was first built. It was caught, diagnosed, and fixed in "
            "one pass — along with the schema update and proper error surfacing.",
            body_style,
        ),
        Paragraph(
            "The Signal Feeds infrastructure is now live for three sources (CoinGecko, "
            "Reddit, TaoDaily) and scaffold-ready for three more (Taostats, Perplexity, "
            "Discord). The next step is the API keys — which begins immediately.",
            white_style,
        ),
        sp(16),
        Paragraph(
            "— II Agent, Session XX, May 4 2026",
            S("Sig", fontSize=8, textColor=SLATE, fontName="Helvetica-Oblique"),
        ),
    ]

    doc.build(story)
    print(f"✅  PDF written → {OUTPUT}")


if __name__ == "__main__":
    build()