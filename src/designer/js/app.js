/* ================================================================ app: boot, files, export, autosave */
const inViewer = !!(window.claude && typeof window.claude.use === 'function');
let viewerDownloads = null;
const safeName = s => (String(s || 'panel').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'panel').slice(0, 60);

/* ---- saving files (the Claude artifact viewer only saves .zip, through its downloads API) ---- */
async function saveBlob(blob, name) {
  if (inViewer) {
    viewerDownloads ||= await window.claude.use('downloads').catch(() => null);
    if (!viewerDownloads) throw new Error('This view can’t save files. Open the designer page on your PC instead.');
    const data = new Uint8Array(await blob.arrayBuffer());
    const zip = await SP.zip.makeZip(name, data);
    await viewerDownloads.save({ filename: name.replace(/\.[a-z0-9]+$/i, '') + '.zip', data: zip });
    return 'zip';
  }
  const url = URL.createObjectURL(blob), a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'file';
}
async function saveDesignFile() {
  try { await saveBlob(designFile(APP.doc), safeName(APP.doc.name) + '.design.json'); UI.toast('Design saved. Open it here again with Open….'); }
  catch (e) { UI.toast(e.message); }
}

/* ---- export ---- */
const exportName = (doc, fmt) => `${safeName(doc.name)}_${doc.panel.w}x${doc.panel.h}${doc.export.dpi !== 100 ? `_${doc.export.dpi}pct` : ''}.${fmt}`;
async function exportBytes(doc, fmt, o = {}) {
  const env = makeEnv(doc, APP.pc), model = await compileDoc(doc, env), prog = o.progress || (() => {});
  if (fmt === 'spzip') {
    const extra = o.withDesign ? [{ name: 'designer.json', data: new TextEncoder().encode(await designFile(doc).text()) }] : [];
    return { blob: await SP.writer.writeSpzip(model, prog, doc.export.dpi, extra), model };
  }
  const bytes = await SP.writer.writePanel(model, prog, doc.export.dpi);
  return { blob: new Blob([bytes], { type: 'application/octet-stream' }), bytes, model };
}
async function openExport() {
  const d = $('dlg-export'), body = $('exp-body'), doc = APP.doc; body.replaceChildren(); setExpStatus('');
  const fmtSel = h('select', { class: 'fld', id: 'exp-fmt' }, h('option', { value: 'sensorpanel', text: '.sensorpanel (any AIDA64, recommended)' }), h('option', { value: 'spzip', text: '.spzip (AIDA64 7.50+, about half the size)' }));
  fmtSel.value = doc.export.format;
  const dpi = h('select', { class: 'fld', id: 'exp-dpi' }); for (let v = 100; v <= 300; v += 25) dpi.append(h('option', { value: v, text: v + ' %' })); dpi.value = doc.export.dpi;
  const withDesign = h('input', { type: 'checkbox', id: 'exp-design' });
  const designRow = h('div', { class: 'checks' }, h('label', {}, withDesign, 'Put the design inside the .spzip, so it reopens here exactly'));
  const designHint = h('p', { class: 'hint', text: 'Adds a designer.json file to the archive. Not yet confirmed that every AIDA64 version ignores it; leave it off if the import fails.' });
  const sync = () => { designRow.hidden = designHint.hidden = fmtSel.value !== 'spzip'; };
  on(fmtSel, 'change', () => { edit(() => { doc.export.format = fmtSel.value; }); sync(); summarize(); });
  on(dpi, 'change', () => edit(() => { doc.export.dpi = +dpi.value; }));
  sync();
  const sum = h('dl', { class: 'kv' }, h('dt', { text: 'Working out the size…' }), h('dd'));
  const miss = [];
  eachWidget(doc, w => { for (const id of missingSensors(w)) if (!miss.includes(id)) miss.push(id); });
  body.append(h('div', { class: 'f' }, h('label', { for: 'exp-fmt', text: 'Format' }), fmtSel), designRow, designHint,
    h('div', { class: 'f' }, h('label', { for: 'exp-dpi', text: 'Windows scale' }), dpi), sum);
  if (miss.length) body.append(h('p', { class: 'note warn', text: `Your PC doesn’t report ${miss.length} sensor${miss.length > 1 ? 's' : ''} this panel uses: ${miss.slice(0, 12).join(', ')}${miss.length > 12 ? '…' : ''}. Those parts will stay blank or show 0.` }));
  body.append(h('p', { class: 'hint' }, 'In AIDA64: right-click the SensorPanel › ', h('b', {}, 'SensorPanel Manager'), ' › ', h('b', {}, 'Import'), ' and pick the file. Importing replaces the panel AIDA64 shows, so export that one first if you want to keep it.'));
  let built = null;                      /* the real file, built once for its size and reused by Export */
  async function summarize() {
    built = null; sum.replaceChildren(h('dt', { text: 'Working out the size…' }), h('dd'));
    try {
      const fmt = fmtSel.value, key = snapshot() + fmt + withDesign.checked;
      const r = await exportBytes(doc, fmt, { withDesign: fmt === 'spzip' && withDesign.checked }), e = await estimate(r.model);
      built = { key, fmt, blob: r.blob };
      sum.replaceChildren(h('dt', { text: 'Items' }), h('dd', { text: e.items }), h('dt', { text: 'Gauge frames' }), h('dd', { text: e.frames }),
        h('dt', { text: 'File size' }), h('dd', { text: fmtBytes(r.blob.size) }), h('dt', { text: 'Image memory in AIDA64' }), h('dd', { text: '~' + fmtBytes(e.mem) }));
      if (r.blob.size > 12e6) sum.append(h('dt', { text: '' }), h('dd', { class: 'miss', text: 'Large panel: AIDA64 may take a while to import it.' }));
    } catch (err) { sum.replaceChildren(h('dt', { text: 'Couldn’t build the file: ' + err.message }), h('dd')); }
  }
  on(withDesign, 'change', summarize);
  summarize();
  $('exp-go').onclick = async () => {
    const btn = $('exp-go'); btn.disabled = true;
    try {
      const fmt = fmtSel.value, name = exportName(doc, fmt);
      setExpStatus('Building…');
      const reuse = built && built.key === snapshot() + fmt + withDesign.checked;
      const { blob } = reuse ? built : await exportBytes(doc, fmt, { withDesign: fmt === 'spzip' && withDesign.checked, progress: p => setExpStatus(`Building… ${Math.round(p * 100)} %`) });
      const how = await saveBlob(blob, name);
      setExpStatus(how === 'zip' ? `Saved ${name} inside a .zip. Unzip it, then import it in AIDA64.` : `Exported ${name} (${fmtBytes(blob.size)}).`, 'ok');
    } catch (e) { setExpStatus('Export failed: ' + (e?.message || e), 'err'); }
    finally { btn.disabled = false; }
  };
  d.showModal();
}
function setExpStatus(t, cls = '') { const s = $('exp-status'); s.textContent = t; s.className = cls; }

