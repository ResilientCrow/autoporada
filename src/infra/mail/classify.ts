import { isOutcomeCode, type MailResult } from '@/application/ports';
import { AppTokenError } from '@/infra/oidc';

import { retryAfterMs } from './retry-after';

/** What the transport keeps of an HTTP answer: never its body. */
export interface ProviderAnswer {
  readonly status: number;
  readonly requestId: string | null;
  readonly retryAfter: string | null;
}

/** The connection never carried the request: refused, no address, TLS refused before the write. */
const NOT_WRITTEN = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);
const TLS_CODE = /^ERR_(TLS|SSL)_/;

/** `prefix.code` when it is a valid outcome code (an errno, at most 40 characters), else `prefix.fallback`. */
function named(prefix: string, code: string | undefined, fallback: string): string {
  const full = `${prefix}.${code}`;
  return code && /^[A-Z][A-Z0-9_]+$/.test(code) && isOutcomeCode(full)
    ? full
    : `${prefix}.${fallback}`;
}

/** By status alone (the bodies of 403s are a guess, design §3); never throws. */
export function classifyAnswer(answer: ProviderAnswer, now: Date): MailResult {
  const { status } = answer;
  if (status === 202) return { kind: 'sent', requestId: answer.requestId };
  if (status === 429 || status === 503 || status === 409) {
    const delay = retryAfterMs(answer.retryAfter, now);
    return { kind: 'throttled', retryAfterMs: delay, code: `throttled.${status}` };
  }
  if (status === 401 || status === 403) return { kind: 'auth', code: `auth.${status}` };
  if (status >= 400 && status < 500) return { kind: 'rejected', code: `rejected.${status}` };
  // 5xx, and any status Graph never sends for sendMail: it may have been accepted.
  return { kind: 'unknown', code: `unknown.${status}` };
}

/** The socket error behind undici's `fetch failed`, also inside an AggregateError (one per address). */
function causeCode(error: TypeError): string | undefined {
  const cause: unknown = error.cause;
  const codeOf = (value: unknown) =>
    value instanceof Error && 'code' in value && typeof value.code === 'string'
      ? value.code
      : undefined;
  if (cause instanceof AggregateError) return cause.errors.map(codeOf).find(Boolean);
  return codeOf(cause);
}

function tokenFailure(error: AppTokenError): MailResult {
  if (error.failure === 'unavailable') return { kind: 'not-sent', code: 'net.unavailable' };
  const { stage, aadsts, error: oauth, code, status } = error.detail;
  const name = aadsts ?? oauth ?? code?.replace(/^OAUTH_/, '') ?? status?.toString();
  const named = `auth.${stage}.${name}`;
  return { kind: 'auth', code: name && isOutcomeCode(named) ? named : `auth.${stage}` };
}

/**
 * A call that got no HTTP answer, or a token it could not get. Nothing left
 * the machine (refused, DNS, TLS, the IdP unreachable) is `not-sent`;
 * anything after the write is `unknown`; never throws.
 */
export function classifyFailure(error: unknown): MailResult {
  if (error instanceof AppTokenError) return tokenFailure(error);
  if (
    error instanceof DOMException &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  ) {
    return { kind: 'unknown', code: 'unknown.timeout' };
  }
  if (!(error instanceof TypeError)) return { kind: 'unknown', code: 'unknown.error' };
  const code = causeCode(error);
  if (code && (NOT_WRITTEN.has(code) || TLS_CODE.test(code))) {
    return { kind: 'not-sent', code: named('net', code, 'tls') };
  }
  return { kind: 'unknown', code: named('unknown', code, 'network') };
}
