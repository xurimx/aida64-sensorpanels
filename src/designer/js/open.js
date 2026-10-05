/* ================================================================ open: design files and AIDA64 panels -> design document
   .design.json         a saved design (images inlined as data URLs)
   .spzip from here      restored exactly from its designer.json
   .sensorpanel / .spzip any panel: every item becomes a movable widget; hidden divider labels start groups */
const mimeOf = b => b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xFF && b[1] === 0xD8 ? 'image/jpeg' : b[0] === 0x42 && b[1] === 0x4D ? 'image/bmp' : b[0] === 0x52 && b[1] === 0x49 ? 'image/webp' : 'image/png';
const hexCol = c => SP.core.rgbToHex(c || [255, 255, 255]);

async function docFromDesign(raw) {
  const doc = sanitizeDoc(raw), remap = new Map();
  for (const [id, a] of Object.entries(doc.assets)) {
    if (!a.data) continue;
    const bytes = Uint8Array.from(atob(a.data.slice(a.data.indexOf(',') + 1)), c => c.charCodeAt(0));
    const nid2 = await addAsset(bytes, a.mime, a.name || `${id}.png`);
    if (nid2 !== id) remap.set(id, nid2);
  }
  doc.assets = {};
  eachWidget(doc, w => {
    if (w.type === 'image' && remap.has(w.p.asset)) w.p.asset = remap.get(w.p.asset);
    if (w.type === 'customGauge') w.p.frames = w.p.frames.map(f => remap.get(f) || f);
  });
  return doc;
}

function widgetFromItem(it, assetOf, panel) {
  const base = it.hidden ? { aidaHidden: true } : {};
  const at = (type, p, x, y, w, h) => ({ id: nid(), type, x, y, w, h, p: { ...WT[type].defaults({}), ...p, ...base } });
  switch (it.kind) {
    case 'IMG': {
      const id = assetOf.get(it.name), a = ASSETS.get(id);
      if (it.bg) return { ...at('image', { asset: id || '', name: it.name, separate: true, bg: true }, 0, 0, panel.w, panel.h), name: 'Background', locked: true };
      const w = it.rw || a?.w || 100, h = it.rh || a?.h || 100, full = it.x === 0 && it.y === 0 && w >= panel.w && h >= panel.h;
      return { ...at('image', { asset: id || '', name: it.name, separate: true }, it.x, it.y, w, h), ...(full ? { name: 'Background', locked: true } : {}) };
    }
    case 'SIMPLE': {
      const p = { sensor: it.sensor, slabel: it.slabel, pt: Math.round(it.pt), font: it.font || 'Segoe UI', color: hexCol(it.col), unit: it.unit || '', align: it.align === 'r' ? 'r' : 'l',
                  bold: !!it.bold, italic: !!it.italic, showLabel: !!it.showLabel, label: it.showLabel ? it.label || '' : '' };
      const m = WT.value.measure(p);
      return at('value', p, p.align === 'r' ? it.x - m.w : it.x, it.y, m.w, m.h);
    }
    case 'GAUGE': {
      if ((it.typ || 'Custom') !== 'Custom') {
        const b = SP.render.box({ ...it, frames: [] }, null), s = { S: 96, M: 144, L: 192 }[it.siz] || 96;
        return at('nativeGauge', { sensor: it.sensor, lo: it.lo, hi: it.hi, typ: it.typ, siz: it.siz || 'S', showVal: it.showVal, pt: Math.round(it.pt), font: it.font, color: hexCol(it.col), icon: !!it.icon, slabel: it.slabel },
                  it.x, it.y, Math.max(b[2], s), Math.max(b[3], s));
      }
      if (it.showVal && !(it.frames || []).some(Boolean)) {
        const p = { sensor: it.sensor, slabel: it.slabel, pt: Math.round(it.pt), font: it.font || 'Segoe UI', color: hexCol(it.col), align: 'c', bold: !!it.bold, italic: !!it.italic };
        const m = WT.value.measure(p);
        return at('value', p, it.x - m.w / 2, it.y - m.h / 2, m.w, m.h);
      }
      const frames = (it.frames || []).map(f => f ? assetOf.get(f) || '' : '');
      const first = ASSETS.get(frames.find(Boolean)), w = it.rw || first?.w || 64, h = it.rh || first?.h || 64;
      return at('customGauge', { sensor: it.sensor, lo: it.lo, hi: it.hi, frames, showVal: it.showVal, pt: Math.round(it.pt), font: it.font, color: hexCol(it.col),
                                 bold: !!it.bold, italic: !!it.italic, slabel: it.slabel }, it.x, it.y, w, h);
    }
    case 'GRAPH': {
      const f = it.flags || '000';
      return at('graph', { sensor: it.sensor, slabel: it.slabel, lo: it.lo, hi: it.hi, auto: it.auto, type: ['LG', 'AG', 'HG'].includes(it.type) ? it.type : 'LG', color: hexCol(it.col), thick: it.thick, step: it.step,
                           grid: 0, base: false, aidaBg: f[0] === '1', aidaFrame: f[1] === '1', aidaGrid: f[2] === '1', density: it.density || 40,
                           bgCol: hexCol(it.bgCol), frameCol: hexCol(it.frameCol), gridCol: hexCol(it.gridCol) }, it.x, it.y, it.w, it.h);
    }
    case 'LBL': {
      const p = { text: it.text, native: true, font: it.font || 'Segoe UI', pt: Math.max(4, Math.round(it.pt)), color: hexCol(it.col), bold: !!it.bold, italic: !!it.italic };
      const m = WT.text.measure(p);
      return at('text', p, it.x, it.y, m.w, m.h);
    }
    case 'SITEM': {
      const b = SP.render.box(it, null);
      return at('sensorItem', { sensor: it.id, tags: it.tags }, it.x, it.y, b[2], b[3]);
    }
    case 'RAW': return at('rawItem', { id: it.id, tags: it.tags }, it.x, it.y, 40, 20);
  }
  return null;
}

