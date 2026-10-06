/* ================================================================ assistant: the Assistant tab
   Three ways to reach a model the user already has: copy & paste (any chat), OpenRouter (their key, from this page) and
   Ollama (their PC). A request is a short tool loop (get_design, get_node, find_sensors, apply_ops). apply_ops runs AI.exec
   on a copy of the design, asks before big deletions, then swaps the copy in through one sticky edit(), so a whole
   request is one Undo step. The transcript is plain text (textContent only): nothing in it can load links or images. */
const ASSIST = {
  set: { route: 'paste', orModel: '', orParams: [], orMaxOut: 0, ollamaBase: OL.DEFAULT, ollamaModel: '', numCtx: 16384, values: false, noStore: false },
  chat: [], turns: [], busy: null, draft: '', open: false,
  models: { or: null, ol: null }, ol: { state: 'idle', diag: null }, orLoading: false,
};
const AI_CHAT_KEY = 'aida64-sensorpanels-designer.assist-chat';
const AI_ROUTES = [['paste', 'Copy & paste'], ['openrouter', 'OpenRouter'], ['ollama', 'Ollama']];
const AI_CTX = [8192, 16384, 32768, 65536];
let aiLog = null, aiSeq = 0, aiSaveTimer = 0;
const aiWait = () => (typeof window.__assistWaitMs === 'number' ? window.__assistWaitMs : 1000);

/* ---------------------------------------------------------------- settings and the conversation (no keys in either) */
function aiSettings(r) {
  const s = { ...ASSIST.set }; r = r && typeof r === 'object' ? r : {};
  if (AI_ROUTES.some(x => x[0] === r.route)) s.route = r.route;
  if (typeof r.orModel === 'string' && /^[\w.\-/:]{1,120}$/.test(r.orModel)) s.orModel = r.orModel;
  if (Array.isArray(r.orParams)) s.orParams = r.orParams.filter(p => typeof p === 'string' && p.length < 40).slice(0, 60);
  s.orMaxOut = sNum(r.orMaxOut, 0, 1e7, 0);
  if (OL.validBase(r.ollamaBase)) s.ollamaBase = r.ollamaBase;
  if (typeof r.ollamaModel === 'string' && r.ollamaModel.length <= 120) s.ollamaModel = r.ollamaModel;
  if (AI_CTX.includes(r.numCtx)) s.numCtx = r.numCtx;
  s.values = r.values === true; s.noStore = r.noStore === true;
  return s;
}
const aiSaveSettings = () => STORE.set('assist', { ...ASSIST.set }).catch(() => {});
function aiSaveChat() {
  clearTimeout(aiSaveTimer); aiSaveTimer = 0;
  const plain = it => it.t === 'paste' ? { t: 'note', text: `Copied a prompt for: ${it.request}` } : it.t === 'preview' ? { t: 'note', text: it.text ? `${it.text}\n(${it.summary})` : it.summary }
    : it.t === 'bar' ? { t: 'note', text: it.text } : { t: it.t, text: String(it.text || '').slice(0, 8000) };
  try { sessionStorage.setItem(AI_CHAT_KEY, JSON.stringify({ chat: ASSIST.chat.filter(it => it.t !== 'ai' || it.text).slice(-150).map(plain), turns: ASSIST.turns.slice(-12) })); } catch (e) { /* storage full or blocked */ }
}
const aiSaveSoon = () => { if (!aiSaveTimer) aiSaveTimer = setTimeout(aiSaveChat, 400); };
function aiRestoreChat() {
  try {
    const j = JSON.parse(sessionStorage.getItem(AI_CHAT_KEY) || 'null'); if (!j) return;
    const T = ['user', 'ai', 'act', 'note', 'err', 'cost'];
    ASSIST.chat = (Array.isArray(j.chat) ? j.chat : []).filter(it => it && T.includes(it.t) && typeof it.text === 'string').map(it => ({ t: it.t, text: it.text.slice(0, 8000), id: 'i' + (++aiSeq) }));
    ASSIST.turns = (Array.isArray(j.turns) ? j.turns : []).filter(t => t && typeof t.user === 'string').map(t => ({ user: t.user.slice(0, 2000), reply: String(t.reply || '').slice(0, 2000), done: String(t.done || '').slice(0, 200) })).slice(-12);
  } catch (e) { /* ignore a broken record */ }
}

/* ---------------------------------------------------------------- transcript */
function aiItemEl(it) {
  let el;
  switch (it.t) {
    case 'user': el = h('div', { class: 'ai-msg user', text: it.text }); break;
    case 'ai': el = h('div', { class: 'ai-msg ai' + (it.text ? '' : ' wait'), text: it.text || it.wait || 'Thinking…' }); break;
    case 'act': el = h('div', { class: 'ai-act', text: it.text }); break;
    case 'err': el = h('div', { class: 'ai-note err', text: it.text }); break;
    case 'cost': el = h('div', { class: 'ai-cost', text: it.text }); break;
    case 'paste': el = aiPasteEl(it); break;
    case 'preview': el = aiPreviewEl(it); break;
    case 'bar': el = aiBarEl(it); break;
    default: el = h('div', { class: 'ai-note', text: it.text });
  }
  el.dataset.i = it.id;
  return el;
}
function aiPush(it) {
  it.id = 'i' + (++aiSeq); ASSIST.chat.push(it);
  if (aiLog) { aiLog.querySelector('.ai-intro')?.remove(); const near = aiLog.scrollHeight - aiLog.scrollTop - aiLog.clientHeight < 80; aiLog.append(aiItemEl(it)); if (near || it.t === 'user') aiLog.scrollTop = aiLog.scrollHeight; }
  aiSaveSoon(); return it;
}
function aiRedraw(it) { const el = aiLog?.querySelector(`[data-i="${it.id}"]`); if (el) el.replaceWith(aiItemEl(it)); aiSaveSoon(); }
function aiDrop(it) { ASSIST.chat = ASSIST.chat.filter(x => x !== it); aiLog?.querySelector(`[data-i="${it.id}"]`)?.remove(); }
function aiText(it, text) {
  it.text = text; const el = aiLog?.querySelector(`[data-i="${it.id}"]`); if (!el) return;
  const near = aiLog.scrollHeight - aiLog.scrollTop - aiLog.clientHeight < 80;
  el.classList.toggle('wait', !text); el.textContent = text || it.wait || 'Thinking…';
  if (near) aiLog.scrollTop = aiLog.scrollHeight;
}
const aiNote = (text, t = 'note') => aiPush({ t, text });
function aiIntro() {
  const r = ASSIST.set.route;
  return h('div', { class: 'ai-intro' },
    h('p', { text: 'Ask for changes in your own words. The assistant moves, adds and restyles parts, using your PC’s sensors when Your PC has a list. Every change can be undone.' }),
    h('p', { class: 'hint', text: r === 'paste' ? 'Copy & paste works with any chat you use: ChatGPT, Claude, Microsoft Copilot, Gemini. Nothing is sent from this page.'
      : r === 'openrouter' ? 'OpenRouter runs many models (Claude, GPT, Gemini, Llama…) with your own account; you pay OpenRouter per request.'
      : 'Ollama runs a model on this PC: free and private, but slower, and small models make more mistakes.' }),
    h('p', { class: 'hint', text: 'Try: “add every fan under the cooling row”, “make a 1024×600 version with CPU and GPU temperatures”, “make the clock bigger”.' }));
}

