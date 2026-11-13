import { randomUUID } from 'node:crypto';

import { pino, stdTimeFunctions, type DestinationStream, type Logger } from 'pino';

import type { LogLevel } from '@/infra/config';

export type { Logger } from 'pino';

/**
 * Keys that must never reach the logs: credentials, tokens, cookies, secrets
 * from Config, request bodies (which carry minors' personal data) and mail
 * addresses.
 * Header names appear in both casings because plain-object fetch headers keep
 * the caller's spelling.
 */
const SENSITIVE_KEYS = [
  'authorization',
  'Authorization',
  'cookie',
  'Cookie',
  'set-cookie',
  'Set-Cookie',
  'password',
  'secret',
  'client_secret',
  'client_assertion',
  'assertion',
  'code_verifier',
  'token',
  'accessToken',
  'idToken',
  'refreshToken',
  'access_token',
  'id_token',
  'refresh_token',
  'privateKeyPem',
  'certificatePem',
  'codeVerifier',
  'nonce',
  'claims',
  'databaseUrl',
  'smtpUrl',
  'body',
  // Drizzle's query errors list the bound values; infra strips them, this is the backstop.
  'params',
  // Mail addresses (ADR 0016): a transport or Graph error must not print who was mailed.
  // So log a state transition as fromState/toState, never from/to.
  'to',
  'toRecipients',
  'email',
  'address',
  'from',
];

/**
 * The OAuth authorization code is redacted only where it travels. A blanket
 * `code` rule would also wipe err.code (ECONNREFUSED, PG 23505), which the
 * logs must keep.
 */
const OAUTH_CODE_PATHS = ['query.code', 'params.code', 'searchParams.code', 'oidc.code'];

/** `token` → `.token`; `set-cookie` → `["set-cookie"]` (pino path syntax). */
const accessor = (key: string) => (/^[A-Za-z_]\w*$/.test(key) ? `.${key}` : `["${key}"]`);

/** Each key is redacted at the top level and up to three objects deep. */
const REDACT_PATHS = [
  ...SENSITIVE_KEYS.flatMap((key) => {
    const prop = accessor(key);
    return [prop.replace(/^\./, ''), `*${prop}`, `*.*${prop}`, `*.*.*${prop}`];
  }),
  ...OAUTH_CODE_PATHS,
];

export interface LoggerOptions {
  /** Process role, e.g. "web" or "worker". */
  service: string;
  level: LogLevel;
  destination?: DestinationStream;
}

export function createLogger({ service, level, destination }: LoggerOptions): Logger {
  return pino(
    {
      level,
      base: { service },
      timestamp: stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    },
    destination,
  );
}

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Reuses a well-formed id set by the reverse proxy, otherwise makes one. */
export function requestIdFrom(header: string | null | undefined): string {
  return header && REQUEST_ID.test(header) ? header : randomUUID();
}