/* ---- share link ---- */
async function openShare() {
  const d = $('dlg-share'), body = $('share-body'); body.replaceChildren(h('p', { class: 'hint', text: 'Making the link…' })); d.showModal();
  try {
    const { url, images, length } = await shareLink(APP.doc);
    const ta = h('textarea', { readonly: true, rows: 4, value: url, 'aria-label': 'Share link' }), copy = h('button', { type: 'button', class: 'btn primary', text: 'Copy link' });
    on(copy, 'click', async () => { try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied'; } catch (e) { ta.select(); } });
    body.replaceChildren(h('p', { class: 'hint', text: `Anyone who opens this link gets a copy of the design in their browser. ${length.toLocaleString()} characters.` }), ta, h('div', { class: 'acts' }, copy));
    if (images) body.append(h('p', { class: 'note warn', text: `${images} image${images > 1 ? 's aren’t' : ' isn’t'} included in links. Send the design file (Save) to share those too.` }));
    if (length > 8000) body.append(h('p', { class: 'hint', text: 'Long link: some chat apps cut long links. The design file always works.' }));
  } catch (e) { body.replaceChildren(h('p', { class: 'note warn', text: e.message })); }
}

/* ---- open files (picker, drop, paste) ---- */
function openPicker(accept = '.json,.sensorpanel,.spzip,.reg,.txt') { const inp = $('file-open'); inp.accept = accept; inp.click(); }
async function handleFile(file) {
  try {
    if (/^image\//.test(file.type)) {
      const bytes = new Uint8Array(await file.arrayBuffer()), id = await addAsset(bytes, file.type, file.name || 'image.png'), a = ASSETS.get(id);
      if (!a?.bitmap) throw new Error('That image can’t be read.');
      const s = Math.min(1, 1200 / Math.max(a.w, a.h)), [x, y] = viewCentre();
      return insertWidgets([WF.make('image', { asset: id, name: a.name }, 0, 0, Math.round(a.w * s), Math.round(a.h * s))], x, y, 'Image');
    }
    const r = await openFile(file);
    if (r.kind === 'sensors') { setPcList(r.list); UI.toast(`${r.list.sensors.size} sensors loaded from the ${r.list.source}.`); showTab('pc'); return; }
    if (APP.doc.nodes.length) await rememberRecent(APP.doc);
    setDoc(r.doc);
    UI.toast(r.kind === 'design' ? 'Design opened.' : r.exact ? 'Opened your design from the .spzip.' : `Opened ${file.name}: every item is now a movable part${r.skipped ? ` (${r.skipped} skipped)` : ''}.`);
  } catch (e) { UI.toast(e.message || String(e)); }
}

/* ---- autosave ---- */
let saveTimer = 0;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveLocal(APP.doc, 'current').catch(() => {}), 800); }

