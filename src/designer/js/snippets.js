/* ================================================================ snippets: ready-made groups (palette presets and theme parts)
   Each returns widgets in panel coordinates. Static parts come first so they sit below the live readings, which is
   where the builder puts them (everything static is in its background). */
const SNIP = {
  /* the builder's CPU / GPU ring tile */
  ringTile(o) {
    const { cx, cy = 600, title = 'CPU', accent = '@cpu', load = 'SCPUUTI', temp = 'TCPUPKG', tcap = 'PACKAGE  °C', chips = [], extra = null, warmCols = true } = o;
    const S = [], L = [];
    for (const [a, s] of [[-135, '0'], [135, '100']]) { const r = a * Math.PI / 180; S.push(WF.text(cx + 412 * Math.sin(r), cy - 412 * Math.cos(r) + 8, s, 22, 'bold', '@lo', 0, 'c')); }
    S.push(WF.text(cx, cy - 196, title, 40, 'bold', accent, .3, 'c'));
    S.push(WF.caption(cx, cy + 72, tcap, 'c'), WF.caption(cx, cy + 212, '%  LOAD', 'c'));
    L.push(WF.ring(load, 0, 100, cx, cy, 346, 380, { color: accent }));
    L.push(WF.ring(temp, 20, 100, cx, cy, 304, 322, { color: accent, paint: warmCols ? 'heat' : 'solid' }));
    L.push(WF.center(temp, cx, cy - 58, 128), WF.center(load, cx, cy + 140, 54));
    const step = chips.length > 3 ? 215 : 280, x0c = cx - ((chips.length - 1) * step + 170) / 2;
    chips.forEach(([lab, s, unit], i) => { const x = x0c + i * step; S.push(WF.caption(x, cy + 446, lab)); L.push(WF.value(s, x, cy + 504, chips.length > 3 ? 28 : 32, { unit })); });
    if (extra) { S.push(WF.caption(cx - 14, cy + 358, extra[0], 'r')); L.push(WF.value(extra[1], cx + 14, cy + 360, 26, { unit: extra[2] })); }
    return [...S, ...L];
  },
  /* the builder's header: clock, date, uptime and the centre slot (now playing, a title or a registry string) */
  header(o) {
    const { x0 = 96, x1 = 1856, mode = 'media', title = '' } = o, S = [], L = [];
    L.push(WF.value('STIME', x0, 150, 54, { font: 'Segoe UI Light' }), WF.value('SDATE', x1, 108, 22, { align: 'r', color: '@mid' }), WF.value('SUPTIME', x1, 150, 22, { align: 'r', color: '@mid' }));
    S.push(WF.caption(x1 - 250, 150, 'UPTIME', 'r'));
    if (mode === 'title' && title.trim()) S.push(WF.text(976, 146, title.trim().toUpperCase(), 30, 'bold', '@title', .22, 'c'));
    if (mode === 'media') { S.push(WF.caption(560, 108, 'NOW PLAYING')); L.push(WF.value('SMEDSTA', 760, 108, 17, { color: '@mid' }), WF.value('SMEDPOS', 900, 108, 17, { color: '@mid' }), WF.value('SMEDTIT', 560, 152, 26)); }
    if (mode === 'reg') { S.push(WF.caption(560, 108, 'NOTE')); L.push(WF.value('SREGVALS1', 560, 152, 26)); }
    return [...S, ...L];
  },
  /* frame rate tile + load history (builder lines 428-440) */
  fpsLoad(o) {
    const { x0 = 96, refresh = true, cpuCol = '@cpu', gpuCol = '@gpu', gpu = 1 } = o, S = [], L = [];
    S.push(...WF.section(x0, 1220, 'FRAME RATE', 'RTSS'), WF.caption(x0 + 4, 1446, 'FPS'), WF.text(936, 1250, '240', 20, 'bold', '@lo', 0, 'r'));
    S.push(...WF.section(1016, 1220, 'LOAD HISTORY'), WF.text(1016, 1290, 'CPU', 20, 'bold', cpuCol, .14), WF.text(1016, 1430, 'GPU', 20, 'bold', gpuCol, .14));
    L.push(WF.value('SRTSSFPS', x0, 1392, 72, { font: 'Segoe UI Light' }));
    if (refresh) { S.push(WF.caption(x0 + 4, 1494, 'REFRESH')); L.push(WF.value('SVREFRATE', x0, 1534, 24, { unit: ' Hz', color: '@mid' })); }
    L.push(WF.graph('SRTSSFPS', 360, 1262, 576, 250, 0, 240, '@fps'));
    L.push(WF.graph('SCPUUTI', 1016, 1262, 840, 110, 0, 100, cpuCol), WF.graph(`SGPU${gpu}UTI`, 1016, 1402, 840, 110, 0, 100, gpuCol));
    return [...S, ...L];
  },
  /* memory / VRAM tile (builder lines 443-468) */
  memTile(o) {
    const { x0, tw, title, sub, pct, used, free, hist = true, accent = '@cpu', side = null } = o, x1 = x0 + tw, S = [], L = [];
    S.push(...WF.section(x0, 1640, title, sub));
    L.push(WF.value(pct, x0, 1772, 66, { unit: ' %', font: 'Segoe UI Light' }));
    if (hist) {
      const mid = x0 + tw / 2;
      S.push(WF.caption(x0, 1840, 'USED'), WF.caption(mid + 20, 1840, 'FREE'));
      S.push(WF.hline(x0, x1, 1872 + 120 * .15, '#56421a', 2), WF.text(x1, 1866, '85 %', 16, 'bold', '#785c26', .1, 'r'));
      L.push(WF.value(used, mid - 20, 1840, 24, { unit: ' MB', align: 'r' }), WF.value(free, x1, 1840, 24, { unit: ' MB', align: 'r' }));
      L.push(WF.graph(pct, x0, 1872, tw, 120, 0, 100, accent, { step: 1 }));
    } else {
      S.push(WF.caption(x0, 1856, 'USED'), WF.caption(x0, 1914, 'FREE'));
      L.push(WF.value(used, x1, 1856, 24, { unit: ' MB', align: 'r' }), WF.value(free, x1, 1914, 24, { unit: ' MB', align: 'r' }));
      L.push(WF.bar(pct, 0, 100, x0, 1972, tw, 20, { paint: 'level', color: '@neu', warnFrom: .85 }));
    }
    if (side) { S.push(WF.caption(x1, 1716, side.caption, 'r')); side.values.forEach(v => L.push(WF.value(v.sensor, v.x, 1772, 30, { unit: v.unit, align: 'r' }))); }
    return [...S, ...L];
  },
  /* network tile (builder lines 469-482) */
  netTile(o) {
    const { x0, tw, nic, label = `NIC${nic}`, totals = true } = o, x1 = x0 + tw, S = [], L = [];
    S.push(...WF.section(x0, 1640, 'NETWORK', label.trim().toUpperCase()), WF.caption(x0, 1700, 'DOWN'), WF.caption(x0, 1880, 'UP'));
    L.push(WF.value(`SNIC${nic}DLRATE`, x1, 1700, 24, { unit: ' KB/s', align: 'r' }), WF.graph(`SNIC${nic}DLRATE`, x0, 1716, tw, 96, 0, 20000, '@neu', { auto: true }));
    L.push(WF.value(`SNIC${nic}ULRATE`, x1, 1880, 24, { unit: ' KB/s', align: 'r' }), WF.graph(`SNIC${nic}ULRATE`, x0, 1896, tw, 96, 0, 5000, '@neu', { auto: true }));
    if (totals) L.push(WF.value(`SNIC${nic}CONNSPD`, x1, 1640, 22, { unit: ' Mbps', align: 'r', color: '@mid' }), WF.value(`SNIC${nic}TOTDL`, x0 + 92, 1700, 20, { unit: ' MB', color: '@mid' }), WF.value(`SNIC${nic}TOTUL`, x0 + 92, 1880, 20, { unit: ' MB', color: '@mid' }));
    return [...S, ...L];
  },
  /* Classic OLED dial with title, unit, centred reading and (big dials) a readout window */
  dialTile(o) {
    const { cx, cy, big = true, sensor, lo, hi, major, mid, minor, red, title, unit, win = null } = o;
    const G = big ? { title_dy: -200, title_px: 54, val_dy: 170, val_pt: 112, unit_dy: 284, unit_px: 40, R: 520 } : { title_dy: -82, title_px: 30, val_dy: 122, val_pt: 54, unit_dy: 184, unit_px: 26, R: 240 };
    const S = [], L = [], after = [];
    S.push(inkText(cx, cy + G.title_dy, title, G.title_px, 'semi', '@ctitle', .16));
    S.push(inkText(cx, cy + G.unit_dy, unit, G.unit_px, 'med', '@unit', big ? .06 : .12));
    if (big && win) {
      const ww = 344, wh = 88, wy = cy + 376;
      S.push(WF.make('rect', { fill: '@window', outline: true, lineW: 3, radius: 12 }, cx - ww / 2, wy - wh / 2, ww, wh));
      const capH = inkBox('H', 24, 'semi', 'bsc'); const yb = wy + (capH.b - capH.t) / 2;
      S.push(WF.text(cx - ww / 2 + 22, yb, win.caption, 24, 'semi', '@unit', .14, 'l', 'bsc'));
      const pt = Math.round(52 * 72 / 96);
      after.push(WF.valueTop(win.sensor, cx + ww / 2 - 22, wy - pt * 96 / 72 * 1.25 / 2, pt, { font: 'Bahnschrift', color: '@livesm', unit: win.unit, align: 'r' }));
    }
    L.push(WF.make('dial', { sensor, lo, hi, style: big ? 'big' : 'small', r: G.R, major, mid: mid || 0, minor, red: !!red, redFrom: red ? red[0] : 0, redTo: red ? red[1] : 0 }, cx - G.R, cy - G.R, 2 * G.R, 2 * G.R));
    L.push(WF.valueTop(sensor, cx, cy + G.val_dy, G.val_pt, { font: 'Bahnschrift Light', color: '@live', align: 'c' }));
    return [...S, ...L, ...after];          /* readings inside the face come after the dial, or the face would be lifted above them */
  },
  /* Classic OLED meter group: title with a hairline, then label, meter and value per item */
  meterGroup(o) {
    const { x0, x1, title, mw, items } = o, S = [], L = [];
    const t = WF.text(x0, 1800, title, 26, 'semi', '@unit', .14, 'l', 'bsc'); S.push(t);
    S.push(WF.rect(t.x + t.w + 18, 1791, x1 - (t.x + t.w + 18), 1.5, '@chair'));
    items.forEach((it, i) => {
      const ix = Math.round(x0 + i * (mw + 56));
      S.push(WF.text(ix, 1880, it.label, 30, 'semi', '@ctitle', .08, 'l', 'bsc'));
      L.push(WF.make('meter', { sensor: it.sensor, scale: it.scale, mw }, ix - 16, 1920, mw + 42, 100));
      const pt = it.scale === 'net' ? 26 : 28;
      L.push(WF.valueTop(it.sensor, ix + mw, 1880 - pt * 96 / 72, pt, { font: 'Bahnschrift', color: '@livesm', unit: it.unit, align: 'r' }));
    });
    return [...S, ...L];
  },
};
/* Pillow text_center() as a widget: spaced text centred on its advance width and its ink height */
function inkText(cx, cy, s, px, weight, color, spacing) {
  const w = textWidth(s, px, weight, 'bsc', spacing), ib = inkBox(s, px, weight, 'bsc'), yb = cy - (ib.t + ib.b) / 2;
  return WF.text(cx - w / 2, yb, s, px, weight, color, spacing, 'l', 'bsc');
}

