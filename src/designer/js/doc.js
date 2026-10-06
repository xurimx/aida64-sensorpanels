/* ================================================================ design document
   { kind, v, name, panel:{w,h}, warm, hot, tokens, export:{format, dpi}, gen, nodes, assets }
   nodes: one level of groups. A node is a widget {id,type,x,y,w,h,name?,locked?,hidden?,p} or a group
   {id,type:'group',name,locked?,hidden?,children:[widget…]}. Positions are panel pixels. Colours are '#rrggbb' or '@token'.
   Hardware is stored as explicit values (never "auto"), so a design looks the same on every PC. */
const DOC_KIND = 'aida64-sensorpanel-design', DOC_V = 1;
const DOC_LIMITS = { nodes: 5000, json: 2e6 };
const TOKENS_MODERN = { hi: '#e9edf2', title: '#b2bac4', mid: '#808993', lo: '#545c65', hair: '#1c1f24', grid: '#131518', track: '#181b1f',
                        neu: '#a6b2c0', amber: '#f2b740', red: '#ff5d52', fps: '#cfd6de', cpu: '#3dd9c5', gpu: '#a08cff' };
const TOKENS_CLASSIC = { bezel: '#282828', bezel2: '#141414', minor: '#5c5850', cmid: '#888276', major: '#c4bcaa', num: '#bab2a0', cred: '#c44e3a',
                         redband: '#682015', redminor: '#963c2d', ctitle: '#8c8578', unit: '#6c665c', window: '#2e2e2e', chair: '#222222', meter: '#4a4640',
                         mnum: '#968f80', needle: '#f28036', tail: '#3e3832', hubfill: '#0a0a0a', hubring: '#3e3e3e', hubdot: '#282828',
                         live: '#ece4d2', livesm: '#d6cebc' };
const TOKEN_NAMES = { hi: 'Bright text', title: 'Titles', mid: 'Mid text', lo: 'Dim text', hair: 'Hairlines', grid: 'Graph grid', track: 'Gauge track',
                      neu: 'Neutral', amber: 'Warm', red: 'Hot', fps: 'Frame rate', cpu: 'CPU accent', gpu: 'GPU accent', needle: 'Needles',
                      live: 'Dial readings', livesm: 'Small readings', major: 'Major ticks', num: 'Scale numbers', redband: 'Red zone',
                      bezel: 'Dial bezel', bezel2: 'Inner bezel', minor: 'Small ticks', cmid: 'Mid ticks', cred: 'Red ticks', redminor: 'Red small ticks',
                      ctitle: 'Dial titles', unit: 'Dial units', window: 'Readout window', chair: 'Meter hairline', meter: 'Meter base', mnum: 'Meter numbers',
                      tail: 'Needle tails', hubfill: 'Hub fill', hubring: 'Hub ring', hubdot: 'Hub dot' };

let _nid = 0;
const nid = (p = 'n') => p + (++_nid).toString(36) + Math.random().toString(36).slice(2, 6);

function newDoc(o = {}) {
  return { kind: DOC_KIND, v: DOC_V, name: o.name || 'My panel', panel: { w: o.w || 3840, h: o.h || 2160 }, warm: 75, hot: 88,
           tokens: { ...TOKENS_MODERN, ...(o.tokens || {}) }, export: { format: 'sensorpanel', dpi: 100 }, gen: null, nodes: [], assets: {} };
}

/* colours: '#rrggbb' or '@token' -> [r, g, b] */
function colorOf(v, doc) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v[0] === '@') v = doc?.tokens?.[v.slice(1)] || '#ffffff';
  return /^#[0-9a-f]{6}$/i.test(v || '') ? SP.core.hexToRgb(v) : [255, 255, 255];
}

/* ---- tree ---- */
const isGroup = n => n && n.type === 'group';
function eachWidget(doc, fn) { doc.nodes.forEach(n => isGroup(n) ? n.children.forEach(c => fn(c, n)) : fn(n, null)); }
function findNode(doc, id) {
  for (let i = 0; i < doc.nodes.length; i++) {
    const n = doc.nodes[i];
    if (n.id === id) return { node: n, parent: null, list: doc.nodes, index: i };
    if (isGroup(n)) { const j = n.children.findIndex(c => c.id === id); if (j >= 0) return { node: n.children[j], parent: n, list: n.children, index: j }; }
  }
  return null;
}
function nodeBox(n) {
  if (!isGroup(n)) return [n.x, n.y, n.w, n.h];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of n.children) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x + c.w); y1 = Math.max(y1, c.y + c.h); }
  return x0 === Infinity ? [0, 0, 0, 0] : [x0, y0, x1 - x0, y1 - y0];
}
function widgetCount(doc) { let n = 0; eachWidget(doc, () => n++); return n; }
/* deep copy with fresh ids (duplicate, paste, detach) */
function cloneNode(n) {
  const c = JSON.parse(JSON.stringify(n)); c.id = nid();
  if (isGroup(c)) c.children.forEach(k => k.id = nid());
  return c;
}

