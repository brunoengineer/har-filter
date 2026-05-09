# ▶ HAR Filter

**Filter, inspect and export HAR network traces — entirely in your browser. No server. No uploads. Nothing leaves your machine.**

[![Deploy to GitHub Pages](https://github.com/brunoengineer/har-filter/actions/workflows/deploy.yml/badge.svg)](https://github.com/brunoengineer/har-filter/actions/workflows/deploy.yml)

---

## What is a HAR file?

A **HAR** (HTTP Archive) is a JSON file exported from browser DevTools containing every network request made during a session — URLs, methods, headers, status codes, response sizes and timings. They're invaluable for debugging, performance analysis and sharing reproduction steps.

The problem: a real-world HAR from a busy app can have **thousands of entries**. HAR Filter lets you cut it down to exactly what matters.

---

## Features

| | |
|---|---|
| 📂 **Drag & drop upload** | Drop a `.har` file or click to browse |
| 🎛 **Visual filter** | Point-and-click: URL pattern, HTTP methods, status code range, MIME types, excluded domains |
| 🖥 **JS Script filter** | Write a one-liner JavaScript expression for anything the visual UI can't express |
| ⚡ **Web Worker** | Parsing and filtering run off the main thread — the UI never freezes, even on 50 MB files |
| 💾 **Download or Copy** | Export the filtered result as a `.har` file or copy the JSON to clipboard |
| 🔍 **Sortable preview table** | Inspect the first 100 matched entries, sortable by method, URL, status, MIME, size or time |
| 🧠 **Remembers your filters** | Visual and script filters are saved to `localStorage` and restored on next visit |
| 🔒 **100% client-side** | No backend, no analytics, no data ever leaves your browser |

---

## Live demo

**[https://brunoengineer.github.io/har-filter](https://brunoengineer.github.io/har-filter)**

---

## How to use

### 1 — Export a HAR from Chrome / Firefox / Edge

In DevTools → **Network** tab → right-click any request → **Save all as HAR with content**.

### 2 — Upload

Drop the file onto the page or click **browse files**. The file is parsed instantly in a background worker.

### 3 — Filter

Choose between two modes:

#### Visual tab

| Control | What it does |
|---|---|
| **URL Pattern** | Plain text substring match, or toggle **regex** for full regular expression support |
| **HTTP Method** | Toggle individual methods on/off (discovered from your file) |
| **Status Code** | Keep entries whose status falls within a min–max range |
| **Response MIME Type** | Toggle by category: JSON/API, HTML, JavaScript, CSS, Images, Fonts |
| **Exclude Domains** | One hostname per line — those domains are dropped from results |

#### JS Script tab

Write JavaScript that receives an `entries` array and must `return` a filtered array. Click any example pill to start from a template.

```js
// Only successful API calls
return entries.filter(e =>
  e.request.url.includes('/api/') &&
  e.response.status >= 200 &&
  e.response.status < 300
);
```

```js
// Everything slower than 1 second
return entries.filter(e => e.time > 1000);
```

```js
// Only POST and PUT requests
return entries.filter(e =>
  ['POST', 'PUT'].includes(e.request.method)
);
```

```js
// Exclude static assets, keep only XHR/fetch
return entries.filter(e => {
  const mime = e.response.content?.mimeType ?? '';
  return mime.includes('json') || mime.includes('text/plain');
});
```

Each entry in the array is a standard [HAR entry object](https://w3c.github.io/web-performance/specs/HAR/Overview.html). The most useful fields:

```
entry.request.method        →  "GET", "POST", …
entry.request.url           →  full URL string
entry.response.status       →  200, 404, 500, …
entry.response.content.mimeType  →  "application/json", "text/css", …
entry.response.content.size →  bytes
entry.time                  →  total time in ms
```

### 4 — Export

- **Download .har** — saves the filtered archive to your machine
- **Copy JSON** — copies the raw JSON to clipboard for quick pasting

---

## Running locally

No build step required — it's plain HTML, CSS and JavaScript.

```bash
git clone https://github.com/brunoengineer/har-filter.git
cd har-filter
npx serve .
# open http://localhost:3000
```

---

## Running the tests

Tests use [Playwright](https://playwright.dev/) and spin up a local static server automatically.

```bash
# Install dependencies (first time only)
npm install
npx playwright install --with-deps chromium

# Run all tests
npm test

# Open the interactive Playwright UI
npm run test:ui

# View the last HTML report
npm run test:report
```

The test suite covers:

- Page load and initial state
- File upload and the clear button
- Visual filters — URL pattern, status range
- JS Script tab — valid script, example buttons, syntax errors, wrong return type

---

## CI / CD

Every push to `main` runs the full Playwright test suite **before** deploying. If any test fails, the deploy is blocked and the test report is uploaded as a GitHub Actions artifact.

```
push to main
    │
    ▼
┌─────────┐     pass      ┌──────────┐
│  test   │ ──────────▶  │  deploy  │
│  job    │               │  job     │
└─────────┘               └──────────┘
    │ fail
    ▼
 blocked — report artifact uploaded
```

---

## Project structure

```
har-filter/
├── index.html               # App shell and markup
├── style.css                # Dark theme, CSS Grid layout
├── main.js                  # UI controller — DOM, events, state
├── worker.js                # Web Worker — parsing and filtering
├── playwright.config.ts     # Playwright configuration
├── tsconfig.json            # TypeScript config (for tests)
├── tests/
│   ├── har-filter.spec.ts   # End-to-end tests
│   └── fixtures/
│       └── sample.har       # Minimal HAR used by tests
└── .github/
    └── workflows/
        └── deploy.yml       # CI: test → deploy to GitHub Pages
```

---

## License

MIT
