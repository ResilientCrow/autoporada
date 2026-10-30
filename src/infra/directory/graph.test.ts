import { describe, expect, it } from 'vitest';

import type { DirectoryResult, IdpDetail, IdpFailure } from '@/application/ports';
import { DIRECTORY_LIMITS } from '@/domain/report';
import { AppTokenError, createAppTokenSource, type AppTokenSource } from '@/infra/oidc';
import { inTransactionScope } from '@/infra/system';

import { createFakeGraph, GRAPH_BASE, GRAPH_USERS } from '../../../test/support/graph/fake-graph';
import type {
  Answer,
  GraphRequest,
  GraphUser,
  SearchMode,
} from '../../../test/support/graph/fake-graph-api';
import {
  createTestIdp,
  TEST_CLIENT,
  TEST_ISSUER,
  TEST_SECRET,
} from '../../../test/support/oidc/test-idp';
import { FixedClock } from '../../../test/support/world/clock';
import { createGraphDirectory, QUERY_MAX } from './graph';
import { createDirectory } from './index';

const NOVAKOVA = GRAPH_USERS[0]!;
const live = () => new AbortController().signal;

/** A directory entry, valid unless `over` says otherwise. */
const entry = (n: number, over: Partial<GraphUser> = {}): GraphUser => ({
  id: `00000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`,
  displayName: 'Test Testovací',
  givenName: 'Test',
  surname: 'Testovací',
  mail: `test${n}@ssps.cz`,
  userPrincipalName: `test${n}@ssps.cz`,
  ...over,
});

async function setup(
  options: {
    readonly users?: readonly GraphUser[];
    readonly search?: SearchMode;
    readonly timeoutMs?: number;
    readonly baseUrl?: string;
    readonly entraDelayMs?: number;
  } = {},
) {
  const idp = await createTestIdp();
  const clock = new FixedClock(new Date());
  const graph = createFakeGraph({
    idp,
    mailbox: 'autoporada@ssps.cz',
    clock,
    users: options.users ?? GRAPH_USERS,
    ...(options.search && { search: options.search }),
  });
  const requests: { url: string; init: GraphRequest }[] = [];
  const fetch = (url: string, init: GraphRequest) => {
    requests.push({ url, init });
    return graph.fetch(url, init);
  };
  const tokens = createAppTokenSource({
    provider: {
      ...{ issuer: TEST_ISSUER, clientId: TEST_CLIENT, appOrigin: 'https://autoporada.ssps.cz' },
      ...{ credential: { kind: 'secret', secret: TEST_SECRET }, domainHint: null },
      production: true,
      fetch: async (url, init) => {
        // A slow Entra: an abort in the meantime ends the call, as fetch does.
        if (options.entraDelayMs) await new Promise((r) => setTimeout(r, options.entraDelayMs));
        init.signal?.throwIfAborted();
        return graph.fetch(url, init);
      },
    },
    scope: 'https://graph.microsoft.com/.default',
    clock,
  });
  const directory = createGraphDirectory({
    baseUrl: options.baseUrl ?? GRAPH_BASE,
    tokens,
    fetch,
    ...(options.timeoutMs && { timeoutMs: options.timeoutMs }),
  });
  return { idp, graph, requests, tokens, directory };
}

const codeOf = (result: DirectoryResult<unknown>) => (result.ok ? 'ok' : result.code);
const namesOf = (result: DirectoryResult<readonly { displayName: string }[]>) =>
  result.ok ? result.value.map((p) => p.displayName) : result.code;
const clause = (value: string) => `"displayName:${value}" OR "surname:${value}"`;

