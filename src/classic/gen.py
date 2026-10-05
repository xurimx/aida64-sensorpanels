"""Generate a classic analog-dial AIDA64 SensorPanel for a 3840x2160 OLED.

Outputs:
  out/Classic_OLED_3840x2160.sensorpanel   (import file, all images embedded)
  out/png/*.png                            (the same images, for inspection)
  out/layout.json                          (sensor metadata for the preview page)
"""
import math, io, os, json
os.chdir(os.path.dirname(os.path.abspath(__file__)))  # paths below are relative to this folder
from PIL import Image, ImageDraw, ImageFont

OUT = 'out'
os.makedirs(OUT + '/png', exist_ok=True)

W, H = 3840, 2160
SS = 2  # supersampling factor for anti-aliasing

FONT_FILES = {w: f'../fonts/barlow-semi-condensed/BSC-{w}.ttf' for w in (300, 400, 500, 600)}
def font(px, w=500):
    return ImageFont.truetype(FONT_FILES[w], max(1, round(px * SS)))

# ---------------------------------------------------------------- palette
# Static markings stay dim (OLED burn-in), live elements are brighter.
C = dict(
    bezel=(40, 40, 40), bezel2=(20, 20, 20),
    minor=(92, 88, 80), mid=(136, 130, 118), major=(196, 188, 170),
    num=(186, 178, 160), red=(196, 78, 58), redband=(104, 32, 21),
    title=(140, 133, 120), unit=(108, 102, 92), window=(46, 46, 46),
    hair=(34, 34, 34), needle=(242, 128, 54), tail=(62, 56, 50),
    hubfill=(10, 10, 10), hubring=(62, 62, 62), hubdot=(40, 40, 40),
)
LIVE_VALUE = (236, 228, 210)   # big dial readings
LIVE_SMALL = (214, 206, 188)   # windows and meters

def bgr(rgb):
    r, g, b = rgb
    return r + (g << 8) + (b << 16)

# ---------------------------------------------------------------- drawing helpers
def pol(cx, cy, r, th):
    t = math.radians(th)
    return cx + r * math.sin(t), cy - r * math.cos(t)

def S(v):
    return v * SS

def tick(d, cx, cy, th, r_in, r_out, w, col):
    t = math.radians(th)
    ux, uy = math.sin(t), -math.cos(t)
    vx, vy = math.cos(t), math.sin(t)
    pts = []
    for r, s in ((r_in, -1), (r_out, -1), (r_out, 1), (r_in, 1)):
        pts.append((S(cx + ux * r + vx * w / 2 * s), S(cy + uy * r + vy * w / 2 * s)))
    pts = [pts[0], pts[1], pts[2], pts[3]]
    d.polygon(pts, fill=col)

def band(d, cx, cy, th0, th1, r_in, r_out, col):
    n = max(8, int(abs(th1 - th0) * 2))
    outer = [pol(cx, cy, r_out, th0 + (th1 - th0) * i / n) for i in range(n + 1)]
    inner = [pol(cx, cy, r_in, th1 - (th1 - th0) * i / n) for i in range(n + 1)]
    d.polygon([(S(x), S(y)) for x, y in outer + inner], fill=col)

def ring(d, cx, cy, r, w, col):
    d.ellipse([S(cx - r), S(cy - r), S(cx + r), S(cy + r)], outline=col, width=max(1, round(w * SS)))

def text_center(d, x, y, s, f, col, spacing=0.0):
    """Centre the visible ink of s on (x, y). spacing in em."""
    if not spacing:
        bb = d.textbbox((0, 0), s, font=f, anchor='ls')
        w, top, bot = bb[2] - bb[0], bb[1], bb[3]
        d.text((S(x) - bb[0] - w / 2, S(y) - (top + bot) / 2), s, font=f, fill=col, anchor='ls')
        return
    em = f.size
    widths = [f.getlength(ch) for ch in s]
    total = sum(widths) + spacing * em * (len(s) - 1)
    bb = d.textbbox((0, 0), s, font=f, anchor='ls')
    cx0 = S(x) - total / 2
    for ch, wch in zip(s, widths):
        d.text((cx0, S(y) - (bb[1] + bb[3]) / 2), ch, font=f, fill=col, anchor='ls')
        cx0 += wch + spacing * em

