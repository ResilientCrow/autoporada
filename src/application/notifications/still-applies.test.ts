import { describe, expect, it } from 'vitest';

import type { AccessRequestRecord, PointEventName, UserRecord } from '@/application/ports';
import type { Role, UserStatus } from '@/domain/actor';
import {
  ACCESS_STATES,
  type AccessState,
  type FutureState,
  type PointState,
  type ReportState,
} from '@/domain/review';

import { calDate } from '@/domain/time';

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
const user = (role: Role, status: UserStatus = 'active', id = 'user'): UserRecord => ({
  id,
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

/** Every state and every event, so a new one cannot slip past the tables below. */
const POINT_STATES = Object.keys({
  draft: 0,
  submitted: 0,
  returned: 0,
  approved: 0,
  rejected: 0,
  withdrawn: 0,
  published: 0,
} satisfies Record<PointState, 0>) as PointState[];
const POINT_EVENTS = Object.keys({
  submit: 0,
  retract: 0,
  withdraw: 0,
  approve: 0,
  return: 0,
  reject: 0,
  publish: 0,
  unpublish: 0,
  edit: 0,
} satisfies Record<PointEventName, 0>) as PointEventName[];

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

  describe('decision mails about a point', () => {
    /** The event `event` of the point, which now stands in `state`, by `authorId`. */
    const decision = (event: PointEventName, state: PointState, authorId = 'user') => ({
      event: { id: 'event', pointId: 'point', event, toState: state },
      point: { id: 'point', authorId, state },
    });

    it.each([
      ['point.returned', 'return', ['returned']],
      ['point.approved', 'approve', ['approved', 'published']],
      ['point.rejected', 'reject', ['rejected']],
    ] as const)('%s (a %s event) applies only while the point is %j', (template, event, states) => {
      for (const state of POINT_STATES) {
        const applies = (states as readonly PointState[]).includes(state);
        expect(stillApplies(template, decision(event, state), MEMBER)).toBe(applies);
      }
    });

    it.each([
      ['point.returned', 'return', 'returned'],
      ['point.approved', 'approve', 'approved'],
      ['point.rejected', 'reject', 'rejected'],
    ] as const)('%s reports only a %s event', (template, reported, state) => {
      for (const event of POINT_EVENTS) {
        expect(stillApplies(template, decision(event, state), MEMBER)).toBe(event === reported);
      }
    });

    it('drops a return once the author handed the point in again', () => {
      expect(stillApplies('point.returned', decision('return', 'submitted'), MEMBER)).toBe(false);
    });

    it('drops an approval once a reviewer returned the point', () => {
      expect(stillApplies('point.approved', decision('approve', 'returned'), MEMBER)).toBe(false);
    });

    it.each([
      ['point.returned', 'return', 'returned'],
      ['point.approved', 'approve', 'approved'],
      ['point.rejected', 'reject', 'rejected'],
    ] as const)('%s goes only to the author, about their own point', (template, event, state) => {
      const subject = decision(event, state);
      expect(stillApplies(template, subject, MEMBER)).toBe(true);
      expect(stillApplies(template, subject, user('submitter', 'active', 'other'))).toBe(false);
      const foreign = { ...subject, event: { ...subject.event, pointId: 'other-point' } };
      expect(stillApplies(template, foreign, MEMBER)).toBe(false);
    });

    it.each([
      ['submitter', 'active', true],
      ['reviewer', 'active', true],
      ['headmaster', 'active', true],
      ['pending', 'active', false],
      ['submitter', 'blocked', false],
      ['submitter', 'deactivated', false],
    ] as const)('point.returned to a %s, %s author: %s', (role, status, applies) => {
      expect(
        stillApplies('point.returned', decision('return', 'returned'), user(role, status)),
      ).toBe(applies);
    });
  });

  describe('report.prompt about an akce', () => {
    const item = (state: FutureState, reportState: ReportState, authorId = 'user') => ({
      id: 'item',
      authorId,
      state,
      reportState,
    });

    it('applies while the akce is approved and no report was written', () => {
      expect(stillApplies('report.prompt', item('approved', 'none'), MEMBER)).toBe(true);
    });

    it('drops once the report is written', () => {
      expect(stillApplies('report.prompt', item('approved', 'written'), MEMBER)).toBe(false);
    });

    it.each(['draft', 'submitted', 'returned', 'rejected', 'withdrawn', 'cancelled'] as const)(
      'drops once the akce is %s',
      (state) => {
        expect(stillApplies('report.prompt', item(state, 'none'), MEMBER)).toBe(false);
      },
    );

    it('goes only to the author, while they can sign in', () => {
      expect(
        stillApplies(
          'report.prompt',
          item('approved', 'none'),
          user('submitter', 'active', 'other'),
        ),
      ).toBe(false);
      expect(
        stillApplies('report.prompt', item('approved', 'none'), user('submitter', 'deactivated')),
      ).toBe(false);
      expect(stillApplies('report.prompt', item('approved', 'none'), user('pending'))).toBe(false);
    });
  });

  describe('the deadline reminders', () => {
    const MONDAY = calDate(2026, 10, 26);
    const facts = (hasWork: boolean) => ({ monday: MONDAY, meetingDate: MONDAY, hasWork });

    it('sends the soft one only to someone who still owes an akce report, a student too', () => {
      expect(stillApplies('reminder.soft', facts(true), MEMBER)).toBe(true);
      expect(stillApplies('reminder.soft', facts(false), MEMBER)).toBe(false);
      expect(stillApplies('reminder.soft', facts(true), { ...MEMBER, isStudent: true })).toBe(true);
      expect(stillApplies('reminder.soft', facts(true), user('submitter', 'blocked'))).toBe(false);
      expect(stillApplies('reminder.soft', facts(true), user('pending'))).toBe(false);
    });

    it('sends the hard one only to someone who still has a draft or returned point', () => {
      expect(stillApplies('reminder.hard', facts(true), MEMBER)).toBe(true);
      expect(stillApplies('reminder.hard', facts(false), MEMBER)).toBe(false);
      expect(stillApplies('reminder.hard', facts(true), { ...MEMBER, isStudent: true })).toBe(true);
      expect(stillApplies('reminder.hard', facts(true), user('submitter', 'deactivated'))).toBe(
        false,
      );
      expect(stillApplies('reminder.hard', facts(true), user('pending'))).toBe(false);
    });
  });

  describe('the reviewer digest', () => {
    const counts = (submitted: number, accessRequests = 0) => ({ submitted, accessRequests });
    const REVIEWER = user('reviewer');
    const HEADMASTER = user('headmaster');

    it('goes to a reviewer or headmaster while something is new, and to no one for nothing', () => {
      expect(stillApplies('reviewer.digest', counts(1), REVIEWER)).toBe(true);
      expect(stillApplies('reviewer.digest', counts(1), HEADMASTER)).toBe(true);
      expect(stillApplies('reviewer.digest', counts(0), REVIEWER)).toBe(false);
      expect(stillApplies('reviewer.digest', counts(0), HEADMASTER)).toBe(false);
    });

    it('lets access requests alone make a headmaster’s digest, never a reviewer’s', () => {
      expect(stillApplies('reviewer.digest', counts(0, 2), HEADMASTER)).toBe(true);
      expect(stillApplies('reviewer.digest', counts(0, 2), REVIEWER)).toBe(false);
    });

    it('goes to no one who cannot review any more', () => {
      for (const recipient of [
        user('reviewer', 'blocked'),
        user('headmaster', 'deactivated'),
        user('submitter'),
        user('pending'),
      ]) {
        expect(stillApplies('reviewer.digest', counts(3, 3), recipient)).toBe(false);
      }
    });
  });

  describe('the headmaster summary', () => {
    const issue = {
      monday: calDate(2026, 10, 26),
      meetingDate: calDate(2026, 10, 26),
      approved: 0,
      pending: 0,
      returned: 0,
      lateExpected: 0,
      lastLateDue: null,
    };

    it('goes to the headmaster while they can sign in, whatever the counts say', () => {
      expect(stillApplies('headmaster.summary', issue, user('headmaster'))).toBe(true);
    });

    it('goes to no one else: not a reviewer, not a headmaster who was blocked or deactivated', () => {
      for (const recipient of [
        user('reviewer'),
        user('submitter'),
        user('pending'),
        user('headmaster', 'blocked'),
        user('headmaster', 'deactivated'),
      ]) {
        expect(stillApplies('headmaster.summary', issue, recipient)).toBe(false);
      }
    });
  });

  it.each([
    ['access.approved', MEMBER],
    ['access.rejected', PENDING],
    ['access.blocked', PENDING],
    ['access.granted', MEMBER],
    ['mail.check', MEMBER],
    ['point.returned', MEMBER],
    ['point.approved', MEMBER],
    ['point.rejected', MEMBER],
    ['report.prompt', MEMBER],
    ['reminder.soft', MEMBER],
    ['reminder.hard', MEMBER],
    ['reviewer.digest', user('reviewer')],
    ['headmaster.summary', user('headmaster')],
  ] as const)(
    'never sends %s about a missing subject (a purged request, a deleted point)',
    (template, recipient) => {
      expect(stillApplies(template, null, recipient)).toBe(false);
    },
  );
});
