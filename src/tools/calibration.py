"""Generate calibration SensorPanels that check, inside AIDA64, the assumptions the designer relies on:
where GDI puts SIMPLE text for each font, how centred gauge values sit, which gauge state shows at a
boundary, PNG alpha, RESIZW, graph flags, native items and label macros, and which .spzip variants
AIDA64 accepts at 100 % and 200 % Windows scale.

Writes src/tools/out/calibration/:
  Calibration_100.sensorpanel          SPVER 100, 3840 x 2160
  Calibration_200pct.sensorpanel       the same with positions, sizes and text halved (Windows scale 200 %)
  Calibration_A_deflate.spzip          SPVER 200: a .sp2 plus PNG files, every entry deflated
  Calibration_B_stored.spzip           as A, PNG entries stored
  Calibration_C_extras.spzip           as A, plus preview.png and designer.json
  Calibration_D_200pct.spzip           halved for 200 %, images at full size, no RESIZW
  Calibration_E_200pct_resize.spzip    halved for 200 %, RESIZW/RESIZH = natural size / 2 on images and gauges
  README.txt                           steps for the person running AIDA64
  png/                                 every image, plus a rough simulation of the 100 % panel

Run:  uv run --with pillow python src/tools/calibration.py
"""
import datetime
import io
import json
import math
import os
import re
import zipfile

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'src', 'tools', 'out', 'calibration')
W, H = 3840, 2160
UI_FONT = os.path.join(ROOT, 'src', 'fonts', 'selawik', 'Selawik-{}.ttf')
WIN_FONTS = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts')

# background colours: everything static stays dim (OLED), test glyphs are white
GRID, GRID5 = (26, 29, 34), (44, 49, 56)
LABEL, TEXT, TITLE = (88, 96, 106), (128, 137, 147), (170, 178, 188)
TOP, BASE, BOTTOM = (46, 125, 50), (198, 40, 40), (21, 101, 192)    # predicted cell top, baseline, cell bottom
ANCHOR, END, OUTLINE = (150, 150, 150), (200, 120, 40), (70, 76, 84)  # ITMX/ITMY, predicted glyph end, item bounds
WHITE, GREY = (255, 255, 255), (128, 128, 128)
GR_LINE, GR_GRID, GR_BG, GR_FRAME = (0, 230, 255), (0, 90, 0), (0, 0, 90), (255, 140, 0)


def ui_font(px, bold=False):
    return ImageFont.truetype(UI_FONT.format('Bold' if bold else 'Regular'), px)


def load_metrics():
    txt = open(os.path.join(ROOT, 'src', 'shared', 'fontmetrics.js'), encoding='utf-8').read()
    return {m.group(1): json.loads(m.group(2)) for m in re.finditer(r'^\s*"([^"]+)":\s*(\{[^{}]*\})', txt, re.M)}


METRICS = load_metrics()


def em_px(pt):
    """GDI font height in pixels for a size in points (lfHeight = -MulDiv(pt, 96, 72))."""
    return int(math.floor(pt * 96 / 72 + 0.5))


def cell(font, pt):
    m, px = METRICS[font], em_px(pt)
    return m['asc'] * px, m['desc'] * px, px


def bgr(rgb):
    r, g, b = rgb
    return r + (g << 8) + (b << 16)


def fmt_num(v):
    s = f'{v:.6f}'.rstrip('0').rstrip('.')
    return s if s not in ('-0', '') else '0'


# ---------------------------------------------------------------- items (design coordinates, draw order)
ITEMS = []
IMAGES = {}  # name -> PIL image (everything except the background, which is drawn per variant)


def divider(text):
    ITEMS.append(dict(kind='DIV', text=text))


def simple(sensor, label, font, pt, x, y, right=False, col=WHITE):
    ITEMS.append(dict(kind='SIMPLE', sensor=sensor, label=label, font=font, pt=pt, x=x, y=y, right=right, col=col))


def gauge(sensor, label, lo, hi, x, y, frames, showval=False, pt=None, font='Tahoma', col=WHITE):
    assert len(frames) == 16
    ITEMS.append(dict(kind='GAUGE', sensor=sensor, label=label, lo=lo, hi=hi, x=x, y=y, frames=frames,
                      showval=showval, pt=pt, font=font, col=col))


def image(name, x, y, resize=None, bg=False):
    ITEMS.append(dict(kind='IMG', name=name, x=x, y=y, resize=resize, bg=bg))


def graph(sensor, label, x, y, w, h, flags):
    ITEMS.append(dict(kind='GRAPH', sensor=sensor, label=label, x=x, y=y, w=w, h=h, flags=flags))


