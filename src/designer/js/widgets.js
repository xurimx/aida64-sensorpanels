/* ================================================================ widget registry and basic primitives
   defineWidget({ type, label, cat, kind: 'primitive' | 'composite' | 'imported', resize: 'free' | 'aspect' | 'x' | 'none',
                  size: {w, h}, defaults(env), fields, sensors(p), measure(p, env) -> {w, h}, anchor(p), scale(p, f),
                  emit(P, p, box) | expand(p, box, env) })
   Fields drive the inspector, multi-select editing, sanitizing untrusted files and defaults. */
const WT = {};
function defineWidget(def) { WT[def.type] = { resize: 'free', fields: [], sensors: () => [], ...def }; return WT[def.type]; }

const LIVE_FONTS = ['Segoe UI', 'Segoe UI Light', 'Segoe UI Semilight', 'Segoe UI Semibold', 'Bahnschrift', 'Bahnschrift Light', 'Bahnschrift SemiBold',
                    'Consolas', 'Cascadia Mono', 'Arial', 'Arial Narrow', 'Calibri', 'Tahoma', 'Verdana', 'Trebuchet MS'];
const ALIGN3 = [['l', 'Left'], ['c', 'Centre'], ['r', 'Right']];
const WEIGHTS = [['light', 'Light'], ['reg', 'Regular'], ['med', 'Medium'], ['semi', 'Semibold'], ['bold', 'Bold']];
const ASC_SEGOE = 2210 / 2048;

/* sensor label for the file's LBL tag: the PC's own label when a list is loaded, else the catalogue's */
function sensorLabel(id, env) { return env?.pc?.sensors.get(id)?.label || SP.catalog.label(id); }
/* sample text that sizes a value's box: the widest likely reading plus its unit */
function valueSample(p) {
  if (p.sample) return p.sample;
  const f = SP.catalog.family(p.sensor);
  const s = f.kind === 'date' ? '30.12.2026' : f.kind === 'time' ? (/NS$/.test(p.sensor) ? '00:00' : '00:00:00') : f.kind === 'uptime' ? '123:45:00'
    : f.kind === 'text' ? (f.sample || 'Text') : (Math.max(Math.abs(f.hi), Math.abs(f.lo), 10) * (f.unit === '%' ? 1 : 1.1)).toFixed(f.dec);
  return (p.showLabel ? p.label || '' : '') + s + (p.unit || '');
}
function liveTextBox(s, pt, font, o = {}) {
  const px = SP.core.ptToPx(pt), f = SP.core.fontInfo(font);
  MEASURE.font = SP.core.fontCss(font, px, o);
  return { w: Math.max(4, MEASURE.measureText(s).width), h: (f.asc + f.desc) * px, asc: f.asc * px };
}

