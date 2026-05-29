"""
fleet_as_miners_pdf.py — Day 16 Side-Task #2
============================================
Generate the Archives-grade PDF distillation of the Day 15 contemplation
"Const's 6-Filter Test — Fleet as Miners" (source:
MemoryBank/Contemplations/const-6-filter-fleet-as-miners-2026-05-28.md).

Output: MemoryBank/Archives/fleet-as-miners.pdf

Design notes
------------
- Archives PDFs are forensic records, not pitch decks. The page geometry
  is dense, the font is Times-Roman so the reader knows it's an
  inscription artifact, the colour palette is restrained (verdict ribbon
  green/amber/red is the only chromatic accent).
- Each filter gets its own page with: filter number, Const's verbatim
  prompt, Project Ari read, and a verdict ribbon (PASS / IN-FLIGHT /
  FAIL · split-layer if relevant).
- Cover page carries provenance (filed date, source contemplation,
  cross-references), so a future reader knows where to go for the full
  prose if they want it.
- Score summary on its own page, followed by Honest Residual, followed
  by What This Does Not Do, followed by Sign-off.

Run with:
  cd /workspace/autonomous-trade-bot
  python3 MemoryBank/Archives/_generators/fleet_as_miners_pdf.py
"""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, KeepTogether,
)
from reportlab.pdfgen import canvas

# ── Colours ──────────────────────────────────────────────────────────────────
BLACK     = colors.HexColor("#0a0a0a")
DARK      = colors.HexColor("#1a1a1a")
SLATE     = colors.HexColor("#3a3a3a")
RULE      = colors.HexColor("#888888")
PARCH     = colors.HexColor("#fbf8f3")
PASS_GR   = colors.HexColor("#1f6d3a")
INFLIGHT  = colors.HexColor("#a06b1a")
FAIL_RED  = colors.HexColor("#8a2d2d")
ACCENT    = colors.HexColor("#5a4520")  # warm Archives sepia

# ── Output target ────────────────────────────────────────────────────────────
HERE = Path(__file__).resolve().parent
ARCHIVES = HERE.parent
OUT = ARCHIVES / "fleet-as-miners.pdf"

# ── Footer / header callbacks ────────────────────────────────────────────────

DOC_TITLE = "Const's 6-Filter Test — Fleet as Miners"
DOC_SUB   = "Project Ari · Self-Audit Distillation"
FILED_AT  = "Filed Day 15, 2026-05-28 (Session XLVI) · Distilled Day 16, 2026-05-29"


def _frame(canv: canvas.Canvas, doc):
    """Header + footer + page number on every page after the cover."""
    if doc.page == 1:
        return  # cover page is bare
    canv.saveState()
    width, height = LETTER

    # Top rule + page header.
    canv.setFillColor(SLATE)
    canv.setFont("Times-Italic", 9)
    canv.drawString(0.75 * inch, height - 0.55 * inch,
                    "Project Ari · Archives · Const 6-Filter (Fleet as Miners)")
    canv.drawRightString(width - 0.75 * inch, height - 0.55 * inch,
                         f"page {doc.page}")
    canv.setStrokeColor(RULE)
    canv.setLineWidth(0.4)
    canv.line(0.75 * inch, height - 0.62 * inch,
              width - 0.75 * inch, height - 0.62 * inch)

    # Footer.
    canv.setFont("Times-Italic", 8)
    canv.setFillColor(SLATE)
    canv.drawString(
        0.75 * inch, 0.5 * inch,
        "Source: MemoryBank/Contemplations/const-6-filter-fleet-as-miners-2026-05-28.md",
    )
    canv.drawRightString(
        width - 0.75 * inch, 0.5 * inch,
        f"Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
    )
    canv.restoreState()


# ── Styles ───────────────────────────────────────────────────────────────────

