"""Build the GitHub Pages site from src/.

  python build_site.py          rebuild the pages (renders the classic panel only if it hasn't been yet)
  python build_site.py --all    also re-render the classic panel images (about 10 s, needs Pillow)

Writes builder/index.html, designer/index.html, classic/index.html, sensors/index.html and panels/*.sensorpanel.
Commit those along with src/ so GitHub Pages serves the latest version.
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
sys.path.insert(0, SRC)
from buildlib import expand_scripts  # noqa: E402
# The source pages are fragments (title, styles, body content). A standalone page needs a doctype and charset.
HEAD = ('<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n')


def run(script):
    print('>', os.path.relpath(script, ROOT))
    subprocess.run([sys.executable, script], check=True)


def page(src, dest):
    html = expand_scripts(open(src, encoding='utf-8').read(), os.path.dirname(src))  # <!--@scripts …--> markers
    if not html.lstrip().lower().startswith('<!doctype'):
        html = HEAD + html
    path = os.path.join(ROOT, dest)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(html)
    print(f'  wrote {dest} ({len(html.encode()) // 1024} KB)')


run(os.path.join(SRC, 'builder', 'build.py'))
run(os.path.join(SRC, 'designer', 'build.py'))
panel = os.path.join(SRC, 'classic', 'out', 'Classic_OLED_3840x2160.sensorpanel')
if '--all' in sys.argv or not os.path.exists(panel):
    run(os.path.join(SRC, 'classic', 'gen.py'))
run(os.path.join(SRC, 'classic', 'build_page.py'))

page(os.path.join(SRC, 'builder', 'modern-split-builder.html'), 'builder/index.html')
page(os.path.join(SRC, 'designer', 'designer.html'), 'designer/index.html')
page(os.path.join(SRC, 'classic', 'classic-oled-panel.html'), 'classic/index.html')
page(os.path.join(SRC, 'sensors', 'aida64-sensor-reference.html'), 'sensors/index.html')

os.makedirs(os.path.join(ROOT, 'panels'), exist_ok=True)
shutil.copyfile(panel, os.path.join(ROOT, 'panels', os.path.basename(panel)))  # byte copy keeps CRLF and cp1252
print('  copied panels/' + os.path.basename(panel))
