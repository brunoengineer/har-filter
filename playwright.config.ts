import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // Fail the build on CI if a test.only was accidentally committed
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    // Save a trace on first retry so you can debug failures
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Spin up a local static server before running tests
  webServer: {
    command: 'npx serve . -l 3000 --no-clipboard',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
