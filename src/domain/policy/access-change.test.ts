import { describe, expect, it } from 'vitest';

import type { Actor, Role, UserStatus } from '@/domain/actor';

import {
  accessChoices,
  isValidAccess,
  lowersAccess,
  refuseAccessChange,
  type AccessChoices,
  type AccessTarget,
  type AccessValue,
} from './index';

const by: Actor = { id: 'boss', role: 'headmaster', status: 'active', isStudent: false };
const target = (extra: Partial<AccessTarget> = {}): AccessTarget => ({
  id: 'u1',
  role: 'submitter',
  isStudent: false,
  status: 'active',
  hasPendingRequest: false,
  ...extra,
});
const value = (t: AccessTarget, extra: Partial<AccessValue> = {}): AccessValue => ({
  role: t.role,
  isStudent: t.isStudent,
  status: t.status,
  ...extra,
});
const STAFF: readonly Role[] = ['submitter', 'reviewer', 'headmaster'];

describe('accessChoices', () => {
  it.each<[string, AccessTarget, AccessChoices]>([
    [
      'own account',
      target({ id: by.id, role: 'headmaster' }),
      { roles: [], audience: false, statuses: [] },
    ],
    [
      'pending user with a pending request',
      target({ role: 'pending', hasPendingRequest: true }),
      { roles: [], audience: false, statuses: ['active', 'blocked'] },
    ],
    [
      'pending user without a request',
      target({ role: 'pending' }),
      { roles: ['pending', ...STAFF], audience: true, statuses: ['active', 'blocked'] },
    ],
    [
      'deactivated pending user without a request',
      target({ role: 'pending', status: 'deactivated' }),
      {
        roles: ['pending', ...STAFF],
        audience: true,
        statuses: ['active', 'blocked', 'deactivated'],
      },
    ],
    [
      'active reviewer: never back to pending',
      target({ role: 'reviewer' }),
      { roles: STAFF, audience: true, statuses: ['active', 'blocked'] },
    ],
    [
      'blocked submitter',
      target({ status: 'blocked' }),
      { roles: STAFF, audience: true, statuses: ['active', 'blocked'] },
    ],
    [
      'deactivated submitter keeps its status on offer',
      target({ status: 'deactivated' }),
      { roles: STAFF, audience: true, statuses: ['active', 'blocked', 'deactivated'] },
    ],
  ])('%s', (_name, t, expected) => {
    expect(accessChoices(by, t)).toEqual(expected);
  });
});

describe('refuseAccessChange', () => {
  const t = target();
  const pendingWithRequest = target({ role: 'pending', hasPendingRequest: true });
  const pendingNoRequest = target({ role: 'pending' });

  it.each<[string, AccessTarget, Partial<AccessValue>, string | null]>([
    ['own account, whatever is asked', target({ id: by.id }), { role: 'reviewer' }, 'forbidden'],
    ['own account, no change at all', target({ id: by.id }), {}, 'forbidden'],
    ['request pending, role changes', pendingWithRequest, { role: 'submitter' }, 'conflict'],
    ['request pending, audience changes', pendingWithRequest, { isStudent: true }, 'conflict'],
    ['request pending, status changes', pendingWithRequest, { status: 'blocked' }, null],
    ['request pending, nothing changes', pendingWithRequest, {}, null],
    [
      'conflict beats student-role',
      pendingWithRequest,
      { role: 'reviewer', isStudent: true },
      'conflict',
    ],
    ['submitter to pending', t, { role: 'pending' }, 'forbidden'],
    ['reviewer to pending', target({ role: 'reviewer' }), { role: 'pending' }, 'forbidden'],
    ['submitter to deactivated', t, { status: 'deactivated' }, 'forbidden'],
    ['deactivated stays deactivated', target({ status: 'deactivated' }), {}, null],
    ['submitter to reviewer', t, { role: 'reviewer' }, null],
    ['reviewer to submitter', target({ role: 'reviewer' }), { role: 'submitter' }, null],
    ['submitter blocked', t, { status: 'blocked' }, null],
    ['blocked submitter unblocked', target({ status: 'blocked' }), { status: 'active' }, null],
    ['grant access by hand to a pending user', pendingNoRequest, { role: 'submitter' }, null],
    ['pending user without a request stays pending', pendingNoRequest, {}, null],
    ['employee made a student', t, { isStudent: true }, null],
    ['student made reviewer', t, { role: 'reviewer', isStudent: true }, 'student-role'],
    [
      'existing student made reviewer',
      target({ isStudent: true }),
      { role: 'reviewer' },
      'student-role',
    ],
    [
      'student granted access by hand',
      pendingNoRequest,
      { role: 'submitter', isStudent: true },
      null,
    ],
    ['forbidden beats student-role', t, { role: 'pending', isStudent: true }, 'forbidden'],
  ])('%s', (_name, tg, change, expected) => {
    expect(refuseAccessChange(by, tg, value(tg, change))).toBe(expected);
  });
});

describe('lowersAccess', () => {
  const v = (role: Role, status: UserStatus = 'active'): AccessValue => ({
    role,
    status,
    isStudent: false,
  });

  it.each<[string, AccessValue, AccessValue, boolean]>([
    ['role falls', v('reviewer'), v('submitter'), true],
    ['role falls by two', v('headmaster'), v('submitter'), true],
    ['role rises', v('submitter'), v('reviewer'), false],
    ['role equal', v('reviewer'), v('reviewer'), false],
    ['active to blocked', v('submitter'), v('submitter', 'blocked'), true],
    ['active to deactivated', v('submitter'), v('submitter', 'deactivated'), true],
    ['blocked to active', v('submitter', 'blocked'), v('submitter'), false],
    ['blocked to deactivated', v('submitter', 'blocked'), v('submitter', 'deactivated'), false],
    ['rises and blocked at once', v('submitter'), v('reviewer', 'blocked'), true],
  ])('%s', (_name, before, after, expected) => {
    expect(lowersAccess(before, after)).toBe(expected);
  });
});

describe('isValidAccess', () => {
  it.each<[Role, boolean, boolean]>([
    ['pending', true, true],
    ['submitter', true, true],
    ['reviewer', true, false],
    ['headmaster', true, false],
    ['reviewer', false, true],
    ['headmaster', false, true],
  ])('%s, student %s → %s', (role, isStudent, valid) => {
    expect(isValidAccess({ role, isStudent })).toBe(valid);
  });
});
