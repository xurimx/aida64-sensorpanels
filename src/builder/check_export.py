"""Export panels from the built builder page and sanity-check the files.

Needs:  pip install playwright   and   python -m playwright install chromium
        (or a local Microsoft Edge; it is used when Playwright's Chromium is missing)
Run:    python src/builder/check_export.py                     export the default panel and check it
        python src/builder/check_export.py --all               export every config in CONFIGS
        python src/builder/check_export.py --all --hash-out h.json   also save SHA-256 hashes
        python src/builder/check_export.py --all --compare h.json    fail if any export changed
Run it after python build_site.py.
"""
import asyncio
import hashlib
import json
import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAGE = os.path.join(ROOT, 'builder', 'index.html')
STORE_KEY = 'modern-split-builder-v1'

# Saved settings to load before the page starts (merged with the builder's DEFAULTS).
CONFIGS = {
    'default': {},
    'dpi200': {'dpi': 200},
    'qhd-nohist': {'res': '2560x1440', 'resW': 2560, 'resH': 1440, 'extras': {'memHist': False}},
    'title': {'hmode': 'title', 'title': 'TEST RIG'},
}


def check(path_or_bytes):
    """Sanity-check a .sensorpanel file: CRLF, size header, every referenced gauge frame embedded."""
    raw = path_or_bytes if isinstance(path_or_bytes, bytes) else open(path_or_bytes, 'rb').read()
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
    summary = (f'panel {size.group(1)}x{size.group(2)}, {len(ids)} items {kinds}, '
               f'{len(frames)} gauge frames, {len(raw) / 1e6:.2f} MB')
    print(summary)
    return summary


async def launch(p):
    """Playwright's bundled Chromium if it is installed, otherwise the local Microsoft Edge."""
    try:
        return await p.chromium.launch()
    except Exception:
        return await p.chromium.launch(channel='msedge')


async def export_config(browser, name, settings, errors):
    ctx = await browser.new_context(viewport={'width': 1600, 'height': 1000}, accept_downloads=True)
    await ctx.add_init_script(f'localStorage.setItem({json.dumps(STORE_KEY)}, {json.dumps(json.dumps(settings))})')
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(f'{name}: {e}'))
    pg.on('console', lambda m: m.type == 'error' and errors.append(f'{name}: {m.text}'))
    await pg.goto('file:///' + PAGE.replace(os.sep, '/').lstrip('/'))
    await pg.wait_for_function('window.__builder && document.fonts.status === "loaded"')
    await pg.wait_for_timeout(500)
    async with pg.expect_download(timeout=120000) as dl:
        await pg.click('#export')
    d = await dl.value
    out = os.path.join(tempfile.mkdtemp(), d.suggested_filename)
    await d.save_as(out)
    await ctx.close()
    return d.suggested_filename, open(out, 'rb').read()


async def export_all(names):
    from playwright.async_api import async_playwright
    errors, results = [], {}
    async with async_playwright() as p:
        browser = await launch(p)
        for name in names:
            results[name] = await export_config(browser, name, CONFIGS[name], errors)
        await browser.close()
    return results, errors


def main(argv):
    names = list(CONFIGS) if '--all' in argv else ['default']
    results, errors = asyncio.run(export_all(names))
    hashes = {}
    for name, (fname, data) in results.items():
        print(f'[{name}] exported {fname}')
        check(data)
        hashes[name] = hashlib.sha256(data).hexdigest()
    if '--hash-out' in argv:
        path = argv[argv.index('--hash-out') + 1]
        with open(path, 'w') as fh:
            json.dump(hashes, fh, indent=1)
        print('hashes written to', path)
    if '--compare' in argv:
        path = argv[argv.index('--compare') + 1]
        want = json.load(open(path))
        diff = [n for n in hashes if n in want and want[n] != hashes[n]]
        missing = [n for n in want if n not in hashes]
        if diff or missing:
            sys.exit(f'export changed: {diff}  not exported: {missing}')
        print(f'all {len(hashes)} exports match {path}')
    if errors:
        sys.exit('page errors:\n' + '\n'.join(errors))
    print('OK')


if __name__ == '__main__':
    main(sys.argv[1:])
