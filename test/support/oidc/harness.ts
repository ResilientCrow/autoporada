/**
 * The sign-in routes end to end, without a browser or a network: the real
 * pipeline (runRoute), the real use cases in the current world, the real
 * openid-client against the in-process TestIdp, and a cookie jar.
 */
import { afterEach, beforeEach, vi } from 'vitest';

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
  browser(): Browser;
  /** Moves the world's clock and the libraries' Date together. */
  advance(ms: number): void;
}

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
    const routeDeps: RouteDeps = {
      app: world.deps,
      useCases: new Set(USE_CASES),
      resolvePrincipal: principalResolver(world.deps),
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
            const request = new Request(new URL(path, APP_ORIGIN), {
              method: init.method ?? 'GET',
              headers,
              ...(init.body !== undefined && { body: init.body }),
            });
            const response = await runRoute(routeDeps, spec, request, {
              params: Promise.resolve({}),
            });
            for (const header of response.headers.getSetCookie()) applySetCookie(cookies, header);
            return response;
          },
        };
      },
    };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  return {
    get h(): SignInHarness {
      return harness.current;
    },
  };
}
