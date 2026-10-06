/* ================================================================ assistant network: OpenRouter and Ollama, straight from the browser
   Nothing here runs at page load or when the Assistant tab opens; every request follows a click. Tests replace the
   network with window.__assistFetch and the sign-in redirect with window.__assistNavigate.
   Keys: sessionStorage (this tab) by default, localStorage only when the user ticks "remember". Every github.io project
   page of one account shares an origin, so a remembered key is readable by the account's other pages; the UI says so.
   Keys never go into IndexedDB, designs, share links, exports or error messages. */
const NET = {
  fetch: (url, init) => (window.__assistFetch || window.fetch.bind(window))(url, init),
  go: url => (window.__assistNavigate || (u => location.assign(u)))(url),
};
class LLMError extends Error { constructor(message, o = {}) { super(message); Object.assign(this, o); } }   // o: { status, retry: 'once' | 'rate', forgetKey, kind }
const abortError = () => new LLMError('Stopped.', { kind: 'abort' });
const redact = (s, key) => { let t = String(s ?? ''); if (key) t = t.split(key).join('…'); return t.replace(/sk-or-[\w-]{6,}/g, 'sk-or-…').replace(/Bearer\s+\S+/gi, 'Bearer …').slice(0, 400); };

/* ---- stream readers: complete lines only, whatever the chunking (a chunk may end between \r and \n, or inside a UTF-8 character) ---- */
async function* sseEvents(res) {
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', data = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buf += done ? dec.decode() : dec.decode(value, { stream: true });
      for (;;) {
        const i = buf.search(/[\r\n]/);
        if (i < 0 || (buf[i] === '\r' && i === buf.length - 1 && !done)) break;
        const line = buf.slice(0, i);
        buf = buf.slice(i + (buf[i] === '\r' && buf[i + 1] === '\n' ? 2 : 1));
        if (line === '') { if (data.length) { yield data.join('\n'); data = []; } continue; }
        if (line[0] === ':') continue;                                     /* comments, e.g. ": OPENROUTER PROCESSING" */
        const c = line.indexOf(':');
        if ((c < 0 ? line : line.slice(0, c)) === 'data') data.push(c < 0 ? '' : line.slice(c + 1).replace(/^ /, ''));
      }
      if (done) { if (buf.startsWith('data:')) data.push(buf.slice(5).replace(/^ /, '')); if (data.length) yield data.join('\n'); return; }
    }
  } finally { try { reader.releaseLock(); } catch (e) { /* stream already closed */ } }
}
async function* ndjsonLines(res) {
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  const parse = s => { try { return JSON.parse(s); } catch (e) { throw new LLMError('The local server sent something that isn’t JSON. Is it Ollama?'); } };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buf += done ? dec.decode() : dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) yield parse(line); }
      if (done) { if (buf.trim()) yield parse(buf.trim()); return; }
    }
  } finally { try { reader.releaseLock(); } catch (e) { /* stream already closed */ } }
}

/* ---- keys ---- */
const KEYS = (() => {
  const K = 'aida64-sensorpanels-designer.openrouter-key';
  const st = n => { try { return window[n]; } catch (e) { return null; } };
  const get = n => { try { return st(n)?.getItem(K) || ''; } catch (e) { return ''; } };
  const put = (n, v) => { try { st(n)?.setItem(K, v); } catch (e) { /* storage blocked */ } };
  const del = n => { try { st(n)?.removeItem(K); } catch (e) { /* storage blocked */ } };
  return {
    get: () => get('sessionStorage') || get('localStorage'),
    set(key, remember) { put('sessionStorage', key); if (remember) put('localStorage', key); else del('localStorage'); },
    forget() { del('sessionStorage'); del('localStorage'); },
    remembered: () => !!get('localStorage'),
    valid: k => typeof k === 'string' && /^\S{20,300}$/.test(k.trim()),
  };
})();

