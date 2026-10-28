import { describe, expect, it } from 'vitest';

import type { IssueStatus } from '@/domain/review';
import { addDays, parseIsoDate as d, toIsoDate, type CalDate } from '@/domain/time';

import {
  deadline,
  DEFAULT_DEADLINE as RULE,
  PLACEMENT_WEEKS,
  placementMonday,
  pointMonday,
  submitMonday,
  targetMonday,
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

describe('submitMonday', () => {
  it('is the target Monday when no issue is known', () => {
    const now = new Date('2026-10-21T10:00:00Z');
    expect(iso(submitMonday(now, RULE, []))).toBe(iso(targetMonday(now, RULE)));
    expect(iso(submitMonday(now, RULE, []))).toBe('2026-10-26');
  });

  it('ignores skipped and generated issues', () => {
    const now = new Date('2026-10-14T10:00:00Z');
    const list = [known('2026-10-19', 'skipped'), known('2026-10-26', 'generated')];
    expect(iso(submitMonday(now, RULE, list))).toBe('2026-10-19');
  });

  it.each<IssueStatus>(['skipped', 'generated'])(
    'takes the frozen deadline of a %s issue too, whatever its status',
    (status) => {
      // Computed: Sunday 2026-10-18 18:00 Prague = 16:00Z. This row was frozen a day earlier.
      const now = new Date('2026-10-17T12:00:00Z');
      const frozen = known('2026-10-19', status, '2026-10-17T10:00:00Z');
      expect(iso(submitMonday(now, RULE, []))).toBe('2026-10-19');
      expect(iso(submitMonday(now, RULE, [frozen]))).toBe('2026-10-26');
    },
  );

  it('keeps a frozen deadline that is later than the computed one', () => {
    // Computed: Sunday 2026-10-18 18:00 Prague = 16:00Z. This row was frozen at 20:00Z.
    const now = new Date('2026-10-18T17:00:00Z');
    const late = known('2026-10-19', 'open', '2026-10-18T20:00:00Z');
    expect(iso(submitMonday(now, RULE, []))).toBe('2026-10-26');
    expect(iso(submitMonday(now, RULE, [late]))).toBe('2026-10-19');
  });

  it('takes the frozen deadline of a known issue over the computed one', () => {
    // Computed: Sunday 2026-10-18 18:00 Prague = 16:00Z. This row was frozen a day earlier.
    const now = new Date('2026-10-17T12:00:00Z');
    const early = known('2026-10-19', 'open', '2026-10-17T10:00:00Z');
    expect(iso(submitMonday(now, RULE, []))).toBe('2026-10-19');
    expect(iso(submitMonday(now, RULE, [early]))).toBe('2026-10-26');
  });

  it('falls back to the computed deadline for Mondays without a row', () => {
    const now = new Date('2026-10-17T12:00:00Z');
    const later = known('2026-10-26', 'open');
    const early = known('2026-10-19', 'open', '2026-10-17T10:00:00Z');
    expect(iso(submitMonday(now, RULE, [early, later]))).toBe('2026-10-26');
    expect(
      iso(submitMonday(now, RULE, [early, known('2026-10-26', 'open', '2026-10-17T11:00:00Z')])),
    ).toBe('2026-11-02');
  });

  it('takes an earlier frozen deadline on the DST Sunday as stored', () => {
    // Computed: Sunday 2026-10-25 18:00 Prague = 17:00Z. This row was frozen an hour earlier.
    const early = known('2026-10-26', 'open', '2026-10-25T16:00:00Z');
    const now = new Date('2026-10-25T16:30:00Z');
    expect(iso(submitMonday(now, RULE, []))).toBe('2026-10-26');
    expect(iso(submitMonday(now, RULE, [early]))).toBe('2026-11-02');
  });

  it.each([
    ['2026-10-24T23:00:00Z', '2026-10-26'],
    ['2026-10-25T16:59:59Z', '2026-10-26'],
    ['2026-10-25T17:00:00Z', '2026-11-02'],
    ['2026-10-25T23:59:59Z', '2026-11-02'],
    ['2027-03-27T23:00:00Z', '2027-03-29'],
    ['2027-03-28T15:59:59Z', '2027-03-29'],
    ['2027-03-28T16:00:00Z', '2027-04-05'],
    ['2027-03-28T22:00:00Z', '2027-04-05'],
  ])('at %s the submit Monday is %s (Europe/Prague DST changes)', (now, monday) => {
    expect(iso(submitMonday(new Date(now), RULE, []))).toBe(monday);
  });

  it('reads a frozen deadline that differs from the computed one across the DST changes', () => {
    // Computed: 17:00Z (autumn) and 16:00Z (spring). These rows were frozen an hour later.
    const autumn = known('2026-10-26', 'open', '2026-10-25T18:00:00Z');
    const spring = known('2027-03-29', 'open', '2027-03-28T17:00:00Z');
    const autumnNow = new Date('2026-10-25T17:30:00Z');
    const springNow = new Date('2027-03-28T16:30:00Z');
    expect(iso(submitMonday(autumnNow, RULE, []))).toBe('2026-11-02');
    expect(iso(submitMonday(autumnNow, RULE, [autumn]))).toBe('2026-10-26');
    expect(iso(submitMonday(springNow, RULE, []))).toBe('2027-04-05');
    expect(iso(submitMonday(springNow, RULE, [spring]))).toBe('2027-03-29');
  });

  it('uses a frozen deadline on each side of the DST changes', () => {
    const autumn = known('2026-10-26', 'open', '2026-10-25T17:00:00Z');
    const spring = known('2027-03-29', 'open', '2027-03-28T16:00:00Z');
    expect(iso(submitMonday(new Date('2026-10-25T16:59:59Z'), RULE, [autumn]))).toBe('2026-10-26');
    expect(iso(submitMonday(new Date('2026-10-25T17:00:00Z'), RULE, [autumn]))).toBe('2026-11-02');
    expect(iso(submitMonday(new Date('2027-03-28T15:59:59Z'), RULE, [spring]))).toBe('2027-03-29');
    expect(iso(submitMonday(new Date('2027-03-28T16:00:00Z'), RULE, [spring]))).toBe('2027-04-05');
  });
});

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
      const late = submitMonday(AFTER_DEADLINE, RULE, []);
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
    expect(iso(pointMonday(point, RULE, LATE, []))).toBe('2026-10-26');
  });

  it('puts a resubmit after the deadline of its earliest Monday on the next open one', () => {
    // First handed in for 2026-10-26, retracted or returned, handed in again Sunday 21.00.
    const point = { earliest: d('2026-10-26'), submittedAt: LATE };
    expect(iso(pointMonday(point, RULE, LATE, []))).toBe('2026-11-02');
  });

  it('puts a resubmit on the meeting day itself on the next open Monday, not on that day', () => {
    // Monday 2026-11-09 08:00 Prague: its deadline passed the evening before.
    const monday = new Date('2026-11-09T07:00:00Z');
    const point = { earliest: d('2026-10-26'), submittedAt: monday };
    expect(iso(pointMonday(point, RULE, monday, []))).toBe('2026-11-16');
  });

  it('goes on past skipped and generated Mondays after a late resubmit', () => {
    const point = { earliest: d('2026-10-26'), submittedAt: LATE };
    const list = [known('2026-11-02', 'skipped'), known('2026-11-09', 'generated')];
    expect(iso(pointMonday(point, RULE, LATE, list))).toBe('2026-11-16');
  });

  it('honours a frozen later deadline: the Monday is still open for a resubmit', () => {
    const frozen = [known('2026-10-26', 'open', '2026-10-26T08:00:00Z')];
    const point = { earliest: d('2026-10-26'), submittedAt: LATE };
    expect(iso(pointMonday(point, RULE, LATE, frozen))).toBe('2026-10-26');
  });

  it('moves a point still waiting on once its porada is over, as placementMonday does', () => {
    const tuesday = new Date('2026-10-27T10:00:00Z');
    const point = { earliest: d('2026-10-26'), submittedAt: ON_TIME };
    expect(iso(pointMonday(point, RULE, tuesday, []))).toBe('2026-11-02');
  });

  it('agrees with the line a point handed in now is promised: the submit Monday, placed', () => {
    const point = { earliest: d('2026-10-19'), submittedAt: LATE };
    const promised = placementMonday(submitMonday(LATE, RULE, []), LATE, []);
    expect(iso(pointMonday(point, RULE, LATE, []))).toBe(iso(promised));
  });

  it('refuses an earliest day that is not a Monday', () => {
    const point = { earliest: d('2026-10-20'), submittedAt: ON_TIME };
    expect(() => pointMonday(point, RULE, ON_TIME, [])).toThrow(RangeError);
  });
});
