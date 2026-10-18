import { readFileSync } from 'node:fs';

import { ConfigError, readEnv, type Env, type ReadFile } from './read-env';
import { rawConfigSchema, type LogLevel } from './schema';

export { ConfigError } from './read-env';

type OidcCredential =
  | { kind: 'certificate'; privateKeyPem: string; thumbprint: string }
  | { kind: 'secret'; secret: string };

export interface Config {
  readonly environment: 'development' | 'test' | 'production';
  readonly appOrigin: string;
  readonly databaseUrl: string;
  readonly oidc: {
    readonly issuer: string;
    readonly tenantId: string;
    readonly clientId: string;
    readonly credential: OidcCredential;
  };
  readonly graphBaseUrl: string;
  readonly mail:
    | { readonly transport: 'graph'; readonly from: string }
    | { readonly transport: 'smtp'; readonly from: string; readonly smtpUrl: string };
  readonly gotenbergUrl: string;
  readonly serverActionsKey: string | undefined;
  readonly bootstrapHeadmasterOid: string | undefined;
  readonly logLevel: LogLevel;
}

/** Validates the environment. Error messages name keys, never values. */
export function loadConfig(env: Env, readFile: ReadFile): Config {
  const parsed = rawConfigSchema.safeParse(readEnv(env, readFile));
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  const c = parsed.data;
  const credential: OidcCredential =
    c.OIDC_CLIENT_KEY && c.OIDC_CLIENT_CERT_THUMBPRINT
      ? {
          kind: 'certificate',
          privateKeyPem: c.OIDC_CLIENT_KEY,
          thumbprint: c.OIDC_CLIENT_CERT_THUMBPRINT,
        }
      : { kind: 'secret', secret: c.OIDC_CLIENT_SECRET ?? '' };

  return {
    environment: c.NODE_ENV,
    appOrigin: c.APP_ORIGIN,
    databaseUrl: c.DATABASE_URL,
    oidc: {
      issuer: c.OIDC_ISSUER,
      tenantId: c.OIDC_TENANT_ID.toLowerCase(),
      clientId: c.OIDC_CLIENT_ID,
      credential,
    },
    graphBaseUrl: c.GRAPH_BASE_URL.replace(/\/$/, ''),
    mail:
      c.MAIL_TRANSPORT === 'smtp'
        ? { transport: 'smtp', from: c.MAIL_FROM, smtpUrl: c.SMTP_URL ?? '' }
        : { transport: 'graph', from: c.MAIL_FROM },
    gotenbergUrl: c.GOTENBERG_URL.replace(/\/$/, ''),
    serverActionsKey: c.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,
    bootstrapHeadmasterOid: c.BOOTSTRAP_HEADMASTER_OID?.toLowerCase(),
    logLevel: c.LOG_LEVEL,
  };
}

let cached: Config | undefined;

/** The process configuration, validated once. Composition roots call this. */
export function getConfig(): Config {
  cached ??= loadConfig(process.env, (path) => readFileSync(path, 'utf8'));
  return cached;
}