/* ---- text: static text baked into the image, or a native AIDA64 label ---- */
defineWidget({
  type: 'text', label: 'Text', cat: 'Text & shapes', resize: 'aspect',
  defaults: () => ({ text: 'LABEL', native: false, px: 28, weight: 'bold', family: 'sel', color: '@title', spacing: .14, align: 'l', upper: false,
                     font: 'Segoe UI', pt: 16, bold: false, italic: false }),
  fields: [
    { k: 'text', t: 'text', label: 'Text', max: 200 },
    { k: 'native', t: 'bool', label: 'AIDA64 label', hint: 'Drawn by AIDA64 with a Windows font, so $CPUMODEL and $GPU1MODEL work. Otherwise baked into the image.' },
    { k: 'px', t: 'num', label: 'Size px', min: 4, max: 600, show: p => !p.native },
    { k: 'weight', t: 'select', label: 'Weight', opts: WEIGHTS, show: p => !p.native },
    { k: 'family', t: 'select', label: 'Font', opts: STATIC_FONT_NAMES, show: p => !p.native },
    { k: 'spacing', t: 'num', label: 'Letter spacing', min: -.2, max: 1, step: .01, show: p => !p.native },
    { k: 'font', t: 'font', label: 'Font', live: true, show: p => p.native },
    { k: 'pt', t: 'int', label: 'Size pt', min: 4, max: 400, show: p => p.native },
    { k: 'bold', t: 'bool', label: 'Bold', show: p => p.native }, { k: 'italic', t: 'bool', label: 'Italic', show: p => p.native },
    { k: 'color', t: 'color', label: 'Colour' },
    { k: 'align', t: 'select', label: 'Align', opts: ALIGN3, show: p => !p.native },
    { k: 'upper', t: 'bool', label: 'Capitals' },
  ],
  str: p => p.upper ? p.text.toUpperCase() : p.text,
  measure(p) {
    const s = this.str(p) || ' ';
    if (p.native) { const b = liveTextBox(s, p.pt, p.font, p); return { w: b.w, h: b.h }; }
    const m = STATIC_METRICS[p.family] || STATIC_METRICS.sel;
    return { w: Math.max(2, textWidth(s, p.px, p.weight, p.family, p.spacing)), h: (m.asc + m.desc) * p.px };
  },
  anchor: p => p.native ? 'l' : p.align,
  scale(p, f) { if (p.native) p.pt = Math.max(4, Math.round(p.pt * f)); else p.px = Math.max(4, +(p.px * f).toFixed(2)); },
  emit(P, p, box) {
    const s = this.str(p);
    if (p.native) return P.item({ kind: 'LBL', x: 0, y: 0, text: s, pt: Math.round(p.pt), font: p.font, col: P.col(p.color), bold: p.bold, italic: p.italic, w: box.w }, [0, 0, box.w, box.h]);
    const m = STATIC_METRICS[p.family] || STATIC_METRICS.sel;
    P.text(p.align === 'r' ? box.w : p.align === 'c' ? box.w / 2 : 0, m.asc * p.px, s, { px: p.px, weight: p.weight, family: p.family, col: p.color, spacing: p.spacing, align: p.align });
  },
});

/* ---- value: one live reading (AIDA64 SIMPLE item; centred values use a gauge with empty frames) ---- */
defineWidget({
  type: 'value', label: 'Value', cat: 'Readings', resize: 'aspect',
  defaults: () => ({ sensor: 'SCPUUTI', pt: 24, font: 'Segoe UI', color: '@hi', unit: '', align: 'l', bold: false, italic: false, showLabel: false, label: '', sample: '' }),
  fields: [
    { k: 'sensor', t: 'sensor', label: 'Sensor' },
    { k: 'unit', t: 'text', label: 'Unit', max: 16, hint: 'Printed after the value, e.g. " °C" or " MHz". Centred values can’t show a unit.' },
    { k: 'font', t: 'font', label: 'Font', live: true }, { k: 'pt', t: 'int', label: 'Size pt', min: 4, max: 400 },
    { k: 'color', t: 'color', label: 'Colour' }, { k: 'align', t: 'select', label: 'Align', opts: ALIGN3 },
    { k: 'bold', t: 'bool', label: 'Bold' }, { k: 'italic', t: 'bool', label: 'Italic' },
    { section: 'More', fields: [
      { k: 'showLabel', t: 'bool', label: 'Text before the value' }, { k: 'label', t: 'text', label: 'Text', max: 40, show: p => p.showLabel },
      { k: 'sample', t: 'text', label: 'Size the box for', max: 40, hint: 'Example reading used to size the box, e.g. 8888.' },
    ] },
  ],
  sensors: p => [p.sensor],
  sanitize(p, raw) { if (raw.slabel) p.slabel = sStr(raw.slabel, 80); },
  measure(p) { const b = liveTextBox(valueSample(p), p.pt, p.font, p); return { w: b.w, h: b.h }; },
  anchor: p => p.align,
  scale(p, f) { p.pt = Math.max(4, Math.round(p.pt * f)); },
  emit(P, p, box) {
    const base = { sensor: p.sensor, slabel: p.slabel || sensorLabel(p.sensor, P.env), pt: p.pt, font: p.font, col: P.col(p.color) };
    if (p.align === 'c')
      return P.item({ kind: 'GAUGE', ...base, lo: 0, hi: 100, x: box.w / 2, y: box.h / 2, frames: Array(16).fill(''), showVal: true, bold: p.bold, italic: p.italic }, [0, 0, box.w, box.h]);
    P.item({ kind: 'SIMPLE', ...base, x: p.align === 'r' ? box.w : 0, y: 0, unit: p.unit, align: p.align, bold: p.bold, italic: p.italic,
             ...(p.showLabel ? { showLabel: true, label: p.label } : {}) }, [0, 0, box.w, box.h]);
  },
});

