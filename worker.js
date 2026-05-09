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
  } else if (mode === 'js') {
    filteredEntries = applyJsFilter(har.log.entries, options.expression);
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

/* ── JS filter ────────────────────────────────────────────── */
function applyJsFilter(entries, script) {
  if (!script?.trim()) {
    throw new Error('Script is empty.');
  }
  let fn;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function('entries', script);
  } catch (err) {
    throw new Error('Syntax error: ' + err.message);
  }
  let result;
  try {
    result = fn(entries);
  } catch (err) {
    throw new Error('Runtime error: ' + err.message);
  }
  if (!Array.isArray(result)) {
    throw new Error('Script must return an array of entries. Got: ' + typeof result);
  }
  return result;
}

/* ── Helpers ──────────────────────────────────────────────── */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
