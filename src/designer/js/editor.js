/* ================================================================ editor: state, history, stage, pointer and keyboard editing */
const APP = {
  doc: newDoc(), env: null, io: null, pc: null, hw: hwClone(HW_DEFAULTS), hwNotes: [],
  sel: new Set(), scope: null,                 // scope: id of the group being edited inside, or null
  view: { zoom: .2, panX: 0, panY: 0, fit: true }, snap: true, grid: 8,
  past: [], future: [], clip: null, drag: null, guides: [], hover: null, frameMs: [],
};
const $ = id => document.getElementById(id);
const on = (el, ev, fn, o) => el.addEventListener(ev, fn, o);

/* ---------------------------------------------------------------- history */
let coalesce = { key: null, at: 0 };
const snapshot = () => JSON.stringify(APP.doc);
/* one history step per gesture: edits with the same key within 500 ms merge; with o.sticky they merge however far apart
   (an assistant request). Any other edit, a drag (pushHistory) or Undo/Redo (swapped) resets the merge. */
function edit(fn, key = null, o = {}) {
  const now = Date.now(), merge = key && coalesce.key === key && (o.sticky || now - coalesce.at < 500);
  const before = merge ? null : snapshot();
  fn(APP.doc);
  if (before) { APP.past.push(before); if (APP.past.length > 200) APP.past.shift(); APP.future = []; }
  coalesce = { key, at: now };
  changed();
}
function pushHistory(before) { APP.past.push(before); if (APP.past.length > 200) APP.past.shift(); APP.future = []; coalesce = { key: null, at: 0 }; }
function undo() { if (!APP.past.length) return; APP.future.push(snapshot()); APP.doc = JSON.parse(APP.past.pop()); swapped(); }
function redo() { if (!APP.future.length) return; APP.past.push(snapshot()); APP.doc = JSON.parse(APP.future.pop()); swapped(); }
function swapped() {
  for (const id of [...APP.sel]) if (!findNode(APP.doc, id)) APP.sel.delete(id);
  if (APP.scope && !findNode(APP.doc, APP.scope)) APP.scope = null;
  coalesce = { key: null, at: 0 }; changed();
}
function setDoc(doc, { keepView = false } = {}) {
  try { doc = sanitizeDoc(JSON.parse(JSON.stringify(doc))); } catch (e) { console.error(e); }      // one canonical form for history, links and autosave
  APP.doc = doc; APP.past = []; APP.future = []; APP.sel.clear(); APP.scope = null; OPS.clear(); RUNS.clear();
  APP.io = stageIo(doc);
  if (!keepView) APP.view.fit = true;
  changed();
}
function changed() {
  APP.env = makeEnv(APP.doc, APP.pc);
  if (!APP.io || APP.io.panel !== APP.doc.panel) APP.io = stageIo(APP.doc);
  eachWidget(APP.doc, w => WT[w.type]?.sensors(w.p).forEach(id => id && SIM.ensure(id)));
  requestDraw(); UI.refresh(); scheduleSave();
}

/* ---------------------------------------------------------------- selection */
const topNode = id => { const f = findNode(APP.doc, id); return f ? (f.parent || f.node) : null; };
const selNodes = () => [...APP.sel].map(id => findNode(APP.doc, id)?.node).filter(Boolean);
const scopeList = () => APP.scope ? (findNode(APP.doc, APP.scope)?.node.children || APP.doc.nodes) : APP.doc.nodes;
function select(ids, add = false) {
  if (!add) APP.sel.clear();
  for (const id of ids) APP.sel.has(id) && add ? APP.sel.delete(id) : APP.sel.add(id);
  requestDraw(); UI.refresh();
}
function selWidgets() { const out = []; for (const n of selNodes()) isGroup(n) ? out.push(...n.children) : out.push(n); return out; }
function unionBox(nodes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) { const [x, y, w, h] = nodeBox(n); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); }
  return x0 === Infinity ? null : [x0, y0, x1 - x0, y1 - y0];
}

