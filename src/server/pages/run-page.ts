import { classifyFailure, type Call, type UseCase } from '@/application/core';
import type { FailureCause } from '@/contracts';

import { getContainer } from '../container';
import { errorSummary } from '../log';
import { runRegistered } from '../pipeline';
import { isRefusal } from './not-found';
import { causeOfFault, PageFailure } from './page-failure';

/**
 * Runs `work`; an exception becomes a `PageFailure` of its classified cause, logged once with the
 * request id (ADR 0044). The log keeps the error's code and the page the cause, so a page says
 * what broke instead of Next's anonymous digest. A page failure passes through, already logged.
 * A use case that answers a fault (not a refusal) is logged by `runPage`, which has the request
 * id, before `orNotFound` or `pageFailureOf` turns it into a `PageFailure`.
 */
export async function guardPage<T>(name: string, requestId: string, work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof PageFailure) throw error;
    const cause = classifyFailure(error);
    logPageFailure(name, requestId, cause, errorSummary(error));
    throw new PageFailure(cause, `${name}: ${cause}`);
  }
}

/** Logs a page failure once, with the request id (ADR 0044); the error's text stays out. */
export function logPageFailure(name: string, requestId: string, cause: FailureCause, err: object) {
  getContainer().log.error({ kind: 'page', name, reqId: requestId, cause, err }, 'page failed');
}

/**
 * A page's use case call: the registered pipeline, with an exception turned into a `PageFailure`.
 * A fault answer is logged here, since the page throws it as a failure without the request id.
 */
export async function runPage<In, Out>(useCase: UseCase<In, Out>, call: Call) {
  const result = await guardPage(useCase.name, call.requestId, () =>
    runRegistered(getContainer(), useCase, call),
  );
  if (!result.ok && !isRefusal(result.error.code)) {
    logPageFailure(useCase.name, call.requestId, causeOfFault(result.error.code), {
      name: 'PipelineFailure',
      code: result.error.code,
    });
  }
  return result;
}
