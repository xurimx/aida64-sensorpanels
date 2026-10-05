/* ================================================================ compile: design -> AIDA64 model, and stage rendering
   Export: every widget's ops in z-order. Live ops become items. A static run goes into the one background PNG unless it
   overlaps a reading below it, in which case it becomes its own IMG at that point of the drawing order (so it stays on
   top, like Classic OLED's dial hubs). Each group writes one hidden divider label, so SensorPanel Manager lists items
   grouped. Gauge frames are named by content and shared. */

/* ---- assets: images from the user or from opened panels. bytes stay as they are; a bitmap is decoded for drawing ---- */
const ASSETS = new Map();          // id -> { bytes, mime, w, h, name, bitmap }
let ASSET_VER = 0;
async function addAsset(bytes, mime = 'image/png', name = 'image.png') {
  /* the name is part of the identity, so a panel that ships two identical frames under two names opens and saves unchanged */
  const id = cyrb(name + '|' + bytes.length + ':' + Array.from(bytes.subarray(0, 4096)).join(',') + Array.from(bytes.subarray(-4096)).join(','));
  if (!ASSETS.has(id)) {
    let bitmap = null, w = 0, h = 0;
    try { bitmap = await createImageBitmap(new Blob([bytes], { type: mime })); w = bitmap.width; h = bitmap.height; } catch (e) { /* undecodable image: keep bytes, draw nothing */ }
    ASSETS.set(id, { bytes, mime, w, h, name, bitmap }); ASSET_VER++;
  }
  return id;
}

function makeEnv(doc, pc = null) {
  return { doc, pc, asset: id => ASSETS.get(id), tv: JSON.stringify([doc.tokens, doc.warm, doc.hot]) + ASSET_VER };
}

/* ---- ops per widget (cached by content; position is not part of the key) ---- */
const OPS = new Map();             // widget id -> { key, ops }
function shiftOps(ops, dx, dy) {
  return ops.map(op => op.t === 'item'
    ? { t: 'item', it: { ...op.it, x: (op.it.x || 0) + dx, y: (op.it.y || 0) + dy }, box: op.box && [op.box[0] + dx, op.box[1] + dy, op.box[2], op.box[3]] }
    : { t: 'static', b: [op.b[0] + dx, op.b[1] + dy, op.b[2] + dx, op.b[3] + dy], fns: op.fns.map(fn => ctx => { ctx.save(); ctx.translate(dx, dy); fn(ctx); ctx.restore(); }) });
}
function widgetOps(w, env) {
  const key = JSON.stringify([w.type, w.w, w.h, w.p]) + env.tv;
  const hit = OPS.get(w.id);
  if (hit && hit.key === key) return hit.ops;
  const def = WT[w.type];
  let ops = [];
  try {
    if (!def) ops = [];
    else if (def.expand) for (const c of def.expand(w.p, { x: 0, y: 0, w: w.w, h: w.h }, env)) ops.push(...shiftOps(widgetOps({ ...c, id: '#' + c.type + c.x + ',' + c.y }, env), c.x, c.y));
    else { const P = makePainter(env); def.emit(P, w.p, { x: 0, y: 0, w: w.w, h: w.h }); ops = P.ops; }
  } catch (e) { console.error('widget', w.type, e); ops = []; }
  if (!String(w.id).startsWith('#')) OPS.set(w.id, { key, ops });
  return ops;
}

/* nodes in drawing order, with the group each widget belongs to */
function drawList(doc) {
  const out = [];
  for (const n of doc.nodes) {
    if (n.hidden) continue;
    if (n.type === 'group') { n.children.forEach((c, i) => { if (!c.hidden) out.push({ w: c, group: n, first: i === 0 || n.children.slice(0, i).every(x => x.hidden) }); }); }
    else out.push({ w: n, group: null, first: false });
  }
  return out;
}
const overlap = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
/* does a static run really cover pixels of a reading below it? Gauges are tested against the union of their frames
   (mostly transparent: ring segments, needles); other readings count as solid boxes. */