def label(text, font, pt, x, y, col=WHITE):
    ITEMS.append(dict(kind='LBL', text=text, font=font, pt=pt, x=x, y=y, col=col))


def sensor_item(sensor, x, y):
    ITEMS.append(dict(kind='SITEM', sensor=sensor, x=x, y=y))


# ---------------------------------------------------------------- background guides
BASE_IMG = Image.new('RGB', (W, H), (0, 0, 0))
D = ImageDraw.Draw(BASE_IMG)


def hline(x0, x1, y, col, w=1):
    y = int(round(y))
    D.rectangle([x0, y, x1, y + w - 1], fill=col)


def vline(x, y0, y1, col, w=1):
    x = int(round(x))
    D.rectangle([x, int(round(y0)), x + w - 1, int(round(y1))], fill=col)


def rect_outline(x0, y0, x1, y1, col, dash=0):
    if not dash:
        D.rectangle([x0, y0, x1, y1], outline=col)
        return
    for x in range(x0, x1 + 1, dash * 2):
        D.line([(x, y0), (min(x + dash - 1, x1), y0)], fill=col)
        D.line([(x, y1), (min(x + dash - 1, x1), y1)], fill=col)
    for y in range(y0, y1 + 1, dash * 2):
        D.line([(x0, y), (x0, min(y + dash - 1, y1))], fill=col)
        D.line([(x1, y), (x1, min(y + dash - 1, y1))], fill=col)


def text(x, y, s, px=20, col=TEXT, anchor='la', bold=False):
    D.text((x, y), s, font=ui_font(px, bold), fill=col, anchor=anchor)


def text_guides(xa, xb, x, top, font, pt, right=False, trailing_space=True):
    """Predicted top (green), baseline (red), bottom (blue) of a GDI text cell starting at ITMY = top."""
    asc, desc, px = cell(font, pt)
    hline(xa, xb, top, TOP)
    hline(xa, xb, top + asc, BASE)
    hline(xa, xb, top + asc + desc, BOTTOM)
    vline(x, top - 12, top + asc + desc + 12, ANCHOR)
    if right and trailing_space:
        # the label ends in a space, so the visible "y" should stop one space width before ITMX
        vline(x - METRICS[font]['space'] * px, top - 6, top + asc + desc + 6, END)


def draw_grid():
    for x in range(0, W, 100):
        vline(x, 0, H - 1, GRID5 if x % 500 == 0 else GRID)
    for y in range(0, H, 100):
        hline(0, W - 1, y, GRID5 if y % 500 == 0 else GRID)
    for x in range(500, W, 500):
        text(x + 4, 2, str(x), 16, LABEL)
    for y in range(500, H, 500):
        text(4, y + 2, str(y), 16, LABEL)


draw_grid()
# the title strip gets its text per variant; keep it clean of grid lines
D.rectangle([40, 30, 2400, 140], fill=(0, 0, 0))
text(48, 108, 'Grid: 100 px, brighter every 500 px. Coordinates are physical pixels of the 3840 x 2160 panel.', 22, LABEL)


# ---------------------------------------------------------------- block 1: SIMPLE text metrics
FONTS_1 = ['Segoe UI', 'Segoe UI Light', 'Bahnschrift', 'Bahnschrift Light', 'Consolas', 'Tahoma', 'Arial']
SIZES_1 = [(12, 260), (24, 320), (48, 420), (96, 560)]
divider('===== BLOCK 1: SIMPLE text metrics =====')
text(40, 168, '1  SIMPLE text on SREGVALS1 (Str1 set to empty), label "Hxgy ", left-aligned at the grey line.'
     '  Green = predicted cell top (ITMY), red = baseline, blue = cell bottom.', 22, TEXT)
for pt, y in SIZES_1:
    text(40, y + 2, f'{pt} pt', 20, TEXT)
for i, font in enumerate(FONTS_1):
    colx = 160 + i * 400
    text(colx + 8, 212, font, 22, TITLE)
    for pt, y in SIZES_1:
        x = colx + 24
        simple('SREGVALS1', 'Hxgy ', font, pt, x, y)
        text_guides(colx + 8, colx + 388, x, y, font, pt)

# ---------------------------------------------------------------- block 2: right-aligned SIMPLE
divider('===== BLOCK 2: right-aligned SIMPLE =====')
text(3000, 168, '2  Right-aligned SIMPLE (TXTBIR 001)', 22, TEXT)
text(3000, 196, 'Grey line = ITMX (right edge). Orange = predicted end of "y"', 20, LABEL)
text(3000, 220, '(the label ends in a space).', 20, LABEL)
for font, y in [('Segoe UI', 300), ('Bahnschrift', 470)]:
    simple('SREGVALS1', 'Hxgy ', font, 48, 3600, y, right=True)
    text_guides(3200, 3760, 3600, y, font, 48, right=True)
    text(3010, y + 24, f'{font}', 20, TITLE)
    text(3010, y + 50, '48 pt', 20, TEXT)

