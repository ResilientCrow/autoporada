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

/** Next.js decodes this key with atob(), so only standard padded base64 works. */
const serverActionsKey = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}=$/, 'must be 32 random bytes in standard base64 (44 chars)');

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
    .regex(/^smtps?:\/\//, 'must be an smtp:// or smtps:// URL')
    .optional(),
  GOTENBERG_URL: httpUrl,
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: serverActionsKey.optional(),
  BOOTSTRAP_HEADMASTER_OID: z.guid().optional(),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
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
  if (!c.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY) {
    problem('NEXT_SERVER_ACTIONS_ENCRYPTION_KEY', 'is required in production');
  }
});

export type LogLevel = (typeof LOG_LEVELS)[number];
