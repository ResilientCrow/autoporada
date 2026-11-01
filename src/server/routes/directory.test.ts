import { describe, expect, it, vi } from 'vitest';

import {
  DatabaseFailure,
  LockTimeout,
  type DirectoryCode,
  type DirectoryPerson,
  type DirectoryPort,
  type DirectoryResult,
  type UserPrincipal,
} from '@/application/ports';
import { searchGate } from '@/application/use-cases';
import { directorySearchResponse } from '@/contracts';

import { recordingLog } from '../../../test/support/log';
import { setupWorld } from '../../../test/support/world';
import { runRoute, type RouteDeps } from '../pipeline';
import { createRateLimiter, LIMITS } from '../rate-limit';
import { directoryRouteSpec } from './directory';

const world = setupWorld();
const ORIGIN = 'https://autoporada.ssps.cz';
const SESSION = '__Host-ap_session=good';
const QUERY = 'Nováková';

const hit: DirectoryPerson = {
  graphId: '1b9f3a52-3c1e-4c9b-9d1a-6f4f1c2a7e10',
  givenName: 'Jana',
  familyName: 'Nováková',
  displayName: 'Jana Nováková',
};

type Answer = DirectoryResult<readonly DirectoryPerson[]>;

/** A route over the fake world, with a spy directory and a log that keeps its lines. */
function setup(
  principal: UserPrincipal | null,
  answer: Answer = { ok: true, value: [hit] },
  describer?: RouteDeps['describe'],
  app: RouteDeps['app'] = world.deps,
) {
  const { lines, log } = recordingLog();
  const search = vi.fn<DirectoryPort['search']>(() => Promise.resolve(answer));
  const deps: RouteDeps = {
    app,
    useCases: new Set([searchGate]),
    resolvePrincipal: (token) => Promise.resolve(token === 'good' ? principal : null),
    limiter: createRateLimiter({
      limits: { ...LIMITS, directory: { ...LIMITS.directory, max: 1 } },
      now: () => 0,
    }),
    log,
    appOrigin: ORIGIN,
    requestIdFrom: () => 'req-1',
    ...(describer && { describe: describer }),
  };
  const spec = directoryRouteSpec(() => ({ directory: { search }, log }));
  const post = (
    init: { body?: string; origin?: string; headers?: HeadersInit; signal?: AbortSignal } = {},
  ) => {
    const headers = new Headers(init.headers);
    headers.set('origin', init.origin ?? ORIGIN);
    headers.set('cookie', SESSION);
    const request = new Request(`${ORIGIN}/api/adresar/hledat`, {
      method: 'POST',
      headers,
      body: init.body ?? JSON.stringify({ q: QUERY }),
      signal: init.signal,
    });
    return runRoute(deps, spec, request, { params: Promise.resolve({}) });
  };
  return { post, search, lines };
}

const as = async (seed: Parameters<typeof world.seed.user>[0] = { role: 'submitter' }) =>
  world.as(await world.seed.user(seed));