/* ---- rect: lines, dividers, accents, frames ---- */
defineWidget({
  type: 'rect', label: 'Rectangle', cat: 'Text & shapes', size: { w: 400, h: 2 },
  defaults: () => ({ fill: '@hair', radius: 0, outline: false, lineW: 2 }),
  fields: [{ k: 'fill', t: 'color', label: 'Colour' }, { k: 'outline', t: 'bool', label: 'Outline only' },
           { k: 'lineW', t: 'num', label: 'Line width', min: 1, max: 50, show: p => p.outline }, { k: 'radius', t: 'num', label: 'Corner radius', min: 0, max: 500 }],
  emit(P, p, box) {
    if (p.outline) return P.stroke(0, 0, box.w, box.h, p.radius, p.lineW, p.fill);
    p.radius > 0 ? P.rrect(0, 0, box.w, box.h, p.radius, p.fill) : P.rect(0, 0, box.w, box.h, p.fill);
  },
});

/* ---- image: a picture from the user (baked) or from an opened panel (kept as its own IMG) ---- */
defineWidget({
  type: 'image', label: 'Image', cat: 'Text & shapes', resize: 'free', size: { w: 400, h: 300 },
  defaults: () => ({ asset: '', name: 'image.png', separate: false, bg: false }),
  fields: [{ k: 'separate', t: 'bool', label: 'Keep as its own image', hint: 'Stays a separate item in AIDA64 instead of being merged into the background.' }],
  sanitize(p, raw) { p.asset = typeof raw.asset === 'string' && /^[a-z0-9]{1,40}$/.test(raw.asset) ? raw.asset : ''; p.name = sStr(raw.name, 120).replace(/[<>|\\/:*?"]/g, '') || 'image.png'; p.bg = !!raw.bg; },
  emit(P, p, box) {
    const a = P.env.asset(p.asset);
    if (p.separate || p.bg) {
      const same = a && Math.round(box.w) === a.w && Math.round(box.h) === a.h;
      return P.item({ kind: 'IMG', name: p.name, x: 0, y: 0, asset: p.asset, ...(same ? {} : { scaleTo: [Math.round(box.w), Math.round(box.h)] }), ...(p.bg ? { bg: true } : {}) }, [0, 0, box.w, box.h]);
    }
    P.custom([0, 0, box.w, box.h], ctx => { if (a?.bitmap) ctx.drawImage(a.bitmap, 0, 0, box.w, box.h); });
  },
});

/* ---- graph: history of one reading (AIDA64 GRAPH) with a baked grid ---- */
defineWidget({
  type: 'graph', label: 'Graph', cat: 'Graphs', size: { w: 600, h: 160 },
  defaults: () => ({ sensor: 'SCPUUTI', lo: 0, hi: 100, auto: false, type: 'LG', color: '@cpu', thick: 3, step: 3, grid: 3, gridColor: '@grid', base: true, baseColor: '@hair', lineW: 2,
                     aidaBg: false, aidaFrame: false, aidaGrid: false, density: 40, bgCol: '#000000', frameCol: '#1c1f24', gridCol: '#131518' }),
  fields: [
    { k: 'sensor', t: 'sensor', label: 'Sensor' }, { k: 'lo', t: 'num', label: 'Min' }, { k: 'hi', t: 'num', label: 'Max' },
    { k: 'auto', t: 'bool', label: 'Scale to fit' },
    { k: 'type', t: 'select', label: 'Style', opts: [['LG', 'Line'], ['AG', 'Area'], ['HG', 'Histogram']], hint: 'Lines light the fewest OLED pixels.' },
    { k: 'color', t: 'color', label: 'Colour' }, { k: 'thick', t: 'int', label: 'Line width', min: 1, max: 20 },
    { k: 'step', t: 'int', label: 'Pixels per sample', min: 1, max: 40, hint: 'At one sample a second, width ÷ this is the seconds of history.' },
    { section: 'Grid', fields: [{ k: 'grid', t: 'int', label: 'Lines', min: 0, max: 20 }, { k: 'gridColor', t: 'color', label: 'Colour' },
      { k: 'base', t: 'bool', label: 'Baseline' }, { k: 'baseColor', t: 'color', label: 'Baseline colour' }, { k: 'lineW', t: 'num', label: 'Line width', min: 1, max: 10 }] },
    { section: 'Drawn by AIDA64', fields: [
      { k: 'aidaBg', t: 'bool', label: 'Background fill', hint: 'AIDA64 fills the graph area. Lights pixels on OLED.' }, { k: 'bgCol', t: 'color', label: 'Fill', show: p => p.aidaBg },
      { k: 'aidaFrame', t: 'bool', label: 'Frame' }, { k: 'frameCol', t: 'color', label: 'Frame colour', show: p => p.aidaFrame },
      { k: 'aidaGrid', t: 'bool', label: 'AIDA64 grid' }, { k: 'gridCol', t: 'color', label: 'Grid colour', show: p => p.aidaGrid }, { k: 'density', t: 'int', label: 'Grid spacing', min: 2, max: 400, show: p => p.aidaGrid }] },
  ],
  sensors: p => [p.sensor],
  sanitize(p, raw) { if (raw.slabel) p.slabel = sStr(raw.slabel, 80); },
  emit(P, p, box) {
    for (let i = 1; i <= p.grid; i++) P.rect(0, box.h * i / (p.grid + 1) - p.lineW / 2, box.w, p.lineW, p.gridColor);
    if (p.base) P.rect(0, box.h - p.lineW / 2, box.w, p.lineW, p.baseColor);
    const flags = `${p.aidaBg ? 1 : 0}${p.aidaFrame ? 1 : 0}${p.aidaGrid ? 1 : 0}`, custom = flags !== '000' || p.density !== 40;
    P.item({ kind: 'GRAPH', sensor: p.sensor, slabel: p.slabel || sensorLabel(p.sensor, P.env), x: 0, y: 0, w: box.w, h: box.h, lo: p.lo, hi: p.hi, col: P.col(p.color),
             auto: p.auto, step: p.step, thick: p.thick, type: p.type,
             ...(custom ? { flags, density: p.density, bgCol: P.col(p.bgCol), frameCol: P.col(p.frameCol), gridCol: P.col(p.gridCol) } : {}) }, [0, 0, box.w, box.h]);
  },
});

/* ---- segmented bar: 15 segments per gauge (more stack several gauges), horizontal or vertical ---- */
function segColors(p, env, segs) {
  const base = colorOf(p.color, env.doc), warn = colorOf(p.warnColor || '@amber', env.doc), hot = colorOf(p.hotColor || '@red', env.doc);
  return Array.from({ length: segs }, (_, j) => {
    if (p.paint === 'heat') { const t = p.lo + (j + 1) * (p.hi - p.lo) / segs; return t > env.doc.hot ? hot : t > env.doc.warm ? warn : base; }
    if (p.paint === 'level') return (j + 1) / segs > p.warnFrom ? warn : base;
    return base;
  });
}
defineWidget({
  type: 'bar', label: 'Segmented bar', cat: 'Gauges', size: { w: 440, h: 18 },
  defaults: () => ({ sensor: 'SCPUUTI', lo: 0, hi: 100, segs: 15, gap: 4, radius: -1, vertical: false, paint: 'solid', color: '@cpu', warnFrom: .85,
                     warnColor: '@amber', hotColor: '@red', track: '@track' }),
  fields: [
    { k: 'sensor', t: 'sensor', label: 'Sensor' }, { k: 'lo', t: 'num', label: 'Min' }, { k: 'hi', t: 'num', label: 'Max' },
    { k: 'segs', t: 'int', label: 'Segments', min: 1, max: 90, hint: 'More than 15 stack extra gauges. Multiples of 15, 5 or 3 stay exact.' },
    { k: 'paint', t: 'select', label: 'Colours', opts: [['solid', 'One colour'], ['heat', 'Warm / hot temperatures'], ['level', 'Warn near full']] },
    { k: 'color', t: 'color', label: 'Colour' },
    { k: 'warnFrom', t: 'pct', label: 'Warn from', show: p => p.paint === 'level' },
    { k: 'warnColor', t: 'color', label: 'Warn colour', show: p => p.paint !== 'solid' }, { k: 'hotColor', t: 'color', label: 'Hot colour', show: p => p.paint === 'heat' },
    { k: 'track', t: 'color', label: 'Track' }, { k: 'gap', t: 'num', label: 'Gap', min: 0, max: 40 },
    { k: 'radius', t: 'num', label: 'Corner radius', min: -1, max: 40, hint: '-1 = automatic' }, { k: 'vertical', t: 'bool', label: 'Vertical' },
  ],
  sensors: p => [p.sensor],
  emit(P, p, box) {
    const segs = Math.max(1, Math.round(p.segs)), V = p.vertical, L = V ? box.h : box.w, T = V ? box.w : box.h, gap = p.gap;
    const segw = (L - (segs - 1) * gap) / segs, rad = p.radius < 0 ? Math.min(3, T / 4) : p.radius, cols = segColors(p, P.env, segs);
    const at = j => V ? [0, L - (j + 1) * segw - j * gap, T, segw] : [j * (segw + gap), 0, segw, T];
    const track = P.col(p.track);
    P.custom([0, 0, box.w, box.h], ctx => { ctx.fillStyle = cssRgb(track); for (let j = 0; j < segs; j++) { const [x, y, w, h] = at(j); rr(ctx, x, y, w, h, rad); } });
    const slabel = sensorLabel(p.sensor, P.env);
    for (const g of planCumulative(segs)) {
      const [gx, gy] = V ? [0, L - (g.first + g.count) * segw - (g.first + g.count - 1) * gap] : [g.first * (segw + gap), 0];
      const gl = g.count * segw + (g.count - 1) * gap, [fw, fh] = V ? [T, gl] : [gl, T];
      const mine = cols.slice(g.first, g.first + g.count);
      const frames = P.frames('bar', ['bar', V, Math.round(fw), Math.round(fh), segw, gap, rad, mine], 16, fw, fh, (ctx, s) => {
        for (let j = 0; j < g.lit(s); j++) { ctx.fillStyle = cssRgb(mine[j]); V ? rr(ctx, 0, gl - (j + 1) * segw - j * gap, T, segw, rad) : rr(ctx, j * (segw + gap), 0, segw, T, rad); }
      });
      const seg = (p.hi - p.lo) / segs;
      P.item({ kind: 'GAUGE', sensor: p.sensor, slabel, lo: p.lo + g.first * seg, hi: p.lo + (g.first + g.count) * seg, x: gx, y: gy, frames,
               showVal: false, pt: 8, font: 'Tahoma', col: [255, 255, 255] }, [gx, gy, fw, fh]);
    }
  },
});
