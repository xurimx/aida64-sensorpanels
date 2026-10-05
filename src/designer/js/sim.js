/* ================================================================ preview: simulated readings for any sensor
   Typical values come from SP.catalog.family(id); a loaded PC sensor list replaces them with that PC's snapshot.
   Scenarios: load (gaming-like), idle, pc (the snapshot, when a list is loaded). */
const SIM = (() => {
  const S = new Map(), HIST = new Map(), HLEN = 700;
  let scen = 'load', pc = null;
  const t0 = Date.now() - (3 * 3600 + 12 * 60) * 1000;
  const pad = n => String(n).padStart(2, '0');
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  function spec(id) {
    const f = SP.catalog.family(id), snap = pc?.sensors.get(id);
    const s = { kind: f.kind, dec: f.dec, min: Math.min(f.lo, 0), max: f.hi * 1.5 + 1, sigma: f.sigma, mu: f.mu, sample: f.sample, unit: f.unit };
    if (f.kind !== 'num') { s.text = snap?.value || f.sample; return s; }
    const j = hash(id) - .5, range = f.hi - f.lo;
    if (/UTI$/.test(id) && !/^SDRV/.test(id)) s.mu += j * range * .3;
    else if (id[0] === 'T') s.mu += j * 6;
    else if (/^SCC-/.test(id)) s.mu += Math.round(j * 4) * 100;
    if (scen === 'idle') {
      if (/UTI$|ACT$/.test(id) && !/^SDRV/.test(id)) s.mu = 1 + Math.abs(j) * 6;
      else if (id[0] === 'T') s.mu = 20 + (s.mu - 20) * .55;
      else if (id[0] === 'P') s.mu *= .2;
      else if (/CLK$|^SCC-/.test(id)) s.mu *= .45;
      else if (id[0] === 'F') s.mu *= .7;
      else if (/FPS|FRAPS/.test(id)) s.mu = 0;
      else if (/RATE$|SPD$/.test(id)) s.mu *= .05;
    }
    if (snap && snap.num !== null && (scen === 'pc' || !/FPS/.test(id))) { if (scen === 'pc') s.mu = snap.num; s.dec = snap.dec; }
    s.mu = Math.max(s.min, Math.min(s.max, s.mu));
    if (scen === 'idle' && /FPS/.test(id)) s.sigma = 0;
    return s;
  }
  function ensure(id) {
    let s = S.get(id);
    if (!s) { s = spec(id); s.val = s.mu; S.set(id, s); HIST.set(id, Array(HLEN).fill(s.mu)); }
    return s;
  }
  function tick() {
    for (const [id, s] of S) {
      if (s.kind !== 'num') continue;
      s.val += .35 * (s.mu - s.val) + s.sigma * gauss();
      s.val = Math.max(s.min, Math.min(s.max, s.val));
      const h = HIST.get(id); h.push(s.val); if (h.length > HLEN) h.shift();
    }
  }
  function reseed(snapNow) {
    for (const [id, s] of S) { const n = spec(id); Object.assign(s, n, { val: snapNow ? n.mu : s.val }); }
  }
  function str(id) {
    const s = ensure(id), d = new Date();
    switch (s.kind) {
      case 'date': return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
      case 'time': return /NS$/.test(id) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      case 'uptime': { const t = Math.floor((Date.now() - t0) / 1000); return `${Math.floor(t / 3600)}:${pad(Math.floor(t / 60) % 60)}` + (/NS$/.test(id) ? '' : `:${pad(t % 60)}`); }
      case 'text': return s.text ?? '';
    }
    return s.val.toFixed(s.dec);
  }
  return {
    val: id => { const s = ensure(id); return s.kind === 'num' ? s.val : 0; },
    str, hist: id => (ensure(id), HIST.get(id)), ensure, tick,
    warm(n = 620) { for (let i = 0; i < n; i++) tick(); },
    setPc(list) { pc = list || null; if (!pc && scen === 'pc') scen = 'load'; reseed(true); },
    setScenario(sc) { scen = sc === 'pc' && !pc ? 'load' : sc; reseed(true); },
    scenario: () => scen, hasPc: () => !!pc,
    set(id, v) { const s = ensure(id); s.val = s.mu = v; },
  };
})();
