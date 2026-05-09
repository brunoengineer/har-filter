/**
 * worker.js — HAR Filter extension worker
 *
 * Actions:
 *   { action: 'load',   har: object }           ← already-parsed HAR (from chrome.devtools.network.getHAR)
 *   { action: 'parse',  text: string }           ← raw JSON text (from file upload)
 *   { action: 'filter', har, mode, options }
 *
 * Responses:
 *   { type: 'parsed', har, meta }
 *   { type: 'result', filteredHar, matched, total }
 *   { type: 'error',  message }
 */

'use strict';

self.onmessage = async function (evt) {
  const msg = evt.data;
  try {
    if (msg.action === 'parse') {
      handleLoad(JSON.parse(msg.text));
    } else if (msg.action === 'load') {
      handleLoad(msg.har);
    } else if (msg.action === 'filter') {
      handleFilter(msg.har, msg.mode, msg.options);
    } else {
      throw new Error('Unknown action: ' + msg.action);
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err.message || err) });
  }
};

/* ── Load / Parse ─────────────────────────────────────────── */
function handleLoad(har) {
  if (!har || !har.log || !Array.isArray(har.log.entries)) {
    throw new Error('Does not look like a valid HAR (missing log.entries).');
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
function handleFilter(har, mode, options) {
  let filteredEntries;

  if (mode === 'visual') {
    filteredEntries = applyVisualFilter(har.log.entries, options);
  } else {
    throw new Error('Unknown filter mode: ' + mode);
  }

  self.postMessage({
    type: 'result',
    filteredHar: { ...har, log: { ...har.log, entries: filteredEntries } },
    matched: filteredEntries.length,
    total: har.log.entries.length
  });
}

/* ── Visual filter ────────────────────────────────────────── */
function applyVisualFilter(entries, opts) {
  const { urlPattern, urlIsRegex, methods, statusMin, statusMax, mimes, excludeDomains } = opts;

  let urlRegex = null;
  if (urlPattern) {
    try {
      urlRegex = new RegExp(urlIsRegex ? urlPattern : escapeRegex(urlPattern), 'i');
    } catch {
      throw new Error('Invalid URL regex: ' + urlPattern);
    }
  }

  const methodSet  = methods?.length        ? new Set(methods.map(m => m.toUpperCase()))         : null;
  const mimeSet    = mimes?.length          ? new Set(mimes)                                      : null;
  const excludeSet = excludeDomains?.length ? new Set(excludeDomains.map(d => d.toLowerCase()))   : null;

  return entries.filter(entry => {
    const url    = entry.request?.url ?? '';
    const method = (entry.request?.method ?? '').toUpperCase();
    const status = entry.response?.status ?? 0;
    const mime   = (entry.response?.content?.mimeType ?? '').split(';')[0].trim();

    if (urlRegex && !urlRegex.test(url)) return false;
    if (methodSet && !methodSet.has(method)) return false;
    if (statusMin !== undefined && statusMin !== '' && status < Number(statusMin)) return false;
    if (statusMax !== undefined && statusMax !== '' && status > Number(statusMax)) return false;
    if (mimeSet && !mimeSet.has(mime)) return false;
    if (excludeSet) {
      let hostname = '';
      try { hostname = new URL(url).hostname.toLowerCase(); } catch { /* ignore */ }
      if (excludeSet.has(hostname)) return false;
    }
    return true;
  });
}

/* ── Helpers ──────────────────────────────────────────────── */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