describe('the Graph directory: the answer', () => {
  it('finds a person with diacritics and keeps names and the id only', async () => {
    const { directory } = await setup();
    expect(await directory.search('Nováková', live())).toEqual({
      ok: true,
      value: [
        {
          graphId: NOVAKOVA.id,
          givenName: 'Jana',
          familyName: 'Nováková',
          displayName: 'Jana Nováková',
        },
      ],
    });
  });

  it('sends the documented request and nothing else', async () => {
    const { requests, graph, directory } = await setup();
    await directory.search('Nováková', live());
    expect(requests).toHaveLength(1);
    const [{ url, init }] = requests as [(typeof requests)[number]];
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(`${GRAPH_BASE}/users`);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      $search: clause('Nováková'),
      $select: 'id,displayName,givenName,surname,mail,userPrincipalName',
      $top: '15',
      $count: 'true',
    });
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({
      authorization: expect.stringMatching(/^Bearer /),
      ConsistencyLevel: 'eventual',
    });
    expect(graph.seen.rejected).toEqual([]);
  });

  it('drops a guest, a room and a shared mailbox that Graph matched', async () => {
    const users = [
      entry(1, { displayName: 'Test Hostující', surname: 'Hostující' }),
      entry(2, { userPrincipalName: 'test_example.org#ext#@ssps.onmicrosoft.com' }),
      entry(3, { displayName: 'Test Učebna', givenName: null, surname: null }),
      entry(4, { displayName: 'Test Podatelna', givenName: 'Test', surname: null }),
      entry(5, { displayName: 'Test Prázdná', givenName: '  ', surname: 'Prázdná' }),
      entry(6, { displayName: 'Test Sdílená', givenName: 'Test', surname: ' ' }),
      entry(7, { displayName: 'Test Skutečný', surname: 'Skutečný' }),
    ];
    const { graph, directory } = await setup({ users });
    const result = await directory.search('Test', live());
    expect(graph.seen.searches).toEqual([clause('Test')]);
    // Number 1 and 7 are real people, and 2 is the one guest.
    expect(namesOf(result)).toEqual(['Test Hostující', 'Test Skutečný']);
  });

  it('drops a guest whatever the case of its marker', async () => {
    const users = [
      entry(1, { userPrincipalName: 'a_example.org#EXT#@ssps.onmicrosoft.com' }),
      entry(2, { userPrincipalName: 'b_example.org#Ext#@ssps.onmicrosoft.com' }),
    ];
    const { directory } = await setup({ users });
    expect(await directory.search('Test', live())).toEqual({ ok: true, value: [] });
  });

  it('keeps only names Graph matched on this query, whatever the case or diacritics', async () => {
    const { graph, directory } = await setup();
    const body = (...users: GraphUser[]) => ({ status: 200, body: { value: users } });
    // Graph matched the first on another word of the query (an e-mail, a nickname).
    graph.script(body(GRAPH_USERS[1]!, GRAPH_USERS[2]!, NOVAKOVA));
    expect(namesOf(await directory.search('novakova', live()))).toEqual(['Jana Nováková']);
    graph.script(body(GRAPH_USERS[3]!));
    expect(namesOf(await directory.search('ŘEHOŘ dvo', live()))).toEqual(['Řehoř Dvořák']);
    graph.script(body(GRAPH_USERS[3]!));
    expect(namesOf(await directory.search('rehor novak', live()))).toEqual([]);
  });

  it('caps the answer at the hit limit and keeps the order', async () => {
    const users = Array.from({ length: 15 }, (_, i) => entry(i, { givenName: `Jméno${i}` }));
    const { directory } = await setup({ users });
    const result = await directory.search('Test', live());
    expect(result.ok && result.value.map((p) => p.givenName)).toEqual(
      users.slice(0, DIRECTORY_LIMITS.hits).map((u) => u.givenName),
    );
  });

  it('drops a person the route could not answer with, and does not count it', async () => {
    const invalid = [
      entry(1, { id: 'not-a-guid' }),
      entry(2, { displayName: 'T'.repeat(DIRECTORY_LIMITS.displayName + 1) }),
      entry(3, { givenName: 'J'.repeat(81) }),
      entry(4, { displayName: '' }),
    ];
    const valid = Array.from({ length: DIRECTORY_LIMITS.hits + 2 }, (_, i) => entry(i + 10));
    const { directory } = await setup({ users: [...invalid, ...valid] });
    const result = await directory.search('Test', live());
    expect(result.ok && result.value.map((p) => p.graphId)).toEqual(
      valid.slice(0, DIRECTORY_LIMITS.hits).map((u) => u.id),
    );
  });

  it('answers a body without a name list, or with a malformed one, as unavailable', async () => {
    const { graph, directory } = await setup();
    const bodies = [{}, { value: 'x' }, { value: [{ id: 5 }] }, { value: [{}] }, { value: null }];
    graph.script(...bodies.map((body): Answer => ({ status: 200, body })));
    for (let i = 0; i < bodies.length; i++) {
      expect(await directory.search('Nováková', live())).toEqual({
        ok: false,
        code: 'directory.unavailable',
        detail: 'body',
      });
    }
  });

  it('answers a body that is no JSON as unavailable', async () => {
    const tokens: AppTokenSource = { token: () => Promise.resolve('t'), invalidate: () => {} };
    const fetch = () => Promise.resolve(new Response('<html>', { status: 200 }));
    const directory = createGraphDirectory({ baseUrl: GRAPH_BASE, tokens, fetch });
    expect(await directory.search('Nováková', live())).toEqual({
      ok: false,
      code: 'directory.unavailable',
      detail: 'body',
    });
  });

  it('ignores keys it does not know and accepts null names', async () => {
    const { graph, directory } = await setup();
    graph.script({
      status: 200,
      body: { '@odata.context': 'x', value: [{ ...NOVAKOVA, jobTitle: 'učitelka', mobile: null }] },
    });
    expect(namesOf(await directory.search('Nováková', live()))).toEqual(['Jana Nováková']);
    graph.script({ status: 200, body: { value: [{ ...NOVAKOVA, mail: null, givenName: null }] } });
    expect(namesOf(await directory.search('Nováková', live()))).toEqual([]);
  });
});

