import { resolve } from 'node:path';

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
  MAIL_FROM: 'autoporada@example.org',
  SMTP_URL: 'smtp://localhost:1025',
  GOTENBERG_URL: 'http://localhost:3001',
  LOG_LEVEL: 'error',
};

/** A production configuration with a certificate. */
const PRODUCTION = () => {
  const pair = testCertificate();
  const tenant = '00000000-0000-4000-8000-000000000001';
  return {
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
};

describe('web container', () => {
  afterEach(async () => {
    // No start loop may outlive a test: the producer retries for as long as the database is away.
    const { stopProducer } = await import('./container');
    await stopProducer();
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
    expect(container.environment).toBe('development');
    expect(container.requestIdFrom('not valid!')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('builds the Graph people search only when the configuration asks for it', async () => {
    const searched = async (directory: string) => {
      for (const [name, value] of Object.entries({ ...ENV, DIRECTORY: directory })) {
        vi.stubEnv(name, value);
      }
      const { getContainer } = await import('./container');
      const container = getContainer();
      const answer = await container.directory.search('ab', new AbortController().signal);
      vi.resetModules();
      for (const key of ['autoporada.web.shared', 'autoporada.config']) {
        delete (globalThis as Record<symbol, unknown>)[Symbol.for(key)];
      }
      return { answer, mode: container.directoryMode, report: container.bootReport(new Date()) };
    };
    const off = await searched('off');
    expect(off.answer).toEqual({ ok: false, code: 'directory.off' });
    expect(off.mode).toBe('off');
    // The Graph adapter answers a short query itself, with no call and no token.
    const graph = await searched('graph');
    expect(graph.answer).toEqual({ ok: true, value: [] });
    expect(graph.mode).toBe('on');
    expect(graph.report.facts).toMatchObject({ directory: 'graph' });
  });

  it('describes failures in development, naming the database address and never its credentials', async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    const { getContainer } = await import('./container');
    const { DatabaseFailure } = await import('@/application/ports');
    const detail = getContainer().describe?.(new DatabaseFailure('08000'), 'database-down');
    expect(detail).toContain('127.0.0.1:9');
    expect(detail).not.toContain('nobody');
    expect(detail).not.toContain('nothing@');
  });

  it('binds no failure describer in production, so no technical line can be sent', async () => {
    for (const [name, value] of Object.entries(PRODUCTION())) {
      if (value !== undefined) vi.stubEnv(name, value);
    }
    const { getContainer } = await import('./container');
    expect(getContainer().describe).toBeUndefined();
  });

  it('opens no connection for jobs until startProducer() is called', async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    const { getContainer } = await import('./container');
    const warn = vi.spyOn(getContainer().log, 'warn');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const holder = globalThis as Record<symbol, { producer: { started: boolean } } | undefined>;
    expect(holder[Symbol.for('autoporada.web.shared')]?.producer.started).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('starts the producer without waiting for the database, and keeps retrying until stopped', async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    const { getContainer, startProducer, stopProducer } = await import('./container');
    const warn = vi.spyOn(getContainer().log, 'warn');
    expect(startProducer()).toBeUndefined();
    startProducer();
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(warn.mock.calls[0]).toEqual([
      expect.objectContaining({ attempt: 1, code: 'ECONNREFUSED' }),
      'jobs.producer_unavailable',
    ]);
    await stopProducer();
    const seen = warn.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(warn.mock.calls.length).toBe(seen);
  });

  it('tells the boot log what it runs with, and to empty the bootstrap oid', async () => {
    const oid = '0d000000-0000-4000-8000-000000000003';
    for (const [name, value] of Object.entries({ ...ENV, BOOTSTRAP_HEADMASTER_OID: oid })) {
      vi.stubEnv(name, value);
    }
    const { getContainer } = await import('./container');
    const report = getContainer().bootReport(new Date());
    expect(report).toEqual({
      facts: { environment: 'development', credential: { kind: 'secret' }, directory: 'off' },
      errors: [],
      warnings: [
        'BOOTSTRAP_HEADMASTER_OID is set: empty it once the headmaster has signed in (plan §4)',
      ],
    });
    expect(JSON.stringify(report)).not.toContain(oid);
  });

  it('answers directory.off unless the dev directory is configured', async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    const { getContainer } = await import('./container');
    const { directory } = getContainer();
    expect(await directory.search('novakova', new AbortController().signal)).toEqual({
      ok: false,
      code: 'directory.off',
    });
  });

  it('tells the pages the directory is off unless the dev directory is configured', async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    const { getContainer } = await import('./container');
    expect(getContainer().directoryMode).toBe('off');
  });

  it('tells the pages the directory is on when DIRECTORY=dev', async () => {
    const path = resolve('docker/dev/directory.json');
    const env = { ...ENV, DIRECTORY: 'dev', DIRECTORY_DEV_PATH: path };
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const { getContainer } = await import('./container');
    expect(getContainer().directoryMode).toBe('on');
  });

  it('searches the dev file when DIRECTORY=dev, and reports the kind but not the path', async () => {
    const path = resolve('docker/dev/directory.json');
    const env = { ...ENV, DIRECTORY: 'dev', DIRECTORY_DEV_PATH: path };
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const { getContainer } = await import('./container');
    const container = getContainer();
    const result = await container.directory.search('novakova', new AbortController().signal);
    expect(result.ok && result.value[0]?.displayName).toBe('Jana Nováková');
    const report = container.bootReport(new Date());
    expect(report.facts).toMatchObject({ directory: 'dev' });
    expect(JSON.stringify(report)).not.toContain(path);
  });

  it('refuses to boot when the dev file is missing, naming the key only', async () => {
    const path = '/nonexistent/secret-place/directory.json';
    const env = { ...ENV, DIRECTORY: 'dev', DIRECTORY_DEV_PATH: path };
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const { getContainer } = await import('./container');
    let error: unknown;
    try {
      getContainer();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/DIRECTORY_DEV_PATH: cannot read the file/);
    expect(String(error)).not.toContain('secret-place');
  });

  it('logs an expired certificate at error at boot', async () => {
    const production = PRODUCTION();
    for (const [name, value] of Object.entries(production)) vi.stubEnv(name, value);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + 800 * 86_400_000));
    try {
      const { bootWeb, getContainer } = await import('./container');
      const error = vi.spyOn(getContainer().log, 'error').mockImplementation(() => {});
      bootWeb();
      expect(error).toHaveBeenCalledWith(
        {},
        'the certificate has expired: renew it (ENTRA-SETUP §6)',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
