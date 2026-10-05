/* ================================================================ gauges: ring (Modern Split), dial and meter (Classic OLED),
   and the widgets that hold items from opened panels (custom gauges, AIDA64's own gauges, sensor items, unknown items) */

/* ---- ring: segmented arc, as the builder's ring(): SPAN-degree segments every PITCH degrees, 5 segments per gauge ---- */
defineWidget({
  type: 'ring', label: 'Segmented ring', cat: 'Gauges', resize: 'aspect',
  defaults: () => ({ sensor: 'SCPUUTI', lo: 0, hi: 100, r0: 346, r1: 380, segs: 30, start: -135, pitch: 9, span: 7, paint: 'solid', color: '@cpu', track: '@track' }),
  fields: [
    { k: 'sensor', t: 'sensor', label: 'Sensor' }, { k: 'lo', t: 'num', label: 'Min' }, { k: 'hi', t: 'num', label: 'Max' },
    { k: 'paint', t: 'select', label: 'Colours', opts: [['solid', 'One colour'], ['heat', 'Warm / hot temperatures']] },
    { k: 'color', t: 'color', label: 'Colour' }, { k: 'track', t: 'color', label: 'Track' },
    { section: 'Shape', fields: [
      { k: 'r1', t: 'num', label: 'Outer radius', min: 10, max: 3000 }, { k: 'r0', t: 'num', label: 'Inner radius', min: 1, max: 3000 },
      { k: 'segs', t: 'int', label: 'Segments', min: 3, max: 120 }, { k: 'start', t: 'num', label: 'Start angle', min: -360, max: 360 },
      { k: 'pitch', t: 'num', label: 'Degrees per segment', min: 1, max: 120 }, { k: 'span', t: 'num', label: 'Segment length °', min: .5, max: 120 },
    ] },
  ],
  sensors: p => [p.sensor],
  measure: p => { const s = Math.floor(2 * p.r1 + 8); return { w: s, h: s }; },
  anchor: () => 'c',
  scale(p, f) { p.r0 *= f; p.r1 *= f; },
  emit(P, p) {
    const size = Math.floor(2 * p.r1 + 8), c = size / 2, segs = Math.max(1, Math.round(p.segs)), seg = (p.hi - p.lo) / segs;
    const ang = k => { const a0 = p.start + k * p.pitch + (p.pitch - p.span) / 2; return [a0, a0 + p.span]; };
    const cols = segColors(p, P.env, segs), track = P.col(p.track);
    P.custom([0, 0, size, size], ctx => { ctx.fillStyle = cssRgb(track); for (let k = 0; k < segs; k++) { const [a, b] = ang(k); poly(ctx, arcPts(c, c, p.r0, p.r1, a, b)); } });
    const chunk = [5, 3, 15, 1].find(n => segs % n === 0), slabel = sensorLabel(p.sensor, P.env);
    for (let si = 0; si < segs / chunk; si++) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let k = si * chunk; k < si * chunk + chunk; k++) { const [a, b] = ang(k); for (const [px, py] of arcPts(c, c, p.r0, p.r1, a, b)) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); } }
      const bx = Math.floor(x0) - 2, by = Math.floor(y0) - 2, bw = Math.ceil(x1) + 2 - bx, bh = Math.ceil(y1) + 2 - by;
      const mine = cols.slice(si * chunk, si * chunk + chunk);
      const names = P.frames('ring', ['ring', p.r0, p.r1, p.start, p.pitch, p.span, si, chunk, mine], chunk + 1, bw, bh, (ctx, n) => {
        ctx.setTransform(1, 0, 0, 1, -bx, -by);
        for (let k = si * chunk; k < si * chunk + n; k++) { const [a, b] = ang(k); ctx.fillStyle = cssRgb(cols[k]); poly(ctx, arcPts(c, c, p.r0, p.r1, a, b)); }
      });
      const smin = p.lo + si * chunk * seg;
      P.item({ kind: 'GAUGE', sensor: p.sensor, slabel, lo: smin, hi: smin + chunk * seg, x: bx, y: by,
               frames: Array.from({ length: 16 }, (_, s) => names[Math.floor(s * chunk / 15)]), showVal: false, pt: 8, font: 'Tahoma', col: [255, 255, 255] }, [bx, by, bw, bh]);
    }
  },
});