/* ---------------------------------------------------------------- stage */
const STAGE = { canvas: null, ctx: null, wrap: null, raf: 0, w: 0, h: 0, dpr: 1 };
function requestDraw() { if (!STAGE.raf) STAGE.raf = requestAnimationFrame(drawStage); }
function fitView() {
  const r = STAGE.wrap.getBoundingClientRect(), pad = 24, statusH = $('status').offsetHeight || 0;
  const z = Math.max(.02, Math.min((r.width - 2 * pad) / APP.doc.panel.w, (r.height - statusH - 2 * pad) / APP.doc.panel.h));
  Object.assign(APP.view, { zoom: z, panX: (r.width - APP.doc.panel.w * z) / 2, panY: (r.height - statusH - APP.doc.panel.h * z) / 2, fit: true });
}
function zoomAt(f, cx, cy) {
  const v = APP.view, z = Math.max(.02, Math.min(8, v.zoom * f)), px = (cx - v.panX) / v.zoom, py = (cy - v.panY) / v.zoom;
  Object.assign(v, { zoom: z, panX: cx - px * z, panY: cy - py * z, fit: false }); requestDraw();
}
const toPanel = (cx, cy) => [(cx - APP.view.panX) / APP.view.zoom, (cy - APP.view.panY) / APP.view.zoom];
const toScreen = (x, y) => [x * APP.view.zoom + APP.view.panX, y * APP.view.zoom + APP.view.panY];
function drawStage() {
  STAGE.raf = 0;
  const t0 = performance.now(), c = STAGE.canvas, r = STAGE.wrap.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (APP.view.fit) fitView();
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const ctx = STAGE.ctx, v = APP.view, doc = APP.doc, z = v.zoom * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#08090B'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(z, 0, 0, z, v.panX * dpr, v.panY * dpr);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, doc.panel.w, doc.panel.h);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, doc.panel.w, doc.panel.h); ctx.clip();
  const res = Math.min(1, 2 ** Math.ceil(Math.log2(Math.max(.01, z))));
  drawDoc(ctx, doc, APP.env, APP.io, res);
  ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const [px, py] = toScreen(0, 0); ctx.strokeStyle = '#2A2F35'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(px) - .5, Math.round(py) - .5, Math.round(doc.panel.w * v.zoom) + 1, Math.round(doc.panel.h * v.zoom) + 1);
  /* sensors your PC doesn't report: dashed amber outline */
  if (APP.pc) {
    ctx.setLineDash([4, 3]); ctx.strokeStyle = '#F2B740';
    eachWidget(doc, (w, g) => { if (w.hidden || g?.hidden) return; if (missingSensors(w).length) { const [x, y] = toScreen(w.x, w.y); ctx.strokeRect(x - 1.5, y - 1.5, w.w * v.zoom + 3, w.h * v.zoom + 3); } });
    ctx.setLineDash([]);
  }
  drawOverlay();
  const ms = performance.now() - t0; APP.frameMs.push(ms); if (APP.frameMs.length > 120) APP.frameMs.shift();
}
function missingSensors(w) { return (WT[w.type]?.sensors(w.p) || []).filter(id => id && sensorStatus(APP.pc, id) === 'no'); }

