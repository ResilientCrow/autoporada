/**
 * The sign-in routes end to end, without a browser or a network: the real
 * pipeline (runRoute), the real use cases in the current world, the real
 * openid-client against the in-process TestIdp, and a cookie jar. After
 * every test (plan §11): no Entra call ran inside a transaction, and no log
 * line holds a cookie, state, nonce, code, token or who signed in.
 */
import { afterEach, beforeEach, expect, vi } from 'vitest';

import { DatabaseFailure, type AppDeps } from '@/application/ports';
import { USE_CASES } from '@/application/use-cases';
import { createIdentityProvider } from '@/infra/oidc';
import { authRouteSpecs } from '@/server/auth';
import { runRoute, type RouteDeps, type RouteSpec } from '@/server/pipeline';
import { createRateLimiter, LIMITS } from '@/server/rate-limit';
import { principalResolver, type AuthDeps } from '@/server/session';

import { recordingLog, type LogLine } from '../log';
import { setupWorld, type World } from '../world';
import { createTestIdp, TEST_CLIENT, TEST_ISSUER, TEST_SECRET, type TestIdp } from './test-idp';

export const APP_ORIGIN = 'https://autoporada.ssps.cz';
const SIGN_IN_CLEARED = '__Host-ap_signin=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0';

/** A callback that ended on the sign-in page with `error`, its sign-in cookie cleared. */
export function expectSignInFailed(response: Response, error: string, withCode = false): void {
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe(
    `${APP_ORIGIN}/prihlaseni?chyba=${error}${withCode ? '&kod=req-test-0001' : ''}`,
  );
  expect(response.headers.getSetCookie()).toEqual([SIGN_IN_CLEARED]);
}
const TENANT = '00000000-0000-0000-0000-000000000001';

interface Browser {
  readonly cookies: Map<string, string>;
  /** Sends a request through a route, keeping what Set-Cookie says. */
  send(
    spec: RouteSpec,
    path: string,
    init?: { readonly method?: string; readonly body?: string; readonly origin?: string },
  ): Promise<Response>;
}

export interface SignInHarness {
  readonly world: World;
  readonly idp: TestIdp;
  readonly auth: AuthDeps;
  readonly routes: ReturnType<typeof authRouteSpecs>;
  readonly lines: LogLine[];
  /** Every cookie value and secret query parameter the browsers saw. */
  readonly secrets: Set<string>;
  browser(): Browser;
  /** Moves the world's clock and the libraries' Date together. */
  advance(ms: number): void;
  /** The routes' n-th next transaction fails, by default as a lost connection would (both worlds). */
  failTransaction(n?: number, error?: Error): void;
  /** Transactions the routes opened so far. */
  transactions(): number;
}

/** Query parameters that carry a secret, in either direction. */
const SECRET_PARAMS = ['code', 'state', 'nonce', 'code_challenge', 'session_state'];

function applySetCookie(cookies: Map<string, string>, header: string): void {
  const [pair = ''] = header.split(';');
  const [name = '', ...value] = pair.split('=');
  if (/Max-Age=0/i.test(header)) cookies.delete(name);
  else cookies.set(name, value.join('='));
}

/** Call at the top of a test file; every test gets a fresh world, IdP and log. */
export function setupSignInHarness(options: { readonly bootstrapHeadmasterOid?: string } = {}) {
  const world = setupWorld();
  const harness = {} as { current: SignInHarness };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(world.clock.now());
    const idp = await createTestIdp();
    const { lines, log } = recordingLog();
    const auth: AuthDeps = {
      idp: createIdentityProvider({
        issuer: TEST_ISSUER,
        clientId: TEST_CLIENT,
        appOrigin: APP_ORIGIN,
        credential: { kind: 'secret', secret: TEST_SECRET },
        domainHint: 'ssps.cz',
        production: true,
        fetch: idp.fetch,
        timeoutSeconds: 1,
      }),
      clock: world.clock,
      appOrigin: APP_ORIGIN,
      log,
      expect: { issuer: TEST_ISSUER, clientId: TEST_CLIENT, tenantId: TENANT },
      bootstrapHeadmasterOid: options.bootstrapHeadmasterOid ?? null,
    };
    let failIn = 0;
    let failure: Error = new DatabaseFailure('08000');
    let opened = 0;
    const app: AppDeps = {
      ...world.deps,
      db: {
        transaction: (ctx, options, work) => {
          opened++;
          return failIn > 0 && --failIn === 0
            ? Promise.reject(failure)
            : world.deps.db.transaction(ctx, options, work);
        },
      },
    };
    const secrets = new Set<string>();
    const remember = (url: URL) => {
      for (const key of SECRET_PARAMS) {
        for (const value of url.searchParams.getAll(key)) secrets.add(value);
      }
    };
    const routeDeps: RouteDeps = {
      app,
      useCases: new Set(USE_CASES),
      resolvePrincipal: principalResolver(app),
      limiter: createRateLimiter({ limits: LIMITS, now: () => world.clock.now().getTime() }),
      log,
      appOrigin: APP_ORIGIN,
      requestIdFrom: () => 'req-test-0001',
    };
    harness.current = {
      world,
      idp,
      auth,
      routes: authRouteSpecs(() => auth),
      lines,
      advance(ms) {
        world.clock.advance(ms);
        vi.setSystemTime(world.clock.now());
      },
      failTransaction(n = 1, error = new DatabaseFailure('08000')) {
        failIn = n;
        failure = error;
      },
      transactions: () => opened,
      secrets,
      browser() {
        const cookies = new Map<string, string>();
        return {
          cookies,
          async send(spec, path, init = {}) {
            const headers = new Headers({ 'x-forwarded-for': '203.0.113.7' });
            if (cookies.size > 0) {
              headers.set('cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; '));
            }
            if (init.method && init.method !== 'GET')
              headers.set('origin', init.origin ?? APP_ORIGIN);
            if (init.body !== undefined)
              headers.set('content-type', 'application/x-www-form-urlencoded');
            for (const value of cookies.values()) secrets.add(value);
            remember(new URL(path, APP_ORIGIN));
            const request = new Request(new URL(path, APP_ORIGIN), {
              method: init.method ?? 'GET',
              headers,
              ...(init.body !== undefined && { body: init.body }),
            });
            const response = await runRoute(routeDeps, spec, request, {
              params: Promise.resolve({}),
            });
            for (const header of response.headers.getSetCookie()) applySetCookie(cookies, header);
            for (const value of cookies.values()) secrets.add(value);
            const location = response.headers.get('location');
            if (location) remember(new URL(location, APP_ORIGIN));
            return response;
          },
        };
      },
    };
  });
  afterEach(() => {
    try {
      const { idp, lines, secrets } = harness.current;
      expect(idp.seen.calledInsideTransaction).toBe(0);
      const logged = JSON.stringify(lines);
      for (const secret of [...secrets, ...idp.seen.identities, 'eyJ', '#EXT#']) {
        if (secret) expect(logged, 'a log line leaks a secret').not.toContain(secret);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  return {
    get h(): SignInHarness {
      return harness.current;
    },
  };
}
