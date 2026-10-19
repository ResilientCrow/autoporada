import { describe, expect, it } from 'vitest';

import type { IdpResult } from '@/application/ports';

import {
  createTestIdp,
  DELETE,
  MEMBER,
  TEST_CLIENT,
  TEST_ISSUER,
  TEST_SECRET,
  type TestIdp,
} from '../../../test/support/oidc/test-idp';
import { testCertificate } from '../../../test/support/oidc/cert';
import { inTransactionScope } from '../system';
import { createIdentityProvider, loadClientCredential, type ProviderOptions } from './index';

const APP = 'https://autoporada.ssps.cz';
const request = { state: 'S'.repeat(43), nonce: 'N'.repeat(43), codeVerifier: 'V'.repeat(43) };

async function setup(over: Partial<ProviderOptions> = {}) {
  const idp = await createTestIdp();
  const provider = createIdentityProvider({
    issuer: TEST_ISSUER,
    clientId: TEST_CLIENT,
    appOrigin: APP,
    credential: { kind: 'secret', secret: TEST_SECRET },
    domainHint: 'ssps.cz',
    production: true,
    fetch: idp.fetch,
    timeoutSeconds: 1,
    ...over,
  });
  return { idp, provider };
}

const value = <T>(result: IdpResult<T>): T => {
  if (!result.ok) throw new Error(`expected ok, got ${result.failure}`);
  return result.value;
};

/** The whole round trip: authorization URL, the browser at Entra, the callback. */
async function signIn(
  idp: TestIdp,
  provider: ReturnType<typeof createIdentityProvider>,
  tamper = {},
) {
  const url = value(await provider.authorizationUrl(request));
  return provider.redeem(idp.authorize(url, {}, tamper), request);
}

