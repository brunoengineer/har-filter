/**
 * main.js — HAR Filter UI controller
 * Communicates with worker.js for all heavy lifting.
 */

'use strict';

/* ── Worker ───────────────────────────────────────────────── */
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

/* ── State ────────────────────────────────────────────────── */
let currentHar        = null;   // parsed HAR object
let currentFiltered   = null;   // last filtered HAR
let sortState         = { col: null, dir: 'asc' };
let previewEntries    = [];     // rows currently shown in table

/* ── DOM refs ─────────────────────────────────────────────── */
const dropZone          = document.getElementById('drop-zone');
const fileInput         = document.getElementById('file-input');
const fileInfo          = document.getElementById('file-info');
const fileName          = document.getElementById('file-name');
const fileSize          = document.getElementById('file-size');
const clearFileBtn      = document.getElementById('clear-file');
const parseStatus       = document.getElementById('parse-status');
const filterSection     = document.getElementById('filter-section');
const outputSection     = document.getElementById('output-section');

const tabVisual         = document.getElementById('tab-visual');
const tabJq             = document.getElementById('tab-jq');
const panelVisual       = document.getElementById('panel-visual');
const panelJq           = document.getElementById('panel-jq');

const urlPattern        = document.getElementById('url-pattern');
const urlIsRegex        = document.getElementById('url-is-regex');
const methodCheckboxes  = document.getElementById('method-checkboxes');
const statusMin         = document.getElementById('status-min');
const statusMax         = document.getElementById('status-max');
const mimeCheckboxes    = document.getElementById('mime-checkboxes');
const excludeDomains    = document.getElementById('exclude-domains');

const jqExpression      = document.getElementById('jq-expression');
const jqError           = document.getElementById('jq-error');

const jqErrorText       = document.getElementById('jq-error-text');
const jqErrorClose      = document.getElementById('jq-error-close');

let jqErrorTimer = null;

jqErrorClose.addEventListener('click', () => {
  jqError.classList.add('hidden');
  clearTimeout(jqErrorTimer);
});

const btnFilter         = document.getElementById('btn-filter');
const btnResetFilters   = document.getElementById('btn-reset-filters');
const statsBar          = document.getElementById('stats-bar');
const btnDownload       = document.getElementById('btn-download');
const btnCopy           = document.getElementById('btn-copy');
const copyToast         = document.getElementById('copy-toast');
const previewBody       = document.getElementById('preview-body');
const previewTruncation = document.getElementById('preview-truncation');

/* ── Worker message handler ───────────────────────────────── */
worker.onmessage = function (evt) {
  const msg = evt.data;
  if (msg.type === 'parsed')  handleParsed(msg);
  if (msg.type === 'result')  handleResult(msg);
  if (msg.type === 'error')   handleWorkerError(msg.message);
};
worker.onerror = function (e) {
  handleWorkerError('Worker error: ' + e.message);
};

/* ── File upload ──────────────────────────────────────────── */
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) loadFile(fileInput.files[0]);
});

clearFileBtn.addEventListener('click', resetAll);

function loadFile(file) {
  resetAll(false);
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  fileInfo.classList.remove('hidden');
  dropZone.classList.add('hidden');

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

/* ── Build filter UI from HAR meta ───────────────────────────*/
function buildFilterUI({ methods, mimes }) {
  // Methods
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

  // MIME types — grouped
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
    groupMimes.forEach(mime => {
      const lbl = document.createElement('label');
      lbl.className = 'cb-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = mime;
      cb.checked = true;
      cb.addEventListener('change', saveVisualState);
      lbl.append(cb, document.createTextNode(shortMime(mime)));
      section.appendChild(lbl);
    });
    mimeCheckboxes.appendChild(section);
  });
}

function groupMimes(mimes) {
  const cats = [
    { label: 'JSON / API',   test: m => m.includes('json') || m.includes('graphql') },
    { label: 'HTML',         test: m => m.includes('html') },
    { label: 'JavaScript',   test: m => m.includes('javascript') || m.includes('ecmascript') },
    { label: 'CSS',          test: m => m.includes('css') },
    { label: 'Images',       test: m => m.startsWith('image/') },
    { label: 'Fonts',        test: m => m.includes('font') || m.includes('woff') },
    { label: 'Other',        test: () => true }
  ];
  const assigned = new Set();
  return cats.map(cat => ({
    label: cat.label,
    mimes: mimes.filter(m => { if (assigned.has(m)) return false; if (cat.test(m)) { assigned.add(m); return true; } return false; })
  }));
}

function shortMime(mime) {
  return mime.replace('application/', '').replace('text/', '').replace('image/', '') || mime;
}

/* ── Tabs ─────────────────────────────────────────────────── */
tabVisual.addEventListener('click', () => activateTab('visual'));
tabJq.addEventListener('click',     () => activateTab('jq'));

