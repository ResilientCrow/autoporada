import { describe, expect, it } from 'vitest';

import {
  isOutcomeCode,
  type IdpDetail,
  type IdpFailure,
  type MailResult,
} from '@/application/ports';
import { AppTokenError } from '@/infra/oidc';

import { classifyAnswer, classifyFailure } from './index';

const NOW = new Date('2026-10-24T08:00:00Z');
const answer = (
  status: number,
  retryAfter: string | null = null,
  requestId: string | null = 'r-1',
) => classifyAnswer({ status, requestId, retryAfter }, NOW);
/** How undici rejects: `fetch failed` with the socket's error as the cause. */
const fetchFailed = (code: string, cause: object = {}) =>
  new TypeError('fetch failed', { cause: Object.assign(new Error('socket'), { code }, cause) });
const token = (failure: IdpFailure, detail: IdpDetail) => new AppTokenError(failure, detail);

/** Every code a result carries must fit the ledger and the job output. */
const checked = (result: MailResult): MailResult => {
  if ('code' in result) expect(isOutcomeCode(result.code), result.code).toBe(true);
  return result;
};

describe('classifying a Graph answer', () => {
  it('reads 202 as sent, with the request-id when Graph gave one', () => {
    expect(answer(202)).toEqual({ kind: 'sent', requestId: 'r-1' });
    expect(answer(202, null, null)).toEqual({ kind: 'sent', requestId: null });
  });

  it.each<[number, string | null, MailResult]>([
    [429, '7', { kind: 'throttled', retryAfterMs: 7_000, code: 'throttled.429' }],
    [
      429,
      'Sat, 24 Oct 2026 08:01:00 GMT',
      { kind: 'throttled', retryAfterMs: 60_000, code: 'throttled.429' },
    ],
    [429, null, { kind: 'throttled', retryAfterMs: 30_000, code: 'throttled.429' }],
    [503, '120', { kind: 'throttled', retryAfterMs: 120_000, code: 'throttled.503' }],
    [503, '86400', { kind: 'throttled', retryAfterMs: 900_000, code: 'throttled.503' }],
    [409, null, { kind: 'throttled', retryAfterMs: 30_000, code: 'throttled.409' }],
    [401, null, { kind: 'auth', code: 'auth.401' }],
    [403, null, { kind: 'auth', code: 'auth.403' }],
    [500, null, { kind: 'unknown', code: 'unknown.500' }],
    [502, null, { kind: 'unknown', code: 'unknown.502' }],
    [504, '5', { kind: 'unknown', code: 'unknown.504' }],
    [501, null, { kind: 'unknown', code: 'unknown.501' }],
    [200, null, { kind: 'unknown', code: 'unknown.200' }],
    [302, null, { kind: 'unknown', code: 'unknown.302' }],
    [400, null, { kind: 'rejected', code: 'rejected.400' }],
    [404, null, { kind: 'rejected', code: 'rejected.404' }],
    [413, null, { kind: 'rejected', code: 'rejected.413' }],
    [422, null, { kind: 'rejected', code: 'rejected.422' }],
  ])('reads %d (Retry-After %j) by status alone', (status, retryAfter, expected) => {
    expect(checked(answer(status, retryAfter))).toEqual(expected);
  });
});

