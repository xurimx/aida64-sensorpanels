"""Export the default panel from the built builder page and sanity-check the file.

Needs:  pip install playwright   and   python -m playwright install chromium
Run:    python src/builder/check_export.py      (after python build_site.py)
"""
import asyncio
import os
import re
import sys
import tempfile

from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAGE = os.path.join(ROOT, 'builder', 'index.html')


def check(path):
    raw = open(path, 'rb').read()
    assert raw.count(b'\r\n') == raw.count(b'\n'), 'every line must end in CRLF'
    t = raw.decode('cp1252')
    size = re.search(r'<SPWIDTH>(\d+)</SPWIDTH><SPHEIGHT>(\d+)</SPHEIGHT>', t)
    assert size, 'missing panel size header'
    ids = re.findall(r'<ID>([^<]+)</ID>', t)
    kinds = {}
    for i in ids:
        k = i[:i.index(']') + 1] if i.startswith('[') else i
        kinds[k] = kinds.get(k, 0) + 1
    frames = set(re.findall(r'<GAUSTAFNM>([^<]+)</GAUSTAFNM>', t))
    used = {f for s in re.findall(r'<STAFLS>([^<]*)</STAFLS>', t) for f in s.split('|') if f}
    missing = used - frames
    assert not missing, f'gauge frames referenced but not embedded: {sorted(missing)[:5]}'
    print(f'panel {size.group(1)}x{size.group(2)}, {len(ids)} items {kinds}, '
          f'{len(frames)} gauge frames, {len(raw) / 1e6:.2f} MB')


async def main():
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 1600, 'height': 1000}, accept_downloads=True)
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        await pg.goto('file:///' + PAGE.replace(os.sep, '/').lstrip('/'))
        await pg.wait_for_timeout(2000)
        async with pg.expect_download(timeout=120000) as dl:
            await pg.click('#export')
        d = await dl.value
        out = os.path.join(tempfile.mkdtemp(), d.suggested_filename)
        await d.save_as(out)
        await browser.close()
    print('exported', d.suggested_filename)
    check(out)
    if errors:
        sys.exit('page errors:\n' + '\n'.join(errors))
    print('OK')


asyncio.run(main())
