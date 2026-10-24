import type { z } from 'zod';

import { defineUseCase, fail, fromTransition, ok } from '@/application/core';
import { decideAccessInput, decideAccessOutput } from '@/contracts';
import { ACCESS_MACHINE, transition } from '@/domain/review';

import { userAccessEvent } from '../users/events';
import { accessRequestEvent } from './events';
import { machineActor, type DecisionEvent } from './machine';

type Decision = z.output<typeof decideAccessInput>['decision'];

const EVENTS: Readonly<Record<Decision, DecisionEvent>> = {
  'approve-staff': 'approve',
  'approve-student': 'approve',
  reject: 'reject',
  block: 'block',
};
const STATES = { approve: 'approved', reject: 'rejected', block: 'blocked' } as const;

/**
 * The headmaster decides a request (plan §4: no step-up). Approval names
 * the audience, makes the requester a submitter in the same transaction and
 * so ends their sessions (users_end_sessions). Only the user's newest
 * request can be decided. Lock order: the request (load), then the user;
 * access.request takes the user first and never waits on the request.
 */
export const decideAccess = defineUseCase({
  name: 'access.decide',
  mode: 'write',
  input: decideAccessInput,
  output: decideAccessOutput,
  access: {
    kind: 'resource',
    load: (tx, input) => tx.accessRequests.lock(input.requestId),
    expectedVersion: (input) => input.version,
    check: () => ({ action: 'access.decide' }),
  },
  async execute({ tx, actor }, input, request) {
    if (input.decision === 'block' && !input.confirmed) {
      return fail({ code: 'invalid-input', fields: { confirmed: 'required' } });
    }
    const user = await tx.users.lock(request.userId);
    if (!user) return fail({ code: 'not-found' });
    const [newest] = await tx.accessRequests.forUser(request.userId);
    if (newest?.id !== request.id) return fail({ code: 'conflict' });

    const event = EVENTS[input.decision];
    const step = transition(ACCESS_MACHINE, request.state, event, machineActor(actor, request));
    if (!step.ok) return fromTransition(step);
    if (event === 'approve' && user.role !== 'pending') return fail({ code: 'conflict' });

    const state = STATES[event];
    const after = await tx.accessRequests.transition(request.id, input.version, state);
    await tx.audit.record(accessRequestEvent(`access.${event}`, request, after));
    if (event === 'approve') {
      const changed = await tx.users.changeAccess(user.id, user.version, {
        role: 'submitter',
        isStudent: input.decision === 'approve-student',
      });
      await tx.audit.record(userAccessEvent(user, changed, { via: 'access.approve' }));
    }
    return ok({ state });
  },
});
