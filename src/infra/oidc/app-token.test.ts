import type { CustomFetch } from 'openid-client';
import { describe, expect, it } from 'vitest';

import { testCertificate } from '../../../test/support/oidc/cert';
import {
  createTestIdp,
  TEST_CLIENT,
  TEST_ISSUER,
  TEST_SECRET,
} from '../../../test/support/oidc/test-idp';
import { json } from '../../../test/support/oidc/test-idp-api';
import { FixedClock } from '../../../test/support/world/clock';
import { inTransactionScope } from '../system';
import {
  AppTokenError,
  createAppTokenSource,
  loadClientCredential,
  type ProviderOptions,
} from './index';

const GRAPH = 'https://graph.microsoft.com/.default';
const TENANT = '00000000-0000-0000-0000-000000000001';
const UNREAL = `https://login.microsoftonline.com/99999999-9999-4999-8999-999999999999/v2.0`;
const never = () => new AbortController().signal;

/** A source over the TestIdp; `hangDiscovery` makes discovery wait until its signal aborts. */
async function setup(provider: Partial<ProviderOptions> = {}) {
  const idp = await createTestIdp();
  const clock = new FixedClock();
  const flags = { hangDiscovery: false, discoveries: 0, tokenDelayMs: 0 };
  const fetch: CustomFetch = async (url, init) => {
    if (!url.endsWith('/.well-known/openid-configuration')) {
      // A slow Entra: the answer comes late, and an abort in the meantime ends the call as fetch does.
      if (flags.tokenDelayMs > 0) await new Promise((r) => setTimeout(r, flags.tokenDelayMs));
      init.signal?.throwIfAborted();
      return idp.fetch(url, init);
    }
    flags.discoveries++;
    if (url.startsWith(UNREAL)) {
      const description = `AADSTS90002: Tenant '${UNREAL}' not found. Ask jana.novakova@ssps.cz.`;
      return Promise.resolve(
        json({ error: 'invalid_tenant', error_description: description }, 400),
      );
    }
    if (!flags.hangDiscovery) return idp.fetch(url, init);
    return new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });
  };
  const source = createAppTokenSource({
    provider: {
      issuer: TEST_ISSUER,
      clientId: TEST_CLIENT,
      appOrigin: 'https://autoporada.ssps.cz',
      credential: { kind: 'secret', secret: TEST_SECRET },
      domainHint: null,
      production: true,
      fetch,
      ...provider,
    },
    scope: GRAPH,
    clock,
  });
  return { idp, clock, flags, source };
}

const failure = (work: Promise<string>) =>
  work.then(
    () => {
      throw new Error('expected a failure');
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(AppTokenError);
      return error as AppTokenError;
    },
  );

const claims = (token: string): unknown =>
  JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));

