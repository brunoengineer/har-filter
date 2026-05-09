/**
 * HarFilterPage — Page Object Model for the HAR Filter web app.
 *
 * Encapsulates all locators and high-level interactions so that spec
 * files stay focused on *what* is being tested, not *how* to drive
 * the UI.
 */

import { Page, Locator } from '@playwright/test';

export class HarFilterPage {
  readonly page: Page;

  // ── Upload zone ─────────────────────────────────────────────
  readonly dropZone:      Locator;
  readonly fileInput:     Locator;
  readonly fileInfo:      Locator;
  readonly fileNameSpan:  Locator;
  readonly clearFileBtn:  Locator;
  readonly parseStatus:   Locator;

  // ── Filter section ───────────────────────────────────────────
  readonly filterSection: Locator;
  readonly tabVisual:     Locator;
  readonly tabJq:         Locator;

  // Visual filter controls
  readonly urlPatternInput:        Locator;
  readonly urlIsRegexCheckbox:     Locator;
  readonly methodCheckboxes:       Locator;
  readonly statusMinInput:         Locator;
  readonly statusMaxInput:         Locator;
  readonly mimeCheckboxes:         Locator;
  readonly excludeDomainsTextarea: Locator;

  // JS Script tab
  readonly jsExpressionTextarea: Locator;
  readonly jsErrorBox:           Locator;
  readonly jsErrorText:          Locator;
  readonly jsErrorCloseBtn:      Locator;
  readonly jsExampleBtns:        Locator;

  // Filter action buttons
  readonly filterBtn:       Locator;
  readonly resetFiltersBtn: Locator;

  // ── Output section ───────────────────────────────────────────
  readonly outputSection:     Locator;
  readonly statsBar:          Locator;
  readonly downloadBtn:       Locator;
  readonly copyBtn:           Locator;
  readonly copyToast:         Locator;
  readonly previewBody:       Locator;
  readonly previewTruncation: Locator;

  constructor(page: Page) {
    this.page = page;

    this.dropZone               = page.locator('#drop-zone');
    this.fileInput              = page.locator('#file-input');
    this.fileInfo               = page.locator('#file-info');
    this.fileNameSpan           = page.locator('#file-name');
    this.clearFileBtn           = page.locator('#clear-file');
    this.parseStatus            = page.locator('#parse-status');
    this.filterSection          = page.locator('#filter-section');
    this.tabVisual              = page.locator('#tab-visual');
    this.tabJq                  = page.locator('#tab-jq');
    this.urlPatternInput        = page.locator('#url-pattern');
    this.urlIsRegexCheckbox     = page.locator('#url-is-regex');
    this.methodCheckboxes       = page.locator('#method-checkboxes');
    this.statusMinInput         = page.locator('#status-min');
    this.statusMaxInput         = page.locator('#status-max');
    this.mimeCheckboxes         = page.locator('#mime-checkboxes');
    this.excludeDomainsTextarea = page.locator('#exclude-domains');
    this.jsExpressionTextarea   = page.locator('#jq-expression');
    this.jsErrorBox             = page.locator('#jq-error');
    this.jsErrorText            = page.locator('#jq-error-text');
    this.jsErrorCloseBtn        = page.locator('#jq-error-close');
    this.jsExampleBtns          = page.locator('.js-example-btn');
    this.filterBtn              = page.locator('#btn-filter');
    this.resetFiltersBtn        = page.locator('#btn-reset-filters');
    this.outputSection          = page.locator('#output-section');
    this.statsBar               = page.locator('#stats-bar');
    this.downloadBtn            = page.locator('#btn-download');
    this.copyBtn                = page.locator('#btn-copy');
    this.copyToast              = page.locator('#copy-toast');
    this.previewBody            = page.locator('#preview-body');
    this.previewTruncation      = page.locator('#preview-truncation');
  }

  // ── Navigation ───────────────────────────────────────────────

  async goto() {
    await this.page.goto('/');
  }

  // ── File upload ──────────────────────────────────────────────

  /** Upload a HAR file from disk and wait for the filter section to appear. */
  async uploadHarFile(harPath: string) {
    await this.fileInput.setInputFiles(harPath);
    await this.filterSection.waitFor({ state: 'visible', timeout: 5_000 });
  }

  /** Upload a HAR object (serialised in-memory) and wait for the filter section. */
  async uploadHarObject(name: string, harObject: object) {
    const buffer = Buffer.from(JSON.stringify(harObject));
    await this.fileInput.setInputFiles({ name, mimeType: 'application/json', buffer });
    await this.filterSection.waitFor({ state: 'visible', timeout: 5_000 });
  }

  // ── Filter actions ───────────────────────────────────────────

  /** Click Filter HAR and wait for the output section to become visible. */
  async applyFilters() {
    await this.filterBtn.click();
    await this.outputSection.waitFor({ state: 'visible', timeout: 5_000 });
  }

  async setUrlPattern(pattern: string, useRegex = false) {
    await this.urlPatternInput.fill(pattern);
    const checked = await this.urlIsRegexCheckbox.isChecked();
    if (useRegex !== checked) await this.urlIsRegexCheckbox.click();
  }

  async setStatusRange(min: string | number, max: string | number) {
    await this.statusMinInput.fill(String(min));
    await this.statusMaxInput.fill(String(max));
  }

  async uncheckMethod(method: string) {
    await this.methodCheckboxes
      .locator(`input[type="checkbox"][value="${method}"]`)
      .uncheck();
  }

  async uncheckMime(mime: string) {
    await this.mimeCheckboxes
      .locator(`input[type="checkbox"][value="${mime}"]`)
      .uncheck();
  }

  async setExcludeDomains(domains: string[]) {
    await this.excludeDomainsTextarea.fill(domains.join('\n'));
  }

  async switchToJsTab() {
    await this.tabJq.click();
  }

  async setJsExpression(expr: string) {
    await this.jsExpressionTextarea.fill(expr);
  }

  // ── Preview table helpers ────────────────────────────────────

  /**
   * Click the sortable column header once.
   * Call twice to test descending sort.
   */
  async sortBy(column: 'method' | 'url' | 'status' | 'mime' | 'size' | 'time') {
    await this.page.locator(`#preview-table th[data-col="${column}"]`).click();
  }

  /** Return the text content of every cell in the given column (visible rows only). */
  async getPreviewColumnValues(
    column: 'method' | 'url' | 'status' | 'mime' | 'size' | 'time',
  ): Promise<string[]> {
    const colIndex = { method: 0, url: 1, status: 2, mime: 3, size: 4, time: 5 }[column];
    const rows     = this.previewBody.locator('tr');
    const count    = await rows.count();
    const values: string[] = [];
    for (let i = 0; i < count; i++) {
      values.push((await rows.nth(i).locator('td').nth(colIndex).innerText()).trim());
    }
    return values;
  }

  // ── Stats bar ────────────────────────────────────────────────

  /** Parse "X of Y entries matched" and return X. */
  async getMatchedCount(): Promise<number> {
    const text = await this.statsBar.innerText();
    const m    = text.match(/^([\d,]+)\s+of/);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : NaN;
  }
}