def text_left(d, x, y_base, s, f, col, spacing=0.0):
    cx0 = S(x)
    for ch in s:
        d.text((cx0, S(y_base)), ch, font=f, fill=col, anchor='ls')
        cx0 += f.getlength(ch) + spacing * f.size
    return (cx0 / SS)

def text_right(d, x, y_base, s, f, col, spacing=0.0):
    total = sum(f.getlength(ch) for ch in s) + spacing * f.size * (len(s) - 1)
    return text_left(d, x - total / SS, y_base, s, f, col, spacing)

def rrect(d, x0, y0, x1, y1, r, col, w):
    d.rounded_rectangle([S(x0), S(y0), S(x1), S(y1)], radius=S(r), outline=col, width=round(w * SS))

# ---------------------------------------------------------------- layout
SWEEP0, SWEEP1 = -120.0, 120.0

BIG = dict(R=520, bez=514, bez2=500, rt=478, maj=(52, 8), mid=(34, 4.5), mnr=(20, 3), rn=370, nfont=84,
           title_dy=-200, title_px=54, val_dy=170, val_pt=112, unit_dy=284, unit_px=40,
           win_dy=376, win_w=344, win_h=88, win_px=52, cap_px=24,
           tip=462, tail=74, wbase=18, wtip=4, hub=40, positions=40)
SMALL = dict(R=240, bez=236, bez2=226, rt=214, maj=(30, 5), mid=(20, 3), mnr=(12, 2.2), rn=160, nfont=40,
             title_dy=-82, title_px=30, val_dy=122, val_pt=54, unit_dy=184, unit_px=26,
             tip=202, tail=36, wbase=10, wtip=3, hub=20, positions=25)

CY1, CY2 = 630, 1440
COLS = [700, 1920, 3140]

DIALS = [
    dict(kind='big', cx=COLS[0], cy=CY1, sensor='TCPUPKG', slabel='CPU Package', lo=20, hi=100,
         major=20, mid=10, minor=2, red=(90, 100), title='CPU', unit='°C',
         window=dict(caption='CLOCK', sensor='SCPUCLK', slabel='CPU Clock', unit=' MHz')),
    dict(kind='big', cx=COLS[1], cy=CY1, sensor='SRTSSFPS', slabel='RTSS FPS', lo=0, hi=240,
         major=40, mid=20, minor=5, red=(0, 30), title='FRAME RATE', unit='FPS',
         window=dict(caption='TIME', sensor='STIME', slabel='Time', unit='')),
    dict(kind='big', cx=COLS[2], cy=CY1, sensor='TGPU1DIO', slabel='GPU Diode', lo=20, hi=100,
         major=20, mid=10, minor=2, red=(85, 100), title='GPU', unit='°C',
         window=dict(caption='CLOCK', sensor='SGPU1CLK', slabel='GPU Clock', unit=' MHz')),
    dict(kind='small', cx=COLS[0] - 270, cy=CY2, sensor='SCPUUTI', slabel='CPU Utilization', lo=0, hi=100,
         major=20, mid=10, minor=5, red=None, title='CPU LOAD', unit='%'),
    dict(kind='small', cx=COLS[0] + 270, cy=CY2, sensor='PCPUPKG', slabel='CPU Package', lo=0, hi=250,
         major=50, mid=None, minor=10, red=None, title='CPU POWER', unit='WATTS'),
    dict(kind='small', cx=COLS[1] - 270, cy=CY2, sensor='SMEMUTI', slabel='Memory Utilization', lo=0, hi=100,
         major=20, mid=10, minor=5, red=(90, 100), title='RAM', unit='% USED'),
    dict(kind='small', cx=COLS[1] + 270, cy=CY2, sensor='SVMEMUSAGE', slabel='Video Memory Utilization', lo=0, hi=100,
         major=20, mid=10, minor=5, red=(90, 100), title='VRAM', unit='% USED'),
    dict(kind='small', cx=COLS[2] - 270, cy=CY2, sensor='PGPU1', slabel='GPU1', lo=0, hi=500,
         major=100, mid=50, minor=20, red=None, title='GPU POWER', unit='WATTS'),
    dict(kind='small', cx=COLS[2] + 270, cy=CY2, sensor='SGPU1UTI', slabel='GPU Utilization', lo=0, hi=100,
         major=20, mid=10, minor=5, red=None, title='GPU LOAD', unit='%'),
]

