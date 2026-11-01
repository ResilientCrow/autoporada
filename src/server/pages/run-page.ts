import { classifyFailure, type Call, type UseCase } from '@/application/core';

import { getContainer } from '../container';
import { errorSummary } from '../log';
import { runRegistered } from '../pipeline';
import { PageFailure } from './page-failure';

/**
 * Runs `work`; an exception becomes a `PageFailure` of its classified cause, logged once with the
 * request id (ADR 0044). The log keeps the error's code and the page the cause, so a page says
 * what broke instead of Next's anonymous digest. A page failure passes through, already logged.
 */
export async function guardPage<T>(name: string, requestId: string, work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof PageFailure) throw error;
    const cause = classifyFailure(error);
    getContainer().log.error(
      { kind: 'page', name, reqId: requestId, cause, err: errorSummary(error) },
      'page failed',
    );
    throw new PageFailure(cause, `${name}: ${cause}`);
  }
}

/** A page's use case call: the registered pipeline, with an exception turned into a `PageFailure`. */
export function runPage<In, Out>(useCase: UseCase<In, Out>, call: Call) {
  return guardPage(useCase.name, call.requestId, () =>
    runRegistered(getContainer(), useCase, call),
  );
}
