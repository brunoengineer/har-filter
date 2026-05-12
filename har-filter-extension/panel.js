/**
 * panel.js — HAR Filter DevTools panel controller
 */

'use strict';

/* ── Worker ───────────────────────────────────────────────── */
const worker = new Worker(chrome.runtime.getURL('worker.js'));

/* ── State ────────────────────────────────────────────────── */
let currentHar      = null;
let currentFiltered = null;
let sortState       = { col: null, dir: 'asc' };
let previewEntries  = [];
let recording       = false;
let capturedEntries = [];
let bodyPromises    = [];

/* ── DOM refs ─────────────────────────────────────────────── */
const btnCapture        = document.getElementById('btn-capture');
const captureCount      = document.getElementById('capture-count');
const fileTrigger       = document.getElementById('file-trigger');
const fileInput         = document.getElementById('file-input');
const fileInfo          = document.getElementById('file-info');
const fileName          = document.getElementById('file-name');
const fileSize          = document.getElementById('file-size');
const clearFileBtn      = document.getElementById('clear-file');
const parseStatus       = document.getElementById('parse-status');
const filterSection     = document.getElementById('filter-section');
const outputSection     = document.getElementById('output-section');

const urlPattern        = document.getElementById('url-pattern');
const urlIsRegex        = document.getElementById('url-is-regex');
const methodCheckboxes  = document.getElementById('method-checkboxes');
const statusMin         = document.getElementById('status-min');
const statusMax         = document.getElementById('status-max');
const mimeCheckboxes    = document.getElementById('mime-checkboxes');
const excludeDomains    = document.getElementById('exclude-domains');

const btnFilter         = document.getElementById('btn-filter');
const btnResetFilters   = document.getElementById('btn-reset-filters');
const statsBar          = document.getElementById('stats-bar');
const btnDownload       = document.getElementById('btn-download');
const btnCopy           = document.getElementById('btn-copy');
const copyToast         = document.getElementById('copy-toast');
const previewBody       = document.getElementById('preview-body');
const previewTruncation = document.getElementById('preview-truncation');

const detailPanel          = document.getElementById('detail-panel');
const detailBadge          = document.getElementById('detail-badge');
const detailStatusBadge    = document.getElementById('detail-status-badge');
const detailUrlText        = document.getElementById('detail-url-text');
const detailClose          = document.getElementById('detail-close');
const tabDetailReq         = document.getElementById('tab-detail-req');
const tabDetailRes         = document.getElementById('tab-detail-res');
const panelDetailReq       = document.getElementById('panel-detail-req');
const panelDetailRes       = document.getElementById('panel-detail-res');
const detailReqHeaders     = document.getElementById('detail-req-headers');
const detailPayloadSection = document.getElementById('detail-payload-section');
const detailReqBody        = document.getElementById('detail-req-body');
const detailResHeaders     = document.getElementById('detail-res-headers');
const detailResBody        = document.getElementById('detail-res-body');

/* ── Worker message handler ───────────────────────────────── */
worker.onmessage = function (evt) {
  const msg = evt.data;
  if (msg.type === 'parsed') handleParsed(msg);
  if (msg.type === 'result') handleResult(msg);
  if (msg.type === 'error')  handleWorkerError(msg.message);
};
worker.onerror = function (e) {
  handleWorkerError('Worker error: ' + e.message);
};

/* ── Live recorder (onRequestFinished + getContent) ───────── */
function onRequestFinishedHandler(request) {
  capturedEntries.push(request);
  updateCaptureCount();
  const p = new Promise(resolve => {
    try {
      request.getContent((body, encoding) => {
        if (!chrome.runtime.lastError && body != null && request.response?.content) {
          request.response.content.text = body;
          if (encoding) request.response.content.encoding = encoding;
        }
        resolve();
      });
    } catch {
      resolve();
    }
  });
  bodyPromises.push(p);
}

