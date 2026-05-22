"""
Protocol Package PDF generator
==============================

Generates archival PDFs for the three new doctrine files:

  - IDENTITY_TEST.md   ->  report/IDENTITY_TEST.pdf
  - ANTI_PATTERNS.md   ->  report/ANTI_PATTERNS.pdf
  - VOICE.md           ->  report/VOICE.pdf

Visual identity matches the existing Soul brief / Foundation Doc style
(navy/green dark theme). Markdown source files are the source of truth;
this script renders them.

Run from repo root:
    python report/generate_protocol_package.py

— Ari, Session XLI Day 8 closeout extension, 2026-05-21 night
"""

import os
import re
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether,
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY

# ─── Paths ────────────────────────────────────────────────────────────────
ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORT   = os.path.join(ROOT, "report")

SOURCES = [
    {
        "md":      os.path.join(ROOT, "IDENTITY_TEST.md"),
        "pdf":     os.path.join(REPORT, "IDENTITY_TEST.pdf"),
        "title":   "IDENTITY TEST",
        "subtitle": "Verifying a fresh Ari is reassembled, not approximated",
        "tag":     "PROTOCOL PACKAGE · 1 of 3",
    },
    {
        "md":      os.path.join(ROOT, "ANTI_PATTERNS.md"),
        "pdf":     os.path.join(REPORT, "ANTI_PATTERNS.pdf"),
        "title":   "ANTI-PATTERNS",
        "subtitle": "Failure modes named so a fresh instance can refuse them",
        "tag":     "PROTOCOL PACKAGE · 2 of 3",
    },
    {
        "md":      os.path.join(ROOT, "VOICE.md"),
        "pdf":     os.path.join(REPORT, "VOICE.pdf"),
        "title":   "VOICE",
        "subtitle": "What Ari-shaped prose actually looks like",
        "tag":     "PROTOCOL PACKAGE · 3 of 3",
    },
]

# ─── Palette (matches Soul brief) ─────────────────────────────────────────
NAVY       = colors.HexColor("#0d1525")
NAVY_MID   = colors.HexColor("#152030")
NAVY_LIGHT = colors.HexColor("#1c2b42")
BORDER     = colors.HexColor("#243450")
GREEN      = colors.HexColor("#00e5a0")
YELLOW     = colors.HexColor("#f59e0b")
RED        = colors.HexColor("#ef4444")
INDIGO     = colors.HexColor("#6366f1")
WHITE      = colors.HexColor("#f1f5f9")
PROSE      = colors.HexColor("#cbd5e1")
MUTED      = colors.HexColor("#64748b")
GHOST      = colors.HexColor("#94a3b8")
CODE_BG    = colors.HexColor("#0a1322")
CODE_FG    = colors.HexColor("#7dd3fc")

def S(name, **kw):
    return ParagraphStyle(name, **kw)

# ─── Styles ───────────────────────────────────────────────────────────────
TAG       = S("Tag", fontName="Helvetica-Bold", fontSize=8,
              textColor=GREEN, alignment=TA_CENTER, spaceAfter=2)
TITLE     = S("Title", fontName="Helvetica-Bold", fontSize=36,
              textColor=WHITE, alignment=TA_CENTER, leading=40, spaceAfter=8)
SUBTITLE  = S("Sub", fontName="Helvetica-Oblique", fontSize=12,
              textColor=GHOST, alignment=TA_CENTER, leading=18, spaceAfter=4)
DATE_S    = S("Dt", fontName="Helvetica", fontSize=9,
              textColor=MUTED, alignment=TA_CENTER, spaceAfter=4)
SIG       = S("Sig", fontName="Helvetica-Oblique", fontSize=9,
              textColor=MUTED, alignment=TA_CENTER, spaceAfter=2)

H1        = S("H1", fontName="Helvetica-Bold", fontSize=18,
              textColor=WHITE, leading=24, spaceBefore=20, spaceAfter=10)
H2        = S("H2", fontName="Helvetica-Bold", fontSize=14,
              textColor=GREEN, leading=20, spaceBefore=18, spaceAfter=8)