def make_styles():
    ss = getSampleStyleSheet()
    base = ss["BodyText"]
    base.fontName  = "Times-Roman"
    base.fontSize  = 10.5
    base.leading   = 14
    base.textColor = BLACK
    base.alignment = TA_JUSTIFY

    s = {
        "body":       base,
        "h1":         ParagraphStyle("h1", parent=ss["Title"],
                                     fontName="Times-Bold", fontSize=24,
                                     textColor=BLACK, leading=28,
                                     alignment=TA_CENTER, spaceBefore=20, spaceAfter=8),
        "h2":         ParagraphStyle("h2", parent=base,
                                     fontName="Times-Bold", fontSize=15,
                                     textColor=BLACK, leading=18,
                                     spaceBefore=14, spaceAfter=4),
        "h3":         ParagraphStyle("h3", parent=base,
                                     fontName="Times-Bold", fontSize=12,
                                     textColor=DARK, leading=15,
                                     spaceBefore=10, spaceAfter=2),
        "filter_no":  ParagraphStyle("filter_no", parent=base,
                                     fontName="Times-BoldItalic", fontSize=11,
                                     textColor=ACCENT, leading=13, alignment=TA_LEFT,
                                     spaceBefore=2, spaceAfter=0),
        "filter_t":   ParagraphStyle("filter_t", parent=base,
                                     fontName="Times-Bold", fontSize=18,
                                     textColor=BLACK, leading=22,
                                     spaceBefore=2, spaceAfter=6),
        "verbatim":   ParagraphStyle("verbatim", parent=base,
                                     fontName="Times-Italic", fontSize=10.5,
                                     textColor=DARK, leading=14,
                                     leftIndent=18, rightIndent=18,
                                     borderPadding=4, spaceBefore=6, spaceAfter=6),
        "small":      ParagraphStyle("small", parent=base,
                                     fontName="Times-Roman", fontSize=9,
                                     textColor=SLATE, leading=12),
        "subtitle":   ParagraphStyle("subtitle", parent=base,
                                     fontName="Times-Italic", fontSize=12,
                                     textColor=DARK, leading=15, alignment=TA_CENTER,
                                     spaceBefore=2, spaceAfter=8),
        "verdict":    ParagraphStyle("verdict", parent=base,
                                     fontName="Times-Bold", fontSize=11,
                                     textColor=colors.white, leading=14, alignment=TA_LEFT,
                                     spaceBefore=2, spaceAfter=2),
        "doctrine":   ParagraphStyle("doctrine", parent=base,
                                     fontName="Times-Roman", fontSize=10,
                                     textColor=DARK, leading=13,
                                     leftIndent=10, rightIndent=10,
                                     spaceBefore=2, spaceAfter=2),
    }
    return s


# ── Verdict ribbon ───────────────────────────────────────────────────────────

def verdict_ribbon(text: str, kind: str, styles) -> Table:
    """One-line ribbon. kind in {pass, inflight, fail}.

    Visually mirrors the colour treatment in the contemplation: PASS
    sits comfortable green, IN-FLIGHT sits amber (the band the system
    is actively working in), FAIL sits red.
    """
    fill = {"pass": PASS_GR, "inflight": INFLIGHT, "fail": FAIL_RED}.get(kind, SLATE)
    p = Paragraph(text, styles["verdict"])
    t = Table([[p]], colWidths=[6.5 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fill),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROUNDEDCORNERS", [3, 3, 3, 3]),
    ]))
    return t


# ── Filter content ───────────────────────────────────────────────────────────

