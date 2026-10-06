"""Build the Panel Designer page: template.html + embedded fonts + inlined scripts -> designer.html
(build_site.py publishes it as designer/index.html)."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
sys.path.insert(0, SRC)
from buildlib import font_face_css, script_tag  # noqa: E402

# Logic with no page boot code: the unit-test harness in check_designer.py loads only these.
CORE_SCRIPTS = [
    '../shared/fontmetrics.js', '../shared/sp-core.js', '../shared/sp-zip.js', '../shared/sp-writer.js', '../shared/sp-parse.js',
    '../shared/sp-render.js', '../sensors/catalog.js',
    'js/pc.js', 'js/sim.js', 'js/doc.js', 'js/paint.js', 'js/widgets.js', 'js/gauges.js', 'js/composites.js', 'js/snippets.js',
    'js/compile.js', 'js/theme-modern.js', 'js/theme-classic.js', 'js/open.js', 'js/store.js', 'js/assist-core.js', 'js/assist-net.js',
]
UI_SCRIPTS = ['js/editor.js', 'js/ui.js', 'js/assist.js', 'js/app.js']


def scripts(names):
    return '\n'.join(script_tag(os.path.normpath(os.path.join(HERE, n))) for n in names if os.path.exists(os.path.join(HERE, n)))


def fonts():
    sel = os.path.join(SRC, 'fonts', 'selawik')
    bsc = os.path.join(SRC, 'fonts', 'barlow-semi-condensed')
    return '\n'.join([
        font_face_css('Selawik Local', [(w, os.path.join(sel, f'Selawik-{n}.ttf')) for w, n in ((300, 'Light'), (400, 'Regular'), (700, 'Bold'))]),
        font_face_css('Barlow SC Local', [(w, os.path.join(bsc, f'barlow-semi-condensed-latin-{w}-normal.woff2')) for w in (300, 400, 500, 600)]),
    ])


def main():
    t = open(os.path.join(HERE, 'template.html'), encoding='utf-8').read()
    t = t.replace('/*__FONTS__*/', fonts()).replace('<!--__SCRIPTS__-->', scripts(CORE_SCRIPTS + UI_SCRIPTS))
    out = os.path.join(HERE, 'designer.html')
    with open(out, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(t)
    print('KB', len(t.encode()) // 1024)


if __name__ == '__main__':
    main()