/* ---------------------------------------------------------------- the pane */
const aiAvail = () => ({ paste: true, openrouter: !inViewer, ollama: !inViewer });
const aiCanSignIn = () => !inViewer && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
function buildAssist() {
  const pane = $('pane-ai'); if (!pane) return;
  const s = ASSIST.set; if (!aiAvail()[s.route]) s.route = 'paste';
  const seg = h('div', { class: 'seg ai-routes', role: 'group', 'aria-label': 'How the assistant reaches a model' });
  for (const [k, l] of AI_ROUTES) {
    if (!aiAvail()[k]) continue;
    const b = h('button', { type: 'button', 'aria-pressed': String(k === s.route), 'data-r': k, text: l, ...(ASSIST.busy ? { disabled: true } : {}) });
    on(b, 'click', () => { if (ASSIST.busy || s.route === k) return; s.route = k; aiSaveSettings(); buildAssist(); });
    seg.append(b);
  }
  aiLog = h('div', { class: 'ai-log', role: 'log', 'aria-label': 'Assistant conversation' });
  if (!ASSIST.chat.length) aiLog.append(aiIntro());
  for (const it of ASSIST.chat) aiLog.append(aiItemEl(it));
  pane.replaceChildren(seg, ...(s.route === 'openrouter' ? [aiOrSettings()] : s.route === 'ollama' ? [aiOlSettings()] : []), aiLog, aiComposer());
  aiChip();
  requestAnimationFrame(() => { if (aiLog) aiLog.scrollTop = aiLog.scrollHeight; });
}
function aiComposer() {
  const s = ASSIST.set, busy = !!ASSIST.busy;
  const ta = h('textarea', { id: 'ai-input', rows: 3, 'aria-label': 'Request for the assistant', placeholder: 'Ask for a change… (Enter sends, Shift+Enter starts a new line)' });
  ta.value = ASSIST.draft;
  on(ta, 'input', () => { ASSIST.draft = ta.value; });
  on(ta, 'keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); aiSend(); } });
  const send = h('button', { type: 'button', class: 'btn primary', id: 'ai-send', text: s.route === 'paste' ? 'Copy prompt' : 'Send', ...(busy ? { disabled: true } : {}) });
  const stop = h('button', { type: 'button', class: 'btn', id: 'ai-stop', text: 'Stop', ...(busy ? {} : { hidden: true }) });
  const clear = h('button', { type: 'button', class: 'btn ghost', id: 'ai-clear', text: 'Clear', title: 'Start a new conversation', ...(busy ? { disabled: true } : {}) });
  on(send, 'click', aiSend); on(stop, 'click', () => ASSIST.busy?.ctrl.abort()); on(clear, 'click', aiClear);
  const vals = h('input', { type: 'checkbox', id: 'ai-values', checked: s.values });
  on(vals, 'change', () => { s.values = vals.checked; aiSaveSettings(); });
  const disclose = s.route === 'paste' ? 'The prompt holds your request, a summary of the design and your sensor IDs and names. You choose where to paste it.'
    : `Sent to ${s.route === 'ollama' ? 'Ollama on this PC' : 'OpenRouter and the model’s provider'}: your request, a summary of the design and the sensor IDs and names it asks for. Readings only when ticked.`;
  return h('div', { class: 'ai-compose' },
    h('div', { class: 'ai-ctx' }, h('span', { class: 'chip', id: 'ai-chip', hidden: true }), h('label', { title: 'Adds the readings from when your sensor list was read' }, vals, 'Include readings')),
    ta, h('div', { class: 'acts' }, send, stop, h('span', { class: 'grow' }), clear), h('p', { class: 'hint', text: disclose }));
}
function aiBusy(on_) {
  for (const b of document.querySelectorAll('#pane-ai .ai-routes button, #ai-clear')) b.disabled = on_;
  const send = $('ai-send'), stop = $('ai-stop'); if (send) send.disabled = on_; if (stop) stop.hidden = !on_;
}
/* what "this" means: the selection, shown above the request box */
function aiChip() {
  const c = $('ai-chip'); if (!c) return;
  const n = selNodes(), g = APP.scope && findNode(APP.doc, APP.scope)?.node;
  const what = n.length === 1 ? (n[0].name || (isGroup(n[0]) ? 'a group' : WT[n[0].type]?.label || n[0].type)) : `${n.length} parts`;
  c.hidden = !n.length && !g;
  c.textContent = n.length ? `Selected: ${what}` : g ? `Inside: ${g.name}` : '';
}
function aiClear() { if (ASSIST.busy) return; ASSIST.chat = []; ASSIST.turns = []; aiSaveChat(); buildAssist(); }

/* ---------------------------------------------------------------- OpenRouter settings and sign-in */
const aiPrice = v => { const m = v * 1e6; return m >= 10 ? m.toFixed(0) : m >= 1 ? m.toFixed(2) : m.toFixed(3); };
const aiModelText = m => `${m.name}${m.free ? ' · free' : ` · $${aiPrice(m.prompt)} / $${aiPrice(m.completion)}`}${m.ctx ? ` · ${Math.round(m.ctx / 1000)}k` : ''}`;
function aiOrSettings() {
  const s = ASSIST.set, key = KEYS.get();
  const sum = h('summary', { text: key ? `OpenRouter · ${s.orModel || 'choose a model'}` : 'OpenRouter · not signed in' });
  const d = h('details', { class: 'sec ai-set', ...(ASSIST.open || !key ? { open: true } : {}) }, sum);
  on(sum, 'click', () => setTimeout(() => { ASSIST.open = d.open; if (d.open && !ASSIST.models.or) aiLoadOrModels(); }, 0));
  const box = h('div');
  if (!key) {
    const rem = h('input', { type: 'checkbox', id: 'ai-remember' });
    if (aiCanSignIn()) { const b = h('button', { type: 'button', class: 'btn primary', id: 'ai-signin', text: 'Sign in with OpenRouter' }); on(b, 'click', () => aiSignIn(rem.checked)); box.append(b); }
    const inp = h('input', { class: 'fld', type: 'password', id: 'ai-key', placeholder: aiCanSignIn() ? 'or paste a key (sk-or-…)' : 'Paste an OpenRouter key (sk-or-…)', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'OpenRouter API key' });
    const use = h('button', { type: 'button', class: 'btn', id: 'ai-usekey', text: 'Use key' });
    on(use, 'click', () => { const k = inp.value.trim(); if (!KEYS.valid(k)) return UI.toast('That doesn’t look like an OpenRouter key.'); KEYS.set(k, rem.checked); inp.value = ''; ASSIST.open = true; buildAssist(); });
    on(inp, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); use.click(); } });
    box.append(h('div', { class: 'ai-key' }, inp, use), h('label', { class: 'ai-check' }, rem, 'Remember on this device'),
      h('p', { class: 'hint', text: `Without “remember” the key is kept only until this tab closes. A remembered key can be read by other pages on ${/^https?:$/.test(location.protocol) ? location.host : 'this site'}, so give it a credit limit on openrouter.ai.` }));
  } else {
    const forget = h('button', { type: 'button', class: 'btn ghost', id: 'ai-forget', text: 'Forget key' });
    on(forget, 'click', () => { KEYS.forget(); UI.toast('Key forgotten. Delete it on openrouter.ai if you no longer need it.'); buildAssist(); });
    box.append(h('p', { class: 'hint', text: `Key …${key.slice(-4)}, ${KEYS.remembered() ? 'remembered on this device' : 'kept until this tab closes'}.` }),
      h('div', { class: 'acts' }, forget, h('a', { class: 'btn ghost', href: 'https://openrouter.ai/settings/keys', target: '_blank', rel: 'noopener noreferrer', text: 'Your keys ↗' })));
  }
  box.append(aiOrModels());
  const ns = h('input', { type: 'checkbox', id: 'ai-nostore', checked: s.noStore });
  on(ns, 'change', () => { s.noStore = ns.checked; aiSaveSettings(); });
  box.append(h('label', { class: 'ai-check' }, ns, 'Only use providers that don’t store my prompts'));
  d.append(box);
  return d;
}
function aiOrModels() {
  const s = ASSIST.set, list = ASSIST.models.or, wrap = h('div', { class: 'ai-models' });
  if (!list) {
    const b = h('button', { type: 'button', class: 'btn ghost', id: 'ai-models', text: ASSIST.orLoading ? 'Loading models…' : 'Choose a model…', ...(ASSIST.orLoading ? { disabled: true } : {}) });
    on(b, 'click', () => { ASSIST.open = true; aiLoadOrModels(); });
    wrap.append(h('p', { class: 'hint', text: s.orModel ? `Model: ${s.orModel}` : 'Model: picked for you when you send, or choose one.' }), b);
    return wrap;
  }
  const q = h('input', { type: 'search', class: 'search', placeholder: `Search ${list.length} models that use tools`, 'aria-label': 'Search models' });
  const sel = h('select', { class: 'fld ai-select', size: 6, id: 'ai-model', 'aria-label': 'Model' });
  const fill = () => { const t = q.value.toLowerCase(); sel.replaceChildren(...list.filter(m => !t || `${m.id} ${m.name}`.toLowerCase().includes(t)).slice(0, 400).map(m => h('option', { value: m.id, text: aiModelText(m) }))); sel.value = s.orModel; };
  on(q, 'input', fill);
  on(sel, 'change', () => { const m = list.find(x => x.id === sel.value); if (m) { aiChooseOr(m); const sm = sel.closest('details')?.querySelector('summary'); if (sm) sm.textContent = `OpenRouter · ${m.id}`; } });
  fill();
  wrap.append(q, sel, h('p', { class: 'hint', text: 'Price per million tokens in / out. One request sends about 6,000–20,000 tokens. Free models are rate-limited.' }));
  return wrap;
}
function aiChooseOr(m) { const s = ASSIST.set; s.orModel = m.id; s.orParams = m.params; s.orMaxOut = m.maxOut || 0; aiSaveSettings(); }
async function aiLoadOrModels() {
  if (ASSIST.orLoading || ASSIST.models.or) return ASSIST.models.or;
  ASSIST.orLoading = true; if (ASSIST.set.route === 'openrouter' && !ASSIST.busy) buildAssist();
  try {
    const list = await OR.models();
    ASSIST.models.or = list;
    if (!list.some(m => m.id === ASSIST.set.orModel)) { const m = OR.pick(list); if (m) aiChooseOr(m); }
    else aiChooseOr(list.find(m => m.id === ASSIST.set.orModel));
  } catch (e) { UI.toast(e.message); }
  finally { ASSIST.orLoading = false; if (ASSIST.set.route === 'openrouter' && !ASSIST.busy) buildAssist(); }
  return ASSIST.models.or;
}
async function aiSignIn(remember) {
  try {
    await saveLocal(APP.doc, 'current').catch(() => {});           /* the design is back after the round trip */
    aiSaveChat();
    NET.go(await PKCE.start(remember));
  } catch (e) { UI.toast('Sign-in couldn’t start: ' + e.message); }
}