function coversReading(op, ob) {
  const b = [op.b[0], op.b[1], op.b[2] - op.b[0], op.b[3] - op.b[1]];
  if (!overlap(ob.box, b)) return false;
  if (!ob.frames) return true;
  const x0 = Math.floor(Math.max(b[0], ob.box[0])), y0 = Math.floor(Math.max(b[1], ob.box[1]));
  const x1 = Math.ceil(Math.min(b[0] + b[2], ob.box[0] + ob.box[2])), y1 = Math.ceil(Math.min(b[1] + b[3], ob.box[1] + ob.box[3]));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return false;
  if (w * h > 4e6) return true;
  const a = mk(w, h).getContext('2d', { willReadFrequently: true }), c = mk(w, h).getContext('2d', { willReadFrequently: true });
  a.translate(-x0, -y0); op.fns.forEach(fn => fn(a));
  for (const f of new Set(ob.frames)) { const fc = f && frameCanvas(f); if (fc) c.drawImage(fc, ob.x - x0, ob.y - y0); }
  const da = a.getImageData(0, 0, w, h).data, dc = c.getImageData(0, 0, w, h).data;
  for (let i = 3; i < da.length; i += 4) if (da[i] > 8 && dc[i] > 8) return true;
  return false;
}

/* ---- export compile -> { w, h, items, imgs } for SP.writer ---- */
async function compileDoc(doc, env, o = {}) {
  const W = doc.panel.w, H = doc.panel.h, items = [], imgs = new Map(), obstacles = [];
  const bg = mk(W, H), bctx = bg.getContext('2d'); bctx.fillStyle = '#000'; bctx.fillRect(0, 0, W, H);
  let drewBg = false, layer = 0;
  const assetNames = new Map(), taken = new Set();
  const unique = n => { let s = n.replace(/[<>|\\/:*?"\r\n]/g, '_') || 'image.png', i = 2; const m = s.match(/^(.*?)(\.[a-z0-9]+)?$/i); while (taken.has(s.toLowerCase())) s = `${m[1]}_${i++}${m[2] || '.png'}`; taken.add(s.toLowerCase()); return s; };
  const assetName = (id, scaleTo) => {
    const k = id + (scaleTo ? '@' + scaleTo.join('x') : '');
    if (!assetNames.has(k)) {
      const a = ASSETS.get(id), base = a?.name || `${id}.png`;
      const n = unique(scaleTo ? base.replace(/(\.[a-z0-9]+)?$/i, `_${scaleTo[0]}x${scaleTo[1]}.png`) : /\.(png|jpe?g|bmp)$/i.test(base) ? base : base + '.png');
      assetNames.set(k, n);
      if (!a) imgs.set(n, mk(1, 1));
      else if (scaleTo) { const c = mk(scaleTo[0], scaleTo[1]); if (a.bitmap) c.getContext('2d').drawImage(a.bitmap, 0, 0, scaleTo[0], scaleTo[1]); imgs.set(n, c); }
      else imgs.set(n, a.bytes);
    }
    return assetNames.get(k);
  };
  for (const { w, group, first } of drawList(doc)) {
    if (first) items.push({ kind: 'DIV', text: group.div || `===== ${group.name} =====` });
    const ops = shiftOps(widgetOps(w, env), w.x, w.y);
    for (const op of ops) {
      if (op.t === 'item') {
        let it = op.it;
        if (it.kind === 'IMG' && it.asset) { it = { ...it, name: assetName(it.asset, it.scaleTo) }; delete it.asset; delete it.scaleTo; }
        if (it.kind === 'GAUGE' && it.frames?.some(f => f && f[0] === '@')) it = { ...it, frames: it.frames.map(f => f && f[0] === '@' ? assetName(f.slice(1)) : f) };
        if (w.p?.aidaHidden) it = { ...it, hidden: true };
        items.push(it);
        if (op.box && it.kind !== 'DIV') {
          const fr = it.kind === 'GAUGE' && (it.typ || 'Custom') === 'Custom' && it.frames?.some(Boolean) ? it.frames.filter(f => f && f[0] !== '@') : null;
          obstacles.push(fr && fr.length ? { box: op.box, frames: fr, x: it.x, y: it.y } : { box: op.box });
        }
        continue;
      }
      const b = [op.b[0], op.b[1], op.b[2] - op.b[0], op.b[3] - op.b[1]];
      if (o.keepOrder !== false && obstacles.some(ob => coversReading(op, ob))) {
        const x0 = Math.max(0, Math.floor(op.b[0])), y0 = Math.max(0, Math.floor(op.b[1])), x1 = Math.min(W, Math.ceil(op.b[2])), y1 = Math.min(H, Math.ceil(op.b[3]));
        if (x1 <= x0 || y1 <= y0) continue;
        const c = mk(x1 - x0, y1 - y0), cc = c.getContext('2d'); cc.translate(-x0, -y0); op.fns.forEach(fn => fn(cc));
        const name = unique(`layer_${++layer}.png`); imgs.set(name, c);
        items.push({ kind: 'IMG', name, x: x0, y: y0 });
        obstacles.push({ box: b });
      } else { op.fns.forEach(fn => fn(bctx)); drewBg = true; }
    }
  }
  if (drewBg || o.alwaysBg) { const n = unique('background.png'); imgs.set(n, bg); items.unshift({ kind: 'IMG', name: n, x: 0, y: 0 }); }
  for (const it of items) if (it.kind === 'GAUGE') for (const f of it.frames || []) if (f && !imgs.has(f)) { const c = frameCanvas(f); if (c) imgs.set(f, c); }
  return { w: W, h: H, items, imgs };
}

/* file size and memory estimates for the export dialog */
async function estimate(model) {
  let png = 0, mem = 0, frames = 0;
  const seen = new Set();
  for (const it of model.items) {
    const names = it.kind === 'IMG' ? [it.name] : it.kind === 'GAUGE' ? (it.frames || []).filter(Boolean) : [];
    for (const n of names) {
      if (seen.has(n)) continue; seen.add(n);
      const src = model.imgs.get(n); if (!src) continue;
      if (it.kind === 'GAUGE') frames++;
      if (src instanceof Uint8Array) png += src.length; else { png += src.width * src.height * (it.kind === 'IMG' ? .06 : .035) + 500; mem += src.width * src.height * 4; }   /* rough: mostly black or transparent PNGs */
    }
  }
  return { items: model.items.length, frames, png, sensorpanel: png * 2 + model.items.length * 300, spzip: png + model.items.length * 250, mem };
}

/* ---- stage rendering: cached static runs at a resolution step, live items drawn every frame ---- */
const RUNS = new Map();            // `${widget id}|${run index}|${res}` -> { key, canvas, b }
function runCanvas(wid, i, op, res, key) {
  const k = `${wid}|${i}|${res}`, hit = RUNS.get(k);
  if (hit && hit.key === key) return hit;
  const bw = Math.max(1, Math.ceil((op.b[2] - op.b[0]) * res) + 2), bh = Math.max(1, Math.ceil((op.b[3] - op.b[1]) * res) + 2);
  if (bw * bh > 64e6) return null;
  const c = mk(bw, bh), ctx = c.getContext('2d'); ctx.scale(res, res); ctx.translate(-op.b[0] + 1 / res, -op.b[1] + 1 / res);
  op.fns.forEach(fn => { try { fn(ctx); } catch (e) { console.error(e); } });
  const r = { key, canvas: c, b: op.b }; RUNS.set(k, r); return r;
}
function stageIo(doc) {
  return { val: id => SIM.val(id), str: id => SIM.str(id), hist: id => SIM.hist(id), panel: doc.panel,
           img: n => n && n[0] === '@' ? ASSETS.get(n.slice(1))?.bitmap || null : frameCanvas(n), label: s => s.replace(/\$CPUMODEL/g, 'CPU model').replace(/\$GPU1MODEL/g, 'GPU model') };
}
function drawWidget(ctx, w, env, io, res) {
  const ops = widgetOps(w, env), key = OPS.get(w.id)?.key || '';
  let ri = 0;
  for (const op of ops) {
    if (op.t === 'item') {
      if (op.it.kind === 'DIV') continue;
      ctx.save(); ctx.translate(w.x, w.y);
      try { SP.render.item(ctx, op.it.kind === 'IMG' && op.it.asset ? { ...op.it, name: '@' + op.it.asset, ...(op.it.scaleTo ? { rw: op.it.scaleTo[0], rh: op.it.scaleTo[1] } : {}) } : op.it, io); } catch (e) { console.error(e); }
      ctx.restore();
    } else {
      const r = runCanvas(w.id, ri++, op, res, key);
      if (r) ctx.drawImage(r.canvas, w.x + r.b[0] - 1 / res, w.y + r.b[1] - 1 / res, r.canvas.width / res, r.canvas.height / res);
    }
  }
}
function drawDoc(ctx, doc, env, io, res, skip) {
  for (const { w } of drawList(doc)) if (!skip || !skip.has(w.id)) drawWidget(ctx, w, env, io, res);
}
/* drop caches for widgets that no longer exist */
function pruneCaches(doc) {
  const ids = new Set(); eachWidget(doc, w => ids.add(w.id));
  for (const k of OPS.keys()) if (!ids.has(k)) OPS.delete(k);
  for (const k of RUNS.keys()) if (!ids.has(k.split('|')[0])) RUNS.delete(k);
  if (FRAMES.size > 4000) { const used = new Set(); for (const { ops } of OPS.values()) for (const op of ops) if (op.t === 'item') (op.it.frames || []).forEach(f => used.add(f)); for (const k of FRAMES.keys()) if (!used.has(k)) FRAMES.delete(k); }
}
