/* ================================================================ theme: Modern Split (port of the builder's build())
   Laid out on 3840 x 2160 like the builder, then scaled and centred for other panel sizes.
   opts mirror the builder's settings; hardware (cores, GPU, disks, fans, NIC, DIMMs) comes from the hw profile. */
const MODERN_DEFAULTS = {
  hmode: 'media', title: '', netLabel: '', cpuW: 200, gpuW: 450, tdpMax: 150, cpuColor: '#3dd9c5', gpuColor: '#a08cff', warm: 75, hot: 88,
  extras: { thr: true, limit: true, vramTemp: true, vramClk: true, memHist: true, dimm: true, hpwr: true, coolant: true, board: true, refresh: true, netx: true },
};
const MODERN_EXTRAS = [['thr', 'CPU throttling'], ['limit', 'GPU limit reason'], ['vramTemp', 'VRAM temperature'], ['vramClk', 'VRAM clock'], ['memHist', 'RAM and VRAM history'],
                       ['dimm', 'Memory stick temperatures'], ['hpwr', '12VHPWR power and voltage'], ['coolant', 'Coolant temperature'], ['board', 'Board, VRM and chipset temperatures'],
                       ['refresh', 'Refresh rate'], ['netx', 'Network totals and link speed']];
const CPU_TCAP = { TCPUPKG: 'PACKAGE  °C', TCPUDIO: 'DIODE  °C', TCPU: 'CPU  °C', TCPUTCTL: 'TCTL  °C' };

