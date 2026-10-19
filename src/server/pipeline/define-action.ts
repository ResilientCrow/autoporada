import { cookies, headers } from 'next/headers';

import type { UseCase } from '@/application/core';
import type { ServerAction } from '@/contracts';

import { getContainer } from '../container';
import { markWrapped } from './brand';
import { SESSION_COOKIE } from './request';
import { runAction, type ActionOptions } from './run-action';

/**
 * The only way to make a server action (ADR 0011). Export the result from
 * a "use server" module in src/server/actions; never freeze or alias it,
 * since React registers the function itself.
 */
export function defineAction<In, Out>(
  useCase: UseCase<In, Out>,
  options: ActionOptions,
): ServerAction<In, Out> {
  if (useCase.principal !== 'user') {
    throw new Error(`${useCase.name}: an action runs as the signed-in user`);
  }
  const action = async (input: In) => {
    const container = getContainer();
    const [jar, head] = await Promise.all([cookies(), headers()]);
    const sessionCookies = jar.getAll(SESSION_COOKIE);
    const request = {
      // A cookie sent twice counts as none (see cookieValue).
      sessionToken: sessionCookies.length === 1 ? (sessionCookies[0]?.value ?? null) : null,
      requestId: container.requestIdFrom(head.get('x-request-id')),
    };
    return runAction(container, request, useCase, options, input);
  };
  markWrapped(action, { kind: 'action', useCase, rateLimit: options.rateLimit });
  return action;
}
