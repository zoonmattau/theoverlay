import json, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.chart import LineChart, Reference
from openpyxl.drawing.image import Image as XLImage
from openpyxl.drawing.spreadsheet_drawing import OneCellAnchor, AnchorMarker
from openpyxl.drawing.xdr import XDRPositiveSize2D
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.utils import get_column_letter as L

rows = json.load(open('tips.json'))
# Three kinds of bet: a Top Overlay was an early Prime, a Long Overlay a full-unit bet.
TAG = {'prime_overlay': 'Prime', 'top_overlay': 'Prime', 'way_overlay': 'Way', 'long_overlay': 'Bet', 'bet': 'Bet', 'lay': 'Lay'}

# The site's own palette (src/app/globals.css).
INK, PAPER, LIME, LIME_SOFT, GREEN = '14161A', 'F5F7F2', 'C6F24E', 'EDF9C8', '6F9A12'
BLUE, BLUE_SOFT, WAY_SOFT, RED, RED_SOFT = '1F6FD6', 'DCEBFF', 'EEF5FF', 'D93636', 'FFE1E1'
LINE, ALT, MUTED, SOFT = 'DFE3DB', 'F7F8F5', '6B716A', 'A9AEA4'
F = 'Arial'

fill = lambda c: PatternFill('solid', fgColor=c)
font = lambda **k: Font(name=F, **k)
B, BB = font(color=INK), font(color=INK, bold=True)
HEAD = font(bold=True, color=LIME, size=10)
under = Border(bottom=Side(style='thin', color=LINE))
U = '+0.00;-0.00;0.00'
TAG_STYLE = {  # (fill, font colour)
    'Prime': (LIME, INK), 'Bet': (BLUE_SOFT, BLUE), 'Way': (WAY_SOFT, BLUE), 'Lay': (RED_SOFT, RED),
}
TOP = 5  # header row on the data sheets; rows 1 to 4 carry the brand band


def result(x):
    if not x['settled_at']:
        return 'Pending'
    if x['finish_position'] is None:
        return 'Void'
    won = x['finish_position'] == 1
    return ('Win' if won else 'Loss') if x['side'] == 'back' else ('Loss' if won else 'Win')


def band(ws, ncols, title, sub):
    """The ink band with the logo, across the top four rows."""
    for r in range(1, 5):
        ws.row_dimensions[r].height = 22 if r in (1, 4) else 30
        for c in range(1, ncols + 1):
            ws.cell(r, c).fill = fill(INK)
    img = XLImage('logo.png'); img.width, img.height = 210, 53
    px = 9525  # EMU per pixel
    img.anchor = OneCellAnchor(_from=AnchorMarker(col=0, colOff=16 * px, row=0, rowOff=42 * px), ext=XDRPositiveSize2D(210 * px, 53 * px))
    ws.add_image(img)
    t = ws.cell(2, ncols, title); t.font = font(bold=True, size=16, color=PAPER); t.alignment = Alignment(horizontal='right', vertical='bottom')
    s = ws.cell(3, ncols, sub); s.font = font(size=10, color=LIME); s.alignment = Alignment(horizontal='right', vertical='top')
    ws.sheet_view.showGridLines = False


def header(ws, r, labels, left=()):
    for j, h in enumerate(labels, 1):
        c = ws.cell(r, j, h); c.font = HEAD; c.fill = fill(INK)
        c.alignment = Alignment(horizontal='left' if j in left else 'center', vertical='center')
    ws.row_dimensions[r].height = 24


COLS = ['Date', 'Track', 'Race', 'No.', 'Horse', 'Call', 'Tag', 'Rated $', 'Price $', 'Edge', 'Stake (u)', 'Finish', 'Result', 'Profit (u)', 'At risk (u)']
W = [15, 20, 9, 8, 24, 9, 16, 12, 12, 11, 13, 12, 12, 14, 14]


