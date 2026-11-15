import { readFileSync } from 'node:fs';

import { ConfigError, readEnv, type Env, type ReadFile } from './read-env';
import { CONFIG_KEYS, databaseUrl, rawConfigSchema, type LogLevel } from './schema';

export { ConfigError } from './read-env';
export type { LogLevel } from './schema';

export type OidcCredential =
  | {
      readonly kind: 'certificate';
      readonly privateKeyPem: string;
      readonly certificatePem: string;
      /** The SHA-1 thumbprint the Entra portal shows, as a cross-check. */
      readonly thumbprint: string | undefined;
    }
  | { readonly kind: 'secret'; readonly secret: string };

export interface Config {
  readonly environment: 'development' | 'test' | 'production';
  readonly appOrigin: string;
  readonly databaseUrl: string;
  readonly oidc: {
    readonly issuer: string;
    readonly tenantId: string;
    readonly clientId: string;
    readonly credential: OidcCredential;
    readonly domainHint: string | null;
  };
  readonly graphBaseUrl: string;
  readonly mail:
    | { readonly transport: 'graph'; readonly from: string }
    | { readonly transport: 'smtp'; readonly from: string; readonly smtpUrl: string };
  /** Where people search gets its answers. */
  readonly directory:
    | { readonly kind: 'off' }
    | { readonly kind: 'graph' }
    | { readonly kind: 'dev'; readonly path: string };
  readonly gotenbergUrl: string;
  /** The web's Gotenberg for an untrusted `.doc` (ADR 0066); undefined where none is set. */
  readonly gotenbergImportUrl: string | undefined;
  readonly bootstrapHeadmasterOid: string | undefined;
  readonly logLevel: LogLevel;
  readonly worker: { readonly pollSeconds: number };
}

function directoryOf(c: { DIRECTORY: 'off' | 'dev' | 'graph'; DIRECTORY_DEV_PATH?: string }) {
  const { DIRECTORY: kind, DIRECTORY_DEV_PATH: path } = c;
  // The schema has refused a dev without its path.
  if (kind === 'dev' && path) return { kind, path } as const;
  return kind === 'graph' ? ({ kind } as const) : ({ kind: 'off' } as const);
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
    c.OIDC_CLIENT_KEY && c.OIDC_CLIENT_CERT
      ? {
          kind: 'certificate',
          privateKeyPem: c.OIDC_CLIENT_KEY,
          certificatePem: c.OIDC_CLIENT_CERT,
          thumbprint: c.OIDC_CLIENT_CERT_THUMBPRINT?.toUpperCase(),
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
      domainHint: c.OIDC_DOMAIN_HINT?.toLowerCase() ?? null,
    },
    graphBaseUrl: c.GRAPH_BASE_URL.replace(/\/$/, ''),
    mail:
      c.MAIL_TRANSPORT === 'smtp'
        ? { transport: 'smtp', from: c.MAIL_FROM, smtpUrl: c.SMTP_URL ?? '' }
        : { transport: 'graph', from: c.MAIL_FROM },
    directory: directoryOf(c),
    gotenbergUrl: c.GOTENBERG_URL.replace(/\/$/, ''),
    gotenbergImportUrl: c.GOTENBERG_IMPORT_URL?.replace(/\/$/, ''),
    bootstrapHeadmasterOid: c.BOOTSTRAP_HEADMASTER_OID?.toLowerCase(),
    logLevel: c.LOG_LEVEL,
    worker: { pollSeconds: c.WORKER_POLL_SECONDS },
  };
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

/** DATABASE_URL of this process (see loadDatabaseUrl). */
export function getDatabaseUrl(): string {
  return loadDatabaseUrl(process.env, (path) => readFileSync(path, 'utf8'));
}

const CONFIG = Symbol.for('autoporada.config');

/**
 * The process configuration, validated once. Composition roots call this.
 * Kept on globalThis: Next loads instrumentation and the app as separate
 * module instances.
 */
export function getConfig(): Config {
  const holder = globalThis as { [CONFIG]?: Config };
  if (!holder[CONFIG]) {
    holder[CONFIG] = loadConfig(process.env, (path) => readFileSync(path, 'utf8'));
  }
  return holder[CONFIG];
}