/* palette presets: name, category, builder(at) -> widgets around (0, 0) */
const PRESETS = [
  { id: 'section', label: 'Section title', cat: 'Text & shapes', make: () => WF.section(0, 30, 'SECTION', 'SUBTITLE') },
  { id: 'line', label: 'Divider line', cat: 'Text & shapes', make: () => [WF.hline(0, 800, 1)] },
  { id: 'clock', label: 'Clock', cat: 'Readings', make: () => [WF.value('STIME', 0, 80, 54, { font: 'Segoe UI Light' }), WF.value('SDATE', 0, 120, 20, { color: '@mid' })] },
  { id: 'header', label: 'Header bar', cat: 'Tiles', make: () => SNIP.header({ mode: 'media' }).concat(WF.hline(96, 1856, 186)) },
  { id: 'ringCpu', label: 'CPU ring tile', cat: 'Tiles', make: o => SNIP.ringTile({ cx: 536, title: 'CPU', accent: '@cpu', load: 'SCPUUTI', temp: o?.hw?.cpuTemp || 'TCPUPKG',
      chips: [['CLOCK', 'SCPUCLK', ' MHz'], ['POWER', 'PCPUPKG', ' W'], ['VCORE', 'VCPU', ' V']] }) },
  { id: 'ringGpu', label: 'GPU ring tile', cat: 'Tiles', make: o => { const g = o?.hw?.gpu || 1; return SNIP.ringTile({ cx: 536, title: 'GPU', accent: '@gpu', load: `SGPU${g}UTI`, temp: o?.hw?.gpuTemp || `TGPU${g}DIO`, tcap: 'CORE  °C',
      chips: [['CLOCK', `SGPU${g}CLK`, ' MHz'], ['POWER', `PGPU${g}`, ' W'], ['HOTSPOT', `TGPU${g}HOT`, ' °C']] }); } },
  { id: 'fps', label: 'Frame rate + load history', cat: 'Tiles', make: () => SNIP.fpsLoad({}) },
  { id: 'mem', label: 'Memory tile', cat: 'Tiles', make: () => SNIP.memTile({ x0: 96, tw: 554.67, title: 'MEMORY', sub: 'SYSTEM RAM', pct: 'SMEMUTI', used: 'SUSEDMEM', free: 'SFREEMEM' }) },
  { id: 'net', label: 'Network tile', cat: 'Tiles', make: o => SNIP.netTile({ x0: 96, tw: 554.67, nic: o?.hw?.nic || 1 }) },
  { id: 'dialBig', label: 'Big dial', cat: 'Tiles', make: () => SNIP.dialTile({ cx: 700, cy: 630, big: true, sensor: 'TCPUPKG', lo: 20, hi: 100, major: 20, mid: 10, minor: 2, red: [90, 100], title: 'CPU', unit: '°C', win: { caption: 'CLOCK', sensor: 'SCPUCLK', unit: ' MHz' } }) },
  { id: 'dialSmall', label: 'Small dial', cat: 'Tiles', make: () => SNIP.dialTile({ cx: 430, cy: 1440, big: false, sensor: 'SCPUUTI', lo: 0, hi: 100, major: 20, mid: 10, minor: 5, title: 'CPU LOAD', unit: '%' }) },
  { id: 'meters', label: 'Meter group', cat: 'Tiles', make: () => SNIP.meterGroup({ x0: 190, x1: 772, title: 'STORAGE  ·  % USED', mw: 262, items: [{ label: 'DRIVE C:', sensor: 'SDRVCUTI', scale: 'pct', unit: '' }, { label: 'DRIVE D:', sensor: 'SDRVDUTI', scale: 'pct', unit: '' }] }) },
];