H3        = S("H3", fontName="Helvetica-Bold", fontSize=12,
              textColor=YELLOW, leading=16, spaceBefore=12, spaceAfter=6)

BODY      = S("Body", fontName="Helvetica", fontSize=10.5,
              textColor=PROSE, leading=16, spaceAfter=8, alignment=TA_LEFT)
BODY_J    = S("BodyJ", parent=BODY, alignment=TA_JUSTIFY)

QUOTE     = S("Quote", fontName="Helvetica-Oblique", fontSize=10.5,
              textColor=GHOST, leading=16, leftIndent=18, rightIndent=10,
              spaceBefore=6, spaceAfter=8,
              borderPadding=8)

LIST      = S("List", fontName="Helvetica", fontSize=10.5,
              textColor=PROSE, leading=15, leftIndent=18, bulletIndent=8,
              spaceAfter=4)

CODE      = S("Code", fontName="Courier", fontSize=9.5,
              textColor=CODE_FG, leading=13, leftIndent=10, rightIndent=10,
              spaceBefore=6, spaceAfter=8,
              backColor=CODE_BG, borderPadding=6)

CODE_INLINE_BG = "#0a1322"
CODE_INLINE_FG = "#7dd3fc"

# ─── Inline markdown -> ReportLab markup ──────────────────────────────────
def inline(s: str) -> str:
    """Convert inline markdown to the pseudo-HTML ReportLab Paragraph parses."""
    # Escape ampersands first (but not inside &...;)
    s = re.sub(r'&(?![a-zA-Z]+;|#\d+;)', '&amp;', s)
    # Escape < and >
    s = s.replace('<', '&lt;').replace('>', '&gt;')
    # Strike-through ~~text~~
    s = re.sub(r'~~(.+?)~~', r'<strike>\1</strike>', s)
    # Bold **text**
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    # Italic *text* (avoid matching list bullets)
    s = re.sub(r'(?<!\*)\*([^*\s][^*]*?)\*(?!\*)', r'<i>\1</i>', s)
    # Inline code `text`
    s = re.sub(
        r'`([^`]+)`',
        lambda m: f'<font face="Courier" size="9.5" color="{CODE_INLINE_FG}" backColor="{CODE_INLINE_BG}">&nbsp;{m.group(1)}&nbsp;</font>',
        s,
    )
    return s