/* re-measure a widget whose size follows its content (text, values, rings, tables), keeping its anchor */
function remeasure(w, env) {
  const def = WT[w.type]; if (!def?.measure || def.resize === 'free') return;
  const m = def.measure(w.p, env, w);
  if (def.resize === 'x') { w.h = m.h; if (w.type === 'meter') w.w = m.w; return; }
  const a = def.anchor ? def.anchor(w.p) : 'l';
  if (a === 'r') w.x += w.w - m.w; else if (a === 'c') { w.x += (w.w - m.w) / 2; w.y += (w.h - m.h) / 2; }
  w.w = m.w; w.h = m.h;
}
/* point every sensor field of a widget (rows included) that reads `from` at `to` */
function swapSensor(w, from, to) {
  let n = 0;
  const fix = o => { for (const k of Object.keys(o)) { if (o[k] === from && /sensor/i.test(k)) { o[k] = to; n++; } else if (Array.isArray(o[k])) o[k].forEach(r => r && typeof r === 'object' && fix(r)); } };
  fix(w.p); if (n && w.p.slabel) delete w.p.slabel;
  return n;
}

/* ---- sanitize untrusted documents (design files, share links) ---- */
const sStr = (v, max = 200) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').slice(0, max) : '';
const sNum = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const sColor = (v, d) => typeof v === 'string' && (/^#[0-9a-f]{6}$/i.test(v) || /^@[a-z][a-z0-9]{0,15}$/.test(v)) ? v.toLowerCase() : d;
const sSensor = (v, d) => typeof v === 'string' && /^[A-Z][A-Z0-9-]{0,40}$/i.test(v.trim()) ? normId(v.toUpperCase()) : d;

function sanitizeField(f, v, d) {
  switch (f.t) {
    case 'text': case 'font': return v === undefined ? d : sStr(v, f.max || 200);
    case 'num': return sNum(v, f.min ?? -1e9, f.max ?? 1e9, d);
    case 'int': return Math.round(sNum(v, f.min ?? -1e9, f.max ?? 1e9, d));
    case 'pct': return sNum(v, 0, 1, d);
    case 'bool': return typeof v === 'boolean' ? v : d;
    case 'select': return f.opts.some(o => o[0] === v) ? v : d;
    case 'color': return sColor(v, d);
    case 'sensor': return sSensor(v, d);
    case 'asset': return typeof v === 'string' && /^[a-z0-9]{1,40}$/.test(v) ? v : d;
    case 'rows': {
      if (!Array.isArray(v)) return d;
      return v.slice(0, f.maxRows || 32).map(r => Object.fromEntries(f.cols.map(c => [c.k, sanitizeField(c, r?.[c.k], c.d)])));
    }
  }
  return d;
}
const flatFields = fields => fields.flatMap(f => f.section ? flatFields(f.fields) : [f]);

function sanitizeWidget(n, doc) {
  const def = WT[n?.type];
  if (!def) return null;
  const d = def.defaults({ doc }), p = {};
  for (const f of flatFields(def.fields)) p[f.k] = sanitizeField(f, n.p?.[f.k], d[f.k]);
  /* other defaults (scale k, extra colours, imported font settings…) are checked against the type of their default */
  for (const [k, dv] of Object.entries(d)) {
    if (k in p) continue;
    const v = n.p?.[k];
    if (typeof dv === 'number') p[k] = sNum(v, -1e9, 1e9, dv);
    else if (typeof dv === 'boolean') p[k] = typeof v === 'boolean' ? v : dv;
    else if (typeof dv === 'string') p[k] = /^[#@]/.test(dv) ? sColor(v, dv) : v === undefined ? dv : sStr(v, 200);
  }
  if (def.sanitize) def.sanitize(p, n.p || {}, d);
  if (n.p?.aidaHidden === true) p.aidaHidden = true;
  return { id: typeof n.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(n.id) ? n.id : nid(), type: n.type,
           x: sNum(n.x, -20000, 20000, 0), y: sNum(n.y, -20000, 20000, 0), w: sNum(n.w, 0, 20000, def.size?.w || 100), h: sNum(n.h, 0, 20000, def.size?.h || 40),
           ...(n.name ? { name: sStr(n.name, 60) } : {}), ...(n.locked ? { locked: true } : {}), ...(n.hidden ? { hidden: true } : {}), p };
}

function sanitizeDoc(raw) {
  if (!raw || typeof raw !== 'object' || raw.kind !== DOC_KIND) throw new Error('This isn’t a Panel Designer file.');
  if (raw.v > DOC_V) throw new Error('This design was made with a newer version of the designer.');
  const doc = newDoc({ name: sStr(raw.name, 80) || 'My panel', w: Math.round(sNum(raw.panel?.w, 160, 7680, 3840)), h: Math.round(sNum(raw.panel?.h, 160, 4320, 2160)) });
  doc.warm = sNum(raw.warm, 0, 150, 75); doc.hot = sNum(raw.hot, 0, 150, 88);
  doc.tokens = {};
  for (const [k, v] of Object.entries(raw.tokens || {}).slice(0, 64)) if (/^[a-z][a-z0-9]{0,15}$/.test(k) && /^#[0-9a-f]{6}$/i.test(v)) doc.tokens[k] = v.toLowerCase();
  if (!Object.keys(doc.tokens).length) doc.tokens = { ...TOKENS_MODERN };
  doc.export = { format: raw.export?.format === 'spzip' ? 'spzip' : 'sensorpanel', dpi: Math.round(sNum(raw.export?.dpi, 100, 300, 100) / 25) * 25 };
  if (raw.gen && typeof raw.gen === 'object' && typeof raw.gen.theme === 'string' && JSON.stringify(raw.gen).length < 20000) doc.gen = JSON.parse(JSON.stringify(raw.gen));
  let count = 0;
  for (const n of Array.isArray(raw.nodes) ? raw.nodes : []) {
    if (count >= DOC_LIMITS.nodes) break;
    if (isGroup(n)) {
      const kids = (Array.isArray(n.children) ? n.children : []).map(c => count++ < DOC_LIMITS.nodes ? sanitizeWidget(c, doc) : null).filter(Boolean);
      if (kids.length) doc.nodes.push({ id: typeof n.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(n.id) ? n.id : nid('g'), type: 'group', name: sStr(n.name, 60) || 'Group', ...(n.div ? { div: sStr(n.div, 200) } : {}),
                                        ...(n.locked ? { locked: true } : {}), ...(n.hidden ? { hidden: true } : {}), children: kids });
    } else { const w = sanitizeWidget(n, doc); if (w) { doc.nodes.push(w); count++; } }
  }
  for (const [k, a] of Object.entries(raw.assets || {})) {
    if (!/^[a-z0-9]{1,40}$/.test(k) || !a || typeof a !== 'object') continue;
    const meta = { w: sNum(a.w, 0, 20000, 0), h: sNum(a.h, 0, 20000, 0), mime: ['image/png', 'image/jpeg', 'image/webp', 'image/bmp'].includes(a.mime) ? a.mime : 'image/png', name: sStr(a.name, 120) };
    if (typeof a.data === 'string' && /^data:image\/(png|jpeg|webp|bmp);base64,[A-Za-z0-9+/=]+$/.test(a.data) && a.data.length < 24e6) meta.data = a.data;
    doc.assets[k] = meta;
  }
  return doc;
}

/* ---- scale content (themes are laid out on 3840 x 2160; panel size changes can scale or keep positions) ---- */
function scaleProps(type, p, k) {
  const def = WT[type];
  if (def?.scale && def.resize !== 'free' && def.resize !== 'x') return def.scale(p, k);
  if (type === 'bar') { p.gap *= k; if (p.radius >= 0) p.radius *= k; }
  else if (type === 'graph') { p.thick = Math.max(1, Math.round(p.thick * k)); p.step = Math.max(1, Math.round(p.step * k)); p.lineW *= k; }
  else if (type === 'rect') { p.radius *= k; p.lineW *= k; }
  else if (type === 'readout' || type === 'meter') def.scale?.(p, k);
}
function scaleWidget(w, k, ox = 0, oy = 0, env) {
  const def = WT[w.type];
  if (def?.measure && def.resize !== 'free' && def.resize !== 'x') {
    const a = (def.anchor ? def.anchor(w.p) : 'l'), ax = a === 'r' ? w.x + w.w : a === 'c' ? w.x + w.w / 2 : w.x, ay = a === 'c' ? w.y + w.h / 2 : w.y;
    scaleProps(w.type, w.p, k);
    const m = def.measure(w.p, env, w), nx = ox + ax * k, ny = oy + ay * k;
    w.w = m.w; w.h = m.h; w.x = a === 'r' ? nx - m.w : a === 'c' ? nx - m.w / 2 : nx; w.y = a === 'c' ? ny - m.h / 2 : ny;
  } else {
    w.x = ox + w.x * k; w.y = oy + w.y * k; scaleProps(w.type, w.p, k);
    if (def?.measure && def.resize === 'x') { const m = def.measure(w.p, env, { w: w.w * k, h: w.h * k }); w.w = m.w; w.h = m.h; } else { w.w *= k; w.h *= k; }
  }
}
function scaleDocContent(doc, k, ox = 0, oy = 0) {
  if (k === 1 && !ox && !oy) return doc;
  eachWidget(doc, w => scaleWidget(w, k, ox, oy, { doc }));
  return doc;
}