function updateCaptureCount() {
  const n = capturedEntries.length;
  captureCount.textContent = n === 1 ? '1 request' : `${n.toLocaleString()} requests`;
  captureCount.classList.toggle('hidden', n === 0);
}

function startRecording() {
  resetAll();
  capturedEntries = [];
  bodyPromises = [];
  recording = true;
  chrome.devtools.network.onRequestFinished.addListener(onRequestFinishedHandler);
  btnCapture.classList.add('recording');
  btnCapture.innerHTML = '&#9632; Stop &amp; Process';
  setStatus('Recording. Use your app or reload the page, then click Stop.', false);
  parseStatus.classList.remove('hidden');
  updateCaptureCount();
}

async function stopRecording() {
  chrome.devtools.network.onRequestFinished.removeListener(onRequestFinishedHandler);
  recording = false;
  btnCapture.classList.remove('recording');
  btnCapture.innerHTML = '&#9679; Start Recording';

  if (capturedEntries.length === 0) {
    setStatus('No requests captured. Use your app while recording is active, then click Stop.', true);
    return;
  }

  setStatus(`Fetching response bodies for ${capturedEntries.length.toLocaleString()} requests…`, false);
  await Promise.all(bodyPromises);

  const har = {
    log: {
      version: '1.2',
      creator: { name: 'HAR Filter', version: '1.0.0' },
      pages: [],
      entries: capturedEntries.slice()
    }
  };
  worker.postMessage({ action: 'load', har });
}

btnCapture.addEventListener('click', () => {
  if (recording) stopRecording();
  else startRecording();
});

/* ── File upload (secondary) ──────────────────────────────── */
fileTrigger.addEventListener('click', () => fileInput.click());
fileTrigger.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) loadFile(fileInput.files[0]);
});

clearFileBtn.addEventListener('click', resetAll);

function loadFile(file) {
  resetAll();
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  fileInfo.classList.remove('hidden');

  setStatus('Parsing HAR file…', false);
  parseStatus.classList.remove('hidden');

  const reader = new FileReader();
  reader.onload = e => worker.postMessage({ action: 'parse', text: e.target.result });
  reader.onerror = () => handleWorkerError('Failed to read file.');
  reader.readAsText(file);
}

/* ── Parsed ───────────────────────────────────────────────── */
function handleParsed({ har, meta }) {
  currentHar = har;
  setStatus(`Loaded ${meta.totalEntries.toLocaleString()} entries.`, false);
  buildFilterUI(meta);
  filterSection.classList.remove('hidden');
  btnFilter.disabled = false;
  restoreSavedState();
}

/* ── Build filter UI ──────────────────────────────────────── */
function buildFilterUI({ methods, mimes }) {
  methodCheckboxes.innerHTML = '';
  const allMethods = methods.length ? methods : ['GET','POST','PUT','DELETE','PATCH','OPTIONS','HEAD'];
  allMethods.forEach(m => {
    const label = document.createElement('label');
    label.className = 'method-badge checked';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = m;
    cb.checked = true;
    cb.addEventListener('change', () => {
      label.classList.toggle('checked', cb.checked);
      saveVisualState();
    });
    label.append(cb, document.createTextNode(m));
    methodCheckboxes.appendChild(label);
  });

  mimeCheckboxes.innerHTML = '';
  const groups = groupMimes(mimes);
  groups.forEach(({ label: groupLabel, mimes: groupMimes }) => {
    if (!groupMimes.length) return;
    const section = document.createElement('div');
    section.className = 'mime-group';
    const heading = document.createElement('div');
    heading.className = 'filter-label';
    heading.style.cssText = 'font-size:.72rem;margin-bottom:.25rem;';
    heading.textContent = groupLabel;
    section.appendChild(heading);
    const seenShortNames = new Map();
    groupMimes.forEach(mime => {
      const short = shortMime(mime);
      if (seenShortNames.has(short)) {
        const existingCb = seenShortNames.get(short);
        existingCb.dataset.mimes = JSON.stringify([...JSON.parse(existingCb.dataset.mimes), mime]);
        return;
      }
      const lbl = document.createElement('label');
      lbl.className = 'cb-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = mime;
      cb.dataset.mimes = JSON.stringify([mime]);
      cb.checked = true;
      cb.addEventListener('change', saveVisualState);
      lbl.append(cb, document.createTextNode(short));
      section.appendChild(lbl);
      seenShortNames.set(short, cb);
    });
    mimeCheckboxes.appendChild(section);
  });
}

