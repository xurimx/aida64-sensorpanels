/* ================================================================ Your PC: AIDA64 sensor lists and hardware detection
   Inputs (auto-detected):
   - .reg file from  reg export HKCU\Software\FinalWire\AIDA64\SensorValues …   (UTF-16LE: "Label.TCPU"="CPU")
   - reg query paste  (    Label.TCPU    REG_SZ    CPU)
   - shared-memory XML (<temp><id>TCPU</id><label>CPU</label><value>45</value></temp>…, no root element)
   - also: tab-separated id/label/value lines, or JSON from Get-ItemProperty | ConvertTo-Json
   Everything stays in the browser. IP-address values are dropped while parsing. */
const PC_MAX = 5000;
const normId = id => String(id || '').trim().replace(/-0+(\d)/g, '-$1');
const xmlText = s => s.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e] ?? String.fromCharCode(+e.slice(1)));
const XML_CAT = { sys: 'System', temp: 'Temperatures', fan: 'Fans', duty: 'Fan duty', volt: 'Voltage', curr: 'Current', pwr: 'Power', flow: 'Flow & liquid', liq: 'Flow & liquid' };

function pcDecode(input) {
  if (typeof input === 'string') return input;
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return new TextDecoder().decode(b.subarray(3));
  if (b.length > 3 && b[1] === 0 && b[3] === 0) return new TextDecoder('utf-16le').decode(b);          // UTF-16 without BOM
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { return new TextDecoder('windows-1252').decode(b); }
}

