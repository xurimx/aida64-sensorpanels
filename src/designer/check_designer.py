"""Designer checks: unit tests on a harness page with the designer's core scripts, plus end-to-end checks on the
built page (designer/index.html).

Run:  uv run --with playwright --with pillow python src/designer/check_designer.py            all groups
      uv run --with playwright --with pillow python src/designer/check_designer.py io pc      some groups
Needs a built site (python build_site.py) for the builder comparisons and the page checks.
"""
import asyncio
import base64
import hashlib
import json
import os
import re
import sys
import tempfile
import time

import importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


designer_build = load('designer_build', os.path.join(HERE, 'build.py'))
check_export = load('check_export', os.path.join(ROOT, 'src', 'builder', 'check_export.py'))

AIDA_SAMPLE = r'C:\Program Files\FinalWire\AIDA64 Extreme\sensorpanel_default.spzip'
CLASSIC = os.path.join(ROOT, 'panels', 'Classic_OLED_3840x2160.sensorpanel')
FIX = os.path.join(HERE, 'fixtures')
b64 = lambda b: base64.b64encode(b).decode()
unb64 = lambda s: base64.b64decode(s)

HARNESS_JS = r'''
window.T = {
  b64: s => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
  tob64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
  async blob64(b) { return T.tob64(new Uint8Array(await b.arrayBuffer())); },
};
'''

PASSED, FAILED = [], []
sys.stdout.reconfigure(encoding='utf-8', errors='replace')


def ok(cond, name, detail=''):
    (PASSED if cond else FAILED).append(name)
    print(('  ok   ' if cond else '  FAIL ') + name + ('' if cond or not detail else f'  -- {detail}'))


def harness_html():
    head = '<!doctype html><html lang="en"><meta charset="utf-8"><title>harness</title><style>' + designer_build.fonts() + '</style><body>'
    return head + designer_build.scripts(designer_build.CORE_SCRIPTS) + f'<script>{HARNESS_JS}{COMPARE_JS}</script></body></html>'


async def open_harness(browser):
    path = os.path.join(tempfile.mkdtemp(), 'harness.html')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(harness_html())
    pg = await browser.new_page(viewport={'width': 1400, 'height': 900})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    await pg.goto('file:///' + path.replace(os.sep, '/'))
    await pg.wait_for_function('document.fonts.status === "loaded"')
    return pg, errors


# ---------------------------------------------------------------- io: file formats
async def test_io(pg, env):
    print('io: read/write .sensorpanel, .sp2, .spzip')
    rt = '''async b => { const p = SP.parse.parsePanel(T.b64(b)); return T.tob64(await SP.writer.writePanel(SP.parse.toModel(p))); }'''
    builder = env['builder_default']
    out = unb64(await pg.evaluate(rt, b64(builder)))
    ok(out == builder, 'builder export: parse + write reproduces the bytes', f'{len(out)} vs {len(builder)}')
    classic = open(CLASSIC, 'rb').read()
    out = unb64(await pg.evaluate(rt, b64(classic)))
    ok(out == classic, 'Classic OLED file: parse + write reproduces the bytes', f'{len(out)} vs {len(classic)}')
    info = await pg.evaluate('''b => { const p = SP.parse.parsePanel(T.b64(b)); const k = {}; p.items.forEach(i => k[i.kind] = (k[i.kind] || 0) + 1);
      return { kinds: k, imgs: p.images.size, w: p.w, h: p.h, hidden: p.items.filter(i => i.hidden).length }; }''', b64(classic))
    ok(info['kinds'].get('IMG') == 10 and info['kinds'].get('GAUGE') == 52 and info['imgs'] == 183, 'Classic file: 10 IMG, 52 GAUGE, 183 images (180 frames + 3 files)', json.dumps(info))
    # .spzip written by us: zip -> unzip -> parse gives the same items as the .sensorpanel
    same = await pg.evaluate('''async b => {
      const m = SP.parse.toModel(SP.parse.parsePanel(T.b64(b)));
      const zip = await SP.writer.writeSpzip(m, () => {}, 100, [{ name: 'designer.json', data: new TextEncoder().encode('{"x":1}') }]);
      const p2 = await SP.parse.parseSpzip(new Uint8Array(await zip.arrayBuffer()));
      const strip = it => JSON.stringify({ ...it, imgs: undefined });
      const a = m.items.map(strip), c = SP.parse.toModel(p2).items.map(strip);
      const imgsOk = [...m.imgs.keys()].every(n => p2.images.has(n) && p2.images.get(n).length === m.imgs.get(n).length);
      return { items: a.length === c.length && a.every((s, i) => s === c[i]), imgsOk, designer: p2.designer, ver: p2.ver };
    }''', b64(builder))
    ok(same['items'] and same['imgsOk'] and same['designer'] == '{"x":1}' and same['ver'] == 200, '.spzip round trip keeps items, images and designer.json', json.dumps(same))
    enc = await pg.evaluate('''() => Array.from(SP.core.enc1252('a°€’—😀\\u0081é'))''')
    ok(enc == [97, 0xB0, 0x80, 0x92, 0x97, 63, 63, 0xE9], 'cp1252 encoder maps €, ’, — and replaces the rest with ?', str(enc))
    if os.path.exists(AIDA_SAMPLE):
        info = await pg.evaluate('''async b => { const p = await SP.parse.parseSpzip(T.b64(b)); const k = {};
          p.items.forEach(i => k[i.kind] = (k[i.kind] || 0) + 1); const m = SP.parse.toModel(p);
          const sp2 = await SP.writer.writeSp2(m); const again = SP.parse.parsePanel(sp2.sp2);
          return { n: p.items.length, kinds: k, ver: p.ver, enc: p.encoding, w: p.w, rewritten: again.items.length, macro: p.items.some(i => i.tags.some(t => t[1] === '$CPUMODEL')) }; }''',
                                b64(open(AIDA_SAMPLE, 'rb').read()))
        ok(info['n'] == 29 and info['kinds'] == {'IMG': 4, 'SIMPLE': 4, 'GAUGE': 3, 'LBL': 7, 'SITEM': 9, 'GRAPH': 2} and info['rewritten'] == 29,
           'AIDA64 8.25 sample .spzip: 29 items parse and re-write', json.dumps(info))
    else:
        print('  skip AIDA64 sample (not installed)')


