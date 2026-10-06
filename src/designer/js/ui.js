/* ================================================================ ui: palette, your PC, layers, inspector, dialogs, status
   Text that comes from files (names, labels) is only ever set with textContent. */
function h(tag, a = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(a || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v; else if (k === 'checked') el.checked = !!v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const ICONS = {
  text: 'M5 6h14M12 6v13', value: 'M4 17l4-10 4 10M5.5 13h5M15 7h3a2 2 0 010 4h-3v6', rect: 'M4 7h16v10H4z', line: 'M3 12h18', image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4',
  bar: 'M3 9h3v6H3zM8 9h3v6H8zM13 9h3v6h-3zM18 9h3v6h-3z', ring: 'M6 18a8 8 0 1112 0', dial: 'M5 17a8 8 0 1114 0M12 13l4-5', meter: 'M3 15h18M6 15v-3M12 15v-3M18 15v-3M11 6l1 4 1-4z',
  graph: 'M3 17l5-6 4 3 4-7 5 5', table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14', tile: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', section: 'M4 6v12M8 9h12M8 15h8',
  readout: 'M4 8h7M4 16h16M15 8h5', clock: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 8v4l3 2',
};
const GLYPHS = { eye: 'M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
                 eyeOff: 'M3 3l18 18M10.6 6.1A10 10 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.2 3.7M6.6 6.6C3.9 8.3 2 12 2 12s4 6 10 6a9.6 9.6 0 004.4-1',
                 lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3', unlock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 016.6-1.5' };
const glyph = n => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.setAttribute('width', '14'); s.setAttribute('height', '14'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', GLYPHS[n]); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); s.append(p); return s; };
const icon = n => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONS[n] || ICONS.tile); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); s.append(p); return s; };
const fmtBytes = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';