describe('the Graph directory: the query', () => {
  const sentFor = async (query: string) => {
    const { graph, directory } = await setup();
    await directory.search(query, live());
    return { searches: graph.seen.searches, rejected: graph.seen.rejected };
  };

  it('strips quotes, backslashes and ampersands, so the grammar holds', async () => {
    const sent = await sentFor('No"v\\á&k "x');
    expect(sent).toEqual({ searches: [clause('Novák x')], rejected: [] });
  });

  it('collapses whitespace, trims, and sends NFC as typed, not folded', async () => {
    const sent = await sentFor('  Nováková \t\n  Jana ');
    expect(sent.searches).toEqual([clause('Nováková Jana')]);
  });

  it('cuts to the longest query and trims the cut', async () => {
    expect((await sentFor('Nov' + 'a'.repeat(60))).searches).toEqual([
      clause('Nov' + 'a'.repeat(QUERY_MAX - 3)),
    ]);
    expect((await sentFor('a'.repeat(QUERY_MAX - 1) + ' b')).searches).toEqual([
      clause('a'.repeat(QUERY_MAX - 1)),
    ]);
  });

  it.each(['', ' ', 'no', '  no  ', 'ch', 'é', 'áb', '"a"b"', '&&&&', '(((', '- - -'])(
    'makes no call for %j, under three characters or without a word',
    async (query) => {
      const { graph, idp, requests, directory } = await setup();
      expect(await directory.search(query, live())).toEqual({ ok: true, value: [] });
      expect(requests).toEqual([]);
      expect(graph.seen.searches).toEqual([]);
      expect(idp.seen.tokenRequests).toEqual([]);
    },
  );

  it('searches for a query of exactly three characters', async () => {
    const { graph, directory } = await setup();
    await directory.search('Šár', live());
    expect(graph.seen.searches).toEqual([clause('Šár')]);
  });
});