# ---------------------------------------------------------------- block 3: centred values
divider('===== BLOCK 3: centred gauge values =====')
text(40, 818, '3  Centred value: GAUGE on SREGVALD1 with 16 empty frames and SHWVAL 1. The crosshair is ITMX/ITMY.'
     '  Guides assume the text cell is centred on ITMY.', 22, TEXT)
for font, pt, cx in [('Segoe UI Light', 128, 560), ('Bahnschrift Light', 112, 1400)]:
    cy = 1060
    gauge('SREGVALD1', 'Registry Value DW1', 0, 100, cx, cy, [''] * 16, showval=True, pt=pt, font=font)
    asc, desc, px = cell(font, pt)
    top = cy - (asc + desc) / 2
    hline(cx - 320, cx + 320, cy, ANCHOR)
    vline(cx, cy - 150, cy + 150, ANCHOR)
    hline(cx - 280, cx + 280, top, TOP)
    hline(cx - 280, cx + 280, top + asc, BASE)
    hline(cx - 280, cx + 280, top + asc + desc, BOTTOM)
    text(cx - 320, 870, f'{font} {pt} pt', 20, TITLE)

# ---------------------------------------------------------------- block 4: gauge boundary
STATE_FRAMES = [f'cal_state_{n:02d}.png' for n in range(16)]
for n, name in enumerate(STATE_FRAMES):
    im = Image.new('RGB', (160, 100), (24, 27, 31))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 159, 99], outline=(60, 66, 74))
    d.text((80, 50), f'{n:02d}', font=ui_font(64, True), fill=WHITE, anchor='mm')
    IMAGES[name] = im
divider('===== BLOCK 4: gauge state at a boundary =====')
text(2000, 818, '4  Gauge state on SREGVALD1 (DW1)', 22, TEXT)
text(2000, 846, 'state = floor((v - min) / (max - min) x 15), clamped 0..15', 20, LABEL)
for x, hi in [(2040, 30), (2260, 15)]:
    gauge('SREGVALD1', 'Registry Value DW1', 0, hi, x, 910, STATE_FRAMES)
    rect_outline(x - 2, 908, x + 161, 1011, OUTLINE)
    text(x, 880, f'range 0 - {hi}', 20, TITLE)
COLS_4 = [(2490, 'DW1'), (2580, '0-30 floor'), (2720, '0-30 round'), (2870, '0-15')]
for x, head in COLS_4:
    text(x, 880, head, 20, TITLE)
for i, row in enumerate([(0, 0, 0, 0), (2, 1, 1, 2), (3, 1, 2, 3), (30, 15, 15, 15), (31, 15, 15, 15)]):
    for (x, _), v in zip(COLS_4, row):
        text(x, 912 + i * 28, str(v), 20, TEXT)
text(2000, 1060, 'Both gauges read the same value. The left one shows whether AIDA64 floors or rounds', 20, LABEL)
text(2000, 1086, 'at v = 3 (1.5 states). v = 31 checks the clamp above the range.', 20, LABEL)

# ---------------------------------------------------------------- block 5: images
alpha = Image.new('RGBA', (240, 240), (0, 0, 0, 0))
px_alpha = alpha.load()
for yy in range(240):
    for xx in range(240):
        dd = math.hypot(xx - 120 + .5, yy - 120 + .5)
        if dd < 110:
            px_alpha[xx, yy] = (255, 255, 255, int(round(255 * (1 - dd / 110))))
for yy in range(150, 230):
    for xx in range(150, 230):
        px_alpha[xx, yy] = (255, 255, 255, 128)
