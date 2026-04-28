"""
Session XV Archive — The Accounting Fix
Generates: archives/Session_XV_The_Accounting_Fix.pdf

This session resolved the Wallet Transactions page not working,
traced the root cause to a CORS/architecture problem, rebuilt the
frontend serving infrastructure, and established the honest
accounting baseline: τ 1.7230 total invested across all wallets.
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)

OUTPUT = "archives/Session_XV_The_Accounting_Fix.pdf"

# ── Colour palette (matches Session XIV) ────────────────────────────────────
DARK_BG   = colors.HexColor("#0d1b2e")
CYAN      = colors.HexColor("#22d3ee")
EMERALD   = colors.HexColor("#10b981")
AMBER     = colors.HexColor("#f59e0b")
RED       = colors.HexColor("#ef4444")
SLATE     = colors.HexColor("#94a3b8")
WHITE     = colors.white

def build():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=letter,
        leftMargin=0.85*inch,
        rightMargin=0.85*inch,
        topMargin=0.85*inch,
        bottomMargin=0.85*inch,
        title="Session XV — The Accounting Fix",
        author="Intelligent Internet TAO Bot",
    )

    styles = getSampleStyleSheet()

    def S(name, **kw):
        return ParagraphStyle(name, parent=styles["Normal"], **kw)

    title_style = S("Title",  fontSize=22, textColor=WHITE,
                    fontName="Helvetica-Bold", spaceAfter=4, leading=28)
    sub_style   = S("Sub",    fontSize=11, textColor=CYAN,
                    fontName="Helvetica", spaceAfter=14)
    h1_style    = S("H1",     fontSize=14, textColor=CYAN,
                    fontName="Helvetica-Bold", spaceBefore=14, spaceAfter=6,
                    borderPad=4)
    h2_style    = S("H2",     fontSize=11, textColor=AMBER,
                    fontName="Helvetica-Bold", spaceBefore=8, spaceAfter=4)
    body_style  = S("Body",   fontSize=9,  textColor=SLATE,
                    fontName="Helvetica",   leading=14, spaceAfter=6)
    mono_style  = S("Mono",   fontSize=8,  textColor=EMERALD,
                    fontName="Courier",     leading=12, spaceAfter=4,
                    leftIndent=18)
    warn_style  = S("Warn",   fontSize=9,  textColor=AMBER,
                    fontName="Helvetica-Bold", leading=14, spaceAfter=6)
    red_style   = S("Red",    fontSize=9,  textColor=RED,
                    fontName="Helvetica-Bold", leading=14, spaceAfter=6)
    white_style = S("White",  fontSize=9,  textColor=WHITE,
                    fontName="Helvetica-Bold", leading=14, spaceAfter=6)

    def HR(): return HRFlowable(width="100%", thickness=0.5,
                                color=CYAN, spaceAfter=8, spaceBefore=4)
    def sp(n=8): return Spacer(1, n)

    story = []

    # ── Cover ────────────────────────────────────────────────────────────────
    story += [
        sp(20),
        Paragraph("SESSION XV", S("Tag", fontSize=10, textColor=AMBER,
                                   fontName="Helvetica-Bold")),
        Paragraph("The Accounting Fix", title_style),
        Paragraph("Intelligent Internet — TAO Autonomous Trading Bot", sub_style),
        Paragraph("Date: April 28, 2026  |  Mode: Paper (FORCE_PAPER_MODE=1)", body_style),
        HR(),
        Paragraph(
            "This session had one primary goal: make the Wallet Transactions page work. "
            "What started as 'funding events not showing' unravelled into a full architectural "
            "diagnosis — a CORS mis-wiring that meant the browser could never reach the backend "
            "directly. Three hours of debugging, one new proxy server, and seven funding records "
            "later, the honest accounting baseline is now established: <b>τ 1.7230</b> total "
            "invested. That is the target. That is what 'getting back to even' means.",
            body_style,
        ),
        sp(10),
    ]

    # ── Section 1: What We Came In To Do ───────────────────────────────────
    story += [
        HR(),
        Paragraph("1. Session Objective", h1_style),
        Paragraph(
            "The previous session (XIV) ended with the Wallet Transactions page built and "
            "committed. The user's immediate goal was to enter all historical funding events "
            "so the Net P&amp;L card would show the honest total loss. Upon opening the page, "
            "zero records showed — despite the user having submitted 5–6 entries.",
            body_style,
        ),
        Paragraph("Starting state:", h2_style),
        Paragraph("• Wallet Transactions page: deployed but showing 'No funding events recorded'", body_style),
        Paragraph("• NET P&L card: showing '...' (loading forever)", body_style),
        Paragraph("• User's entered records: 0 visible out of 5–6 submitted", body_style),
        Paragraph("• Root cause: unknown — investigation required", body_style),
    ]

    # ── Section 2: Forensic Audit ───────────────────────────────────────────
    story += [
        sp(6), HR(),
        Paragraph("2. Forensic Audit — Why Records Weren't Showing", h1_style),
        Paragraph("Three separate bugs were found, each masking the others:", h2_style),

        Paragraph("Bug 1 — GET /wallet/transactions crashing (PRIMARY CAUSE)", warn_style),
        Paragraph(
            "The endpoint called get_stake_info() and get_prices_for_netuids() — live "
            "Bittensor chain queries. In paper mode with no active positions, these time out "
            "or raise. They were NOT wrapped in try/except. Result: the entire endpoint "
            "returned HTTP 500. The frontend data stayed null. The EmptyState showed — "
            "even though records were sitting perfectly fine in the SQLite database.",
            body_style,
        ),

        Paragraph("Bug 2 — Silent error handler in the form submit", warn_style),
        Paragraph(
            "The 'Record Funding' modal catch handler used: e?.response?.data?.detail",
            mono_style,
        ),
        Paragraph(
            "But the axios interceptor had already converted errors to plain Error objects, "
            "stripping the response info. So every failed POST showed 'Failed to save' with "
            "no real reason. The user may have seen this toast but not understood it meant "
            "the data was never saved.",
            body_style,
        ),

        Paragraph("Bug 3 — CORS architecture mismatch (ROOT ARCHITECTURE PROBLEM)", red_style),
        Paragraph(
            "VITE_API_URL was set to autonomous-trade-bot-production.up.railway.app — the "
            "backend's Railway public URL. However, that URL was not actually reachable from "
            "browsers (Railway's proxy returned 'Not Found'). The browser got no response "
            "at all, reported it as a CORS error. The backend's allow_origins=[\"*\"] setting "
            "was correct in code but irrelevant — the server never sent any response headers "
            "because the connection failed before FastAPI could respond.",
            body_style,
        ),

        Paragraph("Browser console evidence:", h2_style),
        Paragraph(
            "Access to XMLHttpRequest at 'https://autonomous-trade-bot-production.up.railway.app"
            "/api/wallet/transactions...' from origin "
            "'https://profound-expression-production-75c7.up.railway.app' "
            "has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header "
            "is present on the requested resource. net::ERR_FAILED",
            mono_style,
        ),
    ]

    # ── Section 3: Infrastructure Discovery ────────────────────────────────
    story += [
        sp(6), HR(),
        Paragraph("3. Infrastructure Discoveries", h1_style),

        Paragraph("Railway Volume vs PostgreSQL", h2_style),
        Paragraph(
            "The 'postgres-volume' attached to autonomous-trade-bot is a Railway Volume "
            "(persistent filesystem), NOT a PostgreSQL database. Confirmed by the Volume "
            "Usage metrics chart (~100MB flat line). SQLite lives at /data/trading_bot.db "
            "on this mounted volume. Data persists across deploys. No DATABASE_URL env var "
            "is set — the app uses the SQLite fallback correctly.",
            body_style,
        ),

        Paragraph("DB table confirmation (from Railway deploy logs):", h2_style),
        Paragraph(
            "DB tables confirmed: ['bot_config', 'price_history', 'stake_positions', "
            "'strategies', 'trades', 'wallet_fundings']",
            mono_style,
        ),
        Paragraph(
            "The wallet_fundings table DID exist. The data simply wasn't loading because "
            "the endpoint was crashing. Records submitted before Bug 1 was fixed were "
            "likely lost (POST was returning 500 or not reaching the DB at all).",
            body_style,
        ),

        Paragraph("profound-expression is frontend-only", h2_style),
        Paragraph(
            "The profound-expression service runs 'npx serve dist --single' — a static "
            "file server with SPA fallback. It does NOT proxy API calls. When VITE_API_URL "
            "was set to the backend URL, the browser made direct cross-origin requests to "
            "the backend — which was not publicly reachable. All API calls that worked "
            "before were likely working through a different mechanism or cached state.",
            body_style,
        ),
    ]

    # ── Section 4: Fixes Implemented ──────────────────────────────────────
    story += [
        sp(6), HR(),
        Paragraph("4. All Fixes Implemented This Session", h1_style),

        Paragraph("Fix 1 — Defensive chain calls in backend (commit 6d4cb42)", h2_style),
        Paragraph(
            "Wrapped get_stake_info() and get_prices_for_netuids() in individual try/except "
            "blocks in GET /wallet/transactions. A failed chain call now sets staked_tao=0 "
            "and continues — never prevents the funding ledger from loading.",
            body_style,
        ),

        Paragraph("Fix 2 — Frontend error handler corrected (commit 6d4cb42)", h2_style),
        Paragraph(
            "Changed form catch handler from e?.response?.data?.detail to "
            "(err as Error)?.message — correctly reads the error message the axios "
            "interceptor sets. Real error messages now show in toasts.",
            body_style,
        ),

        Paragraph("Fix 3 — Fallback load path added (commit 6d4cb42)", h2_style),
        Paragraph(
            "If GET /wallet/transactions fails for any reason, load() now falls back to "
            "GET /wallet/funding (simple DB query, no chain calls). Funding Events tab "
            "always shows records regardless of chain availability.",
            body_style,
        ),

        Paragraph("Fix 4 — DB table verification on startup (commit ad2211d)", h2_style),
        Paragraph(
            "init_db() now logs all confirmed table names at startup. Railway deploy logs "
            "show exactly which tables exist. Added GET /api/wallet/db-check diagnostic "
            "endpoint that returns table existence + row counts without Railway shell access.",
            body_style,
        ),

        Paragraph("Fix 5 — Express proxy server replacing npx serve (commit b3c9605)", h2_style),
        Paragraph(
            "PERMANENT ARCHITECTURE FIX. Replaced 'npx serve dist --single' with a Node.js "
            "Express server (frontend/server.js) that: (1) serves the React SPA static files, "
            "(2) proxies all /api/* requests to the backend via Railway's private internal "
            "network (http://autonomous-trade-bot.railway.internal:8080). "
            "Browser never talks directly to the backend. No CORS issues possible. "
            "Backend does not need a public URL.",
            body_style,
        ),
        Paragraph("Architecture change:", h2_style),
        Paragraph("BEFORE: Browser → autonomous-trade-bot.railway.app (not reachable) → CORS error", mono_style),
        Paragraph(
            "AFTER:  Browser → profound-expression.railway.app/api/ "
            "→ [Express proxy] → autonomous-trade-bot.railway.internal:8080 → FastAPI",
            mono_style,
        ),

        Paragraph("Fix 6 — asyncio.get_event_loop() → get_running_loop() (commit b3c9605)", h2_style),
        Paragraph(
            "Fixed deprecated asyncio API usage in wallet.py. get_running_loop() is the "
            "correct call inside async coroutines for run_in_executor calls.",
            body_style,
        ),

        Paragraph("Fix 7 — Fallback P&L calculates real balance (commit 826a1df)", h2_style),
        Paragraph(
            "The fallback path was hardcoding net_pnl_tao=0. Fixed to call "
            "GET /wallet/status (fast, cached) for current balance, then compute "
            "net_pnl = current_balance - total_funded. NET P&L card now shows the "
            "accurate -τ1.7230 (-100%) figure even when chain calls are unavailable.",
            body_style,
        ),

        Paragraph("Railway Variables changed by operator:", h2_style),
        Paragraph("• profound-expression: VITE_API_URL → DELETED", mono_style),
        Paragraph("• profound-expression: BACKEND_INTERNAL_URL = http://autonomous-trade-bot.railway.internal:8080  → ADDED", mono_style),
    ]

    # ── Section 5: Accounting Baseline Established ────────────────────────
    story += [
        sp(6), HR(),
        Paragraph("5. The Accounting Baseline — Session XV's Real Achievement", h1_style),
        Paragraph(
            "The Wallet Transactions page was built last session. But it only became useful "
            "this session when the bugs were fixed and the operator could actually enter data. "
            "Seven funding events were recorded across two wallets:",
            body_style,
        ),
    ]

    funding_data = [
        ["Block #",    "Amount (τ)",  "TX Hash (partial)",   "Wallet"],
        ["8062410",    "0.2730",      "0x2a5f5e...0d",       "Current"],
        ["8056455",    "0.5000",      "0x5b3d75...221efb",   "Current"],
        ["8055757",    "0.2160",      "0xf6e6e6...e6b804",   "Current"],
        ["8065735",    "0.0040",      "0x725ecb...af9fb5",   "Current"],
        ["7982580",    "0.2270",      "0xc3b203...0e2168",   "Current"],
        ["7959070",    "0.1030",      "0xb2a605...183548",   "Previous"],
        ["7954723",    "0.4000",      "0x6c5920...49253f",   "Previous"],
        ["TOTAL",      "τ 1.7230",    "7 deposits",          "2 wallets"],
    ]
    t = Table(funding_data, colWidths=[1.1*inch, 1.1*inch, 2.3*inch, 1.0*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",  (0,0), (-1,0),  DARK_BG),
        ("TEXTCOLOR",   (0,0), (-1,0),  CYAN),
        ("FONTNAME",    (0,0), (-1,0),  "Helvetica-Bold"),
        ("FONTSIZE",    (0,0), (-1,-1), 8),
        ("BACKGROUND",  (0,-1),(-1,-1), colors.HexColor("#0f2d1a")),
        ("TEXTCOLOR",   (0,-1),(-1,-1), EMERALD),
        ("FONTNAME",    (0,-1),(-1,-1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0,1), (-1,-2), [colors.HexColor("#070e1a"),
                                            colors.HexColor("#0a1220")]),
        ("TEXTCOLOR",   (0,1), (-1,-2), SLATE),
        ("GRID",        (0,0), (-1,-1), 0.3, colors.HexColor("#1e3a5f")),
        ("ALIGN",       (0,0), (-1,-1), "LEFT"),
        ("TOPPADDING",  (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0),(-1,-1), 4),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
    ]))
    story += [t, sp(10)]

    story += [
        Paragraph("The target:", h2_style),
        Paragraph(
            "Current balance: τ 0.0000  |  Total funded: τ 1.7230  |  Net P&amp;L: -τ 1.7230 (-100%)",
            mono_style,
        ),
        Paragraph(
            "At today's TAO price (~$375 USD), τ 1.7230 ≈ $646 USD total invested across "
            "the project's lifetime. The actual USD cost basis depends on the TAO price at "
            "time of each purchase — but τ 1.7230 is the definitive TAO target.",
            body_style,
        ),
        Paragraph(
            "Recovery target: τ 1.7230 in liquid + staked value. "
            "That is what 'getting back to even' means. Every strategy improvement, "
            "every honest paper cycle, every gate threshold refinement is measured against "
            "this number.",
            white_style,
        ),
    ]

    # ── Section 6: Commit Log ──────────────────────────────────────────────
    story += [
        sp(6), HR(),
        Paragraph("6. Session XV Git Commit Log", h1_style),
    ]

    commits = [
        ("826a1df", "fix(transactions): fallback P&L now fetches real balance — shows accurate net loss"),
        ("b3c9605", "fix(arch): replace npx serve with Express proxy server — eliminates CORS permanently"),
        ("ad2211d", "fix(db): explicit table verification in init_db + /wallet/db-check diagnostic endpoint"),
        ("6d4cb42", "fix(transactions): funding events not showing — defensive chain calls + error handler fix"),
        ("9350796", "[Session XIV end] feat(transactions): wallet funding ledger + transactions page"),
    ]
    for sha, msg in commits:
        story.append(Paragraph(f"<b>{sha}</b>  {msg}", mono_style))
    story.append(sp(6))

    # ── Section 7: Lessons & Handoff ──────────────────────────────────────
    story += [
        HR(),
        Paragraph("7. Lessons Learned & Future AI Handoff", h1_style),

        Paragraph("Architecture lesson — proxy-first deployment:", h2_style),
        Paragraph(
            "When a frontend and backend are separate Railway services, NEVER point "
            "VITE_API_URL at the backend's public URL. The browser cannot reliably reach "
            "Railway internal services from the public internet. Always use an Express/Nginx "
            "proxy on the frontend service to forward /api/* to the backend via Railway's "
            "private network (*.railway.internal). This was the root cause of all Transactions "
            "page failures this session.",
            body_style,
        ),

        Paragraph("Accounting lesson — ledger first, trading second:", h2_style),
        Paragraph(
            "The Wallet Transactions page should have been Session 1 Feature 1. You cannot "
            "calculate net P&L without knowing total invested. You cannot set a recovery "
            "target without an honest accounting baseline. Build the ledger before the first "
            "live trade — always.",
            body_style,
        ),

        Paragraph("Debugging lesson — check the browser console first:", h2_style),
        Paragraph(
            "Three separate bugs were investigated before the Console revealed the real "
            "cause: a single CORS/ERR_FAILED line. F12 → Console is always the first "
            "diagnostic step for frontend issues. The error message tells the full story "
            "in seconds.",
            body_style,
        ),

        Paragraph("Critical env vars for next AI session:", h2_style),
        Paragraph("• profound-expression: BACKEND_INTERNAL_URL = http://autonomous-trade-bot.railway.internal:8080", mono_style),
        Paragraph("• autonomous-trade-bot: FORCE_PAPER_MODE=1 (all live execution blocked)", mono_style),
        Paragraph("• autonomous-trade-bot: DATABASE_URL=NOT_SET (uses SQLite at /data/trading_bot.db)", mono_style),
        Paragraph("• DB Volume: postgres-volume mounted at /data/ on autonomous-trade-bot service", mono_style),
    ]

    # ── Section 8: Current State & Next Session ───────────────────────────
    story += [
        sp(6), HR(),
        Paragraph("8. Current System State & What Comes Next", h1_style),

        Paragraph("Working correctly:", h2_style),
        Paragraph("✅  Wallet Transactions page — 7 funding events, τ1.7230 baseline established", body_style),
        Paragraph("✅  CORS permanently fixed — Express proxy architecture on profound-expression", body_style),
        Paragraph("✅  All portfolio-level risk controls wired (from Session XIV)", body_style),
        Paragraph("✅  Honest paper simulator — real fees, no drift, symmetric outcomes", body_style),
        Paragraph("✅  Force paper mode — all live execution blocked", body_style),
        Paragraph("✅  Global halt, circuit breaker, wallet floor all connected to cycle engine", body_style),

        Paragraph("Before returning to live trading:", h2_style),
        Paragraph("□  Accumulate 500+ honest paper cycles per strategy", body_style),
        Paragraph("□  Verify win rates land at 34–48% (not inflated 60–80% from old simulator)", body_style),
        Paragraph("□  Re-evaluate gate thresholds (55% WR gate likely too low with 1%+ fees)", body_style),
        Paragraph("□  Confirm circuit breaker trips correctly in paper testing", body_style),
        Paragraph("□  Human Override page — subnet dropdown + auto-fill redesign", body_style),
        Paragraph("□  Add date/time to existing 7 funding records (currently showing '—')", body_style),

        Paragraph("The honest recovery math:", h2_style),
        Paragraph("Total invested:  τ 1.7230", mono_style),
        Paragraph("Current value:   τ 0.0000", mono_style),
        Paragraph("Target to break even: τ 1.7230 in liquid + staked", mono_style),
        Paragraph("Status:  Accumulating paper data under honest physics. Not ready for live.", mono_style),
    ]

    # ── Closing ────────────────────────────────────────────────────────────
    story += [
        sp(10), HR(), sp(6),
        Paragraph("Closing Note", h1_style),
        Paragraph(
            "This session was unglamorous work — debugging invisible failures, reading "
            "browser console errors, rebuilding serving infrastructure, walking a non-technical "
            "user through F12 → Console → Issues vs Console. None of it shows up in a "
            "feature list. All of it matters.",
            body_style,
        ),
        Paragraph(
            "The result: one honest number. τ 1.7230. That number didn't exist with integrity "
            "before today. Now it does. Everything that comes next — every paper cycle, every "
            "threshold review, every future live trade — is measured against it.",
            body_style,
        ),
        Paragraph(
            "The code is protected. The accounting is honest. The target is known. "
            "That's a good session.",
            white_style,
        ),
        sp(16),
        Paragraph("— II Agent, Session XV, April 28 2026", S("Sig", fontSize=8,
                  textColor=SLATE, fontName="Helvetica-Oblique")),
    ]

    doc.build(story)
    print(f"✅  PDF written → {OUTPUT}")

if __name__ == "__main__":
    build()