# Meters: label, sensor, scale
MET_Y_TITLE, MET_YB, MET_YS = 1800, 1880, 1960
GROUPS = [
    dict(title='STORAGE  ·  % USED', mw=262, items=[
        dict(label='DRIVE C:', sensor='SDRVCUTI', slabel='Drive C: Utilization', scale='pct', unit=''),
        dict(label='DRIVE D:', sensor='SDRVDUTI', slabel='Drive D: Utilization', scale='pct', unit=''),
    ]),
    dict(title='COOLING  ·  RPM', mw=280, items=[
        dict(label='CPU FAN', sensor='FCPU', slabel='CPU', scale='rpm3', unit=' RPM'),
        dict(label='PUMP', sensor='FAIOPUMP', slabel='AIO Pump', scale='rpm4', unit=' RPM'),
        dict(label='CASE 1', sensor='FCHA1', slabel='Chassis #1', scale='rpm3', unit=' RPM'),
        dict(label='CASE 2', sensor='FCHA2', slabel='Chassis #2', scale='rpm3', unit=' RPM'),
        dict(label='CASE 3', sensor='FCHA3', slabel='Chassis #3', scale='rpm3', unit=' RPM'),
        dict(label='GPU FAN', sensor='FGPU1', slabel='GPU', scale='rpm3', unit=' RPM'),
    ]),
    dict(title='NETWORK  ·  MB/s', mw=356, items=[
        dict(label='DOWN', sensor='SNIC1DLRATE', slabel='NIC1 Download Rate', scale='net', unit=' KB/s'),
        dict(label='UP', sensor='SNIC1ULRATE', slabel='NIC1 Upload Rate', scale='net', unit=' KB/s'),
    ]),
]
X_LEFT, X_RIGHT = 190, 3650
IN_GAP = 56
n_items = sum(len(g['items']) for g in GROUPS)
group_w = [len(g['items']) * g['mw'] + (len(g['items']) - 1) * IN_GAP for g in GROUPS]
G_GAP = (X_RIGHT - X_LEFT - sum(group_w)) / (len(GROUPS) - 1)
x = X_LEFT
for g, gw in zip(GROUPS, group_w):
    g['x0'], g['x1'] = x, x + gw
    for i, it in enumerate(g['items']):
        it['x0'] = round(x + i * (g['mw'] + IN_GAP))
        it['mw'] = g['mw']
    x += gw + G_GAP

# ---------------------------------------------------------------- background
bg = Image.new('RGB', (W * SS, H * SS), (0, 0, 0))
d = ImageDraw.Draw(bg)

def angle(dial, v):
    return SWEEP0 + (SWEEP1 - SWEEP0) * (v - dial['lo']) / (dial['hi'] - dial['lo'])

def frange(lo, hi, step):
    n = int(round((hi - lo) / step))
    return [lo + i * step for i in range(n + 1)]

def in_red(dial, v):
    return dial['red'] and dial['red'][0] - 1e-9 <= v <= dial['red'][1] + 1e-9

