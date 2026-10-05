/* SP.parse: read AIDA64 SensorPanel files (.sensorpanel = SPVER 100 with hex images, .sp2 = SPVER 200 inside .spzip).
   Line grammar: <TAG>value</TAG> pairs, any order, every tag optional, numbers may be floats ("1024.00").
   A '-' before the ID hides the item. Text is cp1252 unless a BOM says UTF-16 or UTF-8 (AIDA64 7.99+ writes UTF-16 .sp2). */
window.SP = window.SP || {};
SP.parse = (() => {
  'use strict';
  const { fromBgr } = SP.core;
  const TAG = /<([A-Z0-9]+)>([\s\S]*?)<\/\1>/g;

  function decode(bytes) {
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
  const HEXV = (() => { const t = new Int8Array(128).fill(-1); for (let i = 0; i < 16; i++) { t['0123456789ABCDEF'.charCodeAt(i)] = i; t['0123456789abcdef'.charCodeAt(i)] = i; } return t; })();
  function unhex(s) {
    const out = new Uint8Array(s.length >> 1);
    for (let i = 0, j = 0; j < out.length; i += 2, j++) out[j] = (HEXV[s.charCodeAt(i)] << 4) | HEXV[s.charCodeAt(i + 1)];
    return out;
  }
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

  /* -> { ver, swver, w, h, bgcolor, items: [{id, hidden, kind, sensor, tags: [[k, v]…]}], images: Map(name -> bytes), encoding } */
  function parsePanel(bytes) {
    const { text, encoding } = decode(bytes);
    const head = {}, items = [], images = new Map();
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const tags = [];
      for (const m of line.matchAll(TAG)) tags.push([m[1], m[2]]);
      if (!tags.length) continue;
      const get = k => tags.find(t => t[0] === k)?.[1];
      if (get('GAUSTAFNM') !== undefined) { images.set(get('GAUSTAFNM'), unhex(get('GAUSTADAT') || '')); continue; }
      const id = get('ID');
      if (id === undefined) { for (const [k, v] of tags) head[k] = v; continue; }
      const hidden = id.startsWith('-'), raw = hidden ? id.slice(1) : id;
      const m = raw.match(/^\[(SIMPLE|GAUGE|GRAPH|ARC)\](.*)$/);
      const kind = m ? m[1] : raw === 'LBL' || raw === 'IMG' ? raw : 'SITEM';
      const keep = tags.filter(([k]) => k !== 'IMGDAT');
      if (kind === 'IMG' && get('IMGDAT') !== undefined && get('IMGFIL') !== undefined) images.set(get('IMGFIL'), unhex(get('IMGDAT')));
      items.push({ id: raw, hidden, kind, sensor: m ? m[2] : kind === 'SITEM' ? raw : null, tags: keep });
    }
    return { ver: num(head.SPVER), swver: head.SWVER || '', w: num(head.SPWIDTH), h: num(head.SPHEIGHT), bgcolor: head.SPBGCOLOR, items, images, encoding };
  }

  /* .spzip -> parsed panel (images come from the zip; an optional designer.json is returned as text) */
  async function parseSpzip(bytes) {
    const files = await SP.zip.readZip(bytes);
    const sp2 = [...files.keys()].find(n => /\.sp2$/i.test(n));
    if (!sp2) throw new Error('No .sp2 layout inside this .spzip');
    const p = parsePanel(files.get(sp2));
    for (const [n, b] of files) if (n !== sp2 && !p.images.has(n)) p.images.set(n, b);
    const dj = [...files.keys()].find(n => /(^|\/)designer\.json$/i.test(n));
    p.designer = dj ? new TextDecoder().decode(files.get(dj)) : null;
    return p;
  }

  /* parsed item -> writer model item (see sp-writer.js). Unknown kinds stay as SITEM/RAW tag lists. */
  function toItem(pi) {
    const t = Object.fromEntries(pi.tags), col = v => fromBgr(v) || [255, 255, 255];
    const base = { hidden: pi.hidden, x: num(t.ITMX), y: num(t.ITMY) };
    const lbl = t.LBL ?? '';
    switch (pi.kind) {
      case 'IMG': {
        const it = { kind: 'IMG', ...base, name: t.IMGFIL || '' };
        if (t.RESIZW) { it.rw = num(t.RESIZW); it.rh = num(t.RESIZH); }
        if (t.BGIMG === '1') it.bg = true;
        return it;
      }
      case 'LBL':
        /* hidden labels in the usual divider form are group separators; anything else stays a (hidden) label */
        if (pi.hidden && (t.TXTSIZ ?? '8') === '8' && !t.FNTNAM && num(t.ITMX) === 0 && num(t.ITMY) === 0) return { kind: 'DIV', text: lbl };
        return { kind: 'LBL', ...base, text: lbl, pt: num(t.TXTSIZ) || 8, font: t.FNTNAM || '', col: col(t.LBLCOL), bold: t.LBLBIS?.[0] === '1', italic: t.LBLBIS?.[1] === '1',
                 shadow: t.LBLBIS?.[2] === '1', shadowCol: fromBgr(t.SHDCOL) || [0, 0, 0], shadowDis: num(t.SHDDIS) || 1, shadowDep: num(t.SHDDEP) || 1 };
      case 'SIMPLE':
        return { kind: 'SIMPLE', ...base, sensor: pi.sensor, slabel: lbl, label: lbl, showLabel: t.SHWLBL === '1', pt: num(t.TXTSIZ) || 8, font: t.FNTNAM || 'Segoe UI',
                 col: col(t.TXTCOL), bold: t.TXTBIR?.[0] === '1', italic: t.TXTBIR?.[1] === '1', align: t.TXTBIR?.[2] === '1' ? 'r' : 'l', unit: t.SHWUNT === '0' ? '' : (t.UNT || '') };
      case 'GAUGE': {
        const it = { kind: 'GAUGE', ...base, sensor: pi.sensor, slabel: lbl, typ: t.TYP || 'Custom', siz: t.SIZ || 'S', lo: num(t.MINVAL), hi: num(t.MAXVAL),
                     icon: t.SHWICO === '1', showVal: t.SHWVAL === '1', pt: num(t.TXTSIZ) || 8, font: t.FNTNAM || 'Segoe UI', col: col(t.VALCOL),
                     bold: t.VALBI?.[0] === '1', italic: t.VALBI?.[1] === '1', frames: t.STAFLS !== undefined ? t.STAFLS.split('|') : [] };
        if (!it.showVal) it.ptRaw = num(t.TXTSIZ) || 8;
        if (t.RESIZW) { it.rw = num(t.RESIZW); it.rh = num(t.RESIZH); }
        return it;
      }
      case 'GRAPH':
        return { kind: 'GRAPH', ...base, sensor: pi.sensor, slabel: lbl, type: t.TYP || 'LG', w: num(t.WID), h: num(t.HEI), step: num(t.GPHSTP) || 1, thick: num(t.GPHTCK) || 1,
                 density: num(t.GRDDNS), lo: num(t.MINVAL), hi: num(t.MAXVAL), auto: t.AUTSCL === '1', gridCol: col(t.GRDCOL), col: col(t.GPHCOL), bgCol: fromBgr(t.BGCOL) || [0, 0, 0],
                 frameCol: col(t.FRMCOL), flags: t.GPHBFG || '000', showScale: t.SHWSCL === '1', scalePt: num(t.TXTSIZ) || 8, scaleFont: t.FNTNAM || 'Segoe UI',
                 scaleCol: col(t.SCLCOL), scaleBI: t.SCLBI || '000' };
      default:
        return { kind: pi.kind === 'SITEM' ? 'SITEM' : 'RAW', ...base, id: pi.id, sensor: pi.sensor, tags: pi.tags };
    }
  }
  function toModel(p) {
    return { w: p.w, h: p.h, items: p.items.map(toItem), imgs: p.images };
  }

  return { decode, unhex, parsePanel, parseSpzip, toItem, toModel };
})();
