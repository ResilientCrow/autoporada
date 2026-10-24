import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ConfigError,
  loadConfig,
  loadDatabaseUrl,
  publishNextRuntimeEnv,
  requireServerActionsKey,
} from './index';

const DEV_ENV = {
  APP_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgres://autoporada:autoporada@localhost:5432/autoporada',
  OIDC_ISSUER: 'http://localhost:8080/ssps',
  OIDC_TENANT_ID: '00000000-0000-0000-0000-000000000001',
  OIDC_CLIENT_ID: 'autoporada-dev',
  OIDC_CLIENT_SECRET: 'dev-secret',
  MAIL_TRANSPORT: 'smtp',
  MAIL_FROM: 'autoporada@example.org',
  SMTP_URL: 'smtp://localhost:1025',
  GOTENBERG_URL: 'http://localhost:3001/',
};

const KEY_PEM = '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----';
const CERT_PEM = '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----';
const PROD_ENV = {
  ...DEV_ENV,
  APP_ENV: 'production',
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://autoporada.ssps.cz',
  OIDC_ISSUER: 'https://login.microsoftonline.com/3f2c1a4e-0000-4000-8000-000000000000/v2.0',
  OIDC_TENANT_ID: '3F2C1A4E-0000-4000-8000-000000000000',
  OIDC_CLIENT_SECRET: undefined,
  OIDC_CLIENT_KEY_FILE: '/run/secrets/entra_key',
  OIDC_CLIENT_CERT_FILE: '/run/secrets/entra_cert',
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
      from: 'autoporada@example.org',
      smtpUrl: 'smtp://localhost:1025',
    });
    expect(config.gotenbergUrl).toBe('http://localhost:3001');
    expect(config.logLevel).toBe('info');
  });

  it('reads secrets from *_FILE and strips the trailing newline', () => {
    const config = loadConfig(
      PROD_ENV,
      secretFiles({
        '/run/secrets/entra_key': `${KEY_PEM}\n`,
        '/run/secrets/entra_cert': CERT_PEM,
      }),
    );
    expect(config.oidc.credential).toEqual({
      kind: 'certificate',
      privateKeyPem: KEY_PEM,
      certificatePem: CERT_PEM,
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
    const files = secretFiles({ '/run/secrets/entra_cert': CERT_PEM });
    expect(problemsOf(() => loadConfig(env, files))).toEqual([
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

  it('takes plain smtp:// only: Mailpit speaks no TLS', () => {
    const problems = problemsOf(() =>
      loadConfig({ ...DEV_ENV, SMTP_URL: 'smtps://localhost:1025' }, noFiles),
    );
    expect(problems).toEqual(['SMTP_URL: must be an smtp:// URL']);
  });

  it('polls for jobs every 2 s unless WORKER_POLL_SECONDS says otherwise', () => {
    expect(loadConfig(DEV_ENV, noFiles).worker).toEqual({ pollSeconds: 2 });
    // An empty value is unset, as for every variable.
    expect(loadConfig({ ...DEV_ENV, WORKER_POLL_SECONDS: '' }, noFiles).worker.pollSeconds).toBe(2);
    for (const [value, seconds] of [
      ['0.5', 0.5],
      ['5', 5],
      ['30', 30],
    ] as const) {
      const config = loadConfig({ ...DEV_ENV, WORKER_POLL_SECONDS: value }, noFiles);
      expect(config.worker.pollSeconds).toBe(seconds);
    }
  });

  it.each(['0.4', '0', '-1', '31', '30.5', 'abc', '2s', '1e1'])(
    'refuses WORKER_POLL_SECONDS=%j',
    (value) => {
      const problems = problemsOf(() =>
        loadConfig({ ...DEV_ENV, WORKER_POLL_SECONDS: value }, noFiles),
      );
      expect(problems).toEqual(['WORKER_POLL_SECONDS: must be a number of seconds from 0.5 to 30']);
    },
  );

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
      loadConfig(
        env,
        secretFiles({ '/run/secrets/entra_key': KEY_PEM, '/run/secrets/entra_cert': CERT_PEM }),
      ),
    );
    expect(problems).toEqual([
      'APP_ORIGIN: must use https in production',
      'OIDC_CLIENT_SECRET: is not allowed in production; use the certificate',
      'MAIL_TRANSPORT: must be graph in production',
    ]);
  });

  it('leaves the Server Actions key to the web process, which needs it in production', () => {
    const files = secretFiles({
      '/run/secrets/entra_key': KEY_PEM,
      '/run/secrets/entra_cert': CERT_PEM,
    });
    const cli = loadConfig({ ...PROD_ENV, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: undefined }, files);
    expect(problemsOf(() => requireServerActionsKey(cli))).toEqual([
      'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: is required in production',
    ]);
    expect(() => requireServerActionsKey(loadConfig(PROD_ENV, files))).not.toThrow();
    expect(() => requireServerActionsKey(loadConfig(DEV_ENV, noFiles))).not.toThrow();
  });

  it('never echoes secret values in error messages', () => {
    const env = { ...DEV_ENV, OIDC_CLIENT_SECRET: 'hunter2', DATABASE_URL: 'mysql://hunter2' };
    const problems = problemsOf(() => loadConfig(env, noFiles));
    expect(problems.join('\n')).not.toContain('hunter2');
  });
});

describe('loadConfig hardening', () => {
  const prodFiles = secretFiles({
    '/run/secrets/entra_key': KEY_PEM,
    '/run/secrets/entra_cert': CERT_PEM,
  });

  it('requires APP_ENV when NODE_ENV=production (next start)', () => {
    const problems = problemsOf(() => loadConfig({ ...DEV_ENV, NODE_ENV: 'production' }, noFiles));
    expect(problems).toEqual([expect.stringMatching(/^APP_ENV: is required/)]);
  });

  it('treats a test deployment of a production build as non-production', () => {
    const config = loadConfig({ ...DEV_ENV, NODE_ENV: 'production', APP_ENV: 'test' }, noFiles);
    expect(config.environment).toBe('test');
  });

  it.each([
    ['the multi-tenant endpoint', 'https://login.microsoftonline.com/common/v2.0'],
    [
      'another tenant',
      'https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/v2.0',
    ],
    ['a foreign host', 'https://login.evil.example/3f2c1a4e-0000-4000-8000-000000000000/v2.0'],
  ])('pins OIDC_ISSUER to the school tenant in production (%s)', (_case, issuer) => {
    const problems = problemsOf(() => loadConfig({ ...PROD_ENV, OIDC_ISSUER: issuer }, prodFiles));
    expect(problems).toEqual(['OIDC_ISSUER: must be the school tenant authority in production']);
  });

  it('allows only Microsoft Graph over https in production', () => {
    const env = { ...PROD_ENV, GRAPH_BASE_URL: 'http://graph.evil.example/v1.0' };
    expect(problemsOf(() => loadConfig(env, prodFiles))).toEqual([
      'GRAPH_BASE_URL: must be https://graph.microsoft.com in production',
    ]);
  });

  it.each(['file:///etc/passwd', 'javascript:alert(1)'])('rejects non-http URL %s', (url) => {
    const problems = problemsOf(() => loadConfig({ ...DEV_ENV, GOTENBERG_URL: url }, noFiles));
    expect(problems).toEqual(['GOTENBERG_URL: must be an http(s) URL']);
  });

  it.each([
    ['base64url', 'bCY8-zSOx-8vlAxeA0Qybi5SPnxa4iM913JkdmTMjUw='],
    ['junk around a valid key', `!!${Buffer.alloc(32, 1).toString('base64')}$$`],
    ['16 bytes', Buffer.alloc(16, 1).toString('base64')],
  ])('rejects a Server Actions key that Next cannot decode (%s)', (_case, key) => {
    const env = { ...DEV_ENV, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: key };
    expect(problemsOf(() => loadConfig(env, noFiles))).toEqual([
      expect.stringMatching(/^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: must be 32 random bytes/),
    ]);
  });

  it('reports a malformed origin as a ConfigError without echoing it', () => {
    const problems = problemsOf(() =>
      loadConfig({ ...DEV_ENV, APP_ORIGIN: 'skola.example.cz' }, noFiles),
    );
    expect(problems.every((p) => p.startsWith('APP_ORIGIN:'))).toBe(true);
    expect(problems.join()).not.toContain('skola.example.cz');
  });

  it('ignores *_FILE variables that are not app settings', () => {
    const env = { ...DEV_ENV, SSL_CERT_FILE: '/missing/ca.pem', OTHER_FILE: '/x' };
    expect(() => loadConfig(env, noFiles)).not.toThrow();
  });
});

describe('publishNextRuntimeEnv', () => {
  const key = Buffer.alloc(32, 9).toString('base64');
  const config = loadConfig({ ...DEV_ENV, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: key }, noFiles);

  it('copies a key that came from a secret file into the runtime env', () => {
    const env: Record<string, string | undefined> = {};
    publishNextRuntimeEnv(config, env);
    expect(env['NEXT_SERVER_ACTIONS_ENCRYPTION_KEY']).toBe(key);
  });

  it('never overrides a key that is already set', () => {
    const env: Record<string, string | undefined> = { NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: 'x' };
    publishNextRuntimeEnv(config, env);
    expect(env['NEXT_SERVER_ACTIONS_ENCRYPTION_KEY']).toBe('x');
  });
});

describe('getConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    delete (globalThis as Record<symbol, unknown>)[Symbol.for('autoporada.config')];
  });

  it('validates process.env once and caches the result', async () => {
    for (const [key, value] of Object.entries(DEV_ENV)) vi.stubEnv(key, value);
    const { getConfig } = await import('./index');
    const first = getConfig();
    vi.stubEnv('APP_ORIGIN', 'not a url');
    expect(getConfig()).toBe(first);
  });

  it('is the same in every module instance, after publishing a key from its file', async () => {
    for (const [key, value] of Object.entries(DEV_ENV)) vi.stubEnv(key, value);
    const dir = mkdtempSync(join(tmpdir(), 'autoporada-config-'));
    writeFileSync(join(dir, 'key'), `${'k'.repeat(43)}=\n`);
    vi.stubEnv('NEXT_SERVER_ACTIONS_ENCRYPTION_KEY_FILE', join(dir, 'key'));
    try {
      const first = (await import('./index')).getConfig();
      // Next loads instrumentation and the app as two module instances.
      vi.resetModules();
      expect((await import('./index')).getConfig()).toBe(first);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe('loadDatabaseUrl', () => {
  it('needs only DATABASE_URL, also as a secret file', () => {
    expect(loadDatabaseUrl({ DATABASE_URL: DEV_ENV.DATABASE_URL }, noFiles)).toBe(
      DEV_ENV.DATABASE_URL,
    );
    const files = secretFiles({ '/run/secrets/db': `${DEV_ENV.DATABASE_URL}\n` });
    expect(loadDatabaseUrl({ DATABASE_URL_FILE: '/run/secrets/db' }, files)).toBe(
      DEV_ENV.DATABASE_URL,
    );
  });

  it.each([{}, { DATABASE_URL: 'mysql://hunter2@db' }])('rejects %j without echoing it', (env) => {
    const problems = problemsOf(() => loadDatabaseUrl(env, noFiles));
    expect(problems).toEqual(['DATABASE_URL: must be a postgres:// URL']);
  });
});

describe('loadConfig: the Entra certificate', () => {
  const prodFiles = secretFiles({
    '/run/secrets/entra_key': KEY_PEM,
    '/run/secrets/entra_cert': CERT_PEM,
  });

  it('needs the key and the certificate together', () => {
    const env = { ...PROD_ENV, OIDC_CLIENT_CERT_FILE: undefined };
    expect(problemsOf(() => loadConfig(env, prodFiles))).toEqual([
      'OIDC_CLIENT_CERT: give OIDC_CLIENT_KEY and OIDC_CLIENT_CERT together',
      'OIDC_CLIENT_KEY: certificate credential is required in production',
    ]);
  });

  it('takes the thumbprint as an optional cross-check, and a domain hint', () => {
    const env = {
      ...PROD_ENV,
      OIDC_CLIENT_CERT_THUMBPRINT: undefined,
      OIDC_DOMAIN_HINT: 'SSPS.cz',
    };
    const config = loadConfig(env, prodFiles);
    expect(config.oidc.credential).toMatchObject({ kind: 'certificate', thumbprint: undefined });
    expect(config.oidc.domainHint).toBe('ssps.cz');
  });
});
