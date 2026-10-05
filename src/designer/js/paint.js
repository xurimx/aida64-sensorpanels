/* ================================================================ painter: what a widget draws
   emit(P, p, box) records, in widget-local coordinates, an ordered list of
   - static runs: canvas drawing that ends up in the background PNG (or its own IMG when it must sit above a reading)
   - items: AIDA64 SIMPLE / GAUGE / GRAPH / LBL / IMG
   Gauge frames go to a shared registry, named by content, and are drawn only when needed. */
const STATIC_FONTS = { sel: '"Selawik Local", "Segoe UI", sans-serif', bsc: '"Barlow SC Local", sans-serif' };
const STATIC_FONT_NAMES = [['sel', 'Selawik (Segoe UI look)'], ['bsc', 'Barlow Semi Condensed']];
const WGT = { light: 300, reg: 400, med: 500, semi: 600, bold: 700 };
const MEASURE = document.createElement('canvas').getContext('2d');
const { rgb: cssRgb, mk, rr, poly } = SP.core;

const fontStr = (px, weight, family) => `${WGT[weight] || weight || 400} ${px}px ${STATIC_FONTS[family] || STATIC_FONTS.sel}`;
/* per-character advance plus letter spacing (em), exactly like the builder's width()/tl() */
function textWidth(s, px, weight, family, sp = 0) {
  MEASURE.font = fontStr(px, weight, family); let t = 0, n = 0;
  for (const ch of s) { t += MEASURE.measureText(ch).width; n++; }
  return t + sp * px * Math.max(0, n - 1);
}
function fillSpaced(ctx, x, yb, s, px, weight, family, col, sp = 0) {
  ctx.font = fontStr(px, weight, family); ctx.fillStyle = cssRgb(col); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  let cx = x; for (const ch of s) { ctx.fillText(ch, cx, yb); cx += ctx.measureText(ch).width + sp * px; }
  return cx - sp * px;
}
/* ascent/descent of the static fonts, used to place a text box around its baseline */
const STATIC_METRICS = { sel: { asc: 0.94, desc: 0.24 }, bsc: { asc: 0.96, desc: 0.24 } };
/* ink box of a string relative to its baseline origin (for Pillow-style ink-centred text) */
function inkBox(s, px, weight, family) {
  MEASURE.font = fontStr(px, weight, family); const m = MEASURE.measureText(s);
  return { l: -m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, t: -m.actualBoundingBoxAscent, b: m.actualBoundingBoxDescent };
}

/* ---- shared gauge frames: name -> { w, h, draw(ctx), canvas } ---- */
const FRAMES = new Map();
const cyrb = s => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36); };
function frameCanvas(name) {
  const f = FRAMES.get(name); if (!f) return null;
  if (!f.canvas) { f.canvas = mk(f.w, f.h); f.draw(f.canvas.getContext('2d')); }
  return f.canvas;
}

/* ---- gauge stacks. AIDA64 custom gauges have 16 states: state = floor((v - min) / (max - min) * 15) ----
   cumulative (bars, rings): each gauge lights its own segments. chunk must divide 15 so segment edges are exact.
   exclusive (needles, pointers): positions 0..n; exactly one gauge shows the needle, the others show a blank frame. */
function planCumulative(segs) {
  const chunk = [15, 5, 3, 1].find(c => segs % c === 0);
  return Array.from({ length: segs / chunk }, (_, g) => ({ first: g * chunk, count: chunk, lit: s => Math.floor(s * chunk / 15) }));
}
function planExclusive(n, overrange = true) {
  const G = Math.max(1, Math.ceil(n / 14)), out = [];
  for (let g = 0; g < G; g++) {
    const states = [];
    for (let s = 0; s < 16; s++) {
      const p = 14 * g + s;
      if (g > 0 && s === 0) states.push(null);                 // the previous gauge shows this position
      else if (p <= n) states.push(s === 15 ? null : p);       // s 15 here belongs to the next gauge's state 1
      else states.push(overrange ? 'over' : n);
    }
    out.push({ base: 14 * g, states });
  }
  return out;
}

/* ring geometry, as in the builder: segments of SPAN degrees every PITCH degrees from START */
function arcPts(cx, cy, r0, r1, a0, a1) {
  const n = Math.max(6, Math.floor((a1 - a0) * 3)), pts = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push([cx + r1 * Math.sin(a), cy - r1 * Math.cos(a)]); }
  for (let i = 0; i <= n; i++) { const a = (a1 - (a1 - a0) * i / n) * Math.PI / 180; pts.push([cx + r0 * Math.sin(a), cy - r0 * Math.cos(a)]); }
  return pts;
}