describe('POST /api/adresar/hledat', () => {
  it('answers the hits of the query', async () => {
    const { post, search } = setup(await as());
    const response = await post();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ hits: [hit] });
    expect(search).toHaveBeenCalledExactlyOnceWith(QUERY, expect.any(AbortSignal));
  });

  it("hands the directory the request's signal, so a client abort cancels the search", async () => {
    const { post, search } = setup(await as());
    const controller = new AbortController();
    await post({ signal: controller.signal });
    const signal = search.mock.calls[0]![1];
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it('lets a student search', async () => {
    const { post } = setup(await as({ role: 'submitter', isStudent: true }));
    expect((await post()).status).toBe(200);
  });

  it('refuses another origin and calls nothing', async () => {
    const { post, search } = setup(await as());
    expect((await post({ origin: 'https://evil.example' })).status).toBe(403);
    expect(search).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request with 401', async () => {
    const { post, search } = setup(null);
    expect((await post()).status).toBe(401);
    expect(search).not.toHaveBeenCalled();
  });

  it('counts searches per user and says when to retry', async () => {
    const { post, search } = setup(await as());
    expect((await post()).status).toBe(200);
    const limited = await post();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(search).toHaveBeenCalledOnce();
  });

  it('allows a class of fifteen its searches', () => {
    expect(LIMITS.directory).toEqual({ max: 120, windowMs: 60_000, key: 'user' });
  });

  it.each([
    ['pending', { role: 'pending' }],
    ['deactivated', { role: 'submitter', status: 'deactivated' }],
  ] as const)('refuses a %s user before the directory', async (_, seed) => {
    const { post, search } = setup(await as(seed));
    const response = await post();
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
    expect(search).not.toHaveBeenCalled();
  });

  it.each([
    ['a declared body over 1 KiB', { headers: { 'content-length': '1025' } }, 413],
    ['a declared length that is no number', { headers: { 'content-length': 'many' } }, 413],
    ['a body over 1 KiB', { body: JSON.stringify({ q: 'ř'.repeat(520) }) }, 413],
    ['a body that is not JSON', { body: `{"q": "${QUERY}"` }, 400],
    ['a query over 64 characters', { body: JSON.stringify({ q: 'x'.repeat(65) }) }, 400],
    ['an unknown key', { body: JSON.stringify({ q: QUERY, top: 50 }) }, 400],
    ['no query', { body: '{}' }, 400],
  ] as const)('refuses %s', async (_, init, code) => {
    const { post, search } = setup(await as());
    const response = await post(init);
    expect(response.status).toBe(code);
    expect(await response.text()).toBe('');
    expect(search).not.toHaveBeenCalled();
  });

  it.each([
    ['directory.off', 'off'],
    ['directory.unavailable', 'unavailable'],
    ['directory.throttled', 'throttled'],
    ['directory.denied', 'denied'],
    ['directory.timeout', 'timeout'],
  ] as const satisfies readonly (readonly [DirectoryCode, string])[])(
    'answers %s as no hits and the %s notice',
    async (code, notice) => {
      const { post, lines } = setup(await as(), { ok: false, code });
      const response = await post();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ hits: [], notice });
      expect(lines.filter((l) => l.level === 'warn').map((l) => l.fields)).toEqual([
        { name: 'directory.search', reqId: 'req-1', code },
      ]);
    },
  );

  it('logs the fixed detail beside the code, so a 400 is told from a refused credential', async () => {
    const { post, lines } = setup(await as(), {
      ok: false,
      code: 'directory.denied',
      detail: 'token:token:AADSTS7000215',
    });
    await post();
    expect(lines.filter((l) => l.level === 'warn').map((l) => l.fields)).toEqual([
      {
        name: 'directory.search',
        reqId: 'req-1',
        code: 'directory.denied',
        detail: 'token:token:AADSTS7000215',
      },
    ]);
  });

  it('logs nothing and answers an empty body when the client has gone', async () => {
    const controller = new AbortController();
    const { post, search, lines } = setup(await as());
    search.mockImplementation(() => {
      controller.abort();
      return Promise.resolve({ ok: false, code: 'directory.timeout' });
    });
    const response = await post({ signal: controller.signal });
    expect(await response.text()).toBe('');
    expect(lines.filter((l) => l.level === 'warn')).toEqual([]);
  });

  it('still logs a timeout of the search itself while the client waits', async () => {
    const { post, lines } = setup(await as(), { ok: false, code: 'directory.timeout' });
    const response = await post({ signal: new AbortController().signal });
    expect(await response.json()).toEqual({ hits: [], notice: 'timeout' });
    expect(lines.filter((l) => l.level === 'warn')).toHaveLength(1);
  });

  it('fails with 500 when the directory answers more than a search may', async () => {
    const many = Array.from({ length: 11 }, () => hit);
    const { post } = setup(await as(), { ok: true, value: many });
    expect((await post()).status).toBe(500);
  });

  describe('when something throws', () => {
    /** A directory that throws, e.g. the gate's database is down. */
    const throwing = async (error: unknown, describer?: RouteDeps['describe']) => {
      const made = setup(await as(), undefined, describer);
      made.search.mockImplementation(() => Promise.reject(error));
      return made;
    };

    it.each([
      ['a lost database', new DatabaseFailure('08006'), 'database-down'],
      ['a statement timeout', new DatabaseFailure('57014'), 'timeout'],
      ['a lock timeout', new LockTimeout(), 'timeout'],
      ['a missing table', new DatabaseFailure('42P01'), 'database-setup'],
      ['a stored row that does not parse', new DatabaseFailure('db.parse.points'), 'stored-data'],
      ['a bug', new TypeError('x is undefined'), 'bug'],
    ])('answers 500 with the cause of %s and no hits', async (_what, error, cause) => {
      const { post } = await throwing(error);
      const response = await post();
      expect(response.status).toBe(500);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-request-id')).toBe('req-1');
      expect(await response.json()).toEqual({ hits: [], failure: cause });
    });

    it('answers a body its own contract accepts', async () => {
      const { post } = await throwing(new DatabaseFailure('08006'));
      expect(directorySearchResponse.safeParse(await (await post()).json()).success).toBe(true);
    });

    it('adds the technical line where the pipeline describes failures (development)', async () => {
      const { post } = await throwing(new DatabaseFailure('08006'), () => 'DatabaseFailure 08006');
      expect(await (await post()).json()).toEqual({
        hits: [],
        failure: 'database-down',
        detail: 'DatabaseFailure 08006',
      });
    });

    it('sends no detail at all without a describer (production)', async () => {
      const { post } = await throwing(new DatabaseFailure('08006'));
      const body = (await (await post()).json()) as Record<string, unknown>;
      expect(Object.keys(body)).toEqual(['hits', 'failure']);
    });

    it('logs the failure with its cause and never the query', async () => {
      const { post, lines } = await throwing(new DatabaseFailure('08006'));
      await post();
      const errors = lines.filter((l) => l.level === 'error');
      expect(errors).toHaveLength(1);
      expect(errors[0]?.fields).toMatchObject({ cause: 'database-down' });
      expect(JSON.stringify(lines)).not.toContain(QUERY);
    });

    it('still answers 500 with the cause when the gate itself fails', async () => {
      const down = {
        ...world.deps,
        db: { transaction: () => Promise.reject(new DatabaseFailure('08006')) },
      };
      const { post, search } = setup(await as(), undefined, undefined, down);
      const response = await post();
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ hits: [], failure: 'database-down' });
      expect(search).not.toHaveBeenCalled();
    });
  });

  it('never logs the query: hits, a failure, a bad answer or a refused body', async () => {
    const runs: readonly (readonly [Answer | undefined, string | undefined])[] = [
      [undefined, undefined],
      [{ ok: false, code: 'directory.unavailable' }, undefined],
      [{ ok: true, value: Array.from({ length: 11 }, () => hit) }, undefined],
      [undefined, JSON.stringify({ q: `${QUERY}x`.repeat(10) })],
    ];
    const statuses: number[] = [];
    const logged: unknown[] = [];
    // One route per run: the limit lets each user search once.
    for (const [answer, body] of runs) {
      const { post, lines } = setup(await as(), answer);
      statuses.push((await post({ body })).status);
      logged.push(...lines);
    }
    expect(statuses).toEqual([200, 200, 500, 400]);
    expect(logged.length).toBeGreaterThan(0);
    expect(JSON.stringify(logged)).not.toContain(QUERY);
  });
});
