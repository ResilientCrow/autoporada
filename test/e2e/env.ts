import { fileURLToPath } from 'node:url';

export const PORT = 3100;

/** Same values as .env.example; the server validates them at boot. */
export const E2E_ENV = {
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
  // The people search reads the invented people of docker/dev (the path must be absolute).
  DIRECTORY: 'dev',
  DIRECTORY_DEV_PATH: fileURLToPath(new URL('../../docker/dev/directory.json', import.meta.url)),
  // Own database per run (test/e2e/global-setup.ts); the seed makes "reditel" the headmaster.
  BOOTSTRAP_HEADMASTER_OID: '0d000000-0000-4000-8000-000000000003',
};

/** What the bundled worker adds: Mailpit by address (not by name) and a quick poll. */
export const E2E_WORKER_ENV = {
  ...E2E_ENV,
  MAIL_TRANSPORT: 'smtp',
  SMTP_URL: 'smtp://127.0.0.1:1025',
  WORKER_POLL_SECONDS: '0.5',
};