/* selection boxes, handles, guides and the marquee as DOM on top of the canvas */
function drawOverlay() {
  const ov = $('overlay'), z = APP.view.zoom, parts = [];
  const rect = (x, y, w, h, cls, label) => { const [sx, sy] = toScreen(x, y); parts.push(`<div class="selbox ${cls}" style="left:${sx}px;top:${sy}px;width:${Math.max(1, w * z)}px;height:${Math.max(1, h * z)}px">${label ? `<span class="label">${label}</span>` : ''}</div>`); };
  if (APP.scope) { const g = findNode(APP.doc, APP.scope)?.node; if (g) { const b = nodeBox(g); rect(b[0], b[1], b[2], b[3], 'group hover', escapeHtml('Editing ' + g.name)); } }
  if (APP.hover && !APP.sel.has(APP.hover)) { const n = findNode(APP.doc, APP.hover)?.node; if (n) { const b = nodeBox(n); rect(b[0], b[1], b[2], b[3], 'hover'); } }
  const sel = selNodes();
  for (const n of sel) { const b = nodeBox(n); rect(b[0], b[1], b[2], b[3], isGroup(n) ? 'group' : '', sel.length === 1 ? escapeHtml(n.name || (isGroup(n) ? n.name : WT[n.type]?.label || n.type)) : ''); }
  if (sel.length === 1 && !isGroup(sel[0]) && !sel[0].locked && !APP.drag?.marquee) {
    const n = sel[0], mode = WT[n.type]?.resize || 'none', hs = mode === 'free' ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] : mode === 'aspect' ? ['nw', 'ne', 'se', 'sw'] : mode === 'x' ? ['e', 'w'] : [];
    for (const h of hs) { const fx = h.includes('w') ? 0 : h.includes('e') ? 1 : .5, fy = h.includes('n') ? 0 : h.includes('s') ? 1 : .5, [sx, sy] = toScreen(n.x + n.w * fx, n.y + n.h * fy);
      parts.push(`<div class="handle" data-h="${h}" style="left:${sx}px;top:${sy}px;cursor:${h}-resize"></div>`); }
  }
  for (const g of APP.guides) { if (g.x !== undefined) { const [sx] = toScreen(g.x, 0); parts.push(`<div class="guide" style="left:${sx}px;top:0;width:1px;height:100%"></div>`); } else { const [, sy] = toScreen(0, g.y); parts.push(`<div class="guide" style="left:0;top:${sy}px;height:1px;width:100%"></div>`); } }
  if (APP.drag?.marquee) { const m = APP.drag.marquee; parts.push(`<div class="marquee" style="left:${Math.min(m[0], m[2])}px;top:${Math.min(m[1], m[3])}px;width:${Math.abs(m[2] - m[0])}px;height:${Math.abs(m[3] - m[1])}px"></div>`); }
  ov.innerHTML = parts.join('');
  $('empty-hint').hidden = APP.doc.nodes.length > 0;
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ---------------------------------------------------------------- hit testing */
function hitWidget(px, py) {
  const tol = 4 / APP.view.zoom, list = drawList(APP.doc);
  for (let i = list.length - 1; i >= 0; i--) {
    const { w, group } = list[i];
    if (w.locked || group?.locked) continue;
    if (px >= w.x - tol && px <= w.x + w.w + tol && py >= w.y - tol && py <= w.y + w.h + tol) return { w, group };
  }
  return null;
}
/* what a click picks: the top-level node, or the child when editing inside its group */
function pickNode(hit) {
  if (!hit) return null;
  if (hit.group && APP.scope === hit.group.id) return hit.w;
  return hit.group || hit.w;
}

/* ---------------------------------------------------------------- snapping */
function snapLines(exclude) {
  const xs = [0, APP.doc.panel.w / 2, APP.doc.panel.w], ys = [0, APP.doc.panel.h / 2, APP.doc.panel.h];
  for (const n of scopeList()) { if (exclude.has(n.id) || n.hidden) continue; const [x, y, w, h] = nodeBox(n); xs.push(x, x + w / 2, x + w); ys.push(y, y + h / 2, y + h); }
  return { xs, ys };
}
function snapDelta(box, dx, dy, lines, free) {
  APP.guides = [];
  if (free || !APP.snap) return [dx, dy];
  const thr = 6 / APP.view.zoom;
  const best = (vals, cands) => { let b = null; for (const v of vals) for (const c of cands) { const d = c - v; if (Math.abs(d) <= thr && (!b || Math.abs(d) < Math.abs(b.d))) b = { d, c }; } return b; };
  const bx = best([box[0] + dx, box[0] + box[2] / 2 + dx, box[0] + box[2] + dx], lines.xs), by = best([box[1] + dy, box[1] + box[3] / 2 + dy, box[1] + box[3] + dy], lines.ys);
  if (bx) { dx += bx.d; APP.guides.push({ x: bx.c }); } else if (APP.grid) dx = Math.round((box[0] + dx) / APP.grid) * APP.grid - box[0];
  if (by) { dy += by.d; APP.guides.push({ y: by.c }); } else if (APP.grid) dy = Math.round((box[1] + dy) / APP.grid) * APP.grid - box[1];
  return [dx, dy];
}

