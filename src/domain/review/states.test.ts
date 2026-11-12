import { describe, expect, it } from 'vitest';

import { ROLES, type Role } from '@/domain/actor';
import { calDate, parseWallTime, wallClockToInstant } from '@/domain/time';

import {
  ACCESS_MACHINE,
  availableEvents,
  canEditFuture,
  canEditPoint,
  FUTURE_MACHINE,
  futureEditNeedsReview,
  ACCESS_EVENTS,
  ACCESS_STATES,
  ISSUE_MACHINE,
  POINT_MACHINE,
  REPORT_MACHINE,
  reportDue,
  transition,
  type FutureState,
  type PointState,
  type ReviewActor,
  wasApproved,
} from './index';

const user = (role: Role, isAuthor = false): ReviewActor => ({ kind: 'user', role, isAuthor });
const SYSTEM: ReviewActor = { kind: 'system' };
const author = user('submitter', true);
const reviewer = user('reviewer');
const headmaster = user('headmaster');

describe('point lifecycle', () => {
  it.each([
    ['draft', 'submit', author, 'submitted'],
    ['returned', 'submit', author, 'submitted'],
    ['submitted', 'retract', author, 'draft'],
    ['submitted', 'withdraw', author, 'withdrawn'],
    ['submitted', 'approve', reviewer, 'approved'],
    ['submitted', 'approve', headmaster, 'approved'],
    ['approved', 'publish', SYSTEM, 'published'],
    ['published', 'unpublish', headmaster, 'approved'],
  ] as const)('%s --%s--> %s', (from, event, actor, to) => {
    expect(transition(POINT_MACHINE, from, event, actor)).toEqual({ ok: true, to });
  });

  it('requires a note to reject; a return names parts or a note, as the contract checks (ADR 0058)', () => {
    expect(transition(POINT_MACHINE, 'submitted', 'return', reviewer)).toEqual({
      ok: true,
      to: 'returned',
    });
    expect(transition(POINT_MACHINE, 'submitted', 'reject', reviewer, '   ')).toMatchObject({
      reason: 'note-required',
    });
    expect(transition(POINT_MACHINE, 'approved', 'return', reviewer, 'Doplňte vyjádření.')).toEqual(
      {
        ok: true,
        to: 'returned',
      },
    );
  });

  it('keeps reviewers from approving their own points, but not the headmaster', () => {
    expect(transition(POINT_MACHINE, 'submitted', 'approve', user('reviewer', true))).toMatchObject(
      {
        reason: 'not-allowed',
      },
    );
    expect(
      transition(POINT_MACHINE, 'submitted', 'approve', user('headmaster', true)),
    ).toMatchObject({
      ok: true,
    });
  });

  it('lets only the system publish', () => {
    for (const role of ROLES) {
      expect(transition(POINT_MACHINE, 'approved', 'publish', user(role, true)).ok).toBe(false);
    }
  });

  it('never lets someone else act as the author', () => {
    for (const event of ['submit', 'retract', 'withdraw'] as const) {
      expect(availableEvents(POINT_MACHINE, 'draft', reviewer)).not.toContain(event);
      expect(availableEvents(POINT_MACHINE, 'submitted', headmaster)).not.toContain(event);
    }
  });

  it('gives a pending user nothing to do, even on their own point', () => {
    const states: PointState[] = ['draft', 'submitted', 'returned', 'approved'];
    for (const state of states) {
      expect(availableEvents(POINT_MACHINE, state, user('pending', true))).toEqual([]);
    }
  });

  it('treats rejected and withdrawn as final', () => {
    for (const actor of [author, reviewer, headmaster, SYSTEM]) {
      expect(availableEvents(POINT_MACHINE, 'rejected', actor)).toEqual([]);
      expect(availableEvents(POINT_MACHINE, 'withdrawn', actor)).toEqual([]);
    }
  });

  it('rejects events from the wrong state', () => {
    expect(transition(POINT_MACHINE, 'draft', 'approve', reviewer)).toEqual({
      ok: false,
      reason: 'wrong-state',
    });
  });

  it.each([
    ['draft', author, true],
    ['returned', author, true],
    ['submitted', author, false],
    ['approved', author, false],
    ['submitted', reviewer, true],
    ['approved', headmaster, true],
    ['draft', reviewer, false],
    ['published', headmaster, false],
    ['approved', user('reviewer', true), false],
    ['approved', user('headmaster', true), true],
    ['approved', reviewer, true],
  ] as const)('editing a %s point: %o → %s', (state, actor, allowed) => {
    expect(canEditPoint(state, actor)).toBe(allowed);
  });
});

