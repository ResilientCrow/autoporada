import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

/** Same values as .env.example; the server validates them at boot. */
const E2E_ENV = {
  APP_ENV: 'test',
  PORT: String(PORT),
  APP_ORIGIN: `http://localhost:${PORT}`,
  DATABASE_URL: 'postgres://autoporada:autoporada@localhost:5432/autoporada_e2e',
  OIDC_ISSUER: 'http://localhost:8080/ssps',
  OIDC_TENANT_ID: '00000000-0000-0000-0000-000000000001',
  OIDC_CLIENT_ID: 'autoporada-dev',
  OIDC_CLIENT_SECRET: 'dev-secret',
  MAIL_TRANSPORT: 'smtp',
  MAIL_FROM: 'autoporada@example.org',
  SMTP_URL: 'smtp://localhost:1025',
  GOTENBERG_URL: 'http://localhost:3001',
  // Own database per run (test/e2e/global-setup.ts); the seed makes "reditel" the headmaster.
  BOOTSTRAP_HEADMASTER_OID: '0d000000-0000-4000-8000-000000000003',
};

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
    command: 'pnpm build && pnpm start',
    env: E2E_ENV,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
