/**
 * worker.js — runs in a Web Worker context.
 *
 * Accepted messages:
 *   { action: 'parse',  text: string }
 *   { action: 'filter', har: object, mode: 'visual'|'jq', options: object }
 *
 * Posted back:
 *   { type: 'parsed',  har: object, meta: { totalEntries, methods, domains, mimes } }
 *   { type: 'result',  filteredHar: object, matched: number, total: number }
 *   { type: 'error',   message: string }
 */

'use strict';

/* ── jq-wasm lazy loader ──────────────────────────────────── */
let jqModule = null;

async function loadJq() {
  if (jqModule) return jqModule;
  // ESM build from CDN — works in module workers
  const mod = await import('https://cdn.jsdelivr.net/npm/jq-wasm@1.1.0-jq-1.8.1/dist/index.min.js');
  // The package exports a default initialiser function
  jqModule = mod.default ? await mod.default() : mod;
  return jqModule;
}

/* ── Message handler ──────────────────────────────────────── */
self.onmessage = async function (evt) {
  const msg = evt.data;

  try {
    if (msg.action === 'parse') {
      await handleParse(msg.text);
    } else if (msg.action === 'filter') {
      await handleFilter(msg.har, msg.mode, msg.options);
    } else {
      throw new Error('Unknown action: ' + msg.action);
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err.message || err) });
  }
};

/* ── Parse ────────────────────────────────────────────────── */
function handleParse(text) {
  let har;
  try {
    har = JSON.parse(text);
  } catch (e) {
    throw new Error('Invalid JSON: ' + e.message);
  }

  if (!har || !har.log || !Array.isArray(har.log.entries)) {
    throw new Error('File does not look like a valid HAR (missing log.entries).');
  }

  const entries = har.log.entries;
  const methods = [...new Set(entries.map(e => e.request?.method).filter(Boolean))].sort();
  const domains = [...new Set(
    entries.map(e => {
      try { return new URL(e.request?.url ?? '').hostname; } catch { return null; }
    }).filter(Boolean)
  )].sort();
  const mimes = [...new Set(
    entries.map(e => e.response?.content?.mimeType?.split(';')[0].trim()).filter(Boolean)
  )].sort();

  self.postMessage({
    type: 'parsed',
    har,
    meta: { totalEntries: entries.length, methods, domains, mimes }
  });
}

/* ── Filter ───────────────────────────────────────────────── */
async function handleFilter(har, mode, options) {
  let filteredEntries;

  if (mode === 'visual') {
    filteredEntries = applyVisualFilter(har.log.entries, options);
  } else if (mode === 'jq') {
    filteredEntries = await applyJqFilter(har, options.expression);
  } else {
    throw new Error('Unknown filter mode: ' + mode);
  }

  const filteredHar = {
    ...har,
    log: {
      ...har.log,
      entries: filteredEntries
    }
  };

  self.postMessage({
    type: 'result',
    filteredHar,
    matched: filteredEntries.length,
    total: har.log.entries.length
  });
}

/* ── Visual filter ────────────────────────────────────────── */
function applyVisualFilter(entries, opts) {
  const {
    urlPattern,
    urlIsRegex,
    methods,       // Set or array of allowed method strings, empty = all
    statusMin,
    statusMax,
    mimes,         // Set or array of allowed MIME type strings, empty = all
    excludeDomains // array of domain strings to exclude
  } = opts;

  let urlRegex = null;
  if (urlPattern) {
    try {
      urlRegex = new RegExp(urlIsRegex ? urlPattern : escapeRegex(urlPattern), 'i');
    } catch {
      throw new Error('Invalid URL regex: ' + urlPattern);
    }
  }

  const methodSet   = methods?.length       ? new Set(methods.map(m => m.toUpperCase()))    : null;
  const mimeSet     = mimes?.length         ? new Set(mimes)                                : null;
  const excludeSet  = excludeDomains?.length ? new Set(excludeDomains.map(d => d.toLowerCase())) : null;

  return entries.filter(entry => {
    const url    = entry.request?.url ?? '';
    const method = (entry.request?.method ?? '').toUpperCase();
    const status = entry.response?.status ?? 0;
    const mime   = (entry.response?.content?.mimeType ?? '').split(';')[0].trim();

    // URL pattern
    if (urlRegex && !urlRegex.test(url)) return false;

    // Method allow-list
    if (methodSet && !methodSet.has(method)) return false;

    // Status range
    if (statusMin !== undefined && statusMin !== '' && status < Number(statusMin)) return false;
    if (statusMax !== undefined && statusMax !== '' && status > Number(statusMax)) return false;

    // MIME allow-list
    if (mimeSet && !mimeSet.has(mime)) return false;

    // Exclude domains
    if (excludeSet) {
      let hostname = '';
      try { hostname = new URL(url).hostname.toLowerCase(); } catch { /* ignore */ }
      if (excludeSet.has(hostname)) return false;
    }

    return true;
  });
}

/* ── jq filter ────────────────────────────────────────────── */
async function applyJqFilter(har, expression) {
  if (!expression?.trim()) {
    throw new Error('jq expression is empty.');
  }

  const jq = await loadJq();

  let result;
  try {
    // jq-wasm: jq.json(inputObject, filterString) → transformed value
    result = await jq.json(har, expression);
  } catch (err) {
    throw new Error('jq error: ' + (err.message || String(err)));
  }

  // The filter should return the full HAR or the entries array
  if (Array.isArray(result)) {
    // User returned just the entries array — wrap it
    return result;
  }
  if (result && result.log && Array.isArray(result.log.entries)) {
    return result.log.entries;
  }
  throw new Error(
    'jq filter must return either the full HAR object or a log.entries array. Got: ' +
    JSON.stringify(result)?.slice(0, 120)
  );
}

/* ── Helpers ──────────────────────────────────────────────── */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