def data_sheet(ws, subset, title, sub):
    band(ws, len(COLS), title, sub)
    header(ws, TOP, COLS, left=(2, 5, 7))
    for k, x in enumerate(subset):
        i = TOP + 1 + k
        fin = x['finish_position']; res = result(x); tag = TAG.get(x['tag'], x['tag'])
        vals = [dt.date.fromisoformat(x['date']), x['track'], x['race_number'], x['tab_number'], x['horse_name'],
                'Bet' if x['side'] == 'back' else 'Lay', tag,
                float(x['rated_price']), float(x['market_price']), float(x['edge']) if x['edge'] is not None else None,
                float(x['stake']), fin if fin else ('Unplaced' if fin == 0 else None), res,
                f'=IF(M{i}="Win",IF(F{i}="Bet",(I{i}-1)*K{i},K{i}),IF(M{i}="Loss",IF(F{i}="Bet",-K{i},-(I{i}-1)*K{i}),IF(M{i}="Void",0,"")))',
                f'=IF(OR(M{i}="Win",M{i}="Loss"),IF(F{i}="Bet",K{i},(I{i}-1)*K{i}),"")']
        zebra = fill(ALT) if k % 2 else None
        for j, v in enumerate(vals, 1):
            c = ws.cell(i, j, v); c.font = B; c.border = under
            c.alignment = Alignment(horizontal='left' if j in (2, 5, 7) else 'center', vertical='center')
            if zebra: c.fill = zebra
        ws.cell(i, 5).font = BB
        ws.cell(i, 6).font = font(bold=True, color=BLUE if x['side'] == 'back' else RED)
        tf, tc = TAG_STYLE.get(tag, (ALT, INK))
        ws.cell(i, 7).fill = fill(tf); ws.cell(i, 7).font = font(bold=True, color=tc, size=9)
        ws.cell(i, 13).font = font(bold=True, color={'Win': GREEN, 'Loss': RED}.get(res, SOFT))
        ws[f'A{i}'].number_format = 'd mmm yyyy'
        for col in 'HI': ws[f'{col}{i}'].number_format = '$0.00'
        ws[f'J{i}'].number_format = '0.0%'; ws[f'K{i}'].number_format = '0.0#'
        ws[f'N{i}'].number_format = U; ws[f'N{i}'].font = BB; ws[f'O{i}'].number_format = '0.00'
    n = TOP + len(subset)
    ws.conditional_formatting.add(f'N{TOP+1}:N{n}', CellIsRule(operator='greaterThan', formula=['0.0001'], font=Font(name=F, bold=True, color=GREEN)))
    ws.conditional_formatting.add(f'N{TOP+1}:N{n}', CellIsRule(operator='lessThan', formula=['-0.0001'], font=Font(name=F, bold=True, color=RED)))
    for i, w in enumerate(W, 1): ws.column_dimensions[L(i)].width = w
    ws.freeze_panes = f'A{TOP+1}'; ws.auto_filter.ref = f'A{TOP}:O{n}'
    t = n + 2
    for j in range(1, 16): ws.cell(t, j).fill = fill(INK)
    c = ws.cell(t, 13, 'Total'); c.font = HEAD; c.alignment = Alignment(horizontal='center')
    c = ws.cell(t, 14, f'=SUM(N{TOP+1}:N{n})'); c.number_format = U; c.font = font(bold=True, color=LIME); c.alignment = Alignment(horizontal='center')
    c = ws.cell(t, 15, f'=SUM(O{TOP+1}:O{n})'); c.number_format = '0.00'; c.font = font(bold=True, color=PAPER); c.alignment = Alignment(horizontal='center')
    ws.row_dimensions[t].height = 24
    return n


dates = sorted({x['date'] for x in rows})
d0, d1 = dt.date.fromisoformat(dates[0]), dt.date.fromisoformat(dates[-1])
PERIOD = f'{d0.day} {d0:%b} to {d1.day} {d1:%b %Y}'

wb = Workbook()
ov = wb.active; ov.title = 'Overview'
allc = wb.create_sheet('All Calls'); bets = wb.create_sheet('Bets'); lays = wb.create_sheet('Lays')
for ws, c in ((ov, LIME), (allc, INK), (bets, BLUE), (lays, RED)): ws.sheet_properties.tabColor = c
n = data_sheet(allc, rows, 'All calls', f'Every bet and lay, {PERIOD}')
data_sheet(bets, [x for x in rows if x['side'] == 'back'], 'Bets', f'Every bet, {PERIOD}')
data_sheet(lays, [x for x in rows if x['side'] == 'lay'], 'Lays', f'Every lay, {PERIOD}')

A = "'All Calls'!"
R = lambda c: f"{A}${c}${TOP+1}:${c}${n}"

# ---- Overview ----
NC = 10
band(ov, NC, 'Results', PERIOD)
ov.column_dimensions['A'].width = 20
for c in 'BCDEFGHIJ': ov.column_dimensions[c].width = 13

