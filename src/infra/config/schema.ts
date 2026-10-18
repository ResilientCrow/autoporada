import { z } from 'zod';

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const;

/** Origin only: scheme + host (+ port), no path and no trailing slash. */
const origin = z.url().refine((value) => new URL(value).origin === value, {
  message: 'must be an origin like https://autoporada.ssps.cz (no path, no trailing slash)',
});

const base64Key32 = z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
  message: 'must be 32 random bytes, base64-encoded',
});

export const rawConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ORIGIN: origin,
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL'),
    OIDC_ISSUER: z.url(),
    OIDC_TENANT_ID: z.guid(),
    OIDC_CLIENT_ID: z.string().min(1),
    OIDC_CLIENT_SECRET: z.string().min(1).optional(),
    OIDC_CLIENT_KEY: z.string().includes('PRIVATE KEY').optional(),
    OIDC_CLIENT_CERT_THUMBPRINT: z
      .string()
      .regex(/^[0-9A-Fa-f]{40}$/, 'must be the 40-character SHA-1 thumbprint')
      .optional(),
    GRAPH_BASE_URL: z.url().default('https://graph.microsoft.com/v1.0'),
    MAIL_TRANSPORT: z.enum(['smtp', 'graph']),
    MAIL_FROM: z.email(),
    SMTP_URL: z
      .string()
      .regex(/^smtps?:\/\//, 'must be an smtp:// or smtps:// URL')
      .optional(),
    GOTENBERG_URL: z.url(),
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: base64Key32.optional(),
    BOOTSTRAP_HEADMASTER_OID: z.guid().optional(),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  })
  .superRefine((c, ctx) => {
    const problem = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

    if (c.MAIL_TRANSPORT === 'smtp' && !c.SMTP_URL) {
      problem('SMTP_URL', 'is required when MAIL_TRANSPORT=smtp');
    }
    const hasCert = Boolean(c.OIDC_CLIENT_KEY && c.OIDC_CLIENT_CERT_THUMBPRINT);
    if (!hasCert && !c.OIDC_CLIENT_SECRET) {
      problem(
        'OIDC_CLIENT_KEY',
        'set OIDC_CLIENT_KEY + OIDC_CLIENT_CERT_THUMBPRINT (or a dev secret)',
      );
    }

    if (c.NODE_ENV !== 'production') return;
    // Production hardening (ADR 0002, 0003, 0008).
    if (!c.APP_ORIGIN.startsWith('https://')) problem('APP_ORIGIN', 'must use https in production');
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