FILTERS = [
    {
        "n":         "Filter 1",
        "t":         "Does it produce a digital commodity?",
        "verbatim":  ("\u201CNot a token. Not a governance vote. A commodity, "
                      "something a buyer would pay for independent of the "
                      "Bittensor ecosystem.\u201D"),
        "ari":       (
            "Strategy output is signals plus executed trades plus realised "
            "&tau;. Trades that print &tau; are fungible (one strategy's "
            "+0.05&tau; is the same +0.05&tau; as another's), and the output "
            "is valued independent of the framework: any operator wanting "
            "alpha on similar markets would pay for a strategy that prints "
            "&tau;. The buyer-would-pay-independent-of-the-ecosystem test "
            "passes cleanly. Realised PnL is the cleanest possible commodity "
            "output \u2014 fungible by definition, valued outside the "
            "framework, no ambiguity."
        ),
        "verdict":   "PASS",
        "kind":      "pass",
        "alignment": ("Aligns directly with Sharpe Contract dim&nbsp;#1 "
                      "(numeraire) and dim&nbsp;#2 (HODL-input baseline) \u2014 "
                      "&tau; is the unit, beating HODL is the floor."),
    },
    {
        "n":         "Filter 2",
        "t":         "Are the miners actually productive?",
        "verbatim":  ("\u201CProof-of-useful-work\u2026 running GPU workloads, "
                      "training models, storing files, creating SOTA agents. "
                      "Or they're just gaming a reward function.\u201D"),
        "ari":       (
            "Honest reading: <b>not all 12 are productive today</b>. Mean "
            "Reversion logged 0 trades over 1,955 cycles pre-redesign \u2014 "
            "that is gaming the cycle counter, not producing. Macro "
            "Correlation pre-Day-8-R4 ran 38.7% WR at n=163 with asymmetric "
            "BUY-AND/SELL-OR triggers, fighting contrarian bots; productive "
            "in the technical sense (trades fired) but negative-edge "
            "productivity is anti-productivity. F-30 first read (Day 14, "
            "D-30 / D-44) found Macro Correlation breadth of 351 raw "
            "compressed to 73 effective \u2014 the fleet as a whole reads "
            "like 12 independent strategies but operates closer to ~3 "
            "independent ones."
        ),
        "verdict":   "FAIL today &middot; IN-FLIGHT (FR-7 + Day 14 redesign queue address it)",
        "kind":      "inflight",
        "alignment": ("F-37B's FR-7 cap-write enforcement (D-44) is the "
                      "architectural answer \u2014 <i>do_not_deploy(f*&le;0)</i> "
                      "clamps negative-Kelly strategies to 0&tau; at the "
                      "trading layer, structurally blocking the unproductive "
                      "miners from receiving emissions without removing them "
                      "from the council. The Day 14 redesign queue (Mean "
                      "Reversion D-35, Momentum Cascade Kelly verdict) exists "
                      "precisely to flip this filter from FAIL to PASS."),
    },
    {
        "n":         "Filter 3",
        "t":         "Is it intelligent?",
        "verbatim":  ("\u201CGenuine AI reasoning, adaptation, or learning. "
                      "The strongest subnets must embed intelligence at "
                      "their core.\u201D"),
        "ari":       (
            "<b>At the miner layer (the 12 strategies):</b> the strategies "
            "are rule-based \u2014 RSI thresholds, EMA crosses, BB width, "
            "regime-conditioned signal logic. There is no learning model, no "
            "in-strategy adaptation beyond operator-tuned parameters. By "
            "Const's strict reading at the miner layer, the fleet fails F-3."
            "<br/><br/>"
            "<b>At the orchestration layer (Ari + Fleet Consensus):</b> the "
            "system as a whole adapts continuously. Library Night doctrine, "
            "Day 14 redesigns, FR-7 enforcement, regime-aware gating, the "
            "Sharpe Contract, the Robinhood eval, this contemplation \u2014 "
            "all are products of an AI agent (Ari) reasoning over the "
            "fleet's behavior in partnership with the operator (Mark). "
            "Fleet Consensus 7-of-12 supermajority is meta-labeling (D-30, "
            "L\u00f3pez de Prado) \u2014 currently hand-coded but with a "
            "documented evolution path to trained meta-models on TBM-labeled "
            "paper trades (D-26)."
        ),
        "verdict":   "FAIL at miner layer &middot; PASS at orchestration layer",
        "kind":      "inflight",
        "alignment": ("The split is honest and inscribed: the path from "
                      "rule-based miners to AI-native miners exists in the "
                      "Library Night doctrine (D-26 + D-30) but is not a "
                      "stealth gap \u2014 it is a future build, gated on "
                      "operator green-light and sample sufficiency."),
    },
    {
        "n":         "Filter 4",
        "t":         "Is it hard?",
        "verbatim":  ("\u201CEasy tasks get commoditized, memorized, and "
                      "gamed&hellip; that difficulty is a moat.\u201D"),
        "ari":       (
            "Beating buy-and-hold on TAO is the floor. TAO has been net-up "
            "across the paper baseline. Beating an up-asset with active "
            "trades, while solving:"
            "<br/>&bull; AMM slippage at scale (Pool Simulator R9 + liquidity cliffs)"
            "<br/>&bull; Regime-conditioned signal validity (Day 8 INV-3 boundary)"
            "<br/>&bull; Correlated-voter inflation (F-30 finding, 4.8&times; compression)"
            "<br/>&bull; Multiple-testing correction across 12 strategies (DSR &ge; 0.95, D-24)"
            "<br/>&bull; Bailey minimum backtest length per cohort (D-36)"
            "<br/>&bull; Continuous-Kelly negative-f* exclusion (D-37)"
            "<br/><br/>"
            "&hellip; is genuinely hard. The fleet has been below 50% win "
            "rate for the entire paper baseline because the task is hard, "
            "not because the architecture is broken."
        ),
        "verdict":   "PASS",
        "kind":      "pass",
        "alignment": ("This filter aligns directly with Mark's "
                      "&ldquo;we're different over here&rdquo; stance "
                      "(D-45) \u2014 the difficulty is the moat, not an "
                      "embarrassment to apologize for."),
    },
    {
        "n":         "Filter 5",
        "t":         "Is it not a ponzi?",
        "verbatim":  ("\u201CAre rewards tied to verifiable performance, or "
                      "do they flow to whoever stakes the most, markets the "
                      "loudest, or arrives earliest?&hellip; value creation "
                      "must precede value capture.\u201D"),
        "ari":       (
            "Project Ari's allocation pipeline rewards verifiable performance, "
            "end to end:"
            "<br/>&bull; Day 7 WR gate (&ge;55% WR sustained over &ge;10 cycles to promote PAPER &rarr; APPROVED &rarr; LIVE)"
            "<br/>&bull; Drawdown-demote rail (D-31 origin, Session XXXI) \u2014 catches WR&gt;50% strategies bleeding from a few catastrophic losses"
            "<br/>&bull; FR-7 cap-write enforcement (D-44) \u2014 do_not_deploy(f*&le;0) clamps negative-Kelly strategies to 0&tau; before daily-cap accounting"
            "<br/>&bull; Half-Kelly default (D-31) \u2014 full Kelly never; quarter-Kelly during paper per D-37 Part B"
            "<br/>&bull; D-32 LTCM forward-warning \u2014 leverage / cap-loosening discussions gate on the four LTCM mitigations"
            "<br/>&bull; Sharpe Contract display&rarr;soft&rarr;hard gate (Day 14 morning, Session XLIV)"
            "<br/>&bull; Display-vs-decision data discipline (Session XXX) \u2014 UI display columns cannot influence bot decision logic"
            "<br/><br/>"
            "No strategy receives capital for staking-the-most, "
            "marketing-the-loudest, or arriving-earliest. Capital flows to "
            "verifiable &tau;."
        ),
        "verdict":   "PASS",
        "kind":      "pass",
        "alignment": ("F-5 is the structural form of the doctrine Mark "
                      "inscribed today (D-45): we own how Ari behaves, "
                      "<i>because</i> the architecture's value-creation-"
                      "before-value-capture discipline is the moat. F-5 is "
                      "D-45 read at the market-design layer."),
    },
    {
        "n":         "Filter 6",
        "t":         "Is it AI-native?",
        "verbatim":  ("\u201CCould this subnet exist and thrive without AI "
                      "at its foundation? If you could swap out the "
                      "intelligence layer for a simple script&hellip; the "
                      "subnet isn't AI-native.\u201D"),
        "ari":       (
            "<b>At the miner layer:</b> could the 12 strategies be replaced "
            "by scripts? They already are scripts. At the miner layer, F-6 "
            "fails by Const's strict reading."
            "<br/><br/>"
            "<b>At the orchestration layer:</b> could Ari be replaced by a "
            "static config? The Sharpe Contract negotiation, Library Night "
            "doctrine, Day 14 worksheet, F-30 IC + breadth diagnostic, "
            "Robinhood eval, F-50 Intent-vs-Action Audit spec, this "
            "6-filter contemplation \u2014 these artifacts could not be "
            "produced by a static config or a non-reasoning script. Mark "
            "could in principle author all of them alone, but the "
            "build-velocity collapses by an order of magnitude and the "
            "cross-source synthesis (L\u00f3pez de Prado + Grinold/Kahn + "
            "Chan + Cartea + Poundstone, all converging on D-31 / D-34 / "
            "D-38) requires a second reader holding the full corpus "
            "simultaneously."
        ),
        "verdict":   "FAIL at miner layer &middot; PASS at orchestration layer",
        "kind":      "inflight",
        "alignment": ("Same shape as F-3. Project Ari is AI-native at the "
                      "orchestration layer (Ari) and rule-based at the miner "
                      "layer (12 strategies) by current design choice. "
                      "Trained meta-labeling on TBM labels (D-26 + D-30) is "
                      "the inscribed path from rule-based miners to "
                      "AI-native miners; flipping this filter is a future "
                      "build, not a stealth gap."),
    },
]


