/**
 * An in-process Entra for tests, behind openid-client's customFetch: the
 * production code runs unchanged against the real Entra URLs. It verifies
 * what Entra verifies (single-use codes, the exact redirect_uri, PKCE S256,
 * the client's credential) and can forge what an attacker would send.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  exportJWK,
  exportSPKI,
  generateKeyPair,
  SignJWT,
  UnsecuredJWT,
  type CryptoKey,
} from 'jose';
import type { CustomFetch } from 'openid-client';

import { insideTransaction } from '@/infra/system';

const TEST_TENANT = '00000000-0000-0000-0000-000000000001';
export const TEST_CLIENT = '11111111-2222-4333-8444-555555555555';
export const TEST_SECRET = 'test-client-secret';
export const TEST_ISSUER = `https://login.microsoftonline.com/${TEST_TENANT}/v2.0`;
const BASE = `https://login.microsoftonline.com/${TEST_TENANT}`;
const AUTHORIZE = `${BASE}/oauth2/v2.0/authorize`;
const TOKEN = `${BASE}/oauth2/v2.0/token`;
const KEYS = `${BASE}/discovery/v2.0/keys`;

/** Removes a claim from the next ID token. */
export const DELETE = Symbol('delete');

interface Persona {
  readonly oid: string;
  readonly upn: string;
  readonly name: string;
  readonly email: string;
  readonly acct: number;
}

export const MEMBER: Persona = {
  oid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  upn: 'jana.novakova@ssps.cz',
  name: 'Jana Nováková',
  email: 'jana.novakova@ssps.cz',
  acct: 0,
};

type Signing = 'good' | 'other-key-same-kid' | 'none' | 'hs256-public-key' | 'unknown-kid';
type TokenFailure = { readonly status: number; readonly body: object } | 'network' | 'timeout';

interface Grant {
  readonly state: string;
  readonly nonce: string;
  readonly challenge: string;
  readonly redirectUri: string;
  readonly persona: Persona;
  used: boolean;
}

export interface TestIdp {
  readonly issuer: string;
  readonly fetch: CustomFetch;
  /** Plays the browser at /authorize; returns the query string Entra would send to the callback. */
  authorize(
    authorizationUrl: string,
    persona?: Partial<Persona>,
    tamper?: { readonly state?: string; readonly error?: string; readonly description?: string },
  ): string;
  /** Changes the next ID token. */
  next(token: { readonly claims?: Record<string, unknown>; readonly sign?: Signing }): void;
  failToken(failure: TokenFailure): void;
  down(isDown?: boolean): void;
  readonly seen: {
    readonly tokenRequests: URLSearchParams[];
    jwksFetches: number;
    calledInsideTransaction: number;
  };
}

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

export async function createTestIdp(): Promise<TestIdp> {
  const good = await generateKeyPair('RS256', { extractable: true });
  const other = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = { ...(await exportJWK(good.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const publicPem = await exportSPKI(good.publicKey);
  const grants = new Map<string, Grant>();
  let pending: { claims?: Record<string, unknown>; sign?: Signing } = {};
  let tokenFailure: TokenFailure | undefined;
  let isDown = false;
  const seen = {
    tokenRequests: [] as URLSearchParams[],
    jwksFetches: 0,
    calledInsideTransaction: 0,
  };

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
    if (tokenFailure) return json(tokenFailure.body, tokenFailure.status);
    if (body.get('client_id') !== TEST_CLIENT || body.get('client_secret') !== TEST_SECRET) {
      return json(
        { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret.' },
        401,
      );
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
    },
    failToken(failure) {
      tokenFailure = failure;
    },
    down(value = true) {
      isDown = value;
    },
    seen,
  };
}
