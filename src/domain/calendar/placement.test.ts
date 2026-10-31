import { describe, expect, it } from 'vitest';

import type { IssueStatus } from '@/domain/review';
import {
  addDays,
  instantToWallClock,
  parseIsoDate as d,
  toIsoDate,
  type CalDate,
} from '@/domain/time';

import {
  deadline,
  DEFAULT_DEADLINE as RULE,
  issueSlots,
  PLACEMENT_WEEKS,
  placementMonday,
  pointMonday,
  targetMonday,
  type IssueSlot,
  type KnownIssue,
} from './index';

function known(monday: string, status: IssueStatus, deadlineAt?: string): KnownIssue {
  const day = d(monday);
  return {
    monday: day,
    status,
    deadlineAt: deadlineAt ? new Date(deadlineAt) : deadline(day, RULE),
  };
}

const iso = (day: CalDate | null) => (day ? toIsoDate(day) : null);

/** The slots a caller reads at `now`: the rows and the virtual Mondays. */
const slotsAt = (now: Date, rows: readonly KnownIssue[] = []): readonly IssueSlot[] =>
  issueSlots(
    rows.map((row) => ({ ...row, meetingDate: row.monday })),
    instantToWallClock(now).date,
    RULE,
  );

describe('placementMonday', () => {
  const NOW = new Date('2026-10-14T10:00:00Z'); // Wednesday; submit Monday 2026-10-19

  it('gives a point its earliest Monday when it is open', () => {
    expect(iso(placementMonday(d('2026-10-19'), NOW, []))).toBe('2026-10-19');
  });

  it('moves a point past skipped and generated Mondays', () => {
    const list = [
      known('2026-10-19', 'skipped'),
      known('2026-10-26', 'generated'),
      known('2026-11-02', 'skipped'),
    ];
    expect(iso(placementMonday(d('2026-10-19'), NOW, list))).toBe('2026-11-09');
  });

  it('treats an open known issue and an unknown Monday alike', () => {
    expect(iso(placementMonday(d('2026-10-19'), NOW, [known('2026-10-19', 'open')]))).toBe(
      '2026-10-19',
    );
  });

  it('keeps a later earliest Monday', () => {
    expect(iso(placementMonday(d('2026-11-09'), NOW, []))).toBe('2026-11-09');
  });

  describe('a point waiting for review keeps its Monday until that porada is over', () => {
    // Sunday 2026-10-25 21:00 Prague: the deadline of Monday 2026-10-26 (18:00) has passed.
    const AFTER_DEADLINE = new Date('2026-10-25T20:00:00Z');

    it('keeps a point handed in on time under its Monday while reviewers finish the issue', () => {
      expect(iso(placementMonday(d('2026-10-26'), AFTER_DEADLINE, []))).toBe('2026-10-26');
    });

    it('does not push a point forward to the submit Monday', () => {
      // Friday 2026-10-16: the submit Monday is 2026-10-19 until Sunday evening, then 2026-10-26.
      expect(iso(placementMonday(d('2026-10-19'), new Date('2026-10-16T10:00:00Z'), []))).toBe(
        '2026-10-19',
      );
      expect(iso(placementMonday(d('2026-10-19'), new Date('2026-10-18T19:00:00Z'), []))).toBe(
        '2026-10-19',
      );
    });

    it('shows a start Monday that is already the next one there', () => {
      const late = targetMonday(AFTER_DEADLINE, RULE);
      expect(iso(late)).toBe('2026-11-02');
      expect(iso(placementMonday(late, AFTER_DEADLINE, []))).toBe('2026-11-02');
    });
  });

  describe('a point never lands on a porada that is over', () => {
    it('moves a past earliest Monday to the next Monday', () => {
      // Tuesday 2026-10-27, handed in for Monday 2026-10-26 or earlier.
      const tuesday = new Date('2026-10-27T10:00:00Z');
      expect(iso(placementMonday(d('2026-10-26'), tuesday, []))).toBe('2026-11-02');
      expect(iso(placementMonday(d('2026-10-19'), tuesday, []))).toBe('2026-11-02');
    });

    it('keeps today when today is the earliest Monday', () => {
      const monday = new Date('2026-10-26T10:00:00Z');
      expect(iso(placementMonday(d('2026-10-26'), monday, []))).toBe('2026-10-26');
      expect(iso(placementMonday(d('2026-10-19'), monday, []))).toBe('2026-10-26');
    });

    it('measures today in Prague: Sunday 23:30 UTC already is the Monday', () => {
      const lateSunday = new Date('2026-10-25T23:30:00Z'); // Monday 2026-10-26 00:30 Prague
      expect(iso(placementMonday(d('2026-10-19'), lateSunday, []))).toBe('2026-10-26');
    });

    it('measures today in Prague across the spring DST change', () => {
      const beforeMidnight = new Date('2027-03-28T21:59:59Z'); // Sunday 23:59:59 CEST
      const afterMidnight = new Date('2027-03-28T22:00:00Z'); // Monday 00:00 CEST
      expect(iso(placementMonday(d('2027-03-22'), beforeMidnight, []))).toBe('2027-03-29');
      expect(iso(placementMonday(d('2027-03-22'), afterMidnight, []))).toBe('2027-03-29');
      expect(iso(placementMonday(d('2027-03-29'), afterMidnight, []))).toBe('2027-03-29');
    });

    it('leaves an earliest Monday in the future as it is', () => {
      const tuesday = new Date('2026-10-27T10:00:00Z');
      expect(iso(placementMonday(d('2026-11-16'), tuesday, []))).toBe('2026-11-16');
    });

    it('goes on past skipped and generated Mondays after the clamp', () => {
      const tuesday = new Date('2026-10-27T10:00:00Z');
      const list = [
        known('2026-10-19', 'open'),
        known('2026-11-02', 'skipped'),
        known('2026-11-09', 'generated'),
      ];
      expect(iso(placementMonday(d('2026-10-19'), tuesday, list))).toBe('2026-11-16');
    });

    it('does not count a past Monday that is still open against the 26 weeks', () => {
      const tuesday = new Date('2026-10-27T10:00:00Z');
      const blocked = Array.from({ length: 25 }, (_, week) =>
        known(toIsoDate(addDays(d('2026-11-02'), 7 * week)), 'skipped'),
      );
      expect(iso(placementMonday(d('2026-10-19'), tuesday, blocked))).toBe('2027-04-26');
    });
  });

  describe('26-week bound', () => {
    const start = d('2026-10-19');
    // Skipped and generated Mondays alternate; `count` Mondays from `start` are blocked.
    const blocked = (count: number) =>
      Array.from({ length: count }, (_, week) =>
        known(toIsoDate(addDays(start, 7 * week)), week % 2 ? 'skipped' : 'generated'),
      );

    it('looks at 26 Mondays', () => {
      expect(PLACEMENT_WEEKS).toBe(26);
    });

    it('finds the 26th Monday when the 25 before it are blocked', () => {
      expect(iso(placementMonday(start, NOW, blocked(25)))).toBe('2027-04-12');
    });

    it('gives null when all 26 Mondays are skipped or generated, even if the 27th is open', () => {
      expect(placementMonday(start, NOW, blocked(26))).toBeNull();
    });
  });

  it('refuses an earliest day that is not a Monday', () => {
    expect(() => placementMonday(d('2026-10-20'), NOW, [])).toThrow(RangeError);
  });
});