/* ---------------------------------------------------------------- Ollama settings */
async function aiOlConnect(base) {
  const s = ASSIST.set;
  if (!OL.validBase(base)) return UI.toast('Use http://127.0.0.1:PORT or http://localhost:PORT.');
  s.ollamaBase = base; aiSaveSettings();
  ASSIST.ol = { state: 'busy', diag: null }; ASSIST.open = true; buildAssist();
  try {
    const list = await OL.models(base);
    ASSIST.models.ol = list; ASSIST.ol = { state: 'ok', diag: list.length ? null : 'empty' };
    const m = list.find(x => x.name === s.ollamaModel && x.tools !== false) || list.find(x => x.tools) || list.find(x => x.tools === null) || null;
    s.ollamaModel = m ? m.name : '';
    if (m?.ctx && s.numCtx > m.ctx) s.numCtx = AI_CTX.filter(n => n <= m.ctx).pop() || AI_CTX[0];
    aiSaveSettings();
  } catch (e) {
    ASSIST.models.ol = null;
    ASSIST.ol = { state: 'fail', diag: e instanceof LLMError && e.status ? { msg: e.message } : await OL.diagnose(base) };
  }
  buildAssist();
}
function aiOlDiag(diag) {
  const base = ASSIST.set.ollamaBase, origin = location.origin;
  if (diag === 'origins') {
    if (origin === 'null' || location.protocol === 'file:') return h('p', { class: 'note warn', text: 'Ollama is running, but a page opened from a file can’t be allowed to use it. Open the designer from its website instead.' });
    return h('div', { class: 'note warn ai-diag' },
      h('p', { text: 'Ollama is running but doesn’t allow this page yet. Allow it once:' }),
      h('ol', { class: 'steps' },
        h('li', {}, 'Press Start, type ', h('b', {}, 'environment'), ' and open ', h('b', {}, 'Edit environment variables for your account'), '.'),
        h('li', {}, 'Add ', h('b', {}, 'OLLAMA_ORIGINS'), ' with the value below. If it already exists, add it after a comma.', cmdBox(origin)),
        h('li', {}, 'Quit Ollama from its icon by the clock, start it again, then press Connect.')),
      h('p', { class: 'hint', text: 'Or run this in a terminal (it replaces an existing value):' }), cmdBox(`setx OLLAMA_ORIGINS "${origin}"`));
  }
  if (diag === 'blocked') return h('p', { class: 'note warn', text: 'The browser blocked this page from reaching apps on your PC. Click the icon left of the address, allow access to apps on this device (local network), then press Connect.' });
  if (diag === 'down') return h('p', { class: 'note warn', text: `Ollama isn’t answering at ${base}. Start Ollama (from ollama.com), then press Connect. If the browser asks to let this page reach apps on your device, choose Allow.` });
  if (diag === 'empty') return h('div', { class: 'note warn' }, h('p', { text: 'Ollama has no models yet. Run this in a terminal, then press Connect:' }), cmdBox('ollama pull qwen3:8b'));
  return h('p', { class: 'note warn', text: diag?.msg || 'Ollama couldn’t be reached.' });
}
function aiOlSettings() {
  const s = ASSIST.set, st = ASSIST.ol, list = ASSIST.models.ol;
  const sum = h('summary', { text: st.state === 'ok' && s.ollamaModel ? `Ollama · ${s.ollamaModel} · ${s.numCtx / 1024}k` : s.ollamaModel ? `Ollama · ${s.ollamaModel}` : 'Ollama · not connected' });
  const d = h('details', { class: 'sec ai-set', ...(ASSIST.open || !s.ollamaModel || st.diag ? { open: true } : {}) }, sum);
  on(sum, 'click', () => setTimeout(() => { ASSIST.open = d.open; }, 0));
  const base = h('input', { class: 'fld', type: 'text', id: 'ai-olbase', value: s.ollamaBase, spellcheck: 'false', 'aria-label': 'Ollama address' });
  const go = h('button', { type: 'button', class: 'btn' + (st.state === 'ok' ? '' : ' primary'), id: 'ai-connect', text: st.state === 'busy' ? 'Connecting…' : st.state === 'ok' ? 'Reconnect' : 'Connect', ...(st.state === 'busy' ? { disabled: true } : {}) });
  on(go, 'click', () => aiOlConnect(base.value.trim()));
  const box = h('div', {}, h('p', { class: 'hint', text: 'Runs a model on this PC with Ollama. Nothing is sent until you press Connect; the browser may ask to let this page reach apps on your device.' }), h('div', { class: 'ai-key' }, base, go));
  if (st.diag) box.append(aiOlDiag(st.diag));
  if (list?.length) {
    const sel = h('select', { class: 'fld', id: 'ai-olmodel', 'aria-label': 'Model' });
    for (const m of list) sel.append(h('option', { value: m.name, text: `${m.name}${m.tools === false ? ' (no tools)' : ''}${m.size ? ` · ${(m.size / 1e9).toFixed(1)} GB` : ''}`, ...(m.tools === false ? { disabled: true } : {}) }));
    sel.value = s.ollamaModel;
    const cur = () => list.find(m => m.name === s.ollamaModel);
    const ctx = h('select', { class: 'fld', id: 'ai-olctx', 'aria-label': 'Context size' });
    const fillCtx = () => { ctx.replaceChildren(...AI_CTX.filter(n => !cur()?.ctx || n <= cur().ctx).map(n => h('option', { value: n, text: `${n / 1024}k tokens` }))); ctx.value = s.numCtx; };
    on(sel, 'change', () => { s.ollamaModel = sel.value; const m = cur(); if (m?.ctx && s.numCtx > m.ctx) s.numCtx = AI_CTX.filter(n => n <= m.ctx).pop() || AI_CTX[0]; fillCtx(); aiSaveSettings(); sum.textContent = `Ollama · ${s.ollamaModel} · ${s.numCtx / 1024}k`; });
    on(ctx, 'change', () => { s.numCtx = +ctx.value; aiSaveSettings(); sum.textContent = `Ollama · ${s.ollamaModel} · ${s.numCtx / 1024}k`; });
    fillCtx();
    box.append(h('div', { class: 'f' }, h('label', { for: 'ai-olmodel', text: 'Model' }), sel), h('div', { class: 'f' }, h('label', { for: 'ai-olctx', text: 'Context' }), ctx),
      h('p', { class: 'hint', text: 'A bigger context uses more memory; 16k fits most designs.' }));
  }
  box.append(h('p', { class: 'hint', text: 'Good models with tools: qwen3:8b or qwen3:14b, llama3.1:8b. Small models make more mistakes; everything they do can be undone.' }));
  d.append(box);
  return d;
}