function makePainter(env) {
  const ops = [];
  let run = null;
  const grow = (b, x0, y0, x1, y1) => { b[0] = Math.min(b[0], x0); b[1] = Math.min(b[1], y0); b[2] = Math.max(b[2], x1); b[3] = Math.max(b[3], y1); };
  const P = {
    env, ops,
    col: v => colorOf(v, env.doc),
    /* static drawing: bounds [x0, y0, x1, y1] in local px */
    paint(b, fn) {
      if (!run) { run = { t: 'static', b: [Infinity, Infinity, -Infinity, -Infinity], fns: [] }; ops.push(run); }
      grow(run.b, b[0], b[1], b[2], b[3]); run.fns.push(fn);
    },
    breakRun() { run = null; },
    rect(x, y, w, h, c) { const col = P.col(c); P.paint([x, y, x + w, y + h], ctx => { ctx.fillStyle = cssRgb(col); ctx.fillRect(x, y, w, h); }); },
    rrect(x, y, w, h, r, c) { const col = P.col(c); P.paint([x, y, x + w, y + h], ctx => { ctx.fillStyle = cssRgb(col); rr(ctx, x, y, w, h, r); }); },
    stroke(x, y, w, h, r, lw, c) { const col = P.col(c); P.paint([x - lw, y - lw, x + w + lw, y + h + lw], ctx => { ctx.strokeStyle = cssRgb(col); ctx.lineWidth = lw; ctx.beginPath(); ctx.roundRect(x + lw / 2, y + lw / 2, w - lw, h - lw, r); ctx.stroke(); }); },
    poly(pts, c) {
      const col = P.col(c); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      P.paint([x0 - 1, y0 - 1, x1 + 1, y1 + 1], ctx => { ctx.fillStyle = cssRgb(col); poly(ctx, pts); });
    },
    /* Pillow-style outlined circle: the outline sits inside radius r */
    circle(cx, cy, r, lw, c) { const col = P.col(c); P.paint([cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1], ctx => { ctx.strokeStyle = cssRgb(col); ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, r - lw / 2), 0, Math.PI * 2); ctx.stroke(); }); },
    /* text on a baseline; align l | c | r; returns the end x (like the builder's tl) */
    text(x, yb, s, o) {
      const px = o.px, w8 = o.weight || 'reg', fam = o.family || 'sel', sp = o.spacing || 0, col = P.col(o.col || '@hi');
      if (!s) return x;
      const w = textWidth(s, px, w8, fam, sp), x0 = o.align === 'r' ? x - w : o.align === 'c' ? x - w / 2 : x;
      const m = STATIC_METRICS[fam] || STATIC_METRICS.sel;
      P.paint([x0 - px * .1, yb - px * (m.asc + .1), x0 + w + px * .1, yb + px * (m.desc + .1)], ctx => fillSpaced(ctx, x0, yb, s, px, w8, fam, col, sp));
      return x0 + w;
    },
    /* Pillow text_center(): centre the visible ink (no spacing) or the advance width (spacing) on (x, y) */
    textInk(x, y, s, o) {
      const px = o.px, w8 = o.weight || 'reg', fam = o.family || 'bsc', sp = o.spacing || 0, col = P.col(o.col);
      const ib = inkBox(s, px, w8, fam), by = y - (ib.t + ib.b) / 2;
      const x0 = sp ? x - textWidth(s, px, w8, fam, sp) / 2 : x - ib.l - (ib.r - ib.l) / 2;
      P.paint([x0 - px * .2, y - px, x0 + (ib.r - ib.l) + px * .2 + sp * px * s.length, y + px], ctx => fillSpaced(ctx, x0, by, s, px, w8, fam, col, sp));
    },
    custom(b, fn) { P.paint(b, fn); },
    /* live items; box = [x, y, w, h] used for the flatten overlap test */
    item(it, box) { run = null; ops.push({ t: 'item', it, box }); return it; },
    frames(prefix, keyParts, n, w, h, draw) {
      const key = cyrb(JSON.stringify(keyParts)), names = [];
      for (let i = 0; i < n; i++) {
        const name = `${prefix}_${key}_${String(i).padStart(2, '0')}.png`;
        if (!FRAMES.has(name)) FRAMES.set(name, { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)), draw: c => draw(c, i) });
        names.push(name);
      }
      return names;
    },
  };
  return P;
}