function groupMimes(mimes) {
  const cats = [
    { label: 'JSON / API',  test: m => m.includes('json') || m.includes('graphql') },
    { label: 'HTML',        test: m => m.includes('html') },
    { label: 'JavaScript',  test: m => m.includes('javascript') || m.includes('ecmascript') },
    { label: 'CSS',         test: m => m.includes('css') },
    { label: 'Images',      test: m => m.startsWith('image/') },
    { label: 'Fonts',       test: m => m.includes('font') || m.includes('woff') },
    { label: 'Other',       test: () => true }
  ];
  const assigned = new Set();
  return cats.map(cat => ({
    label: cat.label,
    mimes: mimes.filter(m => {
      if (assigned.has(m)) return false;
      if (cat.test(m)) { assigned.add(m); return true; }
      return false;
    })
  }));
}

function shortMime(mime) {
  return mime.replace('application/', '').replace('text/', '').replace('image/', '') || mime;
}

/* ── Filter button ────────────────────────────────────────── */
btnFilter.addEventListener('click', runFilter);

function runFilter() {
  if (!currentHar) return;
  btnFilter.disabled = true;
  btnFilter.textContent = 'Filtering…';
  outputSection.classList.add('hidden');

  saveCurrentState();
  worker.postMessage({
    action: 'filter',
    har: currentHar,
    mode: 'visual',
    options: buildVisualOptions()
  });
}

function buildVisualOptions() {
  const checkedMethods = [...methodCheckboxes.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value);
  const allMethods     = [...methodCheckboxes.querySelectorAll('input[type=checkbox]')].map(cb => cb.value);
  const methods        = checkedMethods.length === allMethods.length ? [] : checkedMethods;

  const checkedMimes = [...mimeCheckboxes.querySelectorAll('input[type=checkbox]:checked')]
    .flatMap(cb => JSON.parse(cb.dataset.mimes || JSON.stringify([cb.value])));
  const allMimes     = [...mimeCheckboxes.querySelectorAll('input[type=checkbox]')]
    .flatMap(cb => JSON.parse(cb.dataset.mimes || JSON.stringify([cb.value])));
  const mimes        = checkedMimes.length === allMimes.length ? [] : checkedMimes;

  const excl = excludeDomains.value.trim().split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);

  return {
    urlPattern:     urlPattern.value.trim(),
    urlIsRegex:     urlIsRegex.checked,
    methods,
    statusMin:      statusMin.value,
    statusMax:      statusMax.value,
    mimes,
    excludeDomains: excl
  };
}