IMAGES['cal_alpha.png'] = alpha
checker = Image.new('RGB', (200, 200), (40, 44, 50))
dc = ImageDraw.Draw(checker)
for yy in range(0, 200, 20):
    for xx in range(0, 200, 20):
        if (xx // 20 + yy // 20) % 2:
            dc.rectangle([xx, yy, xx + 19, yy + 19], fill=(110, 118, 128))
dc.rectangle([0, 0, 199, 199], outline=(200, 120, 40))
IMAGES['cal_checker.png'] = checker
divider('===== BLOCK 5: images =====')
text(3000, 818, '5  Images: RGBA alpha over stripes (left)', 22, TEXT)
text(3000, 846, 'Right: 200 x 200 checker with RESIZW 400, RESIZH 100.', 20, LABEL)
for k, col in enumerate([(120, 30, 30), (30, 120, 30), (30, 30, 120), (90, 90, 90)] * 2):
    D.rectangle([3020 + k * 30, 880, 3020 + k * 30 + 29, 1119], fill=col)
image('cal_alpha.png', 3020, 880)
image('cal_checker.png', 3300, 900, resize=(400, 100))
rect_outline(3298, 898, 3701, 1001, BASE, dash=6)
rect_outline(3296, 896, 3503, 1103, BOTTOM, dash=3)
text(3300, 1110, 'red dashes: 400 x 100 if RESIZW works', 18, LABEL)
text(3300, 1134, 'blue dots: 200 x 200 natural size', 18, LABEL)

# ---------------------------------------------------------------- block 6: graphs
divider('===== BLOCK 6: graph flags =====')
text(40, 1338, '6  GRAPH on SCPUUTI, 600 x 200. Cyan line, dark green grid, dark blue background, orange frame.'
     '  Grey box = item bounds.', 22, TEXT)
for x, flags in [(60, '000'), (760, '111')]:
    graph('SCPUUTI', 'CPU Utilization', x, 1400, 600, 200, flags)
    rect_outline(x - 3, 1397, x + 602, 1602, OUTLINE)
    text(x, 1616, f'GPHBFG {flags}', 20, TITLE)

# ---------------------------------------------------------------- block 7: native items
divider('===== BLOCK 7: native items =====')
text(1560, 1338, '7  Native AIDA64 items: sensor item and label macros', 22, TEXT)
sensor_item('SCPUUTI', 1580, 1400)
vline(1580, 1388, 1470, ANCHOR)
hline(1568, 1990, 1400, ANCHOR)
vline(1980, 1388, 1470, OUTLINE)
text(2000, 1404, 'Sensor item SCPUUTI: WID 400 (grey line = right edge),', 18, LABEL)
text(2000, 1428, 'label CPU, unit %, 200 x 15 bar, BARPLC BVU.', 18, LABEL)
for y, macro in [(1500, '$CPUMODEL'), (1570, '$GPU1MODEL')]:
    label(macro, 'Segoe UI', 24, 1580, y)
    text_guides(1568, 2560, 1580, y, 'Segoe UI', 24, trailing_space=False)
    text(2600, y + 4, f'LBL "{macro}", Segoe UI 24 pt', 18, LABEL)

# ---------------------------------------------------------------- block 8: long hidden label
divider('===== BLOCK 8: long hidden label =====')
ITEMS.append(dict(kind='DIV', text='0123456789ABCDEF' * 1250))
text(3000, 1338, '8  Hidden divider label (-LBL), 20,000 characters.', 22, TEXT)
text(3000, 1366, 'Nothing to see. Export the panel to check it survives.', 20, LABEL)

# ---------------------------------------------------------------- legend
LEGEND = [
    ('Colours:  green = predicted text cell top (ITMY)   red = predicted baseline   blue = predicted cell bottom'
     '   grey = anchor (ITMX / ITMY)   orange = predicted end of the visible text', TEXT),
    ('Predictions use OS/2 usWinAscent / usWinDescent and em px = round(pt x 96 / 72).', LABEL),
    (r'Test values:  reg add HKCU\Software\FinalWire\AIDA64\ImportValues /v DW1 /t REG_DWORD /d <n> /f'
     r'   and   /v Str1 /t REG_SZ /d "" /f', LABEL),
]
for i, (s, col) in enumerate(LEGEND):
    text(40, 1800 + i * 36, s, 22, col)
legend_variant_y = 1800 + len(LEGEND) * 36 + 12


# ---------------------------------------------------------------- variants
def background(title, note):
    im = BASE_IMG.copy()
    d = ImageDraw.Draw(im)
    d.text((48, 44), f'AIDA64 CALIBRATION  \u00b7  {title}', font=ui_font(44, True), fill=TITLE, anchor='la')
    d.text((40, legend_variant_y), note, font=ui_font(22), fill=TEXT, anchor='la')
    return im


VARIANTS = {
    '100': ('Calibration_100.sensorpanel', 'sp100', 1, False,
            'This file: SPVER 100, positions as designed. Import it with Windows scale at 100 %.'),
    '200pct': ('Calibration_200pct.sensorpanel', 'sp100', 2, False,
               'This file: SPVER 100, positions, sizes and text halved for Windows scale 200 %. Images keep their pixel size.'),
    'A': ('Calibration_A_deflate.spzip', 'sp200', 1, False,
          'This file: .spzip (SPVER 200), every zip entry deflated, background BGIMG 1.'),
    'B': ('Calibration_B_stored.spzip', 'sp200', 1, False,
          'This file: .spzip (SPVER 200), PNG entries stored without compression.'),
    'C': ('Calibration_C_extras.spzip', 'sp200', 1, False,
          'This file: .spzip (SPVER 200) with extra preview.png and designer.json entries.'),
    'D': ('Calibration_D_200pct.spzip', 'sp200', 2, False,
          'This file: .spzip (SPVER 200), halved for 200 %, images at their pixel size, no RESIZW added.'),
    'E': ('Calibration_E_200pct_resize.spzip', 'sp200', 2, True,
          'This file: .spzip (SPVER 200), halved for 200 %, RESIZW/RESIZH = natural size / 2 on every image and gauge.'),
}


def png_bytes(im):
    b = io.BytesIO()
    im.save(b, 'PNG', optimize=True)
    return b.getvalue()


def serialize(it, s, fmt, resize_all, png, sizes):
    P = lambda v: int(math.floor(v / s + .5))          # same rounding as the builder's Math.round
    T = lambda pt: max(1, int(math.floor(pt / s + .5)))
    k = it['kind']
    pos = f'<ITMX>{P(it["x"])}</ITMX><ITMY>{P(it["y"])}</ITMY>' if 'x' in it else ''
    if k == 'DIV':
        return (f'<ID>-LBL</ID><TXTSIZ>8</TXTSIZ><FNTNAM></FNTNAM><LBL>{it["text"]}</LBL><LBLCOL>16777215</LBLCOL>'
                '<LBLBIS>000</LBLBIS><SHDCOL>0</SHDCOL><SHDDIS>1</SHDDIS><SHDDEP>1</SHDDEP><URL></URL><ITMX>0</ITMX><ITMY>0</ITMY>')
    if k == 'IMG':
        name = it['name']
        rs = None
        if it['resize']:
            rs = (P(it['resize'][0]), P(it['resize'][1]))
        elif resize_all and not it['bg']:
            rs = (P(sizes[name][0]), P(sizes[name][1]))
        resize = f'<RESIZW>{rs[0]}</RESIZW><RESIZH>{rs[1]}</RESIZH>' if rs else ''
        if fmt == 'sp100':
            if rs:   # tag set of a 7.50 .sensorpanel IMG that uses RESIZW
                return f'<ID>IMG</ID><BGIMG>0</BGIMG>{resize}{pos}<IMGFIL>{name}</IMGFIL><IMGDAT>{png[name].hex().upper()}</IMGDAT>'
            return f'<ID>IMG</ID><URL></URL>{pos}<IMGFIL>{name}</IMGFIL><IMGDAT>{png[name].hex().upper()}</IMGDAT>'
        return f'<ID>IMG</ID><BGIMG>{1 if it["bg"] else 0}</BGIMG>{resize}{pos}<IMGFIL>{name}</IMGFIL>'
    if k == 'GAUGE':
        fr = it['frames']
        resize = ''
        if fmt == 'sp200' and resize_all and any(fr):
            nat = sizes[next(f for f in fr if f)]
            resize = f'<RESIZW>{P(nat[0])}</RESIZW><RESIZH>{P(nat[1])}</RESIZH>'
        return (f'<ID>[GAUGE]{it["sensor"]}</ID><LBL>{it["label"]}</LBL><TYP>Custom</TYP><SIZ>S</SIZ>{resize}'
                f'<MINVAL>{fmt_num(it["lo"])}</MINVAL><MAXVAL>{fmt_num(it["hi"])}</MAXVAL><SHWICO>0</SHWICO>'
                f'<SHWVAL>{1 if it["showval"] else 0}</SHWVAL><TXTSIZ>{T(it["pt"]) if it["showval"] else 8}</TXTSIZ>'
                f'<FNTNAM>{it["font"]}</FNTNAM><VALCOL>{bgr(it["col"])}</VALCOL><VALBI>00</VALBI>{pos}'
                f'<STAFLS>{"|".join(fr)}</STAFLS>')
    if k == 'SIMPLE':
        return (f'<ID>[SIMPLE]{it["sensor"]}</ID><TXTSIZ>{T(it["pt"])}</TXTSIZ><FNTNAM>{it["font"]}</FNTNAM>'
                f'<TXTCOL>{bgr(it["col"])}</TXTCOL><TXTBIR>00{1 if it["right"] else 0}</TXTBIR><SHWLBL>1</SHWLBL>'
                f'<LBL>{it["label"]}</LBL><SHWUNT>0</SHWUNT><UNT></UNT>{pos}')
    if k == 'GRAPH':
        return (f'<ID>[GRAPH]{it["sensor"]}</ID><LBL>{it["label"]}</LBL><TYP>LG</TYP><WID>{P(it["w"])}</WID>'
                f'<HEI>{P(it["h"])}</HEI><GPHSTP>3</GPHSTP><GPHTCK>3</GPHTCK><GRDDNS>40</GRDDNS><MINVAL>0</MINVAL>'
                f'<MAXVAL>100</MAXVAL><AUTSCL>0</AUTSCL><GRDCOL>{bgr(GR_GRID)}</GRDCOL><GPHCOL>{bgr(GR_LINE)}</GPHCOL>'
                f'<BGCOL>{bgr(GR_BG)}</BGCOL><FRMCOL>{bgr(GR_FRAME)}</FRMCOL><GPHBFG>{it["flags"]}</GPHBFG><SHWSCL>0</SHWSCL>'
                f'<TXTSIZ>8</TXTSIZ><FNTNAM>Segoe UI</FNTNAM><SCLCOL>{bgr(GREY)}</SCLCOL><SCLBI>000</SCLBI>{pos}')
    if k == 'LBL':
        return (f'<ID>LBL</ID><TXTSIZ>{T(it["pt"])}</TXTSIZ><FNTNAM>{it["font"]}</FNTNAM><LBL>{it["text"]}</LBL>'
                f'<LBLCOL>{bgr(it["col"])}</LBLCOL><LBLBIS>000</LBLBIS><SHDCOL>0</SHDCOL><SHDDIS>1</SHDDIS><SHDDEP>1</SHDDEP>'
                f'<URL></URL>{pos}')
    if k == 'SITEM':   # tag order copied from AIDA64's own sample panel
        tags = [('WID', P(400)), ('TXTSIZ', T(16)), ('FNTNAM', 'Segoe UI'), ('SHDCOL', 0), ('SHDDIS', 1), ('SHDDEP', 1),
                ('SHWLBL', 1), ('LBL', 'CPU'), ('LBLCOL', bgr(WHITE)), ('LBLBIS', '000'), ('SHWVAL', 1),
                ('VALCOL', bgr(WHITE)), ('VALBIS', '000'), ('SHWUNT', 1), ('UNT', '%'), ('UNTCOL', bgr(GREY)),
                ('UNTBIS', '000'), ('UNTWID', P(40)), ('SHWBAR', 1), ('BARWID', P(200)), ('BARHEI', P(15)),
                ('BARIND', 0), ('BARPLC', 'BVU'), ('BARFS', '0000'), ('BARFRMCOL', 6710886), ('BARMIN', 0),
                ('BARLIM1', 50), ('BARLIM2', 75), ('BARLIM3', 90), ('BARMAX', 100),
                ('BARMINFGC', 57088), ('BARMINBGC', 3355443), ('BARLIM1FGC', 63743), ('BARLIM1BGC', 3355443),
                ('BARLIM2FGC', 36863), ('BARLIM2BGC', 3355443), ('BARLIM3FGC', 255), ('BARLIM3BGC', 3355443)]
        return f'<ID>{it["sensor"]}</ID>' + ''.join(f'<{a}>{b}</{a}>' for a, b in tags) + pos
    raise ValueError(k)


def build_lines(items, s, fmt, resize_all, png, sizes):
    head = ('<SPVER>100</SPVER><SWVER>7.35.7000</SWVER>' if fmt == 'sp100'
            else '<SPVER>200</SPVER><SWVER>7.50.7200</SWVER>')
    lines = [head, f'<SPWIDTH>{int(math.floor(W / s + .5))}</SPWIDTH><SPHEIGHT>{int(math.floor(H / s + .5))}</SPHEIGHT>'
                   '<SPBGCOLOR>0</SPBGCOLOR>']
    lines += [serialize(it, s, fmt, resize_all, png, sizes) for it in items]
    if fmt == 'sp100':
        used = sorted({f for it in items if it['kind'] == 'GAUGE' for f in it['frames'] if f})
        lines += [f'<GAUSTAFNM>{n}</GAUSTAFNM><GAUSTADAT>{png[n].hex().upper()}</GAUSTADAT>' for n in used]
    return lines


def encode(lines):
    return ('\r\n'.join(lines) + '\r\n').encode('cp1252')


def simulate(bg):
    """Rough picture of the 100 % panel (Windows fonts drawn on the predicted baselines) to check the layout."""
    im = bg.convert('RGBA')
    d = ImageDraw.Draw(im)
    for it in ITEMS:
        k = it['kind']
        if k == 'IMG' and not it['bg']:
            src = IMAGES[it['name']].convert('RGBA')
            if it['resize']:
                src = src.resize(it['resize'])
            im.alpha_composite(src, (it['x'], it['y']))
        elif k == 'GAUGE' and any(it['frames']):
            im.alpha_composite(IMAGES[it['frames'][2]].convert('RGBA'), (it['x'], it['y']))
        elif k == 'GAUGE':
            asc, desc, px = cell(it['font'], it['pt'])
            f = win_font(it['font'], px)
            d.text((it['x'], it['y'] - (asc + desc) / 2 + asc), '30', font=f, fill=WHITE, anchor='ms')
        elif k == 'SIMPLE':
            asc, desc, px = cell(it['font'], it['pt'])
            f = win_font(it['font'], px)
            d.text((it['x'], it['y'] + asc), it['label'], font=f, fill=WHITE, anchor='rs' if it['right'] else 'ls')
        elif k == 'GRAPH':
            d.rectangle([it['x'], it['y'], it['x'] + it['w'] - 1, it['y'] + it['h'] - 1], outline=GR_FRAME)
        elif k == 'LBL':
            asc, desc, px = cell(it['font'], it['pt'])
            d.text((it['x'], it['y'] + asc), 'Intel Core i7-14700K', font=win_font(it['font'], px), fill=WHITE, anchor='ls')
        elif k == 'SITEM':
            asc, desc, px = cell('Segoe UI', 16)
            d.text((it['x'], it['y'] + asc), 'CPU          37 %', font=win_font('Segoe UI', px), fill=WHITE, anchor='ls')
    return im.convert('RGB')


WIN_FILES = {'Segoe UI': 'segoeui.ttf', 'Segoe UI Light': 'segoeuil.ttf', 'Bahnschrift': 'bahnschrift.ttf',
             'Bahnschrift Light': 'bahnschrift.ttf', 'Consolas': 'consola.ttf', 'Tahoma': 'tahoma.ttf', 'Arial': 'arial.ttf'}


def win_font(name, px):
    path = os.path.join(WIN_FONTS, WIN_FILES.get(name, 'segoeui.ttf'))
    try:
        f = ImageFont.truetype(path, px)
        if name == 'Bahnschrift Light':
            try:
                f.set_variation_by_name('Light')
            except Exception:
                pass
        return f
    except OSError:
        return ui_font(px)


def main():
    os.makedirs(os.path.join(OUT, 'png'), exist_ok=True)
    items = [dict(kind='IMG', name='background.png', x=0, y=0, resize=None, bg=True)] + ITEMS
    shared_png = {n: png_bytes(im) for n, im in IMAGES.items()}
    sizes = {n: im.size for n, im in IMAGES.items()}
    sizes['background.png'] = (W, H)
    for n, b in shared_png.items():
        open(os.path.join(OUT, 'png', n), 'wb').write(b)
    sp2_name = f'{datetime.date.today().isoformat()}.sp2'
    report = []
    for key, (fname, fmt, s, resize_all, note) in VARIANTS.items():
        bg = background(fname, note)
        png = dict(shared_png, **{'background.png': png_bytes(bg)})
        open(os.path.join(OUT, 'png', f'background_{key}.png'), 'wb').write(png['background.png'])
        lines = build_lines(items, s, fmt, resize_all, png, sizes)
        data = encode(lines)
        path = os.path.join(OUT, fname)
        if fmt == 'sp100':
            open(path, 'wb').write(data)
        else:
            names = ['background.png'] + sorted({it['name'] for it in ITEMS if it['kind'] == 'IMG'}) + \
                    sorted({f for it in ITEMS if it['kind'] == 'GAUGE' for f in it['frames'] if f})
            stored = key == 'B'
            with zipfile.ZipFile(path, 'w') as z:
                z.writestr(sp2_name, data, compress_type=zipfile.ZIP_DEFLATED)
                for n in names:
                    z.writestr(n, png[n], compress_type=zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED)
                if key == 'C':
                    z.writestr('preview.png', png_bytes(bg.resize((1024, 576), Image.LANCZOS)), compress_type=zipfile.ZIP_DEFLATED)
                    z.writestr('designer.json', json.dumps({'test': 'extra entry'}), compress_type=zipfile.ZIP_DEFLATED)
        report.append(f'{fname:38s} {os.path.getsize(path) / 1e6:6.2f} MB  {len(lines) - 2} lines')
        if key == '100':
            sim = simulate(bg)
            sim.save(os.path.join(OUT, 'png', '_simulated_100.png'))
            sim.resize((1920, 1080), Image.LANCZOS).save(os.path.join(OUT, 'png', '_simulated_100_half.png'))
    open(os.path.join(OUT, 'README.txt'), 'w', encoding='utf-8', newline='\r\n').write(README)
    print('\n'.join(report))
    print('wrote', os.path.relpath(OUT, ROOT))


README = r"""AIDA64 calibration panels
=========================

These test panels show exactly where AIDA64 draws text, gauges, images and graphs,
and which file types it accepts. Your screenshots let the panel designer place
everything so it lines up on your screen. It takes about 15 minutes.

You need: AIDA64 running, the SensorPanel shown on the tablet, and this folder.


1. Back up your current panel
-----------------------------
Importing a test panel replaces your current layout.
1. Right-click the SensorPanel and open SensorPanel Manager.
2. Click Export and save your panel somewhere safe.


2. Set the test values
----------------------
AIDA64 reads these registry values while it runs. Open Command Prompt or
Windows Terminal and run both lines:

  reg add HKCU\Software\FinalWire\AIDA64\ImportValues /v Str1 /t REG_SZ /d "" /f
  reg add HKCU\Software\FinalWire\AIDA64\ImportValues /v DW1 /t REG_DWORD /d 0 /f


3. Main test
------------
Check your Windows display scale for the tablet (Settings > System > Display).

1. In SensorPanel Manager click Import and pick the file for your scale:
     100 %  ->  Calibration_100.sensorpanel
     200 %  ->  Calibration_200pct.sensorpanel
2. Take a screenshot of the whole panel at full resolution:
   press Win+Shift+S, choose "Window" mode, click the SensorPanel,
   then save it from Snipping Tool as PNG. Name it main_dw0.png.
3. Change the test value, wait two seconds, and screenshot block 4
   (the numbered boxes in the middle of the panel) after each command:

     reg add HKCU\Software\FinalWire\AIDA64\ImportValues /v DW1 /t REG_DWORD /d 2 /f    -> main_dw2.png
     reg add HKCU\Software\FinalWire\AIDA64\ImportValues /v DW1 /t REG_DWORD /d 3 /f    -> main_dw3.png
     reg add HKCU\Software\FinalWire\AIDA64\ImportValues /v DW1 /t REG_DWORD /d 30 /f   -> main_dw30.png
     reg add HKCU\Software\FinalWire\AIDA64\ImportValues /v DW1 /t REG_DWORD /d 31 /f   -> main_dw31.png

4. If the "Hxgy" text samples in block 1 don't appear at all, run this and take
   one more full screenshot (main_str.png):

     reg add HKCU\Software\FinalWire\AIDA64\ImportValues /v Str1 /t REG_SZ /d "Hxgy" /f

5. If your scale is 200 %, also import Calibration_100.sensorpanel and take one
   full screenshot (other.png). It will look too big and only partly fit.
   That is expected; it shows how AIDA64 scales an unadjusted panel.
   If your scale is 100 %, import Calibration_200pct.sensorpanel instead and
   take one full screenshot (other.png). It will look small and misaligned.


4. .spzip files
---------------
For each file below: click Import, pick the file, write down whether AIDA64
accepts it (and any error message), and take a full screenshot named after the
file. If the open dialog doesn't list .spzip files, change the file type at the
bottom right of the dialog.

  Calibration_A_deflate.spzip         any scale
  Calibration_B_stored.spzip          any scale
  Calibration_C_extras.spzip          any scale
  Calibration_D_200pct.spzip          only if your scale is 200 %
  Calibration_E_200pct_resize.spzip   only if your scale is 200 %


5. Export it back
-----------------
1. Import Calibration_100.sensorpanel again.
2. In SensorPanel Manager click Export and save it as a .sensorpanel file.
3. Click Export again and save it as a .spzip file (pick the type in the save dialog).
This shows how AIDA64 8.25 writes its files, and whether the long hidden label
in block 8 survives.


6. Clean up
-----------
  reg delete HKCU\Software\FinalWire\AIDA64\ImportValues /v DW1 /f
  reg delete HKCU\Software\FinalWire\AIDA64\ImportValues /v Str1 /f

Then import your backup from step 1 to get your own panel back.


What to send back
-----------------
- All screenshots, as PNG and not resized.
- Your Windows scale for the tablet.
- Which .spzip files AIDA64 accepted or refused, with any error message.
- The two files you exported in step 5.


What each block tests
---------------------
1  Text: where each font's text sits against the predicted top, baseline and bottom lines.
2  Right-aligned text: whether the right edge lands on the grey line.
3  Centred numbers: whether a value centres on the crosshair.
4  Gauges: which state shows exactly at a step boundary, and the clamp above the range.
5  Images: transparency, and whether RESIZW / RESIZH resize an image.
6  Graphs: what the background, frame and grid switches do.
7  AIDA64's own sensor item, and the $CPUMODEL / $GPU1MODEL label macros.
8  A very long hidden label (nothing to see; checked through the export in step 5).
"""


if __name__ == '__main__':
    main()
