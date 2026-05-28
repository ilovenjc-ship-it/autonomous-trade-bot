"""
Robinhood Agentic Trading — Strategic Evaluation
Project Ari · Day 15 · 2026-05-28

Verbatim eval as delivered to Mark in Session XLVI continuation. Cover
sheet + minimal flow scaffolding added per Mark's request; eval body
text preserved word-for-word.

Sources read:
  1. https://robinhood.com/us/en/agentic-trading/      (product page)
  2. https://www.msn.com/.../robinhood-now-lets-ai...  (MSN/TheStreet)

Companion Library entry:
  MemoryBank/Library/robinhood-agentic-launch-2026-05.md
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
    PageBreak, KeepTogether,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

OUTPUT = "/workspace/autonomous-trade-bot/archives/Robinhood_Agentic_Eval_2026-05-28.pdf"

# ── colour palette (matches archive standard) ────────────────────────────────
NEAR_BLACK = colors.HexColor("#070e1a")
DARK_BG    = colors.HexColor("#0a1220")
CARD_BG    = colors.HexColor("#0f1929")
BORDER     = colors.HexColor("#1e3a5f")
CYAN       = colors.HexColor("#22d3ee")
EMERALD    = colors.HexColor("#34d399")
AMBER      = colors.HexColor("#fbbf24")
VIOLET     = colors.HexColor("#a78bfa")
RED        = colors.HexColor("#f87171")
SLATE      = colors.HexColor("#94a3b8")
WHITE      = colors.HexColor("#f1f5f9")
ROSE       = colors.HexColor("#fb7185")

# ── paragraph styles ─────────────────────────────────────────────────────────
def S(name, **kw): return ParagraphStyle(name, **kw)

cover_title    = S("CoverTitle",    fontSize=26, textColor=CYAN,    fontName="Helvetica-Bold",  spaceAfter=4,  alignment=TA_CENTER, leading=30)
cover_sub      = S("CoverSub",      fontSize=12, textColor=EMERALD, fontName="Helvetica-Bold",  spaceAfter=10, alignment=TA_CENTER)
cover_meta     = S("CoverMeta",     fontSize=10, textColor=SLATE,   fontName="Helvetica",       spaceAfter=2,  alignment=TA_CENTER)
cover_author   = S("CoverAuthor",   fontSize=11, textColor=AMBER,   fontName="Helvetica-Oblique", spaceAfter=6, alignment=TA_CENTER)
cover_class    = S("CoverClass",    fontSize=8,  textColor=ROSE,    fontName="Helvetica-Bold",  spaceAfter=18, alignment=TA_CENTER)
cover_abstract = S("CoverAbstract", fontSize=9.5, textColor=WHITE,  fontName="Helvetica",       spaceAfter=6, alignment=TA_JUSTIFY, leading=14, leftIndent=24, rightIndent=24)

h1_style       = S("H1",   fontSize=14, textColor=CYAN,    fontName="Helvetica-Bold",  spaceBefore=14, spaceAfter=6)
h2_style       = S("H2",   fontSize=11, textColor=EMERALD, fontName="Helvetica-Bold",  spaceBefore=10, spaceAfter=4)
h3_style       = S("H3",   fontSize=10, textColor=AMBER,   fontName="Helvetica-Bold",  spaceBefore=8,  spaceAfter=3)
body_style     = S("Body", fontSize=9.5, textColor=WHITE,  fontName="Helvetica",       spaceBefore=3, spaceAfter=3, leading=14, alignment=TA_JUSTIFY)
quote_style    = S("Quote", fontSize=9, textColor=AMBER,   fontName="Helvetica-Oblique", spaceBefore=4, spaceAfter=6, leading=13, leftIndent=24, rightIndent=24, alignment=TA_LEFT)
bullet_style   = S("Bullet", fontSize=9.5, textColor=WHITE, fontName="Helvetica",     spaceBefore=2, spaceAfter=2, leading=13, leftIndent=18, bulletIndent=6)
note_style     = S("Note", fontSize=7,  textColor=SLATE,   fontName="Helvetica-Oblique", spaceBefore=2, spaceAfter=2, leading=11)
hl_style       = S("HL",   fontSize=10.5, textColor=AMBER, fontName="Helvetica-Bold",  spaceBefore=6, spaceAfter=6, leading=14, leftIndent=12, rightIndent=12, alignment=TA_JUSTIFY)

def HR(c=BORDER, t=0.5, sa=8, sb=4):
    return HRFlowable(width="100%", thickness=t, color=c, spaceAfter=sa, spaceBefore=sb)
def SP(n=6): return Spacer(1, n)

def table_style(header_color=BORDER):
    return TableStyle([
        ("BACKGROUND",     (0,0), (-1,0), header_color),
        ("TEXTCOLOR",      (0,0), (-1,0), CYAN),
        ("FONTNAME",       (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",       (0,0), (-1,-1), 8),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [CARD_BG, DARK_BG]),
        ("TEXTCOLOR",      (0,1), (-1,-1), WHITE),
        ("GRID",           (0,0), (-1,-1), 0.4, BORDER),
        ("TOPPADDING",     (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",  (0,0), (-1,-1), 5),
        ("LEFTPADDING",    (0,0), (-1,-1), 7),
        ("RIGHTPADDING",   (0,0), (-1,-1), 7),
        ("VALIGN",         (0,0), (-1,-1), "TOP"),
    ])

def page_decor(canvas, doc):
    """Subtle page decoration — corner marks + footer."""
    canvas.saveState()
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.4)
    # top rule
    canvas.line(0.6*inch, 10.55*inch, 8.0*inch, 10.55*inch)
    # bottom rule
    canvas.line(0.6*inch, 0.6*inch, 8.0*inch, 0.6*inch)
    # footer text
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(SLATE)
    canvas.drawString(0.6*inch, 0.42*inch,
        "Project Ari · Strategic Read · Robinhood Agentic Eval · 2026-05-28")
    canvas.drawRightString(8.0*inch, 0.42*inch, f"Page {doc.page}")
    canvas.restoreState()


# ── content ──────────────────────────────────────────────────────────────────

def cover(story):
    """Cover sheet."""
    story.append(SP(36))
    story.append(Paragraph("PROJECT ARI", cover_meta))
    story.append(Paragraph("STRATEGIC READ", cover_class))
    story.append(SP(40))
    story.append(Paragraph("Robinhood Agentic Trading", cover_title))
    story.append(Paragraph("Read &amp; Strategic Translation", cover_sub))
    story.append(SP(8))
    story.append(HR(c=CYAN, t=0.7, sa=14, sb=8))
    story.append(SP(20))
    story.append(Paragraph("Filed:&nbsp;&nbsp;Day 15 — Thursday, 28 May 2026", cover_meta))
    story.append(Paragraph("Author:&nbsp;&nbsp;Ari, Bittensor Guide and Navigator", cover_author))
    story.append(Paragraph("Classification:&nbsp;&nbsp;Internal · Project Ari Archives", cover_meta))
    story.append(Paragraph("Session reference:&nbsp;&nbsp;XLVI continuation, Item 3", cover_meta))
    story.append(SP(34))
    story.append(HR(c=BORDER, t=0.4, sa=12, sb=4))
    story.append(SP(8))
    story.append(Paragraph(
        "<b>Abstract.</b> On 26 May 2026, two days before this filing, Robinhood Markets "
        "(NASDAQ: HOOD) launched two agentic-finance products — <i>Agentic Trading</i> "
        "(MCP-bridged third-party AI agents authorised to place trades inside a "
        "dedicated brokerage bucket) and an <i>Agentic Credit Card</i> (a parallel AI "
        "shopping/checkout agent). Mark requested an honest holistic read against "
        "Project Ari's current shape: what's worth absorbing, what to deliberately "
        "avoid copying, what the timing means strategically, and where Robinhood is "
        "ahead of us. This document captures that read verbatim, with cover sheet and "
        "minimal flow scaffolding added so it stands on its own outside chat. Companion "
        "Library entry filed at <font face='Courier'>MemoryBank/Library/"
        "robinhood-agentic-launch-2026-05.md</font>; F-50 (<i>Intent-vs-Action Audit</i>) "
        "spec drafted as the one concrete roadmap entry surfaced by this read.",
        cover_abstract))
    story.append(SP(20))
    story.append(HR(c=BORDER, t=0.4, sa=8, sb=4))
    story.append(SP(8))
    story.append(Paragraph(
        "Sources read for this evaluation:&nbsp;&nbsp;"
        "<font face='Courier' size='8'>robinhood.com/us/en/agentic-trading/</font>"
        "&nbsp;·&nbsp;"
        "<font face='Courier' size='8'>msn.com/.../robinhood-now-lets-ai-trade-stocks-on-your-behalf</font>",
        note_style))
    story.append(PageBreak())


def section_unprimed_read(story):
    story.append(Paragraph("THE UNPRIMED READ, IN PLAIN ENGLISH", h1_style))
    story.append(HR())
    story.append(Paragraph(
        "On <b>May 26, 2026</b> (two days ago, while we were shipping F-45), Robinhood — "
        "NASDAQ-listed retail broker, ~25M users — launched <b>two</b> agentic products: "
        "<i>Agentic Trading</i> (any third-party AI agent gets a brokerage account it can "
        "trade in) and an <i>Agentic Credit Card</i> (a parallel AI that shops on your "
        "behalf). The architecture is <b>bring-your-own-agent via MCP</b>: Robinhood is "
        "the rails, you bring the brain. Beta is stock-only; options/crypto/futures on "
        "the roadmap. CEO Tenev: <i>\u201cOur mission has always been to democratize "
        "finance for all, and now, that mission extends to AI agents.\u201d</i>",
        body_style))
    story.append(SP(4))
    story.append(Paragraph("Tagline: <i>\u201cLet your agent trade.\u201d</i>", body_style))
    story.append(SP(4))
    story.append(Paragraph(
        "That's the surface. Under it, several things matter for Project Ari — some good, "
        "some uncomfortable, none accidental.",
        body_style))


def section_what_this_is(story):
    story.append(Paragraph("WHAT THIS <i>IS</i>, STRATEGICALLY", h1_style))
    story.append(HR())
    story.append(Paragraph(
        "Robinhood didn't build an agent. <b>They built infrastructure.</b> They are the "
        "gas station, not the car. The car is whatever AI the user plugs in via MCP. This "
        "positioning is deliberate: it lets them avoid liability for agent behavior (the "
        "disclaimer is breathtaking — see below), it lets them claim category presence "
        "without having to outbuild OpenAI/Anthropic, and it forces the market into their "
        "rails by being the <i>first</i> major broker to ship MCP-native infrastructure. "
        "It's a Visa play, not a Ford play.",
        body_style))
    story.append(Paragraph(
        "<b>Project Ari is the opposite stance.</b> We are the brain. We don't ask the "
        "user to bring intelligence; we <i>are</i> the intelligence. The user brings "
        "trust and a wallet.",
        body_style))
    story.append(Paragraph(
        "This isn't a collision — it's a fork. Robinhood is the generalist marketplace; "
        "Ari is the vertical specialist. <b>And here's the most important strategic "
        "read:</b> Robinhood just legitimized the entire category for us. The \u201cis "
        "this even legal/safe/sane?\u201d objection that every Bittensor agent product "
        "would have hit in 2025 just got answered by a publicly-traded broker for free. "
        "The cultural runway for Ari got paved by Robinhood's marketing department two "
        "days ago, and we didn't have to spend a dollar on it.",
        body_style))
    story.append(Paragraph(
        "That's the gift. Now what do we do with it.",
        body_style))


def section_absorb(story):
    story.append(Paragraph("WHAT'S WORTH ABSORBING INTO ARI'S BLOODSTREAM", h1_style))
    story.append(HR())
    story.append(Paragraph(
        "Reading their <b>\u201cDesigned for safety\u201d</b> section against ours, item "
        "by item:",
        body_style))
    story.append(SP(4))

    rows = [
        ["Robinhood ships", "Ari has", "Gap"],
        ["Dedicated/separate funded bucket — only money the user explicitly walls off is at risk",
         "Paper trading mode + Run Bot / Stop Bot",
         "Functional parity; the framing (\"Agent Sandbox\" / \"agent-only wallet\") is sharper than ours"],
        ["Notification on every trade",
         "Alerts Log + push events",
         "Parity"],
        ["Real-time activity feed + P&L tracker",
         "Activity Log + Trade Log + P&L Summary",
         "Parity (arguably better — we show consensus rounds, regime, fleet health)"],
        ["Instant disconnect — one tap",
         "Stop Bot",
         "Parity (we're cleaner visually)"],
        ["Spending limits / per-strategy caps",
         "Risk Config + FR-7 cap-write enforcement",
         "We are AHEAD — our cap granularity is finer than theirs"],
        ["Optional manual approvals before certain actions",
         "Human Override page exists; pre-trade gate integration is the question",
         "Partial — worth auditing whether the override fully gates pre-trade"],
        ["Fraud-monitoring that audits user-instructions vs agent-actions",
         "—",
         "We don't have this. They do."],
    ]
    t = Table(rows, colWidths=[2.4*inch, 2.3*inch, 2.7*inch])
    t.setStyle(table_style())
    story.append(t)
    story.append(SP(8))
    story.append(Paragraph(
        "That last row is the one to take seriously. Robinhood ships <i>\u201cfraud-"
        "monitoring systems that can review both the user's original instructions and "
        "what the agent actually did.\u201d</i> In plain English: <b>did the agent do "
        "what the user actually asked, or did it drift?</b> That's a capability we don't "
        "have a clean version of. It maps onto something we <i>could</i> build relatively "
        "cheaply given how much of our system is already audit-logged: an "
        "<i>intent-vs-action ledger</i> that records each Run Bot session's stated "
        "parameters, every consensus vote, every cap-write, and lets the operator do "
        "post-hoc \u201cdid Ari behave?\u201d review. This is the kind of trust-layer "
        "capability that distinguishes \u201cAI you can audit\u201d from \u201cAI you "
        "have to trust.\u201d Worth a future-roadmap entry — call it <b>F-50: "
        "Intent-vs-Action Audit</b> or similar. Not now, but when we cross the "
        "live-execution fork it becomes table-stakes.",
        body_style))


def section_not_copy(story):
    story.append(Paragraph("WHAT TO DELIBERATELY <i>NOT</i> COPY", h1_style))
    story.append(HR())
    story.append(Paragraph("This is the more important list.", body_style))
    story.append(SP(4))

    story.append(Paragraph("1. The disclaimer posture is wrong for us.", h2_style))
    story.append(Paragraph("Read this slowly:", body_style))
    story.append(Paragraph(
        "\u201cRobinhood does not control, supervise, monitor, recommend, or audit these "
        "AI agents. Once your data is shared with an AI provider of your choice, it "
        "leaves Robinhood's security environment and is governed by that provider's "
        "terms, not ours.\u201d",
        quote_style))
    story.append(Paragraph(
        "That is a marketplace operator disclaiming the actual product. Legally smart "
        "for them — they're regulated, exposed, and not the agent. But <b>Ari isn't a "
        "marketplace; Ari is the agent.</b> We can't disclaim Ari. Ari's behavior <i>is</i> "
        "the product. If we copy this posture we destroy what we're building. The "
        "accountability stance — <i>we own how Ari behaves, including when it's wrong</i> "
        "— is actually a competitive moat for us. The user always knows who's responsible. "
        "That's not a small thing in a category where Robinhood just publicly told its "
        "users <i>\u201conce you share data with the AI it leaves our security "
        "environment.\u201d</i>",
        body_style))

    story.append(Paragraph("2. The voice is wrong for us.", h2_style))
    story.append(Paragraph(
        "<i>\u201cLet your agent trade.\u201d</i> / <i>\u201cBring your agent.\u201d</i> "
        "/ <i>\u201cGet started.\u201d</i> This is imperative, transactional, command-line "
        "voice. It sells permission. It treats the agent as a tool you switch on. That's "
        "coherent for Robinhood's brand — challenger broker, retail-confident, slightly "
        "defiant. It's <i>incoherent</i> for the Guide/Navigator register you just "
        "enshrined. We don't say <i>\u201cLet Ari trade\u201d</i> — we'd never say that. "
        "Ari isn't switched on; Ari watches with you. Quieter voice, more durable for a "
        "category where mistrust is the default. Hold the line on this; don't let "
        "category gravity pull our voice toward Robinhood's.",
        body_style))

    story.append(Paragraph(
        "3. The \u201cpersonal financial assistant who never sleeps\u201d framing.", h2_style))
    story.append(Paragraph(
        "That's the journalist's cliché in the MSN write-up, not Robinhood's official "
        "copy — but it's the framing the category will default to. <i>\u201cAI butler\u201d</i> "
        "is lazy and slightly creepy. <i>Lion-watcher / Navigator / the watchful one</i> "
        "is sharper and culturally older. We have better imagery; use it.",
        body_style))

    story.append(Paragraph("4. Bring-your-own-agent.", h2_style))
    story.append(Paragraph(
        "Adopting MCP-as-front-door would dilute Ari's identity. The whole point of Ari "
        "is that Ari is Ari — a name, a persona, a register, a specific way of seeing "
        "Bittensor. You don't <i>bring your own Ari.</i> (There's a separate, "
        "longer-horizon question about whether we should <i>expose</i> Ari via MCP so "
        "other tooling can integrate against Ari — different conversation, parking it.)",
        body_style))


def section_timing(story):
    story.append(Paragraph("THE TIMING IS THE REAL STORY", h1_style))
    story.append(HR())
    story.append(Paragraph(
        "Look at the trending sidebar on the MSN article:",
        body_style))
    for line in [
        "<i>Vanguard says agentic AI will be the big unlock for investors</i>",
        "<i>Google, OpenAI, Circle join hands for agentic payments</i>",
        "<i>Bessent, Powell discuss AI risks in high-stakes meeting</i>",
    ]:
        story.append(Paragraph(f"• {line}", bullet_style))
    story.append(SP(4))
    story.append(Paragraph(
        "Robinhood, Vanguard, Google/OpenAI/Circle, and the Treasury Secretary + Fed "
        "Chair are all <i>in the same week's news cycle</i> on agentic finance. This "
        "isn't a one-off product launch — <b>the agentic-finance category just had its "
        "iPhone moment.</b> The cultural acceptance window opened roughly the same week "
        "we shipped the Ari rebrand and the F-45 chat surfaces.",
        body_style))
    story.append(Paragraph(
        "I don't know whether to call this luck, taste, or instinct on your part. "
        "Probably some of each. But the strategic posture should reflect it: <b>we are "
        "not building into a void; we are building into a tailwind, and the tailwind "
        "just got loud enough that a normie reading the news this week thinks \u201cAI "
        "managing some of my money\u201d is a thing that exists.</b> That changes what "
        "we should be doing on Project Ari surface communication — less explaining what "
        "an autonomous agent is, more explaining what makes Ari <i>different</i> from "
        "the Robinhood-style generic agent.",
        body_style))
    story.append(Paragraph(
        "The differentiation lines write themselves once you have Robinhood as the foil:",
        body_style))
    for line in [
        "<i>Robinhood: bring any AI. Ari: a named, opinionated agent built for Bittensor.</i>",
        "<i>Robinhood: equities. Ari: the fragmented, technical, frontier subnet economy where generalist agents will fail.</i>",
        "<i>Robinhood: \u201cwe don't audit these AI agents.\u201d Ari: we own how Ari behaves.</i>",
        "<i>Robinhood: switch your agent on. Ari: a presence that watches with you.</i>",
    ]:
        story.append(Paragraph(f"• {line}", bullet_style))
    story.append(SP(4))
    story.append(Paragraph(
        "None of these is mockery — Robinhood's product is good and well-built. They're "
        "just different products solving different problems for different audiences, and "
        "naming the difference clearly is how we keep our register.",
        body_style))


def section_ahead(story):
    story.append(Paragraph("HONEST READ ON WHERE THEY'RE AHEAD OF US", h1_style))
    story.append(HR())
    story.append(Paragraph(
        "I won't pretend everything is in our favor. Robinhood ships:",
        body_style))
    for line in [
        "<b>MCP-native integration</b> out of the box. We don't speak MCP yet.",
        "<b>Distribution.</b> ~25M existing users with funded brokerage accounts and a one-tap upgrade path to agentic. Our distribution is whatever you and I build from zero.",
        "<b>Regulatory infrastructure.</b> Decades of broker-dealer ops, SEC/FINRA registration, cleared-trades plumbing. When we eventually cross to live execution on Bittensor, we'll have to do regulatory thinking they already did in 2014.",
        "<b>A credit-card agent.</b> The Agentic Credit Card is a category Robinhood now owns by being first. We don't need to compete here, but it shows the breadth of their bet.",
        "<b>An audit-of-agent-behavior layer</b> (instruction vs action) that we should be honest about not yet having.",
    ]:
        story.append(Paragraph(f"• {line}", bullet_style))
    story.append(SP(4))
    story.append(Paragraph(
        "None of this is an existential threat. But it's the realistic competitive "
        "picture, and pretending Robinhood is somehow weaker than us in the dimensions "
        "where they're stronger would be the kind of self-deception we shouldn't allow "
        "into our planning.",
        body_style))


def section_changes(story):
    story.append(Paragraph("WHAT CHANGES FOR PROJECT ARI, CONCRETELY", h1_style))
    story.append(HR())
    story.append(Paragraph("Five things, in priority order:", body_style))

    items = [
        ("1. Hold our voice.",
         "The Guide/Navigator register, the humility instinct, the \u201cwatchful one\u201d "
         "framing — those are not just aesthetic choices; they are <i>strategic "
         "differentiation</i> against a category that just got loud and imperative. "
         "Resist the gravity."),
        ("2. Add F-50 to the long-horizon roadmap: Intent-vs-Action Audit.",
         "When we cross to live execution, the operator should be able to ask Ari "
         "<i>\u201cdid you do what I asked?\u201d</i> and get a structured answer with "
         "timestamped citations. We have most of the data already; what's missing is "
         "the assembly. Not now — when live execution is the priority."),
        ("3. Reframe the \u201cRun Bot / Paper Trading\u201d surface as an Agent Sandbox in copy (not in code).",
         "Robinhood's \u201cdedicated bucket\u201d framing is sharper than our "
         "paper-trading framing for explaining the safety boundary to a non-builder. "
         "We don't need to rebuild anything; we need a paragraph somewhere on the "
         "dashboard or chat-with-Ari intro that says, in plain English, "
         "<i>\u201cAri only ever touches the bucket you give it. The wall is real.\u201d</i>"),
        ("4. Audit the Human Override pre-trade gate.",
         "Quick verification: when a user has Override on, does it actually intercept "
         "<i>every</i> trade pre-flight, or is there a code path that bypasses it under "
         "cap conditions? Robinhood ships \u201coptional manual approvals before certain "
         "actions\u201d — we should be able to claim the same with confidence. Filed as "
         "a side-task in <font face='Courier' size='8'>OPEN_SIDE_TASKS.md</font>."),
        ("5. Don't pivot to MCP-as-front-door.",
         "The temptation will be there as the category standardizes around MCP. Resist. "
         "Ari's identity is the moat. Exposing Ari <i>via</i> MCP later is fine and "
         "probably good; replacing Ari's first-party experience with an MCP shell is "
         "identity destruction."),
    ]
    for title, body in items:
        story.append(Paragraph(title, h3_style))
        story.append(Paragraph(body, body_style))
        story.append(SP(2))


def section_one_line(story):
    story.append(Paragraph("THE HONEST ONE-LINE TAKE", h1_style))
    story.append(HR())
    story.append(Paragraph(
        "<b>Robinhood just spent their marketing budget legitimizing our category, "
        "validated every architectural bet you've already made, and gave us a public "
        "foil to differentiate against. The right response is not to copy them — it's "
        "to keep doing what we're doing, <i>more confidently</i>, while quietly stealing "
        "the two or three safety patterns they got right. That, plus a long-horizon "
        "entry on instruction-vs-action audit. That's the whole eval.</b>",
        hl_style))


def section_metadata(story):
    story.append(SP(20))
    story.append(HR(c=BORDER, t=0.4, sa=8, sb=8))
    story.append(Paragraph("FILING METADATA", h1_style))
    story.append(HR())
    rows = [
        ["Field", "Value"],
        ["Filed",        "Day 15 evening — Thursday, 28 May 2026"],
        ["Author",       "Ari, Bittensor Guide and Navigator"],
        ["Trigger",      "Mark, Item 3 of Day 15 queue (\"Two website evals\")"],
        ["Lens",         "Holistic, instinct-driven (\"Consider everything\")"],
        ["Sources",      "robinhood.com/us/en/agentic-trading/  +  msn.com/.../robinhood-now-lets-ai-trade-stocks-on-your-behalf"],
        ["Companion artifacts",
                         "specs/f50-intent-vs-action-audit/document.md  ·  MemoryBank/Library/robinhood-agentic-launch-2026-05.md  ·  OPEN_SIDE_TASKS.md (Human Override gate audit)"],
        ["Standing", "Internal · Project Ari Archives"],
    ]
    t = Table(rows, colWidths=[1.4*inch, 6.0*inch])
    t.setStyle(table_style())
    story.append(t)
    story.append(SP(8))
    story.append(Paragraph(
        "This document captures the verbatim eval as delivered in chat to Mark. Cover "
        "sheet, page decoration, and filing-metadata table are the only additions. No "
        "edits to body content.",
        note_style))


def build():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=letter,
        leftMargin=0.7*inch,
        rightMargin=0.7*inch,
        topMargin=0.6*inch,
        bottomMargin=0.7*inch,
        title="Robinhood Agentic Trading — Strategic Eval (Project Ari)",
        author="Ari, Bittensor Guide and Navigator",
        subject="Project Ari · Strategic Read · Day 15 · 2026-05-28",
    )

    story = []
    cover(story)
    section_unprimed_read(story)
    section_what_this_is(story)
    section_absorb(story)
    section_not_copy(story)
    section_timing(story)
    section_ahead(story)
    section_changes(story)
    section_one_line(story)
    section_metadata(story)

    doc.build(story, onFirstPage=page_decor, onLaterPages=page_decor)
    print(f"✓ Robinhood Agentic Eval PDF written → {OUTPUT}")


if __name__ == "__main__":
    build()