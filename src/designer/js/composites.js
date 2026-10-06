/* ================================================================ composites: layouts that depend on hardware counts
   expand(p, box, env) returns child widgets in the composite's local coordinates. Children of type '_div' only add an
   AIDA64 divider label to the file; Detach drops them and turns the rest into a group of ordinary widgets. */

/* ---- widget factory: place text and values by their anchor and baseline, as the builder's tl/tr/tc and simple() do ---- */
const WF = {
  make(type, p, x, y, w, h) { const d = WT[type].defaults({}); return { id: nid(), type, x, y, w, h, p: { ...d, ...p } }; },
  /* static text with its baseline at yb; align l | c | r anchors x */
  text(x, yb, s, px, weight, color, spacing = 0, align = 'l', family = 'sel', extra = {}) {
    const p = { ...WT.text.defaults({}), text: s, px, weight, color, spacing, align, family, ...extra }, m = WT.text.measure(p);
    const asc = (STATIC_METRICS[family] || STATIC_METRICS.sel).asc * px;
    return WF.make('text', p, align === 'r' ? x - m.w : align === 'c' ? x - m.w / 2 : x, yb - asc, m.w, m.h);
  },
  caption: (x, yb, s, align = 'l', col = '@lo', px = 22) => WF.text(x, yb, s, px, 'bold', col, .14, align),
  /* live value; top = top of the GDI cell (the builder passes baseline - ASC * px) */
  valueTop(sensor, x, top, pt, o = {}) {
    const p = { ...WT.value.defaults({}), sensor, pt, ...o }, m = WT.value.measure(p);
    return WF.make('value', p, p.align === 'r' ? x - m.w : p.align === 'c' ? x - m.w / 2 : x, p.align === 'c' ? top - m.h / 2 : top, m.w, m.h);
  },
  value: (sensor, x, yb, pt, o = {}) => WF.valueTop(sensor, x, yb - ASC_SEGOE * pt * 96 / 72, pt, { font: 'Segoe UI', color: '@hi', ...o }),
  center: (sensor, cx, cy, pt, o = {}) => WF.valueTop(sensor, cx, cy, pt, { font: 'Segoe UI Light', color: '@hi', align: 'c', ...o }),
  rect: (x, y, w, h, fill) => WF.make('rect', { fill }, x, y, w, h),
  hline: (x0, x1, y, col = '@hair', w = 2) => WF.rect(x0, y - w / 2, x1 - x0, w, col),
  vline: (x, y0, y1, col = '@hair', w = 2) => WF.rect(x - w / 2, y0, w, y1 - y0, col),
  bar: (sensor, lo, hi, x, y, w, h, o = {}) => WF.make('bar', { sensor, lo, hi, ...o }, x, y, Math.round(w), h),
  graph: (sensor, x, y, w, h, lo, hi, color, o = {}) => WF.make('graph', { sensor, lo, hi, color, ...o }, x, y, w, h),
  ring(sensor, lo, hi, cx, cy, r0, r1, o = {}) { const s = Math.floor(2 * r1 + 8); return WF.make('ring', { sensor, lo, hi, r0, r1, ...o }, cx - s / 2, cy - s / 2, s, s); },
  div: text => ({ id: nid(), type: '_div', x: 0, y: 0, w: 0, h: 0, p: { text } }),
  /* the builder's sectionTitle(): accent bar, spaced bold title, optional dim subtitle */
  section(x, yb, title, sub, accent = '@title') {
    const out = [WF.rect(x, yb - 24, 6, 26, accent)], t = WF.text(x + 22, yb, title, 28, 'bold', '@title', .16);
    out.push(t);
    if (sub) out.push(WF.text(t.x + t.w + 26, yb, sub, 24, 'reg', '@lo', .04));
    return out;
  },
};
const scaleChildren = (kids, k) => k === 1 ? kids : kids.map(c => {
  const q = JSON.parse(JSON.stringify(c)); q.x *= k; q.y *= k; q.w *= k; q.h *= k;
  if (WT[q.type]?.scale) WT[q.type].scale(q.p, k); else if (q.type === 'bar' || q.type === 'graph') { if (q.p.gap) q.p.gap *= k; if (q.p.thick) q.p.thick = Math.max(1, Math.round(q.p.thick * k)); }
  return q;
});
defineWidget({ type: '_div', label: 'Divider label', cat: '', kind: 'internal', resize: 'none', defaults: () => ({ text: '' }), fields: [{ k: 'text', t: 'text', label: 'Text', max: 200 }],
  emit(P, p) { P.item({ kind: 'DIV', text: p.text }); } });