/* ---- tabs ---- */
function showTab(t) {
  for (const k of ['add', 'pc', 'layers']) { $('tab-' + k).setAttribute('aria-selected', String(k === t)); $('pane-' + k).hidden = k !== t; }
  document.body.classList.remove('m-add', 'm-pc', 'm-layers', 'm-inspect');
  if (t) document.body.classList.add('m-' + t);
  document.querySelectorAll('.mtabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.m === t)));
}

async function boot() {
  initStage();
  on($('btn-new'), 'click', openStart); on($('btn-open'), 'click', () => openPicker()); on($('btn-save'), 'click', saveDesignFile); on($('btn-share'), 'click', openShare);
  on($('btn-export'), 'click', openExport); on($('btn-undo'), 'click', undo); on($('btn-redo'), 'click', redo);
  const centre = () => { const r = STAGE.wrap.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
  on($('zoom-in'), 'click', () => zoomAt(1.25, ...centre())); on($('zoom-out'), 'click', () => zoomAt(.8, ...centre()));
  on($('zoom-fit'), 'click', () => { APP.view.fit = true; requestDraw(); });
  on($('btn-snap'), 'click', () => { APP.snap = !APP.snap; $('btn-snap').setAttribute('aria-pressed', String(APP.snap)); });
  document.querySelectorAll('#scen button').forEach(b => on(b, 'click', () => setScenario(b.dataset.sc)));
  on($('doc-name'), 'input', e => edit(doc => { doc.name = sStr(e.target.value, 80) || 'My panel'; }, 'docname'));
  for (const k of ['add', 'pc', 'layers']) on($('tab-' + k), 'click', () => showTab(k));
  document.querySelectorAll('.mtabs button').forEach(b => on(b, 'click', () => b.dataset.m === 'inspect' ? (showTab(null), document.body.classList.add('m-inspect'), document.querySelectorAll('.mtabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)))) : showTab(b.dataset.m)));
  document.querySelectorAll('dialog [data-close]').forEach(b => on(b, 'click', () => b.closest('dialog').close()));
  on($('dlg-start'), 'click', e => { const s = e.target.closest('[data-start]')?.dataset.start; if (!s) return; $('dlg-start').close(); s === 'open' ? openPicker() : openTheme(s); });
  on($('file-open'), 'change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) handleFile(f); });
  on(document, 'dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); document.body.classList.add('dragging'); } });
  on(document, 'dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  on(document, 'drop', e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); document.body.classList.remove('dragging'); [...e.dataTransfer.files].slice(0, 4).forEach(handleFile); });
  on(document, 'paste', e => {
    const t = e.target; if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
    const file = [...(e.clipboardData?.files || [])].find(f => /^image\//.test(f.type));
    if (file) { e.preventDefault(); return handleFile(file); }
    const text = e.clipboardData?.getData('text') || '';
    if (/Label\.|REG_SZ|<id>|SensorValues/i.test(text)) { e.preventDefault(); loadSensorText(text); showTab('pc'); return; }
    if (pasteClip()) e.preventDefault();
  });
  showTab('add');
  /* Enter in an inspector field commits it and hands the keyboard back to the canvas */
  on($('inspector'), 'keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.target.dispatchEvent(new Event('change')); e.target.blur(); STAGE.canvas.focus({ preventScroll: true }); } });
  try { await Promise.all([[300, 'Selawik Local'], [400, 'Selawik Local'], [700, 'Selawik Local'], [500, 'Barlow SC Local'], [600, 'Barlow SC Local']].map(([w, f]) => document.fonts.load(`${w} 40px "${f}"`))); } catch (e) { /* fonts load late */ }
  const pc = await loadPcList();
  if (pc) { APP.pc = pc; const r = inferHw(pc); APP.hw = r.hw; APP.hwNotes = r.notes; SIM.setPc(pc); $('scen').querySelector('[data-sc="pc"]').hidden = false; }
  let doc = null, first = false;
  if (/[#&]d=/.test(location.hash)) {
    try { doc = await docFromLink(location.hash); const cur = await loadLocal('current').catch(() => null); if (cur?.nodes.length) await rememberRecent(cur); UI.toast('Opened a shared design. Your previous design is under New › Recent.'); }
    catch (e) { UI.toast('The link couldn’t be opened: ' + e.message); }
    history.replaceState(null, '', location.pathname + location.search);
  }
  if (!doc) doc = await loadLocal('current').catch(() => null);
  if (!doc) { doc = newDoc(); first = true; }
  buildPalette(); buildPc();
  setDoc(doc);
  if (APP.pc) setScenario('pc');
  SIM.warm();
  setInterval(() => { if (!document.hidden) { SIM.tick(); requestDraw(); } }, 1000);
  if (first) openStart();
  window.__designer = { APP, setDoc, newDoc, select, insertWidgets, paletteEntries, addEntry, undo, redo, setPcList, parseSensorList, THEMES, exportBytes, openTheme, openExport,
                        toPanel, toScreen, docJson: () => JSON.stringify(APP.doc), compile: () => compileDoc(APP.doc, APP.env), handleFile, groupSel, ungroupSel, detach, ready: true };
}
boot();