describe('the Graph directory: codes', () => {
  it.each<[string, Answer, string, string]>([
    ['429', 429, 'directory.throttled', 'http-4xx'],
    ['429 with Retry-After', { status: 429, retryAfter: '7' }, 'directory.throttled', 'http-4xx'],
    ['403', 403, 'directory.denied', 'http-4xx'],
    ['400', 400, 'directory.unavailable', 'http-4xx'],
    ['500', 500, 'directory.unavailable', 'http-5xx'],
    ['503', 503, 'directory.unavailable', 'http-5xx'],
    ['504', 504, 'directory.unavailable', 'http-5xx'],
    ['a status Graph never sends', { status: 418 }, 'directory.unavailable', 'http-4xx'],
  ])('maps %s to its code and detail, and calls once', async (_, scripted, code, detail) => {
    const { graph, requests, directory } = await setup();
    graph.script(scripted);
    expect(await directory.search('Nováková', live())).toEqual({ ok: false, code, detail });
    expect(requests.filter((r) => r.url.startsWith(`${GRAPH_BASE}/users?`))).toHaveLength(1);
  });

  it('is unavailable for an answer that is neither 200 nor an error, whatever the fake can send', async () => {
    const tokens: AppTokenSource = { token: () => Promise.resolve('t'), invalidate: () => {} };
    const fetch = () => Promise.resolve(new Response(null, { status: 304 }));
    const directory = createGraphDirectory({ baseUrl: GRAPH_BASE, tokens, fetch });
    expect(await directory.search('Nováková', live())).toEqual({
      ok: false,
      code: 'directory.unavailable',
      detail: 'http-other',
    });
  });

  it('is denied when the token only reads basic and Graph wants User.Read.All', async () => {
    const { graph, directory } = await setup({ search: 'needs-user-read-all' });
    expect(await directory.search('Nováková', live())).toEqual({
      ok: false,
      code: 'directory.denied',
      detail: 'http-4xx',
    });
    expect(graph.seen.rejected).toEqual(['search.role']);
  });

  it('is unavailable when the connection resets', async () => {
    const { graph, directory } = await setup();
    graph.acceptThenDrop();
    expect(await directory.search('Nováková', live())).toEqual({
      ok: false,
      code: 'directory.unavailable',
      detail: 'network',
    });
  });

  it('is unavailable when fetch fails in a way nobody expected', async () => {
    const tokens: AppTokenSource = { token: () => Promise.resolve('t'), invalidate: () => {} };
    const fetch = () => Promise.reject(new RangeError('boom'));
    const directory = createGraphDirectory({ baseUrl: GRAPH_BASE, tokens, fetch });
    expect(await directory.search('Nováková', live())).toEqual({
      ok: false,
      code: 'directory.unavailable',
      detail: 'network',
    });
  });

  it('calls {baseUrl}/users: another base reaches the fake 404 and is unavailable', async () => {
    const { graph, requests, directory } = await setup({
      baseUrl: 'https://graph.microsoft.com/v2.0',
    });
    expect(await directory.search('Nováková', live())).toEqual({
      ok: false,
      code: 'directory.unavailable',
      detail: 'http-4xx',
    });
    expect(requests.at(-1)?.url).toMatch(/^https:\/\/graph\.microsoft\.com\/v2\.0\/users\?/);
    expect(graph.seen.rejected).toEqual(['route']);
  });

  it('never reads the body of a failed answer, only closes it', async () => {
    let closed = false;
    let read = false;
    const tokens: AppTokenSource = { token: () => Promise.resolve('t'), invalidate: () => {} };
    const fetch = () => {
      // A zero-size queue pulls only when somebody reads.
      const body = new ReadableStream(
        {
          pull(controller) {
            read = true;
            controller.enqueue(new TextEncoder().encode('jana.novakova@ssps.cz'));
          },
          cancel() {
            closed = true;
          },
        },
        { highWaterMark: 0 },
      );
      return Promise.resolve(new Response(body, { status: 503 }));
    };
    const directory = createGraphDirectory({ baseUrl: GRAPH_BASE, tokens, fetch });
    const result = await directory.search('Nováková', live());
    expect(result).toEqual({ ok: false, code: 'directory.unavailable', detail: 'http-5xx' });
    expect(JSON.stringify(result)).not.toContain('jana');
    expect(closed).toBe(true);
    expect(read).toBe(false);
  });
});

