/* ================================================================ theme: Classic OLED (port of src/classic/gen.py)
   Three big dials, six small dials and a row of linear meters on 3840 x 2160; Bahnschrift readings, Barlow markings.
   Drives, fans, the network adapter and the GPU number come from the hw profile. */
const CLASSIC_DEFAULTS = { needleColor: '#f28036', fps: true };

function themeClassic(panel, hw, opts = {}) {
  hw = hw || hwClone(HW_DEFAULTS);
  const o = { ...CLASSIC_DEFAULTS, ...opts }, g = hw.gpu || 1;
  const doc = newDoc({ name: 'Classic OLED', w: panel.w, h: panel.h, tokens: { ...TOKENS_MODERN, ...TOKENS_CLASSIC, needle: /^#[0-9a-f]{6}$/i.test(o.needleColor) ? o.needleColor : '#f28036' } });
  doc.gen = { theme: 'classic', hw: JSON.parse(JSON.stringify(hw)), opts: o };
  const CY1 = 630, CY2 = 1440, COLS = [700, 1920, 3140], N = doc.nodes;
  const big = [
    { cx: COLS[0], sensor: hw.cpuTemp || 'TCPUPKG', lo: 20, hi: 100, major: 20, mid: 10, minor: 2, red: [90, 100], title: 'CPU', unit: '°C', win: { caption: 'CLOCK', sensor: 'SCPUCLK', unit: ' MHz' } },
    o.fps ? { cx: COLS[1], sensor: 'SRTSSFPS', lo: 0, hi: 240, major: 40, mid: 20, minor: 5, red: [0, 30], title: 'FRAME RATE', unit: 'FPS', win: { caption: 'TIME', sensor: 'STIME', unit: '' } }
          : { cx: COLS[1], sensor: 'SCPUUTI', lo: 0, hi: 100, major: 20, mid: 10, minor: 2, red: null, title: 'CPU LOAD', unit: '%', win: { caption: 'TIME', sensor: 'STIME', unit: '' } },
    { cx: COLS[2], sensor: hw.gpuTemp || `TGPU${g}DIO`, lo: 20, hi: 100, major: 20, mid: 10, minor: 2, red: [85, 100], title: 'GPU', unit: '°C', win: { caption: 'CLOCK', sensor: `SGPU${g}CLK`, unit: ' MHz' } },
  ];
  for (const d of big) N.push(group(`${d.title} (${d.sensor})`, SNIP.dialTile({ ...d, cy: CY1, big: true }), `----- ${d.title} (${d.sensor}) -----`));
  const small = [
    { cx: COLS[0] - 270, sensor: 'SCPUUTI', lo: 0, hi: 100, major: 20, mid: 10, minor: 5, title: 'CPU LOAD', unit: '%' },
    { cx: COLS[0] + 270, sensor: 'PCPUPKG', lo: 0, hi: 250, major: 50, mid: 0, minor: 10, title: 'CPU POWER', unit: 'WATTS' },
    { cx: COLS[1] - 270, sensor: 'SMEMUTI', lo: 0, hi: 100, major: 20, mid: 10, minor: 5, red: [90, 100], title: 'RAM', unit: '% USED' },
    { cx: COLS[1] + 270, sensor: 'SVMEMUSAGE', lo: 0, hi: 100, major: 20, mid: 10, minor: 5, red: [90, 100], title: 'VRAM', unit: '% USED' },
    { cx: COLS[2] - 270, sensor: `PGPU${g}`, lo: 0, hi: 500, major: 100, mid: 50, minor: 20, title: 'GPU POWER', unit: 'WATTS' },
    { cx: COLS[2] + 270, sensor: `SGPU${g}UTI`, lo: 0, hi: 100, major: 20, mid: 10, minor: 5, title: 'GPU LOAD', unit: '%' },
  ];
  for (const d of small) N.push(group(`${d.title} (${d.sensor})`, SNIP.dialTile({ ...d, cy: CY2, big: false }), `----- ${d.title} (${d.sensor}) -----`));
  /* meters: storage (drive letters), cooling (fans), network */
  const letters = (hw.disks || []).map(d => d.letter).filter(Boolean).slice(0, 3);
  const groups = [];
  if (letters.length) groups.push({ title: 'STORAGE  ·  % USED', mw: 262, items: letters.map(L => ({ label: `DRIVE ${L}:`, sensor: `SDRV${L}UTI`, scale: 'pct', unit: '' })) });
  const fans = (hw.fans || []).slice(0, 6);
  if (fans.length) groups.push({ title: 'COOLING  ·  RPM', mw: 280, items: fans.map(f => ({ label: (f.label || f.id).toUpperCase().slice(0, 10), sensor: f.id, scale: (f.max || 3000) > 3000 ? 'rpm4' : 'rpm3', unit: ' RPM' })) });
  if (hw.nic) groups.push({ title: 'NETWORK  ·  MB/s', mw: 356, items: [{ label: 'DOWN', sensor: `SNIC${hw.nic}DLRATE`, scale: 'net', unit: ' KB/s' }, { label: 'UP', sensor: `SNIC${hw.nic}ULRATE`, scale: 'net', unit: ' KB/s' }] });
  const X_LEFT = 190, X_RIGHT = 3650, IN_GAP = 56;
  /* more drives or fans than gen.py's row: narrow the meters until the groups fit with at least 60 px between them */
  const room = X_RIGHT - X_LEFT - 60 * Math.max(0, groups.length - 1) - groups.reduce((a, gr) => a + (gr.items.length - 1) * IN_GAP, 0);
  const need = groups.reduce((a, gr) => a + gr.items.length * gr.mw, 0);
  if (need > room) groups.forEach(gr => gr.mw = Math.floor(gr.mw * room / need));
  const widths = groups.map(gr => gr.items.length * gr.mw + (gr.items.length - 1) * IN_GAP), sum = widths.reduce((a, b) => a + b, 0);
  const gap = groups.length > 1 ? (X_RIGHT - X_LEFT - sum) / (groups.length - 1) : 0;
  let x = X_LEFT;
  groups.forEach((gr, i) => {
    N.push(group(gr.title.split(' ')[0], SNIP.meterGroup({ x0: x, x1: x + widths[i], title: gr.title, mw: gr.mw, items: gr.items }), `----- ${gr.title.split(' ')[0]} -----`));
    x += widths[i] + gap;
  });
  const k = Math.min(panel.w / 3840, panel.h / 2160), ox = (panel.w - 3840 * k) / 2, oy = (panel.h - 2160 * k) / 2;
  return scaleDocContent(doc, k, ox, oy);
}

const THEMES = {
  blank: { label: 'Blank panel', make: (panel) => newDoc({ name: 'My panel', w: panel.w, h: panel.h }) },
  modern: { label: 'Modern Split', make: themeModern },
  classic: { label: 'Classic OLED', make: themeClassic },
};
