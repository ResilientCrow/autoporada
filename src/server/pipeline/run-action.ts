import { runUseCase, type AnyUseCase, type Call, type UseCase } from '@/application/core';
import type { AppDeps, UserPrincipal } from '@/application/ports';
import type { ActionResult } from '@/contracts';

import type { LIMITS, LimitName, RateLimiter } from '../rate-limit';
import { errorSummary, type Log } from './log';
import { logCall, toActionResult, type CallLine } from './outcome';

export interface ActionDeps {
  readonly app: AppDeps;
  /** USE_CASES: nothing else runs, however it was built or imported (ADR 0011). */
  readonly useCases: ReadonlySet<AnyUseCase>;
  readonly resolvePrincipal: (
    token: string | null,
    requestId: string,
  ) => Promise<UserPrincipal | null>;
  readonly limiter: RateLimiter;
  readonly log: Log;
}

export interface RequestFacts {
  readonly sessionToken: string | null;
  readonly requestId: string;
}

/** Limits keyed by user: an action always has one. */
type UserLimitName = {
  [K in LimitName]: (typeof LIMITS)[K]['key'] extends 'user' ? K : never;
}[LimitName];

export interface ActionOptions {
  /** Required: no limit is a written-down decision too. */
  readonly rateLimit: UserLimitName | 'none';
}

/** Runs a registered use case; an unlisted one is a bug in the code, never a request. */
export function runRegistered<In, Out>(deps: ActionDeps, useCase: UseCase<In, Out>, call: Call) {
  if (!deps.useCases.has(useCase)) throw new Error(`${useCase.name}: not in USE_CASES`);
  return runUseCase(useCase, call, deps.app);
}

/**
 * A server action (ADR 0011): session (1), rate limit (1a), then the use
 * case's pipeline. A bug or an outage reaches the client as `unavailable`
 * with the request id, and the log gets the error without any input.
 */
export async function runAction<In, Out>(
  deps: ActionDeps,
  request: RequestFacts,
  useCase: UseCase<In, Out>,
  options: ActionOptions,
  input: unknown,
): Promise<ActionResult<Out>> {
  const started = performance.now();
  const line: CallLine = {
    kind: 'action',
    name: useCase.name,
    reqId: request.requestId,
    outcome: 'unavailable',
  };
  const answer = (result: ActionResult<Out>): ActionResult<Out> => {
    line.outcome = result.ok ? 'ok' : result.error.code;
    return result;
  };
  try {
    const principal = await deps.resolvePrincipal(request.sessionToken, request.requestId);
    if (!principal) return answer({ ok: false, error: { code: 'unauthenticated' } });
    line.actorId = principal.actor.id;
    if (options.rateLimit !== 'none') {
      const decision = deps.limiter.take(options.rateLimit, principal.actor.id);
      if (!decision.ok) {
        const retryAfterSeconds = Math.ceil(decision.retryAfterMs / 1000);
        return answer({ ok: false, error: { code: 'rate-limited', retryAfterSeconds } });
      }
    }
    const call = { principal, requestId: request.requestId, input };
    return answer(toActionResult(await runRegistered(deps, useCase, call)));
  } catch (error) {
    deps.log.error({ ...line, err: errorSummary(error) }, 'action failed');
    return { ok: false, error: { code: 'unavailable', requestId: request.requestId } };
  } finally {
    logCall(deps.log, line, performance.now() - started);
  }
}
