import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { defineUseCase, ok } from '@/application/core';
import { DatabaseFailure, system, type UserPrincipal } from '@/application/ports';

import { recordingLog } from '../../../test/support/log';
import { setupWorld } from '../../../test/support/world';
import { createRateLimiter, LIMITS } from '../rate-limit';
import { runRoute, technicalDetail, type RouteDeps, type RouteSpec } from './index';

const world = setupWorld();
const ORIGIN = 'https://autoporada.ssps.cz';
const REQUEST_ID = 'abcdef12-3456';

/** A use case that counts the users its principal can see. */
const counter = (name: `${string}.${string}`) =>
  defineUseCase({
    name,
    mode: 'read',
    input: z.strictObject({}),
    output: z.object({ count: z.number() }),
    access: { kind: 'gate', check: () => ({ action: 'review.queue' }) },
    execute: async ({ tx }) => ok({ count: (await tx.users.list()).length }),
  });
const count = counter('test.count');

function deps(principal: UserPrincipal | null = null) {
  const { lines, log } = recordingLog();
  const routeDeps: RouteDeps = {
    app: world.deps,
    useCases: new Set([count]),
    resolvePrincipal: async (token) => (token === 'good' ? principal : null),
    limiter: createRateLimiter({
      limits: { ...LIMITS, auth: { ...LIMITS.auth, max: 1 } },
      now: () => 0,
    }),
    log,
    appOrigin: ORIGIN,
    requestIdFrom: (header) => header ?? 'generated',
  };
  return { routeDeps, lines };
}

const route = (over: Partial<RouteSpec> = {}): RouteSpec => ({
  name: 'test.route',
  access: 'session',
  rateLimit: 'none',
  handle: async () => new Response('hello', { status: 200 }),
  ...over,
});

interface Init {
  readonly method?: string;
  readonly origin?: string;
  readonly cookie?: string;
  readonly ip?: string;
}

function request(path: string, init: Init = {}): Request {
  const headers = new Headers({ 'x-request-id': REQUEST_ID });
  if (init.origin) headers.set('origin', init.origin);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.ip) headers.set('x-forwarded-for', init.ip);
  return new Request(`${ORIGIN}${path}`, { method: init.method ?? 'GET', headers });
}
const segment = { params: Promise.resolve({}) };
const SESSION = '__Host-ap_session=good';

