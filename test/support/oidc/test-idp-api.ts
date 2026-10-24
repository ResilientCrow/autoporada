/** The TestIdp's public face: its tenant, client, personas and what a test can tell it. */
import { createHash } from 'node:crypto';

import type { JWTPayload, ProtectedHeaderParameters } from 'jose';
import type { CustomFetch } from 'openid-client';

export const TEST_TENANT = '00000000-0000-0000-0000-000000000001';
export const TEST_CLIENT = '11111111-2222-4333-8444-555555555555';
export const TEST_SECRET = 'test-client-secret';
export const TEST_ISSUER = `https://login.microsoftonline.com/${TEST_TENANT}/v2.0`;
const BASE = `https://login.microsoftonline.com/${TEST_TENANT}`;
export const AUTHORIZE = `${BASE}/oauth2/v2.0/authorize`;
export const TOKEN = `${BASE}/oauth2/v2.0/token`;
export const KEYS = `${BASE}/discovery/v2.0/keys`;
/** The audience of an app-only token for Graph. */
export const GRAPH_AUDIENCE = 'https://graph.microsoft.com';

/** Removes a claim from the next ID token. */
export const DELETE = Symbol('delete');

export interface Persona {
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

export type Signing = 'good' | 'other-key-same-kid' | 'none' | 'hs256-public-key' | 'unknown-kid';
export type TokenFailure =
  | {
      readonly status: number;
      readonly body: object;
      readonly headers?: Readonly<Record<string, string>>;
    }
  | 'network'
  | 'timeout';

export interface Grant {
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
  /** Changes fields of the discovery document, e.g. an endpoint on another origin. */
  metadata(fields: Readonly<Record<string, string>>): void;
  down(isDown?: boolean): void;
  /** Accepts client assertions signed for this certificate, as Entra would after the upload. */
  trust(certificatePem: string): void;
  /** The application roles a client-credentials token carries. */
  grantRoles(roles: readonly string[]): void;
  /** Overrides claims of the next client-credentials tokens, e.g. another audience. */
  appTokenClaims(claims: Readonly<Record<string, unknown>>): void;
  readonly seen: {
    readonly tokenRequests: URLSearchParams[];
    /** Every client-credentials access token issued: they are unsigned, so this is the proof of origin. */
    readonly appTokens: Set<string>;
    readonly assertions: {
      readonly header: ProtectedHeaderParameters;
      readonly payload: JWTPayload;
    }[];
    jwksFetches: number;
    calledInsideTransaction: number;
    /** Names, UPNs and e-mail addresses this IdP put into tokens: never for a log. */
    readonly identities: Set<string>;
  };
}

export const IDENTITY_CLAIMS = ['name', 'upn', 'email', 'preferred_username'];

export const json = (body: object, status = 200, headers: Readonly<Record<string, string>> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
export const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');
