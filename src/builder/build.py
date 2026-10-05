"""Embed the Selawik fonts and the shared scripts into template.html -> modern-split-builder.html
(run build_site.py at the repo root to publish it)."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # src/, for buildlib
from buildlib import expand_scripts, font_face_css  # noqa: E402

css = font_face_css('Selawik Local', [(w, os.path.join(HERE, '..', 'fonts', 'selawik', f'Selawik-{n}.ttf'))
                                      for w, n in ((300, 'Light'), (400, 'Regular'), (700, 'Bold'))])
t = open(os.path.join(HERE, 'template.html'), encoding='utf-8').read().replace('/*__FONTS__*/', css)
t = expand_scripts(t, HERE)
open(os.path.join(HERE, 'modern-split-builder.html'), 'w', encoding='utf-8').write(t)
print('KB', len(t.encode()) // 1024)