/* ---- dial: analog instrument (Classic OLED). Geometry from gen.py, scaled by r / R. ---- */
const DIAL_G = {
  big: { R: 520, bez: 514, bez2: 500, rt: 478, maj: [52, 8], mid: [34, 4.5], mnr: [20, 3], nfont: 84, gap: 18, bezW: 5, redW: 11, tip: 462, tail: 74, wbase: 18, wtip: 4, hub: 40, positions: 40, over: 5 },
  small: { R: 240, bez: 236, bez2: 226, rt: 214, maj: [30, 5], mid: [20, 3], mnr: [12, 2.2], nfont: 40, gap: 10, bezW: 4, redW: 6, tip: 202, tail: 36, wbase: 10, wtip: 3, hub: 20, positions: 25, over: 7 },
};
const frange = (lo, hi, step) => { const n = Math.round((hi - lo) / step); return Array.from({ length: n + 1 }, (_, i) => lo + i * step); };
const rnd6 = v => Math.round(v * 1e6) / 1e6;
function needlePts(G, s, c, th) {
  const t = th * Math.PI / 180, ux = Math.sin(t), uy = -Math.cos(t), vx = Math.cos(t), vy = Math.sin(t);
  const P = (r, off) => [c + (ux * r + vx * off) * s, c + (uy * r + vy * off) * s];
  const tip = G.tip, tail = G.tail, wb = G.wbase, wt = G.wtip;
  return { tail: [P(-tail, -wb * .62), P(-tail, wb * .62), P(0, wb / 2), P(0, -wb / 2)], body: [P(0, -wb / 2), P(tip - 14, -wt / 2), P(tip, 0), P(tip - 14, wt / 2), P(0, wb / 2)] };
}
defineWidget({
  type: 'dial', label: 'Needle dial', cat: 'Gauges', resize: 'aspect',
  defaults: () => ({ sensor: 'TCPUPKG', lo: 20, hi: 100, style: 'big', r: 520, major: 20, mid: 10, minor: 2, red: true, redFrom: 90, redTo: 100, numbers: true,
                     needle: '@needle', tail: '@tail', bezel: '@bezel', bezel2: '@bezel2', majorCol: '@major', midCol: '@cmid', minorCol: '@minor', redCol: '@cred',
                     redMinor: '@redminor', redBand: '@redband', numCol: '@num', hubFill: '@hubfill', hubRing: '@hubring', hubDot: '@hubdot' }),
  fields: [
    { k: 'sensor', t: 'sensor', label: 'Sensor' }, { k: 'lo', t: 'num', label: 'Min' }, { k: 'hi', t: 'num', label: 'Max' },
    { k: 'major', t: 'num', label: 'Numbered every', min: 0 }, { k: 'mid', t: 'num', label: 'Mid ticks every', min: 0, hint: '0 = none' }, { k: 'minor', t: 'num', label: 'Small ticks every', min: 0 },
    { k: 'red', t: 'bool', label: 'Red zone' }, { k: 'redFrom', t: 'num', label: 'Red from', show: p => p.red }, { k: 'redTo', t: 'num', label: 'Red to', show: p => p.red },
    { k: 'style', t: 'select', label: 'Needle steps', opts: [['big', 'Fine (41 positions)'], ['small', 'Medium (26 positions)']] },
    { k: 'needle', t: 'color', label: 'Needle' },
    { section: 'Colours', fields: [{ k: 'majorCol', t: 'color', label: 'Major ticks' }, { k: 'midCol', t: 'color', label: 'Mid ticks' }, { k: 'minorCol', t: 'color', label: 'Small ticks' },
      { k: 'numCol', t: 'color', label: 'Numbers' }, { k: 'redCol', t: 'color', label: 'Red ticks' }, { k: 'redBand', t: 'color', label: 'Red band' },
      { k: 'bezel', t: 'color', label: 'Bezel' }, { k: 'tail', t: 'color', label: 'Needle tail' }, { k: 'hubRing', t: 'color', label: 'Hub ring' }] },
    { k: 'numbers', t: 'bool', label: 'Scale numbers' },
  ],
  sensors: p => [p.sensor],
  measure: p => ({ w: 2 * p.r, h: 2 * p.r }),
  anchor: () => 'c',
  scale(p, f) { p.r *= f; },
  emit(P, p) {
    const G = DIAL_G[p.style] || DIAL_G.big, s = p.r / G.R, c = p.r, lo = p.lo, hi = p.hi > p.lo ? p.hi : p.lo + 1;
    const angle = v => -120 + 240 * (v - lo) / (hi - lo);
    const inRed = v => p.red && v >= p.redFrom - 1e-9 && v <= p.redTo + 1e-9;
    const col = k => P.col(p[k]);
    /* face */
    P.circle(c, c, G.bez * s, G.bezW * s, p.bezel);
    P.circle(c, c, G.bez2 * s, 2 * s, p.bezel2);
    if (p.red) {
      const a0 = angle(Math.max(lo, p.redFrom)), a1 = angle(Math.min(hi, p.redTo)), n = Math.max(8, Math.floor(Math.abs(a1 - a0) * 2)), pts = [];
      const pol = (r, th) => [c + r * s * Math.sin(th * Math.PI / 180), c - r * s * Math.cos(th * Math.PI / 180)];
      for (let i = 0; i <= n; i++) pts.push(pol(G.rt, a0 + (a1 - a0) * i / n));
      for (let i = 0; i <= n; i++) pts.push(pol(G.rt - G.redW, a1 - (a1 - a0) * i / n));
      P.poly(pts, p.redBand);
    }
    const majors = new Set(p.major > 0 ? frange(lo, hi, p.major).map(rnd6) : []), mids = new Set(p.mid > 0 ? frange(lo, hi, p.mid).map(rnd6) : []);
    const ticks = p.minor > 0 ? frange(lo, hi, p.minor) : [...majors];
    const tcols = { maj: col('majorCol'), mid: col('midCol'), mnr: col('minorCol'), red: col('redCol'), rmn: col('redMinor') };
    P.custom([0, 0, 2 * c, 2 * c], ctx => {
      for (const v of ticks) {
        const rv = rnd6(v), kind = majors.has(rv) ? 'maj' : mids.has(rv) ? 'mid' : 'mnr', [ln, w] = G[kind];
        ctx.fillStyle = cssRgb(inRed(v) ? (kind === 'mnr' ? tcols.rmn : tcols.red) : tcols[kind]);
        const t = angle(v) * Math.PI / 180, ux = Math.sin(t), uy = -Math.cos(t), vx = Math.cos(t), vy = Math.sin(t), r0 = (G.rt - ln) * s, r1 = G.rt * s, hw = w * s / 2;
        poly(ctx, [[c + ux * r0 - vx * hw, c + uy * r0 - vy * hw], [c + ux * r1 - vx * hw, c + uy * r1 - vy * hw], [c + ux * r1 + vx * hw, c + uy * r1 + vy * hw], [c + ux * r0 + vx * hw, c + uy * r0 + vy * hw]]);
      }
    });
    if (p.numbers) for (const v of [...majors].sort((a, b) => a - b)) {
      const th = angle(v), label = String(Math.round(v)), px = G.nfont * s, ib = inkBox(label, px, 'med', 'bsc');
      const tw = ib.r - ib.l, thh = ib.b - ib.t, ext = Math.abs(Math.sin(th * Math.PI / 180)) * tw / 2 + Math.abs(Math.cos(th * Math.PI / 180)) * thh / 2;
      const r = (G.rt - G.maj[0] - G.gap) * s - ext;
      P.textInk(c + r * Math.sin(th * Math.PI / 180), c - r * Math.cos(th * Math.PI / 180), label, { px, weight: 'med', family: 'bsc', col: inRed(v) ? p.redCol : p.numCol });
    }
    /* needles: exclusive stacked gauges; frames only depend on the geometry, so dials of one size share them */
    const n = G.positions, step = (hi - lo) / n, plan = planExclusive(n), slabel = sensorLabel(p.sensor, P.env);
    const thOf = q => q === 'over' ? 120 + G.over : -120 + 240 * q / n;
    const nCol = col('needle'), tCol = col('tail');
    plan.forEach((g, gi) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const q of g.states) if (q !== null) { const np = needlePts(G, s, c, thOf(q)); for (const [x, y] of [...np.tail, ...np.body]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } }
      const bx = Math.floor(x0) - 2, by = Math.floor(y0) - 2, bw = Math.ceil(x1) + 2 - bx, bh = Math.ceil(y1) + 2 - by;
      const names = P.frames('needle', ['needle', p.style, s, nCol, tCol, gi, g.states], 16, bw, bh, (ctx, st) => {
        const q = g.states[st]; if (q === null) return;
        const np = needlePts(G, s, c, thOf(q)); ctx.translate(-bx, -by);
        ctx.fillStyle = cssRgb(tCol); poly(ctx, np.tail); ctx.fillStyle = cssRgb(nCol); poly(ctx, np.body);
      });
      P.item({ kind: 'GAUGE', sensor: p.sensor, slabel, lo: lo + g.base * step, hi: lo + (g.base + 15) * step, x: bx, y: by, frames: g.states.map((q, st) => q === null ? '' : names[st]),
               showVal: false, pt: 8, font: 'Tahoma', col: [255, 255, 255] }, [bx, by, bw, bh]);
    });
    /* hub above the needles (becomes its own image on export) */
    const hr = G.hub * s, hf = col('hubFill'), hrg = col('hubRing'), hd = col('hubDot');
    P.custom([c - hr - 4, c - hr - 4, c + hr + 4, c + hr + 4], ctx => {
      ctx.beginPath(); ctx.arc(c, c, hr, 0, Math.PI * 2); ctx.fillStyle = cssRgb(hf); ctx.fill();
      ctx.lineWidth = 3 * s; ctx.strokeStyle = cssRgb(hrg); ctx.beginPath(); ctx.arc(c, c, hr - 1.5 * s, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(c, c, hr * .32, 0, Math.PI * 2); ctx.fillStyle = cssRgb(hd); ctx.fill();
    });
  },
});

