import { describe, expect, it } from 'vitest';

import type { AccessRequestRecord, UserRecord } from '@/application/ports';
import type { Role, UserStatus } from '@/domain/actor';
import { ACCESS_STATES, type AccessState } from '@/domain/review';

import { stillApplies } from './index';

const AT = new Date('2026-09-01T10:00:00Z');

const request = (state: AccessState): AccessRequestRecord => ({
  id: 'request',
  userId: 'user',
  reason: 'reason',
  state,
  decidedBy: null,
  decidedAt: null,
  version: 1,
  createdAt: AT,
});
const user = (role: Role, status: UserStatus = 'active'): UserRecord => ({
  id: 'user',
  tid: 'tid',
  oid: 'oid',
  displayName: 'Name',
  email: null,
  jobTitle: null,
  department: null,
  role,
  isStudent: false,
  status,
  version: 1,
  createdAt: AT,
  updatedAt: AT,
});

const PENDING = user('pending');
const MEMBER = user('submitter');

describe('stillApplies', () => {
  it.each([
    ['access.approved', 'approved', MEMBER],
    ['access.rejected', 'rejected', PENDING],
    ['access.blocked', 'blocked', PENDING],
  ] as const)('%s applies only while the request is %s', (template, state, recipient) => {
    for (const other of ACCESS_STATES) {
      expect(stillApplies(template, request(other), recipient)).toBe(other === state);
    }
  });

  it.each([
    ['submitter', 'active', true],
    ['reviewer', 'active', true],
    ['headmaster', 'active', true],
    ['pending', 'active', false],
    ['submitter', 'blocked', false],
    ['submitter', 'deactivated', false],
  ] as const)('access.approved to a %s, %s account: %s', (role, status, applies) => {
    expect(stillApplies('access.approved', request('approved'), user(role, status))).toBe(applies);
  });

  it.each([
    ['pending', 'active', true],
    ['pending', 'blocked', true],
    ['submitter', 'active', false],
    ['headmaster', 'active', false],
  ] as const)(
    'access.rejected and access.blocked to a %s, %s account: %s',
    (role, status, applies) => {
      expect(stillApplies('access.rejected', request('rejected'), user(role, status))).toBe(
        applies,
      );
      expect(stillApplies('access.blocked', request('blocked'), user(role, status))).toBe(applies);
    },
  );

  it.each([
    ['submitter', 'active', true],
    ['reviewer', 'active', true],
    ['headmaster', 'active', true],
    ['pending', 'active', false],
    ['submitter', 'blocked', false],
    ['submitter', 'deactivated', false],
  ] as const)('access.granted to a %s, %s account: %s', (role, status, applies) => {
    const recipient = user(role, status);
    expect(stillApplies('access.granted', recipient, recipient)).toBe(applies);
  });

  it('always sends the operator’s test mail', () => {
    for (const recipient of [PENDING, MEMBER, user('submitter', 'blocked')]) {
      expect(stillApplies('mail.check', recipient, recipient)).toBe(true);
    }
  });

  describe('races between the decision and the send', () => {
    it('drops an approval once the user was lowered back to pending', () => {
      expect(stillApplies('access.approved', request('approved'), PENDING)).toBe(false);
    });

    it('drops an approval once the account was blocked', () => {
      expect(
        stillApplies('access.approved', request('approved'), user('submitter', 'blocked')),
      ).toBe(false);
    });

    it('drops a rejection once the user was granted access by hand', () => {
      expect(stillApplies('access.rejected', request('rejected'), MEMBER)).toBe(false);
    });

    it('drops a block once the user was granted access by hand', () => {
      expect(stillApplies('access.blocked', request('blocked'), MEMBER)).toBe(false);
    });

    it('drops a rejection once the request was blocked: the block mails instead', () => {
      expect(stillApplies('access.rejected', request('blocked'), PENDING)).toBe(false);
      expect(stillApplies('access.blocked', request('blocked'), PENDING)).toBe(true);
    });
  });

  it.each([
    ['access.approved', MEMBER],
    ['access.rejected', PENDING],
    ['access.blocked', PENDING],
    ['access.granted', MEMBER],
    ['mail.check', MEMBER],
  ] as const)(
    'never sends %s about a missing subject (a purged request)',
    (template, recipient) => {
      expect(stillApplies(template, null, recipient)).toBe(false);
    },
  );
});
