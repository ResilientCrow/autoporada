import { defineUseCase, fail, ok, type UseCaseFailure } from '@/application/core';
import { mailJob } from '@/application/notifications';
import type { AccessPatch, UserRecord } from '@/application/ports';
import { changeUserAccessInput, changeUserAccessOutput } from '@/contracts';
import { can, lowersAccess, refuseAccessChange, type AccessValue } from '@/domain/policy';

import { userAccessEvent } from './events';
import { lockedActor } from './locked-actor';

const REFUSALS: Readonly<
  Record<NonNullable<ReturnType<typeof refuseAccessChange>>, UseCaseFailure>
> = {
  forbidden: { code: 'forbidden' },
  conflict: { code: 'conflict' },
  'student-role': { code: 'rule', rule: 'student-role' },
};

/** Only the fields that differ, so an unchanged field is never written. */
function patchOf(user: UserRecord, next: AccessValue): AccessPatch {
  return {
    ...(next.role !== user.role && { role: next.role }),
    ...(next.isStudent !== user.isStudent && { isStudent: next.isStudent }),
    ...(next.status !== user.status && { status: next.status }),
  };
}

/**
 * A headmaster sets a user's role, audience and account status, under
 * step-up (the pipeline asks for it once `can()` passed). The form sends the
 * full desired state; nothing to change writes nothing. Lowering access
 * needs `confirmed`. The user's row is locked first, the one access.request
 * takes first, so a request filed meanwhile is seen here; the headmaster's
 * own row comes next, so `can()` is asked again of it (lockedActor). A
 * headmaster who still is one never leaves the school without one; the
 * database's check at commit (rule last-headmaster) stays the backstop. A
 * grant out of `pending` queues the user's mail; no other change does.
 */
export const changeUserAccess = defineUseCase({
  name: 'users.changeAccess',
  mode: 'write',
  input: changeUserAccessInput,
  output: changeUserAccessOutput,
  access: {
    kind: 'resource',
    load: (tx, input) => tx.users.lock(input.userId),
    expectedVersion: (input) => input.version,
    check: () => ({ action: 'users.manage' }),
  },
  async execute({ tx, actor }, input, user) {
    const current = await lockedActor(tx, actor);
    if (!current || !can(current, { action: 'users.manage' })) return fail({ code: 'forbidden' });
    const [newest] = await tx.accessRequests.forUser(user.id);
    const next: AccessValue = {
      role: input.role,
      isStudent: input.audience === 'student',
      status: input.status,
    };
    const refusal = refuseAccessChange(
      current,
      { ...user, hasPendingRequest: newest?.state === 'pending' },
      next,
    );
    if (refusal) return fail(REFUSALS[refusal]);

    const patch = patchOf(user, next);
    if (Object.keys(patch).length === 0) return ok({ changed: false });
    if (lowersAccess(user, next) && !input.confirmed) {
      return fail({ code: 'invalid-input', fields: { confirmed: 'required' } });
    }
    const after = await tx.users.changeAccess(user.id, user.version, patch);
    await tx.audit.record(userAccessEvent(user, after, { via: 'users.changeAccess' }));
    if (user.role === 'pending' && after.role !== 'pending') {
      const mail = mailJob('access.granted', { userId: user.id, versionAfter: after.version });
      await tx.jobs.enqueue('mail.send', mail.data, { dedupeKey: mail.dedupeKey });
    }
    return ok({ changed: true });
  },
});
