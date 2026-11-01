import { classifyFailure, type UseCase } from '@/application/core';
import type { SystemPrincipal, UserPrincipal } from '@/application/ports';
import type { ActionResult, FailureCause } from '@/contracts';
import { safeReturnTo } from '@/domain/identity';

import { clientIp, LIMITS, type LimitName } from '../rate-limit';
import { errorSummary } from '../log';
import { logCall, toActionResult, type CallLine } from './outcome';
import { sessionTokenFrom } from './request';
import { runRegistered, type ActionDeps } from './run-action';

export interface RouteDeps extends ActionDeps {
  readonly appOrigin: string;
  readonly requestIdFrom: (header: string | null) => string;
}

export interface RouteContext {
  readonly requestId: string;
  /** Null on public routes without a session. */
  readonly principal: UserPrincipal | null;
  readonly params: Promise<Readonly<Record<string, string | string[]>>>;
  /** Runs a use case as this request's user, or as the given system principal. */
  run<In, Out>(
    useCase: UseCase<In, Out>,
    input: unknown,
    as?: SystemPrincipal,
  ): Promise<ActionResult<Out>>;
}

export interface RouteSpec {
  readonly name: string;
  /** 'public' routes are pinned by the public-surface test. */
  readonly access: 'public' | 'session';
  readonly rateLimit: LimitName | 'none';
  handle(request: Request, ctx: RouteContext): Promise<Response>;
  /**
   * The answer when something throws (an outage, a bug); without one, an
   * empty 500. It is told the classified cause (and, in development, the
   * technical line) so a page can name what broke. Sign-in routes redirect to
   * the sign-in page and still clear their cookies.
   */
  failure?(failure: RouteFailure): Response;
}

/** What a route's `failure` hears of an exception (ADR 0044). */
export interface RouteFailure {
  readonly cause: FailureCause;
  /** Development's technical line; never set in production. */
  readonly detail?: string;
  readonly requestId: string;
}

export interface Segment {
  readonly params: Promise<Readonly<Record<string, string | string[]>>>;
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);
const LOGIN_PAGE = '/prihlaseni';

function finish(response: Response, requestId: string): Response {
  const out = new Response(response.body, response);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('X-Request-Id', requestId);
  return out;
}

const status = (code: number, headers: HeadersInit = {}) =>
  new Response(null, { status: code, headers });

/**
 * A route handler (ADR 0011): Origin check for unsafe methods, rate limit
 * (by client address before the session lookup, or by user after it),
 * session, then the handler. Every answer is `no-store` and names the
 * request id; an exception is logged with its cause and answers the route's
 * `failure`.
 */
export async function runRoute(
  deps: RouteDeps,
  spec: RouteSpec,
  request: Request,
  segment: Segment,
): Promise<Response> {
  const started = performance.now();
  const requestId = deps.requestIdFrom(request.headers.get('x-request-id'));
  const line: CallLine = { kind: 'route', name: spec.name, reqId: requestId, outcome: 'ok' };
  const refuse = (outcome: string, response: Response) => {
    line.outcome = outcome;
    return finish(response, requestId);
  };
  try {
    if (!SAFE_METHODS.has(request.method) && request.headers.get('origin') !== deps.appOrigin) {
      return refuse('forbidden', status(403));
    }
    const limit =
      spec.rateLimit === 'none' ? undefined : { name: spec.rateLimit, ...LIMITS[spec.rateLimit] };
    const limited = (key: string) => {
      const decision = limit ? deps.limiter.take(limit.name, key) : { ok: true as const };
      return decision.ok
        ? undefined
        : refuse(
            'rate-limited',
            status(429, { 'Retry-After': String(Math.ceil(decision.retryAfterMs / 1000)) }),
          );
    };
    if (limit?.key === 'ip') {
      const refused = limited(clientIp(request.headers.get('x-forwarded-for')));
      if (refused) return refused;
    }
    const token = sessionTokenFrom(request.headers.get('cookie'));
    const principal = await deps.resolvePrincipal(token, requestId);
    if (principal) line.actorId = principal.actor.id;
    if (spec.access === 'session' && !principal) {
      if (!SAFE_METHODS.has(request.method)) return refuse('unauthenticated', status(401));
      const login = new URL(LOGIN_PAGE, deps.appOrigin);
      const url = new URL(request.url);
      login.searchParams.set('returnTo', safeReturnTo(`${url.pathname}${url.search}`));
      return refuse('unauthenticated', status(303, { Location: login.toString() }));
    }
    if (limit?.key === 'user' && principal) {
      const refused = limited(principal.actor.id);
      if (refused) return refused;
    }
    const ctx: RouteContext = {
      requestId,
      principal,
      params: segment.params,
      async run(useCase, input, as) {
        const runAs = as ?? principal;
        if (!runAs) return { ok: false, error: { code: 'unauthenticated' } };
        return toActionResult(
          await runRegistered(deps, useCase, { principal: runAs, requestId, input }),
        );
      },
    };
    const response = await spec.handle(request, ctx);
    line.outcome = String(response.status);
    return finish(response, requestId);
  } catch (error) {
    line.outcome = 'unavailable';
    const cause = classifyFailure(error);
    deps.log.error({ ...line, cause, err: errorSummary(error) }, 'route failed');
    const detail = deps.describe?.(error, cause);
    const failure: RouteFailure = { cause, ...(detail && { detail }), requestId };
    return finish(spec.failure?.(failure) ?? status(500), requestId);
  } finally {
    logCall(deps.log, line, performance.now() - started);
  }
}