for dial in DIALS:
    G = BIG if dial['kind'] == 'big' else SMALL
    cx, cy = dial['cx'], dial['cy']
    ring(d, cx, cy, G['bez'], 5 if dial['kind'] == 'big' else 4, C['bezel'])
    ring(d, cx, cy, G['bez2'], 2, C['bezel2'])
    if dial['red']:
        a0, a1 = angle(dial, dial['red'][0]), angle(dial, dial['red'][1])
        bw = 11 if dial['kind'] == 'big' else 6
        band(d, cx, cy, a0, a1, G['rt'] - bw, G['rt'], C['redband'])
    majors = set(round(v, 6) for v in frange(dial['lo'], dial['hi'], dial['major']))
    mids = set(round(v, 6) for v in frange(dial['lo'], dial['hi'], dial['mid'])) if dial['mid'] else set()
    for v in frange(dial['lo'], dial['hi'], dial['minor']):
        rv = round(v, 6)
        if rv in majors:
            ln, w = G['maj']; col = C['major']
        elif rv in mids:
            ln, w = G['mid']; col = C['mid']
        else:
            ln, w = G['mnr']; col = C['minor']
        if in_red(dial, v):
            col = C['red'] if rv in majors or rv in mids else (150, 60, 45)
        tick(d, cx, cy, angle(dial, v), G['rt'] - ln, G['rt'], w, col)
    fnum = font(G['nfont'], 500)
    gap = 18 if dial['kind'] == 'big' else 10
    for v in sorted(majors):
        th = angle(dial, v)
        bb = d.textbbox((0, 0), str(int(v)), font=fnum, anchor='ls')
        tw, thh = (bb[2] - bb[0]) / SS, (bb[3] - bb[1]) / SS
        ext = abs(math.sin(math.radians(th))) * tw / 2 + abs(math.cos(math.radians(th))) * thh / 2
        x_, y_ = pol(cx, cy, G['rt'] - G['maj'][0] - gap - ext, th)
        col = C['red'] if in_red(dial, v) else C['num']
        text_center(d, x_, y_, str(int(v)), fnum, col)
    text_center(d, cx, cy + G['title_dy'], dial['title'], font(G['title_px'], 600), C['title'], spacing=.16)
    text_center(d, cx, cy + G['unit_dy'], dial['unit'], font(G['unit_px'], 500), C['unit'], spacing=.12 if dial['kind'] == 'small' else .06)
    if dial['kind'] == 'big':
        wx0, wx1 = cx - G['win_w'] / 2, cx + G['win_w'] / 2
        wy0, wy1 = cy + G['win_dy'] - G['win_h'] / 2, cy + G['win_dy'] + G['win_h'] / 2
        rrect(d, wx0, wy0, wx1, wy1, 12, C['window'], 3)
        fcap = font(G['cap_px'], 600)
        bb = d.textbbox((0, 0), 'H', font=fcap, anchor='ls')
        text_left(d, wx0 + 22, cy + G['win_dy'] + (bb[3] - bb[1]) / SS / 2, dial['window']['caption'], fcap, C['unit'], spacing=.14)

# meters
f_lab = font(30, 600)
f_mnum = font(26, 500)
f_gt = font(26, 600)
SCALES = {
    'pct': dict(major=[0, .5, 1], labels=['0', '50', '100'], minor=[i / 10 for i in range(11)], red=(.9, 1)),
    'rpm3': dict(major=[0, 1 / 3, 2 / 3, 1], labels=['0', '1k', '2k', '3k'], minor=[i / 15 for i in range(16)], red=None),
    'rpm4': dict(major=[0, .25, .5, .75, 1], labels=['0', '1k', '2k', '3k', '4k'], minor=[i / 20 for i in range(21)], red=None),
    'net': dict(major=[0, 1 / 3, 2 / 3, 1], labels=['0', '1', '10', '100'],
                minor=[(dd + k / 10) / 3 for dd in range(3) for k in range(10)] + [1], red=None),
}
for g in GROUPS:
    tw_end = text_left(d, g['x0'], MET_Y_TITLE, g['title'], f_gt, C['unit'], spacing=.14)
    d.rectangle([S(tw_end + 18), S(MET_Y_TITLE - 9), S(g['x1']), S(MET_Y_TITLE - 9) + SS * 2 - 1], fill=C['hair'])
    for it in g['items']:
        x0 = it['x0']
        MW = it['mw']
        sc = SCALES[it['scale']]
        text_left(d, x0, MET_YB, it['label'], f_lab, C['title'], spacing=.08)
        d.rectangle([S(x0), S(MET_YS - 1), S(x0 + MW), S(MET_YS + 1)], fill=(74, 70, 64))
        if sc['red']:
            d.rectangle([S(x0 + sc['red'][0] * MW), S(MET_YS - 1), S(x0 + MW), S(MET_YS + 4)], fill=C['redband'])
        for f in sc['minor']:
            xx = x0 + f * MW
            d.rectangle([S(xx - 1), S(MET_YS), S(xx + 1), S(MET_YS + 10)], fill=C['minor'])
        for f, lab in zip(sc['major'], sc['labels']):
            xx = x0 + f * MW
            col = C['red'] if sc['red'] and f >= sc['red'][0] else C['major']
            d.rectangle([S(xx - 1.5), S(MET_YS), S(xx + 1.5), S(MET_YS + 18)], fill=col)
            ncol = C['red'] if sc['red'] and f >= sc['red'][0] else C['num']
            bb = d.textbbox((0, 0), lab, font=f_mnum, anchor='ls')
            wlab = (bb[2] - bb[0]) / SS
            tx = xx - wlab / 2
            d.text((S(tx), S(MET_YS + 50)), lab, font=f_mnum, fill=(150, 143, 128), anchor='ls')