/* ── Result ───────────────────────────────────────────────── */
function handleResult({ filteredHar, matched, total }) {
  currentFiltered = filteredHar;
  btnFilter.disabled = false;
  btnFilter.textContent = 'Filter HAR';

  const pct = total ? Math.round(matched / total * 100) : 0;
  statsBar.innerHTML =
    `<strong>${matched.toLocaleString()}</strong> of <strong>${total.toLocaleString()}</strong> entries matched` +
    (matched < total ? ` <span class="stats-warn">(${pct}% kept)</span>` : '');

  buildPreviewTable(filteredHar.log.entries);
  outputSection.classList.remove('hidden');
  outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleWorkerError(msg) {
  btnFilter.disabled = false;
  btnFilter.textContent = 'Filter HAR';
  setStatus(msg, true);
  parseStatus.classList.remove('hidden');
}

/* ── Preview table ────────────────────────────────────────── */
const PREVIEW_LIMIT = 100;

function buildPreviewTable(entries) {
  previewEntries = entries;
  sortState = { col: null, dir: 'asc' };
  renderTable(entries);
}

function renderTable(entries) {
  const slice = entries.slice(0, PREVIEW_LIMIT);
  previewBody.innerHTML = '';
  detailPanel.classList.add('hidden');

  slice.forEach(entry => {
    const tr     = document.createElement('tr');
    const method = entry.request?.method ?? '';
    const url    = entry.request?.url ?? '';
    const status = entry.response?.status ?? '';
    const mime   = (entry.response?.content?.mimeType ?? '').split(';')[0].trim();
    const size   = entry.response?.content?.size ?? entry.response?.bodySize ?? 0;
    const time   = Math.round(entry.time ?? 0);

    tr.innerHTML = `
      <td class="td-method">${esc(method)}</td>
      <td class="td-url" title="${esc(url)}">${esc(truncateUrl(url))}</td>
      <td class="${statusColorClass(status)}">${esc(String(status))}</td>
      <td>${esc(shortMime(mime))}</td>
      <td>${formatBytes(size)}</td>
      <td>${time}</td>
    `;
    tr.addEventListener('click', () => {
      previewBody.querySelectorAll('tr').forEach(r => r.classList.remove('row-selected'));
      tr.classList.add('row-selected');
      showDetail(entry);
    });
    previewBody.appendChild(tr);
  });

  if (entries.length > PREVIEW_LIMIT) {
    previewTruncation.textContent =
      `Showing first ${PREVIEW_LIMIT} of ${entries.length.toLocaleString()} entries.`;
    previewTruncation.classList.remove('hidden');
  } else {
    previewTruncation.classList.add('hidden');
  }
}

document.querySelectorAll('#preview-table th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (sortState.col === col) {
      sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.col = col;
      sortState.dir = 'asc';
    }
    document.querySelectorAll('#preview-table th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
    th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
    renderTable([...previewEntries].sort((a, b) => compareEntries(a, b, col, sortState.dir)));
  });
});

function compareEntries(a, b, col, dir) {
  let va, vb;
  switch (col) {
    case 'method': va = a.request?.method ?? '';              vb = b.request?.method ?? '';              break;
    case 'url':    va = a.request?.url ?? '';                 vb = b.request?.url ?? '';                 break;
    case 'status': va = a.response?.status ?? 0;             vb = b.response?.status ?? 0;              break;
    case 'mime':   va = a.response?.content?.mimeType ?? ''; vb = b.response?.content?.mimeType ?? '';  break;
    case 'size':   va = a.response?.content?.size ?? 0;      vb = b.response?.content?.size ?? 0;       break;
    case 'time':   va = a.time ?? 0;                         vb = b.time ?? 0;                          break;
    default:       return 0;
  }
  if (va < vb) return dir === 'asc' ? -1 : 1;
  if (va > vb) return dir === 'asc' ?  1 : -1;
  return 0;
}

/* ── Detail panel ─────────────────────────────────────────── */
const detailBackdrop = document.getElementById('detail-backdrop');

function closeDetailPanel() {
  detailPanel.classList.add('hidden');
  previewBody.querySelectorAll('tr').forEach(r => r.classList.remove('row-selected'));
}

detailClose.addEventListener('click', closeDetailPanel);
detailBackdrop.addEventListener('click', closeDetailPanel);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetailPanel(); });

/* ── Detail copy buttons ──────────────────────────────────── */
detailPanel.addEventListener('click', async e => {
  const btn = e.target.closest('.detail-copy-btn');
  if (!btn) return;
  const targetId = btn.dataset.target;
  const pre = document.getElementById(targetId);
  const text = pre?.textContent ?? '';
  const toast = btn.parentElement.querySelector('.detail-copy-toast');
  try {
    await navigator.clipboard.writeText(text);
    if (toast) {
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 2000);
    }
  } catch {
    if (toast) {
      toast.textContent = 'Failed!';
      toast.style.color = 'var(--danger)';
      toast.classList.remove('hidden');
      setTimeout(() => {
        toast.classList.add('hidden');
        toast.textContent = 'Copied!';
        toast.style.color = '';
      }, 2500);
    }
  }
});

