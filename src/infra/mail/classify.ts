import { isOutcomeCode, type MailResult } from '@/application/ports';
import { AppTokenError } from '@/infra/oidc';

import { retryAfterMs } from './retry-after';

/** What the transport keeps of an HTTP answer: never its body. */
export interface ProviderAnswer {
  readonly status: number;
  readonly requestId: string | null;
  readonly retryAfter: string | null;
}

/**
 * The connection never carried the request: refused, no address, no TCP connection in time
 * (undici's connect timeout), TLS refused before the write. Each is raised by connect(), name
 * resolution or the handshake only; a code a read or write can raise is guarded below.
 */
const NOT_WRITTEN = new Set([
  'ECONNREFUSED',
  'UND_ERR_CONNECT_TIMEOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);
/**
 * Codes that also reach an established socket: the kernel reports an ICMP "unreachable" or an
 * exhausted retransmit as the error of a later read or write, after the request may have
 * left. They mean not written only when `connect` raised them.
 */
const NOT_WRITTEN_ON_CONNECT = new Set(['ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH']);
const TLS_CODE = /^ERR_(TLS|SSL)_/;

/** `prefix.code` when it is a valid outcome code (an errno, at most 40 characters), else `prefix.fallback`. */
function named(prefix: string, code: string | undefined, fallback: string): string {
  const full = `${prefix}.${code}`;
  return code && /^[A-Z][A-Z0-9_]+$/.test(code) && isOutcomeCode(full)
    ? full
    : `${prefix}.${fallback}`;
}

/** What a Graph request-id looks like (a GUID); the ledger column holds at most 64 characters. */
const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

/** By status alone (the bodies of 403s are a guess, design §3); never throws. */
export function classifyAnswer(answer: ProviderAnswer, now: Date): MailResult {
  const { status } = answer;
  if (status === 202) {
    // A header from a proxy or a misbehaving peer must never fail the settle after the mail left.
    const { requestId } = answer;
    return { kind: 'sent', requestId: requestId && REQUEST_ID.test(requestId) ? requestId : null };
  }
  if (status === 429 || status === 503 || status === 409) {
    const delay = retryAfterMs(answer.retryAfter, now);
    return { kind: 'throttled', retryAfterMs: delay, code: `throttled.${status}` };
  }
  if (status === 401 || status === 403) return { kind: 'auth', code: `auth.${status}` };
  if (status >= 400 && status < 500) return { kind: 'rejected', code: `rejected.${status}` };
  // 5xx, and any status Graph never sends for sendMail: it may have been accepted.
  return { kind: 'unknown', code: `unknown.${status}` };
}

interface SocketCause {
  readonly code: string | undefined;
  readonly syscall: string | undefined;
}

/** The socket error behind undici's `fetch failed`, also inside an AggregateError (one per address). */
function socketCause(error: TypeError): SocketCause {
  const field = (value: unknown, key: string) => {
    const found: unknown = value instanceof Error ? Reflect.get(value, key) : undefined;
    return typeof found === 'string' ? found : undefined;
  };
  const cause: unknown = error.cause;
  const first =
    cause instanceof AggregateError ? cause.errors.find((each) => field(each, 'code')) : cause;
  return { code: field(first, 'code'), syscall: field(first, 'syscall') };
}

/** Whether the request cannot have been written: a refusal, a TLS failure, a timeout while connecting. */
function notWritten({ code, syscall }: SocketCause): boolean {
  if (!code) return false;
  return (
    NOT_WRITTEN.has(code) ||
    TLS_CODE.test(code) ||
    (NOT_WRITTEN_ON_CONNECT.has(code) && syscall === 'connect')
  );
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
 * the machine (refused, DNS, a connect timeout, TLS, the IdP unreachable) is `not-sent`;
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
  const cause = socketCause(error);
  if (notWritten(cause)) return { kind: 'not-sent', code: named('net', cause.code, 'tls') };
  return { kind: 'unknown', code: named('unknown', cause.code, 'network') };
}