/* ---------------------------------------------------------------- palette entries (hardware-aware) */
function paletteEntries() {
  const hw = APP.hw, m = (t, p, x, y, w, ht) => fitIf(WF.make(t, p, x, y, w, ht));
  const fitIf = w => { const d = WT[w.type]; if (d.measure && d.resize !== 'free') { const s = d.measure(w.p, APP.env, w); w.w = s.w; w.h = s.h; } return w; };
  return [
    { cat: 'Text & shapes', label: 'Text', icon: 'text', make: () => [WF.text(0, 30, 'LABEL', 28, 'bold', '@title', .14)] },
    { cat: 'Text & shapes', label: 'Section title', icon: 'section', name: 'Section', make: () => WF.section(0, 30, 'SECTION', 'SUBTITLE') },
    { cat: 'Text & shapes', label: 'Line', icon: 'line', make: () => [WF.hline(0, 800, 1)] },
    { cat: 'Text & shapes', label: 'Rectangle', icon: 'rect', make: () => [WF.make('rect', { fill: '@hair', outline: true, lineW: 2, radius: 12 }, 0, 0, 480, 240)] },
    { cat: 'Text & shapes', label: 'Image', icon: 'image', image: true },
    { cat: 'Readings', label: 'Value', icon: 'value', make: () => [WF.value('SCPUUTI', 0, 40, 32, { unit: ' %' })] },
    { cat: 'Readings', label: 'Readout', icon: 'readout', make: () => [m('readout', { sensor: 'SCPUUTI', caption: 'CPU LOAD', unit: ' %', extra: 'bar', accent: '@cpu' }, 0, 0, 420, 0)] },
    { cat: 'Readings', label: 'Big centred value', icon: 'value', make: () => [WF.center(hw.cpuTemp || 'TCPUPKG', 0, 0, 96)] },
    { cat: 'Readings', label: 'Clock', icon: 'clock', name: 'Clock', make: () => PRESETS.find(p => p.id === 'clock').make() },
    { cat: 'Gauges', label: 'Segmented bar', icon: 'bar', make: () => [WF.bar('SCPUUTI', 0, 100, 0, 0, 440, 18, { color: '@cpu' })] },
    { cat: 'Gauges', label: 'Segmented ring', icon: 'ring', make: () => [WF.ring('SCPUUTI', 0, 100, 0, 0, 200, 222, { color: '@cpu' })] },
    { cat: 'Gauges', label: 'Needle dial', icon: 'dial', make: () => [m('dial', { style: 'small', r: 240, sensor: hw.cpuTemp || 'TCPUPKG', lo: 20, hi: 100, major: 20, mid: 10, minor: 5, red: true, redFrom: 90, redTo: 100 }, 0, 0, 480, 480)], tokens: TOKENS_CLASSIC },
    { cat: 'Gauges', label: 'Linear meter', icon: 'meter', make: () => [m('meter', { sensor: 'SDRVCUTI', scale: 'pct', mw: 300 }, 0, 0, 342, 100)], tokens: TOKENS_CLASSIC },
    { cat: 'Graphs', label: 'Graph', icon: 'graph', make: () => [WF.graph('SCPUUTI', 0, 0, 600, 160, 0, 100, '@cpu')] },
    { cat: 'Tables', label: 'CPU core table', icon: 'table', make: () => [m('coreTable', tableDefaults('coreTable', hw), 0, 0, 0, 0)] },
    { cat: 'Tables', label: 'Power rows', icon: 'table', make: () => [m('powerTable', tableDefaults('powerTable', hw), 0, 0, 0, 0)] },
    { cat: 'Tables', label: 'Storage rows', icon: 'table', make: () => [m('storageTable', tableDefaults('storageTable', hw), 0, 0, 0, 0)] },
    { cat: 'Tables', label: 'Cooling row', icon: 'table', make: () => [m('fanRow', tableDefaults('fanRow', hw), 0, 0, 0, 0)] },
    ...PRESETS.filter(p => p.cat === 'Tiles').map(p => ({ cat: 'Tiles', label: p.label, icon: /dial/i.test(p.id) ? 'dial' : /ring/i.test(p.id) ? 'ring' : p.id === 'meters' ? 'meter' : 'tile', name: p.label,
      make: () => p.make({ hw }), tokens: /dial|meters/.test(p.id) ? TOKENS_CLASSIC : null })),
  ];
}
/* add a palette entry's widgets at a panel point (and the colour tokens it needs, if the design lacks them) */
function addEntry(entry, x, y) {
  if (entry.image) return pickImage(x, y);
  if (entry.tokens && Object.keys(entry.tokens).some(k => !APP.doc.tokens[k])) edit(doc => { for (const [k, v] of Object.entries(entry.tokens)) doc.tokens[k] ||= v; });
  const ws = entry.make();
  insertWidgets(ws, x, y, entry.name || entry.label);
}
function viewCentre() { const r = STAGE.wrap.getBoundingClientRect(); return toPanel(r.width / 2, Math.min(r.height / 2, r.height - 40)); }
async function pickImage(x, y) {
  const inp = $('file-image');
  inp.onchange = async () => {
    const f = inp.files[0]; inp.value = ''; if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer()), id = await addAsset(bytes, f.type || mimeOf(bytes), f.name.replace(/[<>|\\/:*?"]/g, '_'));
    const a = ASSETS.get(id); if (!a?.bitmap) return UI.toast('That image can’t be read.');
    const s = Math.min(1, 1200 / Math.max(a.w, a.h));
    const [cx, cy] = x === undefined ? viewCentre() : [x, y];
    insertWidgets([WF.make('image', { asset: id, name: a.name }, 0, 0, Math.round(a.w * s), Math.round(a.h * s))], cx, cy, 'Image');
  };
  inp.click();
}

/* pointer drag from a list item onto the stage; a click without moving adds at the view centre */
function dragSource(el, label, onDrop) {
  on(el, 'pointerdown', e => {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY; let ghost = null;
    const move = ev => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      if (!ghost) { ghost = h('div', { class: 'ghost-drag', text: label }); document.body.append(ghost); document.body.classList.add('dragging'); }
      ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
    };
    const up = ev => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      document.body.classList.remove('dragging');
      if (ghost) {
        ghost.remove();
        const r = STAGE.wrap.getBoundingClientRect();
        if (ev.type === 'pointerup' && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) onDrop(...toPanel(ev.clientX - r.left, ev.clientY - r.top));
      } else if (ev.type === 'pointerup') onDrop(...viewCentre());
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
  on(el, 'keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDrop(...viewCentre()); } });
}

function buildPalette() {
  const pane = $('pane-add'); pane.replaceChildren();
  pane.append(h('p', { class: 'hint' }, 'Drag a component onto the panel, or click to add it in the middle. ', h('b', {}, 'Your PC'), ' lists your own sensors.'));
  const cats = {};
  for (const e of paletteEntries()) (cats[e.cat] ||= []).push(e);
  for (const [cat, list] of Object.entries(cats)) {
    const grid = h('div', { class: 'pal' });
    for (const e of list) { const b = h('button', { type: 'button', title: e.label }, icon(e.icon), h('span', { text: e.label })); dragSource(b, e.label, (x, y) => addEntry(e, x, y)); grid.append(b); }
    pane.append(h('section', {}, h('h2', { text: cat }), grid));
  }
}

/* ---------------------------------------------------------------- Your PC */
const CMD_QUERY = 'cmd /c reg query HKCU\\Software\\FinalWire\\AIDA64\\SensorValues | clip';
const CMD_EXPORT = 'cmd /c reg export HKCU\\Software\\FinalWire\\AIDA64\\SensorValues "%USERPROFILE%\\Desktop\\aida64-sensors.reg" /y';
const CMD_SHM = "$m=[IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting('AIDA64_SensorValues','Read');$a=$m.CreateViewAccessor(0,0,'Read');$b=New-Object byte[] $a.Capacity;[void]$a.ReadArray(0,$b,0,$b.Length);$n=[Array]::IndexOf($b,[byte]0);if($n -lt 0){$n=$b.Length};[Text.Encoding]::Default.GetString($b,0,$n)|Set-Clipboard";
function cmdBox(cmd) {
  const b = h('button', { type: 'button', class: 'btn', text: 'Copy' });
  on(b, 'click', async () => { try { await navigator.clipboard.writeText(cmd); b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1500); } catch (e) { UI.toast('Select the command and copy it with Ctrl+C.'); } });
  return h('div', { class: 'cmd' }, h('code', { text: cmd }), b);
}
const COMPONENTS = [
  ['CPU', id => /^(SCPU|SCC-|TCPU|TCC-|TCCD|VCPU|PCPU|CCPU|DCPU|FCPU|SCPUCLK|SCPUMUL|SCPUFSB)/.test(id)],
  ['GPU', id => /GPU\d/.test(id) || /^SVMEM|^S(USED|FREE)(L|NL)?VMEM/.test(id)],
  ['Memory', id => /^(SMEM|SUSEDMEM|SFREEMEM|TDIMM|VDIMM|PDIMM|CDIMM)/.test(id)],
  ['Drives', id => /^(SDRV|SDSK|THDD|SSMASTA)/.test(id)],
  ['Network', id => /^SNIC|IPADDR$/.test(id)],
  ['Cooling', id => /^(F|D|TWATER|WFLOW|LLIQ)/.test(id)],
  ['Board and power', id => /^[TVCP]/.test(id)],
  ['System', () => true],
];
function componentOf(id) { return COMPONENTS.find(([, f]) => f(id))[0]; }
function readoutFor(id) {
  const f = SP.catalog.family(id), lab = (APP.pc?.sensors.get(id)?.label || SP.catalog.label(id)).toUpperCase().slice(0, 24);
  const unit = f.kind === 'num' && f.unit ? (f.unit === '°C' ? ' °C' : ' ' + f.unit) : '';
  const w = WF.make('readout', { sensor: id, caption: lab, unit, extra: f.kind === 'num' && f.unit === '%' ? 'bar' : 'none', lo: f.lo, hi: f.hi, accent: '@neu' }, 0, 0, 420, 0);
  w.h = WT.readout.measure(w.p, APP.env, w).h; return w;
}
function quickAdds(comp) {
  const hw = APP.hw, find = id => PRESETS.find(p => p.id === id);
  const ent = (label, make, tokens) => ({ label, make, name: label, tokens });
  if (comp === 'CPU') return [ent('CPU ring tile', () => find('ringCpu').make({ hw })), ent('Core table', () => paletteEntries().find(e => e.label === 'CPU core table').make())];
  if (comp === 'GPU') return [ent('GPU ring tile', () => find('ringGpu').make({ hw }))];
  if (comp === 'Memory') return [ent('Memory tile', () => find('mem').make({ hw }))];
  if (comp === 'Drives') return [ent('Storage rows', () => paletteEntries().find(e => e.label === 'Storage rows').make())];
  if (comp === 'Network' && hw.nic) return [ent('Network tile', () => find('net').make({ hw }))];
  if (comp === 'Cooling') return [ent('Cooling row', () => paletteEntries().find(e => e.label === 'Cooling row').make())];
  return [];
}
let pcQuery = '';
function buildPc() {
  const pane = $('pane-pc'); pane.replaceChildren();
  const list = APP.pc;
  if (!list) {
    pane.append(h('section', {}, h('h2', { text: 'Use your PC’s sensors' }),
      h('p', { class: 'hint', text: 'Without a list the designer offers every AIDA64 sensor, with example readings. Load your PC’s list to see the sensors it really has, with their values, and to set up themes for your hardware. The list stays in this browser; nothing is uploaded.' })));
    pane.append(h('section', {}, h('h2', { text: 'From the registry (recommended)' }),
      h('ol', { class: 'steps' },
        h('li', {}, 'Start AIDA64 and keep it running.'),
        h('li', {}, 'Open ', h('b', {}, '⋮ (or File) › Preferences › Hardware Monitoring › External Applications'), '. Tick ', h('b', {}, 'Enable writing sensor values to Registry'),
          ', click ', h('b', {}, 'Select All'), ' (clocks, loads, drives and network are off by default) and press OK.'),
        h('li', {}, 'Press Win+R, paste this command and press Enter. It copies the list.', cmdBox(CMD_QUERY)),
        h('li', {}, 'Come back here and press ', h('b', {}, 'Ctrl+V'), '.'))));
    pane.append(h('details', { class: 'sec' }, h('summary', { text: 'Or save it as a file' }),
      h('div', {}, h('p', { class: 'hint', text: 'Same AIDA64 setting, then run this. It saves aida64-sensors.reg on your desktop; drop it on this page.' }), cmdBox(CMD_EXPORT))));
    pane.append(h('details', { class: 'sec' }, h('summary', { text: 'Or use PowerShell (shared memory)' }),
      h('div', {}, h('p', { class: 'hint' }, 'In External Applications tick ', h('b', {}, 'Enable shared memory'), ' and click Select All. Paste this into Windows PowerShell, press Enter, then Ctrl+V here. If it says access is denied, use the registry steps.'), cmdBox(CMD_SHM))));
    const ta = h('textarea', { placeholder: 'Or paste the copied text here', 'aria-label': 'Sensor list text' });
    const use = h('button', { type: 'button', class: 'btn', text: 'Use pasted text' }), file = h('button', { type: 'button', class: 'btn ghost', text: 'Choose a .reg file…' });
    on(use, 'click', () => loadSensorText(ta.value));
    on(file, 'click', () => openPicker('.reg,.txt'));
    pane.append(h('section', {}, ta, h('div', { class: 'acts', style: 'margin-top:6px' }, use, file)), h('div', { class: 'drop', text: 'Drop a .reg file anywhere on this page' }));
    return;
  }
  const hw = APP.hw, when = new Date(list.at).toLocaleString();
  pane.append(h('section', {}, h('h2', { text: 'Your PC' }), h('p', { class: 'hint', text: `${list.sensors.size} sensors from the ${list.source}, ${when}. Stored only in this browser.` })));
  for (const w of list.warnings || []) pane.append(h('p', { class: 'note warn', text: w }));
  const cpu = hw.eCores ? `${hw.pCores} P + ${hw.eCores} E cores, ${hw.threads} threads` : `${hw.pCores} cores${hw.smt ? `, ${hw.threads || hw.pCores * 2} threads` : ''}`;
  pane.append(h('dl', { class: 'hw' },
    h('dt', { text: 'CPU' }), h('dd', { text: `${cpu} · ${SP.catalog.label(hw.cpuTemp)}` }),
    h('dt', { text: 'GPU' }), h('dd', { text: hw.gpus?.length ? `GPU${hw.gpu} · ${SP.catalog.label(hw.gpuTemp)}` : 'none found' }),
    h('dt', { text: 'Drives' }), h('dd', { text: hw.disks?.length ? hw.disks.map(d => `${d.letter ? d.letter + ':' : ''}${d.num ? ` disk ${d.num}` : ''}`).join(', ') : 'none found' }),
    h('dt', { text: 'Network' }), h('dd', { text: hw.nic ? `NIC${hw.nic}` : 'none found' }),
    h('dt', { text: 'Memory' }), h('dd', { text: hw.dimms?.length ? `DIMM slots ${hw.dimms.join(', ')}` : 'no stick temperatures' }),
    h('dt', { text: 'Fans' }), h('dd', { text: hw.fans?.length ? hw.fans.map(f => f.label).join(', ') : 'none spinning' })));
  for (const n of APP.hwNotes) pane.append(h('p', { class: 'hint', text: n }));
  const forget = h('button', { type: 'button', class: 'btn ghost', text: 'Forget this list' }), again = h('button', { type: 'button', class: 'btn ghost', text: 'Load another…' });
  on(forget, 'click', () => setPcList(null)); on(again, 'click', () => openPicker('.reg,.txt'));
  pane.append(h('div', { class: 'acts' }, again, forget));
  const q = h('input', { type: 'search', class: 'search', placeholder: 'Search your sensors', value: pcQuery, 'aria-label': 'Search your sensors' });
  const box = h('div', { style: 'display:grid;gap:8px' });
  const render = () => {
    box.replaceChildren(); const term = pcQuery.toLowerCase(), groups = {};
    for (const [id, s] of list.sensors) { if (term && !(id + ' ' + s.label).toLowerCase().includes(term)) continue; (groups[componentOf(id)] ||= []).push([id, s]); }
    for (const [comp] of COMPONENTS) {
      const rows = groups[comp]; if (!rows) continue;
      const d = h('details', { class: 'comp', ...(term || ['CPU', 'GPU'].includes(comp) ? { open: true } : {}) }, h('summary', {}, h('span', { text: comp }), h('span', { class: 'n', text: rows.length })));
      const qa = quickAdds(comp);
      if (qa.length && !term) { const wrap = h('div', { class: 'quick' }); for (const e of qa) { const b = h('button', { type: 'button', text: '+ ' + e.label }); dragSource(b, e.label, (x, y) => addEntry(e, x, y)); wrap.append(b); } d.append(wrap); }
      const ul = h('ul', { class: 'sens' });
      for (const [id, s] of rows.slice(0, 400)) {
        const li = h('li', { tabindex: '0', title: 'Drag onto the panel, or click to add' }, h('span', { text: s.label }), h('span', { class: 'v', text: s.value + (s.num !== null ? ' ' + SP.catalog.family(id).unit : '') }), h('span', { class: 'id', text: id }));
        dragSource(li, s.label, (x, y) => insertWidgets([readoutFor(id)], x, y));
        ul.append(li);
      }
      d.append(ul); box.append(d);
    }
    if (!box.childNodes.length) box.append(h('p', { class: 'hint', text: 'Nothing matches.' }));
  };
  on(q, 'input', () => { pcQuery = q.value; render(); });
  pane.append(q, box); render();
}
async function loadSensorText(text) {
  try { setPcList(parseSensorList(text)); UI.toast('Sensor list loaded.'); }
  catch (e) { UI.toast(e.message); }
}
function setPcList(list) {
  APP.pc = list; const r = inferHw(list); APP.hw = r.hw; APP.hwNotes = r.notes;
  SIM.setPc(list);
  $('scen').querySelector('[data-sc="pc"]').hidden = !list;
  if (list) setScenario('pc'); else if (SIM.scenario() === 'pc') setScenario('load');
  savePcList(list); OPS.clear(); changed(); buildPalette(); buildPc();
}
function setScenario(sc) {
  SIM.setScenario(sc);
  document.querySelectorAll('#scen button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sc === SIM.scenario())));
  requestDraw();
}

/* ---------------------------------------------------------------- layers */
function buildLayers() {
  const pane = $('pane-layers'); pane.replaceChildren();
  if (!APP.doc.nodes.length) { pane.append(h('p', { class: 'hint', text: 'Nothing on the panel yet.' })); return; }
  pane.append(h('p', { class: 'hint', text: 'Top of the list is drawn last (on top). Drag to reorder, double-click to rename.' }));
  const ul = h('ul', { class: 'layers' });
  const row = (n, child, parent) => {
    const miss = isGroup(n) ? n.children.some(c => missingSensors(c).length) : missingSensors(n).length > 0;
    const vis = h('button', { type: 'button', class: n.hidden ? 'off' : '', 'aria-label': n.hidden ? 'Show' : 'Hide', title: n.hidden ? 'Show' : 'Hide' }, glyph(n.hidden ? 'eyeOff' : 'eye'));
    const lock = h('button', { type: 'button', class: n.locked ? 'on' : 'off', 'aria-label': n.locked ? 'Unlock' : 'Lock', title: n.locked ? 'Unlock' : 'Lock' }, glyph(n.locked ? 'lock' : 'unlock'));
    const nm = h('span', { class: 'nm' }, h('span', { text: n.name || (isGroup(n) ? 'Group' : WT[n.type]?.label || n.type) }), miss ? h('span', { class: 'badge', text: 'not on PC', title: 'Uses a sensor your PC doesn’t report' }) : null);
    const li = h('li', { class: (child ? 'child ' : '') + (APP.sel.has(n.id) ? 'sel' : ''), draggable: 'true', 'data-id': n.id }, vis, lock, nm, h('span', { class: 'ty', text: isGroup(n) ? `${n.children.length}` : '' }));
    on(vis, 'click', e => { e.stopPropagation(); edit(() => { n.hidden = !n.hidden; }); });
    on(lock, 'click', e => { e.stopPropagation(); edit(() => { n.locked = !n.locked; }); });
    on(li, 'click', e => { APP.scope = parent ? parent.id : null; select([n.id], e.shiftKey || e.ctrlKey); });
    on(nm, 'dblclick', () => {
      const inp = h('input', { class: 'fld', value: n.name || '' }); nm.replaceChildren(inp); inp.focus(); inp.select();
      const done = () => { const v = sStr(inp.value, 60); edit(() => { if (v) n.name = v; else delete n.name; }); };
      on(inp, 'keydown', e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = n.name || ''; inp.blur(); } }); on(inp, 'blur', done, { once: true });
    });
    on(li, 'dragstart', e => { e.dataTransfer.setData('text/x-node', n.id); e.dataTransfer.effectAllowed = 'move'; });
    on(li, 'dragover', e => { if ([...e.dataTransfer.types].includes('text/x-node')) { e.preventDefault(); li.classList.add('drop-before'); } });
    on(li, 'dragleave', () => li.classList.remove('drop-before'));
    on(li, 'drop', e => { e.preventDefault(); li.classList.remove('drop-before'); moveNodeBefore(e.dataTransfer.getData('text/x-node'), n.id); });
    ul.append(li);
    if (isGroup(n) && (APP.scope === n.id || [...APP.sel].some(id => n.children.some(c => c.id === id)))) [...n.children].reverse().forEach(c => row(c, true, n));
  };
  [...APP.doc.nodes].reverse().forEach(n => row(n, false, null));
  pane.append(ul);
}
/* layers list shows the top first, so "drop before" in the list means "draw after" */
function moveNodeBefore(id, targetId) {
  if (!id || id === targetId) return;
  edit(doc => {
    const a = findNode(doc, id), b = findNode(doc, targetId); if (!a || !b || isGroup(a.node) && b.parent) return;
    a.list.splice(a.list.indexOf(a.node), 1);
    const L = b.parent ? b.parent.children : doc.nodes; L.splice(L.indexOf(b.node) + 1, 0, a.node);
    doc.nodes = doc.nodes.filter(n => !isGroup(n) || n.children.length);
  });
}

/* ---------------------------------------------------------------- inspector */
let sensorDl = null;
function sensorDatalist() {
  if (!sensorDl) { sensorDl = h('datalist', { id: 'sensor-dl' }); document.body.append(sensorDl); }
  const key = APP.pc ? 'pc' + APP.pc.at : 'cat';
  if (sensorDl.dataset.key === key) return;
  sensorDl.dataset.key = key; sensorDl.replaceChildren();
  const rows = APP.pc ? [...APP.pc.sensors].map(([id, s]) => [id, `${s.label} · ${s.value}`]) : SP.catalog.list().map(r => [r.id, r.label]);
  for (const [id, l] of rows) sensorDl.append(h('option', { value: id, label: l }));
}
function colorControl(v, set) {
  const toks = Object.keys(APP.doc.tokens), sel = h('select', { class: 'fld', 'aria-label': 'Colour' });
  for (const t of toks) sel.append(h('option', { value: '@' + t, text: TOKEN_NAMES[t] || t }));
  sel.append(h('option', { value: 'custom', text: 'Custom colour' }));
  const hex = v?.[0] === '@' ? APP.doc.tokens[v.slice(1)] || '#ffffff' : v || '#ffffff';
  sel.value = v?.[0] === '@' && toks.includes(v.slice(1)) ? v : 'custom';
  const pick = h('input', { type: 'color', value: hex, 'aria-label': 'Custom colour' });
  on(sel, 'change', () => { if (sel.value !== 'custom') set(sel.value); else set(pick.value); });
  on(pick, 'change', () => set(pick.value.toLowerCase()));
  return h('div', { class: 'colorf' }, sel, pick);
}
function control(f, v, set, key) {
  const id = 'f-' + key.replace(/[^a-z0-9]/gi, '-');
  let el;
  switch (f.t) {
    case 'bool': el = h('input', { type: 'checkbox', id, checked: v }); on(el, 'change', () => set(el.checked)); break;
    case 'num': case 'int': case 'pct':
      el = h('input', { type: 'number', id, value: f.t === 'pct' ? Math.round(v * 100) : +(+v).toFixed(3), step: f.step || (f.t === 'num' ? 'any' : 1), ...(f.min !== undefined ? { min: f.t === 'pct' ? 0 : f.min } : {}), ...(f.max !== undefined ? { max: f.t === 'pct' ? 100 : f.max } : {}) });
      on(el, 'input', () => { if (el.value === '' || !Number.isFinite(+el.value)) return; set(f.t === 'pct' ? +el.value / 100 : f.t === 'int' ? Math.round(+el.value) : +el.value); }); break;
    case 'select': el = h('select', { id }); for (const [k, l] of f.opts) el.append(h('option', { value: k, text: l })); el.value = v; on(el, 'change', () => set(el.value)); break;
    case 'color': el = colorControl(v, set); el.id = id; break;
    case 'font': {
      const fonts = f.live ? LIVE_FONTS : STATIC_FONT_NAMES.map(x => x[0]);
      el = h('input', { type: 'text', id, value: v, list: 'font-dl-' + (f.live ? 'live' : 'st') });
      if (!document.getElementById('font-dl-live')) document.body.append(h('datalist', { id: 'font-dl-live' }, ...LIVE_FONTS.map(n => h('option', { value: n }))));
      on(el, 'change', () => set(sStr(el.value, 40) || fonts[0])); break;
    }
    case 'sensor': {
      sensorDatalist();
      el = h('input', { type: 'text', id, value: v, list: 'sensor-dl', spellcheck: 'false', autocomplete: 'off' });
      on(el, 'change', () => { const s = sSensor(el.value, null); if (s) set(s); else el.value = v; }); break;
    }
    case 'rows': return rowsControl(f, v, set, key);
    default: el = h('input', { type: 'text', id, value: v ?? '', maxlength: f.max || 200 }); on(el, 'input', () => set(el.value));
  }
  el.dataset.k = key;
  const wrap = h('div', { class: 'f' }, h('label', { for: id, text: f.label }), el);
  if (f.t === 'sensor' && v) {
    const st = sensorStatus(APP.pc, v), lab = APP.pc?.sensors.get(v)?.label || SP.catalog.label(v);
    wrap.append(h('p', { class: 'hint' + (st === 'no' ? ' miss' : '') }, st === 'no' ? `${lab} — your PC doesn’t report this sensor.` : st === 'sometimes' ? `${lab} — appears while it runs (RTSS, a media player…).` : lab));
  } else if (f.hint) wrap.append(h('p', { class: 'hint', text: f.hint }));
  return wrap;
}
function rowsControl(f, rows, set, key) {
  const box = h('div', { class: 'rows' }, h('div', { class: 'lab hint', text: f.label }));
  const upd = fn => { const r = JSON.parse(JSON.stringify(rows)); fn(r); set(r); };
  rows.forEach((r, i) => {
    const up = h('button', { type: 'button', text: '↑', 'aria-label': 'Move up' }), dn = h('button', { type: 'button', text: '↓', 'aria-label': 'Move down' }), rm = h('button', { type: 'button', text: 'Remove' });
    on(up, 'click', () => i && upd(a => a.splice(i - 1, 0, a.splice(i, 1)[0]))); on(dn, 'click', () => i < rows.length - 1 && upd(a => a.splice(i + 1, 0, a.splice(i, 1)[0]))); on(rm, 'click', () => upd(a => a.splice(i, 1)));
    const row = h('div', { class: 'row' }, h('div', { class: 'rh' }, h('span', { text: `${i + 1}`, style: 'margin-right:auto' }), up, dn, rm));
    for (const c of f.cols) {
      const k = `${key}.${i}.${c.k}`;
      const ctl = c.t === 'color' ? colorControl(r[c.k], v => upd(a => a[i][c.k] = v)) : (() => {
        const el = c.t === 'sensor' ? (sensorDatalist(), h('input', { type: 'text', value: r[c.k], list: 'sensor-dl', spellcheck: 'false' })) : h('input', { type: c.t === 'num' || c.t === 'int' ? 'number' : 'text', value: r[c.k] ?? '' });
        el.dataset.k = k;
        on(el, c.t === 'sensor' ? 'change' : 'input', () => { const v = c.t === 'num' || c.t === 'int' ? +el.value : c.t === 'sensor' ? sSensor(el.value, r[c.k]) : el.value; if (c.t !== 'text' || true) upd(a => a[i][c.k] = sanitizeField(c, v, c.d)); });
        return el;
      })();
      row.append(h('label', {}, c.label, ctl));
    }
    box.append(row);
  });
  if (rows.length < (f.maxRows || 32)) { const add = h('button', { type: 'button', class: 'btn ghost', text: '+ Add' }); on(add, 'click', () => upd(a => a.push(Object.fromEntries(f.cols.map(c => [c.k, a.length ? a[a.length - 1][c.k] : c.d]))))); box.append(add); }
  if (f.hint) box.append(h('p', { class: 'hint', text: f.hint }));
  return box;
}
function fieldsFor(def, p, setField, prefix) {
  const out = [];
  for (const f of def.fields) {
    if (f.section) {
      const vis = f.fields.filter(x => !x.show || x.show(p)); if (!vis.length) continue;
      out.push(h('details', { class: 'sec' }, h('summary', { text: f.section }), h('div', {}, ...vis.map(x => control(x, p[x.k], v => setField(x.k, v), prefix + x.k)))));
    } else if (!f.show || f.show(p)) out.push(control(f, p[f.k], v => setField(f.k, v), prefix + f.k));
  }
  return out;
}
function xywh(n, fixedSize) {
  const b = nodeBox(n), grp = isGroup(n);
  const box = h('div', { class: 'xywh' });
  const mk2 = (lab, i) => {
    const el = h('input', { type: 'number', value: Math.round(b[i] * 10) / 10, step: 1, 'data-k': 'box.' + lab, ...(i > 1 && (fixedSize || grp) ? { disabled: true } : {}) });
    on(el, 'input', () => { const v = +el.value; if (!Number.isFinite(v)) return;
      edit(doc => { const t = findNode(doc, n.id).node, cur = nodeBox(t);
        if (i < 2) (isGroup(t) ? t.children : [t]).forEach(w => i ? w.y += v - cur[1] : w.x += v - cur[0]);
        else { if (i === 2) t.w = Math.max(1, v); else t.h = Math.max(1, v); if (WT[t.type]?.onResize) WT[t.type].onResize(t.p, t); remeasure(t, APP.env); } }, 'box' + n.id + i); });
    return h('label', {}, lab, el);
  };
  box.append(mk2('X', 0), mk2('Y', 1), mk2('W', 2), mk2('H', 3));
  return box;
}
function sensorReplacer(ws) {
  const m = sensorsOf(ws); if (!m.size) return null;
  sensorDatalist();
  const box = h('div', { class: 'sensrep' }, h('h2', { text: 'Sensors used' }));
  for (const [id, n] of [...m].slice(0, 40)) {
    const inp = h('input', { class: 'fld', type: 'text', value: id, list: 'sensor-dl', 'aria-label': `Replace ${id}`, spellcheck: 'false' });
    on(inp, 'change', () => replaceSensor(ws, id, inp.value));
    const st = sensorStatus(APP.pc, id);
    box.append(h('div', { class: 'r' }, h('span', { class: st === 'no' ? 'miss' : '' }, h('code', { text: id }), ` ×${n}`), inp));
  }
  box.append(h('p', { class: 'hint', text: 'Type another sensor ID to switch every part that uses it.' }));
  return box;
}
function actButton(label, fn, title) { const b = h('button', { type: 'button', class: 'btn', text: label, title: title || label }); on(b, 'click', fn); return b; }
function buildInspector() {
  const pane = $('inspector');
  const focusKey = document.activeElement?.closest?.('#inspector') && document.activeElement.dataset.k;
  const caret = focusKey && document.activeElement.selectionStart;
  const openSecs = [...pane.querySelectorAll('details.sec[open] > summary')].map(s => s.textContent);
  pane.replaceChildren();
  const nodes = selNodes();
  if (!nodes.length) buildDocInspector(pane);
  else if (nodes.length > 1) {
    pane.append(h('h3', { text: `${nodes.length} items selected` }));
    pane.append(h('div', { class: 'acts' }, ...[['l', 'Left'], ['c', 'Centre'], ['r', 'Right'], ['t', 'Top'], ['m', 'Middle'], ['b', 'Bottom']].map(([k, l]) => actButton(l, () => align(k), `Align ${l.toLowerCase()}`))));
    if (nodes.length > 2) pane.append(h('div', { class: 'acts' }, actButton('Space across', () => align('dh')), actButton('Space down', () => align('dv'))));
    pane.append(h('div', { class: 'acts' }, actButton('Group', groupSel, 'Group (Ctrl+G)'), actButton('Duplicate', () => duplicateSel()), actButton('Delete', removeSel)));
    const ws = selWidgets(), same = ws.every(w => w.type === ws[0].type) && !isGroup(nodes[0]);
    if (same && WT[ws[0].type]) {
      pane.append(h('h2', { text: `All ${ws.length} ${WT[ws[0].type].label.toLowerCase()} items` }));
      const p0 = ws[0].p;
      pane.append(...fieldsFor({ fields: WT[ws[0].type].fields.filter(f => f.section || !['sensor', 'rows', 'text'].includes(f.t)) }, p0, (k, v) => edit(doc => ws.forEach(w => { const t = findNode(doc, w.id).node; t.p[k] = v; remeasure(t, APP.env); }), 'multi' + k), 'multi.'));
    }
    const r = sensorReplacer(ws); if (r) pane.append(r);
  } else {
    const n = nodes[0];
    if (isGroup(n)) {
      pane.append(h('h3', { text: 'Group' }));
      pane.append(nameField(n, 'Group'));
      pane.append(xywh(n, true));
      pane.append(h('div', { class: 'acts' }, actButton('Edit parts', () => { APP.scope = n.id; select(n.children[0] ? [n.children[0].id] : []); }, 'Select parts inside (Enter)'),
        actButton('Ungroup', ungroupSel, 'Ungroup (Ctrl+Shift+G)'), actButton('Duplicate', () => duplicateSel()), actButton('Delete', removeSel)));
      pane.append(orderActs(n));
      const r = sensorReplacer(n.children); if (r) pane.append(r);
      const div = h('input', { class: 'fld', type: 'text', value: n.div || '', placeholder: `===== ${n.name} =====`, 'data-k': 'div' });
      on(div, 'input', () => edit(() => { n.div = sStr(div.value, 200) || undefined; }, 'div' + n.id));
      pane.append(h('details', { class: 'sec' }, h('summary', { text: 'AIDA64' }), h('div', {}, h('div', { class: 'f' }, h('label', { text: 'Divider label' }), div),
        h('p', { class: 'hint', text: 'A hidden label written before the group, so SensorPanel Manager lists its items together.' }))));
    } else {
      const def = WT[n.type];
      pane.append(h('h3', { text: def?.label || n.type }));
      pane.append(nameField(n, def?.label || n.type));
      pane.append(xywh(n, def && (def.resize === 'aspect' || def.resize === 'none')));
      if (def) pane.append(...fieldsFor(def, n.p, (k, v) => edit(doc => { const t = findNode(doc, n.id).node; t.p[k] = v; if (k === 'sensor') delete t.p.slabel; remeasure(t, APP.env); }, 'f' + n.id + k), ''));
      const miss = missingSensors(n); if (miss.length && def?.kind === 'composite') pane.append(h('p', { class: 'note warn', text: `Not reported by your PC: ${miss.slice(0, 8).join(', ')}${miss.length > 8 ? '…' : ''}` }));
      const acts = [actButton('Duplicate', () => duplicateSel()), actButton('Delete', removeSel), actButton(n.locked ? 'Unlock' : 'Lock', () => edit(() => { n.locked = !n.locked; })), actButton(n.hidden ? 'Show' : 'Hide', () => edit(() => { n.hidden = !n.hidden; }))];
      if (def?.expand) acts.unshift(actButton('Detach parts', () => detach(n), 'Turn this into separate parts you can move one by one'));
      pane.append(h('div', { class: 'acts' }, ...acts), orderActs(n));
      if (def?.kind === 'imported') pane.append(h('p', { class: 'hint', text: 'From an opened panel. AIDA64 draws it; the preview here is approximate.' }));
    }
  }
  for (const d of pane.querySelectorAll('details.sec')) if (openSecs.includes(d.querySelector('summary')?.textContent)) d.open = true;
  if (focusKey) { const el = pane.querySelector(`[data-k="${CSS.escape(focusKey)}"]`); if (el) { el.focus({ preventScroll: true }); try { if (caret !== null && caret !== undefined) el.setSelectionRange(caret, caret); } catch (e) { /* number inputs */ } } }
}
function nameField(n, ph) {
  const el = h('input', { class: 'fld', type: 'text', value: n.name || '', placeholder: ph, 'aria-label': 'Name', 'data-k': 'name' });
  on(el, 'input', () => edit(() => { const v = sStr(el.value, 60); if (v) n.name = v; else delete n.name; }, 'name' + n.id));
  return el;
}
function orderActs() {
  return h('div', { class: 'acts' }, actButton('To front', () => zorder(2), 'Bring to front (Ctrl+])'), actButton('Forward', () => zorder(1), 'Bring forward (])'),
                                      actButton('Backward', () => zorder(-1), 'Send backward ([)'), actButton('To back', () => zorder(-2), 'Send to back (Ctrl+[)'));
}
const SIZES = [[3840, 2160, '4K'], [2560, 1440, 'QHD'], [1920, 1080, 'Full HD'], [3840, 2400, '16:10'], [2560, 1600, '16:10'], [1920, 1200, '16:10'], [2752, 2064, 'iPad Pro 13″'], [2960, 1848, 'Galaxy Tab Ultra'], [1280, 800, ''], [1024, 600, '7″ LCD'], [800, 480, '5″ LCD']];
function sizeControl(w, hh, set) {
  const sel = h('select', { class: 'fld', 'aria-label': 'Panel size' });
  for (const [a, b, l] of SIZES) sel.append(h('option', { value: `${a}x${b}`, text: `${a} × ${b}${l ? ' · ' + l : ''}` }));
  sel.append(h('option', { value: 'custom', text: 'Custom…' }));
  sel.value = SIZES.some(s => s[0] === w && s[1] === hh) ? `${w}x${hh}` : 'custom';
  const W = h('input', { class: 'fld', type: 'number', value: w, min: 160, max: 7680, 'aria-label': 'Width' }), H = h('input', { class: 'fld', type: 'number', value: hh, min: 160, max: 4320, 'aria-label': 'Height' });
  const cust = h('div', { class: 'xywh', style: 'grid-template-columns:1fr 1fr' }, h('label', {}, 'Width', W), h('label', {}, 'Height', H));
  cust.hidden = sel.value !== 'custom';
  on(sel, 'change', () => { cust.hidden = sel.value !== 'custom'; if (sel.value !== 'custom') { const [a, b] = sel.value.split('x').map(Number); set(a, b); } });
  const apply = () => set(Math.round(sNum(W.value, 160, 7680, w)), Math.round(sNum(H.value, 160, 4320, hh)));
  on(W, 'change', apply); on(H, 'change', apply);
  return h('div', { style: 'display:grid;gap:6px' }, sel, cust);
}
function buildDocInspector(pane) {
  const doc = APP.doc;
  pane.append(h('h3', { text: 'Panel' }));
  pane.append(h('div', { class: 'f' }, h('span', { class: 'lab', text: 'Size' }), sizeControl(doc.panel.w, doc.panel.h, (w, hh) => resizePanel(w, hh))));
  const dpi = h('select', { class: 'fld', id: 'doc-dpi' }); for (let d = 100; d <= 300; d += 25) dpi.append(h('option', { value: d, text: d + ' %' })); dpi.value = doc.export.dpi;
  on(dpi, 'change', () => edit(() => { doc.export.dpi = +dpi.value; }));
  pane.append(h('div', { class: 'f' }, h('label', { for: 'doc-dpi', text: 'Windows scale' }), dpi), h('p', { class: 'hint', text: 'The scale set in Windows Settings › Display for the screen the panel runs on. AIDA64 enlarges positions and text by it, so the export shrinks them first.' }));
  const warm = h('input', { class: 'fld', type: 'number', value: doc.warm, min: 0, max: 150, id: 'doc-warm', 'data-k': 'warm' }), hot = h('input', { class: 'fld', type: 'number', value: doc.hot, min: 0, max: 150, id: 'doc-hot', 'data-k': 'hot' });
  on(warm, 'input', () => Number.isFinite(+warm.value) && edit(() => { doc.warm = +warm.value; }, 'warm')); on(hot, 'input', () => Number.isFinite(+hot.value) && edit(() => { doc.hot = +hot.value; }, 'hot'));
  pane.append(h('div', { class: 'f' }, h('label', { for: 'doc-warm', text: 'Warm from °C' }), warm), h('div', { class: 'f' }, h('label', { for: 'doc-hot', text: 'Hot from °C' }), hot));
  const toks = h('div', { class: 'tokens' });
  for (const [k, v] of Object.entries(doc.tokens)) {
    const inp = h('input', { type: 'color', value: v, 'aria-label': TOKEN_NAMES[k] || k });
    on(inp, 'change', () => edit(() => { doc.tokens[k] = inp.value.toLowerCase(); }));
    toks.append(h('label', {}, inp, h('span', { text: TOKEN_NAMES[k] || k })));
  }
  pane.append(h('details', { class: 'sec', open: true }, h('summary', { text: 'Colours' }), h('div', {}, h('p', { class: 'hint', text: 'Parts that use these colours change together. OLED: keep fixed markings dim.' }), toks)));
  if (doc.gen && THEMES[doc.gen.theme]) {
    pane.append(h('div', { class: 'acts' }, actButton('Theme setup…', () => openTheme(doc.gen.theme, doc.gen), 'Change the hardware or options and rebuild the theme')));
    pane.append(h('p', { class: 'hint', text: 'Rebuilding replaces the layout, including changes you made by hand.' }));
  }
  const grid = h('input', { class: 'fld', type: 'number', value: APP.grid, min: 0, max: 200, id: 'grid-size' });
  on(grid, 'change', () => { APP.grid = Math.max(0, Math.round(+grid.value || 0)); });
  pane.append(h('details', { class: 'sec' }, h('summary', { text: 'Editor' }), h('div', {}, h('div', { class: 'f' }, h('label', { for: 'grid-size', text: 'Grid (0 = off)' }), grid),
    h('p', { class: 'hint', text: 'Drag snaps to edges and centres of other parts, then to the grid. Hold Alt to move freely. Space + drag or the mouse wheel pans; Ctrl + wheel zooms.' }))));
}
async function resizePanel(w, hh) {
  const doc = APP.doc; if (w === doc.panel.w && hh === doc.panel.h) return;
  let mode = 'keep';
  if (doc.nodes.length) mode = await ask('Change the panel size', `From ${doc.panel.w} × ${doc.panel.h} to ${w} × ${hh}.`, [['cancel', 'Cancel'], ['keep', 'Keep positions'], ['scale', 'Scale content']]);
  if (mode === 'cancel') return UI.refresh();
  edit(d => {
    if (mode === 'scale') { const k = Math.min(w / d.panel.w, hh / d.panel.h); scaleDocContent(d, k, (w - d.panel.w * k) / 2, (hh - d.panel.h * k) / 2); }
    d.panel = { w, h: hh };
  });
  APP.io = stageIo(APP.doc); APP.view.fit = true; requestDraw();
}

/* ---------------------------------------------------------------- dialogs */
function ask(title, text, buttons) {
  return new Promise(res => {
    const d = $('dlg-ask'); $('ask-h').textContent = title; $('ask-text').textContent = text;
    const foot = $('ask-btns'); foot.replaceChildren();
    buttons.forEach(([v, l], i) => foot.append(h('button', { type: 'button', class: 'btn' + (i === buttons.length - 1 ? ' primary' : ' ghost'), text: l, onclick: () => { d.close(v); } })));
    d.onclose = () => res(d.returnValue || buttons[0][0]); d.returnValue = ''; d.showModal();
  });
}
async function openStart() {
  const d = $('dlg-start'), recent = (await STORE.get('recent')) || [];
  $('start-recent').hidden = !recent.length; const ul = $('recent-list'); ul.replaceChildren();
  for (const r of recent) { const b = h('button', { type: 'button' }, h('strong', { text: r.name }), h('span', { text: `${r.size?.join(' × ') || ''} · ${new Date(r.at).toLocaleDateString()}` }));
    on(b, 'click', async () => { d.close(); const doc = await loadLocal(r.slot); if (doc) setDoc(doc); }); ul.append(h('li', {}, b)); }
  d.showModal();
}
/* theme setup: hardware (from your PC's list or the example) and the theme's options */
function openTheme(theme, prev) {
  const d = $('dlg-theme'), body = $('theme-body'); body.replaceChildren();
  $('theme-h').textContent = theme === 'blank' ? 'New blank panel' : `${THEMES[theme].label} setup`;
  const hw = hwClone(prev?.hw || APP.hw), opts = JSON.parse(JSON.stringify(prev?.opts || {})), size = { w: APP.doc.panel.w || 3840, h: APP.doc.panel.h || 2160, dpi: APP.doc.export?.dpi || 100 };
  const sec = (t, ...k) => h('section', { style: 'display:grid;gap:8px;align-content:start' }, h('h2', { text: t }), ...k);
  const row = (lab, el) => h('div', { class: 'f' }, h('label', { text: lab }), el);
  const num = (v, min, max, set) => { const e = h('input', { class: 'fld', type: 'number', value: v, min, max }); on(e, 'input', () => Number.isFinite(+e.value) && set(+e.value)); return e; };
  const txt = (v, max, set) => { const e = h('input', { class: 'fld', type: 'text', value: v ?? '', maxlength: max }); on(e, 'input', () => set(e.value)); return e; };
  const sel = (v, optsL, set) => { const e = h('select', { class: 'fld' }); for (const [k, l] of optsL) e.append(h('option', { value: k, text: l })); e.value = v; on(e, 'change', () => set(e.value)); return e; };
  const has = id => !APP.pc || APP.pc.sensors.has(id);
  const dpi = sel(size.dpi, Array.from({ length: 9 }, (_, i) => [100 + i * 25, `${100 + i * 25} %`]), v => size.dpi = +v);
  body.append(sec('Panel', h('div', { class: 'f' }, h('span', { class: 'lab', text: 'Size' }), sizeControl(size.w, size.h, (w, hh) => { size.w = w; size.h = hh; })), row('Windows scale', dpi)));
  if (theme !== 'blank') {
    const g = () => hw.gpu || 1;
    const cpuTemps = [['TCPUPKG', 'CPU Package'], ['TCPUDIO', 'CPU Diode'], ['TCPU', 'CPU'], ['TCPUTCTL', 'CPU Tctl (AMD)']].map(([k, l]) => [k, l + (has(k) ? '' : ' — not on your PC')]);
    const gpuTemps = () => [['DIO', 'Diode (core)'], ['HOT', 'Hotspot'], ['MEM', 'Memory'], ['', 'GPU']].map(([s, l]) => [`TGPU${g()}${s}`, l + (has(`TGPU${g()}${s}`) ? '' : ' — not on your PC')]);
    const gsel = sel(hw.gpuTemp, gpuTemps(), v => hw.gpuTemp = v);
    const disks = h('div', { class: 'rows' }), fans = h('div', { class: 'rows' });
    const drawDisks = () => { disks.replaceChildren(); hw.disks.forEach((dk, i) => { const rm = h('button', { type: 'button', text: 'Remove', onclick: () => { hw.disks.splice(i, 1); drawDisks(); } });
      disks.append(h('div', { class: 'row' }, h('div', { class: 'rh' }, h('span', { text: `Drive ${i + 1}`, style: 'margin-right:auto' }), rm),
        h('label', {}, 'Name', txt(dk.name, 16, v => dk.name = v)), h('label', {}, 'AIDA64 disk', num(dk.num || 0, 0, 50, v => dk.num = v)), h('label', {}, 'Letter', txt(dk.letter || '', 1, v => dk.letter = v.toUpperCase())))); });
      if (hw.disks.length < 4) disks.append(h('button', { type: 'button', class: 'btn ghost', text: '+ Drive', onclick: () => { hw.disks.push({ name: 'DISK', num: hw.disks.length + 1, letter: '' }); drawDisks(); } })); };
    const drawFans = () => { fans.replaceChildren(); hw.fans.forEach((f, i) => { const rm = h('button', { type: 'button', text: 'Remove', onclick: () => { hw.fans.splice(i, 1); drawFans(); } });
      fans.append(h('div', { class: 'row' }, h('div', { class: 'rh' }, h('span', { text: `Fan ${i + 1}`, style: 'margin-right:auto' }), rm),
        h('label', {}, 'Label', txt(f.label, 12, v => f.label = v)), h('label', {}, 'Sensor', (() => { sensorDatalist(); const e = h('input', { class: 'fld', type: 'text', value: f.id, list: 'sensor-dl' }); on(e, 'change', () => f.id = sSensor(e.value, f.id)); return e; })()),
        h('label', {}, 'Max RPM', num(f.max, 100, 20000, v => f.max = v)))); });
      if (hw.fans.length < 8) fans.append(h('button', { type: 'button', class: 'btn ghost', text: '+ Fan', onclick: () => { hw.fans.push({ id: 'FCHA1', label: 'CASE', max: 3000 }); drawFans(); } })); };
    drawDisks(); drawFans();
    const dimm = (i) => sel(hw.dimms?.[i] || 0, [[0, 'None'], ...Array.from({ length: 8 }, (_, n) => [n + 1, `${SP.catalog.ordinal(n + 1)} DIMM`])], v => { hw.dimms = hw.dimms || []; hw.dimms[i] = +v; hw.dimms = hw.dimms.filter(Boolean); });
    body.append(h('div', { class: 'two' },
      sec('Processor', h('p', { class: 'hint', text: APP.pc ? 'Read from your sensor list. Check it, especially on CPUs without Hyper-Threading.' : 'Example hardware. Load your sensor list in Your PC to fill this in.' }),
        row('P-cores', num(hw.pCores, 0, 64, v => hw.pCores = v)), row('E-cores', num(hw.eCores, 0, 64, v => hw.eCores = v)),
        row('Two threads per P-core', (() => { const e = h('input', { type: 'checkbox', checked: hw.smt !== false }); on(e, 'change', () => hw.smt = e.checked); return e; })()),
        row('Temperature', sel(hw.cpuTemp, cpuTemps, v => hw.cpuTemp = v))),
      sec('Graphics, network, memory', row('GPU number', num(g(), 1, 12, v => { hw.gpu = v; hw.gpuTemp = `TGPU${v}DIO`; gsel.replaceChildren(...gpuTemps().map(([k, l]) => h('option', { value: k, text: l }))); gsel.value = hw.gpuTemp; })), row('GPU temperature', gsel),
        row('Network adapter', sel(hw.nic || 0, [[0, 'None'], ...Array.from({ length: 16 }, (_, n) => [n + 1, `NIC${n + 1}${APP.pc && !has(`SNIC${n + 1}DLRATE`) ? ' — not on your PC' : ''}`])], v => hw.nic = +v)),
        h('p', { class: 'hint', text: 'AIDA64 counts virtual adapters too, so the real one is often NIC2 or higher.' }),
        row('Memory sticks', h('div', { class: 'xywh', style: 'grid-template-columns:1fr 1fr' }, dimm(0), dimm(1))))));
    body.append(h('div', { class: 'two' }, sec('Drives', h('p', { class: 'hint', text: 'Temperature and speed use the AIDA64 disk number; space used uses the letter.' }), disks), sec('Fans', fans)));
    if (theme === 'modern') {
      const o = modernOpts(opts, hw); Object.assign(opts, o);
      const checks = h('div', { class: 'checks' });
      for (const [k, l] of MODERN_EXTRAS) { const e = h('input', { type: 'checkbox', checked: opts.extras[k] }); on(e, 'change', () => opts.extras[k] = e.checked); checks.append(h('label', {}, e, l)); }
      const cpuC = h('input', { type: 'color', value: opts.cpuColor }), gpuC = h('input', { type: 'color', value: opts.gpuColor });
      on(cpuC, 'change', () => opts.cpuColor = cpuC.value); on(gpuC, 'change', () => opts.gpuColor = gpuC.value);
      body.append(h('div', { class: 'two' },
        sec('Header', row('Centre shows', sel(opts.hmode, [['media', 'Now playing'], ['title', 'A title'], ['reg', 'Your own text (registry)'], ['none', 'Nothing']], v => opts.hmode = v)), row('Title', txt(opts.title, 24, v => opts.title = v))),
        sec('Extra readings', checks)),
        h('div', { class: 'two' }, sec('Power scales', row('CPU max W', num(opts.cpuW, 50, 600, v => opts.cpuW = v)), row('GPU max W', num(opts.gpuW, 50, 1000, v => opts.gpuW = v)), row('GPU TDP max %', num(opts.tdpMax, 100, 200, v => opts.tdpMax = v))),
          sec('Colours', row('CPU accent', cpuC), row('GPU accent', gpuC), row('Amber from °C', num(opts.warm, 40, 110, v => opts.warm = v)), row('Red from °C', num(opts.hot, 40, 115, v => opts.hot = v)))));
    } else if (theme === 'classic') {
      const o = { ...CLASSIC_DEFAULTS, ...opts }; Object.assign(opts, o);
      const nc = h('input', { type: 'color', value: opts.needleColor }); on(nc, 'change', () => opts.needleColor = nc.value);
      const fps = h('input', { type: 'checkbox', checked: opts.fps }); on(fps, 'change', () => opts.fps = fps.checked);
      body.append(sec('Options', row('Needle colour', nc), row('Frame-rate dial (needs RTSS)', fps)));
    }
  }
  $('theme-form').onsubmit = async e => {
    e.preventDefault(); d.close();
    const panel = { w: size.w, h: size.h };
    const doc = theme === 'blank' ? newDoc({ name: 'My panel', w: panel.w, h: panel.h }) : THEMES[theme].make(panel, hw, opts);
    doc.export.dpi = size.dpi;
    if (APP.doc.nodes.length) await rememberRecent(APP.doc);
    setDoc(doc); UI.toast(theme === 'blank' ? 'Blank panel ready. Drag components onto it.' : `${THEMES[theme].label} created. Everything can be moved, resized and changed.`);
  };
  d.showModal();
}

/* ---------------------------------------------------------------- status bar (estimates refresh shortly after edits) */
let statTimer = 0, statSeq = 0;
function scheduleStats() {
  clearTimeout(statTimer);
  statTimer = setTimeout(async () => {
    const seq = ++statSeq, doc = APP.doc;
    try {
      const m = await compileDoc(doc, APP.env, { keepOrder: true });
      if (seq !== statSeq) return;
      const est = await estimate(m);
      const c = mk(480, Math.max(1, Math.round(480 * doc.panel.h / doc.panel.w))), x = c.getContext('2d', { willReadFrequently: true }), s = c.width / doc.panel.w;
      x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.scale(s, s); drawDoc(x, doc, APP.env, APP.io, .25);
      const px = x.getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] > 6 || px[i + 1] > 6 || px[i + 2] > 6) lit++;
      UI.stats = { ...est, lit: lit / (px.length / 4) };
      renderStatus();
    } catch (e) { console.error(e); }
  }, 900);
}
function renderStatus() {
  const s = UI.stats, el = $('status'), parts = [];
  let missing = 0; eachWidget(APP.doc, w => { missing += missingSensors(w).length ? 1 : 0; });
  parts.push(h('span', {}, h('b', { text: `${APP.doc.panel.w} × ${APP.doc.panel.h}` })));
  if (s) parts.push(h('span', {}, h('b', { text: s.items }), ' items'), h('span', {}, h('b', { text: s.frames }), ' gauge frames'), h('span', {}, '~', h('b', { text: fmtBytes(APP.doc.export.format === 'spzip' ? s.spzip : s.sensorpanel) })), h('span', {}, 'lit ', h('b', { text: (s.lit * 100).toFixed(1) + ' %' })));
  if (APP.pc && missing) parts.push(h('span', { class: 'warn', text: `${missing} part${missing > 1 ? 's use' : ' uses'} sensors your PC doesn’t report` }));
  if (!APP.pc) parts.push(h('span', { text: 'Example readings · load your PC in Your PC' }));
  el.replaceChildren(...parts);
}

const UI = {
  stats: null, after: [],          /* after: more things to refresh with the selection (the assistant's "Selected" chip) */
  refresh() { buildLayers(); buildInspector(); renderStatus(); scheduleStats(); const n = $('doc-name'); if (document.activeElement !== n) n.value = APP.doc.name; $('btn-undo').disabled = !APP.past.length; $('btn-redo').disabled = !APP.future.length; UI.after.forEach(f => f()); },
  refreshInspectorBox() { const n = selNodes()[0]; if (!n) return; const b = nodeBox(n); $('inspector').querySelectorAll('.xywh input').forEach((el, i) => { if (document.activeElement !== el) el.value = Math.round(b[i] * 10) / 10; }); },
  toast(msg) { const t = h('div', { class: 'toast', role: 'status', text: msg }); document.body.append(t); setTimeout(() => t.remove(), 3200); },
};