/* ---------------------------------------------------------------- pointer gestures on the stage */
function stagePointerDown(e) {
  const r = STAGE.wrap.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top, [px, py] = toPanel(cx, cy);
  STAGE.canvas.focus({ preventScroll: true });
  if (e.button === 1 || (e.button === 0 && STAGE.space)) { APP.drag = { mode: 'pan', cx, cy, panX: APP.view.panX, panY: APP.view.panY }; capture(e); return; }
  if (e.button !== 0) return;
  const handle = e.target.closest?.('.handle');
  if (handle) {
    const n = selNodes()[0];
    APP.drag = { mode: 'resize', h: handle.dataset.h, cx, cy, n, orig: JSON.parse(JSON.stringify(n)), before: snapshot(), lines: snapLines(new Set([n.id])) };
    capture(e); return;
  }
  const hit = hitWidget(px, py);
  if (APP.scope && (!hit || hit.group?.id !== APP.scope)) APP.scope = null;
  const node = pickNode(hit);
  if (!node) {
    if (!e.shiftKey) select([]);
    APP.drag = { mode: 'marquee', cx, cy, add: e.shiftKey, marquee: [cx, cy, cx, cy] }; capture(e); requestDraw(); return;
  }
  if (e.shiftKey) { select([node.id], true); return; }
  if (!APP.sel.has(node.id)) select([node.id]);
  const nodes = selNodes().filter(n => !n.locked);
  if (!nodes.length) return;
  APP.drag = { mode: 'move', cx, cy, nodes, box: unionBox(nodes), moved: false, before: snapshot(), lines: snapLines(new Set(nodes.map(n => n.id))),
               orig: nodes.map(n => isGroup(n) ? n.children.map(c => [c, c.x, c.y]) : [[n, n.x, n.y]]).flat() };
  capture(e);
}
function capture(e) { try { STAGE.wrap.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
function stagePointerMove(e) {
  const r = STAGE.wrap.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top, d = APP.drag;
  if (!d) {
    const n = pickNode(hitWidget(...toPanel(cx, cy)));
    const id = n ? n.id : null; if (id !== APP.hover) { APP.hover = id; requestDraw(); }
    STAGE.canvas.style.cursor = STAGE.space ? 'grab' : n ? 'move' : 'default';
    return;
  }
  const z = APP.view.zoom;
  if (d.mode === 'pan') { Object.assign(APP.view, { panX: d.panX + cx - d.cx, panY: d.panY + cy - d.cy, fit: false }); requestDraw(); return; }
  if (d.mode === 'marquee') { d.marquee[2] = cx; d.marquee[3] = cy; requestDraw(); return; }
  if (d.mode === 'move') {
    if (!d.moved && Math.hypot(cx - d.cx, cy - d.cy) < 3) return;
    d.moved = true;
    let dx = (cx - d.cx) / z, dy = (cy - d.cy) / z;
    [dx, dy] = snapDelta(d.box, dx, dy, d.lines, e.altKey);
    for (const [w, x, y] of d.orig) { w.x = Math.round((x + dx) * 100) / 100; w.y = Math.round((y + dy) * 100) / 100; }
    requestDraw(); return;
  }
  if (d.mode === 'resize') resizeTo(d, (cx - d.cx) / z, (cy - d.cy) / z, e.altKey);
}
function stagePointerUp(e) {
  const d = APP.drag; APP.drag = null; APP.guides = [];
  if (!d) return;
  if (d.mode === 'marquee') {
    const [ax, ay] = toPanel(Math.min(d.marquee[0], d.marquee[2]), Math.min(d.marquee[1], d.marquee[3])), [bx, by] = toPanel(Math.max(d.marquee[0], d.marquee[2]), Math.max(d.marquee[1], d.marquee[3]));
    if (bx - ax > 2 / APP.view.zoom || by - ay > 2 / APP.view.zoom) {
      const ids = scopeList().filter(n => !n.locked && !n.hidden).filter(n => { const [x, y, w, h] = nodeBox(n); return x < bx && x + w > ax && y < by && y + h > ay; }).map(n => n.id);
      select(ids, d.add);
    }
    requestDraw(); return;
  }
  if ((d.mode === 'move' && d.moved) || d.mode === 'resize') { pushHistory(d.before); changed(); }
  requestDraw();
}
function resizeTo(d, dx, dy, free) {
  const n = d.n, o = d.orig, def = WT[n.type], h = d.h;
  if (def.resize === 'free' || def.resize === 'x') {
    let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
    if (h.includes('w')) x0 += dx; if (h.includes('e')) x1 += dx; if (def.resize === 'free') { if (h.includes('n')) y0 += dy; if (h.includes('s')) y1 += dy; }
    if (!free && APP.snap) { const s = v => { const c = d.lines.xs.find(c => Math.abs(c - v) <= 6 / APP.view.zoom); return c ?? Math.round(v / APP.grid) * APP.grid; };
      const t = v => { const c = d.lines.ys.find(c => Math.abs(c - v) <= 6 / APP.view.zoom); return c ?? Math.round(v / APP.grid) * APP.grid; };
      if (h.includes('w')) x0 = s(x0); if (h.includes('e')) x1 = s(x1); if (def.resize === 'free') { if (h.includes('n')) y0 = t(y0); if (h.includes('s')) y1 = t(y1); } }
    n.x = Math.min(x0, x1 - 2); n.w = Math.max(2, Math.abs(x1 - x0)); n.y = Math.min(y0, y1 - 1); n.h = Math.max(1, Math.abs(y1 - y0));
    if (def.resize === 'x') { n.y = o.y; n.h = o.h; if (def.onResize) def.onResize(n.p, n); if (def.measure) { const m = def.measure(n.p, APP.env, n); n.h = m.h; n.w = m.w; } }
  } else if (def.resize === 'aspect') {
    const ax = h.includes('w') ? o.x + o.w : o.x, ay = h.includes('n') ? o.y + o.h : o.y;
    const nw = Math.abs((h.includes('w') ? -dx : dx) + o.w), nh = Math.abs((h.includes('n') ? -dy : dy) + o.h);
    const f = Math.max(.05, Math.max(nw / o.w, nh / o.h));
    n.p = JSON.parse(JSON.stringify(o.p)); scaleProps(n.type, n.p, f);
    const m = def.measure(n.p, APP.env, n); n.w = m.w; n.h = m.h;
    n.x = h.includes('w') ? ax - m.w : ax; n.y = h.includes('n') ? ay - m.h : ay;
  }
  requestDraw(); UI.refreshInspectorBox();
}
function stageWheel(e) {
  e.preventDefault();
  const r = STAGE.wrap.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * .002), e.clientX - r.left, e.clientY - r.top);
  else { Object.assign(APP.view, { panX: APP.view.panX - e.deltaX, panY: APP.view.panY - e.deltaY, fit: false }); requestDraw(); }
}
function stageDblClick(e) {
  const r = STAGE.wrap.getBoundingClientRect(), hit = hitWidget(...toPanel(e.clientX - r.left, e.clientY - r.top));
  if (hit?.group && APP.scope !== hit.group.id) { APP.scope = hit.group.id; select([hit.w.id]); }
}

