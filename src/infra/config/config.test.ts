import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigError, loadConfig } from './index';

const DEV_ENV = {
  APP_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgres://autoporada:autoporada@localhost:5432/autoporada',
  OIDC_ISSUER: 'http://localhost:8080/ssps',
  OIDC_TENANT_ID: '00000000-0000-0000-0000-000000000001',
  OIDC_CLIENT_ID: 'autoporada-dev',
  OIDC_CLIENT_SECRET: 'dev-secret',
  MAIL_TRANSPORT: 'smtp',
  MAIL_FROM: 'autoporada@ssps.cz',
  SMTP_URL: 'smtp://localhost:1025',
  GOTENBERG_URL: 'http://localhost:3001/',
};

const KEY_PEM = '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----';
const PROD_ENV = {
  ...DEV_ENV,
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://autoporada.ssps.cz',
  OIDC_ISSUER: 'https://login.microsoftonline.com/3f2c1a4e-0000-4000-8000-000000000000/v2.0',
  OIDC_TENANT_ID: '3F2C1A4E-0000-4000-8000-000000000000',
  OIDC_CLIENT_SECRET: undefined,
  OIDC_CLIENT_KEY_FILE: '/run/secrets/entra_key',
  OIDC_CLIENT_CERT_THUMBPRINT: 'A'.repeat(40),
  MAIL_TRANSPORT: 'graph',
  SMTP_URL: undefined,
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

const noFiles = (path: string): string => {
  throw new Error(`unexpected read of ${path}`);
};
const secretFiles = (files: Record<string, string>) => (path: string) => {
  const content = files[path];
  if (content === undefined) throw new Error('ENOENT');
  return content;
};

function problemsOf(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  throw new Error('expected a ConfigError');
}

describe('loadConfig', () => {
  it('accepts the development setup from .env.example', () => {
    const config = loadConfig(DEV_ENV, noFiles);
    expect(config.environment).toBe('development');
    expect(config.oidc.credential).toEqual({ kind: 'secret', secret: 'dev-secret' });
    expect(config.mail).toEqual({
      transport: 'smtp',
      from: 'autoporada@ssps.cz',
      smtpUrl: 'smtp://localhost:1025',
    });
    expect(config.gotenbergUrl).toBe('http://localhost:3001');
    expect(config.logLevel).toBe('info');
  });

  it('reads secrets from *_FILE and strips the trailing newline', () => {
    const config = loadConfig(PROD_ENV, secretFiles({ '/run/secrets/entra_key': `${KEY_PEM}\n` }));
    expect(config.oidc.credential).toEqual({
      kind: 'certificate',
      privateKeyPem: KEY_PEM,
      thumbprint: 'A'.repeat(40),
    });
    expect(config.oidc.tenantId).toBe('3f2c1a4e-0000-4000-8000-000000000000');
  });

  it('rejects a variable given both directly and as a file', () => {
    const env = { ...DEV_ENV, OIDC_CLIENT_SECRET_FILE: '/run/secrets/x' };
    expect(problemsOf(() => loadConfig(env, secretFiles({ '/run/secrets/x': 'y' })))).toEqual([
      'OIDC_CLIENT_SECRET and OIDC_CLIENT_SECRET_FILE are both set; use only one',
    ]);
  });

  it('reports an unreadable secret file without crashing', () => {
    const env = { ...PROD_ENV, OIDC_CLIENT_KEY_FILE: '/missing' };
    expect(problemsOf(() => loadConfig(env, secretFiles({})))).toEqual([
      'OIDC_CLIENT_KEY_FILE: cannot read the file it points to',
    ]);
  });

  it('requires an origin without path or trailing slash', () => {
    const problems = problemsOf(() =>
      loadConfig({ ...DEV_ENV, APP_ORIGIN: 'http://localhost:3000/' }, noFiles),
    );
    expect(problems).toEqual([expect.stringMatching(/^APP_ORIGIN: must be an origin/)]);
  });

  it('requires SMTP_URL for the smtp transport', () => {
    const problems = problemsOf(() => loadConfig({ ...DEV_ENV, SMTP_URL: undefined }, noFiles));
    expect(problems).toEqual(['SMTP_URL: is required when MAIL_TRANSPORT=smtp']);
  });

  it('enforces production hardening', () => {
    const env = {
      ...PROD_ENV,
      APP_ORIGIN: 'http://autoporada.ssps.cz',
      OIDC_CLIENT_SECRET: 'oops',
      MAIL_TRANSPORT: 'smtp',
      SMTP_URL: 'smtp://relay',
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: undefined,
    };
    const problems = problemsOf(() =>
      loadConfig(env, secretFiles({ '/run/secrets/entra_key': KEY_PEM })),
    );
    expect(problems).toEqual([
      'APP_ORIGIN: must use https in production',
      'OIDC_CLIENT_SECRET: is not allowed in production; use the certificate',
      'MAIL_TRANSPORT: must be graph in production',
      'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: is required in production',
    ]);
  });

  it('never echoes secret values in error messages', () => {
    const env = { ...DEV_ENV, OIDC_CLIENT_SECRET: 'hunter2', DATABASE_URL: 'mysql://hunter2' };
    const problems = problemsOf(() => loadConfig(env, noFiles));
    expect(problems.join('\n')).not.toContain('hunter2');
  });
});

describe('getConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('validates process.env once and caches the result', async () => {
    for (const [key, value] of Object.entries(DEV_ENV)) vi.stubEnv(key, value);
    const { getConfig } = await import('./index');
    const first = getConfig();
    vi.stubEnv('APP_ORIGIN', 'not a url');
    expect(getConfig()).toBe(first);
  });
});