/* ---- CPU core table: one row per core with clock, temperature, temperature bar and thread load ---- */
defineWidget({
  type: 'coreTable', label: 'CPU core table', cat: 'Tables', kind: 'composite', resize: 'aspect',
  defaults: () => ({ pCores: 6, eCores: 8, smt: true, k: 1, accent: '@cpu', tempLo: 30, tempHi: 100, title: 'CPU CORES' }),
  fields: [
    { k: 'pCores', t: 'int', label: 'P-cores', min: 0, max: 64 }, { k: 'eCores', t: 'int', label: 'E-cores', min: 0, max: 64 },
    { k: 'smt', t: 'bool', label: 'Two threads per P-core', hint: 'Hyper-Threading / SMT. Threads are numbered P-cores first, then E-cores.' },
    { k: 'title', t: 'text', label: 'Title', max: 40 }, { k: 'accent', t: 'color', label: 'Accent' },
    { k: 'tempLo', t: 'num', label: 'Temp bar from' }, { k: 'tempHi', t: 'num', label: 'Temp bar to' },
  ],
  sensors(p) { const s = []; const n = p.pCores + p.eCores; for (let c = 1; c <= n; c++) s.push(`SCC-1-${c}`, `TCC-1-${c}`); const t = p.pCores * (p.smt ? 2 : 1) + p.eCores; for (let i = 1; i <= t; i++) s.push(`SCPU${i}UTI`); return s; },
  layout(p) {
    const P = p.pCores, E = p.eCores, need = 40 + Math.max(0, P - 1) * 70 + (E ? 136 + (E - 1) * 52 : 0);
    const f = Math.min(1, Math.max(.35, 890 / Math.max(1, need)));
    return { f, pP: 70 * f, pE: 52 * f, h: 190 + need * f + 40 };
  },
  measure(p) { return { w: 1760 * p.k, h: this.layout(p).h * p.k }; },
  anchor: () => 'l', scale(p, f) { p.k *= f; },
  expand(p) {
    const L = this.layout(p), f = L.f, out = [], P = p.pCores, E = p.eCores, T = P * (p.smt ? 2 : 1) + E;
    const sub = E ? `${P} P-CORES  ·  ${E} E-CORES  ·  ${T} THREADS` : `${P} CORES  ·  ${T} THREADS`;
    out.push(...WF.section(0, 30, p.title, sub, p.accent));
    out.push(WF.caption(0, 138, 'CORE'), WF.caption(306, 138, 'CLOCK  MHZ', 'r'), WF.caption(456, 138, 'TEMP', 'r'),
             WF.caption(506, 138, `${p.tempLo} – ${p.tempHi} °C`), WF.caption(1006, 138, 'THREAD LOAD'), WF.caption(1760, 138, '0 – 100 %', 'r'));
    const row = (label, core, threads, cy) => {
      out.push(WF.div(`----- ${label} (core ${core}) -----`));
      out.push(WF.text(0, cy + 11 * f, label, 30 * Math.max(f, .7), 'bold', '@mid', .06));
      const pt = Math.max(10, Math.round(25 * Math.max(f, .6)));
      out.push(WF.value(`SCC-1-${core}`, 306, cy + 12 * f, pt, { align: 'r' }), WF.value(`TCC-1-${core}`, 456, cy + 12 * f, pt, { align: 'r', unit: '°' }));
      out.push(WF.bar(`TCC-1-${core}`, p.tempLo, p.tempHi, 506, cy - 9 * f, 440, 18 * f, { paint: 'heat', color: p.accent }));
      const ys = threads.length === 2 ? [cy - 17 * f, cy + 3 * f] : [cy - 7 * f];
      threads.forEach((t, i) => out.push(WF.bar(`SCPU${t}UTI`, 0, 100, 1006, ys[i], 754, 14 * f, { color: p.accent })));
    };
    let y = 190;
    if (P) {
      out.push(WF.caption(0, y, E ? 'PERFORMANCE CORES' : 'CORES', 'l', '@mid'));
      for (let n = 1; n <= P; n++) row(E ? `P${n}` : `C${n}`, n, p.smt ? [2 * n - 1, 2 * n] : [n], y + 40 + (n - 1) * L.pP);
      y += 40 + (P - 1) * L.pP + 96 * f;
    }
    if (E) {
      out.push(WF.caption(0, y, 'EFFICIENT CORES', 'l', '@mid'));
      const t0 = P * (p.smt ? 2 : 1);
      for (let m = 1; m <= E; m++) row(`E${m}`, P + m, [t0 + m], y + 40 + (m - 1) * L.pE);
    }
    return scaleChildren(out, p.k);
  },
});