# Three headline tiles: All calls, Bets, Lays.
tiles = [('ALL CALLS', '', 'B'), ('BETS', 'Bet', 'E'), ('LAYS', 'Lay', 'H')]
r0 = 6
for label, side, col in tiles:
    ci = ord(col) - 64
    crit = f',{R("F")},"{side}"' if side else ''
    for rr in range(r0, r0 + 4):
        for cc in range(ci, ci + 3): ov.cell(rr, cc).fill = fill(INK if label == 'ALL CALLS' else ALT)
    dark = label == 'ALL CALLS'
    c = ov.cell(r0, ci, label); c.font = font(bold=True, size=9, color=LIME if dark else MUTED)
    c = ov.cell(r0 + 1, ci, f'=SUMIFS({R("N")}{crit})' if side else f'=SUM({R("N")})')
    c.number_format = '+0.0"u";-0.0"u";0.0"u"'; c.font = font(bold=True, size=24, color=LIME if dark else INK)
    ov.merge_cells(start_row=r0 + 1, start_column=ci, end_row=r0 + 2, end_column=ci + 2)
    c.alignment = Alignment(horizontal='left', vertical='center')
    won = f'COUNTIFS({R("M")},"Win"{crit})'; lost = f'COUNTIFS({R("M")},"Loss"{crit})'
    risk = f'SUMIFS({R("O")}{crit})' if side else f'SUM({R("O")})'
    c = ov.cell(r0 + 3, ci, f'={won}+{lost}&" settled, "&TEXT({won}/({won}+{lost}),"0%")&" strike, "&TEXT(IF({risk}=0,0,{c.coordinate}/{risk}),"+0.0%;-0.0%")&" ROI"')
    c.font = font(size=9, color=SOFT if dark else MUTED)
for rr in range(r0, r0 + 4): ov.row_dimensions[rr].height = 20
ov.conditional_formatting.add('E7', CellIsRule(operator='lessThan', formula=['0'], font=Font(name=F, bold=True, size=24, color=RED)))
ov.conditional_formatting.add('H7', CellIsRule(operator='lessThan', formula=['0'], font=Font(name=F, bold=True, size=24, color=RED)))

ov.cell(11, 1, 'Level stakes: one unit a call, a tenth on a Way. Bets settle at the best of fixed odds, SP and BSP; lays at the shortest lay price or BSP.').font = font(size=9, color=MUTED)
ov.cell(12, 1, "A lay wins one unit when the horse loses and risks the price less one. ROI is profit over units at risk. Scratchings and abandoned races are void.").font = font(size=9, color=MUTED)

ov.cell(13, 1, 'Bets at $10 or more from 11 to 15 Sep are excluded: our ratings over-priced long shots until the 15 Sep fix.').font = font(size=9, color=MUTED)

hdr = ['', 'Calls', 'Won', 'Lost', 'Void', 'Pending', 'Strike', 'Profit (u)', 'At risk (u)', 'ROI']


def section(r, title):
    c = ov.cell(r, 1, title.upper()); c.font = font(bold=True, size=11, color=GREEN)
    ov.row_dimensions[r].height = 22


def stat_row(r, label, crit, k):
    cs = ''.join(f',{R(c)},{v}' for c, v in crit)
    if label is not None: ov.cell(r, 1, label)
    ov.cell(r, 2, f'=COUNTIFS({R("M")},"<>"{cs})')
    for j, res in zip((3, 4, 5, 6), ('Win', 'Loss', 'Void', 'Pending')):
        ov.cell(r, j, f'=COUNTIFS({R("M")},"{res}"{cs})')
    ov.cell(r, 7, f'=IF(C{r}+D{r}=0,"",C{r}/(C{r}+D{r}))').number_format = '0.0%'
    ov.cell(r, 8, f'=SUMIFS({R("N")}{cs})' if crit else f'=SUM({R("N")})').number_format = U
    ov.cell(r, 9, f'=SUMIFS({R("O")}{cs})' if crit else f'=SUM({R("O")})').number_format = '0.00'
    ov.cell(r, 10, f'=IF(I{r}=0,"",H{r}/I{r})').number_format = '+0.0%;-0.0%;0.0%'
    for j in range(1, NC + 1):
        c = ov.cell(r, j); c.border = under; c.font = BB if j in (1, 8) else B
        c.alignment = Alignment(horizontal='left' if j == 1 else 'center', vertical='center')
        if k % 2: c.fill = fill(ALT)
    ov.row_dimensions[r].height = 20


