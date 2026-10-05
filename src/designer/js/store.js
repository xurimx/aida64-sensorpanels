/* ================================================================ store: autosave, recent designs, design files, share links
   IndexedDB database "aida64-sensorpanels-designer" (the name is prefixed because every github.io project page shares
   one origin). Falls back to memory when IndexedDB isn't available (private windows, blocked storage). */
const STORE = (() => {
  const DB = 'aida64-sensorpanels-designer', MEM = new Map();
  let dbp = null, ok = true;
  function db() {
    if (!ok || typeof indexedDB === 'undefined') return null;
    return dbp ||= new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => { ok = false; rej(r.error); };
    }).catch(() => (ok = false, null));
  }
  async function tx(mode, fn) {
    const d = await db(); if (!d) return null;
    return new Promise((res, rej) => { try { const t = d.transaction('kv', mode), r = fn(t.objectStore('kv')); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); } catch (e) { rej(e); } });
  }
  return {
    async get(k) { try { const v = await tx('readonly', s => s.get(k)); return v === null ? MEM.get(k) : v ?? MEM.get(k); } catch (e) { return MEM.get(k); } },
    async set(k, v) { MEM.set(k, v); try { await tx('readwrite', s => s.put(v, k)); return true; } catch (e) { return false; } },
    async del(k) { MEM.delete(k); try { await tx('readwrite', s => s.delete(k)); } catch (e) { /* ignore */ } },
    persistent: () => ok,
  };
})();

/* assets referenced by a document */
function usedAssets(doc) {
  const ids = new Set();
  eachWidget(doc, w => { if (w.type === 'image' && w.p.asset) ids.add(w.p.asset); if (w.type === 'customGauge') w.p.frames.forEach(f => f && ids.add(f)); });
  return [...ids];
}
const b64of = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

/* ---- autosave and recent designs (images stored once, under their asset id) ---- */
async function saveLocal(doc, slot = 'current') {
  for (const id of usedAssets(doc)) { const a = ASSETS.get(id); if (a && !(await STORE.get('asset:' + id))) await STORE.set('asset:' + id, { bytes: a.bytes, mime: a.mime, name: a.name }); }
  return STORE.set('doc:' + slot, { json: JSON.stringify(doc), at: Date.now(), name: doc.name });
}
async function loadLocal(slot = 'current') {
  const rec = await STORE.get('doc:' + slot); if (!rec) return null;
  const doc = sanitizeDoc(JSON.parse(rec.json));
  for (const id of usedAssets(doc)) { if (ASSETS.has(id)) continue; const a = await STORE.get('asset:' + id); if (a) await addAsset(a.bytes, a.mime, a.name); }
  return doc;
}
async function rememberRecent(doc) {
  const list = (await STORE.get('recent')) || [], slot = 'r' + cyrb(doc.name + Date.now());
  await saveLocal(doc, slot);
  const next = [{ slot, name: doc.name, at: Date.now(), size: [doc.panel.w, doc.panel.h] }, ...list.filter(r => r.name !== doc.name)].slice(0, 6);
  for (const r of list) if (!next.includes(r)) STORE.del('doc:' + r.slot);
  await STORE.set('recent', next);
  return next;
}

/* ---- design file: the document with its images inlined ---- */
function designFile(doc) {
  const out = JSON.parse(JSON.stringify(doc));
  out.assets = {};
  for (const id of usedAssets(doc)) { const a = ASSETS.get(id); if (a) out.assets[id] = { w: a.w, h: a.h, mime: a.mime, name: a.name, data: `data:${a.mime};base64,${b64of(a.bytes)}` }; }
  return new Blob([JSON.stringify(out)], { type: 'application/json' });
}

/* ---- share links: deflate-raw + base64url in the fragment, images left out ---- */
const B64U = { enc: u8 => b64of(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)) };
async function shareLink(doc) {
  const d = JSON.parse(JSON.stringify(doc)); d.assets = {};
  let images = 0;
  eachWidget(d, w => { if (w.type === 'image' || w.type === 'customGauge') images++; });
  const z = await SP.zip.deflateRaw(new TextEncoder().encode(JSON.stringify(d)));
  if (!z) throw new Error('This browser can’t compress the link.');
  const url = `${location.href.split('#')[0]}#d=${B64U.enc(z)}`;
  return { url, images, length: url.length };
}
async function docFromLink(hash) {
  const m = /[#&]d=([A-Za-z0-9_-]+)/.exec(hash || ''); if (!m) return null;
  if (m[1].length > 3e6) throw new Error('This link is too long to be a design.');
  const bytes = await SP.zip.inflateRaw(B64U.dec(m[1]));
  if (bytes.length > DOC_LIMITS.json) throw new Error('This design is too large.');
  return sanitizeDoc(JSON.parse(new TextDecoder().decode(bytes)));
}

/* ---- the PC sensor list (stays in this browser) ---- */
async function savePcList(list) {
  if (!list) return STORE.del('pc');
  return STORE.set('pc', { source: list.source, at: list.at, warnings: list.warnings, sensors: [...list.sensors] });
}
async function loadPcList() {
  const r = await STORE.get('pc'); if (!r || !Array.isArray(r.sensors)) return null;
  return { source: r.source, at: r.at, warnings: r.warnings || [], sensors: new Map(r.sensors) };
}