/* ---- power rows: label, value, bar (and an optional second value, e.g. 12VHPWR volts) ---- */
const POWER_COLS = [{ k: 'label', t: 'text', label: 'Label', max: 20, d: 'POWER' }, { k: 'sensor', t: 'sensor', label: 'Sensor', d: 'PCPUPKG' },
                    { k: 'max', t: 'num', label: 'Max', min: 1, max: 100000, d: 200 }, { k: 'unit', t: 'text', label: 'Unit', max: 8, d: ' W' },
                    { k: 'color', t: 'color', label: 'Colour', d: '@cpu' }, { k: 'sensor2', t: 'text', label: 'Second value', max: 40, d: '' }, { k: 'unit2', t: 'text', label: 'Unit', max: 8, d: ' V' }];
defineWidget({
  type: 'powerTable', label: 'Power draw rows', cat: 'Tables', kind: 'composite', resize: 'aspect',
  defaults: () => ({ title: 'POWER DRAW', k: 1, rows: [
    { label: 'CPU PACKAGE', sensor: 'PCPUPKG', max: 200, unit: ' W', color: '@cpu', sensor2: '', unit2: ' V' }, { label: 'CPU CORES', sensor: 'PCPUIAC', max: 200, unit: ' W', color: '@cpu', sensor2: '', unit2: ' V' },
    { label: 'GPU', sensor: 'PGPU1', max: 450, unit: ' W', color: '@gpu', sensor2: '', unit2: ' V' }, { label: 'GPU TDP', sensor: 'PGPU1TDPP', max: 150, unit: ' %', color: '@gpu', sensor2: '', unit2: ' V' }] }),
  fields: [{ k: 'title', t: 'text', label: 'Title', max: 40 }, { k: 'rows', t: 'rows', label: 'Rows', cols: POWER_COLS, maxRows: 8 }],
  sensors: p => p.rows.flatMap(r => [r.sensor, r.sensor2].filter(Boolean)),
  measure(p) { const n = p.rows.length; return { w: 1760 * p.k, h: ((n > 4 ? 80 : 86) + n * (n > 4 ? 48 : 56) + 10) * p.k }; },
  anchor: () => 'l', scale(p, f) { p.k *= f; },
  expand(p) {
    const out = [], n = p.rows.length, step = n > 4 ? 48 : 56, top = n > 4 ? 80 : 86;
    out.push(...WF.section(0, 30, p.title));
    const seen = []; for (const r of p.rows) { const s = `0 – ${r.max}${r.unit}`; if (!seen.includes(s)) seen.push(s); }
    out.push(WF.caption(1760, 30, seen.join('  ·  '), 'r'));
    p.rows.forEach((r, i) => {
      const cy = top + i * step, two = !!r.sensor2;
      out.push(WF.div(`----- power: ${r.label} -----`));
      out.push(WF.caption(0, cy + 8, r.label, 'l', '@mid', 24));
      out.push(WF.value(r.sensor, 576, cy + 10, 24, { align: 'r', unit: r.unit }));
      out.push(WF.bar(r.sensor, 0, r.max, 626, cy - 9, two ? 1134 - 210 : 1134, 18, { color: r.color }));
      if (two) out.push(WF.value(normId(r.sensor2.toUpperCase()), 1760, cy + 10, 24, { align: 'r', unit: r.unit2 }));
    });
    return scaleChildren(out, p.k);
  },
});

