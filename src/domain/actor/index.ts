/**
 * Who is acting. Roles grow in privilege: a reviewer can do everything a
 * submitter can, the headmaster everything a reviewer can.
 */
export type Role = 'pending' | 'submitter' | 'reviewer' | 'headmaster';
export type UserStatus = 'active' | 'blocked' | 'deactivated';

export interface Actor {
  readonly id: string;
  readonly role: Role;
  readonly status: UserStatus;
  /** Students are limited to the submitter role and never see the registry or archive. */
  readonly isStudent: boolean;
}

const RANK: Readonly<Record<Role, number>> = {
  pending: 0,
  submitter: 1,
  reviewer: 2,
  headmaster: 3,
};

/** True when `role` has at least the privileges of `minimum`. */
export function atLeast(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

export const ROLES: readonly Role[] = ['pending', 'submitter', 'reviewer', 'headmaster'];
