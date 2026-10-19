import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV = {
  APP_ORIGIN: 'http://localhost:3000',
  // Port 9 discards: nothing listens, so any connection attempt would fail.
  DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:9/none',
  OIDC_ISSUER: 'http://localhost:8080/ssps',
  OIDC_TENANT_ID: '00000000-0000-0000-0000-000000000001',
  OIDC_CLIENT_ID: 'autoporada-dev',
  OIDC_CLIENT_SECRET: 'dev-secret',
  MAIL_TRANSPORT: 'smtp',
  MAIL_FROM: 'autoporada@ssps.cz',
  SMTP_URL: 'smtp://localhost:1025',
  GOTENBERG_URL: 'http://localhost:3001',
  LOG_LEVEL: 'error',
};

describe('web container', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as Record<symbol, unknown>)[Symbol.for('autoporada.web')];
  });

  it('is built once per process, even across module instances', async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    const first = (await import('./container')).getContainer();
    vi.resetModules();
    const second = (await import('./container')).getContainer();
    expect(second).toBe(first);
  });

  it('connects to nothing until used, and signs nobody in before M4', async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    const { getContainer } = await import('./container');
    const container = getContainer();
    expect(await container.resolvePrincipal('any-token', 'req')).toBeNull();
    expect(container.requestIdFrom('not valid!')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
