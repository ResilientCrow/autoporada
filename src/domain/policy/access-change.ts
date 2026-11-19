import {
  atLeast,
  isStudentTier,
  TIERS,
  type Actor,
  type Role,
  type Tier,
  type UserStatus,
} from '@/domain/actor';

/** The user whose access is about to change, as the page or the use case read it. */
export interface AccessTarget {
  readonly id: string;
  readonly role: Role;
  readonly tier: Tier | null;
  readonly status: UserStatus;
  readonly hasPendingRequest: boolean;
}

export interface AccessValue {
  readonly role: Role;
  readonly tier: Tier | null;
  readonly status: UserStatus;
}

/** What the form may offer; anything else is refused. */
export interface AccessChoices {
  readonly roles: readonly Role[];
  /** A set tier never goes back to none, so none is never on offer (ADR 0072, decision F). */
  readonly tiers: readonly Tier[];
  readonly statuses: readonly UserStatus[];
}

/** The headmaster's own row: a staff tier and nothing else (ADR 0072, decision A). */
const OWN: AccessChoices = {
  roles: [],
  tiers: TIERS.filter((tier) => !isStudentTier(tier)),
  statuses: [],
};
const SETTABLE_STATUSES: readonly UserStatus[] = ['active', 'blocked'];
const GRANTABLE_ROLES: readonly Role[] = ['submitter', 'reviewer', 'headmaster'];

/** The current status stays on offer when it is `deactivated`, so nothing changes unasked. */
const statusesFor = (target: AccessTarget): readonly UserStatus[] =>
  target.status === 'deactivated' ? [...SETTABLE_STATUSES, 'deactivated'] : SETTABLE_STATUSES;

/**
 * What `by` may set on `target`. Nobody changes their own role or status, only
 * their own tier to a staff one (a tier grants no rights); a pending request is
 * only decided through the request, and nobody returns to pending. Pure rules
 * on top of `can(users.manage)`, which the use case checks first.
 */
export function accessChoices(by: Actor, target: AccessTarget): AccessChoices {
  if (by.id === target.id) return OWN;
  if (target.role === 'pending') {
    if (target.hasPendingRequest) return { roles: [], tiers: [], statuses: SETTABLE_STATUSES };
    return {
      roles: ['pending', ...GRANTABLE_ROLES],
      tiers: TIERS,
      statuses: statusesFor(target),
    };
  }
  return { roles: GRANTABLE_ROLES, tiers: TIERS, statuses: statusesFor(target) };
}

/**
 * Why `by` may not change `target` to `next`, or null. The refusals run in
 * this order. Like `accessChoices`, it is pure rules on top of
 * `can(users.manage)`, which the use case checks first.
 * - `forbidden`: own account other than a tier change, or a role, tier or
 *   status the choices never offer (a set tier back to none among them).
 * - `conflict`: a request arrived after the page loaded.
 * - `tier-required`: a grant out of `pending` with no tier, as an approval
 *   needs one (an older member with none was staff and stays legal).
 * - `student-role`: a student or absolvent above the submitter role.
 */
export function refuseAccessChange(
  by: Actor,
  target: AccessTarget,
  next: AccessValue,
): 'forbidden' | 'conflict' | 'tier-required' | 'student-role' | null {
  const roleChanges = next.role !== target.role;
  const tierChanges = next.tier !== target.tier;
  if (by.id === target.id && !tierChanges) return 'forbidden';
  if (target.hasPendingRequest && (roleChanges || tierChanges)) return 'conflict';
  const choices = accessChoices(by, target);
  if (roleChanges && !choices.roles.includes(next.role)) return 'forbidden';
  if (tierChanges && (next.tier === null || !choices.tiers.includes(next.tier))) {
    return 'forbidden';
  }
  if (next.status !== target.status && !choices.statuses.includes(next.status)) return 'forbidden';
  if (target.role === 'pending' && next.role !== 'pending' && next.tier === null) {
    return 'tier-required';
  }
  return isValidAccess(next) ? null : 'student-role';
}

/** Role rank falls, or status leaves `active`. */
export function lowersAccess(before: AccessValue, after: AccessValue): boolean {
  return (
    (atLeast(before.role, after.role) && before.role !== after.role) ||
    (before.status === 'active' && after.status !== 'active')
  );
}

/** A student or absolvent is at most a submitter. */
export function isValidAccess(v: Pick<AccessValue, 'role' | 'tier'>): boolean {
  return !isStudentTier(v.tier) || v.role === 'pending' || v.role === 'submitter';
}
