import { randomUUID } from 'node:crypto';

import * as client from 'openid-client';

import type { ClientCredential } from './credential';

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

/** Discovery named an endpoint off Entra's origin: refused in production. */
export class EndpointOutsideIssuer extends Error {}

/**
 * The client assertion as Entra wants it: PS256, typ JWT, the certificate's
 * `x5t#S256` and no kid, the token endpoint as audience, a GUID jti.
 */
function clientAuth(credential: ClientCredential): client.ClientAuth {
  if (credential.kind === 'secret') return client.ClientSecretPost(credential.secret);
  return (server, metadata, body, headers) =>
    client.PrivateKeyJwt(credential.key, {
      [client.modifyAssertion]: (header, payload) => {
        header['typ'] = 'JWT';
        header['x5t#S256'] = credential.x5tS256;
        delete header['kid'];
        payload['aud'] = server.token_endpoint;
        payload['jti'] = randomUUID();
      },
    })(server, metadata, body, headers);
}

/**
 * Entra's metadata with our settings pinned: signature checks on, RS256, a
 * minute of clock tolerance, plain http only against a development issuer.
 */
export async function discover(options: ProviderOptions): Promise<client.Configuration> {
  const insecure = new URL(options.issuer).protocol === 'http:' && !options.production;
  const config = await client.discovery(
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
  );
  const server = config.serverMetadata();
  const endpoints = [server.authorization_endpoint, server.token_endpoint, server.jwks_uri];
  if (options.production && endpoints.some((e) => !e || new URL(e).origin !== ENTRA_ORIGIN)) {
    throw new EndpointOutsideIssuer();
  }
  return config;
}
