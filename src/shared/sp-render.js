/* SP.render: draw AIDA64 model items the way AIDA64 does (see sp-writer.js for the item shapes).
   io = { val(sensor) -> number, str(sensor) -> formatted text, hist(sensor) -> array (oldest first),
          img(name) -> CanvasImageSource | null, panel: {w, h} }
   SIMPLE and LBL: ITMY is the top of the GDI text cell. A Custom GAUGE shows frame stateOf(v) and, with SHWVAL,
   prints its value centred on ITMX/ITMY. Native AIDA64 gauges and sensor items are approximated. */
window.SP = window.SP || {};
SP.render = (() => {
  'use strict';
  const { rgb, stateOf, gdiPx, fontInfo, fontCss } = SP.core;

  function text(ctx, s, x, y, it, o = {}) {
    const px = gdiPx(o.pt ?? it.pt), f = fontInfo(o.font ?? it.font);
    ctx.font = fontCss(o.font ?? it.font, px, { bold: o.bold ?? it.bold, italic: o.italic ?? it.italic });
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
    const yb = o.centre ? y - (f.asc + f.desc) * px / 2 + f.asc * px : y + f.asc * px;
    if (o.shadow) { ctx.fillStyle = rgb(o.shadow); ctx.fillText(s, x + (o.sd || 1), yb + (o.sd || 1)); }
    ctx.fillStyle = rgb(o.col ?? it.col); ctx.fillText(s, x, yb);
    return { px, f };
  }

  function graph(ctx, it, io) {
    const x = Math.round(it.x), y = Math.round(it.y), w = Math.round(it.w), h = Math.round(it.h);
    const fl = it.flags || '000';
    if (fl[0] === '1') { ctx.fillStyle = rgb(it.bgCol || [0, 0, 0]); ctx.fillRect(x, y, w, h); }
    if (fl[2] === '1' && it.density > 0) {
      ctx.fillStyle = rgb(it.gridCol || [40, 40, 40]);
      for (let gx = x + w; gx > x; gx -= it.density) ctx.fillRect(gx, y, 1, h);
      for (let gy = y + h; gy > y; gy -= it.density) ctx.fillRect(x, gy, w, 1);
    }
    const hist = io.hist(it.sensor) || [], step = Math.max(1, it.step || 1), n = Math.min(hist.length, Math.ceil(w / step) + 1);
    if (n >= 2) {
      let min = it.lo, max = it.hi;
      if (it.auto) { let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, hist[hist.length - 1 - i]); max = Math.max(m * 1.15, 1); min = 0; }
      const ty = v => y + h - Math.max(0, Math.min(1, (v - min) / (max - min || 1))) * (h - 2);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h + 1); ctx.clip();
      ctx.strokeStyle = ctx.fillStyle = rgb(it.col);
      if (it.type === 'HG') {
        const bw = Math.max(1, it.thick || 1);
        for (let i = 0; i < n; i++) { const yy = ty(hist[hist.length - 1 - i]); ctx.fillRect(x + w - i * step - bw, yy, bw, y + h - yy); }
      } else {
        ctx.beginPath();
        for (let i = 0; i < n; i++) { const px = x + w - i * step, py = ty(hist[hist.length - 1 - i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        if (it.type === 'AG') { ctx.lineTo(x + w - (n - 1) * step, y + h); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill(); }
        else { ctx.lineWidth = it.thick || 1; ctx.lineJoin = 'round'; ctx.stroke(); }
      }
      ctx.restore();
    }
    if (fl[1] === '1') { ctx.strokeStyle = rgb(it.frameCol || [80, 80, 80]); ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1); }
  }

  /* AIDA64's built-in gauge skins aren't available: a plain dial with the value */
  function nativeGauge(ctx, it, io) {
    const r = { S: 48, M: 72, L: 96 }[it.siz] || 48, cx = it.x + r, cy = it.y + r, v = io.val(it.sensor);
    const t = Math.max(0, Math.min(1, (v - it.lo) / ((it.hi - it.lo) || 1)));
    ctx.strokeStyle = 'rgb(70,70,70)'; ctx.lineWidth = Math.max(2, r / 12);
    ctx.beginPath(); ctx.arc(cx, cy, r - ctx.lineWidth, 0.75 * Math.PI, 2.25 * Math.PI); ctx.stroke();
    ctx.strokeStyle = it.typ === 'White' ? 'rgb(235,235,235)' : 'rgb(200,200,200)';
    ctx.beginPath(); ctx.arc(cx, cy, r - ctx.lineWidth, 0.75 * Math.PI, (0.75 + 1.5 * t) * Math.PI); ctx.stroke();
    if (it.showVal) text(ctx, io.str(it.sensor), cx, cy, it, { align: 'center', centre: true });
  }

  /* AIDA64 "sensor item": label, value and unit in one row of width WID, optional bar */
  function sensorItem(ctx, it, io) {
    const t = Object.fromEntries(it.tags), n = k => parseFloat(t[k]) || 0, col = k => SP.core.fromBgr(t[k]) || [255, 255, 255];
    const pt = n('TXTSIZ') || 8, font = t.FNTNAM || 'Segoe UI', wid = n('WID') || 200, uw = t.SHWUNT === '1' ? n('UNTWID') : 0;
    const x = it.x, y = it.y, sid = it.id;
    const bis = k => ({ bold: t[k]?.[0] === '1', italic: t[k]?.[1] === '1' });
    if (t.SHWLBL === '1') text(ctx, t.LBL || '', x, y, { pt, font }, { col: col('LBLCOL'), ...bis('LBLBIS') });
    if (t.SHWVAL === '1') text(ctx, io.str(sid), x + wid - uw, y, { pt, font }, { col: col('VALCOL'), align: 'right', ...bis('VALBIS') });
    if (uw) text(ctx, t.UNT || '', x + wid - uw + 4, y, { pt, font }, { col: col('UNTCOL'), ...bis('UNTBIS') });
    if (t.SHWBAR === '1' && t.BARMAX !== '') {
      const px = gdiPx(pt), bw = n('BARWID') || 100, bh = n('BARHEI') || 10, by = y + px * 1.35, bx = x + n('BARIND');
      const v = io.val(sid), lo = n('BARMIN'), hi = n('BARMAX') || 100, f = Math.max(0, Math.min(1, (v - lo) / ((hi - lo) || 1)));
      const band = v >= n('BARLIM3') && t.BARLIM3 !== '' ? 'BARLIM3' : v >= n('BARLIM2') && t.BARLIM2 !== '' ? 'BARLIM2' : v >= n('BARLIM1') && t.BARLIM1 !== '' ? 'BARLIM1' : 'BARMIN';
      ctx.fillStyle = rgb(col(band + 'BGC')); ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = rgb(col(band + 'FGC')); bw < bh ? ctx.fillRect(bx, by + bh * (1 - f), bw, bh * f) : ctx.fillRect(bx, by, bw * f, bh);
      if (t.BARFS?.[0] === '1') { ctx.strokeStyle = rgb(col('BARFRMCOL')); ctx.lineWidth = 1; ctx.strokeRect(bx + .5, by + .5, bw - 1, bh - 1); }
    }
  }

  function item(ctx, it, io) {
    if (it.hidden) return;
    switch (it.kind) {
      case 'IMG': {
        const im = io.img(it.name); if (!im) return;
        if (it.bg && io.panel) ctx.drawImage(im, 0, 0, io.panel.w, io.panel.h);
        else if (it.rw) ctx.drawImage(im, Math.round(it.x), Math.round(it.y), it.rw, it.rh);
        else ctx.drawImage(im, Math.round(it.x), Math.round(it.y));
        return;
      }
      case 'GAUGE': {
        if ((it.typ || 'Custom') !== 'Custom') return nativeGauge(ctx, it, io);
        const v = io.val(it.sensor), fr = it.frames?.length ? it.frames[stateOf(v, it.lo, it.hi, it.frames.length)] : '';
        if (fr) { const im = io.img(fr); if (im) it.rw ? ctx.drawImage(im, Math.round(it.x), Math.round(it.y), it.rw, it.rh) : ctx.drawImage(im, Math.round(it.x), Math.round(it.y)); }
        if (it.showVal) text(ctx, io.str(it.sensor), it.x, it.y, it, { align: 'center', centre: true });
        return;
      }
      case 'SIMPLE': {
        const s = (it.showLabel ? (it.label ?? it.slabel ?? '') : '') + io.str(it.sensor) + (it.unit || '');
        text(ctx, s, Math.round(it.x), Math.round(it.y), it, { align: it.align === 'r' ? 'right' : 'left' });
        return;
      }
      case 'LBL':
        text(ctx, io.label ? io.label(it.text) : it.text, Math.round(it.x), Math.round(it.y), it, { shadow: it.shadow ? it.shadowCol || [0, 0, 0] : null, sd: it.shadowDis });
        return;
      case 'GRAPH': return graph(ctx, it, io);
      case 'SITEM': return sensorItem(ctx, it, io);
    }
  }

  /* screen box of an item, for hit tests and overlap checks (text boxes are estimates) */
  function box(it, io) {
    const x = it.x, y = it.y;
    switch (it.kind) {
      case 'IMG': { const im = io?.img?.(it.name); return [x, y, it.rw || im?.width || 0, it.rh || im?.height || 0]; }
      case 'GRAPH': return [x, y, it.w, it.h];
      case 'GAUGE': {
        const im = it.frames?.find(Boolean) && io?.img?.(it.frames.find(Boolean));
        if (it.showVal && !im) { const px = gdiPx(it.pt), f = fontInfo(it.font), w = px * f.digit * 4; return [x - w / 2, y - (f.asc + f.desc) * px / 2, w, (f.asc + f.desc) * px]; }
        return [x, y, it.rw || im?.width || 0, it.rh || im?.height || 0];
      }
      case 'SIMPLE': case 'LBL': {
        const px = gdiPx(it.pt), f = fontInfo(it.font), w = it.w || px * f.digit * ((it.text || '').length || 5), h = (f.asc + f.desc) * px;
        return [it.align === 'r' ? x - w : x, y, w, h];
      }
      case 'SITEM': { const t = Object.fromEntries(it.tags); return [x, y, +t.WID || 200, gdiPx(+t.TXTSIZ || 8) * 1.4 + (t.SHWBAR === '1' ? +t.BARHEI || 10 : 0)]; }
    }
    return [x, y, 0, 0];
  }

  function model(ctx, m, io) { for (const it of m.items) item(ctx, it, io); }

  return { item, model, box, text };
})();
