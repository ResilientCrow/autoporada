import { z } from 'zod';

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const;

const httpUrl = z.url({ protocol: /^https?$/, error: 'must be an http(s) URL' });

/** Origin only: scheme + host (+ port), no path and no trailing slash. */
const origin = httpUrl.refine(
  (value) => {
    try {
      return new URL(value).origin === value;
    } catch {
      return false;
    }
  },
  { message: 'must be an origin like https://autoporada.ssps.cz (no path, no trailing slash)' },
);

/** How often the worker asks the queue for work: seconds, 0.5 to 30. */
const POLL_SECONDS = 'must be a number of seconds from 0.5 to 30';
const pollSeconds = z
  .string()
  .regex(/^\d+(\.\d+)?$/, POLL_SECONDS)
  .transform(Number)
  .refine((seconds) => seconds >= 0.5 && seconds <= 30, POLL_SECONDS);

/** postgres://user:password@host:port/database */
export const databaseUrl = z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL');

const shape = z.object({
  /** Deployment environment. Distinct from NODE_ENV, which `next start` forces to production. */
  APP_ENV: z.enum(['development', 'test', 'production']).optional(),
  NODE_ENV: z.string().optional(),
  APP_ORIGIN: origin,
  DATABASE_URL: databaseUrl,
  OIDC_ISSUER: httpUrl,
  OIDC_TENANT_ID: z.guid(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  OIDC_CLIENT_KEY: z.string().includes('PRIVATE KEY').optional(),
  /** The certificate uploaded to Entra; the private key above signs the client assertion. */
  OIDC_CLIENT_CERT: z.string().includes('BEGIN CERTIFICATE').optional(),
  OIDC_CLIENT_CERT_THUMBPRINT: z
    .string()
    .regex(/^[0-9A-Fa-f]{40}$/, 'must be the 40-character SHA-1 thumbprint')
    .optional(),
  /** Skips Entra's account picker for the school domain, e.g. ssps.cz. */
  OIDC_DOMAIN_HINT: z
    .string()
    .regex(/^[a-z0-9.-]{1,253}$/i, 'must be a domain name')
    .optional(),
  GRAPH_BASE_URL: httpUrl.default('https://graph.microsoft.com/v1.0'),
  MAIL_TRANSPORT: z.enum(['smtp', 'graph']),
  MAIL_FROM: z.email(),
  SMTP_URL: z
    .string()
    .regex(/^smtp:\/\//, 'must be an smtp:// URL')
    .optional(),
  /** People search: `graph` asks Microsoft Graph, `dev` reads a JSON file, `off` says search is off. */
  DIRECTORY: z.enum(['dev', 'off', 'graph']).default('off'),
  /** Not `*_FILE`: readEnv would read that as the Docker-secret form of a DIRECTORY_DEV. */
  DIRECTORY_DEV_PATH: z.string().startsWith('/', 'must be an absolute path').optional(),
  GOTENBERG_URL: httpUrl,
  BOOTSTRAP_HEADMASTER_OID: z.guid().optional(),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  WORKER_POLL_SECONDS: pollSeconds.default(2),
});

/** The variables the app reads; everything else in the environment is ignored. */
export const CONFIG_KEYS: readonly string[] = Object.keys(shape.shape);

export const rawConfigSchema = shape.superRefine((c, ctx) => {
  const problem = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });

  if (!c.APP_ENV && c.NODE_ENV === 'production') {
    problem('APP_ENV', 'is required for production builds (development | test | production)');
  }
  if (c.MAIL_TRANSPORT === 'smtp' && !c.SMTP_URL) {
    problem('SMTP_URL', 'is required when MAIL_TRANSPORT=smtp');
  }
  if (c.DIRECTORY === 'dev' && !c.DIRECTORY_DEV_PATH) {
    problem('DIRECTORY_DEV_PATH', 'is required when DIRECTORY=dev');
  }
  if (c.DIRECTORY !== 'dev' && c.DIRECTORY_DEV_PATH) {
    problem('DIRECTORY_DEV_PATH', 'is only for DIRECTORY=dev');
  }
  const hasCert = Boolean(c.OIDC_CLIENT_KEY && c.OIDC_CLIENT_CERT);
  if (Boolean(c.OIDC_CLIENT_KEY) !== Boolean(c.OIDC_CLIENT_CERT)) {
    problem('OIDC_CLIENT_CERT', 'give OIDC_CLIENT_KEY and OIDC_CLIENT_CERT together');
  } else if (!hasCert && !c.OIDC_CLIENT_SECRET) {
    problem('OIDC_CLIENT_KEY', 'set OIDC_CLIENT_KEY + OIDC_CLIENT_CERT (or a dev secret)');
  }

  if (c.APP_ENV !== 'production') return;
  // Production hardening (ADR 0002, 0003, 0008).
  if (!c.APP_ORIGIN.startsWith('https://')) problem('APP_ORIGIN', 'must use https in production');
  const authority = `https://login.microsoftonline.com/${c.OIDC_TENANT_ID.toLowerCase()}/v2.0`;
  if (c.OIDC_ISSUER !== authority) {
    problem('OIDC_ISSUER', 'must be the school tenant authority in production');
  }
  if (!c.GRAPH_BASE_URL.startsWith('https://graph.microsoft.com/')) {
    problem('GRAPH_BASE_URL', 'must be https://graph.microsoft.com in production');
  }
  if (c.OIDC_CLIENT_SECRET) {
    problem('OIDC_CLIENT_SECRET', 'is not allowed in production; use the certificate');
  }
  if (!hasCert) problem('OIDC_CLIENT_KEY', 'certificate credential is required in production');
  if (c.MAIL_TRANSPORT !== 'graph') problem('MAIL_TRANSPORT', 'must be graph in production');
  if (c.DIRECTORY === 'dev') problem('DIRECTORY', 'dev is not allowed in production');
  if (c.DIRECTORY_DEV_PATH) problem('DIRECTORY_DEV_PATH', 'is not allowed in production');
});

export type LogLevel = (typeof LOG_LEVELS)[number];
