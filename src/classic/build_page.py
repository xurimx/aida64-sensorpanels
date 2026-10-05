"""Parse the generated .sensorpanel back in (as AIDA64 would see it) and build the preview page."""
import re, json, base64, binascii
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))  # paths below are relative to this folder

SRC = 'out/Classic_OLED_3840x2160.sensorpanel'
txt = open(SRC, encoding='ascii').read().replace('\r', '')

def tags(line):
    return re.findall(r'<([A-Z0-9]+)>(.*?)</\1>', line, re.S)

header, items, images = {}, [], {}
for line in txt.split('\n'):
    if not line.strip():
        continue
    d = {k: v for k, v in tags(line) if k not in ('IMGDAT', 'GAUSTADAT')}
    if 'GAUSTAFNM' in d:
        images[d['GAUSTAFNM']] = binascii.unhexlify(re.search(r'<GAUSTADAT>([0-9A-F]*)</GAUSTADAT>', line).group(1))
        continue
    if 'ID' not in d:
        header.update(d)
        continue
    raw = d['ID']
    if raw.startswith('-'):
        continue
    m = re.match(r'\[(GAUGE|SIMPLE|GRAPH)\](.*)', raw)
    kind, sensor = (m.group(1), m.group(2)) if m else (raw, None)
    if kind == 'IMG':
        images[d['IMGFIL']] = binascii.unhexlify(re.search(r'<IMGDAT>([0-9A-F]*)</IMGDAT>', line).group(1))
    o = {'kind': kind, 'sensor': sensor}
    o.update({k: v for k, v in d.items() if k not in ('URL', 'ID')})
    items.append(o)

from PIL import Image
import io
sizes = {k: list(Image.open(io.BytesIO(v)).size) for k, v in images.items()}
payload = {'panel': {'w': int(header['SPWIDTH']), 'h': int(header['SPHEIGHT']), 'bg': '#000000'}, 'items': items, 'sizes': sizes}
uris = {k: 'data:image/png;base64,' + base64.b64encode(v).decode() for k, v in images.items()}

fonts = {}
for w in (300, 400, 500, 600):
    b = open(f'../fonts/barlow-semi-condensed/barlow-semi-condensed-latin-{w}-normal.woff2', 'rb').read()
    fonts[w] = 'data:font/woff2;base64,' + base64.b64encode(b).decode()
font_css = '\n'.join(
    f"@font-face{{font-family:'Barlow SC Local';font-weight:{w};font-style:normal;font-display:block;src:url({u}) format('woff2')}}"
    for w, u in fonts.items())

meta = json.load(open('out/layout.json'))
tpl = open('page_template.html', encoding='utf-8').read()
out = (tpl.replace('/*__FONTS__*/', font_css)
          .replace('/*__PAYLOAD__*/null', json.dumps(payload))
          .replace('/*__IMAGES__*/null', json.dumps(uris))
          .replace('/*__META__*/null', json.dumps(meta)))
open('classic-oled-panel.html', 'w', encoding='utf-8').write(out)
print('items', len(items), 'images', len(images), 'page MB', round(len(out.encode()) / 1e6, 2))
