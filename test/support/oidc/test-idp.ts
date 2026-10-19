/**
 * An in-process Entra for tests, behind openid-client's customFetch: the
 * production code runs unchanged against the real Entra URLs. It verifies
 * what Entra verifies (single-use codes, the exact redirect_uri, PKCE S256,
 * the client's credential) and can forge what an attacker would send.
 */
import { createHash, randomBytes, randomUUID, X509Certificate } from 'node:crypto';

import {
  decodeProtectedHeader,
  exportJWK,
  exportSPKI,
  generateKeyPair,
  importX509,
  jwtVerify,
  SignJWT,
  UnsecuredJWT,
  type CryptoKey,
  type JWTPayload,
  type ProtectedHeaderParameters,
} from 'jose';
import type { CustomFetch } from 'openid-client';

import { insideTransaction } from '@/infra/system';

import {
  AUTHORIZE,
  DELETE,
  IDENTITY_CLAIMS,
  json,
  KEYS,
  MEMBER,
  s256,
  TEST_CLIENT,
  TEST_ISSUER,
  TEST_SECRET,
  TEST_TENANT,
  TOKEN,
  type Grant,
  type Signing,
  type TestIdp,
  type TokenFailure,
} from './test-idp-api';

export {
  DELETE,
  MEMBER,
  TEST_CLIENT,
  TEST_ISSUER,
  TEST_SECRET,
  type TestIdp,
} from './test-idp-api';

