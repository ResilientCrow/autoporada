import * as client from 'openid-client';

import type { IdentityProvider, IdpDetail, IdpResult } from '@/application/ports';

import { assertOutsideTransaction } from '../system';
import { mapFailure } from './failure';

/** How the app proves itself to Entra. Development uses a secret; production a certificate (ADR 0002). */
type ClientCredential = { readonly kind: 'secret'; readonly secret: string };

export interface ProviderOptions {
  readonly issuer: string;
  readonly clientId: string;
  readonly appOrigin: string;
  readonly credential: ClientCredential;
  /** `ssps.cz`: Entra skips its account picker for the school's domain. */
  readonly domainHint: string | null;
  readonly production: boolean;
  /** Tests only: an in-process identity provider. */
  readonly fetch?: client.CustomFetch;
  readonly timeoutSeconds?: number;
}

const ENTRA_ORIGIN = 'https://login.microsoftonline.com';

class EndpointOutsideIssuer extends Error {}

function clientAuth(credential: ClientCredential): client.ClientAuth {
  return client.ClientSecretPost(credential.secret);
}

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
  const insecure = new URL(options.issuer).protocol === 'http:' && !options.production;
  let discovered: Promise<client.Configuration> | undefined;

  const configuration = () => {
    discovered ??= client
      .discovery(
        new URL(options.issuer),
        options.clientId,
        { id_token_signed_response_alg: 'RS256', [client.clockTolerance]: 60 },
        clientAuth(options.credential),
        {
          timeout: options.timeoutSeconds ?? 10,
          ...(options.fetch && { [client.customFetch]: options.fetch }),
          execute: [
            client.enableNonRepudiationChecks,
            ...(insecure ? [client.allowInsecureRequests] : []),
          ],
        },
      )
      .then((config) => {
        const server = config.serverMetadata();
        const endpoints = [server.authorization_endpoint, server.token_endpoint, server.jwks_uri];
        if (options.production && endpoints.some((e) => !e || new URL(e).origin !== ENTRA_ORIGIN)) {
          throw new EndpointOutsideIssuer();
        }
        return config;
      })
      .catch((error: unknown) => {
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
