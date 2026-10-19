import { afterEach, describe, expect, it, vi } from 'vitest';

import { testCertificate } from '../../test/support/oidc/cert';

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
    vi.resetModules();
    for (const key of ['autoporada.web.shared', 'autoporada.config']) {
      delete (globalThis as Record<symbol, unknown>)[Symbol.for(key)];
    }
  });

  it('shares the pool and the limiter, but wires each module instance its own use cases', async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    // Next loads instrumentation and the app as two module instances.
    const instance = async () => {
      const { getContainer } = await import('./container');
      const { USE_CASES } = await import('@/application/use-cases');
      return { container: getContainer(), again: getContainer(), USE_CASES };
    };
    const first = await instance();
    vi.resetModules();
    const second = await instance();
    expect(second.USE_CASES[0]).not.toBe(first.USE_CASES[0]);
    expect(second.again).toBe(second.container);
    expect(second.container.limiter).toBe(first.container.limiter);
    for (const { container, USE_CASES } of [first, second]) {
      expect(USE_CASES.filter((u) => !container.useCases.has(u))).toEqual([]);
    }
  });

  it('connects to nothing until used, and signs nobody in before M4', async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    const { getContainer } = await import('./container');
    const container = getContainer();
    expect(await container.resolvePrincipal('any-token', 'req')).toBeNull();
    expect(container.requestIdFrom('not valid!')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('tells the boot log what it runs with, and to empty the bootstrap oid', async () => {
    const oid = '0d000000-0000-4000-8000-000000000003';
    for (const [name, value] of Object.entries({ ...ENV, BOOTSTRAP_HEADMASTER_OID: oid })) {
      vi.stubEnv(name, value);
    }
    const { getContainer } = await import('./container');
    const report = getContainer().bootReport(new Date());
    expect(report).toEqual({
      facts: { environment: 'development', credential: { kind: 'secret' } },
      errors: [],
      warnings: [
        'BOOTSTRAP_HEADMASTER_OID is set: empty it once the headmaster has signed in (plan §4)',
      ],
    });
    expect(JSON.stringify(report)).not.toContain(oid);
  });

  it('refuses to serve in production without the Server Actions key', async () => {
    const pair = testCertificate();
    const tenant = '00000000-0000-4000-8000-000000000001';
    const production = {
      ...ENV,
      APP_ENV: 'production',
      APP_ORIGIN: 'https://autoporada.ssps.cz',
      OIDC_ISSUER: `https://login.microsoftonline.com/${tenant}/v2.0`,
      OIDC_TENANT_ID: tenant,
      OIDC_CLIENT_SECRET: undefined,
      OIDC_CLIENT_KEY: pair.keyPem,
      OIDC_CLIENT_CERT: pair.certificatePem,
      MAIL_TRANSPORT: 'graph',
    };
    for (const [name, value] of Object.entries(production)) vi.stubEnv(name, value);
    const { getContainer } = await import('./container');
    expect(() => getContainer()).toThrow(/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: is required/);
  });
});