/* ---- storage rows: name and letter, temperature, space used (bar), read/write speed, activity ---- */
const DISK_COLS = [{ k: 'name', t: 'text', label: 'Name', max: 16, d: 'DISK' }, { k: 'num', t: 'int', label: 'AIDA64 disk', min: 0, max: 50, d: 1 },
                   { k: 'letter', t: 'text', label: 'Letter', max: 1, d: 'C' }];
defineWidget({
  type: 'storageTable', label: 'Storage rows', cat: 'Tables', kind: 'composite', resize: 'aspect',
  defaults: () => ({ title: 'STORAGE', k: 1, rows: [{ name: 'DISK 1', num: 1, letter: 'C' }, { name: 'DISK 2', num: 2, letter: 'D' }] }),
  fields: [{ k: 'title', t: 'text', label: 'Title', max: 40 }, { k: 'rows', t: 'rows', label: 'Drives', cols: DISK_COLS, maxRows: 6,
             hint: 'Temperature and speed come from the disk number; space used comes from the drive letter. 0 or empty leaves it out.' }],
  sensors: p => p.rows.flatMap(r => { const L = (r.letter || '').toUpperCase(), s = []; if (r.num) s.push(`THDD${r.num}`, `SDSK${r.num}READSPD`, `SDSK${r.num}WRITESPD`, `SDSK${r.num}ACT`); if (/^[A-Z]$/.test(L)) s.push(`SDRV${L}UTI`); return s; }),
  measure(p) { const c = p.rows.length > 2; return { w: 1760 * p.k, h: (72 + p.rows.length * (c ? 52 : 96) + 12) * p.k }; },
  anchor: () => 'l', scale(p, f) { p.k *= f; },
  expand(p) {
    const out = [], compact = p.rows.length > 2, pitch = compact ? 52 : 96;
    out.push(...WF.section(0, 30, p.title));
    out.push(WF.caption(306, 80, 'TEMP', 'r'), WF.caption(456, 80, 'USED', 'r'), WF.caption(506, 80, 'SPACE USED'), WF.caption(1346, 80, 'READ  MB/S', 'r'), WF.caption(1760, 80, 'WRITE  MB/S', 'r'));
    p.rows.forEach((d, i) => {
      const t = 102 + i * pitch, num = d.num || 0, L = /^[A-Za-z]$/.test(d.letter || '') ? d.letter.toUpperCase() : '';
      out.push(WF.div(`----- storage: disk ${num || '-'} / ${L || '-'}: -----`));
      const nm = WF.text(0, t + 36, (d.name.trim() || `DISK ${num}`).toUpperCase(), 28, 'bold', '@mid', .06);
      out.push(nm);
      if (L) out.push(WF.text(Math.max(140, nm.x + nm.w + 18), t + 36, `${L}:`, 28, 'reg', '@lo'));
      if (num) out.push(WF.value(`THDD${num}`, 306, t + 37, 25, { align: 'r', unit: '°' }));
      if (L) { out.push(WF.value(`SDRV${L}UTI`, 456, t + 37, 25, { align: 'r', unit: ' %' }));
               out.push(WF.bar(`SDRV${L}UTI`, 0, 100, 506, t + 18, 440, compact ? 14 : 18, { paint: 'level', color: '@neu', warnFrom: .87 })); }
      if (num) {
        out.push(WF.value(`SDSK${num}READSPD`, 1346, t + 37, 25, { align: 'r' }), WF.value(`SDSK${num}WRITESPD`, 1760, t + 37, 25, { align: 'r' }));
        if (!compact) { out.push(WF.caption(0, t + 76, 'ACTIVITY', 'l', '@lo', 18)); out.push(WF.bar(`SDSK${num}ACT`, 0, 100, 506, t + 64, 1254, 10, { color: '@neu' })); }
      }
    });
    return scaleChildren(out, p.k);
  },
});