bg_img = bg.resize((W, H), Image.LANCZOS)

# ---------------------------------------------------------------- needle frames
def needle_frame(G, th, size):
    """Render one needle at angle th on a transparent square of side `size` (centre = size/2)."""
    im = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
    dd = ImageDraw.Draw(im)
    c = size / 2
    t = math.radians(th)
    ux, uy = math.sin(t), -math.cos(t)
    vx, vy = math.cos(t), math.sin(t)
    def P(r, off):
        return (S(c + ux * r + vx * off), S(c + uy * r + vy * off))
    tip, tail, wb, wt = G['tip'], G['tail'], G['wbase'], G['wtip']
    # tail / counterweight (dark), then needle body (orange)
    dd.polygon([P(-tail, -wb * .62), P(-tail, wb * .62), P(0, wb / 2), P(0, -wb / 2)], fill=C['tail'] + (255,))
    dd.polygon([P(0, -wb / 2), P(tip - 14, -wt / 2), P(tip, 0), P(tip - 14, wt / 2), P(0, wb / 2)], fill=C['needle'] + (255,))
    return im.resize((size, size), Image.LANCZOS)

def hub_image(G):
    r = G['hub']
    size = 2 * r + 8
    im = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
    dd = ImageDraw.Draw(im)
    c = size / 2
    dd.ellipse([S(c - r), S(c - r), S(c + r), S(c + r)], fill=C['hubfill'] + (255,), outline=C['hubring'] + (255,), width=3 * SS)
    rr = r * .32
    dd.ellipse([S(c - rr), S(c - rr), S(c + rr), S(c + rr)], fill=C['hubdot'] + (255,))
    return im.resize((size, size), Image.LANCZOS)

IMAGES = {}  # name -> PIL image

def add_img(name, im):
    IMAGES[name] = im
    return name

def build_needle_set(prefix, G, groups):
    """groups: list of position lists. Returns per-group (crop_box, {pos: name}, blank_name)."""
    size = 2 * (G['tip'] + 12)
    out = []
    n = G['positions']
    def ang(p):
        if p > n:  # overrange stop
            return SWEEP1 + (5 if G is BIG else 7)
        return SWEEP0 + (SWEEP1 - SWEEP0) * p / n
    for gi, plist in enumerate(groups):
        frames = {p: needle_frame(G, ang(p), size) for p in plist}
        box = None
        for im in frames.values():
            b = im.getbbox()
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
        box = (box[0] - 2, box[1] - 2, box[2] + 2, box[3] + 2)
        names = {}
        for p, im in frames.items():
            names[p] = add_img(f'{prefix}{"abc"[gi]}_{p:02d}.png', im.crop(box))
        blank = add_img(f'{prefix}{"abc"[gi]}_off.png', Image.new('RGBA', (box[2] - box[0], box[3] - box[1]), (0, 0, 0, 0)))
        out.append(dict(box=box, names=names, blank=blank, size=size))
    return out

# Big dial: 41 positions (0..40) + overrange 41, split over 3 stacked gauges
BIG_SET = build_needle_set('needle_l', BIG, [list(range(0, 15)), list(range(15, 29)), list(range(29, 42))])
# Small dial: 26 positions (0..25) + overrange 26, split over 2 stacked gauges
SMALL_SET = build_needle_set('needle_s', SMALL, [list(range(0, 15)), list(range(15, 27))])
add_img('hub_l.png', hub_image(BIG))
add_img('hub_s.png', hub_image(SMALL))

