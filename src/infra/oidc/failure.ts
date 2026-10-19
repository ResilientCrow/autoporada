import { AuthorizationResponseError, ClientError, ResponseBodyError } from 'openid-client';

import type { IdpDetail, IdpFailure } from '@/application/ports';

/**
 * The only reader of openid-client's errors. Their messages, descriptions
 * and `cause` carry claims and response bodies (minors' names), so only
 * allow-listed codes leave this function.
 */
export interface MappedFailure {
  readonly failure: IdpFailure;
  readonly detail: IdpDetail;
}

const OAUTH_ERROR = /^[a-z_]{1,40}$/;
/** Entra error codes have five to seven digits, e.g. AADSTS50011, AADSTS7000215. */
const AADSTS = /AADSTS\d{5,7}/;
const UNAVAILABLE_CODES = new Set(['OAUTH_TIMEOUT', 'OAUTH_ABORT']);

const oauthError = (value: unknown) =>
  typeof value === 'string' && OAUTH_ERROR.test(value) ? value : undefined;
const aadsts = (description: unknown) =>
  typeof description === 'string' ? AADSTS.exec(description)?.[0] : undefined;

function statusOf(cause: unknown): number | undefined {
  return cause instanceof Response ? cause.status : undefined;
}

/** A library error as a failure; undefined for a bug, which the caller rethrows. */
export function mapFailure(error: unknown, stage: IdpDetail['stage']): MappedFailure | undefined {
  if (error instanceof AuthorizationResponseError) {
    const code = oauthError(error.error);
    const detail = { stage, error: code, aadsts: aadsts(error.error_description) };
    if (code === 'access_denied') return { failure: 'cancelled', detail };
    if (code === 'server_error' || code === 'temporarily_unavailable') {
      return { failure: 'unavailable', detail };
    }
    return { failure: 'idp-error', detail };
  }
  if (error instanceof ResponseBodyError) {
    const code = oauthError(error.error);
    const detail = {
      stage,
      error: code,
      aadsts: aadsts(error.error_description),
      status: error.status,
    };
    const down = error.status >= 500 || code === 'temporarily_unavailable';
    return { failure: down ? 'unavailable' : 'idp-error', detail };
  }
  if (error instanceof ClientError) {
    const code =
      typeof error.code === 'string' && /^[A-Z_]{1,60}$/.test(error.code) ? error.code : undefined;
    const status = statusOf(error.cause);
    const detail = { stage, code, status };
    const down =
      (code !== undefined && UNAVAILABLE_CODES.has(code)) ||
      (code === 'OAUTH_RESPONSE_IS_NOT_CONFORM' && status !== undefined && status >= 500);
    return { failure: down ? 'unavailable' : 'invalid-response', detail };
  }
  if (error instanceof Error && error.name === 'UnsupportedOperationError') {
    return { failure: 'invalid-response', detail: { stage } };
  }
  // fetch() failing (DNS, refused, reset): a TypeError without a code.
  if (error instanceof TypeError && !('code' in error)) {
    return { failure: 'unavailable', detail: { stage } };
  }
  return undefined;
}