/* ---- cooling row: board temperatures on the title line, then one cell per fan (and coolant) across the width ---- */
const FAN_COLS = [{ k: 'label', t: 'text', label: 'Label', max: 14, d: 'FAN' }, { k: 'sensor', t: 'sensor', label: 'Sensor', d: 'FCPU' },
                  { k: 'max', t: 'num', label: 'Max', min: 1, max: 20000, d: 3000 }, { k: 'unit', t: 'text', label: 'Unit', max: 8, d: '' },
                  { k: 'min', t: 'num', label: 'Min', min: -1000, max: 20000, d: 0 }, { k: 'warn', t: 'num', label: 'Warn from', min: 0, max: 1, d: 0 }];
defineWidget({
  type: 'fanRow', label: 'Cooling row', cat: 'Tables', kind: 'composite', resize: 'aspect',
  defaults: () => ({ title: 'COOLING', sub: 'RPM  ·  °C', board: true, k: 1, cells: [
    { label: 'COOLANT', sensor: 'TWATER', min: 20, max: 50, unit: '°', warn: .67 }, { label: 'CPU FAN', sensor: 'FCPU', min: 0, max: 3000, unit: '', warn: 0 },
    { label: 'PUMP', sensor: 'FAIOPUMP', min: 0, max: 4500, unit: '', warn: 0 }, { label: 'CASE 1', sensor: 'FCHA1', min: 0, max: 3000, unit: '', warn: 0 },
    { label: 'CASE 2', sensor: 'FCHA2', min: 0, max: 3000, unit: '', warn: 0 }, { label: 'CASE 3', sensor: 'FCHA3', min: 0, max: 3000, unit: '', warn: 0 },
    { label: 'GPU FAN', sensor: 'FGPU1', min: 0, max: 3000, unit: '', warn: 0 }] }),
  fields: [{ k: 'title', t: 'text', label: 'Title', max: 40 }, { k: 'sub', t: 'text', label: 'Subtitle', max: 40 },
           { k: 'board', t: 'bool', label: 'Motherboard, VRM and PCH temperatures' }, { k: 'cells', t: 'rows', label: 'Cells', cols: FAN_COLS, maxRows: 10 }],
  sensors: p => [...(p.board ? ['TMOBO', 'TVRM', 'TPCH'] : []), ...p.cells.map(c => c.sensor)],
  measure(p) { return { w: 1760 * p.k, h: 110 * p.k }; },
  anchor: () => 'l', scale(p, f) { p.k *= f; },
  expand(p) {
    const out = [];
    out.push(...WF.section(0, 30, p.title, p.sub));
    if (p.board) {
      out.push(WF.div('----- board temperatures -----'));
      [['BOARD', 'TMOBO'], ['VRM', 'TVRM'], ['PCH', 'TPCH']].forEach(([lab, s], k) => { const sx = 1760 - 230 * (3 - k); out.push(WF.caption(sx, 30, lab, 'l', '@mid'), WF.value(s, sx + 200, 31, 24, { align: 'r', unit: '°' })); });
    }
    const n = p.cells.length, W = n ? (1760 - (n - 1) * 32) / n : 0;
    p.cells.forEach((c, i) => {
      const x0 = i * (W + 32), x1 = x0 + W;
      out.push(WF.div(`----- cooling: ${c.label} -----`));
      out.push(WF.caption(x0, 78, c.label, 'l', '@mid'), WF.value(c.sensor, x1, 80, 24, { align: 'r', unit: c.unit }));
      out.push(WF.bar(c.sensor, c.min, c.max, x0, 98, W, 14, c.warn ? { paint: 'level', warnFrom: c.warn, color: '@neu', gap: 3 } : { color: '@neu', gap: 3 }));
    });
    return scaleChildren(out, p.k);
  },
});