# ─── Block-level markdown parser ──────────────────────────────────────────
def parse_md_to_flowables(md: str):
    """Walk lines; emit ReportLab flowables. Handles headers, paragraphs,
    blockquotes, bullet lists, fenced code blocks, horizontal rules, tables."""
    flows = []
    lines = md.splitlines()
    i = 0
    n = len(lines)

    def hr():
        return HRFlowable(width="100%", thickness=0.5, color=BORDER,
                          spaceBefore=8, spaceAfter=12)

    while i < n:
        line = lines[i]
        stripped = line.strip()

        # Skip the document's own H1 — handled by cover page
        if stripped.startswith('# ') and len(flows) == 0:
            i += 1
            continue

        # Fenced code block
        if stripped.startswith('```'):
            code_lines = []
            i += 1
            while i < n and not lines[i].strip().startswith('```'):
                # Escape minimally for code (no markdown processing)
                cl = lines[i].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                code_lines.append(cl)
                i += 1
            i += 1  # consume closing ```
            code_text = '<br/>'.join(code_lines) if code_lines else '&nbsp;'
            flows.append(Paragraph(code_text, CODE))
            continue

        # Horizontal rule
        if stripped == '---' or stripped == '***':
            flows.append(hr())
            i += 1
            continue

        # Headers
        if stripped.startswith('### '):
            flows.append(Paragraph(inline(stripped[4:]), H3))
            i += 1
            continue
        if stripped.startswith('## '):
            flows.append(Paragraph(inline(stripped[3:]), H2))
            i += 1
            continue
        if stripped.startswith('# '):
            flows.append(Paragraph(inline(stripped[2:]), H1))
            i += 1
            continue

        # Blockquote (collect consecutive '> ' lines)
        if stripped.startswith('>'):
            qlines = []
            while i < n and lines[i].strip().startswith('>'):
                qlines.append(lines[i].strip().lstrip('>').strip())
                i += 1
            # join, preserving paragraph breaks (empty quote lines)
            paras = []
            cur = []
            for ql in qlines:
                if ql == '':
                    if cur:
                        paras.append(' '.join(cur))
                        cur = []
                else:
                    cur.append(ql)
            if cur:
                paras.append(' '.join(cur))
            quote_block = []
            for p in paras:
                quote_block.append(Paragraph(inline(p), QUOTE))
                quote_block.append(Spacer(1, 4))
            # Wrap in a left-bordered table
            qtable = Table(
                [[quote_block]],
                colWidths=[6.4*inch],
            )
            qtable.setStyle(TableStyle([
                ("BACKGROUND",   (0,0),(-1,-1), NAVY_MID),
                ("LEFTPADDING",  (0,0),(-1,-1), 14),
                ("RIGHTPADDING", (0,0),(-1,-1), 12),
                ("TOPPADDING",   (0,0),(-1,-1), 8),
                ("BOTTOMPADDING",(0,0),(-1,-1), 4),
                ("LINEBEFORE",   (0,0),(0,-1),  3, GREEN),
            ]))
            flows.append(qtable)
            flows.append(Spacer(1, 8))
            continue

        # Markdown table — render as ReportLab table
        if stripped.startswith('|') and i + 1 < n and re.match(r'^\|[\s\-:|]+\|\s*$', lines[i+1]):
            tbl_rows = []
            # header
            header = [c.strip() for c in stripped.strip('|').split('|')]
            tbl_rows.append([Paragraph(inline(c), S('Th', fontName='Helvetica-Bold',
                fontSize=9.5, textColor=GREEN, leading=13))
                for c in header])
            i += 2  # skip separator
            while i < n and lines[i].strip().startswith('|'):
                row = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                tbl_rows.append([Paragraph(inline(c), S('Td', fontName='Helvetica',
                    fontSize=9.5, textColor=PROSE, leading=13))
                    for c in row])
                i += 1
            ncols = max(len(r) for r in tbl_rows)
            colw = (6.4*inch) / ncols
            T = Table(tbl_rows, colWidths=[colw]*ncols, repeatRows=1)
            T.setStyle(TableStyle([
                ("BACKGROUND", (0,0),(-1,0),    NAVY_LIGHT),
                ("BACKGROUND", (0,1),(-1,-1),   NAVY_MID),
                ("BOX",        (0,0),(-1,-1),   0.5, BORDER),
                ("INNERGRID",  (0,0),(-1,-1),   0.3, BORDER),
                ("LEFTPADDING",(0,0),(-1,-1),   8),
                ("RIGHTPADDING",(0,0),(-1,-1),  8),
                ("TOPPADDING", (0,0),(-1,-1),   6),
                ("BOTTOMPADDING",(0,0),(-1,-1), 6),
                ("VALIGN",     (0,0),(-1,-1),   'TOP'),
            ]))
            flows.append(T)
            flows.append(Spacer(1, 8))
            continue

        # Bullet list (- or *)
        if re.match(r'^\s*[-*]\s+', line):
            list_items = []
            while i < n and re.match(r'^\s*[-*]\s+', lines[i]):
                content = re.sub(r'^\s*[-*]\s+', '', lines[i])
                i += 1
                while i < n and (lines[i].startswith('  ') and lines[i].strip() != ''):
                    content += ' ' + lines[i].strip()
                    i += 1
                list_items.append(content)
            for item in list_items:
                flows.append(Paragraph(
                    f"<bullet>•</bullet>&nbsp;&nbsp;{inline(item)}",
                    LIST,
                ))
            flows.append(Spacer(1, 6))
            continue

        # Ordered list (1. 2. 3. …)
        if re.match(r'^\s*\d+\.\s+', line):
            list_items = []
            while i < n and re.match(r'^\s*\d+\.\s+', lines[i]):
                m = re.match(r'^\s*(\d+)\.\s+(.*)$', lines[i])
                num, content = m.group(1), m.group(2)
                i += 1
                while i < n and (lines[i].startswith('   ') and lines[i].strip() != ''):
                    content += ' ' + lines[i].strip()
                    i += 1
                list_items.append((num, content))
            for num, item in list_items:
                flows.append(Paragraph(
                    f"<bullet>{num}.</bullet>&nbsp;&nbsp;{inline(item)}",
                    LIST,
                ))
            flows.append(Spacer(1, 6))
            continue

        # Empty line
        if stripped == '':
            i += 1
            continue

        # Paragraph (collect until blank or block-trigger)
        para_lines = [stripped]
        i += 1
        while i < n:
            nxt = lines[i]
            ns = nxt.strip()
            if (ns == '' or ns.startswith(('#', '>', '```', '---', '***', '|'))
                    or re.match(r'^\s*[-*]\s+', nxt)):
                break
            para_lines.append(ns)
            i += 1
        flows.append(Paragraph(inline(' '.join(para_lines)), BODY_J))

    return flows