describe('the app-only token for Graph', () => {
  it('asks once, for Graph, and keeps the token until five minutes before it expires', async () => {
    const { idp, clock, flags, source } = await setup();
    const token = await source.token(never());
    expect(claims(token)).toMatchObject({ aud: 'https://graph.microsoft.com', tid: TENANT });
    expect(claims(token)).toHaveProperty('exp', expect.any(Number));
    expect(Object.fromEntries(idp.seen.tokenRequests[0] ?? [])).toMatchObject({
      grant_type: 'client_credentials',
      scope: GRAPH,
    });
    expect(await source.token(never())).toBe(token);
    clock.advance(3_299_999);
    await source.token(never());
    expect(idp.seen.tokenRequests).toHaveLength(1);
    clock.advance(1);
    await source.token(never());
    expect(idp.seen.tokenRequests).toHaveLength(2);
    expect(flags.discoveries).toBe(1);
  });

  it('gives ten concurrent callers one token request', async () => {
    const { idp, source } = await setup();
    const tokens = await Promise.all(Array.from({ length: 10 }, () => source.token(never())));
    expect(new Set(tokens).size).toBe(1);
    expect(idp.seen.tokenRequests).toHaveLength(1);
  });

  it('asks again after Graph refused the token (invalidate)', async () => {
    const { idp, source } = await setup();
    await source.token(never());
    source.invalidate();
    await source.token(never());
    expect(idp.seen.tokenRequests).toHaveLength(2);
  });

  it('asks Entra about a refused certificate again only after 30 s', async () => {
    const pair = testCertificate();
    const credential = loadClientCredential({
      kind: 'certificate',
      thumbprint: undefined,
      privateKeyPem: pair.keyPem,
      certificatePem: pair.certificatePem,
    });
    const { idp, clock, source } = await setup({ credential });
    const refused = await failure(source.token(never()));
    expect(refused).toMatchObject({
      failure: 'idp-error',
      detail: { stage: 'token', error: 'invalid_client', aadsts: 'AADSTS7000215', status: 401 },
    });
    idp.trust(pair.certificatePem);
    clock.advance(29_999);
    expect(await failure(source.token(never()))).toBe(refused);
    expect(idp.seen.tokenRequests).toHaveLength(1);
    clock.advance(1);
    await source.token(never());
    expect(idp.seen.tokenRequests).toHaveLength(2);
  });

  it('is unavailable offline and discovers again after a failed discovery', async () => {
    const { idp, clock, flags, source } = await setup();
    idp.down();
    expect(await failure(source.token(never()))).toMatchObject({
      failure: 'unavailable',
      detail: { stage: 'discovery' },
    });
    idp.down(false);
    clock.advance(30_000);
    await source.token(never());
    expect(flags.discoveries).toBe(2);
  });

  it('names an unreal tenant as a discovery failure, never its description', async () => {
    const { source } = await setup({ issuer: UNREAL });
    const error = await failure(source.token(never()));
    expect(error).toMatchObject({
      failure: 'invalid-response',
      detail: { stage: 'discovery', status: 400 },
    });
    expect(error.cause).toBeUndefined();
    expect(`${error.message} ${JSON.stringify(error)}`).not.toMatch(/Tenant|jana|9999/);
  });

  it('lets only the AADSTS digits of a token error out', async () => {
    const { idp, source } = await setup();
    const error_description = 'AADSTS700016: Application for jana.novakova@ssps.cz was not found.';
    idp.failToken({ status: 400, body: { error: 'unauthorized_client', error_description } });
    const error = await failure(source.token(never()));
    expect(error.detail).toEqual({
      stage: 'token',
      error: 'unauthorized_client',
      aadsts: 'AADSTS700016',
      status: 400,
    });
    expect(`${error.message} ${JSON.stringify(error)}`).not.toMatch(/jana|Application/);
  });

  it('stops waiting for discovery when the caller’s budget runs out', async () => {
    const { flags, source } = await setup();
    flags.hangDiscovery = true;
    const budget = new AbortController();
    const pending = failure(source.token(budget.signal));
    budget.abort();
    // The caller leaves the request; it is not the request that was aborted, so no stage is known.
    expect(await pending).toMatchObject({
      failure: 'unavailable',
      detail: { code: 'OAUTH_ABORT' },
    });
  });

  it('stops waiting for the token request when the caller’s budget runs out, and keeps its own timeout', async () => {
    const { idp, source } = await setup();
    await source.token(never());
    source.invalidate();
    idp.failToken('timeout');
    const budget = new AbortController();
    const pending = failure(source.token(budget.signal));
    budget.abort();
    expect(await pending).toMatchObject({ detail: { stage: 'token', code: 'OAUTH_ABORT' } });

    const short = await setup({ timeoutSeconds: 0.05 });
    short.idp.failToken('timeout');
    expect(await failure(short.source.token(never()))).toMatchObject({
      failure: 'unavailable',
      detail: { stage: 'token', code: 'OAUTH_TIMEOUT' },
    });
  });

  it('keeps the request going for the callers waiting when the one who started it gives up', async () => {
    const { idp, flags, source } = await setup();
    flags.tokenDelayMs = 50;
    const first = new AbortController();
    const leader = failure(source.token(first.signal));
    const joiner = source.token(never());
    setTimeout(() => first.abort(), 10);
    expect(await leader).toMatchObject({ detail: { stage: 'token', code: 'OAUTH_ABORT' } });
    const token = await joiner;
    expect(await source.token(never())).toBe(token);
    expect(idp.seen.tokenRequests).toHaveLength(1);
  });

  it('does not back off for 30 s after the only caller gave up, and the request still lands', async () => {
    const { idp, flags, source } = await setup();
    flags.tokenDelayMs = 50;
    const only = new AbortController();
    const pending = failure(source.token(only.signal));
    setTimeout(() => only.abort(), 10);
    expect(await pending).toMatchObject({ detail: { code: 'OAUTH_ABORT' } });
    await expect(source.token(never())).resolves.toEqual(expect.any(String));
    expect(idp.seen.tokenRequests).toHaveLength(1);
  });

  it('lets a caller whose budget runs out leave another caller’s request', async () => {
    const { idp, source } = await setup({ timeoutSeconds: 0.05 });
    idp.failToken('timeout');
    const first = new AbortController();
    const leader = failure(source.token(first.signal));
    const second = new AbortController();
    const joiner = failure(source.token(second.signal));
    second.abort();
    expect(await joiner).toMatchObject({ failure: 'unavailable', detail: { code: 'OAUTH_ABORT' } });
    first.abort();
    await leader;
    // Both left; the one request goes on to its own timeout, and a third caller shares it.
    expect(await failure(source.token(never()))).toMatchObject({
      detail: { code: 'OAUTH_TIMEOUT' },
    });
    expect(idp.seen.tokenRequests).toHaveLength(1);
  });

  it('refuses to run inside a database transaction', async () => {
    const { idp, source } = await setup();
    await expect(inTransactionScope(() => source.token(never()))).rejects.toThrow(
      /inside a database transaction/,
    );
    expect(idp.seen.tokenRequests).toHaveLength(0);
    expect(idp.seen.calledInsideTransaction).toBe(0);
  });
});