export async function createTestIdp(): Promise<TestIdp> {
  const good = await generateKeyPair('RS256', { extractable: true });
  const other = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = { ...(await exportJWK(good.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const publicPem = await exportSPKI(good.publicKey);
  const grants = new Map<string, Grant>();
  let pending: { claims?: Record<string, unknown>; sign?: Signing } = {};
  let tokenFailure: TokenFailure | undefined;
  let appRoles: readonly string[] = ['User.ReadBasic.All'];
  let isDown = false;
  let metadata: Readonly<Record<string, string>> = {};
  const seen = {
    tokenRequests: [] as URLSearchParams[],
    assertions: [] as { header: ProtectedHeaderParameters; payload: JWTPayload }[],
    jwksFetches: 0,
    calledInsideTransaction: 0,
    identities: new Set<string>(),
  };
  const remember = (claims: Readonly<Record<string, unknown>>) => {
    for (const key of IDENTITY_CLAIMS) {
      const value = claims[key];
      if (typeof value === 'string' && value) seen.identities.add(value);
    }
  };
  let trusted: { pem: string; x5tS256: string } | undefined;
  const usedJtis = new Set<string>();
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /** Entra's checks of a certificate client assertion (its certificate credentials page). */
  async function assertionValid(assertion: string): Promise<boolean> {
    if (!trusted) return false;
    try {
      const header = decodeProtectedHeader(assertion);
      const key = await importX509(trusted.pem, 'PS256');
      const { payload } = await jwtVerify(assertion, key, {
        algorithms: ['PS256'],
        issuer: TEST_CLIENT,
        subject: TEST_CLIENT,
        audience: TOKEN,
      });
      seen.assertions.push({ header, payload });
      const jti = typeof payload.jti === 'string' ? payload.jti : '';
      const fresh = GUID.test(jti) && !usedJtis.has(jti);
      usedJtis.add(jti);
      const lifetime = (payload.exp ?? 0) - (payload.nbf ?? payload.iat ?? 0);
      return (
        header.typ === 'JWT' &&
        header['x5t#S256'] === trusted.x5tS256 &&
        header.kid === undefined &&
        fresh &&
        lifetime > 0 &&
        lifetime <= 600
      );
    } catch {
      return false;
    }
  }

  async function idToken(grant: Grant): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = {
      iss: TEST_ISSUER,
      aud: TEST_CLIENT,
      sub: `pairwise-${grant.persona.oid}`,
      tid: TEST_TENANT,
      oid: grant.persona.oid,
      acct: grant.persona.acct,
      upn: grant.persona.upn,
      name: grant.persona.name,
      email: grant.persona.email,
      nonce: grant.nonce,
      auth_time: now - 5,
      iat: now,
      nbf: now,
      exp: now + 3600,
    };
    for (const [key, value] of Object.entries(pending.claims ?? {})) {
      if (value === DELETE) delete claims[key];
      else claims[key] = value;
    }
    const sign = pending.sign ?? 'good';
    pending = {};
    const jwt = (key: CryptoKey | Uint8Array, alg: string, kid?: string) =>
      new SignJWT(claims).setProtectedHeader({ alg, typ: 'JWT', ...(kid && { kid }) }).sign(key);
    switch (sign) {
      case 'good':
        return jwt(good.privateKey, 'RS256', 'k1');
      case 'other-key-same-kid':
        return jwt(other.privateKey, 'RS256', 'k1');
      case 'unknown-kid':
        return jwt(other.privateKey, 'RS256', 'k2');
      case 'hs256-public-key':
        return jwt(new TextEncoder().encode(publicPem), 'HS256', 'k1');
      case 'none':
        return new UnsecuredJWT(claims).encode();
    }
  }

  async function token(body: URLSearchParams, signal: AbortSignal | undefined): Promise<Response> {
    seen.tokenRequests.push(body);
    if (tokenFailure === 'network') throw new TypeError('fetch failed');
    if (tokenFailure === 'timeout') {
      return new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason));
      });
    }
    if (tokenFailure) return json(tokenFailure.body, tokenFailure.status, tokenFailure.headers);
    const assertion = body.get('client_assertion');
    const authenticated =
      assertion !== null
        ? body.get('client_assertion_type') ===
            'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' &&
          (await assertionValid(assertion))
        : body.get('client_id') === TEST_CLIENT && body.get('client_secret') === TEST_SECRET;
    if (!authenticated) {
      return json(
        { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret.' },
        401,
      );
    }
    if (body.get('grant_type') === 'client_credentials') {
      const payload = Buffer.from(JSON.stringify({ roles: appRoles })).toString('base64url');
      return json({ token_type: 'Bearer', access_token: `e30.${payload}.`, expires_in: 3600 });
    }
    const grant = grants.get(body.get('code') ?? '');
    const valid =
      body.get('grant_type') === 'authorization_code' &&
      grant !== undefined &&
      !grant.used &&
      body.get('redirect_uri') === grant.redirectUri &&
      s256(body.get('code_verifier') ?? '') === grant.challenge;
    if (!grant || !valid) {
      return json(
        { error: 'invalid_grant', error_description: 'AADSTS70008: The code has expired.' },
        400,
      );
    }
    grant.used = true;
    return json({
      token_type: 'Bearer',
      access_token: 'at',
      expires_in: 3600,
      id_token: await idToken(grant),
    });
  }

  const fetch: CustomFetch = async (url, options) => {
    if (insideTransaction()) seen.calledInsideTransaction++;
    if (isDown) throw new TypeError('fetch failed');
    const { origin, pathname } = new URL(url);
    switch (`${origin}${pathname}`) {
      case `${TEST_ISSUER}/.well-known/openid-configuration`:
        return json({
          issuer: TEST_ISSUER,
          authorization_endpoint: AUTHORIZE,
          token_endpoint: TOKEN,
          jwks_uri: KEYS,
          response_types_supported: ['code'],
          subject_types_supported: ['pairwise'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: ['client_secret_post', 'private_key_jwt'],
          ...metadata,
        });
      case KEYS:
        seen.jwksFetches++;
        return json({ keys: [publicJwk] });
      case TOKEN:
        return token(new URLSearchParams(String(options.body)), options.signal ?? undefined);
      default:
        return json({ error: 'not_found' }, 404);
    }
  };

  return {
    issuer: TEST_ISSUER,
    fetch,
    authorize(authorizationUrl, persona = {}, tamper = {}) {
      const params = new URL(authorizationUrl).searchParams;
      const state = params.get('state') ?? '';
      // Who is at the browser, even when Entra answers with an error.
      remember({ ...MEMBER, ...persona });
      if (tamper.error) {
        const answer = new URLSearchParams({ error: tamper.error, state: tamper.state ?? state });
        if (tamper.description) answer.set('error_description', tamper.description);
        return `?${answer}`;
      }
      const code = randomBytes(24).toString('base64url');
      grants.set(code, {
        state,
        nonce: params.get('nonce') ?? '',
        challenge: params.get('code_challenge') ?? '',
        redirectUri: params.get('redirect_uri') ?? '',
        persona: { ...MEMBER, ...persona },
        used: false,
      });
      return `?${new URLSearchParams({ code, state: tamper.state ?? state, session_state: randomUUID() })}`;
    },
    next(t) {
      pending = { ...t };
      if (t.claims) remember(t.claims);
    },
    failToken(failure) {
      tokenFailure = failure;
    },
    metadata(fields) {
      metadata = fields;
    },
    grantRoles(roles) {
      appRoles = roles;
    },
    trust(certificatePem) {
      const der = new X509Certificate(certificatePem).raw;
      trusted = {
        pem: certificatePem,
        x5tS256: createHash('sha256').update(der).digest('base64url'),
      };
    },
    down(value = true) {
      isDown = value;
    },
    seen,
  };
}