describe('classifying a call that got no answer', () => {
  it.each<[string, unknown, MailResult]>([
    ['refused', fetchFailed('ECONNREFUSED'), { kind: 'not-sent', code: 'net.ECONNREFUSED' }],
    ['no such host', fetchFailed('ENOTFOUND'), { kind: 'not-sent', code: 'net.ENOTFOUND' }],
    ['DNS down', fetchFailed('EAI_AGAIN'), { kind: 'not-sent', code: 'net.EAI_AGAIN' }],
    [
      'refused on every address',
      new TypeError('fetch failed', {
        cause: new AggregateError([Object.assign(new Error('x'), { code: 'ECONNREFUSED' })]),
      }),
      { kind: 'not-sent', code: 'net.ECONNREFUSED' },
    ],
    [
      'an expired certificate',
      fetchFailed('CERT_HAS_EXPIRED'),
      { kind: 'not-sent', code: 'net.CERT_HAS_EXPIRED' },
    ],
    [
      'a wrong host name',
      fetchFailed('ERR_TLS_CERT_ALTNAME_INVALID'),
      { kind: 'not-sent', code: 'net.ERR_TLS_CERT_ALTNAME_INVALID' },
    ],
    [
      'a self-signed certificate',
      fetchFailed('DEPTH_ZERO_SELF_SIGNED_CERT'),
      { kind: 'not-sent', code: 'net.DEPTH_ZERO_SELF_SIGNED_CERT' },
    ],
    [
      'undici’s connect timeout (no TCP connection yet)',
      fetchFailed('UND_ERR_CONNECT_TIMEOUT'),
      { kind: 'not-sent', code: 'net.UND_ERR_CONNECT_TIMEOUT' },
    ],
    [
      'the kernel’s connect timeout',
      fetchFailed('ETIMEDOUT', { syscall: 'connect' }),
      { kind: 'not-sent', code: 'net.ETIMEDOUT' },
    ],
    [
      'a connect timeout on every address',
      new TypeError('fetch failed', {
        cause: new AggregateError([
          Object.assign(new Error('x'), { code: 'ETIMEDOUT', syscall: 'connect' }),
          Object.assign(new Error('y'), { code: 'ETIMEDOUT', syscall: 'connect' }),
        ]),
      }),
      { kind: 'not-sent', code: 'net.ETIMEDOUT' },
    ],
    [
      'a timeout once connected',
      fetchFailed('ETIMEDOUT', { syscall: 'read' }),
      { kind: 'unknown', code: 'unknown.ETIMEDOUT' },
    ],
    [
      'a timeout that names no call',
      fetchFailed('ETIMEDOUT'),
      { kind: 'unknown', code: 'unknown.ETIMEDOUT' },
    ],
    [
      'a reset after the write',
      fetchFailed('ECONNRESET'),
      { kind: 'unknown', code: 'unknown.ECONNRESET' },
    ],
    [
      'undici’s closed socket',
      fetchFailed('UND_ERR_SOCKET'),
      { kind: 'unknown', code: 'unknown.UND_ERR_SOCKET' },
    ],
    ['another socket error', fetchFailed('EPIPE'), { kind: 'unknown', code: 'unknown.EPIPE' }],
    [
      'a code too long for the ledger',
      fetchFailed(`ERR_TLS_${'X'.repeat(40)}`),
      { kind: 'not-sent', code: 'net.tls' },
    ],
    [
      'a code that is not an errno',
      fetchFailed('bad code'),
      { kind: 'unknown', code: 'unknown.network' },
    ],
    [
      'a cause without a code',
      new TypeError('fetch failed'),
      { kind: 'unknown', code: 'unknown.network' },
    ],
    [
      'the budget ran out',
      new DOMException('timed out', 'TimeoutError'),
      { kind: 'unknown', code: 'unknown.timeout' },
    ],
    [
      'an abort',
      new DOMException('aborted', 'AbortError'),
      { kind: 'unknown', code: 'unknown.timeout' },
    ],
    [
      'an unparseable answer',
      new SyntaxError('Unexpected end of JSON input'),
      { kind: 'unknown', code: 'unknown.error' },
    ],
  ])('reads %s', (_, error, expected) => {
    expect(checked(classifyFailure(error))).toEqual(expected);
  });
});

describe('classifying the token source’s failures (F8)', () => {
  it.each<[string, AppTokenError, MailResult]>([
    [
      'Entra unreachable at discovery',
      token('unavailable', { stage: 'discovery' }),
      { kind: 'not-sent', code: 'net.unavailable' },
    ],
    [
      'the token endpoint timing out',
      token('unavailable', { stage: 'token', code: 'OAUTH_TIMEOUT' }),
      { kind: 'not-sent', code: 'net.unavailable' },
    ],
    [
      'a refused certificate',
      token('idp-error', {
        stage: 'token',
        error: 'invalid_client',
        aadsts: 'AADSTS7000215',
        status: 401,
      }),
      { kind: 'auth', code: 'auth.token.AADSTS7000215' },
    ],
    [
      'an OAuth error without AADSTS',
      token('idp-error', { stage: 'token', error: 'unauthorized_client', status: 400 }),
      { kind: 'auth', code: 'auth.token.unauthorized_client' },
    ],
    [
      'an unreal tenant',
      token('invalid-response', {
        stage: 'discovery',
        code: 'OAUTH_RESPONSE_IS_NOT_CONFORM',
        status: 400,
      }),
      { kind: 'auth', code: 'auth.discovery.RESPONSE_IS_NOT_CONFORM' },
    ],
    [
      'a discovery answer with only a status',
      token('invalid-response', { stage: 'discovery', status: 400 }),
      { kind: 'auth', code: 'auth.discovery.400' },
    ],
    [
      'a refusal with nothing to name',
      token('invalid-response', { stage: 'discovery' }),
      { kind: 'auth', code: 'auth.discovery' },
    ],
    [
      'a name too long for a code',
      token('idp-error', { stage: 'token', error: 'a'.repeat(40) }),
      { kind: 'auth', code: 'auth.token' },
    ],
  ])('reads %s', (_, error, expected) => {
    expect(checked(classifyFailure(error))).toEqual(expected);
  });
});