/* ---------------------------------------------------------------- changes: dry run on a copy, ask before big deletions, then one sticky edit */
const aiIds = doc => { const s = new Set(); eachWidget(doc, w => s.add(w.id)); return s; };
const aiSleep = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(abortError()); }, { once: true }); });
async function aiApply(ops, o) {        /* o: { key, ctx, stats, signal } -> { results, changed } or { declined, total } */
  if (!Array.isArray(ops)) ops = ops && typeof ops === 'object' && typeof ops.op === 'string' ? [ops] : null;
  if (!ops) return { results: [{ ok: false, error: 'ops must be a list of op objects' }], changed: [] };
  for (let n = 0; APP.drag && n < 300; n++) await aiSleep(100, o.signal);          /* never swap the design under a drag */
  for (let tries = 0; tries < 3; tries++) {
    const base = snapshot(), copy = JSON.parse(base), dctx = { ...o.ctx, refs: new Map(o.ctx.refs), count: o.ctx.count };
    const r = AI.exec(copy, ops, dctx);
    const before = aiIds(APP.doc), after = aiIds(copy), gone = [...before].filter(id => !after.has(id)).length;
    if (gone > 10 || (gone > 1 && gone / Math.max(1, before.size) > .3)) {
      const v = await ask('Remove parts?', `The assistant wants to remove ${gone} of the ${before.size} parts on the panel.`, [['no', 'Keep them'], ['yes', 'Remove']]);
      if (v !== 'yes') return { declined: gone, total: before.size };
      if (snapshot() !== base) continue;
    }
    o.ctx.refs = dctx.refs; o.ctx.count = dctx.count;
    if (JSON.stringify(copy) !== base) {
      if (coalesce.key !== o.key) o.stats.steps++;
      edit(() => { APP.doc = copy; }, o.key, { sticky: true });
      if (r.results.some(x => x.ok && x.op === 'panel')) { APP.view.fit = true; requestDraw(); }
    }
    r.results.forEach(x => o.stats.results.push(x)); r.changed.forEach(id => o.stats.changed.add(id));
    return r;
  }
  return { results: [{ ok: false, error: 'the design kept changing while you were asked; try again' }], changed: [] };
}
/* after a request: select what changed and offer Keep / Undo while the design is as the request left it */
function aiFinish(stats) {
  if (!stats.changed.size && !stats.steps) return;
  const top = [...new Set([...stats.changed].map(id => { const f = findNode(APP.doc, id); return f ? (f.parent || f.node).id : null; }).filter(Boolean))];
  APP.scope = null; select(top.slice(0, 200));
  aiPush({ t: 'bar', text: `${AI.done(stats.results).replace(/^./, c => c.toUpperCase())}.`, after: cyrb(snapshot()), steps: stats.steps, live: true });
}
function aiBarEl(it) {
  const el = h('div', { class: 'ai-bar' }, h('span', { text: it.text }));
  if (!it.live) return el;
  const keep = h('button', { type: 'button', class: 'btn', text: 'Keep' }), undo_ = h('button', { type: 'button', class: 'btn ghost', text: 'Undo' });
  on(keep, 'click', () => { it.live = false; aiRedraw(it); });
  on(undo_, 'click', () => {
    if (it.steps === 1 && cyrb(snapshot()) === it.after) { undo(); it.live = false; it.text += ' Undone.'; }
    else { it.live = false; it.text += ' The design changed since, so use Undo in the toolbar.'; }
    aiRedraw(it);
  });
  el.append(h('span', { class: 'acts' }, keep, undo_));
  return el;
}