tabDetailReq.addEventListener('click', () => activateDetailTab('req'));
tabDetailRes.addEventListener('click', () => activateDetailTab('res'));

function activateDetailTab(which) {
  const isRes = which === 'res';
  tabDetailReq.classList.toggle('active', !isRes);
  tabDetailRes.classList.toggle('active',  isRes);
  panelDetailReq.classList.toggle('hidden',  isRes);
  panelDetailRes.classList.toggle('hidden', !isRes);
}

function showDetail(entry) {
  const method     = entry.request?.method ?? '';
  const url        = entry.request?.url ?? '';
  const status     = entry.response?.status ?? '';
  const statusText = entry.response?.statusText ?? '';

  detailBadge.textContent       = method;
  detailStatusBadge.textContent = status ? `${status} ${statusText}`.trim() : '';
  detailStatusBadge.className   = statusColorClass(status);
  detailUrlText.textContent     = url;
  detailUrlText.title           = url;

  // Request headers
  renderKvList(detailReqHeaders, entry.request?.headers ?? []);

  // Payload
  const postData = entry.request?.postData;
  if (postData?.text || postData?.params?.length) {
    detailPayloadSection.classList.remove('hidden');
    if (postData.text) {
      detailReqBody.textContent = tryFormatJson(postData.text);
    } else {
      detailReqBody.textContent = postData.params.map(p => `${p.name}: ${p.value}`).join('\n');
    }
  } else {
    detailPayloadSection.classList.add('hidden');
    detailReqBody.textContent = '';
  }

  // Response headers
  renderKvList(detailResHeaders, entry.response?.headers ?? []);

  // Response body
  const content = entry.response?.content;
  if (content?.text) {
    detailResBody.textContent = content.encoding === 'base64'
      ? '[Binary content — base64 encoded, not displayed]'
      : tryFormatJson(content.text);
  } else {
    detailResBody.textContent =
      '[No response body — this request has no body (e.g. 204/304, redirect, opaque cross-origin, or streamed)]';
  }

  detailPanel.classList.remove('hidden');
  activateDetailTab('req');
}

function renderKvList(container, items) {
  container.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('span');
    empty.className = 'detail-empty';
    empty.textContent = 'None';
    container.appendChild(empty);
    return;
  }
  items.forEach(({ name, value }) => {
    const row   = document.createElement('div');
    row.className = 'detail-kv-row';
    const nameEl  = document.createElement('span');
    nameEl.className = 'detail-kv-name';
    nameEl.textContent = name;
    const valEl   = document.createElement('span');
    valEl.className = 'detail-kv-value';
    valEl.textContent = value;
    row.append(nameEl, valEl);
    container.appendChild(row);
  });
}

function tryFormatJson(text) {
  try { return JSON.stringify(JSON.parse(text), null, 2); }
  catch { return text; }
}