/* ---- readout: what a dropped sensor becomes. Caption and value, optional bar or graph underneath. ---- */
defineWidget({
  type: 'readout', label: 'Readout', cat: 'Readings', kind: 'composite', resize: 'x', size: { w: 360, h: 80 },
  defaults: () => ({ sensor: 'SCPUUTI', caption: 'CPU LOAD', unit: ' %', pt: 24, font: 'Segoe UI', color: '@hi', capColor: '@lo', extra: 'none', lo: 0, hi: 100, accent: '@neu' }),
  fields: [
    { k: 'sensor', t: 'sensor', label: 'Sensor' }, { k: 'caption', t: 'text', label: 'Caption', max: 40 }, { k: 'unit', t: 'text', label: 'Unit', max: 16 },
    { k: 'font', t: 'font', label: 'Font', live: true }, { k: 'pt', t: 'int', label: 'Size pt', min: 6, max: 200 },
    { k: 'color', t: 'color', label: 'Value colour' }, { k: 'capColor', t: 'color', label: 'Caption colour' },
    { k: 'extra', t: 'select', label: 'Underneath', opts: [['none', 'Nothing'], ['bar', 'Segmented bar'], ['graph', 'Graph']] },
    { k: 'lo', t: 'num', label: 'Min', show: p => p.extra !== 'none' }, { k: 'hi', t: 'num', label: 'Max', show: p => p.extra !== 'none' },
    { k: 'accent', t: 'color', label: 'Bar / graph colour', show: p => p.extra !== 'none' },
  ],
  sensors: p => [p.sensor],
  measure(p, env, box) { const px = p.pt * 96 / 72; return { w: box?.w || 360, h: px * 1.35 + (p.extra === 'bar' ? 34 : p.extra === 'graph' ? 110 : 0) }; },
  anchor: () => 'l',
  scale(p, f) { p.pt = Math.max(6, Math.round(p.pt * f)); },
  expand(p, box) {
    const px = p.pt * 96 / 72, yb = px * 1.08, out = [];
    out.push(WF.caption(0, yb, p.caption, 'l', p.capColor, Math.max(10, Math.round(px * .62))));
    out.push(WF.value(p.sensor, box.w, yb, p.pt, { align: 'r', unit: p.unit, font: p.font, color: p.color }));
    if (p.extra === 'bar') out.push(WF.bar(p.sensor, p.lo, p.hi, 0, px * 1.35 + 12, box.w, 14, { color: p.accent }));
    if (p.extra === 'graph') out.push(WF.graph(p.sensor, 0, px * 1.35 + 12, box.w, 96, p.lo, p.hi, p.accent, { step: 2 }));
    return out;
  },
});

/* expanded children of a composite, measured, in local coordinates */
function expandComposite(w, env) { return WT[w.type].expand(w.p, { x: 0, y: 0, w: w.w, h: w.h }, env); }

/* starting props for the tables on a given PC (the palette and the assistant) */
function tableDefaults(type, hw) {
  hw = hw || HW_DEFAULTS; const g = hw.gpu || 1;
  if (type === 'coreTable') return { pCores: hw.pCores, eCores: hw.eCores, smt: hw.smt !== false };
  if (type === 'powerTable') return { rows: [{ label: 'CPU PACKAGE', sensor: 'PCPUPKG', max: 200, unit: ' W', color: '@cpu', sensor2: '', unit2: ' V' }, { label: 'GPU', sensor: `PGPU${g}`, max: 450, unit: ' W', color: '@gpu', sensor2: '', unit2: ' V' }] };
  if (type === 'storageTable') return { rows: (hw.disks?.length ? hw.disks : HW_DEFAULTS.disks).map(d => ({ name: d.name, num: d.num || 0, letter: d.letter || '' })) };
  if (type === 'fanRow') return { board: false, sub: 'RPM', cells: (hw.fans?.length ? hw.fans : HW_DEFAULTS.fans).map(f => ({ label: f.label, sensor: f.id, min: 0, max: f.max, unit: '', warn: 0 })) };
  return {};
}
