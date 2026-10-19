import * as client from 'openid-client';

import type { IdentityProvider, IdpDetail, IdpResult } from '@/application/ports';

import { assertOutsideTransaction } from '../system';
import { discover, EndpointOutsideIssuer, type ProviderOptions } from './discovery';
import { mapFailure } from './failure';

const fail = (stage: IdpDetail['stage'], error: unknown): IdpResult<never> => {
  if (error instanceof EndpointOutsideIssuer) {
    return {
      ok: false,
      failure: 'unavailable',
      detail: { stage: 'discovery', code: 'ENDPOINT_ORIGIN' },
    };
  }
  const mapped = mapFailure(error, stage);
  if (!mapped) throw error;
  return { ok: false, ...mapped };
};

/**
 * Entra over openid-client. Discovery runs once, on first use, and a failed
 * discovery is tried again next time. The ID token's signature is checked
 * (enableNonRepudiationChecks) and pinned to RS256, so `alg: none`, HS256
 * and keys Entra does not publish are refused.
 */
export function createIdentityProvider(options: ProviderOptions): IdentityProvider {
  const redirectUri = new URL('/auth/callback', options.appOrigin).href;
  let discovered: Promise<client.Configuration> | undefined;

  const configuration = () => {
    discovered ??= discover(options).catch((error: unknown) => {
      discovered = undefined;
      throw error;
    });
    return discovered;
  };

  return {
    async authorizationUrl(request) {
      assertOutsideTransaction('Entra sign-in');
      let config: client.Configuration;
      try {
        config = await configuration();
      } catch (error) {
        return fail('discovery', error);
      }
      try {
        const url = client.buildAuthorizationUrl(config, {
          redirect_uri: redirectUri,
          response_type: 'code',
          response_mode: 'query',
          scope: 'openid profile email',
          state: request.state,
          nonce: request.nonce,
          code_challenge: await client.calculatePKCECodeChallenge(request.codeVerifier),
          code_challenge_method: 'S256',
          ...(options.domainHint && { domain_hint: options.domainHint }),
          ...(request.prompt && { prompt: request.prompt }),
        });
        if (url.origin !== new URL(options.issuer).origin) throw new EndpointOutsideIssuer();
        return { ok: true, value: url.href };
      } catch (error) {
        return fail('authorize', error);
      }
    },

    async redeem(callbackSearch, expected) {
      assertOutsideTransaction('Entra sign-in');
      let config: client.Configuration;
      try {
        config = await configuration();
      } catch (error) {
        return fail('discovery', error);
      }
      try {
        // Built from APP_ORIGIN, never from the request: openid-client sends it as redirect_uri.
        const callback = new URL(`/auth/callback${callbackSearch}`, options.appOrigin);
        const tokens = await client.authorizationCodeGrant(config, callback, {
          pkceCodeVerifier: expected.codeVerifier,
          expectedState: expected.state,
          expectedNonce: expected.nonce,
          idTokenExpected: true,
        });
        const claims = tokens.claims();
        if (!claims)
          return { ok: false, failure: 'invalid-response', detail: { stage: 'id-token' } };
        return { ok: true, value: { ...claims } };
      } catch (error) {
        return fail('token', error);
      }
    },
  };
}
