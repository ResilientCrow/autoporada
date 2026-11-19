import type { z } from 'zod';

import { defineUseCase, fail, fromTransition, ok } from '@/application/core';
import { DECISION_MAIL, mailJob } from '@/application/notifications';
import { decideAccessInput, decideAccessOutput } from '@/contracts';
import { can } from '@/domain/policy';
import { ACCESS_MACHINE, transition, type DecisionEvent } from '@/domain/review';

import { userAccessEvent } from '../users/events';
import { lockedActor } from '../users/locked-actor';
import { accessRequestEvent } from './events';
import { machineActor } from './machine';

type Decision = z.output<typeof decideAccessInput>['decision'];

const EVENTS: Readonly<Record<Decision, DecisionEvent>> = {
  approve: 'approve',
  reject: 'reject',
  block: 'block',
};
const STATES: Readonly<Record<DecisionEvent, z.output<typeof decideAccessOutput>['state']>> = {
  approve: 'approved',
  reject: 'rejected',
  block: 'blocked',
};

/**
 * The headmaster decides a request (plan §4: no step-up). Approval names
 * the tier, makes the requester a submitter in the same transaction and
 * so ends their sessions (users_end_sessions). Only the user's newest
 * request can be decided. Lock order: the request (load), then the user,
 * then the headmaster's own row, so `can()` is asked again of it
 * (lockedActor); access.request takes the user first and never waits on
 * the request. Every decision queues the requester's mail (ADR 0016). An
 * approval answers the user's new version, so the page's next change of
 * their access does not conflict.
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
    const current = await lockedActor(tx, actor);
    if (!current || !can(current, { action: 'access.decide' })) return fail({ code: 'forbidden' });
    const [newest] = await tx.accessRequests.forUser(request.userId);
    if (newest?.id !== request.id) return fail({ code: 'conflict' });

    const event = EVENTS[input.decision];
    const step = transition(ACCESS_MACHINE, request.state, event, machineActor(current, request));
    if (!step.ok) return fromTransition(step);
    if (event === 'approve' && user.role !== 'pending') return fail({ code: 'conflict' });

    const state = STATES[event];
    const after = await tx.accessRequests.transition(request.id, input.version, state);
    await tx.audit.record(accessRequestEvent(`access.${event}`, request, after));
    let approved: { userId: string; version: number } | null = null;
    if (event === 'approve') {
      const changed = await tx.users.changeAccess(user.id, user.version, {
        role: 'submitter',
        // The contract makes an approval name the tier.
        ...(input.tier !== undefined && { tier: input.tier }),
      });
      await tx.audit.record(userAccessEvent(user, changed, { via: 'access.approve' }));
      approved = { userId: user.id, version: changed.version };
    }
    // The requester hears of it in the same transaction: no decision without its mail, no mail without it.
    const mail = mailJob(DECISION_MAIL[event], { recipientId: user.id, requestId: request.id });
    await tx.jobs.enqueue('mail.send', mail.data, { dedupeKey: mail.dedupeKey });
    return ok({ state, ...approved });
  },
});