function activateTab(which) {
  const isJq = which === 'jq';
  tabVisual.classList.toggle('active', !isJq);
  tabJq.classList.toggle('active', isJq);
  tabVisual.setAttribute('aria-selected', String(!isJq));
  tabJq.setAttribute('aria-selected', String(isJq));
  panelVisual.classList.toggle('hidden', isJq);
  panelJq.classList.toggle('hidden', !isJq);
}

/* ── Filter button ────────────────────────────────────────── */
btnFilter.addEventListener('click', runFilter);

function runFilter() {
  if (!currentHar) return;
  btnFilter.disabled = true;
  btnFilter.textContent = 'Filtering…';
  jqError.classList.add('hidden');
  outputSection.classList.add('hidden');

  const isJq = tabJq.classList.contains('active');
  saveCurrentState();

  if (isJq) {
    worker.postMessage({
      action: 'filter',
      har: currentHar,
      mode: 'js',
      options: { expression: jqExpression.value.trim() }
    });
  } else {
    worker.postMessage({
      action: 'filter',
      har: currentHar,
      mode: 'visual',
      options: buildVisualOptions()
    });
  }
}

function buildVisualOptions() {
  const checkedMethods = [...methodCheckboxes.querySelectorAll('input[type=checkbox]:checked')]
    .map(cb => cb.value);
  const allMethods = [...methodCheckboxes.querySelectorAll('input[type=checkbox]')]
    .map(cb => cb.value);
  // empty = all methods selected (no restriction)
  const methods = checkedMethods.length === allMethods.length ? [] : checkedMethods;

  const checkedMimes = [...mimeCheckboxes.querySelectorAll('input[type=checkbox]:checked')]
    .map(cb => cb.value);
  const allMimes = [...mimeCheckboxes.querySelectorAll('input[type=checkbox]')]
    .map(cb => cb.value);
  const mimes = checkedMimes.length === allMimes.length ? [] : checkedMimes;

  const excl = excludeDomains.value.trim()
    .split('\n')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  return {
    urlPattern:      urlPattern.value.trim(),
    urlIsRegex:      urlIsRegex.checked,
    methods,
    statusMin:       statusMin.value,
    statusMax:       statusMax.value,
    mimes,
    excludeDomains:  excl
  };
}

/* ── Result ───────────────────────────────────────────────── */
function handleResult({ filteredHar, matched, total }) {
  currentFiltered = filteredHar;
  btnFilter.disabled = false;
  btnFilter.textContent = 'Filter HAR';

  // Stats
  const pct = total ? Math.round(matched / total * 100) : 0;
  statsBar.innerHTML =
    `<strong>${matched.toLocaleString()}</strong> of <strong>${total.toLocaleString()}</strong> entries matched` +
    (matched < total ? ` <span class="stats-warn">(${pct}% kept)</span>` : '');

  // Preview table
  buildPreviewTable(filteredHar.log.entries);

  outputSection.classList.remove('hidden');
  outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleWorkerError(msg) {
  btnFilter.disabled = false;
  btnFilter.textContent = 'Filter HAR';

  if (tabJq.classList.contains('active')) {
    jqErrorText.textContent = msg;
    jqError.classList.remove('hidden');
    clearTimeout(jqErrorTimer);
    jqErrorTimer = setTimeout(() => jqError.classList.add('hidden'), 8000);
  } else {
    setStatus(msg, true);
    parseStatus.classList.remove('hidden');
  }
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

  slice.forEach(entry => {
    const tr = document.createElement('tr');
    const method = entry.request?.method ?? '';
    const url    = entry.request?.url ?? '';
    const status = entry.response?.status ?? '';
    const mime   = (entry.response?.content?.mimeType ?? '').split(';')[0].trim();
    const size   = entry.response?.content?.size ?? entry.response?.bodySize ?? 0;
    const time   = Math.round(entry.time ?? 0);

    const statusClass = statusColorClass(status);
    tr.innerHTML = `
      <td class="td-method">${esc(method)}</td>
      <td class="td-url" title="${esc(url)}">${esc(truncateUrl(url))}</td>
      <td class="${statusClass}">${esc(String(status))}</td>
      <td>${esc(shortMime(mime))}</td>
      <td>${formatBytes(size)}</td>
      <td>${time}</td>
    `;
    previewBody.appendChild(tr);
  });

  if (entries.length > PREVIEW_LIMIT) {
    previewTruncation.textContent =
      `Showing first ${PREVIEW_LIMIT} of ${entries.length.toLocaleString()} entries in the filtered HAR.`;
    previewTruncation.classList.remove('hidden');
  } else {
    previewTruncation.classList.add('hidden');
  }
}

// Column sort
document.querySelectorAll('#preview-table th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (sortState.col === col) {
      sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.col = col;
      sortState.dir = 'asc';
    }
    document.querySelectorAll('#preview-table th').forEach(h => {
      h.classList.remove('sort-asc', 'sort-desc');
    });
    th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
    const sorted = [...previewEntries].sort((a, b) => compareEntries(a, b, col, sortState.dir));
    renderTable(sorted);
  });
});