async function docFromPanel(bytes, fileName = 'panel') {
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4B;
  const p = zip ? await SP.parse.parseSpzip(bytes) : SP.parse.parsePanel(bytes);
  if (zip && p.designer) { try { return { doc: await docFromDesign(JSON.parse(p.designer)), exact: true }; } catch (e) { /* fall back to the items */ } }
  if (!(p.w > 0 && p.h > 0)) throw new Error('This file has no panel size. Is it an AIDA64 SensorPanel?');
  const m = SP.parse.toModel(p), panel = { w: Math.round(p.w), h: Math.round(p.h) };
  const doc = newDoc({ name: fileName.replace(/\.(sensorpanel|spzip)$/i, ''), w: panel.w, h: panel.h });
  const assetOf = new Map();
  for (const [n, b] of p.images) assetOf.set(n, await addAsset(b, mimeOf(b), n));
  let cur = null, skipped = 0;
  for (const it of m.items) {
    if (it.kind === 'DIV') { cur = { id: nid('g'), type: 'group', name: it.text.replace(/^[-=\s]+|[-=\s]+$/g, '') || 'Group', div: it.text, children: [] }; doc.nodes.push(cur); continue; }
    const w = widgetFromItem(it, assetOf, panel);
    if (!w) { skipped++; continue; }
    (cur ? cur.children : doc.nodes).push(w);
  }
  doc.nodes = doc.nodes.filter(n => n.type !== 'group' || n.children.length);
  return { doc, exact: false, skipped, version: p.ver, encoding: p.encoding };
}

/* any dropped or picked file */
async function openFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer()), name = file.name || '';
  if (/\.(json)$/i.test(name) || (bytes[0] === 0x7B && !/\.(sensorpanel|sp2)$/i.test(name))) {
    let raw; try { raw = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { throw new Error('This JSON file can’t be read.'); }
    return { kind: 'design', doc: await docFromDesign(raw) };
  }
  if (/\.reg$/i.test(name) || (bytes[0] === 0xFF && bytes[1] === 0xFE)) return { kind: 'sensors', list: parseSensorList(bytes) };
  if (/\.(sensorpanel|spzip|sp2)$/i.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4B) || /<SPVER>/.test(new TextDecoder('windows-1252').decode(bytes.subarray(0, 200))))
    return { kind: 'panel', ...(await docFromPanel(bytes, name)) };
  try { return { kind: 'sensors', list: parseSensorList(bytes) }; } catch (e) { throw new Error(`${name || 'This file'} isn’t a design, an AIDA64 panel or a sensor list.`); }
}
