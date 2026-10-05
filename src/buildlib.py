"""Helpers shared by the page build scripts.

Pages stay single self-contained files (they work from file://, GitHub Pages and the Claude artifact viewer), so
shared JavaScript is inlined at build time: a marker comment

    <!--@scripts ../shared/sp-core.js ../shared/sp-zip.js-->

is replaced by one inline <script> per file, each ending in a //# sourceURL so errors point at the real file.
Paths are relative to the page source.
"""
import base64
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARKER = re.compile(r'<!--@scripts\s+([^>]*?)\s*-->')


def script_tag(path):
    src = open(path, encoding='utf-8').read().rstrip()
    if '</script' in src.lower():
        raise ValueError(f'{path} contains "</script", which would end the inline script early')
    rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
    return f'<script>\n{src}\n//# sourceURL={rel}\n</script>'


def expand_scripts(html, base_dir):
    """Replace every <!--@scripts a.js b.js--> marker with inline script tags."""
    def repl(m):
        return '\n'.join(script_tag(os.path.normpath(os.path.join(base_dir, p))) for p in m.group(1).split())
    return MARKER.sub(repl, html)


def font_face_css(family, faces):
    """faces: [(weight, path)]. Returns @font-face rules with the fonts embedded as data URIs."""
    rules = []
    for weight, path in faces:
        ext = os.path.splitext(path)[1].lower().lstrip('.')
        mime, fmt = {'ttf': ('font/ttf', 'truetype'), 'woff2': ('font/woff2', 'woff2')}[ext]
        data = base64.b64encode(open(path, 'rb').read()).decode()
        rules.append(f"@font-face{{font-family:'{family}';font-weight:{weight};font-style:normal;font-display:block;"
                     f"src:url(data:{mime};base64,{data}) format('{fmt}')}}")
    return '\n'.join(rules)