describe('Entra over openid-client', () => {
  it('sends the browser to Entra with PKCE S256, the query response mode and our callback', async () => {
    const { provider } = await setup();
    const url = new URL(value(await provider.authorizationUrl({ ...request, prompt: 'login' })));
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://login.microsoftonline.com/00000000-0000-0000-0000-000000000001/oauth2/v2.0/authorize',
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: TEST_CLIENT,
      redirect_uri: `${APP}/auth/callback`,
      response_type: 'code',
      response_mode: 'query',
      scope: 'openid profile email',
      state: request.state,
      nonce: request.nonce,
      code_challenge_method: 'S256',
      domain_hint: 'ssps.cz',
      prompt: 'login',
    });
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('redeems the code and hands back the verified claims', async () => {
    const { idp, provider } = await setup();
    const claims = value(await signIn(idp, provider));
    expect(claims).toMatchObject({
      iss: TEST_ISSUER,
      aud: TEST_CLIENT,
      oid: MEMBER.oid,
      nonce: request.nonce,
    });
    expect(idp.seen.tokenRequests[0]?.get('redirect_uri')).toBe(`${APP}/auth/callback`);
  });

  it.each(['other-key-same-kid', 'none', 'hs256-public-key', 'unknown-kid'] as const)(
    'refuses an ID token signed with %s',
    async (sign) => {
      const { idp, provider } = await setup();
      idp.next({ sign });
      expect(await signIn(idp, provider)).toMatchObject({ ok: false, failure: 'invalid-response' });
    },
  );

  it.each([
    ['another issuer', { iss: 'https://login.microsoftonline.com/common/v2.0' }],
    ['another audience', { aud: 'someone-else' }],
    ['another nonce', { nonce: 'X'.repeat(43) }],
    ['no nonce', { nonce: DELETE }],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 120 }],
  ])('refuses %s', async (_name, claims) => {
    const { idp, provider } = await setup();
    idp.next({ claims });
    expect(await signIn(idp, provider)).toMatchObject({ ok: false, failure: 'invalid-response' });
  });

  it('refuses a callback whose state is not the one it sent', async () => {
    const { idp, provider } = await setup();
    expect(await signIn(idp, provider, { state: 'X'.repeat(43) })).toMatchObject({
      ok: false,
      failure: 'invalid-response',
    });
    expect(idp.seen.tokenRequests).toEqual([]);
  });

  it.each([
    ['access_denied', 'cancelled'],
    ['server_error', 'unavailable'],
    ['invalid_request', 'idp-error'],
  ] as const)(
    'maps an authorization error %s to %s, logging no description',
    async (error, failure) => {
      const { idp, provider } = await setup();
      const description = 'AADSTS50105: jana.novakova@ssps.cz is not assigned to a role.';
      const result = await signIn(idp, provider, { error, description });
      expect(result).toEqual({
        ok: false,
        failure,
        detail: { stage: 'token', error, aadsts: 'AADSTS50105' },
      });
    },
  );

  it.each([
    [
      'a refused code',
      { status: 400, body: { error: 'invalid_grant', error_description: 'AADSTS70008: x' } },
      'idp-error',
    ],
    [
      'a refused client',
      { status: 401, body: { error: 'invalid_client', error_description: 'AADSTS700027: x' } },
      'idp-error',
    ],
    ['an outage', { status: 503, body: { error: 'temporarily_unavailable' } }, 'unavailable'],
    ['a broken server', { status: 502, body: {} }, 'unavailable'],
    ['the network', 'network', 'unavailable'],
    ['a timeout', 'timeout', 'unavailable'],
  ] as const)('maps %s at the token endpoint', async (_name, answer, failure) => {
    const { idp, provider } = await setup();
    idp.failToken(answer);
    expect(await signIn(idp, provider)).toMatchObject({
      ok: false,
      failure,
      detail: { stage: 'token' },
    });
  });

  it('reports discovery outages without caching them', async () => {
    const { idp, provider } = await setup();
    idp.down();
    expect(await provider.authorizationUrl(request)).toEqual({
      ok: false,
      failure: 'unavailable',
      detail: { stage: 'discovery' },
    });
    idp.down(false);
    expect((await provider.authorizationUrl(request)).ok).toBe(true);
  });

  it('refuses to run inside a database transaction', async () => {
    const { provider } = await setup();
    await expect(inTransactionScope(() => provider.authorizationUrl(request))).rejects.toThrow(
      /must not run inside a database transaction/,
    );
  });

  it('signs in with the certificate the way Entra requires', async () => {
    const pair = testCertificate();
    const credential = loadClientCredential({
      kind: 'certificate',
      privateKeyPem: pair.keyPem,
      certificatePem: pair.certificatePem,
      thumbprint: undefined,
    });
    const { idp, provider } = await setup({ credential });
    idp.trust(pair.certificatePem);
    value(await signIn(idp, provider));
    value(await signIn(idp, provider));
    const [first, second] = idp.seen.assertions;
    expect(first?.header).toEqual({ alg: 'PS256', typ: 'JWT', 'x5t#S256': expect.any(String) });
    expect(first?.payload).toMatchObject({
      iss: TEST_CLIENT,
      sub: TEST_CLIENT,
      aud: 'https://login.microsoftonline.com/00000000-0000-0000-0000-000000000001/oauth2/v2.0/token',
    });
    expect(first?.payload.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(second?.payload.jti).not.toBe(first?.payload.jti);
    expect(idp.seen.tokenRequests[0]?.has('client_secret')).toBe(false);
  });

  it('is refused when Entra does not know the certificate', async () => {
    const pair = testCertificate();
    const credential = loadClientCredential({
      kind: 'certificate',
      privateKeyPem: pair.keyPem,
      certificatePem: pair.certificatePem,
      thumbprint: undefined,
    });
    const { idp, provider } = await setup({ credential });
    expect(await signIn(idp, provider)).toMatchObject({
      ok: false,
      failure: 'idp-error',
      detail: { error: 'invalid_client' },
    });
  });
});