/* -> { source, sensors: Map(id -> {label, value, num, dec, cat}), warnings: [] } or throws with a readable message */
function parseSensorList(input) {
  const text = pcDecode(input).replace(/\u0000+$/, '');
  const pairs = new Map(), meta = new Map();          // id -> {label, value}; meta: id -> xml category
  const put = (id, k, v) => { id = normId(id); if (!/^[A-Z][A-Z0-9-]*$/i.test(id)) return; const o = pairs.get(id) || {}; o[k] = v; pairs.set(id, o); };
  let source = '';
  if (/<id>[\s\S]*?<\/id>/i.test(text)) {
    source = 'shared memory';
    const re = /<(sys|temp|fan|duty|volt|curr|pwr|flow|liq)>\s*<id>([\s\S]*?)<\/id>\s*<label>([\s\S]*?)<\/label>\s*<value>([\s\S]*?)<\/value>\s*<\/\1>/gi;
    for (const m of text.matchAll(re)) { put(m[2], 'label', xmlText(m[3])); put(m[2], 'value', xmlText(m[4])); meta.set(normId(m[2]), XML_CAT[m[1].toLowerCase()]); }
  } else if (/^\s*[{\[]/.test(text)) {
    source = 'JSON';
    let o; try { o = JSON.parse(text); } catch (e) { throw new Error('That looks like JSON but it can’t be read.'); }
    if (Array.isArray(o)) o = o[0] || {};
    for (const [k, v] of Object.entries(o)) { const m = k.match(/^(Label|Value)\.(.+)$/i); if (m) put(m[2], m[1].toLowerCase(), String(v ?? '')); }
  } else {
    const unesc = s => s.replace(/\\(.)/g, '$1');
    for (let line of text.split(/\r?\n/)) {
      let m;
      if ((m = line.match(/^"((?:Label|Value)\.[^"\\]*(?:\\.[^"\\]*)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/i))) {
        source ||= '.reg file'; const [, k, id] = unesc(m[1]).match(/^(Label|Value)\.(.+)$/i); put(id, k.toLowerCase(), unesc(m[2]));
      } else if ((m = line.match(/^"((?:Label|Value)\.[^"]+)"\s*=\s*dword:([0-9a-f]{8})\s*$/i))) {
        source ||= '.reg file'; const [, k, id] = m[1].match(/^(Label|Value)\.(.+)$/i); put(id, k.toLowerCase(), String(parseInt(m[2], 16)));
      } else if ((m = line.match(/^\s+(Label|Value)\.(\S+)\s+REG_(?:SZ|EXPAND_SZ|DWORD)\s*(.*?)\s*$/i))) {
        source ||= 'registry paste'; let v = m[3]; if (/^0x[0-9a-f]+$/i.test(v)) v = String(parseInt(v, 16)); put(m[2], m[1].toLowerCase(), v);
      } else if ((m = line.match(/^([A-Z][A-Z0-9-]{1,30})\t([^\t]*)\t([^\t]*)$/))) {
        source ||= 'table'; put(m[1], 'label', m[2]); put(m[1], 'value', m[3]);
      }
    }
  }
  const sensors = new Map();
  for (const [id, o] of pairs) {
    if (sensors.size >= PC_MAX) break;
    let value = o.value ?? '';
    if (/IPADDR$/.test(id)) value = '';                                   // never keep IP addresses
    const t = value.trim().replace(',', '.'), num = /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
    const dec = num === null ? 0 : (t.split('.')[1] || '').length;
    sensors.set(id, { label: (o.label ?? '').trim() || SP.catalog.label(id), value, num, dec, cat: meta.get(id) || SP.catalog.family(id).cat });
  }
  if (!sensors.size) throw new Error('No AIDA64 sensors found. Paste the output of the reg query command, the shared-memory text, or drop the .reg file.');
  const warnings = [];
  if (![...sensors.keys()].some(id => id[0] === 'S'))
    warnings.push('No system readings (clocks, loads, drives, network). In AIDA64’s External Applications page click Select All, press OK, then export again.');
  const temps = [...sensors].filter(([id, s]) => id[0] === 'T' && s.num !== null).map(([, s]) => s.num).sort((a, b) => a - b);
  if (temps.length && temps[temps.length >> 1] > 100) warnings.push('Temperatures look like Fahrenheit. Panels show what AIDA64 reports; switch AIDA64 to Celsius for °C.');
  return { source: source || 'text', at: Date.now(), sensors, warnings };
}

/* ---- hardware profile ---- */
const HW_DEFAULTS = {        /* the owner's setup, same as the builder's DEFAULTS */
  pCores: 6, eCores: 8, threads: 20, smt: true, cpuTemp: 'TCPUPKG',
  gpu: 1, gpus: [1], gpuTemp: 'TGPU1DIO',
  disks: [{ num: 1, letter: 'C', name: 'DISK 1' }, { num: 2, letter: 'D', name: 'DISK 2' }],
  nic: 6, dimms: [2, 4],
  fans: [{ id: 'FCPU', label: 'CPU FAN', max: 3000 }, { id: 'FAIOPUMP', label: 'PUMP', max: 4500 }, { id: 'FCHA1', label: 'CASE 1', max: 3000 },
         { id: 'FCHA2', label: 'CASE 2', max: 3000 }, { id: 'FCHA3', label: 'CASE 3', max: 3000 }, { id: 'FGPU1', label: 'GPU FAN', max: 3000 }],
  extras: { thr: true, limit: true, vramTemp: true, vramClk: true, dimm: true, hpwr: true, coolant: true, board: true, refresh: true, netx: true },
};
const hwClone = h => JSON.parse(JSON.stringify(h));

function inferHw(list) {
  const hw = hwClone(HW_DEFAULTS), notes = [];
  if (!list || !list.sensors?.size) return { hw, notes: ['Example hardware (6 P + 8 E cores, NIC6, drives C: and D:). Load your sensor list to match your PC.'], source: 'defaults' };
  const S = list.sensors, has = id => S.has(id), val = id => S.get(id)?.num ?? null;
  const sys = [...S.keys()].some(id => id[0] === 'S');     // without system readings, drives and network can't be known
  const nums = re => [...S.keys()].map(id => id.match(re)).filter(Boolean).map(m => +m[1]).sort((a, b) => a - b);
  const maxOf = re => { const n = nums(re); return n.length ? n[n.length - 1] : 0; };
  /* CPU topology */
  const cores = Math.max(maxOf(/^SCC-1-(\d+)$/), maxOf(/^TCC-1-(\d+)$/));
  let threads = maxOf(/^SCPU(\d+)UTI$/);
  if (cores) {
    if (!threads) { threads = cores; notes.push('Thread count not reported; assuming one thread per core.'); }
    const d = threads - cores;
    if (d <= 0) Object.assign(hw, { pCores: cores, eCores: 0, smt: false });
    else if (d >= cores) Object.assign(hw, { pCores: cores, eCores: 0, smt: true });
    else Object.assign(hw, { pCores: d, eCores: cores - d, smt: true });
    hw.threads = threads;
  } else notes.push('No per-core sensors found; the core table keeps the example layout.');
  hw.cpuTemp = ['TCPUPKG', 'TCPUDIO', 'TCPU', 'TCPUTCTL'].find(has) || hw.cpuTemp;
  /* GPUs */
  const gpus = [...new Set([...nums(/^SGPU(\d+)UTI$/), ...nums(/^TGPU(\d+)(DIO|HOT|MEM)?$/), ...nums(/^PGPU(\d+)$/)])].sort((a, b) => a - b);
  if (gpus.length) {
    hw.gpus = gpus;
    hw.gpu = [...gpus].sort((a, b) => (val(`PGPU${b}`) ?? -1) - (val(`PGPU${a}`) ?? -1) || (has(`FGPU${b}`) - has(`FGPU${a}`)) || a - b)[0];
    hw.gpuTemp = [`TGPU${hw.gpu}DIO`, `TGPU${hw.gpu}`, `TGPU${hw.gpu}HOT`].find(has) || `TGPU${hw.gpu}DIO`;
  }
  /* storage: drive letters and disk numbers, paired in order */
  const letters = [...S.keys()].map(id => id.match(/^SDRV([A-Z])UTI$/)).filter(Boolean).map(m => m[1]).sort();
  const disks = [...new Set([...nums(/^SDSK(\d+)ACT$/), ...nums(/^THDD(\d+)$/)])].sort((a, b) => a - b);
  if (letters.length || disks.length) {
    const n = Math.min(4, Math.max(letters.length, disks.length));
    hw.disks = Array.from({ length: n }, (_, i) => {
      const num = disks[i] ?? null, letter = letters[i] ?? null;
      const model = num && S.get(`THDD${num}`)?.label;
      const name = model && !/^\d+(st|nd|rd|th) HDD$/i.test(model) ? model.replace(/\s+/g, ' ').trim().slice(0, 12).toUpperCase() : num ? `DISK ${num}` : `DRIVE ${letter}`;
      return { num, letter, name };
    });
    if (letters.length && disks.length) notes.push('Disks are paired with drive letters in order. Check the pairing in the theme setup.');
  } else if (sys) hw.disks = [];
  /* network: the adapter that moved the most data */
  const nics = nums(/^SNIC(\d+)DLRATE$/);
  if (!nics.length && sys) hw.nic = 0;
  if (nics.length) hw.nic = [...nics].sort((a, b) => (val(`SNIC${b}TOTDL`) ?? -1) - (val(`SNIC${a}TOTDL`) ?? -1) || (val(`SNIC${b}DLRATE`) ?? 0) - (val(`SNIC${a}DLRATE`) ?? 0) || a - b)[0];
  hw.dimms = nums(/^TDIMMTS(\d+)$/).slice(0, 2);
  /* fans: everything spinning, CPU first, pumps next, GPU fans last */
  const rank = id => /^FCPU/.test(id) ? 0 : /PUMP/.test(id) ? 1 : /^FGPU/.test(id) ? 3 : 2;
  const fans = [...S.keys()].filter(id => /^F/.test(id) && !/^FWFLOW/.test(id) && (val(id) ?? 1) > 0).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en', { numeric: true }));
  const pumps = fans.filter(id => /PUMP/.test(id)).length;
  hw.fans = fans.slice(0, 8).map(id => {
    const v = val(id) || 0, base = /PUMP/.test(id) ? 4500 : 3000;
    return { id, label: fanLabel(id, S.get(id).label, hw.gpu, pumps), max: Math.max(base, Math.ceil(v * 1.25 / 500) * 500) };
  });
  const g = hw.gpu;
  hw.extras = { thr: has('SCPUTHR'), limit: has(`SGPU${g}PERFCAP`), vramTemp: has(`TGPU${g}MEM`), vramClk: has(`SGPU${g}MEMCLK`), dimm: hw.dimms.length > 0,
                hpwr: has(`PGPU${g}12VHPWR`), coolant: has('TWATER'), board: has('TMOBO') || has('TVRM') || has('TPCH'), refresh: has('SVREFRATE'), netx: has(`SNIC${hw.nic}TOTDL`) };
  return { hw, notes, source: list.source };
}

/* short panel labels for fans, in the builder's style (CPU FAN, PUMP, CASE 1, GPU FAN) */
function fanLabel(id, label, gpu, pumps) {
  let m;
  if (id === 'FCPU') return 'CPU FAN';
  if (id === 'FCPUOPT') return 'CPU OPT';
  if (/^(FAIOPUMP|FWPUMP)$/.test(id)) return 'PUMP';
  if ((m = id.match(/^F(?:W)?PUMP(\d+)$/))) return pumps > 1 ? `PUMP ${m[1]}` : 'PUMP';
  if ((m = id.match(/^FCHA(\d+)$/))) return `CASE ${m[1]}`;
  if ((m = id.match(/^FGPU(\d+)$/))) return +m[1] === gpu ? 'GPU FAN' : `GPU${m[1]} FAN`;
  if ((m = id.match(/^F(FRONT|REAR|FAN|OPT|AUX)(\d+)$/))) return `${m[1]} ${m[2]}`;
  return String(label || id).toUpperCase().slice(0, 10);
}

/* is a sensor reported? 'yes' | 'sometimes' (only while RTSS, media players… run) | 'no' | 'unknown' (no list loaded) */
function sensorStatus(list, id) {
  if (!list || !list.sensors?.size) return 'unknown';
  if (list.sensors.has(id)) return 'yes';
  return SP.catalog.family(id).sometimes ? 'sometimes' : 'no';
}
