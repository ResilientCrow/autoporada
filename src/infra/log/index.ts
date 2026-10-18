import { randomUUID } from 'node:crypto';

import { pino, stdTimeFunctions, type DestinationStream, type Logger } from 'pino';

import type { LogLevel } from '@/infra/config';

export type { Logger } from 'pino';

/**
 * Keys that must never reach the logs: credentials, OAuth codes and tokens,
 * cookies, and request bodies (which carry minors' personal data).
 */
const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'secret',
  'code',
  'token',
  'accessToken',
  'idToken',
  'refreshToken',
  'access_token',
  'id_token',
  'refresh_token',
  'client_assertion',
  'body',
];

/** `token` → `.token`; `set-cookie` → `["set-cookie"]` (pino path syntax). */
const accessor = (key: string) => (/^[A-Za-z_]\w*$/.test(key) ? `.${key}` : `["${key}"]`);

/** Each key is redacted at the top level and one or two objects deep. */
const REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) => {
  const prop = accessor(key);
  return [prop.replace(/^\./, ''), `*${prop}`, `*.*${prop}`];
});

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

export function forRequest(logger: Logger, requestId: string): Logger {
  return logger.child({ reqId: requestId });
}