function modernOpts(o = {}, hw) {
  const d = MODERN_DEFAULTS, r = { ...d, ...o };
  r.extras = Object.fromEntries(Object.keys(d.extras).map(k => [k, typeof o.extras?.[k] === 'boolean' ? o.extras[k] : k === 'memHist' ? true : hw?.extras?.[k] ?? d.extras[k]]));
  r.hmode = ['media', 'title', 'reg', 'none'].includes(r.hmode) ? r.hmode : 'media';
  r.title = sStr(r.title, 24); r.netLabel = sStr(r.netLabel, 16);
  r.cpuW = sNum(r.cpuW, 50, 600, 200); r.gpuW = sNum(r.gpuW, 50, 1000, 450); r.tdpMax = sNum(r.tdpMax, 100, 200, 150);
  r.warm = sNum(r.warm, 40, 110, 75); r.hot = sNum(r.hot, 40, 115, 88);
  if (!/^#[0-9a-f]{6}$/i.test(r.cpuColor)) r.cpuColor = d.cpuColor; if (!/^#[0-9a-f]{6}$/i.test(r.gpuColor)) r.gpuColor = d.gpuColor;
  return r;
}
const named = (w, name) => (w.name = name, w);
const group = (name, children, div) => ({ id: nid('g'), type: 'group', name, div: div || `===== ${name} =====`, children });

function themeModern(panel, hw, opts) {
  hw = hw || hwClone(HW_DEFAULTS);
  const o = modernOpts(opts, hw), ex = o.extras, g = hw.gpu || 1;
  const doc = newDoc({ name: 'Modern Split', w: panel.w, h: panel.h, tokens: { ...TOKENS_MODERN, cpu: o.cpuColor, gpu: o.gpuColor } });
  doc.warm = o.warm; doc.hot = o.hot; doc.gen = { theme: 'modern', hw: JSON.parse(JSON.stringify(hw)), opts: o };
  const LX0 = 96, LX1 = 1856, RX0 = 1984, RX1 = 3744, N = doc.nodes;
  /* structure lines */
  N.push(named(WF.vline(1920, 96, 2064), 'Centre line'));
  for (const [a, b, y] of [[LX0, LX1, 186], [RX0, RX1, 186], [LX0, LX1, 1150], [LX0, LX1, 1570], [RX0, RX1, 1250], [RX0, RX1, 1590], [RX0, RX1, 1920]]) N.push(named(WF.hline(a, b, y), 'Line'));
  /* left half */
  N.push(group('SUMMARY: header', SNIP.header({ mode: o.hmode, title: o.title })));
  const gt = hw.gpuTemp || `TGPU${g}DIO`, kind = gt.match(/^TGPU\d+(DIO|HOT|MEM)?$/)?.[1] || '';
  const chip = { DIO: ['CORE', `TGPU${g}DIO`, ' °C'], HOT: ['HOTSPOT', `TGPU${g}HOT`, ' °C'], MEM: ['VRAM', `TGPU${g}MEM`, ' °C'] };
  const gpuChips = kind === 'MEM' ? [chip.DIO, chip.HOT] : kind === 'HOT' ? [chip.DIO] : [chip.HOT];
  if (ex.vramTemp && kind !== 'MEM') gpuChips.push(chip.MEM);
  N.push(group('SUMMARY: CPU ring', SNIP.ringTile({ cx: 536, title: 'CPU', accent: '@cpu', load: 'SCPUUTI', temp: hw.cpuTemp || 'TCPUPKG', tcap: CPU_TCAP[hw.cpuTemp] || 'CPU  °C',
    chips: [['CLOCK', 'SCPUCLK', ' MHz'], ['POWER', 'PCPUPKG', ' W'], ['VCORE', 'VCPU', ' V']], extra: ex.thr ? ['THROTTLING', 'SCPUTHR', ' %'] : null })));
  N.push(group('SUMMARY: GPU ring', SNIP.ringTile({ cx: 1416, title: 'GPU', accent: '@gpu', load: `SGPU${g}UTI`, temp: gt,
    tcap: { DIO: 'CORE  °C', HOT: 'HOTSPOT  °C', MEM: 'MEMORY  °C' }[kind] || 'GPU  °C',
    chips: [['CLOCK', `SGPU${g}CLK`, ' MHz'], ['POWER', `PGPU${g}`, ' W'], ...gpuChips], extra: ex.limit ? ['LIMIT', `SGPU${g}PERFCAP`, ''] : null })));
  N.push(group('SUMMARY: FPS + load history', SNIP.fpsLoad({ refresh: ex.refresh, gpu: g })));
  const TW = (LX1 - LX0 - 2 * 48) / 3, x1m = LX0 + TW;
  const slots = (hw.dimms || []).filter((v, j, a) => v > 0 && a.indexOf(v) === j).slice(0, 2);
  N.push(group('SUMMARY: MEMORY', SNIP.memTile({ x0: LX0, tw: TW, title: 'MEMORY', sub: 'SYSTEM RAM', pct: 'SMEMUTI', used: 'SUSEDMEM', free: 'SFREEMEM', hist: ex.memHist, accent: '@cpu',
    side: ex.dimm && slots.length ? { caption: 'DIMM  °C', values: slots.map((n, j) => ({ sensor: `TDIMMTS${n}`, x: x1m - 96 * (slots.length - 1 - j), unit: '°' })) } : null })));
  const xv = LX0 + TW + 48;
  N.push(group('SUMMARY: VRAM', SNIP.memTile({ x0: xv, tw: TW, title: 'VRAM', sub: 'GPU MEMORY', pct: 'SVMEMUSAGE', used: 'SUSEDVMEM', free: 'SFREEVMEM', hist: ex.memHist, accent: '@gpu',
    side: ex.vramClk ? { caption: 'MEM CLOCK', values: [{ sensor: `SGPU${g}MEMCLK`, x: xv + TW, unit: ' MHz' }] } : null })));
  if (hw.nic) N.push(group('SUMMARY: network', SNIP.netTile({ x0: LX0 + 2 * (TW + 48), tw: TW, nic: hw.nic, label: o.netLabel || `NIC${hw.nic}`, totals: ex.netx })));
  /* right half */
  const ct = WF.make('coreTable', { pCores: hw.pCores, eCores: hw.eCores, smt: hw.smt !== false, accent: '@cpu' }, RX0, 100, 0, 0);
  N.push(fitBox(ct));
  const rows = [{ label: 'CPU PACKAGE', sensor: 'PCPUPKG', max: o.cpuW, unit: ' W', color: '@cpu' }, { label: 'CPU CORES', sensor: 'PCPUIAC', max: o.cpuW, unit: ' W', color: '@cpu' },
                { label: 'GPU', sensor: `PGPU${g}`, max: o.gpuW, unit: ' W', color: '@gpu' }, { label: 'GPU TDP', sensor: `PGPU${g}TDPP`, max: o.tdpMax, unit: ' %', color: '@gpu' }]
    .map(r => ({ ...r, sensor2: '', unit2: ' V' }));
  if (ex.hpwr) rows.push({ label: '12VHPWR', sensor: `PGPU${g}12VHPWR`, max: 600, unit: ' W', color: '@gpu', sensor2: `VGPU${g}12VHPWR`, unit2: ' V' });
  N.push(fitBox(WF.make('powerTable', { rows }, RX0, 1270, 0, 0)));
  if (hw.disks?.length) N.push(fitBox(WF.make('storageTable', { rows: hw.disks.map(d => ({ name: d.name || `DISK ${d.num}`, num: d.num || 0, letter: d.letter || '' })) }, RX0, 1610, 0, 0)));
  const cells = (hw.fans || []).map(f => ({ label: (f.label || f.id).toUpperCase(), sensor: f.id, min: 0, max: f.max || 3000, unit: '', warn: 0 }));
  if (ex.coolant) cells.unshift({ label: 'COOLANT', sensor: 'TWATER', min: 20, max: 50, unit: '°', warn: .67 });
  if (cells.length || ex.board) N.push(fitBox(WF.make('fanRow', { cells, board: ex.board, sub: ex.coolant ? 'RPM  ·  °C' : 'RPM' }, RX0, 1936, 0, 0)));
  /* other panel sizes: scale the 4K layout and centre it, like the builder */
  const k = Math.min(panel.w / 3840, panel.h / 2160), ox = (panel.w - 3840 * k) / 2, oy = (panel.h - 2160 * k) / 2;
  return scaleDocContent(doc, k, ox, oy);
}
function fitBox(w) { const m = WT[w.type].measure(w.p, null, w); w.w = m.w; w.h = m.h; return w; }