/* ---------------------------------------------------------------- commands */
/* add widgets centred on (x, y); several become a group */
function insertWidgets(ws, x, y, name) {
  if (!ws.length) return;
  const b = unionBox(ws), dx = x - (b[0] + b[2] / 2), dy = y - (b[1] + b[3] / 2);
  const P = APP.doc.panel, cx = Math.max(-b[0], Math.min(P.w - b[0] - b[2], dx)), cy = Math.max(-b[1], Math.min(P.h - b[1] - b[3], dy));
  const sx = b[2] > P.w ? dx : cx, sy = b[3] > P.h ? dy : cy;
  for (const w of ws) { w.x = Math.round(w.x + sx); w.y = Math.round(w.y + sy); }
  let node = ws.length > 1 ? { id: nid('g'), type: 'group', name: name || 'Group', children: ws } : ws[0];
  edit(doc => {
    const g = APP.scope && findNode(doc, APP.scope)?.node;
    if (g && !isGroup(node)) g.children.push(node);
    else if (g) g.children.push(...node.children), node = g;
    else doc.nodes.push(node);
  });
  select([node.id]);
}
function removeSel() {
  if (!APP.sel.size) return;
  edit(doc => {
    for (const id of APP.sel) { const f = findNode(doc, id); if (f) f.list.splice(f.list.indexOf(f.node), 1); }
    doc.nodes = doc.nodes.filter(n => !isGroup(n) || n.children.length);
  });
  APP.sel.clear(); UI.refresh();
}
function duplicateSel(offset = 24) {
  const nodes = selNodes(); if (!nodes.length) return;
  const ids = [];
  edit(doc => { for (const n of nodes) { const f = findNode(doc, n.id), c = cloneNode(n); const mv = w => { w.x += offset; w.y += offset; };
    isGroup(c) ? c.children.forEach(mv) : mv(c); f.list.splice(f.list.indexOf(f.node) + 1, 0, c); ids.push(c.id); } });
  select(ids);
}
function copySel() { const n = selNodes(); if (n.length) APP.clip = JSON.stringify(n); }
function pasteClip() {
  if (!APP.clip) return false;
  const nodes = JSON.parse(APP.clip).map(cloneNode), ids = [];
  edit(doc => { for (const c of nodes) { const mv = w => { w.x += 24; w.y += 24; }; isGroup(c) ? c.children.forEach(mv) : mv(c);
    const g = APP.scope && findNode(doc, APP.scope)?.node; (g && !isGroup(c) ? g.children : doc.nodes).push(c); ids.push(c.id); } });
  APP.clip = JSON.stringify(nodes); select(ids); return true;
}
function nudge(dx, dy) {
  const nodes = selNodes().filter(n => !n.locked); if (!nodes.length) return;
  edit(() => { for (const n of nodes) (isGroup(n) ? n.children : [n]).forEach(w => { w.x += dx; w.y += dy; }); }, 'nudge');
}
function zorder(dir) {
  const nodes = selNodes(); if (!nodes.length) return;
  edit(doc => {
    for (const n of (dir > 0 ? [...nodes].reverse() : nodes)) {
      const f = findNode(doc, n.id), L = f.list, i = L.indexOf(f.node);
      L.splice(i, 1);
      const j = dir === 2 ? L.length : dir === -2 ? 0 : Math.max(0, Math.min(L.length, i + dir));
      L.splice(j, 0, f.node);
    }
  });
}
function groupSel() {
  const nodes = selNodes().filter(n => !findNode(APP.doc, n.id).parent);
  if (nodes.length < 2) return;
  const g = { id: nid('g'), type: 'group', name: 'Group', children: [] };
  edit(doc => {
    let at = -1;
    for (const n of nodes) { const i = doc.nodes.indexOf(n); at = Math.max(at, i); }
    for (const n of doc.nodes) if (nodes.includes(n)) isGroup(n) ? g.children.push(...n.children) : g.children.push(n);
    const keep = doc.nodes.filter((n, i) => !nodes.includes(n) || i === at);
    doc.nodes = keep.map(n => nodes.includes(n) ? g : n);
  });
  select([g.id]);
}
function ungroupSel() {
  const groups = selNodes().filter(isGroup); if (!groups.length) return;
  const ids = [];
  edit(doc => { for (const g of groups) { const i = doc.nodes.indexOf(g); doc.nodes.splice(i, 1, ...g.children); ids.push(...g.children.map(c => c.id)); } });
  APP.scope = null; select(ids);
}
function detach(node) {
  const def = WT[node.type]; if (!def?.expand) return;
  const kids = expandComposite(node, APP.env).filter(c => c.type !== '_div').map(c => ({ ...c, id: nid(), x: c.x + node.x, y: c.y + node.y }));
  let ids = [];
  edit(doc => {
    const f = findNode(doc, node.id);
    if (f.parent) { f.list.splice(f.index, 1, ...kids); ids = kids.map(k => k.id); }
    else { const g = { id: nid('g'), type: 'group', name: node.name || def.label, children: kids }; f.list.splice(f.index, 1, g); ids = [g.id]; }
  });
  select(ids);
}
function align(how) {
  const nodes = selNodes(); if (nodes.length < 2) return;
  const B = unionBox(nodes);
  edit(() => {
    const boxes = nodes.map(n => [n, nodeBox(n)]);
    if (how === 'dh' || how === 'dv') {
      const ax = how === 'dh' ? 0 : 1; boxes.sort((a, b) => a[1][ax] - b[1][ax]);
      const total = boxes.reduce((s, [, b]) => s + b[ax + 2], 0), gap = (B[ax + 2] - total) / (boxes.length - 1); let pos = B[ax];
      for (const [n, b] of boxes) { const d = pos - b[ax]; (isGroup(n) ? n.children : [n]).forEach(w => ax ? w.y += d : w.x += d); pos += b[ax + 2] + gap; }
      return;
    }
    for (const [n, b] of boxes) {
      let dx = 0, dy = 0;
      if (how === 'l') dx = B[0] - b[0]; if (how === 'c') dx = B[0] + B[2] / 2 - (b[0] + b[2] / 2); if (how === 'r') dx = B[0] + B[2] - (b[0] + b[2]);
      if (how === 't') dy = B[1] - b[1]; if (how === 'm') dy = B[1] + B[3] / 2 - (b[1] + b[3] / 2); if (how === 'b') dy = B[1] + B[3] - (b[1] + b[3]);
      (isGroup(n) ? n.children : [n]).forEach(w => { w.x += dx; w.y += dy; });
    }
  });
}
/* sensors used by the selection, and replacing one everywhere in it */
function sensorsOf(ws) { const m = new Map(); for (const w of ws) for (const id of WT[w.type]?.sensors(w.p) || []) if (id) m.set(id, (m.get(id) || 0) + 1); return m; }
function replaceSensor(ws, from, to) {
  to = normId(String(to || '').trim().toUpperCase());
  if (!/^[A-Z][A-Z0-9-]{0,40}$/.test(to) || from === to) return;
  const ids = new Set(ws.map(w => w.id));
  edit(doc => eachWidget(doc, w => { if (ids.has(w.id) && swapSensor(w, from, to)) remeasure(w, APP.env); }));
}

