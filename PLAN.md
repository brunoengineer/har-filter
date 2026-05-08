# Plan: HAR Filter — Static Web App

## TL;DR
A static multi-file web app (index.html + style.css + main.js + worker.js) deployed to GitHub Pages via GitHub Actions. Users upload a HAR file, filter entries via a visual UI or a jq filter expression (runs in-browser via jq-wasm from CDN), then download or copy the filtered HAR. Filter state persists in localStorage.

---

## File Structure
```
har-filter/
├── index.html
├── style.css
├── main.js
├── worker.js
└── .github/
    └── workflows/
        └── deploy.yml
```

---

## Steps

### Phase 1 — Static shell & styling
1. Create `index.html` with three sections: upload zone, filter panel (tabbed), output/action bar
2. Create `style.css` — dark theme (#0d1117 bg, #161b22 cards, #58a6ff accents, monospace for code areas), CSS Grid layout

### Phase 2 — Core JS logic (`main.js`)
3. File upload via `<input type="file">` + drag-and-drop; read with FileReader → JSON.parse HAR
4. Populate filter panel from HAR content (discover unique methods, domains, MIME types present in the file)
5. **Visual filter tab**: collect checked methods, URL pattern (contains/regex toggle), status range inputs, MIME type checkboxes, exclude-domain list → build JS filter predicate applied to `log.entries`
6. **jq Script tab**: `<textarea>` for jq filter expression; load `jq-wasm` lazily from CDN (`https://cdn.jsdelivr.net/npm/jq-wasm@1.1.0-jq-1.8.1/dist/index.min.js`) only when this tab is activated
7. Save/restore both visual filter state AND jq expression to `localStorage` (separate keys)
8. "Filter" button → run appropriate filter → build new HAR object preserving `log.{version,creator,browser,pages}`, replacing `log.entries` with filtered array

### Phase 3 — Output
9. Show stats: "X of Y entries matched" with timing breakdown
10. Entries preview table (first 100 rows): method, URL (truncated), status, MIME, size, time — sortable by column header
11. "Download .har" button → `URL.createObjectURL(new Blob([JSON.stringify(filtered, null, 2)], {type:'application/json'}))` + auto-click anchor
12. "Copy JSON" button → `navigator.clipboard.writeText(...)` with success toast

### Phase 4 — Web Worker (`worker.js`)
13. Move JSON.parse + filter execution into worker (via `postMessage`/`onmessage`) to avoid freezing UI on large files (>5 MB)
14. main.js posts `{action:'parse', text}` or `{action:'filter', har, mode, options}` to worker; worker posts back `{type:'result', filteredHar}` or `{type:'error', message}`
15. jq-wasm is loaded inside worker with dynamic `import()`

### Phase 5 — GitHub Actions
16. Create `.github/workflows/deploy.yml` — trigger on push to `main`, use `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3` (path: `.`), `actions/deploy-pages@v5`; grant `pages: write` + `id-token: write` permissions

---

## Key Technical Details

### jq-wasm
- Package: `jq-wasm` by owenthereal (jq 1.8.1)
- CDN: `https://cdn.jsdelivr.net/npm/jq-wasm@1.1.0-jq-1.8.1/dist/index.min.js`
- API: `await jq.json(harObject, filterExpression)` → parsed JS value
- Load lazily (only when Script tab is first activated) to avoid slowing initial page load
- Show helpful hint: "Use AI to generate your jq filter — e.g. `.log.entries |= map(select(...))`"

### HAR filter fields (visual mode)
- `request.url` — contains string or regex
- `request.method` — multi-select checkboxes (auto-populated from file)
- `response.status` — range inputs (min, max)
- `response.content.mimeType` — checkboxes (auto-populated, grouped: JSON/API, HTML, JS, CSS, Images, Other)
- Exclude domains — freetext list, one per line

### localStorage keys
- `har-filter:visual` — JSON of visual filter state
- `har-filter:jq` — jq expression string

---

## Verification
1. Open `index.html` locally in Chrome — upload a real HAR file, verify visual filters reduce entry count correctly
2. Switch to jq tab, enter `.log.entries |= map(select(.response.status == 200))`, verify it works
3. Download filtered HAR — open in a HAR viewer and confirm structure is valid
4. Copy button — paste into editor and verify valid JSON
5. Refresh page — saved filter state and jq expression restore from localStorage
6. Test with a large HAR (>10 MB) — UI should not freeze (worker handles parsing)
7. Push to GitHub, check Actions tab, verify Pages URL serves the app

---

## Decisions / Scope
- **No build step** — pure HTML/CSS/JS, no bundler, no npm
- **jq-wasm via CDN** — no local file serving needed; works on GitHub Pages
- **Visual mode uses pure JS** — no WASM dependency for the common case
- **Script mode = jq expression** — user can ask AI to write the jq; saved to localStorage
- **No Python runtime** — browser-only; Python scripts are out of scope
- **No server** — fully client-side, static deployment
