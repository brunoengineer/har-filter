import { test, expect } from '@playwright/test';
import path from 'path';

const SAMPLE_HAR = path.join(__dirname, 'fixtures/sample.har');

test.describe('Page load', () => {
  test('has correct title and drop zone', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('HAR Filter');
    await expect(page.locator('#drop-zone')).toBeVisible();
    await expect(page.locator('#filter-section')).toBeHidden();
  });
});

test.describe('File upload', () => {
  test('shows filter section after loading a HAR file', async ({ page }) => {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(SAMPLE_HAR);
    await expect(page.locator('#filter-section')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#parse-status')).toContainText('4 entries');
  });

  test('clear button resets back to drop zone', async ({ page }) => {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(SAMPLE_HAR);
    await expect(page.locator('#filter-section')).toBeVisible();
    await page.locator('#clear-file').click();
    await expect(page.locator('#drop-zone')).toBeVisible();
    await expect(page.locator('#filter-section')).toBeHidden();
  });
});

test.describe('Visual filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(SAMPLE_HAR);
    await expect(page.locator('#filter-section')).toBeVisible();
  });

  test('no filters returns all 4 entries', async ({ page }) => {
    await page.locator('#btn-filter').click();
    await expect(page.locator('#output-section')).toBeVisible();
    await expect(page.locator('#stats-bar')).toContainText('4');
  });

  test('URL pattern filter narrows results', async ({ page }) => {
    await page.fill('#url-pattern', '/api/');
    await page.locator('#btn-filter').click();
    await expect(page.locator('#output-section')).toBeVisible();
    // 3 entries match /api/ (users, login, missing) — css does not
    await expect(page.locator('#stats-bar')).toContainText('3');
  });

  test('status range filter keeps only matching entries', async ({ page }) => {
    await page.fill('#status-min', '400');
    await page.fill('#status-max', '499');
    await page.locator('#btn-filter').click();
    await expect(page.locator('#output-section')).toBeVisible();
    // Only the 404 entry
    await expect(page.locator('#stats-bar')).toContainText('1');
  });
});

test.describe('JS Script tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(SAMPLE_HAR);
    await expect(page.locator('#filter-section')).toBeVisible();
    await page.locator('#tab-jq').click();
  });

  test('filters entries with a valid script', async ({ page }) => {
    await page.fill('#jq-expression', 'return entries.filter(e => e.response.status === 200);');
    await page.locator('#btn-filter').click();
    await expect(page.locator('#output-section')).toBeVisible();
    // 2 entries have status 200 (users + styles.css)
    await expect(page.locator('#stats-bar')).toContainText('2');
  });

  test('example buttons populate the textarea', async ({ page }) => {
    await page.locator('.js-example-btn').first().click();
    const value = await page.locator('#jq-expression').inputValue();
    expect(value.trim().length).toBeGreaterThan(0);
  });

  test('syntax error shows dismissible error message', async ({ page }) => {
    await page.fill('#jq-expression', 'this is not valid javascript!!!');
    await page.locator('#btn-filter').click();
    await expect(page.locator('#jq-error')).toBeVisible();
    await page.locator('#jq-error-close').click();
    await expect(page.locator('#jq-error')).toBeHidden();
  });

  test('script returning non-array shows error', async ({ page }) => {
    await page.fill('#jq-expression', 'return 42;');
    await page.locator('#btn-filter').click();
    await expect(page.locator('#jq-error')).toBeVisible();
    await expect(page.locator('#jq-error-text')).toContainText('array');
  });
});
