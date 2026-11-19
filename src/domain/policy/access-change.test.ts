import { describe, expect, it } from 'vitest';

import { TIERS, type Actor, type Role, type Tier, type UserStatus } from '@/domain/actor';

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
  tier: null,
  status: 'active',
  hasPendingRequest: false,
  ...extra,
});
const value = (t: AccessTarget, extra: Partial<AccessValue> = {}): AccessValue => ({
  role: t.role,
  tier: t.tier,
  status: t.status,
  ...extra,
});
const STAFF: readonly Role[] = ['submitter', 'reviewer', 'headmaster'];
const OWN_TIERS: readonly Tier[] = ['reditel', 'vedeni', 'ucitel', 'zamestnanec'];

describe('accessChoices', () => {
  it.each<[string, AccessTarget, AccessChoices]>([
    [
      'own account: a staff tier only',
      target({ id: by.id, role: 'headmaster' }),
      { roles: [], tiers: OWN_TIERS, statuses: [] },
    ],
    [
      'pending user with a pending request',
      target({ role: 'pending', hasPendingRequest: true }),
      { roles: [], tiers: [], statuses: ['active', 'blocked'] },
    ],
    [
      'pending user without a request',
      target({ role: 'pending' }),
      { roles: ['pending', ...STAFF], tiers: TIERS, statuses: ['active', 'blocked'] },
    ],
    [
      'deactivated pending user without a request',
      target({ role: 'pending', status: 'deactivated' }),
      {
        roles: ['pending', ...STAFF],
        tiers: TIERS,
        statuses: ['active', 'blocked', 'deactivated'],
      },
    ],
    [
      'active reviewer: never back to pending',
      target({ role: 'reviewer' }),
      { roles: STAFF, tiers: TIERS, statuses: ['active', 'blocked'] },
    ],
    [
      'blocked submitter',
      target({ status: 'blocked' }),
      { roles: STAFF, tiers: TIERS, statuses: ['active', 'blocked'] },
    ],
    [
      'deactivated submitter keeps its status on offer',
      target({ status: 'deactivated' }),
      { roles: STAFF, tiers: TIERS, statuses: ['active', 'blocked', 'deactivated'] },
    ],
  ])('%s', (_name, t, expected) => {
    expect(accessChoices(by, t)).toEqual(expected);
  });
});

describe('refuseAccessChange', () => {
  const t = target();
  const pendingWithRequest = target({ role: 'pending', hasPendingRequest: true });
  const pendingNoRequest = target({ role: 'pending' });
  const own = target({ id: by.id, role: 'headmaster' });

  it.each<[string, AccessTarget, Partial<AccessValue>, string | null]>([
    ['own account, whatever is asked', target({ id: by.id }), { role: 'reviewer' }, 'forbidden'],
    ['own account, no change at all', target({ id: by.id }), {}, 'forbidden'],
    ['own account, status changes', target({ id: by.id }), { status: 'blocked' }, 'forbidden'],
    ['own account, tier set', own, { tier: 'reditel' }, null],
    ['own account, tier changed', target({ ...own, tier: 'vedeni' }), { tier: 'ucitel' }, null],
    ['own account, a student tier', own, { tier: 'student' }, 'forbidden'],
    ['own account, an absolvent tier', own, { tier: 'absolvent' }, 'forbidden'],
    [
      'own account, tier back to none',
      target({ ...own, tier: 'reditel' }),
      { tier: null },
      'forbidden',
    ],
    ['own account, tier and role', own, { tier: 'reditel', role: 'reviewer' }, 'forbidden'],
    ['own account, tier and status', own, { tier: 'reditel', status: 'blocked' }, 'forbidden'],
    ['request pending, role changes', pendingWithRequest, { role: 'submitter' }, 'conflict'],
    ['request pending, tier changes', pendingWithRequest, { tier: 'ucitel' }, 'conflict'],
    ['request pending, status changes', pendingWithRequest, { status: 'blocked' }, null],
    ['request pending, nothing changes', pendingWithRequest, {}, null],
    [
      'conflict beats student-role',
      pendingWithRequest,
      { role: 'reviewer', tier: 'student' },
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
    ['employee made a student', t, { tier: 'student' }, null],
    ['a set tier back to none', target({ tier: 'ucitel' }), { tier: null }, 'forbidden'],
    ['a student back to none', target({ tier: 'student' }), { tier: null }, 'forbidden'],
    ['no tier stays none', t, {}, null],
    ['student made reviewer', t, { role: 'reviewer', tier: 'student' }, 'student-role'],
    ['absolvent made reviewer', t, { role: 'reviewer', tier: 'absolvent' }, 'student-role'],
    ['vedení made reviewer', t, { role: 'reviewer', tier: 'vedeni' }, null],
    [
      'existing student made reviewer',
      target({ tier: 'student' }),
      { role: 'reviewer' },
      'student-role',
    ],
    [
      'student granted access by hand',
      pendingNoRequest,
      { role: 'submitter', tier: 'student' },
      null,
    ],
    ['forbidden beats student-role', t, { role: 'pending', tier: 'student' }, 'forbidden'],
  ])('%s', (_name, tg, change, expected) => {
    expect(refuseAccessChange(by, tg, value(tg, change))).toBe(expected);
  });
});

describe('lowersAccess', () => {
  const v = (role: Role, status: UserStatus = 'active'): AccessValue => ({
    role,
    status,
    tier: null,
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
  it.each<[Role, Tier | null, boolean]>([
    ['pending', 'student', true],
    ['submitter', 'student', true],
    ['submitter', 'absolvent', true],
    ['reviewer', 'student', false],
    ['headmaster', 'student', false],
    ['reviewer', 'absolvent', false],
    ['reviewer', null, true],
    ['reviewer', 'vedeni', true],
    ['headmaster', 'reditel', true],
  ])('%s, tier %s → %s', (role, tier, valid) => {
    expect(isValidAccess({ role, tier })).toBe(valid);
  });
});
