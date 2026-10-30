import * as client from 'openid-client';

import type { Clock, IdpDetail, IdpFailure } from '@/application/ports';

import { assertOutsideTransaction } from '../system';
import { discover, EndpointOutsideIssuer, type ProviderOptions } from './discovery';
import { mapFailure } from './failure';

/** A token is renewed this long before Entra's expiry, so it never runs out mid-call. */
const EARLY_REFRESH_MS = 300_000;
/** After a failure callers get that failure for this long: a bad certificate cannot hammer Entra. */
const FAILURE_BACKOFF_MS = 30_000;
/** Each request's own bound; no caller's budget reaches the shared request (see `joined`). */
const REQUEST_TIMEOUT_SECONDS = 10;

/** Why no token: allow-listed codes only (AADSTS digits, OAuth error names), never a description. */
export class AppTokenError extends Error {
  constructor(
    readonly failure: IdpFailure,
    readonly detail: IdpDetail,
  ) {
    super(`app-only token: ${failure} at ${detail.stage}`);
    this.name = 'AppTokenError';
  }
}

/** The Graph token's scope: the application permissions granted to the registration. */
export const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

export interface AppTokenSource {
  /** A Graph access token; rejects with AppTokenError. `signal` bounds this caller's wait, never the shared request. */
  token(signal: AbortSignal): Promise<string>;
  /** Forgets the token, after Graph answered 401. */
  invalidate(): void;
}

function tokenError(error: unknown, stage: IdpDetail['stage']): AppTokenError {
  if (error instanceof EndpointOutsideIssuer) {
    return new AppTokenError('unavailable', { stage: 'discovery', code: 'ENDPOINT_ORIGIN' });
  }
  const mapped = mapFailure(error, stage);
  if (!mapped) throw error;
  return new AppTokenError(mapped.failure, mapped.detail);
}

/**
 * Waits for the request in flight, but no longer than this caller's own budget. The request
 * belongs to nobody: a caller that gives up (a superseded search, a timeout) leaves it running for
 * the others, and its token still lands in the cache.
 */
function joined(flight: Promise<string>, signal: AbortSignal): Promise<string> {
  const aborted = () => new AppTokenError('unavailable', { stage: 'token', code: 'OAUTH_ABORT' });
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const stop = () => reject(aborted());
    signal.addEventListener('abort', stop, { once: true });
    void flight.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

/**
 * The app's own token for Graph (client credentials grant with the same
 * credential and client assertion as sign-in, ADR 0016). Discovery is
 * memoised here and tried again after a failure; one request at a time, its
 * token cached until five minutes before expiry. The request has its own
 * timeout and no caller's budget, so one caller's abort fails nobody else and
 * starts no backoff; a caller's budget only bounds its own wait.
 */
export function createAppTokenSource(options: {
  readonly provider: ProviderOptions;
  readonly scope: typeof GRAPH_SCOPE;
  readonly clock: Clock;
}): AppTokenSource {
  const { clock, scope } = options;
  // openid-client's own default; its FetchBody is typed wider than BodyInit, never sent wider.
  const base: client.CustomFetch =
    options.provider.fetch ?? ((url, init) => fetch(url, init as RequestInit));
  const provider: ProviderOptions = {
    ...options.provider,
    fetch: base,
    timeoutSeconds: Math.min(
      options.provider.timeoutSeconds ?? REQUEST_TIMEOUT_SECONDS,
      REQUEST_TIMEOUT_SECONDS,
    ),
  };

  let discovered: Promise<client.Configuration> | undefined;
  let cached: { readonly token: string; readonly until: number } | undefined;
  let failed: { readonly error: AppTokenError; readonly until: number } | undefined;
  let flight: Promise<string> | undefined;

  const configuration = () => {
    discovered ??= discover(provider).catch((error: unknown) => {
      discovered = undefined;
      throw error;
    });
    return discovered;
  };

  async function request(): Promise<string> {
    let config: client.Configuration;
    try {
      config = await configuration();
    } catch (error) {
      throw tokenError(error, 'discovery');
    }
    try {
      const tokens = await client.clientCredentialsGrant(config, { scope });
      const lifetime = (tokens.expires_in ?? 0) * 1000 - EARLY_REFRESH_MS;
      cached = { token: tokens.access_token, until: clock.now().getTime() + lifetime };
      return tokens.access_token;
    } catch (error) {
      throw tokenError(error, 'token');
    }
  }

  return {
    async token(signal) {
      assertOutsideTransaction('Graph token');
      const now = clock.now().getTime();
      if (cached && now < cached.until) return cached.token;
      if (failed && now < failed.until) throw failed.error;
      if (flight) return joined(flight, signal);
      flight = request()
        .catch((error: unknown) => {
          if (error instanceof AppTokenError) {
            failed = { error, until: clock.now().getTime() + FAILURE_BACKOFF_MS };
          }
          throw error;
        })
        .finally(() => {
          flight = undefined;
        });
      return joined(flight, signal);
    },
    invalidate() {
      cached = undefined;
    },
  };
}