# meter pointer frames, shared by every meter of the same width
PTR_PAD_L, PTR_PAD_R, PTR_TOP, PTR_H = 16, 26, MET_YS - 40, 62
def pointer_frame(f, mw):
    w = mw + PTR_PAD_L + PTR_PAD_R
    im = Image.new('RGBA', (w * SS, PTR_H * SS), (0, 0, 0, 0))
    dd = ImageDraw.Draw(im)
    px = PTR_PAD_L + f * mw
    top = 4
    dd.polygon([(S(px - 10), S(top)), (S(px + 10), S(top)), (S(px), S(top + 22))], fill=C['needle'] + (255,))
    dd.rectangle([S(px - 1.5), S(top + 16), S(px + 1.5), S(top + 56)], fill=C['needle'] + (255,))
    return im.resize((w, PTR_H), Image.LANCZOS)

PTR_NAMES = {}
def ptr_name(f, mw):
    key = (mw, round(f * mw * 2))  # half-pixel resolution
    if key not in PTR_NAMES:
        PTR_NAMES[key] = add_img(f'pointer{mw}_{key[1]:03d}.png', pointer_frame(key[1] / 2 / mw, mw))
    return PTR_NAMES[key]
PTR_BLANKS = {}
def ptr_blank(mw):
    if mw not in PTR_BLANKS:
        PTR_BLANKS[mw] = add_img(f'pointer{mw}_off.png', Image.new('RGBA', (mw + PTR_PAD_L + PTR_PAD_R, PTR_H), (0, 0, 0, 0)))
    return PTR_BLANKS[mw]

# ---------------------------------------------------------------- items
ITEMS = []
FONT_LIGHT = 'Bahnschrift Light'
FONT_REG = 'Bahnschrift'

def fmt_num(v):
    s = f'{v:.6f}'.rstrip('0').rstrip('.')
    return s if s not in ('-0', '') else '0'

def gauge(sensor, slabel, lo, hi, x, y, frames, show_val=False, txt_pt=8, font_name='Tahoma', col=(255, 255, 255)):
    assert len(frames) == 16
    ITEMS.append(dict(kind='GAUGE', sensor=sensor, slabel=slabel, lo=lo, hi=hi, x=int(round(x)), y=int(round(y)),
                      frames=frames, show_val=show_val, txt_pt=txt_pt, font=font_name, col=col))

def simple(sensor, slabel, x_right, y_top, pt, unit, col, font_name=FONT_REG):
    ITEMS.append(dict(kind='SIMPLE', sensor=sensor, slabel=slabel, x=int(round(x_right)), y=int(round(y_top)), pt=pt, unit=unit, col=col, font=font_name))

def image_item(name, x, y):
    ITEMS.append(dict(kind='IMG', name=name, x=int(round(x)), y=int(round(y))))

def divider(text):
    ITEMS.append(dict(kind='DIV', text=text))

# Bahnschrift vertical metrics are not available here; assume ~1.0 em ascent, 0.25 em descent (GDI cell)
def cell_top_for_center(cy, pt):
    px = pt * 96 / 72
    return cy - px * 1.25 / 2

image_item('background.png', 0, 0)

META = dict(panel=dict(w=W, h=H), dials=[], meters=[], windows=[])