describe('the Graph directory: the token', () => {
  it('answers a 401 with one fresh token and one more call', async () => {
    const { idp, graph, directory } = await setup();
    graph.script(401);
    expect(namesOf(await directory.search('Nováková', live()))).toEqual(['Jana Nováková']);
    expect(idp.seen.tokenRequests).toHaveLength(2);
    expect(graph.seen.searches).toHaveLength(2);
  });

  it('is denied after a second 401, with no third call', async () => {
    const { idp, graph, directory } = await setup();
    graph.script(401, 401);
    expect(await directory.search('Nováková', live())).toEqual({
      ok: false,
      code: 'directory.denied',
      detail: 'http-4xx',
    });
    expect(idp.seen.tokenRequests).toHaveLength(2);
    expect(graph.seen.rejected).toEqual([]);
  });

  it('is denied when Entra refuses the credential, before any Graph call', async () => {
    const { idp, requests, directory } = await setup();
    idp.failToken({
      status: 401,
      body: { error: 'invalid_client', error_description: 'AADSTS7000215: x' },
    });
    // The AADSTS code tells a bad certificate from a missing consent; the description stays unread.
    expect(await directory.search('Nováková', live())).toEqual({
      ok: false,
      code: 'directory.denied',
      detail: 'token:token:AADSTS7000215',
    });
    expect(requests.filter((r) => r.url.includes('/users'))).toEqual([]);
  });

  it('is unavailable when Entra cannot be reached', async () => {
    const { idp, directory } = await setup();
    idp.failToken('network');
    const result = await directory.search('Nováková', live());
    expect(result).toMatchObject({ ok: false, code: 'directory.unavailable' });
    expect(result).toHaveProperty('detail', expect.stringMatching(/^token:(discovery|token)/));
  });

  it.each<[IdpDetail, string]>([
    [{ stage: 'discovery' }, 'token:discovery'],
    [{ stage: 'discovery', code: 'ENDPOINT_ORIGIN' }, 'token:discovery:ENDPOINT_ORIGIN'],
    [{ stage: 'token', error: 'invalid_client' }, 'token:token:invalid_client'],
    [{ stage: 'token', error: 'invalid_client', aadsts: 'AADSTS70011' }, 'token:token:AADSTS70011'],
    [{ stage: 'token', code: 'OAUTH_TIMEOUT', status: 400 }, 'token:token:OAUTH_TIMEOUT'],
  ])('names a token failure by its allow-listed parts: %j', async (detail, expected) => {
    const tokens: AppTokenSource = {
      token: () => Promise.reject(new AppTokenError('unavailable', detail)),
      invalidate: () => {},
    };
    const fetch = () => Promise.reject(new Error('Graph must not be called'));
    const directory = createGraphDirectory({ baseUrl: GRAPH_BASE, tokens, fetch });
    expect(await directory.search('Nováková', live())).toEqual({
      ok: false,
      code: 'directory.unavailable',
      detail: expected,
    });
  });

  it.each<[IdpFailure, string]>([
    ['cancelled', 'directory.denied'],
    ['idp-error', 'directory.denied'],
    ['invalid-response', 'directory.unavailable'],
    ['unavailable', 'directory.unavailable'],
  ])('reads a token failure of %s as %s', async (failure, code) => {
    const tokens: AppTokenSource = {
      token: () => Promise.reject(new AppTokenError(failure, { stage: 'token' })),
      invalidate: () => {},
    };
    const fetch = () => Promise.reject(new Error('Graph must not be called'));
    const directory = createGraphDirectory({ baseUrl: GRAPH_BASE, tokens, fetch });
    expect(await directory.search('Nováková', live())).toMatchObject({ ok: false, code });
  });
});