def colour_profit(rng):
    ov.conditional_formatting.add(rng, CellIsRule(operator='greaterThan', formula=['0.0001'], font=Font(name=F, bold=True, color=GREEN)))
    ov.conditional_formatting.add(rng, CellIsRule(operator='lessThan', formula=['-0.0001'], font=Font(name=F, bold=True, color=RED)))


r = 14
section(r, 'By call'); r += 1
header(ov, r, hdr); r += 1; s = r
for k, (lab, crit) in enumerate([('All calls', []), ('Bets', [('F', '"Bet"')]), ('Lays', [('F', '"Lay"')])]):
    stat_row(r, lab, crit, k); r += 1
colour_profit(f'H{s}:H{r-1}'); colour_profit(f'J{s}:J{r-1}')
r += 1

section(r, 'By tag'); r += 1
header(ov, r, ['Tag'] + hdr[1:], left=(1,)); r += 1; s = r
for k, t in enumerate(['Prime', 'Bet', 'Way', 'Lay']):
    stat_row(r, t, [('G', f'"{t}"')], k)
    tf, tc = TAG_STYLE[t]; ov.cell(r, 1).fill = fill(tf); ov.cell(r, 1).font = font(bold=True, color=tc)
    r += 1
colour_profit(f'H{s}:H{r-1}'); colour_profit(f'J{s}:J{r-1}')
r += 1

section(r, 'By week'); r += 1
header(ov, r, ['Week of'] + hdr[1:], left=(1,)); r += 1; s = r
mon = d0 - dt.timedelta(days=d0.weekday()); k = 0
while mon <= d1:
    ov.cell(r, 1, mon)
    stat_row(r, None, [('A', f'">="&$A{r}'), ('A', f'"<"&($A{r}+7)')], k)
    ov.cell(r, 1).number_format = 'd mmm'
    r += 1; k += 1; mon += dt.timedelta(days=7)
colour_profit(f'H{s}:H{r-1}'); colour_profit(f'J{s}:J{r-1}')
r += 1

section(r, 'By day'); r += 1
header(ov, r, ['Date', 'Settled', 'Bets (u)', 'Lays (u)', 'Day (u)', 'Running (u)'], left=(1,)); r += 1
first = r
for k, d in enumerate(dates):
    ov.cell(r, 1, dt.date.fromisoformat(d)).number_format = 'ddd d mmm'
    ov.cell(r, 2, f'=COUNTIFS({R("A")},$A{r},{R("M")},"<>Pending")')
    ov.cell(r, 3, f'=SUMIFS({R("N")},{R("A")},$A{r},{R("F")},"Bet")').number_format = U
    ov.cell(r, 4, f'=SUMIFS({R("N")},{R("A")},$A{r},{R("F")},"Lay")').number_format = U
    ov.cell(r, 5, f'=C{r}+D{r}').number_format = U
    ov.cell(r, 6, f'=E{r}' if r == first else f'=F{r-1}+E{r}').number_format = U
    for j in range(1, 7):
        c = ov.cell(r, j); c.font = BB if j == 6 else B; c.border = under
        c.alignment = Alignment(horizontal='center' if j > 1 else 'left', vertical='center')
        if k % 2: c.fill = fill(ALT)
    r += 1
last = r - 1
colour_profit(f'C{first}:F{last}')

ch = LineChart(); ch.title = 'Running profit (units)'; ch.height = 9; ch.width = 22
ch.add_data(Reference(ov, min_col=6, min_row=first - 1, max_row=last), titles_from_data=True)
ch.set_categories(Reference(ov, min_col=1, min_row=first, max_row=last))
ch.x_axis.number_format = 'd mmm'; ch.legend = None
ch.x_axis.delete = False; ch.y_axis.delete = False; ch.y_axis.number_format = '+0;-0;0'; ch.x_axis.tickLblPos = 'low'
sr = ch.series[0]; sr.graphicalProperties.line.solidFill = GREEN; sr.graphicalProperties.line.width = 32000; sr.smooth = False
ov.add_chart(ch, 'L6')

ov.cell(last + 2, 1, 'theoverlay.com.au   18+   Gamble responsibly: 1800 858 858').font = font(size=9, color=MUTED)
wb.calculation.fullCalcOnLoad = True
wb.save('../Overlay results.xlsx')
