import { defineConfig, devices } from '@playwright/test';

import { E2E_ENV, PORT } from './test/e2e/env';

export default defineConfig({
  testDir: 'test/e2e',
  globalSetup: './test/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'cs-CZ',
    timezoneId: 'Europe/Prague',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // The bundle too: global setup runs dist/worker.mjs, the file the worker image runs.
    command: 'pnpm build && pnpm build:node && pnpm start',
    env: E2E_ENV,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