/* ---------------------------------------------------------------- keyboard */
function keyDown(e) {
  const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && t.type !== 'checkbox' && t.type !== 'range';
  if (document.querySelector('dialog[open]')) return;
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  if (k === ' ' && !typing) { STAGE.space = true; if (e.target === document.body || e.target === STAGE.canvas) e.preventDefault(); return; }
  if (typing) { if (mod && (k === 'z' || k === 'y')) return; return; }
  if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k.toLowerCase() === 'c') { copySel(); return; }
  if (mod && k.toLowerCase() === 'x') { copySel(); removeSel(); return; }
  if (mod && k.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
  if (mod && k.toLowerCase() === 'a') { e.preventDefault(); select(scopeList().filter(n => !n.locked && !n.hidden).map(n => n.id)); return; }
  if (mod && k.toLowerCase() === 'g') { e.preventDefault(); e.shiftKey ? ungroupSel() : groupSel(); return; }
  if (mod && k.toLowerCase() === 's') { e.preventDefault(); saveDesignFile(); return; }
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); removeSel(); return; }
  if (k === 'Escape') { if (APP.scope) { const g = APP.scope; APP.scope = null; select([g]); } else select([]); return; }
  if (k === 'Enter') { const n = selNodes()[0]; if (n && isGroup(n) && n.children[0]) { APP.scope = n.id; select([n.children[0].id]); } return; }
  if (k === ']' || k === '[') { zorder((k === ']' ? 1 : -1) * (mod ? 2 : 1)); return; }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
  if (arrows && APP.sel.size) { e.preventDefault(); const s = e.shiftKey ? 10 : 1; nudge(arrows[0] * s, arrows[1] * s); }
  if (!mod && (k === '+' || k === '=')) { const r = STAGE.wrap.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); }
  if (!mod && (k === '-' || k === '_')) { const r = STAGE.wrap.getBoundingClientRect(); zoomAt(.8, r.width / 2, r.height / 2); }
  if (!mod && k === '0') { APP.view.fit = true; requestDraw(); }
}

function initStage() {
  STAGE.canvas = $('stage'); STAGE.ctx = STAGE.canvas.getContext('2d'); STAGE.wrap = $('stage-wrap');
  on(STAGE.wrap, 'pointerdown', stagePointerDown);
  on(STAGE.wrap, 'pointermove', stagePointerMove);
  on(STAGE.wrap, 'pointerup', stagePointerUp); on(STAGE.wrap, 'pointercancel', stagePointerUp);
  on(STAGE.wrap, 'pointerleave', () => { if (!APP.drag && APP.hover) { APP.hover = null; requestDraw(); } });
  on(STAGE.wrap, 'wheel', stageWheel, { passive: false });
  on(STAGE.wrap, 'dblclick', stageDblClick);
  on(document, 'keydown', keyDown);
  on(document, 'keyup', e => { if (e.key === ' ') STAGE.space = false; });
  new ResizeObserver(() => requestDraw()).observe(STAGE.wrap);
}
