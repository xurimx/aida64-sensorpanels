"""Render the landing page thumbnail for the Panel Designer: assets/designer.webp (1600 x 900).

Run after build_site.py:  uv run --with playwright --with pillow python src/tools/designer_thumb.py
Uses Playwright's Chromium, or the local Microsoft Edge when Chromium isn't installed.
"""
import asyncio
import io
import os

from PIL import Image
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
URL = 'file:///' + os.path.join(ROOT, 'designer', 'index.html').replace(os.sep, '/').lstrip('/')
OUT = os.path.join(ROOT, 'assets', 'designer.webp')


async def main():
    async with async_playwright() as p:
        try:
            browser = await p.chromium.launch()
        except Exception:
            browser = await p.chromium.launch(channel='msedge')
        pg = await browser.new_page(viewport={'width': 1600, 'height': 900}, device_scale_factor=1)
        await pg.goto(URL)
        await pg.wait_for_function('window.__designer && window.__designer.ready', timeout=30000)
        await pg.evaluate("document.getElementById('dlg-start').close()")
        await pg.evaluate("""() => {
          const d = __designer; d.setDoc(d.THEMES.modern.make({ w: 3840, h: 2160 }, hwClone(HW_DEFAULTS), {}));
          const g = d.APP.doc.nodes.find(n => n.type === 'group' && /CPU ring/.test(n.name)); d.select([g.id]);
        }""")
        await pg.wait_for_timeout(2500)
        png = await pg.screenshot()
        await browser.close()
    Image.open(io.BytesIO(png)).convert('RGB').save(OUT, 'WEBP', quality=82, method=6)
    print('wrote', os.path.relpath(OUT, ROOT), os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    asyncio.run(main())