/* ---- OpenRouter ---- */
const OR = {
  BASE: 'https://openrouter.ai/api/v1',
  async error(res, key) {
    let j = null; try { j = await res.json(); } catch (e) { /* not JSON */ }
    const msg = redact(j?.error?.message || res.statusText || '', key), s = res.status;
    if (s === 401) return new LLMError('OpenRouter didn’t accept the key, so it was forgotten. Sign in again or paste a new key.', { status: s, forgetKey: true });
    if (s === 402) return new LLMError('Your OpenRouter account is out of credits. Add credits on openrouter.ai, or pick a model marked free.', { status: s });
    if (s === 403) return new LLMError(`OpenRouter’s moderation flagged the request${msg ? ': ' + msg : ''}.`, { status: s });
    if (s === 404) return new LLMError(`${msg || 'That model isn’t available'}. Pick another model in the settings.`, { status: s });
    if (s === 408) return new LLMError('OpenRouter timed out.', { status: s, retry: 'once' });
    if (s === 429) return new LLMError(`Too many requests${msg ? ' (' + msg + ')' : ''}.`, { status: s, retry: 'rate' });
    if (s === 502 || s === 503) return new LLMError(`The model’s provider is unavailable${msg ? ': ' + msg : ''}.`, { status: s, retry: 'once' });
    return new LLMError(`OpenRouter error ${s}${msg ? ': ' + msg : ''}`, { status: s });
  },
  /* tool-capable models: { id, name, ctx, prompt, completion (USD per token), params, created, free } */
  async models(signal) {
    let res;
    try { res = await NET.fetch(`${OR.BASE}/models?supported_parameters=tools`, { signal }); } catch (e) { throw signal?.aborted ? abortError() : new LLMError('Can’t reach openrouter.ai. Check the connection or an ad blocker.', { kind: 'network' }); }
    if (!res.ok) throw await OR.error(res);
    const j = await res.json();
    return (j.data || []).filter(m => typeof m.id === 'string' && (m.supported_parameters || []).includes('tools')).map(m => ({
      id: m.id, name: String(m.name || m.id).slice(0, 80), ctx: +m.context_length || 0, prompt: +m.pricing?.prompt || 0, completion: +m.pricing?.completion || 0,
      params: m.supported_parameters || [], maxOut: +m.top_provider?.max_completion_tokens || 0, created: +m.created || 0, free: /:free$/.test(m.id) || (!+m.pricing?.prompt && !+m.pricing?.completion),
    })).sort((a, b) => a.name.localeCompare(b.name));
  },
  /* a good default: the newest Claude Sonnet, else the newest GPT or Gemini Pro that takes tools */
  pick(models) {
    for (const re of [/^anthropic\/claude-sonnet/, /^anthropic\/claude/, /^openai\/gpt-\d/, /^google\/gemini-[\d.]+-pro/]) {
      const m = models.filter(x => re.test(x.id) && !x.free && !/:(beta|thinking|online)$/.test(x.id)).sort((a, b) => b.created - a.created)[0];
      if (m) return m;
    }
    return models[0] || null;
  },
  /* one streamed chat completion. -> { text, calls: [{ id, name, args (string) }], reasoning: [], usage, finish } */
  async chat({ key, model, messages, tools, params = {}, signal, onText, onThink }) {
    const body = { model, messages, tools, stream: true, ...params };
    let res;
    try {
      res = await NET.fetch(`${OR.BASE}/chat/completions`, { method: 'POST', signal, body: JSON.stringify(body),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
    } catch (e) { throw signal?.aborted ? abortError() : new LLMError('Can’t reach openrouter.ai. Check the connection or an ad blocker.', { kind: 'network', retry: 'once' }); }
    if (!res.ok) throw await OR.error(res, key);
    const out = { text: '', calls: [], reasoning: [], usage: null, finish: null };
    try {
      for await (const data of sseEvents(res)) {
        if (data === '[DONE]') break;
        let j; try { j = JSON.parse(data); } catch (e) { continue; }
        if (j.error) throw new LLMError(`The model stopped with an error: ${redact(j.error.message || j.error.code || 'unknown', key)}`, { status: j.error.code, kind: 'stream', retry: /timeout|disconnect|overload|unavailable/i.test(String(j.error.message)) ? 'once' : undefined });
        const ch = j.choices?.[0], d = ch?.delta || ch?.message || {};
        if (typeof d.content === 'string' && d.content) { out.text += d.content; onText?.(out.text); }
        if (d.reasoning || d.reasoning_details?.length) onThink?.();
        if (Array.isArray(d.reasoning_details)) out.reasoning.push(...d.reasoning_details);
        for (const tc of d.tool_calls || []) {
          let c = Number.isInteger(tc.index) ? out.calls[tc.index] : tc.id ? out.calls.find(x => x.id === tc.id) : null;
          if (!c) { c = { id: '', name: '', args: '' }; if (Number.isInteger(tc.index)) out.calls[tc.index] = c; else out.calls.push(c); }
          if (tc.id) c.id = tc.id;
          const nm = tc.function?.name; if (nm && nm !== c.name) c.name = c.name && !nm.startsWith(c.name) ? c.name + nm : nm;
          const a = tc.function?.arguments; if (a) c.args += typeof a === 'string' ? a : JSON.stringify(a);
        }
        if (ch?.finish_reason) out.finish = ch.finish_reason;
        if (j.usage) out.usage = j.usage;
      }
    } catch (e) {
      if (signal?.aborted) throw abortError();
      if (e instanceof LLMError) throw e;
      throw new LLMError('The connection to openrouter.ai dropped.', { kind: 'network', retry: 'once' });
    }
    out.calls = out.calls.filter(Boolean).map((c, i) => ({ ...c, id: c.id || `call_${i + 1}` }));
    return out;
  },
};

/* ---- OpenRouter sign-in (OAuth PKCE): the verifier and state wait in sessionStorage while the user is on openrouter.ai ---- */
const PKCE = {
  K: 'aida64-sensorpanels-designer.openrouter-pkce',
  challenge: async v => B64U.enc(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))),
  async start(remember) {
    const verifier = B64U.enc(crypto.getRandomValues(new Uint8Array(48))), state = B64U.enc(crypto.getRandomValues(new Uint8Array(16)));
    const challenge = await PKCE.challenge(verifier);
    sessionStorage.setItem(PKCE.K, JSON.stringify({ verifier, state, at: Date.now(), remember: !!remember }));
    const cb = location.origin + location.pathname;
    return `https://openrouter.ai/auth?callback_url=${encodeURIComponent(cb)}&code_challenge=${challenge}&code_challenge_method=S256&state=${state}&key_label=${encodeURIComponent('AIDA64 Panel Designer')}`;
  },
  pending() { try { return JSON.parse(sessionStorage.getItem(PKCE.K) || 'null'); } catch (e) { return null; } },
  clear() { try { sessionStorage.removeItem(PKCE.K); } catch (e) { /* storage blocked */ } },
  /* back from openrouter.ai: -> { key, remember } or throws. Sends nothing unless the state matches and the code is fresh. */
  async finish(params) {
    const rec = PKCE.pending(); PKCE.clear();
    const code = params.get('code'), state = params.get('state');
    if (!rec || !code) throw new LLMError('The sign-in didn’t start on this page. Try Sign in again.');
    if (!state || state !== rec.state) throw new LLMError('The sign-in reply doesn’t match the request, so it was ignored. Try Sign in again.');
    if (Date.now() - rec.at > 10 * 60 * 1000) throw new LLMError('The sign-in took longer than 10 minutes. Try Sign in again.');
    let res;
    try { res = await NET.fetch(`${OR.BASE}/auth/keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, code_verifier: rec.verifier, code_challenge_method: 'S256' }) }); }
    catch (e) { throw new LLMError('Can’t reach openrouter.ai to finish the sign-in.'); }
    if (!res.ok) { const e = await OR.error(res); throw new LLMError(`The sign-in couldn’t be finished (${res.status}): ${e.message}`); }
    const j = await res.json().catch(() => ({}));
    if (!KEYS.valid(j.key)) throw new LLMError('OpenRouter didn’t send a key.');
    return { key: j.key, remember: rec.remember };
  },
};

/* ---- Ollama on this PC ---- */
const OL = {
  DEFAULT: 'http://127.0.0.1:11434',
  validBase: s => /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(String(s || '')),
  /* Chrome asks before a public page reaches this device; the hint marks the address as loopback so it may ask */
  fetch: (base, path, init = {}) => NET.fetch(base + path, { ...init, targetAddressSpace: 'loopback' }),
  async error(res, model) {
    let t = ''; try { t = await res.text(); } catch (e) { /* no body */ }
    let msg = t; try { msg = JSON.parse(t).error || t; } catch (e) { /* plain text */ }
    return OL.explain(String(msg || res.statusText).slice(0, 300), model, res.status);
  },
  explain(msg, model, status) {
    if (status === 404 || /not found/i.test(msg)) return new LLMError(`Ollama doesn’t have ${model}. Run  ollama pull ${model}  in a terminal, or pick another model.`, { status });
    if (/does not support tools/i.test(msg)) return new LLMError(`${model} can’t use tools. Pick a model marked “tools” (for example qwen3 or llama3.1).`, { status });
    if (/memory|cuda|out of/i.test(msg)) return new LLMError(`Ollama ran out of memory (${msg}). Pick a smaller model or a smaller context size.`, { status });
    return new LLMError(`Ollama error${status ? ' ' + status : ''}: ${msg}`, { status });
  },
  /* -> [{ name, tools, ctx, size }] */
  async models(base, signal) {
    const res = await OL.fetch(base, '/api/tags', { signal });
    if (!res.ok) throw await OL.error(res, '');
    const tags = ((await res.json()).models || []).slice(0, 40);
    return Promise.all(tags.map(async m => {
      let info = {};
      try { const r = await OL.fetch(base, '/api/show', { method: 'POST', body: JSON.stringify({ model: m.name }), signal }); if (r.ok) info = await r.json(); } catch (e) { /* keep going */ }
      const ctx = Object.entries(info.model_info || {}).find(([k]) => /\.context_length$/.test(k))?.[1] || 0;
      return { name: String(m.name), tools: Array.isArray(info.capabilities) ? info.capabilities.includes('tools') : null, ctx: +ctx || 0, size: +m.size || 0 };
    }));
  },
  /* why Connect failed: 'origins' (running, but this site isn't allowed), 'blocked' (the browser said no) or 'down' */
  async diagnose(base) {
    let reachable = false;
    try { await NET.fetch(base + '/api/version', { mode: 'no-cors', targetAddressSpace: 'loopback' }); reachable = true; } catch (e) { /* refused or blocked */ }
    if (reachable) return 'origins';
    for (const name of ['local-network-access', 'loopback-network', 'local-network']) {
      try { const p = await navigator.permissions.query({ name }); if (p.state === 'denied') return 'blocked'; } catch (e) { /* unknown permission name */ }
    }
    return 'down';
  },
  /* one streamed chat. Tool calls arrive whole, with arguments as objects. */
  async chat({ base, model, messages, tools, numCtx, signal, onText, onThink }) {
    const body = { model, messages, tools, stream: true, keep_alive: '15m', options: { num_ctx: numCtx, num_predict: 4096, temperature: .3 } };
    let res;
    try { res = await OL.fetch(base, '/api/chat', { method: 'POST', body: JSON.stringify(body), signal }); }
    catch (e) { throw signal?.aborted ? abortError() : new LLMError('Can’t reach Ollama. Is it still running?', { kind: 'network' }); }
    if (!res.ok) throw await OL.error(res, model);
    const out = { text: '', calls: [], reasoning: [], usage: null, finish: null };
    try {
      for await (const j of ndjsonLines(res)) {
        if (j.error) throw OL.explain(String(j.error), model);
        const m = j.message || {};
        if (m.thinking) onThink?.();
        if (m.content) { out.text += m.content; onText?.(out.text); }
        for (const tc of m.tool_calls || []) out.calls.push({ id: `call_${out.calls.length + 1}`, name: String(tc.function?.name || ''), args: tc.function?.arguments ?? {} });
        if (j.done) { out.finish = j.done_reason || 'stop'; out.usage = { prompt_tokens: j.prompt_eval_count || 0, completion_tokens: j.eval_count || 0 }; }
      }
    } catch (e) {
      if (signal?.aborted) throw abortError();
      if (e instanceof LLMError) throw e;
      throw new LLMError('The connection to Ollama dropped.', { kind: 'network' });
    }
    return out;
  },
};