/* ---- meter: slim linear scale with a pointer (Classic OLED). lin = 29 positions, log = 3 decades. ---- */
const METER_SCALES = {
  pct: { majors: [0, .5, 1], labels: ['0', '50', '100'], minors: Array.from({ length: 11 }, (_, i) => i / 10), red: .9 },
  rpm3: { majors: [0, 1 / 3, 2 / 3, 1], labels: ['0', '1k', '2k', '3k'], minors: Array.from({ length: 16 }, (_, i) => i / 15), red: null },
  rpm4: { majors: [0, .25, .5, .75, 1], labels: ['0', '1k', '2k', '3k', '4k'], minors: Array.from({ length: 21 }, (_, i) => i / 20), red: null },
  net: { majors: [0, 1 / 3, 2 / 3, 1], labels: ['0', '1', '10', '100'], minors: [...[0, 1, 2].flatMap(dd => Array.from({ length: 10 }, (_, k) => (dd + k / 10) / 3)), 1], red: null, log: true },
};
defineWidget({
  type: 'meter', label: 'Linear meter', cat: 'Gauges', resize: 'x',
  defaults: () => ({ sensor: 'SDRVCUTI', scale: 'pct', lo: 0, hi: 100, mw: 262, k: 1, needle: '@needle', base: '@meter', minorCol: '@minor', majorCol: '@major', redCol: '@cred', redBand: '@redband', numCol: '@mnum' }),
  fields: [
    { k: 'sensor', t: 'sensor', label: 'Sensor' },
    { k: 'scale', t: 'select', label: 'Scale', opts: [['pct', '0–100 %'], ['rpm3', '0–3000 RPM'], ['rpm4', '0–4000 RPM'], ['net', '0–100 MB/s (log)']] },
    { k: 'needle', t: 'color', label: 'Pointer' }, { k: 'numCol', t: 'color', label: 'Numbers' }, { k: 'majorCol', t: 'color', label: 'Ticks' },
  ],
  sensors: p => [p.sensor],
  measure: p => ({ w: p.mw + 42 * p.k, h: 100 * p.k }),
  anchor: () => 'l',
  scale(p, f) { p.mw = Math.max(40, Math.round(p.mw * f)); p.k *= f; },
  onResize(p, box) { p.mw = Math.max(40, Math.round(box.w - 42 * p.k)); },
  emit(P, p) {
    const sc = METER_SCALES[p.scale] || METER_SCALES.pct, MW = p.mw, K = p.k, x0 = 16 * K, YS = 40 * K, col = k => P.col(p[k]);
    P.rect(x0, YS - K, MW, 2.5 * K, p.base);
    if (sc.red) P.rect(x0 + sc.red * MW, YS - K, MW - sc.red * MW, 5.5 * K, p.redBand);
    for (const f of sc.minors) P.rect(x0 + f * MW - K, YS, 2.5 * K, 10.5 * K, p.minorCol);
    sc.majors.forEach((f, i) => {
      const red = sc.red && f >= sc.red;
      P.rect(x0 + f * MW - 1.5 * K, YS, 3.5 * K, 18.5 * K, red ? p.redCol : p.majorCol);
      const lab = sc.labels[i], ib = inkBox(lab, 26 * K, 'med', 'bsc');      /* gen.py centres the ink width */
      P.text(x0 + f * MW - (ib.r - ib.l) / 2, YS + 50 * K, lab, { px: 26 * K, weight: 'med', family: 'bsc', col: p.numCol });
    });
    /* pointer frames: shared by every meter of this width, keyed at half-pixel steps like gen.py */
    const W = MW + 42 * K, nCol = col('needle'), slabel = sensorLabel(p.sensor, P.env);
    const ptr = f => {
      const k2 = Math.round(f * MW * 2);
      return P.frames('pointer', ['pointer', MW, K, k2, nCol], 1, W, 62 * K, ctx => {
        const px = 16 * K + k2 / 2; ctx.fillStyle = cssRgb(nCol);
        poly(ctx, [[px - 10 * K, 4 * K], [px + 10 * K, 4 * K], [px, 26 * K]]); ctx.fillRect(px - 1.5 * K, 20 * K, 3 * K, 40 * K);
      })[0];
    };
    const blank = '';
    const specs = [];
    if (sc.log) {
      [[0, 1000], [1000, 10000], [10000, 100000]].forEach(([a, b], di) => {
        const st = (b - a) / 14;
        if (di === 0) specs.push([a, a + 15 * st, [...Array.from({ length: 14 }, (_, s) => ptr((s / 14) / 3)), blank, blank]]);
        else specs.push([a - st, a - st + 15 * st, [blank, ...Array.from({ length: 14 }, (_, s) => ptr((di + s / 14) / 3)), di < 2 ? blank : ptr(1)]]);
      });
    } else {
      const [lo, hi] = { pct: [0, 100], rpm3: [0, 3000], rpm4: [0, 4000] }[p.scale] || [0, 100], st = (hi - lo) / 28;
      specs.push([lo, lo + 15 * st, [...Array.from({ length: 15 }, (_, s) => ptr(s / 28)), blank]]);
      specs.push([lo + 14 * st, lo + 29 * st, [blank, ...Array.from({ length: 14 }, (_, s) => ptr((15 + s) / 28)), ptr(1 + 8 / MW)]]);
    }
    for (const [gmin, gmax, frames] of specs)
      P.item({ kind: 'GAUGE', sensor: p.sensor, slabel, lo: gmin, hi: gmax, x: 0, y: 0, frames, showVal: false, pt: 8, font: 'Tahoma', col: [255, 255, 255] }, [0, 0, W, 62 * K]);
  },
});