for dial in DIALS:
    big = dial['kind'] == 'big'
    G = BIG if big else SMALL
    SET = BIG_SET if big else SMALL_SET
    cx, cy = dial['cx'], dial['cy']
    lo, hi = dial['lo'], dial['hi']
    n = G['positions']
    step = (hi - lo) / n
    divider(f'----- {dial["title"]} ({dial["sensor"]}) -----')
    stacks = []
    if big:
        # A: states 0..14 -> p 0..14 ; B: 1..14 -> p 15..28 ; C: 1..12 -> p 29..40, 13..15 -> overrange
        specs = [
            (lo, [SET[0]['names'][s] for s in range(15)] + [SET[0]['blank']]),
            (lo + 14 * step, [SET[1]['blank']] + [SET[1]['names'][14 + s] for s in range(1, 15)] + [SET[1]['blank']]),
            (lo + 28 * step, [SET[2]['blank']] + [SET[2]['names'][28 + s] for s in range(1, 13)] + [SET[2]['names'][41]] * 3),
        ]
    else:
        # A: states 0..14 -> p 0..14 ; B: 1..11 -> p 15..25, 12..15 -> overrange (26)
        specs = [
            (lo, [SET[0]['names'][s] for s in range(15)] + [SET[0]['blank']]),
            (lo + 14 * step, [SET[1]['blank']] + [SET[1]['names'][14 + s] for s in range(1, 12)] + [SET[1]['names'][26]] * 4),
        ]
    for gi, (gmin, frames) in enumerate(specs):
        box = SET[gi]['box']
        half = SET[gi]['size'] / 2
        gauge(dial['sensor'], dial['slabel'], gmin, gmin + 15 * step, cx - half + box[0], cy - half + box[1], frames)
        stacks.append(dict(min=gmin, max=gmin + 15 * step))
    hub = 'hub_l.png' if big else 'hub_s.png'
    hs = IMAGES[hub].size[0]
    image_item(hub, cx - hs / 2, cy - hs / 2)
    # numeric reading, centred (gauge with no frames prints its value centred on ITMX/ITMY)
    gauge(dial['sensor'], dial['slabel'], 0, 100, cx, cy + G['val_dy'], [''] * 16, show_val=True,
          txt_pt=G['val_pt'], font_name=FONT_LIGHT, col=LIVE_VALUE)
    if big:
        w = dial['window']
        right = cx + G['win_w'] / 2 - 22
        win_pt = round(G['win_px'] * 72 / 96)
        simple(w['sensor'], w['slabel'], right, cell_top_for_center(cy + G['win_dy'], win_pt), win_pt, w['unit'], LIVE_SMALL)
        META['windows'].append(dict(sensor=w['sensor'], caption=w['caption']))
    META['dials'].append(dict(sensor=dial['sensor'], title=dial['title'], unit=dial['unit'], lo=lo, hi=hi, kind=dial['kind'], stacks=stacks))

# meters
def meter_specs(scale, lo_hi, mw):
    """Return list of (min, max, frames) stacked gauges for a meter scale."""
    P = lambda f: ptr_name(f, mw)
    BL = ptr_blank(mw)
    if scale == 'net':
        out = []
        decades = [(0, 1000), (1000, 10000), (10000, 100000)]
        for di, (a, b) in enumerate(decades):
            st = (b - a) / 14
            if di == 0:
                gmin = a
                frames = [P((s / 14) / 3) for s in range(14)] + [BL, BL]
            else:
                gmin = a - st
                frames = [BL] + [P((di + (s - 1) / 14) / 3) for s in range(1, 15)]
                frames += [BL] if di < 2 else [P(1.0)]
            out.append((gmin, gmin + 15 * st, frames))
        return out
    lo, hi = lo_hi
    st = (hi - lo) / 28
    A = [P(s / 28) for s in range(15)] + [BL]
    B = [BL] + [P((14 + s) / 28) for s in range(1, 15)] + [P(1 + 8 / mw)]
    return [(lo, lo + 15 * st, A), (lo + 14 * st, lo + 29 * st, B)]

RANGES = {'pct': (0, 100), 'rpm3': (0, 3000), 'rpm4': (0, 4000), 'net': None}
for g in GROUPS:
    divider(f'----- {g["title"].split()[0]} -----')
    for it in g['items']:
        x0 = it['x0']
        stacks = []
        for gmin, gmax, frames in meter_specs(it['scale'], RANGES[it['scale']], it['mw']):
            gauge(it['sensor'], it['slabel'], gmin, gmax, x0 - PTR_PAD_L, PTR_TOP, frames)
            stacks.append(dict(min=gmin, max=gmax))
        pt = 28 if it['scale'] != 'net' else 26
        # SIMPLE text is top-anchored: put its baseline on the label baseline (ascent ~1.0 em)
        simple(it['sensor'], it['slabel'], x0 + it['mw'], MET_YB - pt * 96 / 72 * 1.0, pt, it['unit'], LIVE_SMALL)
        META['meters'].append(dict(sensor=it['sensor'], label=it['label'], scale=it['scale'], stacks=stacks, unit=it['unit']))

add_img('background.png', bg_img)

# ---------------------------------------------------------------- write PNGs
def png_bytes(im):
    b = io.BytesIO()
    im.save(b, 'PNG', optimize=True)
    return b.getvalue()