/* ── Download ─────────────────────────────────────────────── */
btnDownload.addEventListener('click', () => {
  if (!currentFiltered) return;
  const blob = new Blob([JSON.stringify(currentFiltered, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'filtered.har';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

/* ── Copy ─────────────────────────────────────────────────── */
btnCopy.addEventListener('click', async () => {
  if (!currentFiltered) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(currentFiltered, null, 2));
    copyToast.classList.remove('hidden');
    setTimeout(() => copyToast.classList.add('hidden'), 2000);
  } catch {
    copyToast.textContent = 'Copy failed — use Download instead.';
    copyToast.style.color = 'var(--danger)';
    copyToast.classList.remove('hidden');
    setTimeout(() => {
      copyToast.classList.add('hidden');
      copyToast.textContent = 'Copied!';
      copyToast.style.color = '';
    }, 3000);
  }
});

/* ── Reset ────────────────────────────────────────────────── */
btnResetFilters.addEventListener('click', () => {
  urlPattern.value = '';
  urlIsRegex.checked = false;
  statusMin.value = '';
  statusMax.value = '';
  excludeDomains.value = '';
  methodCheckboxes.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.checked = true;
    cb.closest('.method-badge')?.classList.add('checked');
  });
  mimeCheckboxes.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
  localStorage.removeItem('har-filter:visual');
});

function resetAll() {
  if (recording) {
    chrome.devtools.network.onRequestFinished.removeListener(onRequestFinishedHandler);
    recording = false;
    btnCapture.classList.remove('recording');
    btnCapture.innerHTML = '&#9679; Start Recording';
  }
  capturedEntries = [];
  bodyPromises = [];
  captureCount.classList.add('hidden');
  captureCount.textContent = '0 requests';
  currentHar = null;
  currentFiltered = null;
  fileInput.value = '';
  fileInfo.classList.add('hidden');
  filterSection.classList.add('hidden');
  outputSection.classList.add('hidden');
  parseStatus.classList.add('hidden');
  btnFilter.disabled = true;
}

/* ── localStorage persistence ─────────────────────────────── */
function saveCurrentState() { saveVisualState(); }

function saveVisualState() {
  try {
    const state = {
      urlPattern:     urlPattern.value,
      urlIsRegex:     urlIsRegex.checked,
      statusMin:      statusMin.value,
      statusMax:      statusMax.value,
      excludeDomains: excludeDomains.value,
      methods: [...methodCheckboxes.querySelectorAll('input[type=checkbox]')].map(cb => ({ value: cb.value, checked: cb.checked })),
      mimes:   [...mimeCheckboxes.querySelectorAll('input[type=checkbox]')].map(cb => ({ value: cb.value, checked: cb.checked }))
    };
    localStorage.setItem('har-filter:visual', JSON.stringify(state));
  } catch { /* quota / private mode */ }
}

function restoreSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem('har-filter:visual') || 'null');
    if (!saved) return;
    if (saved.urlPattern)     urlPattern.value = saved.urlPattern;
    if (saved.urlIsRegex)     urlIsRegex.checked = saved.urlIsRegex;
    if (saved.statusMin)      statusMin.value = saved.statusMin;
    if (saved.statusMax)      statusMax.value = saved.statusMax;
    if (saved.excludeDomains) excludeDomains.value = saved.excludeDomains;
    if (saved.methods?.length) {
      saved.methods.forEach(({ value, checked }) => {
        const cb = methodCheckboxes.querySelector(`input[value="${CSS.escape(value)}"]`);
        if (cb) { cb.checked = checked; cb.closest('.method-badge')?.classList.toggle('checked', checked); }
      });
    }
    if (saved.mimes?.length) {
      saved.mimes.forEach(({ value, checked }) => {
        const cb = mimeCheckboxes.querySelector(`input[value="${CSS.escape(value)}"]`);
        if (cb) cb.checked = checked;
      });
    }
  } catch { /* corrupt state */ }
}

excludeDomains.addEventListener('input', saveVisualState);
urlPattern.addEventListener('input', saveVisualState);
urlIsRegex.addEventListener('change', saveVisualState);
statusMin.addEventListener('input', saveVisualState);
statusMax.addEventListener('input', saveVisualState);

/* ── Helpers ──────────────────────────────────────────────── */
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024)         return bytes + ' B';
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function truncateUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    return u.hostname + (path.length > 60 ? path.slice(0, 57) + '…' : path);
  } catch {
    return url.length > 80 ? url.slice(0, 77) + '…' : url;
  }
}

function statusColorClass(status) {
  const s = Number(status);
  if (s >= 500) return 'td-status-5xx';
  if (s >= 400) return 'td-status-4xx';
  if (s >= 300) return 'td-status-3xx';
  if (s >= 200) return 'td-status-2xx';
  return '';
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setStatus(msg, isError) {
  parseStatus.textContent = msg;
  parseStatus.classList.toggle('error', isError);
}
