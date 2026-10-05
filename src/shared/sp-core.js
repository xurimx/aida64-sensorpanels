/* SP.core: small helpers shared by the builder and the designer (colours, numbers, cp1252, canvas, fonts).
   Shared files are namespaced IIFEs because the pages that inline them declare their own top-level names. */
window.SP = window.SP || {};
SP.core = (() => {
  'use strict';
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgbToHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const bgr = c => c[0] + (c[1] << 8) + (c[2] << 16);                           // AIDA64 stores colours as BGR decimal
  const fromBgr = n => { n = Number(n); return Number.isFinite(n) && n >= 0 ? [n & 255, (n >> 8) & 255, (n >> 16) & 255] : null; };
  const fmtNum = v => { const s = Number(v).toFixed(6).replace(/0+$/, '').replace(/\.$/, ''); return s === '-0' || s === '' ? '0' : s; };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* Windows-1252. AIDA64 files are single-byte ANSI: ° is 0xB0, € is 0x80. Anything else becomes '?'. */
  const HI = [0x20AC, 0, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017D, 0,
              0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0, 0x017E, 0x0178];
  const ENC = new Map(HI.map((u, i) => [u, 0x80 + i]).filter(([u]) => u));
  function enc1252(text) {
    const out = new Uint8Array(text.length); let n = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 0x80 || (c >= 0xA0 && c < 0x100)) out[n++] = c;
      else { out[n++] = ENC.get(c) ?? 63; if (c >= 0xD800 && c < 0xDC00) i++; }       // a surrogate pair is one '?'
    }
    return n === out.length ? out : out.slice(0, n);
  }
  const dec1252 = bytes => new TextDecoder('windows-1252').decode(bytes);
  /* text that goes between <TAG>…</TAG>: no markup characters, no '|' (frame list separator), single line */
  const clean = s => String(s ?? '').replace(/[<>|\r\n]/g, '');

  /* canvas */
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
  }
  function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); }

  /* custom gauge state: floor((v - min) / (max - min) * (n - 1)), clamped (16 states -> 0..15) */
  const stateOf = (v, min, max, n = 16) => { if (!(max > min)) return 0; return clamp(Math.floor((v - min) / (max - min) * (n - 1) + 1e-9), 0, n - 1); };

  /* fonts: GDI metrics from fontmetrics.js; AIDA64 sizes are points, GDI rounds the em to whole pixels */
  const ptToPx = pt => pt * 96 / 72;
  const gdiPx = pt => Math.max(1, Math.round(pt * 96 / 72));
  const FALLBACK = { sel: '"Selawik Local", sans-serif', bsc: '"Barlow SC Local", sans-serif', mono: 'Consolas, "Cascadia Mono", monospace', sans: 'Arial, sans-serif' };
  const WEIGHT_WORDS = /\s+(Light|SemiLight|Semilight|Semibold|SemiBold|Black|Bold|Regular)$/i;
  function fontInfo(name) {
    name = String(name || 'Segoe UI').trim();
    const m = (SP.fontMetrics || {})[name] || Object.entries(SP.fontMetrics || {}).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
    const base = name.replace(WEIGHT_WORDS, '');
    if (m) return { name, base, asc: m.asc, desc: m.desc, digit: m.digit, weight: m.weight, fb: FALLBACK[m.fb] || FALLBACK.sans, known: true };
    const light = /light/i.test(name);
    return { name, base, asc: 1.0, desc: 0.25, digit: 0.55, weight: light ? 300 : /semibold|bold/i.test(name) ? 600 : 400, fb: FALLBACK.sans, known: false };
  }
  /* CSS font for a Windows font name: the real font first (present when the browser runs on Windows), then a stand-in */
  function fontCss(name, px, o = {}) {
    const f = fontInfo(name);
    const w = o.bold ? 700 : f.weight;
    return `${o.italic ? 'italic ' : ''}${w} ${px}px "${f.base}", ${f.fb}`;
  }

  return { rgb, hexToRgb, rgbToHex, bgr, fromBgr, fmtNum, clamp, enc1252, dec1252, clean, mk, rr, poly, stateOf, ptToPx, gdiPx, fontInfo, fontCss };
})();
