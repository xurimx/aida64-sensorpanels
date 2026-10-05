"""Embed the Selawik fonts into template.html -> modern-split-builder.html (run build_site.py at the repo root to publish it)."""
import base64
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))  # paths below are relative to this folder
css = '\n'.join(
    f"@font-face{{font-family:'Selawik Local';font-weight:{w};font-style:normal;font-display:block;src:url(data:font/ttf;base64,{base64.b64encode(open(f'../fonts/selawik/Selawik-{n}.ttf','rb').read()).decode()}) format('truetype')}}"
    for w, n in ((300, 'Light'), (400, 'Regular'), (700, 'Bold')))
t = open('template.html', encoding='utf-8').read().replace('/*__FONTS__*/', css)
open('modern-split-builder.html', 'w', encoding='utf-8').write(t)
print('KB', len(t.encode()) // 1024)
