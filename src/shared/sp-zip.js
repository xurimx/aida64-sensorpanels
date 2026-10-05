/* SP.zip: minimal ZIP writer and reader. Deflate and inflate use the browser's (De)CompressionStream. */
window.SP = window.SP || {};
SP.zip = (() => {
  'use strict';
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  async function pipe(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
  async function deflateRaw(u8) {
    if (typeof CompressionStream === 'undefined') return null;
    try { return await pipe(u8, new CompressionStream('deflate-raw')); } catch (e) { return null; }
  }
  async function inflateRaw(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack ZIP files');
    return pipe(u8, new DecompressionStream('deflate-raw'));
  }
  const put = (dv, fields) => fields.forEach(([o, v, s]) => s === 4 ? dv.setUint32(o, v, true) : dv.setUint16(o, v, true));

  /* makeZip(name, data) for one file, or makeZip([{name, data, store}]) for several. Entries are deflated
     unless store is set or deflating doesn't make them smaller. */
  async function makeZip(a, b) {
    const files = Array.isArray(a) ? a : [{ name: a, data: b }];
    const now = new Date(), dt = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), dd = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [], central = []; let offset = 0;
    for (const f of files) {
      const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
      const nb = new TextEncoder().encode(f.name), utf8 = /[^\x00-\x7f]/.test(f.name) ? 0x0800 : 0, crc = crc32(data);
      let comp = f.store ? null : await deflateRaw(data), method = 8;
      if (!comp || comp.length >= data.length) { comp = data; method = 0; }
      const lh = new DataView(new ArrayBuffer(30));
      put(lh, [[0, 0x04034b50, 4], [4, 20, 2], [6, utf8, 2], [8, method, 2], [10, dt, 2], [12, dd, 2], [14, crc, 4], [18, comp.length, 4], [22, data.length, 4], [26, nb.length, 2], [28, 0, 2]]);
      const cd = new DataView(new ArrayBuffer(46));
      put(cd, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, utf8, 2], [10, method, 2], [12, dt, 2], [14, dd, 2], [16, crc, 4], [20, comp.length, 4], [24, data.length, 4], [28, nb.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]);
      parts.push(lh, nb, comp); central.push(cd, nb);
      offset += 30 + nb.length + comp.length;
    }
    const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
    const eo = new DataView(new ArrayBuffer(22));
    put(eo, [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, cdSize, 4], [16, offset, 4], [20, 0, 2]]);
    return new Blob([...parts, ...central, eo], { type: 'application/zip' });
  }

  /* readZip(bytes) -> Map(name -> Uint8Array). Stored and deflated entries; no ZIP64, no encryption. */
  async function readZip(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eo = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
    if (eo < 0) throw new Error('Not a ZIP file');
    const count = dv.getUint16(eo + 10, true); let p = dv.getUint32(eo + 16, true);
    const out = new Map();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged ZIP directory');
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      const nameBytes = u8.subarray(p + 46, p + 46 + nlen);
      const name = flags & 0x0800 ? new TextDecoder().decode(nameBytes) : new TextDecoder('windows-1252').decode(nameBytes);
      p += 46 + nlen + xlen + clen;
      if (flags & 1) throw new Error('Encrypted ZIP entries are not supported');
      if (dv.getUint32(lho, true) !== 0x04034b50) throw new Error('Damaged ZIP entry');
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const raw = u8.subarray(start, start + csize);
      if (name.endsWith('/')) continue;
      if (method === 0) out.set(name, raw.slice());
      else if (method === 8) out.set(name, await inflateRaw(raw));
      else throw new Error(`Unsupported ZIP compression (${method}) in ${name}`);
    }
    return out;
  }

  return { crc32, deflateRaw, inflateRaw, makeZip, readZip };
})();
