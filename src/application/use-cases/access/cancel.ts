import { defineUseCase, fromTransition, ok } from '@/application/core';
import { cancelAccessInput, cancelAccessOutput } from '@/contracts';
import { ACCESS_MACHINE, transition } from '@/domain/review';

import { accessRequestEvent } from './events';

/**
 * „Zrušit žádost“: the requester takes back a request nobody has decided
 * yet. Another person's request reads as not-found (scope); a decided one
 * is a conflict. Cancelling never starts a cooldown.
 */
export const cancelAccess = defineUseCase({
  name: 'access.cancel',
  mode: 'write',
  input: cancelAccessInput,
  output: cancelAccessOutput,
  access: {
    kind: 'resource',
    load: (tx, input) => tx.accessRequests.lock(input.requestId),
    expectedVersion: (input) => input.version,
    check: () => ({ action: 'access.request' }),
  },
  async execute({ tx, actor }, input, request) {
    const step = transition(ACCESS_MACHINE, request.state, 'cancel', {
      kind: 'user',
      role: actor.role,
      isAuthor: request.userId === actor.id,
    });
    if (!step.ok) return fromTransition(step);
    const after = await tx.accessRequests.transition(request.id, input.version, 'cancelled');
    await tx.audit.record(accessRequestEvent('access.cancel', request, after));
    return ok({});
  },
});