/* ---------------------------------------------------------------- copy & paste */
async function aiPastePrompt(request) {
  const prompt = AI.prompt('paste', { doc: APP.doc, pc: APP.pc, hw: APP.hw, sel: [...APP.sel], scope: APP.scope, history: ASSIST.turns, request, values: ASSIST.set.values });
  aiPush({ t: 'user', text: request });
  let copied = false;
  try { await navigator.clipboard.writeText(prompt); copied = true; } catch (e) { /* show it for manual copying */ }
  aiPush({ t: 'paste', request, prompt, copied, tokens: AI.tokens(prompt) });
}
function aiPasteEl(it) {
  const el = h('div', { class: 'ai-paste' });
  const again = h('button', { type: 'button', class: 'btn ghost', text: 'Copy again' });
  on(again, 'click', async () => { try { await navigator.clipboard.writeText(it.prompt); UI.toast('Prompt copied.'); } catch (e) { UI.toast('Select the prompt and copy it with Ctrl+C.'); } });
  el.append(h('p', { text: it.copied ? `Prompt copied (about ${it.tokens.toLocaleString()} tokens). Paste it into ChatGPT, Claude, Microsoft Copilot or Gemini, then paste the whole reply here.`
    : 'Copy this prompt (Ctrl+A, Ctrl+C), paste it into ChatGPT, Claude, Microsoft Copilot or Gemini, then paste the whole reply below.' }));
  if (!it.copied) el.append(h('textarea', { readonly: true, rows: 4, value: it.prompt, 'aria-label': 'Prompt to copy' }));
  const reply = h('textarea', { rows: 4, class: 'ai-reply', placeholder: 'Paste the reply here', 'aria-label': 'The chat’s reply' });
  const read = h('button', { type: 'button', class: 'btn primary', text: 'Read reply' });
  on(read, 'click', () => aiPasteRead(it, reply.value));
  on(reply, 'paste', () => setTimeout(() => { if (reply.value.trim()) aiPasteRead(it, reply.value); }, 0));
  el.append(reply, h('div', { class: 'acts' }, read, again));
  return el;
}
function aiPasteRead(it, reply) {
  if (!reply.trim() || it.lastReply === reply) return;
  it.lastReply = reply;
  let x;
  try { x = AI.extract(reply); } catch (e) { return aiNote(e.message + ' Ask the chat to send the json block again.', 'err'); }
  if (!x.ops) { if (x.text) aiPush({ t: 'ai', text: x.text.slice(0, 4000) }); ASSIST.turns.push({ user: it.request, reply: x.text.slice(0, 2000), done: 'no changes' }); aiNote('The reply has no changes to apply.'); return; }
  aiPreview(x.ops, x.text, it.request);
}
/* a preview of ops from a pasted reply (or from a model that wrote them as text): result counts, problems and a thumbnail */
function aiPreview(ops, text, request) {
  const copy = JSON.parse(snapshot()), r = AI.exec(copy, ops, { pc: APP.pc, hw: APP.hw });
  const errors = r.results.map((x, i) => !x.ok ? `${i + 1}. ${x.op || 'op'}: ${x.error}` : null).filter(Boolean);
  const warnings = r.results.flatMap((x, i) => (x.warnings || []).map(w => `${i + 1}. ${x.op}: ${w}`));
  aiPush({ t: 'preview', ops, text: String(text || '').slice(0, 4000), request, summary: `${AI.done(r.results)}${warnings.length ? `, ${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : ''}`, errors, warnings, doc: copy, state: 'open' });
}
function aiThumb(doc) {
  const W = 268, k = W / doc.panel.w, c = h('canvas', { class: 'ai-thumb', width: W, height: Math.max(1, Math.round(doc.panel.h * k)), 'aria-label': 'Preview of the changed panel' });
  try { const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.scale(k, k); drawDoc(x, doc, makeEnv(doc, APP.pc), stageIo(doc), Math.min(1, 2 ** Math.ceil(Math.log2(k)))); } catch (e) { console.error(e); }
  return c;
}
function aiPreviewEl(it) {
  const el = h('div', { class: 'ai-preview' });
  if (it.text) el.append(h('div', { class: 'ai-msg ai', text: it.text }));
  el.append(h('p', { text: it.state === 'applied' ? `Applied: ${it.summary}.` : it.state === 'discarded' ? `Discarded: ${it.summary}.` : `The reply would make these changes: ${it.summary}.` }));
  if (it.errors.length) el.append(h('details', { class: 'sec', open: it.state === 'open' }, h('summary', { text: `${it.errors.length} can’t be applied` }), h('ul', { class: 'ai-list err' }, ...it.errors.slice(0, 30).map(e => h('li', { text: e })))));
  if (it.warnings.length) el.append(h('details', { class: 'sec' }, h('summary', { text: `${it.warnings.length} warning${it.warnings.length > 1 ? 's' : ''}` }), h('ul', { class: 'ai-list' }, ...it.warnings.slice(0, 30).map(e => h('li', { text: e })))));
  if (it.state !== 'open') return el;
  if (it.doc) el.append(aiThumb(it.doc));
  const apply = h('button', { type: 'button', class: 'btn primary', text: 'Apply' }), drop = h('button', { type: 'button', class: 'btn ghost', text: 'Discard' });
  on(apply, 'click', async () => {
    if (ASSIST.busy) return;
    const stats = { steps: 0, changed: new Set(), results: [] };
    const r = await aiApply(it.ops, { key: 'ai' + Date.now().toString(36), ctx: { pc: APP.pc, hw: APP.hw }, stats });
    it.state = r.declined ? 'discarded' : 'applied'; it.doc = null; aiRedraw(it);
    ASSIST.turns.push({ user: it.request, reply: it.text.slice(0, 2000), done: r.declined ? 'the user declined removing parts' : AI.done(stats.results) });
    aiFinish(stats);
  });
  on(drop, 'click', () => { it.state = 'discarded'; it.doc = null; aiRedraw(it); ASSIST.turns.push({ user: it.request, reply: it.text.slice(0, 2000), done: 'the user discarded the changes' }); });
  el.append(h('div', { class: 'acts' }, apply, drop));
  return el;
}

/* ---------------------------------------------------------------- OpenRouter and Ollama: the tool loop */
async function aiSend() {
  const ta = $('ai-input'), text = (ta?.value || '').trim(), r = ASSIST.set.route;
  if (!text || ASSIST.busy) return;
  if (r === 'openrouter' && !KEYS.get()) { aiNote('Sign in with OpenRouter or paste a key first (above).'); ASSIST.open = true; return buildAssist(); }
  if (r === 'ollama' && !ASSIST.set.ollamaModel) { aiNote('Connect to Ollama and pick a model first (above).'); ASSIST.open = true; return buildAssist(); }
  ta.value = ''; ASSIST.draft = '';
  if (r === 'paste') return aiPastePrompt(text);
  return aiTurn(r, text);
}
function aiOrParams() {
  const s = ASSIST.set, P = s.orParams || [], p = { provider: { require_parameters: true, ...(s.noStore ? { data_collection: 'deny' } : {}) } };
  if (P.includes('tool_choice')) p.tool_choice = 'auto';
  if (P.includes('max_tokens')) p.max_tokens = Math.min(8192, s.orMaxOut || 8192);
  if (P.includes('temperature')) p.temperature = .3;
  return p;
}
function aiAssistantMsg(route, res) {
  if (route === 'ollama') return { role: 'assistant', content: res.text, ...(res.calls.length ? { tool_calls: res.calls.map(c => ({ function: { name: c.name, arguments: (() => { try { return AI.parseArgs(c.args); } catch (e) { return {}; } })() } })) } : {}) };
  return { role: 'assistant', content: res.text || null, ...(res.calls.length ? { tool_calls: res.calls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args) } })) } : {}),
           ...(res.reasoning?.length ? { reasoning_details: res.reasoning } : {}) };
}
const aiToolMsg = (route, c, content) => route === 'ollama' ? { role: 'tool', tool_name: c.name, content } : { role: 'tool', tool_call_id: c.id, content };
/* keep a request inside the model's context: drop old turns, then shorten old tool results (Ollama would cut silently) */
function aiFit(msgs, hist, ctxTokens, reserve, route) {
  const room = ctxTokens - reserve - 300, tools = AI.tokens(JSON.stringify(AI.TOOLS())), size = () => AI.tokens(JSON.stringify(msgs)) + tools;
  while (size() > room && hist > 0) { msgs.splice(1, 2); hist -= 2; }
  const lastA = msgs.map(m => m.role).lastIndexOf('assistant');
  for (let i = 1; i < lastA && size() > room; i++) if (msgs[i].role === 'tool' && msgs[i].content.length > 200) msgs[i].content = '(older result left out to fit the context; ask again if needed)';
  const n = size();
  if (n > room) throw new LLMError(`This request needs about ${n.toLocaleString()} tokens, more than the model’s ${Math.round(ctxTokens / 1024)}k context allows. `
    + (route === 'ollama' ? 'Choose a bigger context in the Ollama settings.' : 'Pick a model with a bigger context.'));
  return hist;
}
async function aiCall(route, msgs, signal, item) {
  for (let attempt = 0; ; attempt++) {
    const onText = t => aiText(item, t), onThink = () => { if (!item.text) { item.wait = 'Thinking…'; aiText(item, ''); } };
    try {
      if (route === 'openrouter') return await OR.chat({ key: KEYS.get(), model: ASSIST.set.orModel, messages: msgs, tools: AI.TOOLS(), params: aiOrParams(), signal, onText, onThink });
      return await OL.chat({ base: ASSIST.set.ollamaBase, model: ASSIST.set.ollamaModel, messages: msgs, tools: AI.TOOLS(), numCtx: ASSIST.set.numCtx, signal, onText, onThink });
    } catch (e) {
      const waits = e.retry === 'rate' ? [15, 45] : e.retry === 'once' ? [3] : [];
      if (!(e instanceof LLMError) || attempt >= waits.length || signal.aborted) throw e;
      const act = aiPush({ t: 'act', text: '' });
      for (let s = waits[attempt]; s > 0; s--) { aiText(act, `${e.message} Trying again in ${s} s…`); await aiSleep(aiWait(), signal); }
      aiText(act, `${e.message} Trying again…`); aiText(item, '');
    }
  }
}
async function aiTool(c, o) {
  let a;
  try { a = AI.parseArgs(c.args); } catch (e) { aiPush({ t: 'act', text: `The model sent unreadable arguments for ${c.name}` }); return `error: the arguments aren't valid JSON (${e.message}); call ${c.name} again`; }
  const opt = { pc: APP.pc, hw: APP.hw, sel: [...APP.sel], scope: APP.scope };
  switch (c.name) {
    case 'get_design': aiPush({ t: 'act', text: 'Read the design' }); return AI.summary(APP.doc, { ...opt, detail: a.detail === 'groups' || (o.route === 'ollama' && a.detail !== 'full') ? 'groups' : 'full' });
    case 'get_node': { const f = typeof a.id === 'string' ? findNode(APP.doc, a.id[0] === '$' ? o.ctx.refs.get(a.id.slice(1)) : a.id) : null; aiPush({ t: 'act', text: `Looked at ${f ? f.node.name || (isGroup(f.node) ? 'a group' : WT[f.node.type]?.label || f.node.type) : 'a part'}` }); return AI.node(APP.doc, String(a.id ?? ''), { pc: APP.pc, refs: o.ctx.refs }); }
    case 'find_sensors': aiPush({ t: 'act', text: `Looked up sensors: “${String(a.query ?? '').slice(0, 60)}”` }); return AI.findSensors(a.query, { pc: APP.pc, limit: a.limit, values: ASSIST.set.values }).text;
    case 'apply_ops': {
      let ops = a.ops ?? (typeof a.op === 'string' ? [a] : null);
      if (typeof ops === 'string') { try { ops = AI.parseArgs(`{"ops":${ops}}`).ops; } catch (e) { /* reported below */ } }     /* some models send the list as a JSON string */
      const r = await aiApply(ops, o);
      if (r.declined) { aiPush({ t: 'act', text: `You kept the ${r.declined} parts it wanted to remove` }); return JSON.stringify({ error: `The user declined removing ${r.declined} of ${r.total} parts, so nothing changed. Don't remove them; ask the user first if it's needed.` }); }
      const warn = r.results.reduce((s, x) => s + (x.warnings?.length || 0), 0);
      aiPush({ t: 'act', text: `${AI.done(r.results).replace(/^./, ch => ch.toUpperCase())}${warn ? ` (${warn} warning${warn > 1 ? 's' : ''})` : ''}` });
      return JSON.stringify({ results: r.results });
    }
  }
  aiPush({ t: 'act', text: `The model asked for an unknown tool (${String(c.name).slice(0, 30)})` });
  return `error: there is no tool ${JSON.stringify(String(c.name).slice(0, 30))}; tools: get_design, get_node, find_sensors, apply_ops`;
}
async function aiTurn(route, text) {
  const ctrl = new AbortController(), key = 'ai' + Date.now().toString(36), maxRounds = route === 'ollama' ? 6 : 8;
  const o = { route, key, signal: ctrl.signal, ctx: { pc: APP.pc, hw: APP.hw, refs: new Map(), count: 0 }, stats: { steps: 0, changed: new Set(), results: [] } };
  ASSIST.busy = { ctrl }; aiBusy(true);
  aiPush({ t: 'user', text });
  const { system, user } = AI.prompt('api', { doc: APP.doc, pc: APP.pc, hw: APP.hw, sel: [...APP.sel], scope: APP.scope, request: text, detail: route === 'ollama' ? 'groups' : 'full' });
  const past = AI.history(ASSIST.turns, 'api'), msgs = [{ role: 'system', content: system }, ...past, { role: 'user', content: user }];
  let hist = past.length, reply = '', usage = { cost: 0, hasCost: false, tin: 0, tout: 0 };
  try {
    for (let round = 0; ; round++) {
      if (round >= maxRounds) { aiNote(`Stopped after ${maxRounds} rounds. Ask again to continue.`); break; }
      if (route === 'openrouter' && !ASSIST.set.orModel) { const list = await aiLoadOrModels(); if (!ASSIST.set.orModel) throw new LLMError(list ? 'No model takes tools right now.' : 'The model list couldn’t be loaded.'); }
      if (route === 'ollama') hist = aiFit(msgs, hist, ASSIST.set.numCtx, 4096, route);
      else { const m = ASSIST.models.or?.find(x => x.id === ASSIST.set.orModel); if (m?.ctx) hist = aiFit(msgs, hist, m.ctx, Math.min(8192, ASSIST.set.orMaxOut || 8192), route); }
      const item = aiPush({ t: 'ai', text: '', wait: route === 'ollama' && round === 0 ? 'Loading the model…' : 'Thinking…' });
      const res = await aiCall(route, msgs, ctrl.signal, item);
      if (res.usage) { usage.tin += +res.usage.prompt_tokens || 0; usage.tout += +res.usage.completion_tokens || 0; if (typeof res.usage.cost === 'number') { usage.cost += res.usage.cost; usage.hasCost = true; } }
      if (res.text.trim()) { aiText(item, res.text.trim()); reply = res.text.trim(); } else aiDrop(item);
      if (!res.calls.length) {
        if (/["“']?ops["”']?\s*:/.test(res.text)) { try { const x = AI.extract(res.text); if (x.ops) { aiNote('The model wrote its changes as text instead of applying them; check them here:'); aiPreview(x.ops, '', text); } } catch (e) { /* plain text after all */ } }
        if (res.finish === 'length') aiNote('The reply hit the length limit and was cut off.');
        else if (!res.text.trim() && round === 0) aiNote('The model sent an empty reply. Try again or pick another model.');
        break;
      }
      msgs.push(aiAssistantMsg(route, res));
      for (const [i, c] of res.calls.entries()) {
        const out = i < 12 ? await aiTool(c, o) : 'error: at most 12 tool calls per round; call it again in the next round';
        msgs.push(aiToolMsg(route, c, out));
        if (ctrl.signal.aborted) throw abortError();
      }
    }
  } catch (e) {
    if (e?.kind === 'abort') aiNote('Stopped.');
    else { if (e?.forgetKey) KEYS.forget(); aiNote(e instanceof LLMError ? e.message : `Something went wrong: ${e?.message || e}`, 'err'); if (!(e instanceof LLMError)) console.error(e); }
    if (e?.forgetKey) { ASSIST.busy = null; buildAssist(); }
  } finally {
    ASSIST.busy = null; aiBusy(false);
    if (usage.tin || usage.tout) aiPush({ t: 'cost', text: `${usage.hasCost ? `$${usage.cost < .01 ? usage.cost.toFixed(4) : usage.cost.toFixed(3)} · ` : ''}${usage.tin.toLocaleString()} tokens in · ${usage.tout.toLocaleString()} out${route === 'ollama' ? ' · on this PC' : ''}` });
    ASSIST.turns.push({ user: text, reply: reply.slice(0, 2000), done: AI.done(o.stats.results) }); ASSIST.turns = ASSIST.turns.slice(-12);
    aiFinish(o.stats); aiSaveChat();
  }
}

/* ---------------------------------------------------------------- boot: settings, the conversation, and the way back from OpenRouter */
async function assistBoot() {
  try { ASSIST.set = aiSettings(await STORE.get('assist')); } catch (e) { /* defaults */ }
  aiRestoreChat();
  UI.after.push(aiChip);
  const q = new URLSearchParams(location.search);
  if (q.has('code') && q.has('state')) {
    history.replaceState(null, '', location.pathname + location.hash);        /* the code never stays in the address bar */
    showTab('ai');
    ASSIST.set.route = 'openrouter'; ASSIST.open = true;
    try { const { key, remember } = await PKCE.finish(q); KEYS.set(key, remember); aiSaveSettings(); aiNote('Signed in with OpenRouter. Choose a model above, or just send a request.'); }
    catch (e) { aiNote(e.message, 'err'); }
  } else if (PKCE.pending() && Date.now() - PKCE.pending().at > 10 * 60 * 1000) PKCE.clear();
  buildAssist();
}
