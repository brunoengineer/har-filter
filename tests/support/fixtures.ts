/**
 * fixtures.ts — Custom Playwright fixtures.
 *
 * Provides two convenience fixtures on top of the default ones:
 *
 *   harPage     — App loaded at '/', no file uploaded yet.
 *   loadedPage  — App loaded at '/' with sample.har already parsed
 *                 and the filter section visible.
 *
 * Import `test` and `expect` from this file instead of '@playwright/test'
 * to get access to these fixtures in every spec file.
 */

import { test as base, expect } from '@playwright/test';
import path from 'path';
import { HarFilterPage } from './HarFilterPage';

export { expect };
export { HarFilterPage };

export const SAMPLE_HAR = path.join(__dirname, '../fixtures/sample.har');

type TestFixtures = {
  /** Navigated to '/', no file loaded. */
  harPage: HarFilterPage;
  /** sample.har loaded and filter section visible. */
  loadedPage: HarFilterPage;
};

export const test = base.extend<TestFixtures>({
  harPage: async ({ page }, use) => {
    const hp = new HarFilterPage(page);
    await hp.goto();
    await use(hp);
  },

  loadedPage: async ({ page }, use) => {
    const hp = new HarFilterPage(page);
    await hp.goto();
    await hp.uploadHarFile(SAMPLE_HAR);
    await use(hp);
  },
});