function compareEntries(a, b, col, dir) {
  let va, vb;
  switch (col) {
    case 'method': va = a.request?.method ?? ''; vb = b.request?.method ?? ''; break;
    case 'url':    va = a.request?.url ?? '';    vb = b.request?.url ?? '';    break;
    case 'status': va = a.response?.status ?? 0; vb = b.response?.status ?? 0; break;
    case 'mime':   va = a.response?.content?.mimeType ?? ''; vb = b.response?.content?.mimeType ?? ''; break;
    case 'size':   va = a.response?.content?.size ?? 0; vb = b.response?.content?.size ?? 0; break;
    case 'time':   va = a.time ?? 0; vb = b.time ?? 0; break;
    default:       return 0;
  }
  if (va < vb) return dir === 'asc' ? -1 : 1;
  if (va > vb) return dir === 'asc' ?  1 : -1;
  return 0;
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
  jqExpression.value = '';
  jqError.classList.add('hidden');
  methodCheckboxes.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.checked = true;
    cb.closest('.method-badge')?.classList.add('checked');
  });
  mimeCheckboxes.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
  localStorage.removeItem('har-filter:visual');
  localStorage.removeItem('har-filter:js');
});

function resetAll(showDrop = true) {
  currentHar = null;
  currentFiltered = null;
  fileInput.value = '';
  fileInfo.classList.add('hidden');
  filterSection.classList.add('hidden');
  outputSection.classList.add('hidden');
  parseStatus.classList.add('hidden');
  if (showDrop) dropZone.classList.remove('hidden');
  btnFilter.disabled = true;
}

/* ── localStorage persistence ─────────────────────────────── */
function saveCurrentState() {
  saveVisualState();
  saveJqState();
}

function saveVisualState() {
  try {
    const state = {
      urlPattern:     urlPattern.value,
      urlIsRegex:     urlIsRegex.checked,
      statusMin:      statusMin.value,
      statusMax:      statusMax.value,
      excludeDomains: excludeDomains.value,
      methods: [...methodCheckboxes.querySelectorAll('input[type=checkbox]')]
        .map(cb => ({ value: cb.value, checked: cb.checked })),
      mimes: [...mimeCheckboxes.querySelectorAll('input[type=checkbox]')]
        .map(cb => ({ value: cb.value, checked: cb.checked }))
    };
    localStorage.setItem('har-filter:visual', JSON.stringify(state));
  } catch { /* quota exceeded or private mode */ }
}

function saveJqState() {
  try {
    localStorage.setItem('har-filter:js', jqExpression.value);
  } catch { /* ignore */ }
}

function restoreSavedState() {
  // JS expression (always available)
  const savedJs = localStorage.getItem('har-filter:js');
  if (savedJs) jqExpression.value = savedJs;

  // Visual state — only restore simple fields; checkboxes need the HAR-built UI to exist
  try {
    const saved = JSON.parse(localStorage.getItem('har-filter:visual') || 'null');
    if (!saved) return;
    if (saved.urlPattern)     urlPattern.value = saved.urlPattern;
    if (saved.urlIsRegex)     urlIsRegex.checked = saved.urlIsRegex;
    if (saved.statusMin)      statusMin.value = saved.statusMin;
    if (saved.statusMax)      statusMax.value = saved.statusMax;
    if (saved.excludeDomains) excludeDomains.value = saved.excludeDomains;

    // Restore method checkbox states by value
    if (saved.methods?.length) {
      saved.methods.forEach(({ value, checked }) => {
        const cb = methodCheckboxes.querySelector(`input[value="${CSS.escape(value)}"]`);
        if (cb) {
          cb.checked = checked;
          cb.closest('.method-badge')?.classList.toggle('checked', checked);
        }
      });
    }
    // Restore mime checkbox states
    if (saved.mimes?.length) {
      saved.mimes.forEach(({ value, checked }) => {
        const cb = mimeCheckboxes.querySelector(`input[value="${CSS.escape(value)}"]`);
        if (cb) cb.checked = checked;
      });
    }
  } catch { /* corrupt state, ignore */ }
}

// Auto-save jq expression as user types
jqExpression.addEventListener('input', saveJqState);

// Example snippet buttons
document.querySelectorAll('.js-example-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    jqExpression.value = btn.dataset.script;
    saveJqState();
  });
});

// Auto-save exclude domains as user types
excludeDomains.addEventListener('input', saveVisualState);
urlPattern.addEventListener('input', saveVisualState);
urlIsRegex.addEventListener('change', saveVisualState);
statusMin.addEventListener('input', saveVisualState);
statusMax.addEventListener('input', saveVisualState);

/* ── Helpers ──────────────────────────────────────────────── */
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
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