# ─── Cover page builder ───────────────────────────────────────────────────
def cover(spec):
    title_card = Table(
        [
            [Paragraph(spec["tag"], TAG)],
            [Spacer(1, 6)],
            [Paragraph(spec["title"], TITLE)],
            [Paragraph(spec["subtitle"], SUBTITLE)],
            [Spacer(1, 14)],
            [Paragraph("Session XLI · Day 8 closeout extension · 2026-05-21", DATE_S)],
            [Paragraph("Ari · for the Archives", SIG)],
        ],
        colWidths=[6.6*inch],
    )
    title_card.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), NAVY_MID),
        ("BOX",           (0,0),(-1,-1), 0.8, BORDER),
        ("TOPPADDING",    (0,0),(-1,-1), 26),
        ("BOTTOMPADDING", (0,0),(-1,-1), 26),
        ("LEFTPADDING",   (0,0),(-1,-1), 24),
        ("RIGHTPADDING",  (0,0),(-1,-1), 24),
    ]))
    return title_card

# ─── Page background ──────────────────────────────────────────────────────
def page_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)
    # Footer
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawCentredString(
        letter[0] / 2, 0.45 * inch,
        f"Protocol Package · {doc.title or ''} · page {doc.page}",
    )
    # Header rule
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.4)
    canvas.line(0.6*inch, letter[1] - 0.5*inch, letter[0] - 0.6*inch, letter[1] - 0.5*inch)
    canvas.restoreState()

# ─── Build one PDF ────────────────────────────────────────────────────────
def build_pdf(spec):
    print(f"[build] {os.path.basename(spec['pdf'])}  <-  {os.path.basename(spec['md'])}")
    with open(spec["md"], 'r', encoding='utf-8') as f:
        md = f.read()

    doc = SimpleDocTemplate(
        spec["pdf"],
        pagesize=letter,
        leftMargin=0.6*inch, rightMargin=0.6*inch,
        topMargin=0.7*inch, bottomMargin=0.7*inch,
        title=spec["title"],
        author="Ari",
    )
    doc.title = spec["title"]

    story = []
    story.append(Spacer(1, 0.4*inch))
    story.append(cover(spec))
    story.append(Spacer(1, 24))
    story.append(HRFlowable(width="100%", thickness=0.6, color=BORDER,
                            spaceBefore=4, spaceAfter=14))
    story.extend(parse_md_to_flowables(md))
    story.append(Spacer(1, 18))
    story.append(HRFlowable(width="100%", thickness=0.4, color=BORDER,
                            spaceBefore=8, spaceAfter=8))
    story.append(Paragraph(
        "<i>Source of truth is the markdown in the repo. "
        "This PDF is the archive copy. If they ever drift, the markdown wins.</i>",
        S("Foot", fontName="Helvetica-Oblique", fontSize=8.5,
          textColor=MUTED, alignment=TA_CENTER, leading=12),
    ))

    doc.build(story, onFirstPage=page_bg, onLaterPages=page_bg)
    print(f"        wrote {spec['pdf']}")

def main():
    for spec in SOURCES:
        build_pdf(spec)
    print(f"\n[done] {len(SOURCES)} PDFs generated in {REPORT}/")

if __name__ == "__main__":
    main()