# ---------------------------------------------------------------- pc: sensor lists and hardware detection
async def test_pc(pg, env):
    print('pc: sensor lists and hardware detection')
    files = {n: open(os.path.join(FIX, n), 'rb').read() for n in ('owner.reg', 'owner.regquery.txt', 'owner.sharedmem.txt')}
    res = await pg.evaluate('''files => {
      const out = {};
      for (const [n, b] of Object.entries(files)) {
        const l = parseSensorList(n.endsWith('.txt') ? new TextDecoder(n.includes('sharedmem') ? 'windows-1252' : 'utf-8').decode(T.b64(b)) : T.b64(b));
        const { hw, notes } = inferHw(l);
        out[n] = { source: l.source, n: l.sensors.size, warnings: l.warnings, ext: l.sensors.get('SEXTIPADDR'), thdd: l.sensors.get('THDD1'),
                   map: JSON.stringify([...l.sensors].map(([id, s]) => [id, s.label, s.value]).sort()), hw, notes };
      }
      return out;
    }''', {n: b64(b) for n, b in files.items()})
    a, q, x = res['owner.reg'], res['owner.regquery.txt'], res['owner.sharedmem.txt']
    ok((a['source'], q['source'], x['source']) == ('.reg file', 'registry paste', 'shared memory'), 'formats detected', f"{a['source']}, {q['source']}, {x['source']}")
    ok(a['n'] == 133 and a['map'] == q['map'] == x['map'], 'all three formats give the same 133 sensors', f"{a['n']} {q['n']} {x['n']}")
    ok(a['ext'] and a['ext']['value'] == '' and a['ext']['label'] == 'External IP Address', 'IP address values are dropped, labels kept', json.dumps(a['ext']))
    ok(not a['warnings'], 'no warnings for a complete list', json.dumps(a['warnings']))
    hw = a['hw']
    ok((hw['pCores'], hw['eCores'], hw['threads'], hw['smt']) == (6, 8, 20, True), '6 P + 8 E cores, 20 threads', json.dumps(hw))
    ok(hw['nic'] == 6 and hw['dimms'] == [2, 4] and hw['cpuTemp'] == 'TCPUPKG' and hw['gpu'] == 1 and hw['gpuTemp'] == 'TGPU1DIO', 'NIC6, DIMM 2/4, CPU Package, GPU1 Diode')
    ok([(d['num'], d['letter']) for d in hw['disks']] == [(1, 'C'), (2, 'D')] and hw['disks'][0]['name'] == 'SAMSUNG SSD ', 'disks 1/2 on C:/D:, named from the drive model', json.dumps(hw['disks']))
    ok([f['id'] for f in hw['fans']] == ['FCPU', 'FAIOPUMP', 'FCHA1', 'FCHA2', 'FCHA3', 'FGPU1'], 'six spinning fans in panel order (stopped FCHA4 left out)', json.dumps([f['id'] for f in hw['fans']]))
    ok(all(hw['extras'].values()), 'every extra reading detected', json.dumps(hw['extras']))
    odd = await pg.evaluate('''() => {
      const t = (s) => { try { const l = parseSensorList(s); return { n: l.sensors.size, w: l.warnings.length, hw: inferHw(l).hw, ab: l.sensors.get('TCPU')?.label, ip: l.sensors.get('SEXTIPADDR')?.value }; } catch (e) { return { err: e.message }; } };
      const amd = Array.from({ length: 8 }, (_, i) => `<sys><id>SCC-1-0${i + 1}</id><label>c</label><value>4500</value></sys>`).join('')
        + Array.from({ length: 16 }, (_, i) => `<sys><id>SCPU${i + 1}UTI</id><label>t</label><value>5</value></sys>`).join('') + '<temp><id>TCPUTCTL</id><label>CPU Tctl</label><value>60</value></temp>';
      const noS = '    Label.TCPU    REG_SZ    CPU\\r\\n    Value.TCPU    REG_SZ    45';
      return { amd: t(amd), noS: t(noS), junk: t('hello world'), html: t('<temp><id>TCPU</id><label>A & B</label><value>45</value></temp><sys><id>SEXTIPADDR</id><label>IP</label><value><html>err</value></sys>') };
    }''')
    ok(odd['amd'].get('hw', {}).get('pCores') == 8 and odd['amd']['hw']['eCores'] == 0 and odd['amd']['hw']['cpuTemp'] == 'TCPUTCTL', 'AMD 8C/16T: 8 cores with SMT, Tctl, SCC-1-01 normalised', json.dumps(odd['amd']))
    ok(odd['noS'].get('w') == 1, 'a list without system readings warns to click Select All', json.dumps(odd['noS']))
    ok('err' in odd['junk'], 'text without sensors is rejected with a message', json.dumps(odd['junk']))
    ok(odd['html'].get('n') == 2 and odd['html']['ab'] == 'A & B' and odd['html']['ip'] == '' and odd['html']['hw']['fans'] == [], 'junk in shared memory is tolerated; no fans in the list means no fans', json.dumps(odd['html']))


COMPARE_JS = r'''
/* compare two AIDA64 files item by item: kinds, dividers, readings (with frame image hashes) and the background */
window.T.compare = async (aB64, bB64, tol) => {
  const A = SP.parse.parsePanel(T.b64(aB64)), B = SP.parse.parsePanel(T.b64(bB64));
  const ma = SP.parse.toModel(A), mb = SP.parse.toModel(B);
  const hash = (m, n) => { const b = m.imgs.get(n); return b ? b.length + ':' + SP.zip.crc32(b) : 'missing:' + n; };
  const norm = (m, it) => ({ k: it.kind, s: it.sensor || '', lo: it.lo !== undefined ? SP.core.fmtNum(it.lo) : '', hi: it.hi !== undefined ? SP.core.fmtNum(it.hi) : '',
    pt: it.kind === 'GAUGE' && !it.showVal ? '' : it.pt ?? '', font: it.kind === 'GAUGE' && !it.showVal ? '' : it.font || '', col: it.col ? it.col.join(',') : '', unit: it.unit ?? '', al: it.align || '',
    sv: !!it.showVal, w: it.w ?? '', h: it.h ?? '', fr: it.kind === 'GAUGE' ? (it.frames || []).map(f => f ? hash(m, f) : '').join('|') : '', x: it.x, y: it.y, lab: it.slabel ?? '' });
  const live = m => m.items.filter(i => ['SIMPLE', 'GAUGE', 'GRAPH', 'LBL'].includes(i.kind)).map(i => norm(m, i));
  const ra = live(ma), rb = live(mb), left = [...rb], miss = [], posd = [];
  for (const a of ra) {
    let best = -1, bd = 1e9;
    left.forEach((b, j) => { if (a.k !== b.k || a.s !== b.s || a.lo !== b.lo || a.hi !== b.hi || a.pt !== b.pt || a.font !== b.font || a.col !== b.col || a.unit !== b.unit || a.al !== b.al || a.sv !== b.sv || a.fr !== b.fr || a.w !== b.w || a.h !== b.h) return;
      const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); if (d < bd) { bd = d; best = j; } });
    if (best < 0 || bd > tol) miss.push({ ...a, fr: a.fr.slice(0, 40), near: bd }); else { posd.push(bd); left.splice(best, 1); }
  }
  const divs = m => m.items.filter(i => i.kind === 'DIV').map(i => i.text).join('\n');
  const imgs = m => m.items.filter(i => i.kind === 'IMG');
  const kinds = m => { const k = {}; m.items.forEach(i => k[i.kind] = (k[i.kind] || 0) + 1); return k; };
  /* background pixels: share of pixels that differ by more than one level */
  async function pixels(m) { const it = imgs(m)[0]; if (!it) return null; const bm = await createImageBitmap(new Blob([m.imgs.get(it.name)], { type: 'image/png' }));
    const c = SP.core.mk(bm.width, bm.height), x = c.getContext('2d'); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height).data; }
  const pa = await pixels(ma), pb = await pixels(mb); let diff = 0, lit = [0, 0];
  if (pa && pb && pa.length === pb.length) for (let i = 0; i < pa.length; i += 4) {
    if (Math.abs(pa[i] - pb[i]) > 1 || Math.abs(pa[i + 1] - pb[i + 1]) > 1 || Math.abs(pa[i + 2] - pb[i + 2]) > 1) diff++;
    if (pa[i] > 6 || pa[i + 1] > 6 || pa[i + 2] > 6) lit[0]++; if (pb[i] > 6 || pb[i + 1] > 6 || pb[i + 2] > 6) lit[1]++;
  }
  return { kindsA: kinds(ma), kindsB: kinds(mb), divsSame: divs(ma) === divs(mb), divA: divs(ma).split('\n').length, imgA: imgs(ma).length, imgB: imgs(mb).length,
           missing: miss.slice(0, 8), nMissing: miss.length, extra: left.length, maxPos: Math.max(0, ...posd), bgDiff: pa && pb ? diff / (pa.length / 4) : null,
           lit: lit.map(v => pa ? v / (pa.length / 4) : 0) };
};
'''