/* ---- items from opened panels ---- */
const IMPORTED_FIELDS = [{ k: 'sensor', t: 'sensor', label: 'Sensor' }];
defineWidget({
  type: 'customGauge', label: 'Custom gauge', cat: 'Imported', kind: 'imported', resize: 'aspect',
  defaults: () => ({ sensor: 'SCPUUTI', lo: 0, hi: 100, frames: [], showVal: false, pt: 12, font: 'Segoe UI', color: '#ffffff', bold: false, italic: false, slabel: '' }),
  fields: [...IMPORTED_FIELDS, { k: 'lo', t: 'num', label: 'Min' }, { k: 'hi', t: 'num', label: 'Max' }, { k: 'showVal', t: 'bool', label: 'Show value' },
           { k: 'font', t: 'font', label: 'Value font', live: true, show: p => p.showVal }, { k: 'pt', t: 'int', label: 'Size pt', min: 4, max: 400, show: p => p.showVal },
           { k: 'color', t: 'color', label: 'Value colour', show: p => p.showVal }],
  sanitize(p, raw) { p.frames = Array.isArray(raw.frames) ? raw.frames.slice(0, 256).map(f => typeof f === 'string' && /^[a-z0-9]{0,40}$/.test(f) ? f : '') : []; p.slabel = sStr(raw.slabel, 80); },
  sensors: p => [p.sensor],
  scale() {},
  emit(P, p, box) {
    P.item({ kind: 'GAUGE', sensor: p.sensor, slabel: p.slabel || sensorLabel(p.sensor, P.env), lo: p.lo, hi: p.hi, x: 0, y: 0, frames: p.frames.map(a => a ? '@' + a : ''),
             showVal: p.showVal, pt: p.pt, font: p.font, col: P.col(p.color), bold: p.bold, italic: p.italic, ...(box.rw ? { rw: box.rw, rh: box.rh } : {}) }, [0, 0, box.w, box.h]);
  },
});
defineWidget({
  type: 'nativeGauge', label: 'AIDA64 gauge', cat: 'Imported', kind: 'imported', resize: 'none',
  defaults: () => ({ sensor: 'SCPUUTI', lo: 0, hi: 100, typ: 'Black', siz: 'S', showVal: true, pt: 12, font: 'Segoe UI', color: '#ffffff', icon: false, slabel: '' }),
  fields: [...IMPORTED_FIELDS, { k: 'lo', t: 'num', label: 'Min' }, { k: 'hi', t: 'num', label: 'Max' }, { k: 'showVal', t: 'bool', label: 'Show value' }],
  sanitize(p, raw) { p.typ = sStr(raw.typ, 20) || 'Black'; p.siz = ['S', 'M', 'L'].includes(raw.siz) ? raw.siz : 'S'; p.icon = !!raw.icon; p.slabel = sStr(raw.slabel, 80); },
  sensors: p => [p.sensor],
  emit(P, p, box) {
    P.item({ kind: 'GAUGE', typ: p.typ, siz: p.siz, icon: p.icon, sensor: p.sensor, slabel: p.slabel || sensorLabel(p.sensor, P.env), lo: p.lo, hi: p.hi, x: 0, y: 0,
             frames: [], showVal: p.showVal, pt: p.pt, font: p.font, col: P.col(p.color) }, [0, 0, box.w, box.h]);
  },
});
const sanitizeTags = raw => Array.isArray(raw) ? raw.slice(0, 80).filter(t => Array.isArray(t) && /^[A-Z0-9]{1,16}$/.test(t[0])).map(t => [t[0], sStr(String(t[1] ?? ''), 4000)]) : [];
defineWidget({
  type: 'sensorItem', label: 'AIDA64 sensor item', cat: 'Imported', kind: 'imported', resize: 'none',
  defaults: () => ({ sensor: 'TMOBO', tags: [] }),
  fields: IMPORTED_FIELDS,
  sanitize(p, raw) { p.tags = sanitizeTags(raw.tags); },
  sensors: p => [p.sensor],
  emit(P, p, box) { P.item({ kind: 'SITEM', id: p.sensor, x: 0, y: 0, tags: p.tags }, [0, 0, box.w, box.h]); },
});
defineWidget({
  type: 'rawItem', label: 'Other AIDA64 item', cat: 'Imported', kind: 'imported', resize: 'none',
  defaults: () => ({ id: 'LBL', tags: [] }),
  fields: [],
  sanitize(p, raw) { p.id = sStr(raw.id, 60); p.tags = sanitizeTags(raw.tags); },
  emit(P, p, box) { P.item({ kind: 'RAW', id: p.id, x: 0, y: 0, tags: p.tags }, [0, 0, box.w, box.h]); },
});