describe('the Graph directory: time', () => {
  it('ends a hanging call at its timeout', async () => {
    const { graph, directory } = await setup({ timeoutMs: 50 });
    graph.hang();
    const started = performance.now();
    expect(await directory.search('Nováková', live())).toEqual({
      ok: false,
      code: 'directory.timeout',
    });
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it('spends the same timeout on the token: a hanging Entra is a timeout', async () => {
    const { idp, requests, directory } = await setup({ timeoutMs: 50 });
    idp.failToken('timeout');
    expect(codeOf(await directory.search('Nováková', live()))).toBe('directory.timeout');
    expect(requests.filter((r) => r.url.includes('/users'))).toEqual([]);
  });

  it('ends at once when the caller aborts mid-call', async () => {
    const { graph, directory } = await setup();
    graph.hang();
    const controller = new AbortController();
    const pending = directory.search('Nováková', controller.signal);
    setTimeout(() => controller.abort(), 10);
    expect(await pending).toEqual({ ok: false, code: 'directory.timeout' });
  });

  it('answers a caller that has already aborted with a timeout and makes no call', async () => {
    const { graph, requests, directory } = await setup();
    const controller = new AbortController();
    controller.abort();
    expect(await directory.search('Nováková', controller.signal)).toEqual({
      ok: false,
      code: 'directory.timeout',
    });
    expect(requests).toEqual([]);
    expect(graph.seen.searches).toEqual([]);
  });

  it('keeps a search whose neighbour aborted: the token request is nobody’s budget', async () => {
    const { directory } = await setup({ entraDelayMs: 50 });
    const first = new AbortController();
    const leader = directory.search('Nováková', first.signal);
    const neighbour = directory.search('Novák', live());
    setTimeout(() => first.abort(), 10);
    expect(await leader).toEqual({ ok: false, code: 'directory.timeout' });
    expect(codeOf(await neighbour)).toBe('ok');
    // The next typist is not locked out for 30 s either.
    expect(codeOf(await directory.search('Černá', live()))).toBe('ok');
  });

  it('does not lock the search for 30 s when a cold token is slower than the timeout', async () => {
    const { directory } = await setup({ entraDelayMs: 120, timeoutMs: 40 });
    expect(await directory.search('Nováková', live())).toEqual({
      ok: false,
      code: 'directory.timeout',
    });
    // The token request went on and landed after the search gave up.
    await new Promise((r) => setTimeout(r, 400));
    expect(codeOf(await directory.search('Nováková', live()))).toBe('ok');
  });

  it('refuses to search inside a database transaction, before any request', async () => {
    const { idp, requests, directory } = await setup();
    await expect(inTransactionScope(() => directory.search('Nováková', live()))).rejects.toThrow(
      /inside a database transaction/,
    );
    expect(idp.seen.tokenRequests).toHaveLength(0);
    expect(requests).toEqual([]);
  });
});

describe('createDirectory', () => {
  const dev = { kind: 'dev', path: '/srv/dev/directory.json' } as const;
  const deps = (graphTokens: () => AppTokenSource) => ({
    readFile: () => '[]',
    graphBaseUrl: GRAPH_BASE,
    graphTokens,
  });
  const forbidden = () => {
    throw new Error('no token source wanted');
  };

  it('builds the token source only for graph', async () => {
    let built = 0;
    const tokens: AppTokenSource = { token: () => Promise.resolve('t'), invalidate: () => {} };
    const graphTokens = () => {
      built++;
      return tokens;
    };
    createDirectory({ kind: 'off' }, deps(graphTokens));
    createDirectory(dev, deps(graphTokens));
    expect(built).toBe(0);
    const directory = createDirectory({ kind: 'graph' }, deps(graphTokens));
    expect(built).toBe(1);
    // A short query is answered by the Graph adapter itself, without a call or a token.
    expect(await directory.search('ab', live())).toEqual({ ok: true, value: [] });
  });

  it('keeps off and dev free of Graph', async () => {
    expect(await createDirectory({ kind: 'off' }, deps(forbidden)).search('Novák', live())).toEqual(
      { ok: false, code: 'directory.off' },
    );
    expect(await createDirectory(dev, deps(forbidden)).search('Novák', live())).toEqual({
      ok: true,
      value: [],
    });
  });
});