# ---------------------------------------------------------------- widgets: compile, gauge stacks, flatten rule, round trips
async def test_widgets(pg, env):
    print('widgets: gauge stacks, flatten rule, round trips')
    sweep = await pg.evaluate('''async () => {
      const doc = newDoc({ w: 1600, h: 1200 }), env = makeEnv(doc), out = {};
      const add = (type, p, x, y) => { const w = WF.make(type, p, x, y, 0, 0); const m = WT[type].measure ? WT[type].measure(w.p, env, w) : null; if (m) { w.w = m.w; w.h = m.h; } else { w.w = 440; w.h = 18; } doc.nodes.push(w); return w; };
      const cases = { big: add('dial', { style: 'big', lo: 20, hi: 100 }, 0, 0), small: add('dial', { style: 'small', r: 240, lo: 0, hi: 250 }, 0, 0),
                      lin: add('meter', { scale: 'pct' }, 0, 0), log: add('meter', { scale: 'net' }, 0, 0) };
      for (const [k, w] of Object.entries(cases)) {
        const items = widgetOps(w, env).filter(o => o.t === 'item').map(o => o.it); let bad = 0, n = 0;
        const lo = k === 'log' ? -50 : w.p.lo, hi = k === 'log' ? 130000 : w.p.hi, step = (hi - lo) / 997;
        for (let v = lo - 10 * step; v <= hi + 10 * step; v += step) { n++; const vis = items.filter(it => it.frames[SP.core.stateOf(v, it.lo, it.hi)]).length; if (vis !== 1) bad++; }
        out[k] = { gauges: items.length, bad, n };
      }
      const bars = { b15: add('bar', { segs: 15 }, 0, 0), b30: add('bar', { segs: 30 }, 0, 0), b10: add('bar', { segs: 10 }, 0, 0), ring: add('ring', {}, 0, 0) };
      for (const [k, w] of Object.entries(bars)) {
        const items = widgetOps(w, env).filter(o => o.t === 'item').map(o => o.it); let bad = 0; const segs = w.p.segs;
        for (let j = 0; j <= segs; j++) for (const f of [0.02, 0.5, 0.98]) {
          const v = w.p.lo + (j + f) * (w.p.hi - w.p.lo) / segs, want = Math.min(segs, j);
          const lit = items.reduce((s, it) => { const name = it.frames[SP.core.stateOf(v, it.lo, it.hi)]; const fr = FRAMES.get(name); return s + (fr ? countLit(name, it) : 0); }, 0);
          if (lit !== want) bad++;
        }
        out[k] = { gauges: items.length, bad };
      }
      function countLit(name) { const m = name.match(/_(\\d+)\\.png$/); return 0; }
      return out;
    }''')
    for k in ('big', 'small', 'lin', 'log'):
        s = sweep[k]
        ok(s['bad'] == 0, f'{k} needle/pointer: exactly one visible at all {s["n"]} test values ({s["gauges"]} stacked gauges)', json.dumps(s))
    seg = await pg.evaluate('''() => {
      const doc = newDoc({ w: 1600, h: 1200 }), env = makeEnv(doc), out = {};
      const litCount = c => { if (!c) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let runs = 0, prev = false;
        const y = Math.floor(c.height / 2); for (let x = 0; x < c.width; x++) { const on = d[(y * c.width + x) * 4 + 3] > 128; if (on && !prev) runs++; prev = on; } return runs; };
      for (const [k, segs] of [['b15', 15], ['b30', 30], ['b10', 10], ['b7', 7]]) {
        const w = WF.make('bar', { segs, lo: 0, hi: 100, gap: 6 }, 0, 0, 900, 20); const items = widgetOps(w, env).filter(o => o.t === 'item').map(o => o.it); let bad = 0;
        for (let j = 0; j < segs; j++) for (const f of [0.03, 0.5, 0.97]) {
          const v = (j + f) * 100 / segs; const lit = items.reduce((s, it) => s + litCount(frameCanvas(it.frames[SP.core.stateOf(v, it.lo, it.hi)])), 0);
          if (lit !== j) bad++;
        }
        const full = items.reduce((s, it) => s + litCount(frameCanvas(it.frames[SP.core.stateOf(100, it.lo, it.hi)])), 0);
        out[k] = { gauges: items.length, bad, full };
      }
      return out;
    }''')
    for k, segs in (('b15', 15), ('b30', 30), ('b10', 10), ('b7', 7)):
        s = seg[k]
        ok(s['bad'] == 0 and s['full'] == segs, f'bar with {segs} segments lights the right count everywhere ({s["gauges"]} gauges)', json.dumps(s))
    flat = await pg.evaluate('''async () => {
      const mkdoc = order => { const doc = newDoc({ w: 1200, h: 600 }); const g = WF.graph('SCPUUTI', 100, 100, 600, 200, 0, 100, '@cpu'); const t = WF.text(120, 160, 'OVER THE GRAPH', 40, 'bold', '@hi');
        doc.nodes.push(...(order === 'text-first' ? [t, g] : [g, t])); return doc; };
      const kinds = m => m.items.map(i => i.kind).join(',');
      const a = await compileDoc(mkdoc('text-first'), makeEnv(mkdoc('text-first'))), b = await compileDoc(mkdoc('graph-first'), makeEnv(mkdoc('graph-first')));
      const d = newDoc({ w: 1200, h: 1200 }); d.nodes.push(WF.make('dial', { style: 'big' }, 80, 80, 1040, 1040));
      const c = await compileDoc(d, makeEnv(d));
      const r = newDoc({ w: 1200, h: 1200 }); r.nodes.push(WF.ring('SCPUUTI', 0, 100, 600, 600, 346, 380), WF.ring('TCPUPKG', 20, 100, 600, 600, 304, 322));
      const e = await compileDoc(r, makeEnv(r));
      return { textFirst: kinds(a), graphFirst: kinds(b), dial: kinds(c), rings: kinds(e).split(',').filter(k => k === 'IMG').length };
    }''')
    ok(flat['textFirst'] == 'IMG,GRAPH', 'text below a graph goes into the background', flat['textFirst'])
    ok(flat['graphFirst'] == 'IMG,GRAPH,IMG', 'text above a graph becomes its own image after it', flat['graphFirst'])
    ok(flat['dial'].endswith('GAUGE,GAUGE,GAUGE,IMG') and flat['dial'].startswith('IMG'), 'dial hub is lifted above the needles', flat['dial'])
    ok(flat['rings'] == 1, 'nested rings stay in one background (transparent frame areas are not overlaps)', str(flat['rings']))
    # round trips through files
    rt = await pg.evaluate('''async (b) => {
      const out = {};
      for (const [name, b64] of Object.entries(b)) {
        const bytes = T.b64(b64), { doc } = await docFromPanel(bytes, name);
        const m = await compileDoc(doc, makeEnv(doc)); const again = await SP.writer.writePanel(m);
        out[name] = { same: again.length === bytes.length && again.every((v, i) => v === bytes[i]), n: again.length, m: bytes.length, widgets: widgetCount(doc), groups: doc.nodes.filter(n => n.type === 'group').length };
      }
      const doc = themeModern({ w: 3840, h: 2160 }, hwClone(HW_DEFAULTS), {});
      const m = await compileDoc(doc, makeEnv(doc));
      const zip = await SP.writer.writeSpzip(m, () => {}, 100, [{ name: 'designer.json', data: new TextEncoder().encode(await designFile(doc).text()) }]);
      const back = await docFromPanel(new Uint8Array(await zip.arrayBuffer()), 'x.spzip');
      out.spzipExact = back.exact && JSON.stringify(back.doc.nodes) === JSON.stringify(sanitizeDoc(JSON.parse(JSON.stringify(doc))).nodes);
      const link = await shareLink(doc); const fromLink = await docFromLink('#' + link.url.split('#')[1]);
      out.linkSame = JSON.stringify(fromLink.nodes) === JSON.stringify(sanitizeDoc(JSON.parse(JSON.stringify(doc))).nodes); out.linkLen = link.length;
      return out;
    }''', {'builder.sensorpanel': b64(env['builder_default']), 'classic.sensorpanel': b64(open(CLASSIC, 'rb').read())})
    for n in ('builder.sensorpanel', 'classic.sensorpanel'):
        r = rt[n]
        ok(r['same'], f'open {n} as a design and export it again: identical bytes ({r["widgets"]} widgets, {r["groups"]} groups)', json.dumps(r))
    # one of every palette entry, plus an image and a native label: both formats, reopened
    ks = await pg.evaluate('''async () => {
      const doc = newDoc({ w: 3840, h: 2160, tokens: { ...TOKENS_MODERN, ...TOKENS_CLASSIC } }), env = makeEnv(doc);
      const png = await new Promise(r => { const c = SP.core.mk(64, 48), x = c.getContext('2d'); x.fillStyle = '#3dd9c5'; x.fillRect(8, 8, 40, 30); c.toBlob(b => b.arrayBuffer().then(a => r(new Uint8Array(a)))); });
      const asset = await addAsset(png, 'image/png', 'logo.png');
      const W = (type, p, w, h) => { const d = WT[type], n = WF.make(type, p, 0, 0, w || 300, h || 100); if (d.measure && d.resize !== 'free') { const m = d.measure(n.p, env, n); n.w = m.w; n.h = m.h; } return [n]; };
      const entries = [
        ...['text', 'value', 'rect', 'graph', 'bar', 'ring', 'dial', 'meter', 'readout', 'coreTable', 'powerTable', 'storageTable', 'fanRow'].map(t => W(t, {})),
        W('text', { native: true, text: '$CPUMODEL', pt: 20 }), W('value', { align: 'c', sensor: 'TCPUPKG' }), W('value', { align: 'r', unit: ' %' }),
        W('image', { asset, name: 'logo.png' }, 128, 96), W('image', { asset, name: 'logo.png', separate: true }, 64, 48),
        ...PRESETS.map(p => p.make({ hw: hwClone(HW_DEFAULTS) })),
      ];
      let x = 0, y = 0, row = 0;
      for (const ws of entries) {
        const b = [Math.min(...ws.map(w => w.x)), Math.min(...ws.map(w => w.y))];
        for (const w of ws) { w.x += x - b[0]; w.y += y - b[1]; }
        doc.nodes.push(ws.length > 1 ? { id: nid('g'), type: 'group', name: 'set ' + doc.nodes.length, children: ws } : ws[0]);
        x += 260; if (x > 3500) { x = 0; y += 220; }
      }
      const clean = sanitizeDoc(JSON.parse(JSON.stringify(doc)));
      const m = await compileDoc(clean, makeEnv(clean)), sp = await SP.writer.writePanel(m);
      const zip = await SP.writer.writeSpzip(m, () => {}, 100, [{ name: 'designer.json', data: new TextEncoder().encode(await designFile(clean).text()) }]);
      const z = await docFromPanel(new Uint8Array(await zip.arrayBuffer()), 'k.spzip');
      const p = await docFromPanel(sp, 'k.sensorpanel'), again = await SP.writer.writePanel(await compileDoc(p.doc, makeEnv(p.doc)));
      const kinds = {}; m.items.forEach(i => kinds[i.kind] = (kinds[i.kind] || 0) + 1);
      return { types: [...new Set((() => { const t = []; eachWidget(clean, w => t.push(w.type)); return t; })())].length, kinds,
               exact: z.exact && JSON.stringify(z.doc.nodes) === JSON.stringify(clean.nodes), same: again.length === sp.length && again.every((v, i) => v === sp[i]) };
    }''')
    ok(ks['exact'], f'every widget type ({ks["types"]} types) survives .spzip export and reopening exactly', json.dumps(ks['kinds']))
    ok(ks['same'], 'the same design as .sensorpanel opens and exports again byte-identical', json.dumps(ks['kinds']))
    ok(rt['spzipExact'], 'our .spzip reopens as exactly the same design (designer.json)')
    ok(rt['linkSame'], f'share link round trip keeps the design ({rt["linkLen"]} characters)')