describe('closing a point at generation (ADR 0049)', () => {
  it.each(['draft', 'returned', 'submitted'] as const)(
    'withdraws a %s point, by the system only',
    (from) => {
      expect(transition(POINT_MACHINE, from, 'close', SYSTEM)).toEqual({
        ok: true,
        to: 'withdrawn',
      });
      expect(transition(POINT_MACHINE, from, 'close', author).ok).toBe(false);
      expect(transition(POINT_MACHINE, from, 'close', headmaster).ok).toBe(false);
    },
  );

  it.each(['approved', 'published', 'rejected', 'withdrawn'] as const)(
    'does not close a %s point',
    (from) => {
      expect(transition(POINT_MACHINE, from, 'close', SYSTEM)).toEqual({
        ok: false,
        reason: 'wrong-state',
      });
    },
  );
});

describe('rejecting approved work (plan §5)', () => {
  it.each([POINT_MACHINE, FUTURE_MACHINE] as const)(
    'rejects an approved, unpublished item with a note',
    (machine) => {
      expect(transition(machine, 'approved', 'reject', reviewer, 'Akce se nekonala.')).toEqual({
        ok: true,
        to: 'rejected',
      });
      expect(transition(machine, 'approved', 'reject', reviewer)).toMatchObject({
        reason: 'note-required',
      });
      expect(transition(machine, 'approved', 'reject', author).ok).toBe(false);
    },
  );

  it('cannot reject what is already published', () => {
    expect(transition(POINT_MACHINE, 'published', 'reject', headmaster, 'x').ok).toBe(false);
  });
});

describe('future item lifecycle', () => {
  it.each([
    ['draft', 'submit', author, 'submitted'],
    ['returned', 'submit', author, 'submitted'],
    ['submitted', 'retract', author, 'draft'],
    ['submitted', 'withdraw', author, 'withdrawn'],
    ['submitted', 'approve', reviewer, 'approved'],
    ['submitted', 'approve', user('headmaster', true), 'approved'],
  ] as const)('%s --%s--> %s', (from, event, actor, to) => {
    expect(transition(FUTURE_MACHINE, from, event, actor)).toEqual({ ok: true, to });
  });

  it('keeps reviewers from approving their own items', () => {
    expect(
      transition(FUTURE_MACHINE, 'submitted', 'approve', user('reviewer', true)),
    ).toMatchObject({
      reason: 'not-allowed',
    });
  });

  it('requires a note to reject; a return names parts or a note, as the contract checks (ADR 0058)', () => {
    expect(transition(FUTURE_MACHINE, 'submitted', 'return', reviewer)).toEqual({
      ok: true,
      to: 'returned',
    });
    expect(transition(FUTURE_MACHINE, 'submitted', 'reject', reviewer)).toMatchObject({
      reason: 'note-required',
    });
  });

  it.each([
    ['approved', author, true, true],
    ['draft', author, true, false],
    ['submitted', author, false, false],
    ['approved', user('reviewer', true), true, true],
    ['submitted', reviewer, true, false],
    ['approved', reviewer, true, false],
    ['cancelled', reviewer, false, false],
  ] as const)(
    'editing a %s item as %o: allowed %s, back to review %s',
    (state, actor, allowed, review) => {
      expect(canEditFuture(state, actor)).toBe(allowed);
      expect(futureEditNeedsReview(state, actor)).toBe(review);
    },
  );
});

describe('future items', () => {
  it('sends an author’s change to an approved item back to review', () => {
    expect(transition(FUTURE_MACHINE, 'approved', 'revise', author)).toEqual({
      ok: true,
      to: 'submitted',
    });
    expect(transition(FUTURE_MACHINE, 'approved', 'revise', reviewer).ok).toBe(false);
  });

  it('lets the author or a reviewer cancel an approved item', () => {
    expect(transition(FUTURE_MACHINE, 'approved', 'cancel', author).ok).toBe(true);
    expect(transition(FUTURE_MACHINE, 'approved', 'cancel', reviewer).ok).toBe(true);
    expect(transition(FUTURE_MACHINE, 'approved', 'cancel', user('submitter')).ok).toBe(false);
  });

  it('prompts for a report, then records it as written, and offers no way out of it', () => {
    expect(transition(REPORT_MACHINE, 'none', 'prompt', SYSTEM)).toEqual({
      ok: true,
      to: 'prompted',
    });
    expect(transition(REPORT_MACHINE, 'prompted', 'prompt', SYSTEM)).toEqual({
      ok: true,
      to: 'prompted',
    });
    expect(transition(REPORT_MACHINE, 'prompted', 'write', author)).toEqual({
      ok: true,
      to: 'written',
    });
    expect(Object.keys(REPORT_MACHINE).sort()).toEqual(['miss', 'prompt', 'write']);
  });

  it.each(['none', 'prompted', 'written'] as const)(
    'lets only the system close a %s report as missed, and nobody reopens it (ADR 0049)',
    (from) => {
      expect(transition(REPORT_MACHINE, from, 'miss', SYSTEM)).toEqual({ ok: true, to: 'missed' });
      expect(transition(REPORT_MACHINE, from, 'miss', author).ok).toBe(false);
      expect(transition(REPORT_MACHINE, from, 'miss', headmaster).ok).toBe(false);
    },
  );

  it('offers no event from missed', () => {
    for (const actor of [SYSTEM, author, reviewer, headmaster]) {
      expect(availableEvents(REPORT_MACHINE, 'missed', actor)).toEqual([]);
    }
  });
});

