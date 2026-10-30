import { refresh } from 'next/cache';
import { headers } from 'next/headers';

import type { UseCase } from '@/application/core';
import type { ServerAction } from '@/contracts';

import { getContainer } from '../container';
import { markWrapped } from './brand';
import { runAction, sessionTokenFrom, type ActionOptions } from '../pipeline';

/**
 * The only way to make a server action (ADR 0011). Export the result from
 * a "use server" module in src/server/actions; never freeze or alias it,
 * since React registers the function itself.
 *
 * After a write that succeeded, the page re-renders in the same response
 * (`refresh`, ADR 0013): the client never refreshes or redirects itself. A
 * failure does not refresh, or it would reset the form showing the problem.
 * The exception is an autosaving editor (ADR 0017): its actions pass
 * `refresh: 'none'`, since a refresh would remount the editor under the
 * author's hands, and that client calls `router.replace` after `points.create`
 * and `router.refresh` for „Načíst aktuální stav“. The inventory test pins
 * which actions may. The decision bar (ADR 0025) refreshes as usual, then
 * calls `router.push` after „Schválit a pokračovat“ to the next point
 * `points.decide` names, which only the action's answer knows. „Napsat zprávu“
 * (ADR 0027) refreshes as usual, then pushes to the draft `future.startReport`
 * names, likewise known only from the answer.
 */
export function defineAction<In, Out>(
  useCase: UseCase<In, Out>,
  options: ActionOptions,
): ServerAction<In, Out> {
  if (useCase.principal !== 'user') {
    throw new Error(`${useCase.name}: an action runs as the signed-in user`);
  }
  const refreshAfterWrite = (options.refresh ?? 'page') === 'page';
  const action = async (input: In) => {
    const container = getContainer();
    const head = await headers();
    const request = {
      sessionToken: sessionTokenFrom(head.get('cookie')),
      requestId: container.requestIdFrom(head.get('x-request-id')),
    };
    const result = await runAction(container, request, useCase, options, input);
    if (refreshAfterWrite && useCase.mode === 'write' && result.ok) refresh();
    return result;
  };
  markWrapped(action, {
    kind: 'action',
    useCase,
    rateLimit: options.rateLimit,
    refresh: refreshAfterWrite ? 'page' : 'none',
  });
  return action;
}