describe('pointMonday', () => {
  // The deadline of Monday 2026-10-26 is Sunday 2026-10-25 18:00 Prague (16:00Z).
  const ON_TIME = new Date('2026-10-23T10:00:00Z');
  const LATE = new Date('2026-10-25T20:00:00Z');

  it('keeps a point handed in on time under its Monday while reviewers finish after the deadline', () => {
    const point = { earliest: d('2026-10-26'), submittedAt: ON_TIME };
    expect(iso(pointMonday(point, RULE, LATE, slotsAt(LATE)))).toBe('2026-10-26');
  });

  it('puts a resubmit after the deadline of its earliest Monday on the next open one', () => {
    // First handed in for 2026-10-26, retracted or returned, handed in again Sunday 21.00.
    const point = { earliest: d('2026-10-26'), submittedAt: LATE };
    expect(iso(pointMonday(point, RULE, LATE, slotsAt(LATE)))).toBe('2026-11-02');
  });

  it('puts a resubmit on the meeting day itself on the next open Monday, not on that day', () => {
    // Monday 2026-11-09 08:00 Prague: its deadline passed the evening before.
    const monday = new Date('2026-11-09T07:00:00Z');
    const point = { earliest: d('2026-10-26'), submittedAt: monday };
    expect(iso(pointMonday(point, RULE, monday, slotsAt(monday)))).toBe('2026-11-16');
  });

  it('goes on past skipped and generated Mondays after a late resubmit', () => {
    const point = { earliest: d('2026-10-26'), submittedAt: LATE };
    const list = [known('2026-11-02', 'skipped'), known('2026-11-09', 'generated')];
    expect(iso(pointMonday(point, RULE, LATE, slotsAt(LATE, list)))).toBe('2026-11-16');
  });

  it('honours a frozen later deadline: the Monday is still open for a resubmit', () => {
    const frozen = [known('2026-10-26', 'open', '2026-10-26T08:00:00Z')];
    const point = { earliest: d('2026-10-26'), submittedAt: LATE };
    expect(iso(pointMonday(point, RULE, LATE, slotsAt(LATE, frozen)))).toBe('2026-10-26');
  });

  it('moves a point still waiting on once its porada is over, as placementMonday does', () => {
    const tuesday = new Date('2026-10-27T10:00:00Z');
    const point = { earliest: d('2026-10-26'), submittedAt: ON_TIME };
    expect(iso(pointMonday(point, RULE, tuesday, slotsAt(tuesday)))).toBe('2026-11-02');
  });

  it('agrees with the line a point handed in now is promised: the submit Monday, placed', () => {
    const point = { earliest: d('2026-10-19'), submittedAt: LATE };
    const promised = placementMonday(targetMonday(LATE, RULE), LATE, []);
    expect(iso(pointMonday(point, RULE, LATE, slotsAt(LATE)))).toBe(iso(promised));
  });

  it('steps over a skipped slot at hand-in: the point waits for the slot it was promised', () => {
    // Sunday 2026-10-18, before 18.00: Monday 2026-10-19 is skipped, so the promise is 2026-10-26.
    const now = new Date('2026-10-18T10:00:00Z');
    const point = { earliest: d('2026-10-19'), submittedAt: now };
    expect(iso(pointMonday(point, RULE, now, slotsAt(now, [known('2026-10-19', 'skipped')])))).toBe(
      '2026-10-26',
    );
  });

  it('places by the meeting date: a slot moved to a day that is over is passed', () => {
    // Slot 2026-10-26 meets on Friday 2026-10-30; on Saturday 2026-10-31 it is over.
    const saturday = new Date('2026-10-31T10:00:00Z');
    const rows = [{ ...known('2026-10-26', 'open'), meetingDate: d('2026-10-30') }];
    const slots = issueSlots(rows, instantToWallClock(saturday).date, RULE);
    const point = { earliest: d('2026-10-26'), submittedAt: ON_TIME };
    expect(iso(pointMonday(point, RULE, saturday, slots))).toBe('2026-11-02');
    const friday = new Date('2026-10-30T10:00:00Z');
    const slotsFriday = issueSlots(rows, instantToWallClock(friday).date, RULE);
    expect(iso(pointMonday(point, RULE, friday, slotsFriday))).toBe('2026-10-26');
  });

  it('refuses an earliest day that is not a Monday', () => {
    const point = { earliest: d('2026-10-20'), submittedAt: ON_TIME };
    expect(() => pointMonday(point, RULE, ON_TIME, slotsAt(ON_TIME))).toThrow(RangeError);
  });
});
