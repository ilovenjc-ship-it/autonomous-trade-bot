"""
Covenant Exit — Research Addendum
Generates: archives/Covenant_Exit_Research_Addendum.pdf

Four primary sources read (April 10–11, 2026 — TAO Daily):
  1. James Altucher: "Here's How Bittensor Prevents the Next Covenant"
  2. "Covenant Left. Bittensor Has Other 20+ State-of-the-Art Subnets"
  3. "Subnet Owners Respond to the Covenant Exit"
  4. 'I'm Not Upset or Afraid' — Const Responds to Covenant AI's Departure

Context: The operator of this project staked ~$1,000 USD across SN3, SN39,
and SN81 the night before the exit. That event is part of this project's
founding motivation — the reason accounting integrity, risk controls, and
an independent trading system matter.
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)

OUTPUT = "archives/Covenant_Exit_Research_Addendum.pdf"

# ── Colour palette — matches archive series but with red accent for incident ──
DARK_BG  = colors.HexColor("#0d1b2e")
CYAN     = colors.HexColor("#22d3ee")
EMERALD  = colors.HexColor("#10b981")
AMBER    = colors.HexColor("#f59e0b")
VIOLET   = colors.HexColor("#8b5cf6")
RED      = colors.HexColor("#ef4444")
ROSE     = colors.HexColor("#fb7185")
SLATE    = colors.HexColor("#94a3b8")
WHITE    = colors.white
ORANGE   = colors.HexColor("#f97316")


def build():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=letter,
        leftMargin=0.85 * inch,
        rightMargin=0.85 * inch,
        topMargin=0.85 * inch,
        bottomMargin=0.85 * inch,
        title="Covenant Exit — Research Addendum",
        author="Intelligent Internet TAO Bot",
    )

    styles = getSampleStyleSheet()

    def S(name, **kw):
        return ParagraphStyle(name, parent=styles["Normal"], **kw)

    title_style  = S("Title",   fontSize=22, textColor=WHITE,
                     fontName="Helvetica-Bold", spaceAfter=4, leading=28)
    sub_style    = S("Sub",     fontSize=11, textColor=ROSE,
                     fontName="Helvetica", spaceAfter=14)
    h1_style     = S("H1",      fontSize=14, textColor=CYAN,
                     fontName="Helvetica-Bold", spaceBefore=14, spaceAfter=6)
    h2_style     = S("H2",      fontSize=11, textColor=AMBER,
                     fontName="Helvetica-Bold", spaceBefore=8, spaceAfter=4)
    h3_style     = S("H3",      fontSize=10, textColor=VIOLET,
                     fontName="Helvetica-Bold", spaceBefore=6, spaceAfter=3)
    body_style   = S("Body",    fontSize=9,  textColor=SLATE,
                     fontName="Helvetica",   leading=14, spaceAfter=6)
    mono_style   = S("Mono",    fontSize=8,  textColor=EMERALD,
                     fontName="Courier",     leading=12, spaceAfter=4,
                     leftIndent=18)
    quote_style  = S("Quote",   fontSize=9,  textColor=WHITE,
                     fontName="Helvetica-Oblique", leading=14, spaceAfter=6,
                     leftIndent=24, rightIndent=12,
                     borderPad=6)
    warn_style   = S("Warn",    fontSize=9,  textColor=AMBER,
                     fontName="Helvetica-Bold", leading=14, spaceAfter=6)
    red_style    = S("Red",     fontSize=9,  textColor=ROSE,
                     fontName="Helvetica-Bold", leading=14, spaceAfter=6)
    white_style  = S("White",   fontSize=9,  textColor=WHITE,
                     fontName="Helvetica-Bold", leading=14, spaceAfter=6)
    emerald_style= S("Em",      fontSize=9,  textColor=EMERALD,
                     fontName="Helvetica-Bold", leading=14, spaceAfter=6)

    def HR(c=CYAN):
        return HRFlowable(width="100%", thickness=0.5,
                          color=c, spaceAfter=8, spaceBefore=4)
    def sp(n=8): return Spacer(1, n)

    story = []

    # ════════════════════════════════════════════════════════════════════════
    # COVER
    # ════════════════════════════════════════════════════════════════════════
    story += [
        sp(20),
        Paragraph("RESEARCH ADDENDUM — SESSION XVI", S("Tag", fontSize=10,
                   textColor=ROSE, fontName="Helvetica-Bold")),
        Paragraph("The Covenant Exit", title_style),
        Paragraph(
            "Bittensor Ecosystem — Incident Report & Strategic Analysis",
            sub_style,
        ),
        Paragraph(
            "Date: April 30, 2026  |  Event date: April 10, 2026  |  "
            "Sources: TAO Daily (4 articles)",
            body_style,
        ),
        HR(ROSE),
        Paragraph(
            "This document updates the record established in the Bittensor Ecosystem Research "
            "Archive and the Supplemental Research Archive (both Session XVI). The Covenant AI "
            "departure is the single most significant event in Bittensor's public history. "
            "It changed the ecosystem narrative, triggered protocol reform discussions, "
            "and — for this project specifically — was the founding incident that made "
            "an independent, operator-controlled trading system necessary.",
            body_style,
        ),
        sp(6),
        Paragraph(
            "The previous record held the Jensen Huang / Chamath / Covenant-72B moment as "
            "a high point of Bittensor validation. That moment was real. What followed it "
            "was not. This document corrects and completes the record.",
            warn_style,
        ),
        sp(10),
    ]

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 1 — SOURCES
    # ════════════════════════════════════════════════════════════════════════
    story += [
        HR(),
        Paragraph("1. Sources — Read in Full", h1_style),
    ]

    sources = [
        ["#", "Title", "Author", "Date"],
        ["1", "James Altucher: 'Here's How Bittensor Prevents the Next Covenant'",
         "TAO Daily", "Apr 2026"],
        ["2", "Covenant Left. Bittensor Has Other 20+ State-of-the-Art Subnets",
         "Ige A / TAO Daily", "Apr 11, 2026"],
        ["3", "Subnet Owners Respond to the Covenant Exit",
         "TAO Daily", "Apr 10, 2026"],
        ["4", "'I'm Not Upset or Afraid' — Const Responds to Covenant AI's Departure",
         "Ige A / TAO Daily", "Apr 10, 2026"],
    ]
    sw = [0.25*inch, 3.6*inch, 1.35*inch, 0.85*inch]
    st = Table(sources, colWidths=sw, repeatRows=1)
    st.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), DARK_BG),
        ("TEXTCOLOR",     (0, 0), (-1, 0), CYAN),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0), 8),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.HexColor("#070e1a"),
                                              colors.HexColor("#0a1220")]),
        ("TEXTCOLOR",     (0, 1), (-1, -1), SLATE),
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 8),
        ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#1e3a5f")),
        ("ALIGN",         (0, 0), (-1, -1), "LEFT"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    story += [st, sp(10)]

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 2 — FOUNDING CONTEXT
    # ════════════════════════════════════════════════════════════════════════
    story += [
        HR(ROSE),
        Paragraph("2. Founding Context — Why This Document Exists", h1_style),
        Paragraph(
            "The night before Covenant AI's exit — April 9, 2026 — the operator of this "
            "project staked approximately <b>$1,000 USD</b> across the three subnets "
            "Covenant controlled: SN3 (Templar), SN39 (Basilica), and SN81 (Grail).",
            body_style,
        ),
        Paragraph(
            "The following morning, the exit was announced. Hundreds of millions were wiped "
            "from the ecosystem. Those three positions moved against the stake "
            "almost immediately. The capital was not recovered.",
            body_style,
        ),
        Paragraph(
            "That event is the origin of this project.",
            white_style,
        ),
        Paragraph(
            "The loss raised a direct question: if you cannot trust subnet owners not to "
            "exit without warning, and you cannot trust the market not to reprice "
            "instantaneously, then you need a system that responds faster than a human can, "
            "that enforces risk controls automatically, and that keeps an honest ledger of "
            "every position and every transaction so nothing is ever obscured or forgotten.",
            body_style,
        ),
        Paragraph(
            "TaoBot is the answer to that question. Every feature in this system — the "
            "circuit breaker, the drawdown limit, the stop loss, the Privacy Mode, "
            "the transaction audit trail, the webhook alerts, the honest accounting "
            "baseline — exists, in part, because of what happened on the night of April 9.",
            body_style,
        ),
        Paragraph(
            "This is not a footnote. It is the founding motivation. It belongs in the record.",
            emerald_style,
        ),
        sp(8),
    ]

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 3 — WHAT HAPPENED
    # ════════════════════════════════════════════════════════════════════════
    story += [
        HR(),
        Paragraph("3. What Happened — The Incident", h1_style),

        Paragraph("3.1  Covenant AI's Role Before the Exit", h2_style),
        Paragraph(
            "Covenant AI, led by Sam Dare, operated three subnets that together formed "
            "the backbone of Bittensor's most celebrated and visible AI work:",
            body_style,
        ),
    ]

    subnet_data = [
        ["Subnet", "Name",     "Role in the Stack"],
        ["SN3",    "Templar",  "Pre-training layer — ran the Covenant-72B training run, completed late March 2026"],
        ["SN39",   "Basilica", "Compute layer — GPU orchestration supporting the training pipeline"],
        ["SN81",   "Grail",    "Fine-tuning layer — refinement and specialization of trained models"],
    ]
    sdw = [0.55*inch, 0.9*inch, 4.6*inch]
    sdt = Table(subnet_data, colWidths=sdw, repeatRows=1)
    sdt.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), DARK_BG),
        ("TEXTCOLOR",     (0, 0), (-1, 0), ROSE),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0), 8),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.HexColor("#1a0a0a"),
                                              colors.HexColor("#150808")]),
        ("TEXTCOLOR",     (0, 1), (-1, -1), SLATE),
        ("TEXTCOLOR",     (0, 1), (0, -1),  ROSE),
        ("TEXTCOLOR",     (1, 1), (1, -1),  WHITE),
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 8),
        ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#3a1e1e")),
        ("ALIGN",         (0, 0), (-1, -1), "LEFT"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    story += [sdt, sp(8)]

    story += [
        Paragraph("3.2  The Exit", h2_style),
        Paragraph(
            "After the Covenant-72B training run completed in late March 2026, "
            "Sam Dare executed an abrupt, unilateral exit from the Bittensor ecosystem "
            "on or around April 9–10, 2026. The departure included:",
            body_style,
        ),
        Paragraph("• Abandonment of operator keys for SN3, SN39, and SN81", body_style),
        Paragraph("• A large TAO position dump (referenced in reporting as 37,000+ τ)", body_style),
        Paragraph("• A public statement by Dare framing the exit as a principled objection to Bittensor's direction", body_style),
        Paragraph("• Immediate collapse in those subnet token prices", body_style),
        Paragraph("• Estimated hundreds of millions of dollars wiped from the ecosystem", red_style),

        Paragraph("3.3  The Covenant-72B Distinction", h2_style),
        Paragraph(
            "It is important to separate the training run from the exit. "
            "The Covenant-72B model is real. The training completed. The weights are "
            "published under an Apache license — they are openly available and permanent. "
            "The Jensen Huang / Chamath validation of that work was also real. "
            "What is not real is any implication that Covenant's continued presence was "
            "guaranteed. The work outlived the team. The team did not stay.",
            body_style,
        ),
        Paragraph(
            "Record correction: the Jensen/Chamath moment validated the technology. "
            "It did not validate the operator's long-term commitment. Those are different things.",
            warn_style,
        ),
    ]

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 4 — CONST'S RESPONSE
    # ════════════════════════════════════════════════════════════════════════
    story += [
        sp(6), HR(),
        Paragraph("4. Const's Response — 'I'm Not Upset or Afraid'", h1_style),
        Paragraph(
            "Bittensor's founder (Const) was interviewed by TAO Daily on April 10, 2026 — "
            "the same day as the exit. His response was immediate, measured, and structured. "
            "He declined to be reactive and instead announced a 3-track plan.",
            body_style,
        ),
        Paragraph(
            "His framing of the event:",
            h2_style,
        ),
        Paragraph(
            '"I actually think this is a spring forward moment. This is actually an '
            'opportunity to get more attention with the good things we are doing. '
            "I'm not really upset or afraid.\"",
            quote_style,
        ),
        Paragraph(
            "He also thanked Sam Dare publicly on X for "
            '"helping further Bittensor\'s decentralization" — a sharp, confident signal '
            "that the exit would be used to accelerate governance improvements rather "
            "than be treated as a defeat.",
            body_style,
        ),

        Paragraph("4.1  Track 1 — Revive (Immediate Priority)", h2_style),
        Paragraph(
            '"The highest priority is going to be reviving those projects in some way. '
            'Either finding developers that were in the team to continue the project '
            'by shifting stake to their keys and letting them run the validation. '
            "That's highly important.\"",
            quote_style,
        ),
        Paragraph(
            "Goal: operational continuity for SN3, SN39, SN81. Not a clean restart — "
            "find team members already inside Covenant's technical stack and hand them "
            "the validator keys.",
            body_style,
        ),

        Paragraph("4.2  Track 2 — Reform (Weeks to Months)", h2_style),
        Paragraph(
            "Const referenced prior internal discussions around 'lock-based subnet "
            "ownership' — mechanisms that would make unilateral exits economically "
            "self-defeating or technically difficult. He emphasized careful implementation "
            "over a rushed crisis patch.",
            body_style,
        ),

        Paragraph("4.3  Track 3 — Rebut (Narrative)", h2_style),
        Paragraph(
            "Dare's public statement framed the exit as a principled objection to Const's "
            "centralized control. Const posted direct rebuttals on X disputing this "
            "characterization point by point. Multiple subnet owners with direct knowledge "
            "of Dare's history with Const publicly contradicted Dare's account.",
            body_style,
        ),
    ]

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 5 — COMMUNITY RESPONSE
    # ════════════════════════════════════════════════════════════════════════
    story += [
        sp(6), HR(),
        Paragraph("5. The Community Response — The Ecosystem Held", h1_style),
        Paragraph(
            "Within hours of the exit announcement, prominent subnet owners issued "
            "public statements. The response was near-unanimous: rejection of Dare's "
            "narrative, reaffirmation of Bittensor allegiance, and concrete proposals "
            "for structural resilience.",
            body_style,
        ),

        Paragraph("Key statements (verbatim):", h2_style),

        Paragraph("Jon Durbin — Chutes (SN64, largest subnet on Bittensor):", h3_style),
        Paragraph(
            '"Chutes is and always will be a bittensor project. Chutes is bittensor, '
            'and bittensor is chutes."',
            quote_style,
        ),
        Paragraph(
            "Durbin also described Chutes' structure: a group of independent corporations "
            "with no CEO, funds locked in a smart contract paying staking rewards to team "
            "members. He offered to help other subnet teams adopt the same structure to "
            "insulate against unilateral founder exits.",
            body_style,
        ),

        Paragraph("Will Squires — Macrocosmos (SN1, SN9, SN13):", h3_style),
        Paragraph(
            '"Const funded Templar, paid for their first website, wrote their first '
            'incentive, and hired their first team members. Knowing both parties, I can '
            'assure you it is not Sam Dare who is the wronged party here. Disappointing '
            'how money corrupts people."',
            quote_style,
        ),

        Paragraph("Brian McCrindle — Founding Engineer, Macrocosmos:", h3_style),
        Paragraph(
            '"If there is anyone that has done the most for Macrocosmos, it has been Const. '
            'We would have never existed without his support. To think that he is the evil '
            'among us is completely misguided, and your actions will forever be a stain on '
            'your tablecloth Sam Dare."',
            quote_style,
        ),

        Paragraph("Will (Bitcast co-founder) — on decentralization:", h3_style),
        Paragraph(
            '"A subnet isn\'t a single person, it\'s an open network of contributors. '
            'Decentralised training on Bittensor continues with or without Sam — the genie '
            'is out of the bottle. As an ecosystem, we will learn, adapt, and inevitably '
            'be stronger not weaker following today\'s drama."',
            quote_style,
        ),

        Paragraph("Seby — RESI:", h3_style),
        Paragraph(
            '"Regardless, the show goes on for Resi. In permissionless networks, people '
            'will do what serves them. Onwards and surely upwards."',
            quote_style,
        ),

        Paragraph("The pattern:", h2_style),
        Paragraph(
            "Every owner who spoke publicly did two things: (1) they declared their subnet "
            "permanently part of Bittensor, and (2) they defended Const with specific, "
            "verifiable accounts of past support — funding, code, team-building — that "
            "contradicted Dare's 'principled objection' framing. The community response "
            "was not performative loyalty. It was testimony.",
            body_style,
        ),
    ]

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 6 — ALTUCHER'S 5 FIXES
    # ════════════════════════════════════════════════════════════════════════
    story += [
        sp(6), HR(),
        Paragraph("6. James Altucher's 5 Fixes — Preventing the Next Covenant", h1_style),
        Paragraph(
            "James Altucher's analysis was the most structured investor-side response. "
            "Five specific protocol and ecosystem changes:",
            body_style,
        ),
    ]

    fixes = [
        ["#", "Fix", "Rationale"],
        ["1", "Structured sell schedules — on-chain SEC-style 10b5-1 plans for subnet owners",
         "Prevents surprise dumps; market can absorb scheduled sales"],
        ["2", "Sandbox miner work to cloud — models and code survive owner exit",
         "Preserve technical contributions independently of who holds the key"],
        ["3", "More subnets — reduce single-entity concentration risk",
         "80/20 rule is safer with more subnets; one exit causes less chaos"],
        ["4", "Flip emissions: ~80% to miners, less to owners",
         "Forces owners to earn by building value, not by holding keys passively"],
        ["5", "Build economic flywheels, not research projects",
         "'If the founder disappears tomorrow, does the subnet still run?' — infrastructure vs. person"],
    ]
    fw = [0.25*inch, 2.9*inch, 2.85*inch]
    ft = Table(fixes, colWidths=fw, repeatRows=1)
    ft.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), DARK_BG),
        ("TEXTCOLOR",     (0, 0), (-1, 0), CYAN),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0), 8),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.HexColor("#070e1a"),
                                              colors.HexColor("#0a1220")]),
        ("TEXTCOLOR",     (0, 1), (-1, -1), SLATE),
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 8),
        ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#1e3a5f")),
        ("ALIGN",         (0, 0), (-1, -1), "LEFT"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    story += [ft, sp(8)]

    story += [
        Paragraph("Altucher's investor due diligence checklist:", h2_style),
        Paragraph(
            "Before staking in any subnet, ask these questions in order:",
            body_style,
        ),
        Paragraph("1.  How dependent is the subnet on its miners?", body_style),
        Paragraph(
            "     Good sign: subnet cannot survive without miners "
            "(miner dependence = product survives founder exit).",
            S("Ind", fontSize=9, textColor=EMERALD, fontName="Helvetica",
              leading=13, leftIndent=28, spaceAfter=2),
        ),
        Paragraph(
            "     Red flag: subnet works fine without miners "
            "(value resides in founder control, not distributed infrastructure).",
            S("Ind2", fontSize=9, textColor=ROSE, fontName="Helvetica",
              leading=13, leftIndent=28, spaceAfter=6),
        ),
        Paragraph("2.  How are subnet owners incentivizing miners?", body_style),
        Paragraph("3.  Is your portfolio diversified across multiple subnets?", body_style),
        Paragraph("4.  Does the subnet have a real economic flywheel beyond emissions?", body_style),
        sp(6),
        Paragraph(
            "The definitive Altucher test, verbatim:",
            h2_style,
        ),
        Paragraph(
            '"If the founder disappears tomorrow, does the subnet still run? '
            'If yes, you\'re investing in infrastructure. '
            'If no, you\'re investing in a person."',
            quote_style,
        ),
    ]

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 7 — ECOSYSTEM DEPTH: 20+ SOTA SUBNETS
    # ════════════════════════════════════════════════════════════════════════
    story += [
        sp(6), HR(),
        Paragraph("7. The Ecosystem Depth — 20+ SOTA Subnets That Kept Building", h1_style),
        Paragraph(
            "The TAO Daily article published April 11 made the case that the network was "
            "always deeper than any single team. The following subnets were highlighted "
            "as state-of-the-art in their domains — and are directly relevant to TaoBot's "
            "subnet scoring and staking strategy:",
            body_style,
        ),
    ]

    subnets = [
        ["Subnet",    "Domain",              "SOTA Claim / Key Metric"],
        ["Chutes SN64",    "Compute/Inference",   "Largest subnet; 1/6th competitor cost; #1 on OpenRouter"],
        ["Targon SN4",     "Enterprise GPU",       "TEE-supported decentralized compute; 1/6th centralized cost"],
        ["Ridges SN62",    "Coding/DevTools",      "Beat Claude + Cursor on SWE Benchmark at 1/70th cost"],
        ["Synth SN50",     "Finance/Prediction",   "$3K → $50K on Polymarket (16x); price path forecasting"],
        ["Yanez SN54",     "Fraud/KYC AI",         "Multi-year bank contracts; targeting $200B+ market; live revenue"],
        ["Metanova SN68",  "Drug Discovery",       "AI discovery of novel pharmaceutical molecules; bounty system"],
        ["Zeus SN18",      "Weather",              "Most accurate forecasting; outperforming energy-trader benchmarks"],
        ["Bitmind SN34",   "Deepfake Detection",   "World's best deepfake detection on decentralized infra"],
        ["Score SN44",     "Computer Vision",      "78% benchmark accuracy; approaching 79% human gold standard"],
        ["IOTA SN9",       "AI Training",          "'Napster of AI training' — everyday laptop participation"],
        ["Quasar SN24",    "Training",             "First decentralized MoE training; outperforms OpenAI MRCR V2"],
        ["Data Universe SN13", "Data",             "World's largest decentralized data scraper; feeds other subnets"],
        ["Hippius SN65",   "Storage",              "1/400th cost of Filecoin; decentralized cloud storage"],
        ["Vanta Trading",  "Prop Trading",         "$30M+ in rewards distributed; 100% reward split"],
        ["ItsAI SN32",     "AI Text Detection",    "World's best AI text detector"],
        ["Vidaio SN85",    "Video AI",             "4K upscaling; ~80% file size reduction; cheapest video AI"],
        ["404-Gen SN17",   "3D Generation",        "World's largest decentralized 3D collection; Unity plugin"],
        ["D-Sperse SN2",   "zkML / Security",      "'SSL for AI' — cryptographic proofs for verifiable inference"],
        ["Gradients SN56", "AutoML",               "World's cheapest 1-click AutoML platform"],
        ["Bitcast SN93",   "Creator Marketing",    "AI-validated brand campaigns; already profitable"],
    ]
    snw = [1.05*inch, 1.2*inch, 3.75*inch]
    snt = Table(subnets, colWidths=snw, repeatRows=1)
    snt.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), DARK_BG),
        ("TEXTCOLOR",     (0, 0), (-1, 0), CYAN),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0), 7.5),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.HexColor("#070e1a"),
                                              colors.HexColor("#0a1220")]),
        ("TEXTCOLOR",     (0, 1), (-1, -1), SLATE),
        ("TEXTCOLOR",     (0, 1), (0, -1),  EMERALD),
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 7.5),
        ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#1e3a5f")),
        ("ALIGN",         (0, 0), (-1, -1), "LEFT"),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    story += [snt, sp(8)]

    story += [
        Paragraph(
            '"If your entire thesis on Bittensor lived and died with Covenant, '
            'you were never paying attention to the full picture."',
            quote_style,
        ),
        Paragraph("— TAO Daily, April 11, 2026", S("Attr", fontSize=8, textColor=SLATE,
                   fontName="Helvetica-Oblique", leading=12, leftIndent=24, spaceAfter=8)),
    ]

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 8 — TAOBOT STRATEGIC IMPLICATIONS
    # ════════════════════════════════════════════════════════════════════════
    story += [
        sp(4), HR(),
        Paragraph("8. TaoBot Strategic Implications", h1_style),

        Paragraph("8.1  Subnet Risk Classification", h2_style),
        Paragraph(
            "The Covenant event establishes a new required risk dimension in subnet scoring: "
            "<b>founder-dependency risk</b>. Altucher's test applies directly to how TaoBot "
            "scores and weights subnet alpha positions.",
            body_style,
        ),

        Paragraph("Proposed classification (to be implemented in future session):", h3_style),
    ]

    risk_class = [
        ["Risk Class", "Definition", "TaoBot Action"],
        ["Infrastructure",
         "Subnet cannot operate without miners. Flywheel exists. "
         "No single founder key controls continuity.",
         "Full position eligibility. Normal scoring."],
        ["Founder-Dependent",
         "Subnet runs fine without miners. Value in founder's hands. "
         "No smart-contract-based reward distribution.",
         "Reduced position cap. Flag for monitoring."],
        ["Transitioning",
         "Formerly operated by departed team. New validators not yet confirmed. "
         "(Current status: SN3, SN39, SN81)",
         "Excluded from staking until new operator confirmed."],
    ]
    rcw = [1.1*inch, 2.5*inch, 2.4*inch]
    rct = Table(risk_class, colWidths=rcw, repeatRows=1)
    rct.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), DARK_BG),
        ("TEXTCOLOR",     (0, 0), (-1, 0), AMBER),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0), 8),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.HexColor("#070e1a"),
                                              colors.HexColor("#0a1220")]),
        ("TEXTCOLOR",     (0, 1), (-1, -1), SLATE),
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 8),
        ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#1e3a5f")),
        ("ALIGN",         (0, 0), (-1, -1), "LEFT"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    story += [rct, sp(8)]

    story += [
        Paragraph("8.2  Subnets to Watch (Post-Covenant)", h2_style),
        Paragraph(
            "Based on the SOTA subnet analysis and the Altucher flywheel test, "
            "these subnets represent the highest-quality targets for TaoBot "
            "alpha staking in the post-Covenant ecosystem:",
            body_style,
        ),
        Paragraph("• Chutes (SN64) — infrastructure subnet, largest on network, smart-contract governance", body_style),
        Paragraph("• Ridges (SN62) — real product (coding assistant), measurable SOTA performance, revenue model", body_style),
        Paragraph("• Synth (SN50) — real product (prediction market), demonstrated financial returns", body_style),
        Paragraph("• Yanez (SN54) — enterprise contracts, regulated market exposure, live revenue", body_style),
        Paragraph("• Targon (SN4) — TEE-supported enterprise GPU, real business model", body_style),

        Paragraph("8.3  SN3 / SN39 / SN81 — Current Status", h2_style),
        Paragraph(
            "These three subnets are in Const's 'Revive' track as of April 10, 2026. "
            "They should be treated as Transitioning (see risk classification above) "
            "until new validator operators are publicly confirmed. "
            "TaoBot should not stake into these subnets during the transition period.",
            warn_style,
        ),

        Paragraph("8.4  Why the Existing TaoBot Features Are the Right Response", h2_style),
        Paragraph("• Circuit breaker (15% daily): triggers before a Covenant-scale event wipes a position fully", body_style),
        Paragraph("• Stop loss (8%): exits a position before subnet repricing compounds", body_style),
        Paragraph("• Max drawdown (20%): total portfolio floor — no single event can erase more than 1/5th", body_style),
        Paragraph("• Transaction audit trail: every stake is recorded with tx_hash + Taostats link — nothing is opaque", body_style),
        Paragraph("• Webhook alerts: real-time notification if any gate fires during an adverse event", body_style),
        Paragraph("• Privacy Mode: sensitive positions are not visible by default — operational security", body_style),
    ]

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 9 — RECORD CORRECTION
    # ════════════════════════════════════════════════════════════════════════
    story += [
        sp(6), HR(ROSE),
        Paragraph("9. Record Correction — Prior Archive Update", h1_style),
        Paragraph(
            "The Bittensor Ecosystem Research Archive (Session XVI, Vol. I) and the "
            "Supplemental Research Archive (Session XVI, Vol. II) both contain references "
            "to the Jensen Huang / Chamath / Covenant-72B validation moment as a current "
            "positive indicator. This addendum updates that record.",
            body_style,
        ),
    ]

    correction_data = [
        ["Item",               "Prior Record",                    "Corrected Record"],
        ["Covenant status",    "Active, high-profile team on SN3/39/81; received Jensen/Chamath validation",
         "Exited April 10, 2026. SN3/39/81 in transition. Model weights preserved (Apache)."],
        ["SN3 Templar",        "Active flagship subnet; completed 72B training run",
         "Operator departed. Const executing revival plan. Do not stake until new operator confirmed."],
        ["SN39 Basilica",      "Active compute layer under Covenant",
         "Operator departed. Transitioning status."],
        ["SN81 Grail",         "Active fine-tuning layer under Covenant",
         "Operator departed. Transitioning status."],
        ["Covenant-72B model", "Recently completed; flagship achievement",
         "Weights preserved under Apache license. Work is real and permanent. Team is gone."],
        ["Ecosystem resilience", "Untested at that date",
         "Tested April 10, 2026. Held. 20+ SOTA subnets continued building."],
    ]
    cdw = [1.2*inch, 2.0*inch, 2.8*inch]
    cdt = Table(correction_data, colWidths=cdw, repeatRows=1)
    cdt.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), DARK_BG),
        ("TEXTCOLOR",     (0, 0), (-1, 0), ROSE),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0), 7.5),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.HexColor("#070e1a"),
                                              colors.HexColor("#0a1220")]),
        ("TEXTCOLOR",     (0, 1), (-1, -1), SLATE),
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 7.5),
        ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#3a1e1e")),
        ("ALIGN",         (0, 0), (-1, -1), "LEFT"),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    story += [cdt, sp(10)]

    # ════════════════════════════════════════════════════════════════════════
    # CLOSING
    # ════════════════════════════════════════════════════════════════════════
    story += [
        HR(), sp(6),
        Paragraph("Closing Note", h1_style),
        Paragraph(
            "The Covenant exit was painful for everyone holding SN3, SN39, and SN81 "
            "positions. For this project's operator, that pain was immediate and personal — "
            "approximately $1,000 USD staked the night before, positions caught in the "
            "repricing, no automated system in place to respond.",
            body_style,
        ),
        Paragraph(
            "That is exactly the scenario TaoBot exists to prevent from happening again. "
            "Not to predict exits — no system can do that with certainty. But to respond "
            "faster than a human can, to enforce hard limits automatically, to keep a "
            "complete and honest record, and to never let a single event erase everything.",
            body_style,
        ),
        Paragraph(
            "Const called it a spring forward moment. So did this project.",
            body_style,
        ),
        Paragraph(
            "The loss became the blueprint. The blueprint became the bot.",
            white_style,
        ),
        sp(16),
        Paragraph(
            "— II Agent, Session XVI Addendum, April 30 2026",
            S("Sig", fontSize=8, textColor=SLATE, fontName="Helvetica-Oblique"),
        ),
        sp(6),
        Paragraph(
            "Sources: TAO Daily — taodaily.io (4 articles, April 10–11, 2026)",
            S("Src", fontSize=7, textColor=colors.HexColor("#475569"),
              fontName="Helvetica", leading=11),
        ),
    ]

    doc.build(story)
    print(f"✅  PDF written → {OUTPUT}")


if __name__ == "__main__":
    build()