import { atLeast, type Actor, type Role, type UserStatus } from '@/domain/actor';

export const AUDIENCES = ['staff', 'student'] as const;
export type Audience = (typeof AUDIENCES)[number];

/** The user whose access is about to change, as the page or the use case read it. */
export interface AccessTarget {
  readonly id: string;
  readonly role: Role;
  readonly isStudent: boolean;
  readonly status: UserStatus;
  readonly hasPendingRequest: boolean;
}

export interface AccessValue {
  readonly role: Role;
  readonly isStudent: boolean;
  readonly status: UserStatus;
}

/** What the form may offer; anything else is refused. */
export interface AccessChoices {
  readonly roles: readonly Role[];
  readonly audience: boolean;
  readonly statuses: readonly UserStatus[];
}

const NOTHING: AccessChoices = { roles: [], audience: false, statuses: [] };
const SETTABLE_STATUSES: readonly UserStatus[] = ['active', 'blocked'];
const GRANTABLE_ROLES: readonly Role[] = ['submitter', 'reviewer', 'headmaster'];

/** The current status stays on offer when it is `deactivated`, so nothing changes unasked. */
const statusesFor = (target: AccessTarget): readonly UserStatus[] =>
  target.status === 'deactivated' ? [...SETTABLE_STATUSES, 'deactivated'] : SETTABLE_STATUSES;

/**
 * What `by` may set on `target`. Nobody changes their own access, a pending
 * request is only decided through the request, and nobody returns to pending.
 * Pure rules on top of `can(users.manage)`, which the use case checks first.
 */
export function accessChoices(by: Actor, target: AccessTarget): AccessChoices {
  if (by.id === target.id) return NOTHING;
  if (target.role === 'pending') {
    if (target.hasPendingRequest)
      return { roles: [], audience: false, statuses: SETTABLE_STATUSES };
    return {
      roles: ['pending', ...GRANTABLE_ROLES],
      audience: true,
      statuses: statusesFor(target),
    };
  }
  return { roles: GRANTABLE_ROLES, audience: true, statuses: statusesFor(target) };
}

/**
 * Why `by` may not change `target` to `next`, or null. The refusals run in
 * this order. Like `accessChoices`, it is pure rules on top of
 * `can(users.manage)`, which the use case checks first.
 * - `forbidden`: own account, or a role or status the choices never offer.
 * - `conflict`: a request arrived after the page loaded.
 * - `student-role`: a student above the submitter role.
 */
export function refuseAccessChange(
  by: Actor,
  target: AccessTarget,
  next: AccessValue,
): 'forbidden' | 'conflict' | 'student-role' | null {
  if (by.id === target.id) return 'forbidden';
  const roleChanges = next.role !== target.role;
  if (target.hasPendingRequest && (roleChanges || next.isStudent !== target.isStudent)) {
    return 'conflict';
  }
  const choices = accessChoices(by, target);
  if (roleChanges && !choices.roles.includes(next.role)) return 'forbidden';
  if (next.status !== target.status && !choices.statuses.includes(next.status)) return 'forbidden';
  return isValidAccess(next) ? null : 'student-role';
}

/** Role rank falls, or status leaves `active`. */
export function lowersAccess(before: AccessValue, after: AccessValue): boolean {
  return (
    (atLeast(before.role, after.role) && before.role !== after.role) ||
    (before.status === 'active' && after.status !== 'active')
  );
}

/** A student is at most a submitter. */
export function isValidAccess(v: Pick<AccessValue, 'role' | 'isStudent'>): boolean {
  return !v.isStudent || v.role === 'pending' || v.role === 'submitter';
}
