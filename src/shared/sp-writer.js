/* SP.writer: model -> AIDA64 SensorPanel files.
   model = { w, h, items, imgs }  items in draw order, imgs: Map(name -> canvas | Uint8Array | Blob).
   Item kinds: IMG {name,x,y, rw?,rh?, bg?}  DIV {text}  LBL {text,x,y,pt,font,col,bold?,italic?,shadow?}
               GAUGE {sensor,slabel,lo,hi,x,y,frames,showVal,pt,font,col, typ?,siz?,rw?,rh?,ptRaw?,bold?,italic?,icon?}
               SIMPLE {sensor,slabel,x,y,pt,unit,col,align,font, bold?,italic?,showLabel?,label?}
               GRAPH {sensor,slabel,x,y,w,h,lo,hi,col,auto,step,thick, type?,density?,gridCol?,bgCol?,frameCol?,flags?,showScale?,scalePt?,scaleFont?,scaleCol?,scaleBI?}
               SITEM / RAW {id, x, y, tags:[[k,v]...]}  (AIDA64 items we pass through untouched)
   Any item may set hidden: true (AIDA64's '-' prefix). Optional fields default to what the builder always wrote,
   so builder exports are unchanged byte for byte. */
window.SP = window.SP || {};
SP.writer = (() => {
  'use strict';
  const { bgr, fmtNum, enc1252, clean } = SP.core;
  const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase());
  function toHex(u8) { const parts = []; for (let i = 0; i < u8.length; i += 32768) { let s = ''; const e = Math.min(u8.length, i + 32768); for (let j = i; j < e; j++) s += HEX[u8[j]]; parts.push(s); } return parts.join(''); }
  const pngBytes = c => new Promise((res, rej) => c.toBlob(b => b ? b.arrayBuffer().then(a => res(new Uint8Array(a)), rej) : rej(new Error('PNG encoding failed')), 'image/png'));
  async function imgBytes(src) {
    if (!src) throw new Error('missing image');
    if (src instanceof Uint8Array) return src;
    if (src instanceof Blob) return new Uint8Array(await src.arrayBuffer());
    return pngBytes(src);
  }
  const GRID = bgr([19, 21, 24]), HAIR = bgr([28, 31, 36]), LO = bgr([84, 92, 101]);   // builder's graph colours
  const SIZE_TAGS = new Set(['ITMX', 'ITMY', 'WID', 'HEI', 'UNTWID', 'BARWID', 'BARHEI', 'BARIND', 'RESIZW', 'RESIZH']);

  /* names of the images a model needs: IMG items in order, then gauge frames (sorted, like AIDA64 writes them) */
  function imageNames(model) {
    const img = [], frames = new Set();
    for (const it of model.items) {
      if (it.kind === 'IMG' && !img.includes(it.name)) img.push(it.name);
      if (it.kind === 'GAUGE' && it.frames) it.frames.forEach(f => f && frames.add(f));
    }
    return { img, frames: [...frames].sort() };
  }

  function itemLine(it, P, T, v200, hex) {
    const h = it.hidden ? '-' : '';
    const xy = `<ITMX>${P(it.x)}</ITMX><ITMY>${P(it.y)}</ITMY>`;
    switch (it.kind) {
      case 'IMG': {
        const rs = it.rw ? `<RESIZW>${P(it.rw)}</RESIZW><RESIZH>${P(it.rh)}</RESIZH>` : '';
        if (v200) return `<ID>${h}IMG</ID><BGIMG>${it.bg ? 1 : 0}</BGIMG>${rs}${xy}<IMGFIL>${clean(it.name)}</IMGFIL>`;
        if (rs || it.bg) return `<ID>${h}IMG</ID><BGIMG>${it.bg ? 1 : 0}</BGIMG>${rs}${xy}<IMGFIL>${clean(it.name)}</IMGFIL><IMGDAT>${hex.get(it.name)}</IMGDAT>`;
        return `<ID>${h}IMG</ID><URL></URL>${xy}<IMGFIL>${clean(it.name)}</IMGFIL><IMGDAT>${hex.get(it.name)}</IMGDAT>`;
      }
      case 'DIV':
        return `<ID>-LBL</ID><TXTSIZ>8</TXTSIZ><FNTNAM></FNTNAM><LBL>${clean(it.text)}</LBL><LBLCOL>16777215</LBLCOL><LBLBIS>000</LBLBIS><SHDCOL>0</SHDCOL><SHDDIS>1</SHDDIS><SHDDEP>1</SHDDEP><URL></URL><ITMX>0</ITMX><ITMY>0</ITMY>`;
      case 'LBL':
        return `<ID>${h}LBL</ID><TXTSIZ>${T(it.pt)}</TXTSIZ><FNTNAM>${clean(it.font)}</FNTNAM><LBL>${clean(it.text)}</LBL><LBLCOL>${bgr(it.col)}</LBLCOL>`
          + `<LBLBIS>${it.bold ? 1 : 0}${it.italic ? 1 : 0}${it.shadow ? 1 : 0}</LBLBIS><SHDCOL>${it.shadowCol ? bgr(it.shadowCol) : 0}</SHDCOL><SHDDIS>${it.shadowDis || 1}</SHDDIS><SHDDEP>${it.shadowDep || 1}</SHDDEP><URL></URL>${xy}`;
      case 'GAUGE': {
        const typ = it.typ || 'Custom';
        const rs = it.rw ? `<RESIZW>${P(it.rw)}</RESIZW><RESIZH>${P(it.rh)}</RESIZH>` : '';
        const txt = it.showVal ? T(it.pt) : (it.ptRaw ?? 8);
        return `<ID>${h}[GAUGE]${clean(it.sensor)}</ID><LBL>${clean(it.slabel)}</LBL><TYP>${clean(typ)}</TYP><SIZ>${it.siz || 'S'}</SIZ>${rs}<MINVAL>${fmtNum(it.lo)}</MINVAL><MAXVAL>${fmtNum(it.hi)}</MAXVAL>`
          + `<SHWICO>${it.icon ? 1 : 0}</SHWICO><SHWVAL>${it.showVal ? 1 : 0}</SHWVAL><TXTSIZ>${txt}</TXTSIZ><FNTNAM>${clean(it.font)}</FNTNAM><VALCOL>${bgr(it.col)}</VALCOL><VALBI>${it.bold ? 1 : 0}${it.italic ? 1 : 0}</VALBI>${xy}`
          + (typ === 'Custom' || it.frames?.length ? `<STAFLS>${(it.frames || []).map(clean).join('|')}</STAFLS>` : '');
      }
      case 'SIMPLE':
        return `<ID>${h}[SIMPLE]${clean(it.sensor)}</ID><TXTSIZ>${T(it.pt)}</TXTSIZ><FNTNAM>${clean(it.font)}</FNTNAM><TXTCOL>${bgr(it.col)}</TXTCOL><TXTBIR>${it.bold ? 1 : 0}${it.italic ? 1 : 0}${it.align === 'r' ? 1 : 0}</TXTBIR>`
          + `<SHWLBL>${it.showLabel ? 1 : 0}</SHWLBL><LBL>${clean(it.label ?? it.slabel)}</LBL><SHWUNT>${it.unit ? 1 : 0}</SHWUNT><UNT>${clean(it.unit)}</UNT>${xy}`;
      case 'GRAPH':
        return `<ID>${h}[GRAPH]${clean(it.sensor)}</ID><LBL>${clean(it.slabel)}</LBL><TYP>${it.type || 'LG'}</TYP><WID>${P(it.w)}</WID><HEI>${P(it.h)}</HEI><GPHSTP>${it.step}</GPHSTP><GPHTCK>${it.thick}</GPHTCK>`
          + `<GRDDNS>${it.density ?? 40}</GRDDNS><MINVAL>${fmtNum(it.lo)}</MINVAL><MAXVAL>${fmtNum(it.hi)}</MAXVAL><AUTSCL>${it.auto ? 1 : 0}</AUTSCL><GRDCOL>${it.gridCol ? bgr(it.gridCol) : GRID}</GRDCOL>`
          + `<GPHCOL>${bgr(it.col)}</GPHCOL><BGCOL>${it.bgCol ? bgr(it.bgCol) : 0}</BGCOL><FRMCOL>${it.frameCol ? bgr(it.frameCol) : HAIR}</FRMCOL><GPHBFG>${it.flags || '000'}</GPHBFG><SHWSCL>${it.showScale ? 1 : 0}</SHWSCL>`
          + `<TXTSIZ>${it.scalePt ?? 8}</TXTSIZ><FNTNAM>${clean(it.scaleFont || 'Segoe UI')}</FNTNAM><SCLCOL>${it.scaleCol ? bgr(it.scaleCol) : LO}</SCLCOL><SCLBI>${it.scaleBI || '000'}</SCLBI>${xy}`;
      case 'SITEM': case 'RAW': {
        let s = `<ID>${h}${clean(it.id)}</ID>`;
        for (const [k, v] of it.tags) {
          if (k === 'ID') continue;
          if (k === 'ITMX') s += `<ITMX>${P(it.x)}</ITMX>`;
          else if (k === 'ITMY') s += `<ITMY>${P(it.y)}</ITMY>`;
          else if (k === 'TXTSIZ' && v !== '') s += `<TXTSIZ>${T(+v)}</TXTSIZ>`;
          else if (SIZE_TAGS.has(k) && v !== '' && Number.isFinite(+v)) s += `<${k}>${P(+v)}</${k}>`;
          else s += `<${k}>${clean(v)}</${k}>`;
        }
        return s;
      }
    }
    return null;
  }

  function scalers(dpi) { const s = dpi / 100; return [v => Math.round(v / s), pt => Math.max(1, Math.round(pt / s))]; }
  const header = (model, P, v200) => [v200 ? '<SPVER>200</SPVER><SWVER>7.50.7200</SWVER>' : '<SPVER>100</SPVER><SWVER>7.35.7000</SWVER>',
    `<SPWIDTH>${P(model.w)}</SPWIDTH><SPHEIGHT>${P(model.h)}</SPHEIGHT><SPBGCOLOR>0</SPBGCOLOR>`];

  /* SPVER 100 .sensorpanel: images as hex, gauge frames once at the end. AIDA64 multiplies positions, text size and
     panel size by the Windows scale (not images), so those are divided by dpi / 100 first. Returns cp1252 bytes. */
  async function writePanel(model, progress = () => {}, dpi = 100) {
    const [P, T] = scalers(dpi);
    const { img, frames } = imageNames(model);
    const names = [...img, ...frames.filter(f => !img.includes(f))];
    const hex = new Map();
    for (let i = 0; i < names.length; i++) { hex.set(names[i], toHex(await imgBytes(model.imgs.get(names[i])))); if (i % 12 === 0) progress(i / names.length); }
    const L = header(model, P, false);
    for (const it of model.items) { const line = itemLine(it, P, T, false, hex); if (line) L.push(line); }
    for (const n of frames) L.push(`<GAUSTAFNM>${n}</GAUSTAFNM><GAUSTADAT>${hex.get(n)}</GAUSTADAT>`);
    progress(1);
    return enc1252(L.join('\r\n') + '\r\n');
  }

  /* SPVER 200 .sp2 text plus the image files it names (for .spzip). */
  async function writeSp2(model, progress = () => {}, dpi = 100) {
    const [P, T] = scalers(dpi);
    const { img, frames } = imageNames(model);
    const names = [...img, ...frames.filter(f => !img.includes(f))];
    const files = [];
    for (let i = 0; i < names.length; i++) { files.push({ name: names[i], data: await imgBytes(model.imgs.get(names[i])) }); if (i % 12 === 0) progress(i / names.length); }
    const L = header(model, P, true);
    for (const it of model.items) { const line = itemLine(it, P, T, true, null); if (line) L.push(line); }
    progress(1);
    return { sp2: enc1252(L.join('\r\n') + '\r\n'), files };
  }

  /* .spzip: one YYYY-MM-DD.sp2 plus loose images; extra = [{name, data}] (e.g. designer.json) */
  async function writeSpzip(model, progress = () => {}, dpi = 100, extra = []) {
    const { sp2, files } = await writeSp2(model, progress, dpi);
    const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return SP.zip.makeZip([{ name: `${stamp}.sp2`, data: sp2 }, ...files, ...extra]);
  }

  return { writePanel, writeSp2, writeSpzip, toHex, pngBytes, imgBytes, imageNames };
})();