DATA = {}
for name, im in IMAGES.items():
    DATA[name] = png_bytes(im)
    with open(f'{OUT}/png/{name}', 'wb') as fh:
        fh.write(DATA[name])

# ---------------------------------------------------------------- write .sensorpanel
lines = ['<SPVER>100</SPVER><SWVER>7.35.7000</SWVER>',
         f'<SPWIDTH>{W}</SPWIDTH><SPHEIGHT>{H}</SPHEIGHT><SPBGCOLOR>0</SPBGCOLOR>']
used_frames = set()
for it in ITEMS:
    k = it['kind']
    if k == 'IMG':
        lines.append(f'<ID>IMG</ID><URL></URL><ITMX>{it["x"]}</ITMX><ITMY>{it["y"]}</ITMY><IMGFIL>{it["name"]}</IMGFIL><IMGDAT>{DATA[it["name"]].hex().upper()}</IMGDAT>')
    elif k == 'DIV':
        lines.append(f'<ID>-LBL</ID><TXTSIZ>8</TXTSIZ><FNTNAM></FNTNAM><LBL>{it["text"]}</LBL><LBLCOL>16777215</LBLCOL><LBLBIS>000</LBLBIS><SHDCOL>0</SHDCOL><SHDDIS>1</SHDDIS><SHDDEP>1</SHDDEP><URL></URL><ITMX>0</ITMX><ITMY>0</ITMY>')
    elif k == 'GAUGE':
        used_frames.update(f for f in it['frames'] if f)
        lines.append(
            f'<ID>[GAUGE]{it["sensor"]}</ID><LBL>{it["slabel"]}</LBL><TYP>Custom</TYP><SIZ>S</SIZ>'
            f'<MINVAL>{fmt_num(it["lo"])}</MINVAL><MAXVAL>{fmt_num(it["hi"])}</MAXVAL><SHWICO>0</SHWICO>'
            f'<SHWVAL>{1 if it["show_val"] else 0}</SHWVAL><TXTSIZ>{it["txt_pt"]}</TXTSIZ><FNTNAM>{it["font"]}</FNTNAM>'
            f'<VALCOL>{bgr(it["col"])}</VALCOL><VALBI>00</VALBI><ITMX>{it["x"]}</ITMX><ITMY>{it["y"]}</ITMY>'
            f'<STAFLS>{"|".join(it["frames"])}</STAFLS>')
    elif k == 'SIMPLE':
        lines.append(
            f'<ID>[SIMPLE]{it["sensor"]}</ID><TXTSIZ>{it["pt"]}</TXTSIZ><FNTNAM>{it["font"]}</FNTNAM><TXTCOL>{bgr(it["col"])}</TXTCOL>'
            f'<TXTBIR>001</TXTBIR><SHWLBL>0</SHWLBL><LBL>{it["slabel"]}</LBL><SHWUNT>{1 if it["unit"] else 0}</SHWUNT>'
            f'<UNT>{it["unit"]}</UNT><ITMX>{it["x"]}</ITMX><ITMY>{it["y"]}</ITMY>')
for name in sorted(used_frames):
    lines.append(f'<GAUSTAFNM>{name}</GAUSTAFNM><GAUSTADAT>{DATA[name].hex().upper()}</GAUSTADAT>')

panel_path = f'{OUT}/Classic_OLED_3840x2160.sensorpanel'
with open(panel_path, 'w', encoding='ascii', newline='') as fh:
    fh.write('\r\n'.join(lines) + '\r\n')

json.dump(META, open(f'{OUT}/layout.json', 'w'), indent=1)
unused = set(IMAGES) - used_frames - {i['name'] for i in ITEMS if i['kind'] == 'IMG'}
print('items', len(ITEMS), 'gauges', sum(1 for i in ITEMS if i['kind'] == 'GAUGE'), 'frames', len(used_frames), 'unused', sorted(unused))
print('file MB', os.path.getsize(panel_path) / 1e6)
tot = sum(IMAGES[n].size[0] * IMAGES[n].size[1] * 4 for n in used_frames) / 1e6
print('decoded frame MB', round(tot, 1), 'bg PNG KB', len(DATA['background.png']) // 1024)