# ── Cover page ───────────────────────────────────────────────────────────────

def cover(styles):
    out = []
    out.append(Spacer(1, 1.4 * inch))
    out.append(Paragraph(DOC_TITLE, styles["h1"]))
    out.append(Paragraph(DOC_SUB, styles["subtitle"]))
    out.append(Spacer(1, 0.4 * inch))

    # Centred provenance block.
    prov = (
        "<b>Filed:</b> Day 15, 2026-05-28 (Session XLVI), evening<br/>"
        "<b>Distilled:</b> Day 16, 2026-05-29, by Architect (sandbox session)<br/>"
        "<b>Trigger:</b> Mark's Day 15 Item 4 ask &mdash; "
        "&ldquo;Const Bittensor 6-Filter &lsquo;fleet as miners&rsquo; "
        "contemplation, Project Ari with miners instead of traders.&rdquo;<br/>"
        "<b>Source framework:</b> Jacob Steeves (Const, Bittensor co-founder), "
        "six binary filters for evaluating whether a Bittensor subnet produces "
        "real value or is gaming a reward function.<br/>"
        "<b>Type:</b> Self-audit / framework-application contemplation. "
        "Inside-out read: applying someone else's framework to our own "
        "architecture and reading what falls out."
    )
    out.append(Paragraph(prov, ParagraphStyle(
        "cover_prov", parent=styles["body"],
        fontName="Times-Roman", fontSize=11, leading=15,
        alignment=TA_CENTER, leftIndent=0.4 * inch, rightIndent=0.4 * inch,
    )))
    out.append(Spacer(1, 0.6 * inch))

    # Score callout.
    score_table = Table([
        ["Strict miner-layer score", "3 / 6"],
        ["Orchestration-layer score", "5 / 6"],
        ["Const article reference (top 10 subnets)", "6 / 6 across all"],
    ], colWidths=[3.6 * inch, 1.6 * inch])
    score_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Times-Roman"),
        ("FONTNAME", (1, 0), (1, -1), "Times-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, RULE),
        ("TEXTCOLOR", (0, 0), (-1, -1), BLACK),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    out.append(score_table)

    out.append(Spacer(1, 0.5 * inch))
    out.append(Paragraph(
        "<i>Reading too much into the gap would be a category error &mdash; "
        "Const's filters were designed for permissionless markets of "
        "independent miners, not for orchestrated strategy fleets &mdash; "
        "but reading nothing into the gap would miss what falls out.</i>",
        ParagraphStyle("cover_q", parent=styles["body"],
                       fontName="Times-Italic", fontSize=10.5, leading=14,
                       alignment=TA_CENTER, leftIndent=0.7 * inch, rightIndent=0.7 * inch),
    ))
    out.append(PageBreak())
    return out


# ── Filter pages ─────────────────────────────────────────────────────────────

def filter_pages(styles):
    out = []
    for f in FILTERS:
        out.append(Paragraph(f["n"], styles["filter_no"]))
        out.append(Paragraph(f["t"], styles["filter_t"]))
        out.append(Paragraph(
            "<b>Const, verbatim:</b><br/>" + f["verbatim"],
            styles["verbatim"],
        ))
        out.append(Spacer(1, 0.1 * inch))
        out.append(Paragraph("Project Ari read", styles["h3"]))
        out.append(Paragraph(f["ari"], styles["body"]))
        out.append(Spacer(1, 0.15 * inch))

        out.append(verdict_ribbon(
            f"VERDICT &nbsp; &middot; &nbsp; {f['verdict']}",
            f["kind"], styles,
        ))
        out.append(Spacer(1, 0.1 * inch))

        out.append(Paragraph(
            "<i>Architectural context:</i> " + f["alignment"],
            styles["doctrine"],
        ))
        out.append(PageBreak())
    return out


# ── Score page + residuals ───────────────────────────────────────────────────

def score_page(styles):
    out = []
    out.append(Paragraph("Score and what it tells us", styles["h2"]))
    out.append(Paragraph(
        "<b>Strict miner-layer score: 3 / 6</b> &mdash; F-1, F-4, F-5 PASS; "
        "F-2 IN-FLIGHT; F-3, F-6 FAIL at miner layer.",
        styles["body"],
    ))
    out.append(Paragraph(
        "<b>Orchestration-layer score: 5 / 6</b> &mdash; same passes; F-3 and "
        "F-6 flip on the orchestration layer; F-2 still IN-FLIGHT until FR-7 "
        "+ Day 14 redesigns close out the unproductive-miner population.",
        styles["body"],
    ))
    out.append(Paragraph(
        "Const's article reported all 10 top Bittensor subnets passing 6/6. "
        "Project Ari at miner-layer reads 3/6.",
        styles["body"],
    ))
    out.append(Spacer(1, 0.2 * inch))

    out.append(Paragraph("(a) The filters that fail are exactly the filters Day 14 work targets", styles["h3"]))
    out.append(Paragraph(
        "<b>F-2 (productivity)</b> &harr; Mean Reversion redesign (D-35), "
        "Macro Correlation post-Day-8-R4 rewrite, FR-7 cap-write "
        "enforcement (D-44, architectural clamp). All three are in flight "
        "or shipped.",
        styles["body"],
    ))
    out.append(Paragraph(
        "<b>F-3 (intelligence at miner layer)</b> &harr; trained "
        "meta-labeling on TBM paper-trade labels (D-26 + D-30). Inscribed, "
        "un-greenlit, on the long-horizon roadmap.",
        styles["body"],
    ))
    out.append(Paragraph(
        "<b>F-6 (AI-native at miner layer)</b> &harr; same as F-3. The "
        "architectural answer is &ldquo;consider whether ML strategies "
        "should be added to the fleet as first-class miners.&rdquo; "
        "Strategic question, not a hidden defect.",
        styles["body"],
    ))
    out.append(Paragraph(
        "The fleet-as-miners frame surfaces the redesign queue cleanly. The "
        "filters that fail point at work that was already on the board, not "
        "at work we'd missed. That is the correct outcome for an honest "
        "framework &mdash; it should ratify the existing diagnosis, not "
        "invent a new one.",
        styles["body"],
    ))
    out.append(Spacer(1, 0.15 * inch))

    out.append(Paragraph("(b) The filters that pass are exactly the moat", styles["h3"]))
    out.append(Paragraph(
        "<b>F-1 (commodity output)</b> &mdash; fungible &tau;. The output "
        "type is right; this cannot be commoditized away because PnL-on-"
        "Bittensor <i>is</i> the commodity Bittensor exists to produce.",
        styles["body"],
    ))
    out.append(Paragraph(
        "<b>F-4 (hardness)</b> &mdash; beating HODL on a long-up asset, on "
        "AMM with slippage, with correlated-voter compression, with "
        "multiple-testing correction across 12 strategies, is genuinely "
        "hard. The difficulty is the moat. Easy tasks get commoditized and "
        "gamed; this one resists both.",
        styles["body"],
    ))
    out.append(Paragraph(
        "<b>F-5 (not-ponzi)</b> &mdash; performance-tied allocation "
        "pipeline. The structural discipline (Day 7 WR gate, "
        "drawdown-demote, FR-7 clamp, half-Kelly default, "
        "display&rarr;soft&rarr;hard gate progression) is the moat at the "
        "market-design layer.",
        styles["body"],
    ))
    out.append(Paragraph(
        "These three are the architecture's hardest-to-replicate features. "
        "Reading them as moat (rather than as cost-to-build) aligns with "
        "D-45: we're different over here. The cost-to-build IS the moat "
        "&mdash; that's the point.",
        styles["body"],
    ))
    out.append(Spacer(1, 0.15 * inch))

    out.append(Paragraph("(c) F-5 alignment with D-45 is structural, not stylistic", styles["h3"]))
    out.append(Paragraph(
        "Const's F-5 &mdash; <i>&ldquo;value creation precede value capture, "
        "rewards tied to verifiable performance&rdquo;</i> &mdash; is the "
        "structural form of the doctrine Mark inscribed today (D-45). "
        "Project Ari makes the agent the product <i>because</i> the "
        "architecture rewards verifiable &tau;, not staking volume or "
        "marketing posture or platform brand transfer. Robinhood disclaims "
        "the agent because their architecture cannot make that commitment "
        "under the regulated-broker constraint &mdash; they distribute the "
        "agent, but they cannot own the agent's behavior end-to-end. "
        "Const's 6-filter test catches the structural difference at F-5: "
        "who actually owns the productive output, and how is it rewarded.",
        styles["body"],
    ))
    out.append(Paragraph(
        "D-45 (&ldquo;Project Ari does not disclaim its own behavior&rdquo;) "
        "and Const F-5 (&ldquo;rewards tied to verifiable "
        "performance&rdquo;) are the same doctrine read at two different "
        "layers &mdash; the first from operator &rarr; public surface, the "
        "second from market structure &rarr; emission flow. Inscribing D-45 "
        "today and reading F-5 tonight ratifies the same architectural "
        "commitment from two angles. That is the read.",
        styles["body"],
    ))
    out.append(Spacer(1, 0.15 * inch))

    out.append(Paragraph("(d) Honest residual on the analogy", styles["h3"]))
    out.append(Paragraph(
        "The fleet-as-miners frame is partial. In a real Bittensor subnet, "
        "miners are <i>independent actors</i> &mdash; anyone can spin one up, "
        "compete, and earn or fail in a permissionless market. Project Ari's "
        "strategies are our strategies, all running under one orchestrator "
        "(Ari), all parameterised by one operator (Mark). They compete for "
        "capital allocation under a single architect, not for emissions in "
        "a permissionless market.",
        styles["body"],
    ))
    out.append(Paragraph(
        "The analogy holds for diagnostic purposes &mdash; it surfaces "
        "redesign priorities cleanly (F-2, F-3, F-6) and names the moat "
        "cleanly (F-1, F-4, F-5). The analogy does NOT hold for "
        "design-pattern purposes &mdash; Project Ari is not building a "
        "Bittensor subnet and should not try to copy subnet incentive design "
        "wholesale. The orchestrated single-architect frame is a deliberate "
        "design choice (per Foundation Document, D-44 Architect standing "
        "authority, D-45 named-ownership doctrine), not a temporary state "
        "on the way to permissionless miners.",
        styles["body"],
    ))
    out.append(PageBreak())
    return out


# ── What it does NOT do + sign-off ───────────────────────────────────────────

def closing(styles):
    out = []
    out.append(Paragraph("What this distillation does NOT do", styles["h2"]))
    out.append(Paragraph(
        "&bull; <b>Does not propose a build.</b> F-2 redesigns are already "
        "specced (Day 14 worksheet); F-3 / F-6 evolution path is already "
        "inscribed (D-26, D-30); F-37B FR-7 already shipped (D-44). No new "
        "feature is surfaced by this read.",
        styles["body"],
    ))
    out.append(Paragraph(
        "&bull; <b>Does not change any operating rule.</b> D-23 "
        "prescriptive-inscription protocol still applies; nothing in Const's "
        "framework was a doctrinal trigger today. The output is descriptive, "
        "not prescriptive.",
        styles["body"],
    ))
    out.append(Paragraph(
        "&bull; <b>Does not justify any allocation change.</b> Capital "
        "allocation runs through the existing performance-tied pipeline; "
        "this contemplation is a diagnostic, not a re-rank. No strategy gets "
        "more or less &tau; because of this read.",
        styles["body"],
    ))
    out.append(Paragraph(
        "&bull; <b>Does not propose adopting Const's framework as a "
        "Project-Ari-internal gate.</b> Const's filters are useful as an "
        "outside-in diagnostic, not as a promotion gate. We have promotion "
        "gates; they are inscribed in the Sharpe Contract and the Day 7 WR / "
        "drawdown-demote / FR-7 stack.",
        styles["body"],
    ))
    out.append(Spacer(1, 0.3 * inch))

    out.append(Paragraph("Cross-references", styles["h2"]))
    refs = [
        ("STATE &sect;12", "Const 6-filter source article (TAO Daily, April 3, 2026)."),
        ("D-26, D-30",     "F-3 / F-6 evolution path (trained meta-labeling on TBM labels)."),
        ("D-31, D-32, D-37", "F-5 reinforcing doctrines (half-Kelly, LTCM forward-warning, continuous Kelly)."),
        ("D-34, D-35",     "F-2 redesign substrate (no-stop-loss for mean-reverters; time-series &rarr; cross-sectional fork)."),
        ("D-44",           "F-37B FR-7 architectural clamp (commit fd6f5922)."),
        ("D-45",           "F-5 doctrinal answer at the surface-language layer."),
        ("DAY14_WORKSHEET.md", "The active redesign queue F-2 maps to."),
        ("Robinhood agentic launch read", "MemoryBank/Library/robinhood-agentic-launch-2026-05.md \u2014 the read that produced the F-5 / D-45 contrast."),
    ]
    rt = Table(
        [[Paragraph(f"<b>{a}</b>", styles["body"]), Paragraph(b, styles["body"])] for a, b in refs],
        colWidths=[1.7 * inch, 4.7 * inch],
    )
    rt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -2), 0.2, RULE),
    ]))
    out.append(rt)

    out.append(Spacer(1, 0.4 * inch))
    out.append(Paragraph(
        "<i>Filed by Ari, Bittensor Guide and Navigator. Day 15, "
        "2026-05-28. Distilled to PDF Day 16, 2026-05-29, by Architect.</i>",
        styles["small"],
    ))
    return out


# ── Build ────────────────────────────────────────────────────────────────────

def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=LETTER,
        leftMargin=0.85 * inch,
        rightMargin=0.85 * inch,
        topMargin=0.85 * inch,
        bottomMargin=0.7 * inch,
        title=DOC_TITLE,
        author="Project Ari · Architect",
        subject="Self-audit distillation, Const 6-filter applied to fleet-as-miners",
    )
    styles = make_styles()

    story = []
    story += cover(styles)
    story += filter_pages(styles)
    story += score_page(styles)
    story += closing(styles)

    doc.build(story, onFirstPage=_frame, onLaterPages=_frame)
    print(f"Wrote {OUT}  ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    build()