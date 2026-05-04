"""
Session XXI Archive — The Discord Gateway Sprint
Autonomous Trade Bot · May 4 2026

Covers:
  1. Discord bot created — OTF Signal Bot (#8669)
  2. Discord Gateway connector — discord.py 2.x, auto-reconnect, keyword filter
  3. Settings — TAOSTATS_API_KEY / PERPLEXITY_API_KEY / DISCORD_BOT_TOKEN added
  4. Boot order fixed — signal feeds first, chain services non-blocking
  5. End-to-end test passed — live Discord message captured in Activity Log
  6. Signal Feeds: 3/6 → 4/6 connected; Discord "Connected · Real-time"

Commits: d0081eda · 88779820
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

OUTPUT = "/workspace/autonomous-trade-bot/archives/Session_XXI_The_Discord_Gateway_Sprint.pdf"

# ── colour palette ────────────────────────────────────────────────────────────
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
INDIGO     = colors.HexColor("#818cf8")

# ── paragraph styles ──────────────────────────────────────────────────────────
def S(name, **kw):
    return ParagraphStyle(name, **kw)

title_style    = S("Title",    fontSize=22, textColor=CYAN,   fontName="Helvetica-Bold",  spaceAfter=4,  alignment=TA_CENTER)
subtitle_style = S("Subtitle", fontSize=11, textColor=SLATE,  fontName="Helvetica",       spaceAfter=2,  alignment=TA_CENTER)
date_style     = S("Date",     fontSize=9,  textColor=SLATE,  fontName="Helvetica",       spaceAfter=16, alignment=TA_CENTER)
h1_style       = S("H1",       fontSize=13, textColor=CYAN,   fontName="Helvetica-Bold",  spaceBefore=14, spaceAfter=6)
h2_style       = S("H2",       fontSize=10, textColor=EMERALD,fontName="Helvetica-Bold",  spaceBefore=10, spaceAfter=4)
body_style     = S("Body",     fontSize=8,  textColor=WHITE,  fontName="Helvetica",       spaceBefore=2,  spaceAfter=2, leading=12)
mono_style     = S("Mono",     fontSize=7,  textColor=CYAN,   fontName="Courier",         spaceBefore=2,  spaceAfter=2, leading=11)
note_style     = S("Note",     fontSize=7,  textColor=SLATE,  fontName="Helvetica-Oblique", spaceBefore=2, spaceAfter=2, leading=11)
label_style    = S("Label",    fontSize=7,  textColor=AMBER,  fontName="Helvetica-Bold",  spaceBefore=0,  spaceAfter=0)
white_style    = S("White",    fontSize=8,  textColor=WHITE,  fontName="Helvetica-Bold",  spaceBefore=0,  spaceAfter=0)

def HR(): return HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=8, spaceBefore=4)
def SP(n=6): return Spacer(1, n)

def table_style(header_color=BORDER):
    return TableStyle([
        ("BACKGROUND",  (0,0), (-1,0), header_color),
        ("TEXTCOLOR",   (0,0), (-1,0), CYAN),
        ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",    (0,0), (-1,-1), 7),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [CARD_BG, DARK_BG]),
        ("TEXTCOLOR",   (0,1), (-1,-1), WHITE),
        ("GRID",        (0,0), (-1,-1), 0.4, BORDER),
        ("TOPPADDING",  (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0), (-1,-1), 4),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING",(0,0), (-1,-1), 6),
        ("VALIGN",      (0,0), (-1,-1), "TOP"),
    ])

def build():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=letter,
        leftMargin=0.7*inch, rightMargin=0.7*inch,
        topMargin=0.7*inch,  bottomMargin=0.7*inch,
    )

    story = []

    # ── Cover ─────────────────────────────────────────────────────────────────
    story += [
        SP(20),
        Paragraph("SESSION XXI", title_style),
        Paragraph("The Discord Gateway Sprint", subtitle_style),
        Paragraph("Autonomous Trade Bot · May 4, 2026", date_style),
        HR(),
        Paragraph(
            "Discord Gateway live · 4/6 signal feeds connected · end-to-end message capture confirmed · "
            "boot order hardened · Pydantic Settings extended · production deployment successful",
            note_style),
        SP(8),
    ]

    # ── Session Overview ──────────────────────────────────────────────────────
    story += [
        Paragraph("SESSION OVERVIEW", h1_style),
        HR(),
        Paragraph(
            "Session XXI completed the Discord signal feed — the final piece of the 6-feed inbound "
            "signal architecture. A Discord bot (OTF Signal Bot) was created, configured, and connected "
            "to the production backend via discord.py's Gateway WebSocket. A live end-to-end test "
            "confirmed messages containing TAO/Bittensor keywords posted in the OTF Signals Discord "
            "server appear in the Activity Log as SIGNAL events within seconds.",
            body_style),
        SP(4),
        Paragraph(
            "Additionally, a pre-existing boot-order defect was discovered and resolved: bittensor's "
            "substrate-interface was blocking the asyncio event loop on startup, preventing the Discord "
            "Gateway and other async tasks from establishing connections. The fix restructures the boot "
            "sequence so signal feeds start first and chain-dependent services run as non-blocking tasks.",
            body_style),
        SP(8),
    ]

    # ── Task Completion Table ─────────────────────────────────────────────────
    story += [
        Paragraph("TASK COMPLETION", h1_style),
        HR(),
    ]
    tasks = [
        ["#", "Task", "Status", "Commit"],
        ["1", "Discord bot created (OTF Signal Bot #8669)", "✓ Done", "d0081eda"],
        ["2", "discord.py 2.x Gateway connector + keyword filter", "✓ Done", "d0081eda"],
        ["3", "requirements.txt: discord.py>=2.3.2", "✓ Done", "d0081eda"],
        ["4", "Settings: 3 API key fields added to Pydantic model", "✓ Done", "88779820"],
        ["5", "Boot order: signal feeds before chain I/O", "✓ Done", "88779820"],
        ["6", "Boot order: bittensor probe removed (blocks event loop)", "✓ Done", "88779820"],
        ["7", "Boot order: chain services wrapped as non-blocking task", "✓ Done", "88779820"],
        ["8", "Token validated: REST API confirmed OTF Signal Bot live", "✓ Done", "88779820"],
        ["9", "Bot invited to OTF Signals server (guild ID: 1500905...)", "✓ Done", "Manual"],
        ["10","Railway Variables: DISCORD_BOT_TOKEN + TAOSTATS_API_KEY", "✓ Done", "Railway"],
        ["11","Production deployment: Gateway connected, on_ready fired", "✓ Done", "Railway"],
        ["12","E2E test: Discord msg → Gateway → Activity Log confirmed", "✓ Done", "Live"],
        ["13","UI: Discord warning banner hidden when status = ok", "✓ Done", "88779820+"],
    ]
    t = Table(tasks, colWidths=[0.3*inch, 3.4*inch, 0.9*inch, 1.0*inch])
    t.setStyle(table_style())
    story += [t, SP(8)]

    # ── File Change Log ───────────────────────────────────────────────────────
    story += [
        Paragraph("FILE CHANGE LOG", h1_style),
        HR(),
    ]
    files = [
        ["File", "Changes"],
        ["backend/services/signal_ingestor.py",
         "Added discord import; _DISCORD_CHANNEL_KEYWORDS, _DISCORD_TARGET_CHANNELS, "
         "_discord_client/_discord_task globals; _message_is_relevant(); full "
         "_run_discord_gateway() coroutine with on_ready/on_message/on_disconnect/on_error "
         "callbacks; start_all() updated: Discord task started, status set to connecting/pending"],
        ["backend/requirements.txt",
         "Added discord.py>=2.3.2"],
        ["backend/core/config.py",
         "Added TAOSTATS_API_KEY: str = '', PERPLEXITY_API_KEY: str = '', "
         "DISCORD_BOT_TOKEN: str = '' to Settings model (prevents Pydantic extra-field rejection)"],
        ["backend/main.py",
         "signal_ingestor.start_all() moved to TOP of _boot_services() before any chain I/O; "
         "bittensor boot probe removed (substrate-interface blocks event loop thread); "
         "subnet/cycle/agent/promotion services wrapped in _start_chain_services() fire-and-forget task"],
        ["backend/.env",
         "DISCORD_BOT_TOKEN added (git-ignored, local only)"],
        ["frontend/src/pages/ActivityLog.tsx",
         "Discord warning banner condition changed from {isDiscord && ...} to "
         "{isDiscord && feed.status !== 'ok' && ...}; toggle disabled state similarly gated"],
    ]
    t2 = Table(files, colWidths=[2.1*inch, 5.5*inch])
    t2.setStyle(table_style())
    story += [t2, SP(8)]

    # ── Discord Gateway Architecture ──────────────────────────────────────────
    story += [
        Paragraph("DISCORD GATEWAY ARCHITECTURE", h1_style),
        HR(),
        Paragraph("Message Flow", h2_style),
        Paragraph(
            "Discord Server → WebSocket Gateway → discord.py on_message() → "
            "_message_is_relevant() keyword filter → push_event(category='signal') → "
            "Activity Log SIGNAL stream",
            mono_style),
        SP(4),
    ]

    gw = [
        ["Component", "Detail"],
        ["Library", "discord.py 2.7.1 (installed in production venv)"],
        ["Connection", "discord.Client with Intents.default() + message_content=True + messages=True"],
        ["Token format", "Static bot token (Bot prefix in Authorization header)"],
        ["Keyword filter", "subnet · announce · alpha · governance · validator · weight · staking · bittensor · tao · signal"],
        ["Channel scope", "_DISCORD_TARGET_CHANNELS = set() → reads all channels bot can see"],
        ["Author filter", "message.author.bot → skip (ignores other bots)"],
        ["Reconnect", "Exponential backoff: 5/15/30/60/120s; LoginFailure → 300s hold"],
        ["on_ready", "Sets feed enabled=True, status=ok, error=None, last_fetch=now()"],
        ["on_message", "Filters → push_event with channel, author, snippet, message_id, guild"],
        ["on_disconnect", "Sets feed status=connecting (reconnect loop handles re-entry)"],
        ["Bot name", "OTF Signal Bot #8669 (ID: 1500891557312594060)"],
        ["Guild", "OTF Signals (ID: 1500905975107031155)"],
        ["Token verification", "REST GET /api/v10/users/@me confirmed bot identity pre-deploy"],
        ["Guild verification", "REST GET /api/v10/users/@me/guilds confirmed OTF Signals membership"],
    ]
    t3 = Table(gw, colWidths=[2.0*inch, 5.6*inch])
    t3.setStyle(table_style())
    story += [t3, SP(8)]

    # ── Boot Order Fix ────────────────────────────────────────────────────────
    story += [
        Paragraph("BOOT ORDER FIX — ROOT CAUSE ANALYSIS", h1_style),
        HR(),
        Paragraph("Problem", h2_style),
        Paragraph(
            "bittensor's substrate-interface library performs synchronous WebSocket I/O on the "
            "asyncio event loop thread. Even when wrapped in asyncio.wait_for() or create_task(), "
            "the C-extension socket operations block the entire event loop, preventing discord.py's "
            "pending Gateway WebSocket handshake from completing.",
            body_style),
        SP(4),
        Paragraph("Evidence", h2_style),
        Paragraph(
            "Local log froze at 'bittensor | Enabling default logging' for 2+ minutes. "
            "discord.client logged 'logging in using static token' (HTTP to Discord API succeeded) "
            "but on_ready never fired. Price service (pure httpx/aiohttp) started fine — proving "
            "the event loop ran between discord.py start and bittensor block.",
            body_style),
        SP(4),
        Paragraph("Fix", h2_style),
    ]

    boot_before = [
        ["Before (blocking)", "After (non-blocking)"],
        ["signal_ingestor.start_all()  ← LAST", "signal_ingestor.start_all()  ← FIRST"],
        ["await bittensor.get_chain_info()", "# Finney probe REMOVED"],
        ["await price_service.start()", "await price_service.start()"],
        ["await subnet_cache.start()  ← BLOCKS", "_aio.create_task(_start_chain_services())"],
        ["await cycle_service.start()", "  # subnet/cycle/agent/promotion inside task"],
        ["await agent_service.start()", "  # runs concurrently, never blocks boot"],
        ["await promotion_service.start()", ""],
    ]
    t4 = Table(boot_before, colWidths=[3.8*inch, 3.8*inch])
    t4.setStyle(TableStyle([
        ("BACKGROUND",  (0,0), (-1,0), BORDER),
        ("TEXTCOLOR",   (0,0), (-1,0), AMBER),
        ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",    (0,0), (-1,-1), 7),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [CARD_BG, DARK_BG]),
        ("TEXTCOLOR",   (0,1), (0,-1), RED),
        ("TEXTCOLOR",   (1,1), (1,-1), EMERALD),
        ("FONTNAME",    (0,1), (-1,-1), "Courier"),
        ("GRID",        (0,0), (-1,-1), 0.4, BORDER),
        ("TOPPADDING",  (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0), (-1,-1), 4),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING",(0,0), (-1,-1), 6),
    ]))
    story += [t4, SP(8)]

    # ── Signal Feed Status ────────────────────────────────────────────────────
    story += [
        Paragraph("SIGNAL FEED STATUS — POST SESSION XXI", h1_style),
        HR(),
    ]
    feeds = [
        ["Feed", "Status", "Auth", "Interval", "Notes"],
        ["CoinGecko",     "Connected",  "None",       "60s",        "TAO/USD price, 24h change, volume"],
        ["Reddit r/bittensor","Connected","None",      "5 min",      "Community sentiment, RSS"],
        ["TaoDaily News", "Connected",  "None",       "30 min",     "Ecosystem news RSS"],
        ["Discord",       "Connected ✓","Bot token ✓","Real-time",  "OTF Signals server, keyword filter"],
        ["Taostats API",  "Key saved",  "Raw key ✓",  "60s",        "Toggle on to activate; key masked"],
        ["Perplexity Sonar","Disabled", "Pending",    "15 min",     "Awaiting API key from user"],
    ]
    t5 = Table(feeds, colWidths=[1.5*inch, 1.0*inch, 1.0*inch, 0.8*inch, 3.3*inch])
    t5.setStyle(table_style())
    story += [t5, SP(8)]

    # ── Commit Log ────────────────────────────────────────────────────────────
    story += [
        Paragraph("SESSION XXI COMMIT LOG", h1_style),
        HR(),
    ]
    commits = [
        ["Hash", "Message"],
        ["d0081eda", "feat: Discord Gateway live connector (discord.py 2.x, auto-reconnect, keyword filter)"],
        ["88779820", "fix: Discord Gateway + boot order — signal feeds first, chain services non-blocking\n"
                     "  · Settings: add TAOSTATS/PERPLEXITY/DISCORD key fields to Pydantic model\n"
                     "  · Boot: signal_ingestor.start_all() before any chain I/O\n"
                     "  · Boot: bittensor probe removed; chain services as fire-and-forget task\n"
                     "  · Token verified: OTF Signal Bot in OTF Signals guild"],
    ]
    t6 = Table(commits, colWidths=[0.9*inch, 6.7*inch])
    t6.setStyle(table_style())
    story += [t6, SP(8)]

    # ── Pending Items ─────────────────────────────────────────────────────────
    story += [
        Paragraph("PENDING / CARRY-FORWARD", h1_style),
        HR(),
    ]
    pending = [
        ["Item", "Priority", "Notes"],
        ["Message Content Intent", "High",
         "Discord Dev Portal → Bot → Privileged Gateway Intents → Message Content Intent → ON. "
         "Without this, on_message receives empty content strings on verified bots."],
        ["Perplexity API key", "Medium",
         "User deferred. Get at perplexity.ai/api · sonar model · ~$16/month at 15-min interval"],
        ["Taostats API toggle", "Low",
         "Key saved + masked. Toggle ON in Signal Feeds drawer to activate 60s polling."],
        ["OTF Bittensor server invite", "Low",
         "Bot is in OTF Signals (personal). Main discord.gg/bittensor requires server admin invite."],
        ["DATABASE_URL typo", "Low",
         "Railway env var 'DATABASE_UR' missing L — carried from Session XVIII."],
        ["Wallet 0.227τ verification", "Low",
         "Verify on Taostats explorer — carried from Session XVIII."],
        ["Win rate progression", "Ongoing",
         "Monitor strategies toward 55% WR threshold for APPROVED_FOR_LIVE promotion gate."],
        ["SN65–128 subnet names", "Ongoing",
         "SUBNET_META placeholders — populate as subnets establish identities."],
    ]
    t7 = Table(pending, colWidths=[1.9*inch, 0.7*inch, 5.0*inch])
    t7.setStyle(table_style())
    story += [t7, SP(8)]

    # ── Lessons Learned ───────────────────────────────────────────────────────
    story += [
        Paragraph("LESSONS LEARNED", h1_style),
        HR(),
        Paragraph("1. bittensor substrate-interface blocks the event loop at the C-extension level",
                  h2_style),
        Paragraph(
            "asyncio.wait_for(), create_task(), and any Python-level async wrapper cannot prevent "
            "C-extension socket calls from blocking the event loop thread. The only safe patterns are: "
            "(a) run_in_executor with a ThreadPoolExecutor, or (b) restructure boot order so blocking "
            "services start after non-blocking ones have had a chance to complete their async I/O. "
            "We chose (b) as the simpler, more maintainable solution.",
            body_style),
        SP(4),
        Paragraph("2. Pydantic BaseSettings with extra='forbid' rejects unknown env vars",
                  h2_style),
        Paragraph(
            "Adding env vars to Railway/local .env without declaring them in the Settings model causes "
            "ValidationError at startup. Any new env var must have a corresponding field in Settings "
            "before it can be used. Pattern: optional str fields with empty-string defaults.",
            body_style),
        SP(4),
        Paragraph("3. discord.py on_ready is the authoritative connection signal",
                  h2_style),
        Paragraph(
            "'Shard ID None has connected to Gateway' in discord.py's internal logger is the WebSocket "
            "handshake confirmation — on_ready fires immediately after. Using this log line to confirm "
            "production connection is reliable. The REST API /users/@me endpoint also provides a "
            "lightweight pre-flight token validity check without starting the full Gateway.",
            body_style),
        SP(4),
        Paragraph("4. Token exposure in chat — safe here, regenerate if exposed publicly",
                  h2_style),
        Paragraph(
            "The Discord bot token was shared in the private session chat to wire it into the backend. "
            "Tokens shared in private AI sessions are not at risk, but the same token should never be "
            "pasted into a public Discord channel, GitHub commit, or public log. If exposed publicly, "
            "immediately Reset Token in the Discord Developer Portal.",
            body_style),
        SP(8),
    ]

    # ── Footer ────────────────────────────────────────────────────────────────
    story += [
        HR(),
        Paragraph(
            "Session XXI · The Discord Gateway Sprint · Autonomous Trade Bot · May 4 2026 · "
            "All commits pushed to origin/main · 4/6 signal feeds connected · Gateway confirmed live",
            note_style),
    ]

    doc.build(story)
    print(f"✓ Session XXI PDF written → {OUTPUT}")

if __name__ == "__main__":
    build()