describe('wasApproved (ADR 0057)', () => {
  const ev = (fromState: FutureState, toState: FutureState) => ({ fromState, toState });

  it('holds once the history moved into or out of approved', () => {
    expect(wasApproved([ev('draft', 'submitted'), ev('submitted', 'approved')])).toBe(true);
    expect(wasApproved([ev('approved', 'submitted')])).toBe(true);
    expect(wasApproved([ev('approved', 'returned')])).toBe(true);
  });

  it('does not hold for an item never approved', () => {
    expect(wasApproved([])).toBe(false);
    expect(
      wasApproved([
        ev('draft', 'submitted'),
        ev('submitted', 'returned'),
        ev('returned', 'submitted'),
      ]),
    ).toBe(false);
  });
});

describe('issues', () => {
  it('lets only the headmaster generate, and reopen', () => {
    expect(availableEvents(ISSUE_MACHINE, 'open', headmaster)).toEqual(['generate']);
    expect(availableEvents(ISSUE_MACHINE, 'generated', headmaster)).toEqual(['reopen']);
    expect(availableEvents(ISSUE_MACHINE, 'open', reviewer)).toEqual([]);
  });
});

describe('access requests', () => {
  it("lists exactly the machine's events and states", () => {
    expect([...ACCESS_EVENTS].sort()).toEqual(Object.keys(ACCESS_MACHINE).sort());
    const used = Object.values(ACCESS_MACHINE).flatMap((t) => [...t.from, t.to]);
    expect([...ACCESS_STATES].sort()).toEqual([...new Set(used)].sort());
  });

  const requester = user('pending', true);
  it('is decided by the headmaster and cancelled only by the requester', () => {
    expect(availableEvents(ACCESS_MACHINE, 'pending', headmaster)).toEqual([
      'approve',
      'reject',
      'block',
    ]);
    expect(availableEvents(ACCESS_MACHINE, 'pending', requester)).toEqual(['cancel']);
    expect(availableEvents(ACCESS_MACHINE, 'pending', reviewer)).toEqual([]);
    expect(transition(ACCESS_MACHINE, 'rejected', 'block', headmaster)).toEqual({
      ok: true,
      to: 'blocked',
    });
  });
});

describe('reportDue', () => {
  const akce = { kind: 'akce', state: 'approved', reportState: 'none' } as const;
  const lastDay = calDate(2026, 11, 11);
  const endsAt = (time = '20:00') => wallClockToInstant(lastDay, parseWallTime(time));
  /** A Prague wall-clock instant, 11 November (CET). */
  const at = (day: number, time: string) =>
    wallClockToInstant(calDate(2026, 11, day), parseWallTime(time));

  it('is owed from 20.00 of the last day without an end time, not before', () => {
    const facts = { ...akce, endsAt: endsAt() };
    expect(reportDue(facts, at(10, '21:00'))).toBe(false);
    expect(reportDue(facts, at(11, '19:59'))).toBe(false);
    expect(reportDue(facts, at(11, '20:00'))).toBe(true);
    expect(reportDue(facts, at(11, '23:59'))).toBe(true);
    expect(reportDue(facts, at(12, '8:00'))).toBe(true);
    expect(reportDue(facts, new Date(at(12, '8:00').getTime() + 100 * 86_400_000))).toBe(true);
  });

  it('is owed from the end time of the last day when it has one', () => {
    const facts = { ...akce, endsAt: endsAt('14:30') };
    expect(reportDue(facts, at(11, '14:29'))).toBe(false);
    expect(reportDue(facts, at(11, '14:30'))).toBe(true);
  });

  it('stays due while the author was prompted', () => {
    expect(reportDue({ ...akce, reportState: 'prompted', endsAt: endsAt() }, at(12, '8:00'))).toBe(
      true,
    );
  });

  it.each([
    ['written', { reportState: 'written' }],
    ['missed', { reportState: 'missed' }],
    ['a jednání', { kind: 'jednani' }],
    ['draft', { state: 'draft' }],
    ['submitted', { state: 'submitted' }],
    ['cancelled', { state: 'cancelled' }],
  ] as const)('is not due when %s', (_name, over) => {
    expect(reportDue({ ...akce, ...over, endsAt: endsAt() }, at(30, '8:00'))).toBe(false);
  });
});
