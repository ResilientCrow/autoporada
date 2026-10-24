import { defineUseCase, fail, ok } from '@/application/core';
import { requestAccessInput, requestAccessOutput, type RuleCode } from '@/contracts';
import { can } from '@/domain/policy';
import { requestStanding, type RequestStanding } from '@/domain/review';

import { lockedActor } from '../users/locked-actor';
import { accessRequestEvent } from './events';

const REFUSALS: Readonly<Record<Exclude<RequestStanding['kind'], 'open'>, RuleCode>> = {
  pending: 'request-pending',
  cooldown: 'request-cooldown',
  blocked: 'request-blocked',
};

/**
 * „Požádat o přístup“: a pending user asks the headmaster for access. The
 * user's row lock serialises this against a decision and a manual grant,
 * and `can()` is asked again of the locked row (lockedActor). The standing is checked before the insert, so the
 * one-pending index only ever catches a race.
 */
export const requestAccess = defineUseCase({
  name: 'access.request',
  mode: 'write',
  input: requestAccessInput,
  output: requestAccessOutput,
  access: { kind: 'gate', check: () => ({ action: 'access.request' }) },
  async execute({ tx, actor, now }, input) {
    const current = await lockedActor(tx, actor);
    if (!current) return fail({ code: 'not-found' });
    if (!can(current, { action: 'access.request' })) return fail({ code: 'forbidden' });
    const standing = requestStanding(await tx.accessRequests.forUser(actor.id), now);
    if (standing.kind !== 'open') return fail({ code: 'rule', rule: REFUSALS[standing.kind] });
    const created = await tx.accessRequests.create(actor.id, input.reason);
    await tx.audit.record(accessRequestEvent('access.request', null, created));
    return ok({ requestId: created.id });
  },
});