# ---------------------------------------------------------------- themes: parity with the builder and the Classic file
async def test_themes(pg, env):
    print('themes: Modern Split vs the builder, Classic OLED vs gen.py, other hardware')
    gen = await pg.evaluate('''async (cfgs) => {
      const out = {};
      for (const [name, c] of Object.entries(cfgs)) {
        const doc = themeModern({ w: c.w || 3840, h: c.h || 2160 }, hwClone(HW_DEFAULTS), c.opts || {});
        const m = await compileDoc(doc, makeEnv(doc));
        out[name] = T.tob64(await SP.writer.writePanel(m, () => {}, c.dpi || 100));
      }
      const cl = hwClone(HW_DEFAULTS); cl.nic = 1;
      const cdoc = themeClassic({ w: 3840, h: 2160 }, cl, {});
      out.classic = T.tob64(await SP.writer.writePanel(await compileDoc(cdoc, makeEnv(cdoc))));
      return out;
    }''', {'default': {}, 'dpi200': {'dpi': 200}, 'title': {'opts': {'hmode': 'title', 'title': 'TEST RIG'}}})
    for name in ('default', 'dpi200', 'title'):
        r = await pg.evaluate('([a, b]) => T.compare(a, b, 1)', [b64(env['builder'][name]), gen[name]])
        ok(r['kindsA'] == r['kindsB'], f'Modern Split [{name}]: same item counts as the builder', f"{r['kindsA']} vs {r['kindsB']}")
        ok(r['divsSame'], f'Modern Split [{name}]: same {r["divA"]} divider labels in the same order')
        ok(r['nMissing'] == 0 and r['extra'] == 0, f'Modern Split [{name}]: every reading matches (sensor, range, font, colour, unit, frames) within 1 px',
           f"missing {r['nMissing']} extra {r['extra']} first: {json.dumps(r['missing'][:3])}")
        ok(r['imgB'] == 1, f'Modern Split [{name}]: one background image', str(r['imgB']))
        ok(r['bgDiff'] is not None and r['bgDiff'] <= 0.001, f'Modern Split [{name}]: background differs by more than 1 level on {r["bgDiff"] * 100 if r["bgDiff"] is not None else -1:.3f} % of pixels')
    r = await pg.evaluate('([a, b]) => T.compare(a, b, 2)', [b64(open(CLASSIC, 'rb').read()), gen['classic']])
    ok(r['kindsA'] == r['kindsB'], 'Classic OLED: same item counts as the gen.py file', f"{r['kindsA']} vs {r['kindsB']}")
    ok(r['divsSame'], 'Classic OLED: same divider labels in the same order')
    sens = await pg.evaluate('''([a, b]) => { const f = s => SP.parse.toModel(SP.parse.parsePanel(T.b64(s))).items.filter(i => i.kind === 'GAUGE' || i.kind === 'SIMPLE')
        .map(i => ({ k: [i.kind, i.sensor, SP.core.fmtNum(i.lo ?? 0), SP.core.fmtNum(i.hi ?? 0)].join(' '), x: i.x, y: i.y, tol: (i.frames || []).some(f => /^needle/.test(f)) ? 4 : 2 }));
      const A = f(a), B = f(b), miss = [];
      for (const it of A) { const j = B.findIndex(o => o.k === it.k && Math.abs(o.x - it.x) <= it.tol && Math.abs(o.y - it.y) <= it.tol); if (j < 0) miss.push(`${it.k} @${it.x},${it.y}`); else B.splice(j, 1); }
      return { n: A.length, miss: miss.length, ex: miss.slice(0, 5), B: B.slice(0, 5).map(o => `${o.k} @${o.x},${o.y}`) }; }''',
                           [b64(open(CLASSIC, 'rb').read()), gen['classic']])
    ok(sens['miss'] == 0, f'Classic OLED: sensors, gauge ranges and positions match (±2 px; needle stacks ±4 px, cropped differently from Pillow) for {sens["n"] - sens["miss"]} of {sens["n"]} readings', json.dumps(sens))
    ok(r['imgB'] == 10, 'Classic OLED: 10 images (background + 9 hubs above the needles)', str(r['imgB']))
    ok(r['lit'][0] > 0 and abs(r['lit'][1] - r['lit'][0]) / r['lit'][0] <= 0.05, f'Classic OLED: background lit pixels within 5 % ({r["lit"][0] * 100:.2f} % vs {r["lit"][1] * 100:.2f} %)')
    other = await pg.evaluate('''async () => {
      const prof = { amd: { pCores: 8, eCores: 0, smt: true, threads: 16, cpuTemp: 'TCPUTCTL' }, arrow: { pCores: 8, eCores: 16, smt: false, threads: 24 },
                     disks4: { disks: [1, 2, 3, 4].map(n => ({ num: n, letter: 'CDEF'[n - 1], name: `DISK ${n}` })) }, nofans: { fans: [], nic: 0 } };
      const out = {};
      for (const [k, v] of Object.entries(prof)) {
        for (const theme of ['modern', 'classic']) {
          const hw = { ...hwClone(HW_DEFAULTS), ...v }, doc = THEMES[theme].make({ w: 3840, h: 2160 }, hw, {});
          const boxes = doc.nodes.filter(n => !(n.type === 'rect')).map(n => ({ n: n.name || n.type, b: nodeBox(n) }));
          let overlaps = 0, outside = 0;
          for (let i = 0; i < boxes.length; i++) { const a = boxes[i].b; if (a[0] < -1 || a[1] < -1 || a[0] + a[2] > 3841 || a[1] + a[3] > 2161) outside++;
            for (let j = i + 1; j < boxes.length; j++) { const b = boxes[j].b; if (a[0] + 2 < b[0] + b[2] && b[0] + 2 < a[0] + a[2] && a[1] + 2 < b[1] + b[3] && b[1] + 2 < a[1] + a[3]) overlaps++; } }
          const m = await compileDoc(doc, makeEnv(doc));
          out[k + '/' + theme] = { overlaps, outside, items: m.items.length };
        }
      }
      return out;
    }''')
    for k, v in other.items():
        ok(v['overlaps'] == 0 and v['outside'] == 0, f'{k}: generates without overlapping blocks ({v["items"]} items)', json.dumps(v))


