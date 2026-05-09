/**
 * har-filter.spec.ts — End-to-end test suite for the HAR Filter web app.
 *
 * Sample HAR (tests/fixtures/sample.har) has 4 entries:
 *
 *   #  Method  URL                              Status  MIME              Size    Time
 *   0  GET     example.com/api/users            200     application/json  256 B   100 ms
 *   1  POST    example.com/api/login            201     application/json  128 B    50 ms
 *   2  GET     cdn.example.com/styles.css       200     text/css         4096 B   200 ms
 *   3  GET     example.com/api/missing          404     application/json   64 B    30 ms
 */

import { test, expect, SAMPLE_HAR } from './support/fixtures';
import { generateHar }              from './support/harFactory';

// ─────────────────────────────────────────────────────────────────────────────
// Page load
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Page load', () => {
  test('has correct title and drop zone visible', async ({ harPage }) => {
    await expect(harPage.page).toHaveTitle('HAR Filter');
    await expect(harPage.dropZone).toBeVisible();
  });

  test('filter and output sections are hidden on initial load', async ({ harPage }) => {
    await expect(harPage.filterSection).toBeHidden();
    await expect(harPage.outputSection).toBeHidden();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// File upload
// ─────────────────────────────────────────────────────────────────────────────

test.describe('File upload', () => {
  test('shows filter section and correct entry count', async ({ harPage }) => {
    await harPage.uploadHarFile(SAMPLE_HAR);
    await expect(harPage.parseStatus).toContainText('4 entries');
  });

  test('displays the file name in the file-info bar', async ({ harPage }) => {
    await harPage.uploadHarFile(SAMPLE_HAR);
    await expect(harPage.fileNameSpan).toContainText('sample.har');
  });

  test('clear button returns to drop zone and hides filter section', async ({ harPage }) => {
    await harPage.uploadHarFile(SAMPLE_HAR);
    await harPage.clearFileBtn.click();
    await expect(harPage.dropZone).toBeVisible();
    await expect(harPage.filterSection).toBeHidden();
  });

  test('invalid JSON shows an error in the status bar', async ({ harPage }) => {
    await harPage.fileInput.setInputFiles({
      name:     'bad.har',
      mimeType: 'application/json',
      buffer:   Buffer.from('this is { not valid } json!!!'),
    });
    await expect(harPage.parseStatus).toBeVisible({ timeout: 5_000 });
    await expect(harPage.parseStatus).toContainText('Invalid JSON');
  });

  test('valid JSON without HAR structure shows a descriptive error', async ({ harPage }) => {
    await harPage.fileInput.setInputFiles({
      name:     'not-a-har.har',
      mimeType: 'application/json',
      buffer:   Buffer.from(JSON.stringify({ foo: 'bar' })),
    });
    await expect(harPage.parseStatus).toBeVisible({ timeout: 5_000 });
    await expect(harPage.parseStatus).toContainText('log.entries');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Visual filter — URL pattern
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual filter — URL pattern', () => {
  test('no filters returns all 4 entries', async ({ loadedPage }) => {
    await loadedPage.applyFilters();
    expect(await loadedPage.getMatchedCount()).toBe(4);
  });

  test('substring match narrows to 3 entries', async ({ loadedPage }) => {
    await loadedPage.setUrlPattern('/api/');
    await loadedPage.applyFilters();
    // users, login, missing match; styles.css does not
    expect(await loadedPage.getMatchedCount()).toBe(3);
  });

  test('regex mode matches specific alternation pattern', async ({ loadedPage }) => {
    await loadedPage.setUrlPattern('api/(users|login)', true);
    await loadedPage.applyFilters();
    // only /api/users and /api/login
    expect(await loadedPage.getMatchedCount()).toBe(2);
  });

  test('invalid regex shows an error on the status bar', async ({ loadedPage }) => {
    await loadedPage.setUrlPattern('[unclosed-bracket', true);
    await loadedPage.filterBtn.click();
    await expect(loadedPage.parseStatus).toBeVisible({ timeout: 5_000 });
    await expect(loadedPage.parseStatus).toContainText('Invalid URL regex');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Visual filter — HTTP method
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual filter — HTTP method', () => {
  test('unchecking POST excludes the POST entry', async ({ loadedPage }) => {
    await loadedPage.uncheckMethod('POST');
    await loadedPage.applyFilters();
    // 3 GET entries remain
    expect(await loadedPage.getMatchedCount()).toBe(3);
  });

  test('unchecking GET keeps only the POST entry', async ({ loadedPage }) => {
    await loadedPage.uncheckMethod('GET');
    await loadedPage.applyFilters();
    // 1 POST entry
    expect(await loadedPage.getMatchedCount()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Visual filter — Status range
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual filter — Status range', () => {
  test('400–499 returns only the 404 entry', async ({ loadedPage }) => {
    await loadedPage.setStatusRange(400, 499);
    await loadedPage.applyFilters();
    expect(await loadedPage.getMatchedCount()).toBe(1);
  });

  test('200–201 returns the three 2xx entries', async ({ loadedPage }) => {
    await loadedPage.setStatusRange(200, 201);
    await loadedPage.applyFilters();
    // 200 (users), 201 (login), 200 (css)
    expect(await loadedPage.getMatchedCount()).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Visual filter — MIME type
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual filter — MIME type', () => {
  test('unchecking text/css excludes the CSS entry', async ({ loadedPage }) => {
    await loadedPage.uncheckMime('text/css');
    await loadedPage.applyFilters();
    expect(await loadedPage.getMatchedCount()).toBe(3);
  });

  test('unchecking application/json excludes all JSON entries', async ({ loadedPage }) => {
    await loadedPage.uncheckMime('application/json');
    await loadedPage.applyFilters();
    // only styles.css remains
    expect(await loadedPage.getMatchedCount()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Visual filter — Exclude domains
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual filter — Exclude domains', () => {
  test('excluding cdn.example.com removes the CSS entry', async ({ loadedPage }) => {
    await loadedPage.setExcludeDomains(['cdn.example.com']);
    await loadedPage.applyFilters();
    expect(await loadedPage.getMatchedCount()).toBe(3);
  });

  test('excluding example.com removes all non-CDN entries', async ({ loadedPage }) => {
    await loadedPage.setExcludeDomains(['example.com']);
    await loadedPage.applyFilters();
    // only cdn.example.com/styles.css remains
    expect(await loadedPage.getMatchedCount()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Visual filter — Combined filters
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual filter — Combined', () => {
  test('URL pattern + status range narrows to a single entry', async ({ loadedPage }) => {
    await loadedPage.setUrlPattern('/api/');
    await loadedPage.setStatusRange(400, 599);
    await loadedPage.applyFilters();
    // only api/missing (404) matches both conditions
    expect(await loadedPage.getMatchedCount()).toBe(1);
  });

  test('method + MIME combination filters orthogonally', async ({ loadedPage }) => {
    await loadedPage.uncheckMethod('POST');
    await loadedPage.uncheckMime('text/css');
    await loadedPage.applyFilters();
    // GET entries minus the CSS one → users (200 json) + missing (404 json)
    expect(await loadedPage.getMatchedCount()).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reset filters
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Reset filters', () => {
  test('clears the URL pattern input', async ({ loadedPage }) => {
    await loadedPage.setUrlPattern('/api/');
    await loadedPage.resetFiltersBtn.click();
    await expect(loadedPage.urlPatternInput).toHaveValue('');
  });

  test('clears both status range inputs', async ({ loadedPage }) => {
    await loadedPage.setStatusRange(200, 404);
    await loadedPage.resetFiltersBtn.click();
    await expect(loadedPage.statusMinInput).toHaveValue('');
    await expect(loadedPage.statusMaxInput).toHaveValue('');
  });

  test('restores every method checkbox to checked', async ({ loadedPage }) => {
    await loadedPage.uncheckMethod('GET');
    await loadedPage.uncheckMethod('POST');
    await loadedPage.resetFiltersBtn.click();
    const uncheckedCount = await loadedPage.methodCheckboxes
      .locator('input[type="checkbox"]:not(:checked)')
      .count();
    expect(uncheckedCount).toBe(0);
  });

  test('clears the exclude-domains textarea', async ({ loadedPage }) => {
    await loadedPage.setExcludeDomains(['cdn.example.com']);
    await loadedPage.resetFiltersBtn.click();
    await expect(loadedPage.excludeDomainsTextarea).toHaveValue('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JS Script tab
// ─────────────────────────────────────────────────────────────────────────────

test.describe('JS Script tab', () => {
  test.beforeEach(async ({ loadedPage }) => {
    await loadedPage.switchToJsTab();
  });

  test('valid script filters entries correctly', async ({ loadedPage }) => {
    await loadedPage.setJsExpression('return entries.filter(e => e.response.status === 200);');
    await loadedPage.applyFilters();
    // users (200) + styles.css (200)
    expect(await loadedPage.getMatchedCount()).toBe(2);
  });

  test('all example buttons populate the textarea with non-empty scripts', async ({ loadedPage }) => {
    const btns  = loadedPage.jsExampleBtns;
    const count = await btns.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      await btns.nth(i).click();
      const value = await loadedPage.jsExpressionTextarea.inputValue();
      expect(value.trim().length, `Example button ${i} produced an empty script`).toBeGreaterThan(0);
    }
  });

  test('syntax error shows a dismissible error message', async ({ loadedPage }) => {
    await loadedPage.setJsExpression('this is not valid javascript!!!');
    await loadedPage.filterBtn.click();
    await expect(loadedPage.jsErrorBox).toBeVisible({ timeout: 5_000 });
    await loadedPage.jsErrorCloseBtn.click();
    await expect(loadedPage.jsErrorBox).toBeHidden();
  });

  test('script returning a non-array shows a type error', async ({ loadedPage }) => {
    await loadedPage.setJsExpression('return 42;');
    await loadedPage.filterBtn.click();
    await expect(loadedPage.jsErrorBox).toBeVisible({ timeout: 5_000 });
    await expect(loadedPage.jsErrorText).toContainText('array');
  });

  test('empty script shows a "Script is empty" error', async ({ loadedPage }) => {
    await loadedPage.setJsExpression('');
    await loadedPage.filterBtn.click();
    await expect(loadedPage.jsErrorBox).toBeVisible({ timeout: 5_000 });
    await expect(loadedPage.jsErrorText).toContainText('empty');
  });

  test('runtime error in the script shows an error message', async ({ loadedPage }) => {
    // Accessing a property of undefined throws at runtime, not at parse time
    await loadedPage.setJsExpression('return entries.filter(e => e.nonexistent.boom);');
    await loadedPage.filterBtn.click();
    await expect(loadedPage.jsErrorBox).toBeVisible({ timeout: 5_000 });
    await expect(loadedPage.jsErrorText).toContainText('Runtime error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Preview table
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Preview table', () => {
  test('row count matches the matched entry count', async ({ loadedPage }) => {
    await loadedPage.applyFilters();
    const rowCount     = await loadedPage.previewBody.locator('tr').count();
    const matchedCount = await loadedPage.getMatchedCount();
    expect(rowCount).toBe(matchedCount);
  });

  test('sort by status ascending orders rows correctly', async ({ loadedPage }) => {
    await loadedPage.applyFilters();
    await loadedPage.sortBy('status');
    const statuses = await loadedPage.getPreviewColumnValues('status');
    expect(statuses).toEqual(['200', '200', '201', '404']);
  });

  test('sort by status descending reverses the order', async ({ loadedPage }) => {
    await loadedPage.applyFilters();
    await loadedPage.sortBy('status'); // first click = ascending
    await loadedPage.sortBy('status'); // second click = descending
    const statuses = await loadedPage.getPreviewColumnValues('status');
    expect(statuses).toEqual(['404', '201', '200', '200']);
  });

  test('sort by time ascending orders rows by duration', async ({ loadedPage }) => {
    await loadedPage.applyFilters();
    await loadedPage.sortBy('time');
    const times   = await loadedPage.getPreviewColumnValues('time');
    const numeric = times.map(Number);
    expect(numeric).toEqual([...numeric].sort((a, b) => a - b));
  });

  test('method column shows the correct HTTP verbs', async ({ loadedPage }) => {
    await loadedPage.applyFilters();
    const methods = await loadedPage.getPreviewColumnValues('method');
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Preview truncation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Preview truncation', () => {
  test('more than 100 results shows truncation note and caps table at 100 rows', async ({ harPage }) => {
    const largeHar = generateHar(150);
    await harPage.uploadHarObject('large.har', largeHar);
    await harPage.applyFilters();

    await expect(harPage.previewTruncation).toBeVisible();
    await expect(harPage.previewTruncation).toContainText('150');
    const rowCount = await harPage.previewBody.locator('tr').count();
    expect(rowCount).toBe(100);
  });

  test('100 or fewer results does not show the truncation note', async ({ loadedPage }) => {
    await loadedPage.applyFilters();
    await expect(loadedPage.previewTruncation).toBeHidden();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Export', () => {
  test('download button triggers a filtered.har file download', async ({ loadedPage }) => {
    await loadedPage.applyFilters();
    const downloadPromise = loadedPage.page.waitForEvent('download');
    await loadedPage.downloadBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('filtered.har');
  });

  test('copy button shows the "Copied!" toast', async ({ loadedPage, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await loadedPage.applyFilters();
    await loadedPage.copyBtn.click();
    await expect(loadedPage.copyToast).toBeVisible({ timeout: 3_000 });
    await expect(loadedPage.copyToast).toContainText('Copied');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// localStorage persistence
// ─────────────────────────────────────────────────────────────────────────────

test.describe('localStorage persistence', () => {
  test('visual filter values are restored after navigating away and back', async ({ harPage }) => {
    await harPage.uploadHarFile(SAMPLE_HAR);
    // Fill fields — each auto-saves on input/change
    await harPage.setUrlPattern('/api/');
    await harPage.setStatusRange(200, 404);
    await harPage.setExcludeDomains(['cdn.example.com']);

    // Navigate away and back (same browser context = same localStorage)
    await harPage.goto();
    await harPage.uploadHarFile(SAMPLE_HAR); // triggers restoreSavedState

    await expect(harPage.urlPatternInput).toHaveValue('/api/');
    await expect(harPage.statusMinInput).toHaveValue('200');
    await expect(harPage.statusMaxInput).toHaveValue('404');
    await expect(harPage.excludeDomainsTextarea).toHaveValue('cdn.example.com');
  });

  test('JS expression is restored after navigating away and back', async ({ harPage }) => {
    const script = 'return entries.filter(e => e.response.status === 200);';
    await harPage.uploadHarFile(SAMPLE_HAR);
    await harPage.switchToJsTab();
    await harPage.setJsExpression(script); // auto-saves on input

    await harPage.goto();
    await harPage.uploadHarFile(SAMPLE_HAR);
    await harPage.switchToJsTab();

    await expect(harPage.jsExpressionTextarea).toHaveValue(script);
  });
});
