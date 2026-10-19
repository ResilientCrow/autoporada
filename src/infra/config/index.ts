import { readFileSync } from 'node:fs';

import { ConfigError, readEnv, type Env, type ReadFile } from './read-env';
import { CONFIG_KEYS, databaseUrl, rawConfigSchema, type LogLevel } from './schema';

export { ConfigError } from './read-env';
export type { LogLevel } from './schema';

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
  const parsed = rawConfigSchema.safeParse(readEnv(env, readFile, CONFIG_KEYS));
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
    environment: c.APP_ENV ?? 'development',
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

/**
 * Next.js reads the Server Actions key from process.env only, at first use.
 * A key supplied as a Docker secret (NAME_FILE) is copied there at boot, so
 * Next never falls back to the random key baked into the build output.
 */
export function publishNextRuntimeEnv(config: Config, env: Record<string, string | undefined>) {
  if (config.serverActionsKey && !env['NEXT_SERVER_ACTIONS_ENCRYPTION_KEY']) {
    env['NEXT_SERVER_ACTIONS_ENCRYPTION_KEY'] = config.serverActionsKey;
  }
}

/**
 * Only DATABASE_URL, for the one-shot migrate service: it runs as the schema
 * owner and gets no other secrets.
 */
export function loadDatabaseUrl(env: Env, readFile: ReadFile): string {
  const parsed = databaseUrl.safeParse(readEnv(env, readFile, ['DATABASE_URL'])['DATABASE_URL']);
  if (!parsed.success) throw new ConfigError(['DATABASE_URL: must be a postgres:// URL']);
  return parsed.data;
}

let cached: Config | undefined;

/** DATABASE_URL of this process (see loadDatabaseUrl). */
export function getDatabaseUrl(): string {
  return loadDatabaseUrl(process.env, (path) => readFileSync(path, 'utf8'));
}

/** The process configuration, validated once. Composition roots call this. */
export function getConfig(): Config {
  if (!cached) {
    cached = loadConfig(process.env, (path) => readFileSync(path, 'utf8'));
    publishNextRuntimeEnv(cached, process.env);
  }
  return cached;
}