# ---------------------------------------------------------------- editor: the built page, driven like a user
DESIGNER = os.path.join(ROOT, 'designer', 'index.html')
PAGE_URL = 'file:///' + DESIGNER.replace(os.sep, '/').lstrip('/')


async def new_page(browser, errors, **ctx_opts):
    ctx = await browser.new_context(viewport=ctx_opts.pop('viewport', {'width': 1600, 'height': 940}), accept_downloads=True, **ctx_opts)
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    pg.on('console', lambda m: m.type == 'error' and errors.append(f'console: {m.text}'))
    await pg.goto(PAGE_URL)
    await pg.wait_for_function('window.__designer && window.__designer.ready', timeout=30000)
    await pg.wait_for_timeout(300)
    return ctx, pg


async def test_editor(_pg, env):
    print('editor: palette, selection, transforms, groups, undo, files (built page)')
    browser, errors = env['browser'], []
    ctx, pg = await new_page(browser, errors)
    ok(await pg.evaluate("document.getElementById('dlg-start').open"), 'first visit opens the start dialog')
    await pg.click('#dlg-start [data-close]')
    st = await pg.evaluate("(() => { const r = document.getElementById('stage-wrap').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
    cx, cy = st[0] + st[2] / 2, st[1] + st[3] / 2
    start_json = await pg.evaluate('__designer.docJson()')
    count = lambda: pg.evaluate('__designer.APP.doc.nodes.length')
    # drag a ring from the palette onto the stage
    btn = pg.locator('#pane-add button', has_text='Segmented ring')
    b = await btn.bounding_box()
    await pg.mouse.move(b['x'] + 20, b['y'] + 10); await pg.mouse.down()
    await pg.mouse.move(cx - 200, cy, steps=8); await pg.mouse.move(cx - 300, cy - 50, steps=4); await pg.mouse.up()
    ring = await pg.evaluate("(() => { const n = __designer.APP.doc.nodes[0]; return n && { type: n.type, x: n.x + n.w / 2, y: n.y + n.h / 2, id: n.id }; })()")
    want = await pg.evaluate(f'__designer.toPanel({cx - 300 - st[0]}, {cy - 50 - st[1]})')
    ok(ring and ring['type'] == 'ring' and abs(ring['x'] - want[0]) < 30 and abs(ring['y'] - want[1]) < 30, 'drag from the palette drops a ring where the pointer was released', json.dumps([ring, want]))
    await pg.locator('#pane-add button', has_text='Text').first.click()
    ok(await count() == 2, 'click on a palette item adds it in the middle')
    # select and move the ring with the mouse
    sx, sy = await pg.evaluate(f"__designer.toScreen({ring['x']}, {ring['y']})")
    await pg.mouse.click(st[0] + sx, st[1] + sy)
    ok(await pg.evaluate(f"__designer.APP.sel.has('{ring['id']}')"), 'clicking the canvas selects the ring')
    x0 = await pg.evaluate('__designer.APP.doc.nodes[0].x')
    await pg.mouse.move(st[0] + sx, st[1] + sy); await pg.mouse.down(); await pg.mouse.move(st[0] + sx + 120, st[1] + sy + 7, steps=10); await pg.mouse.up()
    x1, z = await pg.evaluate('[__designer.APP.doc.nodes[0].x, __designer.APP.view.zoom]')
    ok(abs((x1 - x0) - 120 / z) < 10 / z + 8, f'dragging moves it by the pointer distance ({x1 - x0:.0f} px on the panel)')
    await pg.keyboard.press('Control+z')
    ok(abs(await pg.evaluate('__designer.APP.doc.nodes[0].x') - x0) < .01, 'Ctrl+Z puts it back')
    await pg.keyboard.press('Control+y')
    ok(abs(await pg.evaluate('__designer.APP.doc.nodes[0].x') - x1) < .01, 'Ctrl+Y moves it again')
    for _ in range(3): await pg.keyboard.press('ArrowRight')
    ok(abs(await pg.evaluate('__designer.APP.doc.nodes[0].x') - (x1 + 3)) < .01, 'arrow keys nudge 1 px')
    # resize with a handle (aspect widget: radius grows)
    r1 = await pg.evaluate('__designer.APP.doc.nodes[0].p.r1')
    hb = await pg.locator('#overlay .handle[data-h="se"]').bounding_box()
    await pg.mouse.move(hb['x'] + 5, hb['y'] + 5); await pg.mouse.down(); await pg.mouse.move(hb['x'] + 65, hb['y'] + 65, steps=6); await pg.mouse.up()
    ok(await pg.evaluate('__designer.APP.doc.nodes[0].p.r1') > r1 * 1.1, 'dragging a corner handle scales the ring')
    # marquee, group, enter, ungroup
    await pg.mouse.move(st[0] + 4, st[1] + 4); await pg.mouse.down(); await pg.mouse.move(st[0] + st[2] - 4, st[1] + st[3] - 40, steps=6); await pg.mouse.up()
    ok(await pg.evaluate('__designer.APP.sel.size') == 2, 'marquee selects both')
    await pg.keyboard.press('Control+g')
    g = await pg.evaluate("(() => { const d = __designer.APP.doc; return [d.nodes.length, d.nodes[0].type, d.nodes[0].children?.length]; })()")
    ok(g == [1, 'group', 2], 'Ctrl+G groups them', str(g))
    await pg.keyboard.press('Enter')
    ok(await pg.evaluate('!!__designer.APP.scope'), 'Enter edits inside the group')
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Control+Shift+g')
    ok(await count() == 2, 'Ctrl+Shift+G ungroups')
    await pg.keyboard.press('Control+a'); await pg.keyboard.press('Control+d')
    ok(await count() == 4, 'Ctrl+D duplicates the selection')
    await pg.keyboard.press('Delete')
    ok(await count() == 2, 'Delete removes the selection')
    # a table, detached into parts
    await pg.locator('#pane-add button', has_text='CPU core table').click()
    await pg.click('#inspector button:has-text("Detach parts")')
    det = await pg.evaluate("(() => { const n = __designer.APP.doc.nodes.at(-1); return [n.type, n.children?.length]; })()")
    ok(det[0] == 'group' and det[1] > 50, f'Detach turns the core table into a group of {det[1]} parts', str(det))
    # inspector edits
    await pg.evaluate("__designer.select([__designer.APP.doc.nodes[0].id])")
    sens = pg.locator('#inspector input[data-k="sensor"]')
    await sens.fill('TCPUPKG'); await sens.press('Enter')
    ok(await pg.evaluate('__designer.APP.doc.nodes[0].p.sensor') == 'TCPUPKG', 'the inspector changes the sensor')
    end_json = await pg.evaluate('__designer.docJson()')
    await pg.focus('#stage')
    n_undo = 0
    while await pg.evaluate('__designer.APP.past.length') and n_undo < 300:
        await pg.keyboard.press('Control+z'); n_undo += 1
    ok(await pg.evaluate('__designer.docJson()') == start_json, f'undo all the way ({n_undo} steps) gives the starting design')
    for _ in range(n_undo): await pg.keyboard.press('Control+y')
    ok(await pg.evaluate('__designer.docJson()') == end_json, 'redo all the way gives the final design')
    # touch: tap a palette item and drag it in with touch pointer events
    tctx, tpg = await new_page(browser, errors, has_touch=True, viewport={'width': 1280, 'height': 900})
    await tpg.click('#dlg-start [data-close]')
    await tpg.locator('#pane-add button', has_text='Graph').tap()
    ok(await tpg.evaluate('__designer.APP.doc.nodes.length') == 1, 'tapping a palette item adds it (touch)')
    await tctx.close()
    # sensor list by paste, then a theme for it
    reg = open(os.path.join(FIX, 'owner.regquery.txt'), encoding='utf-8').read()
    await pg.evaluate("t => { const e = new ClipboardEvent('paste', { clipboardData: new DataTransfer(), bubbles: true }); e.clipboardData.setData('text', t); document.body.dispatchEvent(e); }", reg)
    await pg.wait_for_timeout(200)
    ok(await pg.evaluate('__designer.APP.pc && __designer.APP.pc.sensors.size') == 133, 'pasting the registry text loads the sensor list')
    ok(await pg.evaluate("!document.querySelector('#scen [data-sc=pc]').hidden && document.querySelectorAll('#pane-pc .sens li').length > 100"), 'Your PC lists the sensors and offers My PC readings')
    await pg.evaluate("__designer.openTheme('modern')")
    await pg.click('#theme-form button[type=submit]')
    await pg.wait_for_timeout(500)
    ok(await pg.evaluate("__designer.APP.doc.gen?.theme === 'modern' && __designer.APP.doc.nodes.length > 10"), 'theme setup creates Modern Split for the loaded hardware')
    # drag performance on the 4K theme
    await pg.evaluate("__designer.APP.frameMs.length = 0")
    tgt = await pg.evaluate("(() => { const n = __designer.APP.doc.nodes.find(n => n.type === 'group'); const b = nodeBox(n); return __designer.toScreen(b[0] + b[2] / 2, b[1] + b[3] / 2); })()")
    await pg.mouse.move(st[0] + tgt[0], st[1] + tgt[1]); await pg.mouse.down()
    for i in range(30): await pg.mouse.move(st[0] + tgt[0] + i * 3, st[1] + tgt[1] + i, steps=1); await pg.wait_for_timeout(16)
    await pg.mouse.up()
    ms = sorted(await pg.evaluate('__designer.APP.frameMs.slice()'))
    med = ms[len(ms) // 2] if ms else -1
    ok(0 <= med < 50, f'median stage frame while dragging Modern Split: {med:.1f} ms ({len(ms)} frames)', str(ms[:5]))
    env['drag_ms'] = med
    # export from the dialog
    await pg.click('#btn-export'); await pg.wait_for_timeout(300)
    async with pg.expect_download(timeout=120000) as dl:
        await pg.click('#exp-go')
    d = await dl.value
    path = os.path.join(tempfile.mkdtemp(), d.suggested_filename); await d.save_as(path)
    data = open(path, 'rb').read()
    try: check_export.check(data); good = True
    except AssertionError as e: good = str(e)
    ok(good is True and d.suggested_filename.endswith('.sensorpanel'), f'Export downloads a valid {d.suggested_filename}', str(good))
    await pg.click('#dlg-export [data-close]')
    # dpi 200 halves the panel and text
    half = await pg.evaluate('''async () => { const doc = JSON.parse(__designer.docJson()); doc.export.dpi = 200; const r = await __designer.exportBytes(doc, 'sensorpanel');
      const t = new TextDecoder('windows-1252').decode(r.bytes); return [t.match(/<SPWIDTH>(\\d+)/)[1], t.match(/<SPHEIGHT>(\\d+)/)[1]]; }''')
    ok(half == ['1920', '1080'], 'Windows scale 200 % halves the panel size in the file', str(half))
    # open a .sensorpanel with the file picker
    await pg.set_input_files('#file-open', CLASSIC); await pg.wait_for_timeout(1500)
    imp = await pg.evaluate("(() => { let n = 0; eachWidget(__designer.APP.doc, () => n++); return [n, __designer.APP.doc.panel.w]; })()")
    ok(imp[0] == 75 and imp[1] == 3840, 'opening the Classic .sensorpanel makes 75 movable parts', str(imp))
    # share link round trip in a new page
    await pg.click('#btn-share'); await pg.wait_for_selector('#share-body textarea')
    url = await pg.input_value('#share-body textarea')
    doc_before = await pg.evaluate('JSON.stringify(sanitizeDoc(JSON.parse(__designer.docJson())).nodes)')
    sctx = await browser.new_context(viewport={'width': 1400, 'height': 900})
    spg = await sctx.new_page(); spg.on('pageerror', lambda e: errors.append(f'share page: {e}'))
    await spg.goto(url); await spg.wait_for_function('window.__designer && window.__designer.ready', timeout=30000)
    ok(await spg.evaluate('JSON.stringify(__designer.APP.doc.nodes)') == doc_before and '#' not in spg.url, 'a share link opens the same design (and clears itself from the address)')
    await sctx.close()
    await pg.click('#dlg-share [data-close]')
    # autosave and reload
    await pg.wait_for_timeout(1200)
    saved = await pg.evaluate('__designer.docJson()')
    await pg.reload(); await pg.wait_for_function('window.__designer && window.__designer.ready', timeout=30000)
    after = await pg.evaluate('__designer.docJson()')
    at = next((i for i, (x, y) in enumerate(zip(saved, after)) if x != y), min(len(saved), len(after)))
    ok(after == saved and await pg.evaluate('!!__designer.APP.pc'), 'reload restores the design and the sensor list',
       f'pc={await pg.evaluate("!!__designer.APP.pc")} diff at {at}: {saved[max(0, at - 80):at + 60]!r} vs {after[max(0, at - 80):at + 60]!r}')
    await ctx.close()
    # dragging a sensor from Your PC makes a readout
    rctx, rpg = await new_page(browser, errors)
    await rpg.click('#dlg-start [data-close]')
    await rpg.evaluate("t => __designer.setPcList(__designer.parseSensorList(t))", reg)
    await rpg.click('#tab-pc')
    await rpg.fill('#pane-pc input[type=search]', 'TCPUPKG')
    li = rpg.locator('#pane-pc .sens li', has_text='TCPUPKG').first
    await li.scroll_into_view_if_needed()
    lb = await li.bounding_box()
    rst = await rpg.evaluate("(() => { const r = document.getElementById('stage-wrap').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
    await rpg.mouse.move(lb['x'] + 30, lb['y'] + 8); await rpg.mouse.down(); await rpg.mouse.move(rst[0], rst[1], steps=10); await rpg.mouse.up()
    ro = await rpg.evaluate("(() => { const n = __designer.APP.doc.nodes[0]; return n && [n.type, n.p.sensor, n.p.caption]; })()")
    ok(ro and ro[0] == 'readout' and ro[1] == 'TCPUPKG', 'dragging a sensor from Your PC creates a readout for it', str(ro))
    # malformed inputs are refused with a message
    bad = await rpg.evaluate('''async () => { const out = {};
      try { await docFromLink('#d=AAAAAAAA'); out.link = 'accepted'; } catch (e) { out.link = 'refused'; }
      for (const [name, body] of [['junk.sensorpanel', 'hello'], ['x.json', '{"kind":"nope"}'], ['y.spzip', 'PK\\u0003\\u0004broken']]) {
        try { await openFile(new File([body], name)); out[name] = 'accepted'; } catch (e) { out[name] = 'refused: ' + e.message.slice(0, 40); } }
      try { sanitizeDoc({ kind: DOC_KIND, v: 1, nodes: [{ type: 'text', x: 'NaN', p: { text: '<img src=x onerror=alert(1)>', px: 1e99, color: 'javascript:1' } }] }); out.san = 'ok'; } catch (e) { out.san = e.message; }
      return out; }''')
    ok(bad['link'] == 'refused' and all(v.startswith('refused') for k, v in bad.items() if '.' in k), 'broken links and files are refused with a message', json.dumps(bad))
    await rctx.close()
    # the Claude artifact viewer: export goes through its downloads API as a .zip
    vctx = await browser.new_context(viewport={'width': 1400, 'height': 900})
    await vctx.add_init_script("window.claude = { use: async n => n === 'downloads' ? { save: async o => { window.__saved = { filename: o.filename, size: o.data.size }; } } : null };")
    vpg = await vctx.new_page(); vpg.on('pageerror', lambda e: errors.append(f'viewer: {e}'))
    await vpg.goto(PAGE_URL); await vpg.wait_for_function('window.__designer && window.__designer.ready', timeout=30000)
    await vpg.click('#dlg-start [data-close]')
    await vpg.evaluate("__designer.setDoc(__designer.THEMES.modern.make({w:1920,h:1080}, hwClone(HW_DEFAULTS), {}))")
    await vpg.click('#btn-export'); await vpg.wait_for_timeout(2500); await vpg.click('#exp-go')
    await vpg.wait_for_function('window.__saved', timeout=60000)
    saved_v = await vpg.evaluate('window.__saved')
    ok(saved_v['filename'].endswith('.zip') and saved_v['size'] > 1000, f'in the Claude viewer the export is saved as {saved_v["filename"]}', json.dumps(saved_v))
    await vctx.close()
    # phone width
    pctx, ppg = await new_page(browser, errors, viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    await ppg.click('#dlg-start [data-close]')
    sw = await ppg.evaluate('document.documentElement.scrollWidth')
    ok(sw <= 390, f'no horizontal scroll at 390 px (page is {sw} px wide)')
    await ppg.screenshot(path=os.path.join(tempfile.gettempdir(), 'designer-390.png'), full_page=True)
    await pctx.close()
    for e in errors: FAILED.append('page error'); print('  PAGE ERROR', e)


# ---------------------------------------------------------------- catalogue: units and kinds per sensor family
FAMILY_EXPECT = {
    'TCPUPKG': '°C', 'TCC-1-7': '°C', 'TGPU1HOT': '°C', 'TGPU2MEM': '°C', 'THDD3': '°C', 'TDIMMTS4': '°C', 'TWATER': '°C', 'TMOBO': '°C', 'TVRM': '°C',
    'SCPUCLK': 'MHz', 'SCC-1-12': 'MHz', 'SGPU1CLK': 'MHz', 'SGPU1MEMCLK': 'MHz', 'SCPUUTI': '%', 'SCPU17UTI': '%', 'SGPU1UTI': '%', 'SMEMUTI': '%',
    'SVMEMUSAGE': '%', 'SDRVCUTI': '%', 'SDSK2ACT': '%', 'SCPUTHR': '%', 'SUSEDMEM': 'MB', 'SFREEVMEM': 'MB', 'SDSK1READSPD': 'MB/s', 'SDSK4WRITESPD': 'MB/s',
    'SNIC6DLRATE': 'KB/s', 'SNIC2ULRATE': 'KB/s', 'SNIC6TOTDL': 'MB', 'SNIC6CONNSPD': 'Mbps', 'SRTSSFPS': 'FPS', 'SVREFRATE': 'Hz', 'SMEMSPEED': 'MT/s',
    'FCPU': 'RPM', 'FCHA3': 'RPM', 'FAIOPUMP': 'RPM', 'FPUMP2': 'RPM', 'FGPU1': 'RPM', 'DGPU1': '%', 'DCPU': '%', 'VCPU': 'V', 'VP12V': 'V', 'VP5V': 'V',
    'V33V': 'V', 'VGPU1': 'V', 'VGPU112VHPWR': 'V', 'VDIMM': 'V', 'CCPU': 'A', 'CGPU1PCIE': 'A', 'PCPUPKG': 'W', 'PCPUIAC': 'W', 'PGPU1': 'W', 'PGPU1TDPP': '%',
    'PGPU112VHPWR': 'W', 'PPSU': 'W', 'WFLOW1': 'L/h', 'LLIQ1': '%',
}
KIND_EXPECT = {'STIME': 'time', 'STIMENS': 'time', 'SDATE': 'date', 'SUPTIME': 'uptime', 'SMEDTIT': 'text', 'SREGVALS3': 'text', 'SGPU1PERFCAP': 'text', 'SEXTIPADDR': 'text'}


async def test_catalog(pg, env):
    print('catalog: sensor families')
    got = await pg.evaluate('ids => Object.fromEntries(ids.map(i => { const f = SP.catalog.family(i); return [i, [f.unit, f.kind, f.sometimes]]; }))', list(FAMILY_EXPECT) + list(KIND_EXPECT))
    bad = [k for k, u in FAMILY_EXPECT.items() if got[k][0] != u or got[k][1] != 'num'] + [k for k, kd in KIND_EXPECT.items() if got[k][1] != kd]
    ok(not bad, f'units and kinds for {len(got)} sensor IDs', json.dumps({k: got[k] for k in bad[:6]}))
    ok(got['SRTSSFPS'][2] and got['SMEDTIT'][2] and not got['TCPUPKG'][2], 'readings that only appear while something runs are marked')
    n = await pg.evaluate('SP.catalog.list().length')
    ok(n > 500, f'the generic sensor picker offers {n} concrete IDs')


# ---------------------------------------------------------------- pages: every page of the site loads cleanly at phone and desktop width
async def test_pages(_pg, env):
    print('pages: no horizontal scroll at 390 px, no console errors')
    browser = env['browser']
    for rel in ('index.html', 'designer/index.html', 'builder/index.html', 'classic/index.html', 'sensors/index.html'):
        for w in (390, 1440):
            errs = []
            ctx = await browser.new_context(viewport={'width': w, 'height': 900}, is_mobile=w < 500, has_touch=w < 500)
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: m.type == 'error' and 'fonts.g' not in m.text and errs.append(m.text))
            await pg.goto('file:///' + os.path.join(ROOT, rel).replace(os.sep, '/').lstrip('/'))
            await pg.wait_for_timeout(1500)
            sw = await pg.evaluate('document.documentElement.scrollWidth')
            ok(sw <= w and not errs, f'{rel} at {w} px: {sw} px wide, {len(errs)} errors', '; '.join(errs[:3]))
            await ctx.close()


GROUPS = {'io': test_io, 'pc': test_pc, 'catalog': test_catalog, 'widgets': test_widgets, 'themes': test_themes, 'editor': test_editor, 'pages': test_pages}


async def main(names):
    from playwright.async_api import async_playwright
    env = {}
    if {'io', 'widgets', 'themes'} & set(names):
        res, errs = await check_export.export_all(['default', 'dpi200', 'title'])
        env['builder'] = {k: v[1] for k, v in res.items()}
        env['builder_default'] = env['builder']['default']
    async with async_playwright() as p:
        browser = await check_export.launch(p)
        env['browser'] = browser
        pg, errors = await open_harness(browser)
        for n in names:
            t0 = time.time()
            await GROUPS[n](pg, env)
            print(f'  ({time.time() - t0:.1f} s)')
        await browser.close()
    for e in errors:
        FAILED.append('page error'); print('  PAGE ERROR', e)
    print(f'\n{len(PASSED)} passed, {len(FAILED)} failed')
    sys.exit(1 if FAILED else 0)


if __name__ == '__main__':
    asyncio.run(main([a for a in sys.argv[1:] if a in GROUPS] or list(GROUPS)))