describe('runRoute', () => {
  it('refuses unsafe methods from another origin before anything else', async () => {
    const handle = vi.fn(async () => new Response('x'));
    const response = await runRoute(
      deps().routeDeps,
      route({ access: 'public', handle }),
      request('/x', { method: 'POST', origin: 'https://evil.example' }),
      segment,
    );
    expect(response.status).toBe(403);
    expect(handle).not.toHaveBeenCalled();
  });

  it('sends a GET without a session to sign in, and refuses other methods', async () => {
    const { routeDeps } = deps();
    const get = await runRoute(routeDeps, route(), request('/porada/2026-10-19?tab=body'), segment);
    expect(get.status).toBe(303);
    expect(get.headers.get('location')).toBe(
      `${ORIGIN}/prihlaseni?returnTo=%2Fporada%2F2026-10-19%3Ftab%3Dbody`,
    );
    const post = request('/x', { method: 'POST', origin: ORIGIN });
    expect((await runRoute(routeDeps, route(), post, segment)).status).toBe(401);
  });

  it('answers no-store with the request id, whatever the handler set', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const response = await runRoute(
      deps(world.as(user)).routeDeps,
      route(),
      request('/x', { cookie: SESSION }),
      segment,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hello');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBe(REQUEST_ID);
  });

  it('answers 500 with an empty body when the handler throws', async () => {
    const { routeDeps, lines } = deps();
    const failing = route({
      access: 'public',
      handle: () => Promise.reject(new Error('boom')),
    });
    const response = await runRoute(routeDeps, failing, request('/x'), segment);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('');
    expect(response.headers.get('x-request-id')).toBe(REQUEST_ID);
    expect(lines.find((l) => l.level === 'error')?.fields).toMatchObject({
      err: { message: 'boom' },
    });
  });

  it('answers the route’s own failure with the cause when anything throws, the session lookup too', async () => {
    const { routeDeps: base, lines } = deps();
    const routeDeps = {
      ...base,
      resolvePrincipal: () => Promise.reject(new DatabaseFailure('08006')),
    };
    const failing = route({
      access: 'public',
      failure: ({ cause, requestId }) =>
        new Response(null, { status: 303, headers: { Location: `${cause} ${requestId}` } }),
    });
    const response = await runRoute(routeDeps, failing, request('/x'), segment);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`database-down ${REQUEST_ID}`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(lines.find((l) => l.level === 'error')?.fields).toMatchObject({
      reqId: REQUEST_ID,
      cause: 'database-down',
      err: { sqlstate: '08006' },
    });
  });

  it('hands the failure callback the technical line only when a describer is bound', async () => {
    const { routeDeps: base } = deps();
    const failing = route({
      access: 'public',
      handle: () => Promise.reject(new Error('boom')),
      failure: ({ detail }) => new Response(detail ?? 'none', { status: 500 }),
    });
    const quiet = await runRoute(base, failing, request('/x'), segment);
    expect(await quiet.text()).toBe('none');
    const loud = await runRoute(
      { ...base, describe: technicalDetail('development', undefined) },
      failing,
      request('/x'),
      segment,
    );
    expect(await loud.text()).toBe('Error: boom');
  });

  it('treats a session cookie sent twice as none', async () => {
    const { routeDeps } = deps({ kind: 'user' } as UserPrincipal);
    const resolve = vi.spyOn(routeDeps, 'resolvePrincipal');
    const twice = request('/x', { cookie: '__Host-ap_session=good; __Host-ap_session=good' });
    const response = await runRoute(routeDeps, route(), twice, segment);
    expect(resolve).toHaveBeenCalledWith(null, REQUEST_ID);
    expect(response.status).toBe(303);
  });

  it('limits public routes by client address, before the session lookup', async () => {
    const { routeDeps } = deps();
    const resolve = vi.spyOn(routeDeps, 'resolvePrincipal');
    const auth = route({ access: 'public', rateLimit: 'auth' });
    const from = (ip: string) => runRoute(routeDeps, auth, request('/auth/login', { ip }), segment);
    expect((await from('203.0.113.7')).status).toBe(200);
    const limited = await from('203.0.113.7');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(resolve).toHaveBeenCalledTimes(1);
    expect((await from('198.51.100.1')).status).toBe(200);
  });

  it('answers a limited request with the route’s own response when it has one', async () => {
    const { routeDeps } = deps();
    const spec = route({
      access: 'public',
      rateLimit: 'auth',
      rateLimited: (retryAfterSeconds) =>
        new Response(null, { status: 303, headers: { Location: `/x?wait=${retryAfterSeconds}` } }),
    });
    const from = () => runRoute(routeDeps, spec, request('/x', { ip: '203.0.113.7' }), segment);
    await from();
    const limited = await from();
    expect(limited.status).toBe(303);
    expect(limited.headers.get('location')).toBe('/x?wait=60');
    expect(limited.headers.get('cache-control')).toBe('no-store');
    expect(limited.headers.get('x-request-id')).toBe(REQUEST_ID);
  });

  it('runs use cases as the session user, as a named system principal, or not at all', async () => {
    const user = await world.seed.user({ role: 'reviewer' });
    const seen: unknown[] = [];
    const handle: RouteSpec['handle'] = async (_request, ctx) => {
      seen.push(await ctx.run(count, {}));
      return new Response(null, { status: 204 });
    };
    await runRoute(
      deps(world.as(user)).routeDeps,
      route({ handle }),
      request('/x', { cookie: SESSION }),
      segment,
    );
    await runRoute(deps().routeDeps, route({ access: 'public', handle }), request('/x'), segment);
    expect(seen).toEqual([
      { ok: true, data: { count: 1 } },
      { ok: false, error: { code: 'unauthenticated' } },
    ]);
    // A system principal must be named explicitly; a gate use case still refuses it.
    const asSystem: RouteSpec['handle'] = async (_request, ctx) => {
      await ctx.run(count, {}, system('auth.callback'));
      return new Response(null, { status: 204 });
    };
    const refused = await runRoute(
      deps().routeDeps,
      route({ access: 'public', handle: asSystem }),
      request('/x'),
      segment,
    );
    expect(refused.status).toBe(500);
  });

  it('refuses to run a use case that is not registered, however it was obtained', async () => {
    const user = await world.seed.user({ role: 'reviewer' });
    const unlisted = counter('test.unlisted');
    const handle: RouteSpec['handle'] = async (_request, ctx) => {
      await ctx.run(unlisted, {});
      return new Response(null, { status: 204 });
    };
    const { routeDeps, lines } = deps(world.as(user));
    const response = await runRoute(
      routeDeps,
      route({ handle }),
      request('/x', { cookie: SESSION }),
      segment,
    );
    expect(response.status).toBe(500);
    expect(lines.find((l) => l.level === 'error')?.fields).toMatchObject({
      err: { message: 'test.unlisted: not in USE_CASES' },
    });
  });
});
