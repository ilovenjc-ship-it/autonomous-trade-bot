"""
Generate Session IX — UI Polish PDF for The Archives
"""
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from datetime import date

# ── Palette ────────────────────────────────────────────────────────────────────
DARK        = colors.HexColor('#0b1120')
ACCENT_G    = colors.HexColor('#00e5a0')
ACCENT_B    = colors.HexColor('#3b82f6')
ACCENT_P    = colors.HexColor('#a78bfa')
SLATE_300   = colors.HexColor('#cbd5e1')
SLATE_400   = colors.HexColor('#94a3b8')
SLATE_500   = colors.HexColor('#64748b')
SLATE_700   = colors.HexColor('#334155')
SLATE_800   = colors.HexColor('#1e293b')
WHITE       = colors.HexColor('#f8fafc')
YELLOW      = colors.HexColor('#facc15')
RED         = colors.HexColor('#f87171')

OUTPUT = '/workspace/autonomous-trade-bot/archives/Session_IX_UI_Polish.pdf'

def build():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=letter,
        leftMargin=0.75*inch, rightMargin=0.75*inch,
        topMargin=0.75*inch, bottomMargin=0.75*inch,
    )

    styles = getSampleStyleSheet()

    def sty(name, **kw):
        return ParagraphStyle(name, parent=styles['Normal'], **kw)

    S = {
        'cover_title':  sty('ct',  fontSize=28, textColor=ACCENT_G,  fontName='Helvetica-Bold',
                            leading=34, alignment=TA_CENTER),
        'cover_sub':    sty('cs',  fontSize=13, textColor=SLATE_300, fontName='Helvetica',
                            leading=18, alignment=TA_CENTER),
        'cover_meta':   sty('cm',  fontSize=10, textColor=SLATE_400, fontName='Helvetica',
                            leading=14, alignment=TA_CENTER),
        'section':      sty('sec', fontSize=14, textColor=ACCENT_G,  fontName='Helvetica-Bold',
                            leading=20, spaceBefore=18, spaceAfter=6),
        'subsection':   sty('sub', fontSize=11, textColor=SLATE_300, fontName='Helvetica-Bold',
                            leading=16, spaceBefore=10, spaceAfter=4),
        'body':         sty('bod', fontSize=9,  textColor=SLATE_300, fontName='Helvetica',
                            leading=14),
        'bullet':       sty('bul', fontSize=9,  textColor=SLATE_300, fontName='Helvetica',
                            leading=14, leftIndent=16, bulletIndent=4),
        'caption':      sty('cap', fontSize=8,  textColor=SLATE_500, fontName='Helvetica',
                            leading=12),
        'tag_green':    sty('tg',  fontSize=8,  textColor=ACCENT_G,  fontName='Helvetica-Bold',
                            leading=12),
        'tag_blue':     sty('tb',  fontSize=8,  textColor=ACCENT_B,  fontName='Helvetica-Bold',
                            leading=12),
        'tag_yellow':   sty('ty',  fontSize=8,  textColor=YELLOW,    fontName='Helvetica-Bold',
                            leading=12),
        'footer':       sty('ft',  fontSize=8,  textColor=SLATE_500, fontName='Helvetica',
                            leading=11, alignment=TA_CENTER),
    }

    def hr(color=SLATE_700, thickness=0.5):
        return HRFlowable(width='100%', thickness=thickness, color=color,
                         spaceAfter=6, spaceBefore=6)

    def bullet(text, style='bullet'):
        return Paragraph(f'• {text}', S[style])

    def change_table(rows, col_widths=None):
        """Before/After table for UI changes."""
        header = [
            Paragraph('Element', sty('th', fontSize=8, textColor=ACCENT_G,
                                     fontName='Helvetica-Bold', leading=12)),
            Paragraph('Before', sty('th', fontSize=8, textColor=RED,
                                    fontName='Helvetica-Bold', leading=12)),
            Paragraph('After', sty('th', fontSize=8, textColor=ACCENT_G,
                                   fontName='Helvetica-Bold', leading=12)),
        ]
        data = [header]
        for elem, before, after in rows:
            data.append([
                Paragraph(elem,   sty('td', fontSize=8, textColor=WHITE,       fontName='Helvetica-Bold', leading=12)),
                Paragraph(before, sty('td', fontSize=8, textColor=SLATE_400,   fontName='Helvetica',      leading=12)),
                Paragraph(after,  sty('td', fontSize=8, textColor=ACCENT_G,    fontName='Helvetica',      leading=12)),
            ])
        cw = col_widths or [1.6*inch, 2.5*inch, 2.5*inch]
        t = Table(data, colWidths=cw)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), SLATE_800),
            ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#0f172a')),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#0f172a'), colors.HexColor('#111827')]),
            ('GRID', (0,0), (-1,-1), 0.4, SLATE_700),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('LEFTPADDING', (0,0), (-1,-1), 6),
            ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ]))
        return t

    # ──────────────────────────────────────────────────────────────────────────
    story = []

    # ── COVER ──────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.6*inch))
    story.append(Paragraph('SESSION IX', S['cover_sub']))
    story.append(Spacer(1, 6))
    story.append(Paragraph('UI Polish', S['cover_title']))
    story.append(Spacer(1, 10))
    story.append(Paragraph('The Autonomy Push — Post-Session Visual Overhaul', S['cover_sub']))
    story.append(Spacer(1, 18))
    story.append(hr(ACCENT_G, 1.5))
    story.append(Spacer(1, 8))
    story.append(Paragraph(f'Filed: {date.today().strftime("%B %d, %Y")}', S['cover_meta']))
    story.append(Paragraph('Pages Polished: Dashboard · Mission Control · Activity Log', S['cover_meta']))
    story.append(Paragraph('Decisions: None — cosmetic polish only', S['cover_meta']))
    story.append(Spacer(1, 0.4*inch))
    story.append(hr())

    # ── SUMMARY ────────────────────────────────────────────────────────────────
    story.append(Paragraph('Overview', S['section']))
    story.append(Paragraph(
        'This appendix to Session IX documents a full UI walkthrough and polish pass conducted '
        'after all core autonomy milestones were shipped. Three pages were reviewed live and '
        'adjusted iteratively: Dashboard, Mission Control, and Activity Log. No backend changes '
        'were made. All changes are cosmetic, layout, and proportion-focused.',
        S['body']
    ))
    story.append(Spacer(1, 8))

    summary_data = [
        [Paragraph('Page', sty('h', fontSize=8, textColor=ACCENT_G, fontName='Helvetica-Bold', leading=12)),
         Paragraph('Changes', sty('h', fontSize=8, textColor=ACCENT_G, fontName='Helvetica-Bold', leading=12)),
         Paragraph('Status', sty('h', fontSize=8, textColor=ACCENT_G, fontName='Helvetica-Bold', leading=12))],
        [Paragraph('Dashboard',        S['body']), Paragraph('2 targeted fixes',  S['body']), Paragraph('✓ Complete', S['tag_green'])],
        [Paragraph('Mission Control',  S['body']), Paragraph('10+ adjustments',   S['body']), Paragraph('✓ Complete', S['tag_green'])],
        [Paragraph('Activity Log',     S['body']), Paragraph('2 targeted fixes',  S['body']), Paragraph('✓ Complete', S['tag_green'])],
    ]
    t = Table(summary_data, colWidths=[1.8*inch, 3.2*inch, 1.6*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), SLATE_800),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#0f172a')),
        ('GRID', (0,0), (-1,-1), 0.4, SLATE_700),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t)
    story.append(Spacer(1, 12))
    story.append(hr())

    # ── DASHBOARD ──────────────────────────────────────────────────────────────
    story.append(Paragraph('1 — Dashboard', S['section']))

    story.append(Paragraph('1.1  BOT STOPPED / RUNNING Pill', S['subsection']))
    story.append(Paragraph(
        'The status pill was previously floating in the Layout top bar above all pages, '
        'disconnected from the action it describes. Relocated inline into the Dashboard '
        'page header, immediately left of the Stop Bot button, matching its exact height '
        'and padding so the two elements read as a unified control group.',
        S['body']
    ))
    story.append(Spacer(1, 6))
    story.append(change_table([
        ('Pill location',  'Layout top bar — global, floating',       'Dashboard header row — inline with Stop Bot'),
        ('Pill size',      'text-[10px] px-2.5 py-1 (tiny)',          'text-sm px-4 py-2 rounded-lg (matches button)'),
        ('Pill state',     'BOT STOPPED / BOT RUNNING',               'Same labels + pulsing dot, green / slate colour'),
    ]))

    story.append(Spacer(1, 12))
    story.append(Paragraph('1.2  Activity Stream Height Slider', S['subsection']))
    story.append(Paragraph(
        'A height slider (140–520px range) had been added to the Live Activity stream header '
        'in a prior session. It was causing layout instability and proportion issues. '
        'Removed entirely. Stream fixed at a clean 230px max-height with overflow-y-auto.',
        S['body']
    ))
    story.append(Spacer(1, 6))
    story.append(change_table([
        ('Slider',          'range input 140–520px in stream header',  'Removed completely'),
        ('Stream height',   'Dynamic via streamHeight state',           'Fixed max-h-[230px]'),
        ('State variable',  'streamHeight useState(230)',               'Removed'),
    ]))

    story.append(Spacer(1, 12))
    story.append(hr())

    # ── MISSION CONTROL ────────────────────────────────────────────────────────
    story.append(Paragraph('2 — Mission Control', S['section']))

    story.append(Paragraph('2.1  Horizontal Slider (Fleet Strips)', S['subsection']))
    story.append(Paragraph(
        'Both the Agent Fleet strip and Gate Summary strip had overflow-x-auto applied, '
        'rendering a horizontal scrollbar that visually looked like a slider and threw '
        'page proportions off. Changed to overflow-x-hidden on both strips.',
        S['body']
    ))

    story.append(Spacer(1, 8))
    story.append(Paragraph('2.2  Bottom Section Layout — Chat · Activity Stream · HeatMap', S['subsection']))
    story.append(Paragraph(
        'The three bottom panels (II Agent Chat, Activity Stream, Subnet Heat Map) went '
        'through multiple iterations to reach final proportions. Key decisions:',
        S['body']
    ))
    story.append(Spacer(1, 4))
    for line in [
        'Chat fixed at w-[560px] — wider for readability, user confirmed good.',
        'Activity Stream and HeatMap both flex-1 — equal symmetric split of remaining width.',
        'Activity Stream: 50-event cap, overflow-hidden on column, events fill the box.',
        'HeatMap: 8×8 grid (ceil(sqrt(64)) columns × rows), gridTemplateRows: repeat(8, 1fr), '
         'h-full on grid — squares fill the full container without stretching.',
        'Layout outlet wrapper fixed: added min-h-0 + overflow-hidden to prevent content '
         'blowing out the page height when event list grows.',
        'MissionControl outer div: h-full → flex-1 for proper flex sizing.',
    ]:
        story.append(bullet(line))
    story.append(Spacer(1, 6))
    story.append(change_table([
        ('Chat width',          'w-[460px]',                           'w-[560px]'),
        ('Activity Stream',     'w-[260px] fixed, 20-event cap',       'flex-1 equal split, 50-event cap, overflow-hidden'),
        ('HeatMap grid',        'repeat(16, 1fr) fixed 92px tiles',    '8×8 1fr rows+cols, fills box, no stretch'),
        ('Fleet strip scroll',  'overflow-x-auto → horizontal slider', 'overflow-x-hidden'),
        ('Height chain',        'Layout outlet: bare flex-1',          'flex-1 min-h-0 overflow-hidden flex flex-col'),
    ]))

    story.append(Spacer(1, 12))
    story.append(Paragraph('2.3  Agent Fleet Header — Badge Sizing', S['subsection']))
    story.append(Paragraph(
        'The Agent Fleet strip header contained six elements all at text-[10px] — '
        'indistinguishable at a glance. Restructured into primary and secondary groups:',
        S['body']
    ))
    story.append(Spacer(1, 4))
    for line in [
        'Agent Fleet label: text-[10px] → text-base font-bold text-white.',
        'Orb: w-2 h-2 → w-3 h-3 with stronger glow shadow.',
        'LIVE badge: text-[10px] px-2 py-0.5 → text-sm px-4 py-1.5 rounded-lg + green glow.',
        'APPROVED badge: same upgrade as LIVE with purple glow.',
        'Gate Enforced removed from top-left panel entirely.',
    ]:
        story.append(bullet(line))

    story.append(Spacer(1, 12))
    story.append(Paragraph('2.4  Card Repositioning — Paper Trading · Gate Enforced · Fleet PnL', S['subsection']))
    story.append(Paragraph(
        'Three info cards were created and placed to match existing card dimensions on their respective rows:',
        S['body']
    ))
    story.append(Spacer(1, 6))
    story.append(change_table([
        ('Paper Trading card',   'Did not exist',                      'Row 1 (BotCards) — w-[148px] BotCard style, shows PAPER count'),
        ('Gate Enforced card',   'Tiny label in top-left panel',       'Row 2 (Gate Summary) — min-w-[130px] h-full chip, shows 4 gate thresholds'),
        ('Fleet PnL card',       'Small text in header right side',    'Row 2 (Gate Summary) — min-w-[130px] h-full chip, shows τ total'),
    ], col_widths=[1.6*inch, 2.4*inch, 2.6*inch]))

    story.append(Spacer(1, 12))
    story.append(hr())

    # ── ACTIVITY LOG ───────────────────────────────────────────────────────────
    story.append(Paragraph('3 — Activity Log', S['section']))

    story.append(Paragraph('3.1  LegendBar Removed', S['subsection']))
    story.append(Paragraph(
        'A LegendBar component rendered as a standalone flex-shrink-0 section between the '
        'header and the first event row — a wide thin bar partially obscuring the top line '
        'of data. Removed entirely. The colour-coded KindBadges on each event row '
        '(TRADE · SIGNAL · GATE · ALERT · SYSTEM) provide sufficient visual context '
        'without a separate legend.',
        S['body']
    ))

    story.append(Spacer(1, 8))
    story.append(Paragraph('3.2  Height Chain Fix', S['subsection']))
    story.append(Paragraph(
        'The outer page div used h-screen which conflicted with the Layout\'s flex chain, '
        'causing the page to fight for full viewport height regardless of the top bar. '
        'Changed to flex-1 flex flex-col so the page properly participates in the '
        'Layout\'s constrained height allocation.',
        S['body']
    ))
    story.append(Spacer(1, 6))
    story.append(change_table([
        ('LegendBar',     'Standalone section between header and events', 'Removed — KindBadges are self-explanatory'),
        ('Outer div',     'h-screen (conflicts with Layout)',              'flex-1 flex flex-col'),
    ]))

    story.append(Spacer(1, 16))
    story.append(hr(ACCENT_G, 1))

    # ── CLOSING ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        'All changes committed · Checkpoint saved · Revision f5bc52ef',
        S['footer']
    ))
    story.append(Paragraph(
        f'Session IX UI Polish — Filed {date.today().strftime("%B %d, %Y")} — The Archives',
        S['footer']
    ))

    doc.build(story)
    print(f'✅  PDF written → {OUTPUT}')

if __name__ == '__main__':
    build()