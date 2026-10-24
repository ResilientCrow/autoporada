import { defineUseCase, fail, ok } from '@/application/core';
import { requestAccessInput, requestAccessOutput, type RuleCode } from '@/contracts';
import { requestStanding, type RequestStanding } from '@/domain/review';

import { accessRequestEvent } from './events';

const REFUSALS: Readonly<Record<Exclude<RequestStanding['kind'], 'open'>, RuleCode>> = {
  pending: 'request-pending',
  cooldown: 'request-cooldown',
  blocked: 'request-blocked',
};

/**
 * „Požádat o přístup“: a pending user asks the headmaster for access. The
 * user's row lock serialises this against a decision and a manual grant;
 * the standing is checked before the insert, so the one-pending index only
 * ever catches a race.
 */
export const requestAccess = defineUseCase({
  name: 'access.request',
  mode: 'write',
  input: requestAccessInput,
  output: requestAccessOutput,
  access: { kind: 'gate', check: () => ({ action: 'access.request' }) },
  async execute({ tx, actor, now }, input) {
    if (!(await tx.users.lock(actor.id))) return fail({ code: 'not-found' });
    const standing = requestStanding(await tx.accessRequests.forUser(actor.id), now);
    if (standing.kind !== 'open') return fail({ code: 'rule', rule: REFUSALS[standing.kind] });
    const created = await tx.accessRequests.create(actor.id, input.reason);
    await tx.audit.record(accessRequestEvent('access.request', null, created));
    return ok({ requestId: created.id });
  },
});
