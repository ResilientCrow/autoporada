import { describe, expect, it } from 'vitest';

import type { IssueStatus } from '@/domain/review';
import { addDays, parseIsoDate as d, toIsoDate, type CalDate } from '@/domain/time';

import {
  deadline,
  DEFAULT_DEADLINE as RULE,
  PLACEMENT_WEEKS,
  placementMonday,
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
  const NOW = new Date('2026-10-14T10:00:00Z'); // submit Monday 2026-10-19

  it('gives an approved point its earliest Monday when it is open', () => {
    expect(iso(placementMonday(d('2026-10-19'), NOW, RULE, [], true))).toBe('2026-10-19');
  });

  it('moves an approved point past skipped and generated Mondays', () => {
    const list = [
      known('2026-10-19', 'skipped'),
      known('2026-10-26', 'generated'),
      known('2026-11-02', 'skipped'),
    ];
    expect(iso(placementMonday(d('2026-10-19'), NOW, RULE, list, true))).toBe('2026-11-09');
  });

  it('treats an open known issue and an unknown Monday alike', () => {
    expect(
      iso(placementMonday(d('2026-10-19'), NOW, RULE, [known('2026-10-19', 'open')], true)),
    ).toBe('2026-10-19');
  });

  it('does not push an approved point forward to the submit Monday', () => {
    // Wednesday 2026-10-14, the porada of Monday 2026-10-19 is still ahead; submit Monday 2026-10-19.
    const ahead = new Date('2026-10-14T10:00:00Z');
    // Friday 2026-10-16 after the Thursday deadline: submit Monday 2026-10-26.
    const afterDeadline = new Date('2026-10-16T10:00:00Z');
    expect(iso(placementMonday(d('2026-10-19'), ahead, RULE, [], true))).toBe('2026-10-19');
    expect(iso(placementMonday(d('2026-10-19'), afterDeadline, RULE, [], true))).toBe('2026-10-19');
  });

  describe('an approved point never lands on a porada that is over', () => {
    it('moves a past earliest Monday to the next Monday', () => {
      // Tuesday 2026-10-27, approved for Monday 2026-10-19.
      const tuesday = new Date('2026-10-27T10:00:00Z');
      expect(iso(placementMonday(d('2026-10-19'), tuesday, RULE, [], true))).toBe('2026-11-02');
    });

    it('keeps today when today is the Monday of the earliest Monday', () => {
      const monday = new Date('2026-10-26T10:00:00Z');
      expect(iso(placementMonday(d('2026-10-26'), monday, RULE, [], true))).toBe('2026-10-26');
      expect(iso(placementMonday(d('2026-10-19'), monday, RULE, [], true))).toBe('2026-10-26');
    });

    it('measures today in Prague: Sunday 23:30 UTC already is the Monday', () => {
      const lateSunday = new Date('2026-10-25T23:30:00Z'); // Monday 2026-10-26 00:30 Prague
      expect(iso(placementMonday(d('2026-10-19'), lateSunday, RULE, [], true))).toBe('2026-10-26');
    });

    it('leaves an earliest Monday in the future as it is', () => {
      const tuesday = new Date('2026-10-27T10:00:00Z');
      expect(iso(placementMonday(d('2026-11-16'), tuesday, RULE, [], true))).toBe('2026-11-16');
    });

    it('goes on past skipped and generated Mondays after the clamp', () => {
      const tuesday = new Date('2026-10-27T10:00:00Z');
      const list = [
        known('2026-10-19', 'open'),
        known('2026-11-02', 'skipped'),
        known('2026-11-09', 'generated'),
      ];
      expect(iso(placementMonday(d('2026-10-19'), tuesday, RULE, list, true))).toBe('2026-11-16');
    });

    it('does not count a past Monday that is still open against the 26 weeks', () => {
      const tuesday = new Date('2026-10-27T10:00:00Z');
      const blocked = Array.from({ length: 25 }, (_, week) =>
        known(toIsoDate(addDays(d('2026-11-02'), 7 * week)), 'skipped'),
      );
      expect(iso(placementMonday(d('2026-10-19'), tuesday, RULE, blocked, true))).toBe(
        '2027-04-26',
      );
    });
  });

  it('holds a waiting point back to the submit Monday', () => {
    const later = new Date('2026-11-10T10:00:00Z');
    expect(iso(placementMonday(d('2026-10-19'), later, RULE, [], false))).toBe('2026-11-16');
  });

  it('keeps a waiting point on a later earliest Monday', () => {
    expect(iso(placementMonday(d('2026-11-09'), NOW, RULE, [], false))).toBe('2026-11-09');
  });

  it('skips Mondays for a waiting point from the later of earliest and submit Monday', () => {
    const list = [known('2026-10-19', 'skipped'), known('2026-10-26', 'skipped')];
    expect(iso(placementMonday(d('2026-10-12'), NOW, RULE, list, false))).toBe('2026-11-02');
  });

  it('uses the frozen deadline of a known issue to find the submit Monday', () => {
    const early = known('2026-10-19', 'open', '2026-10-13T10:00:00Z');
    expect(iso(placementMonday(d('2026-10-12'), NOW, RULE, [early], false))).toBe('2026-10-26');
  });

  it('keeps a waiting point on a Monday whose frozen deadline is later than the computed one', () => {
    const now = new Date('2026-10-18T17:00:00Z'); // computed deadline 16:00Z has passed
    const late = known('2026-10-19', 'open', '2026-10-18T20:00:00Z');
    expect(iso(placementMonday(d('2026-10-12'), now, RULE, [], false))).toBe('2026-10-26');
    expect(iso(placementMonday(d('2026-10-12'), now, RULE, [late], false))).toBe('2026-10-19');
  });

  it('follows a late submit across the autumn DST change', () => {
    const after = new Date('2026-10-25T17:00:00Z');
    expect(iso(placementMonday(d('2026-10-19'), after, RULE, [], false))).toBe('2026-11-02');
    // The porada of Monday 2026-10-19 is over by then: an approved point goes to the next one.
    expect(iso(placementMonday(d('2026-10-19'), after, RULE, [], true))).toBe('2026-10-26');
  });

  it('follows a late submit across the spring DST change', () => {
    const before = new Date('2027-03-28T15:59:59Z');
    const after = new Date('2027-03-28T16:00:00Z');
    expect(iso(placementMonday(d('2027-03-22'), before, RULE, [], false))).toBe('2027-03-29');
    expect(iso(placementMonday(d('2027-03-22'), after, RULE, [], false))).toBe('2027-04-05');
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
      expect(iso(placementMonday(start, NOW, RULE, blocked(25), true))).toBe('2027-04-12');
    });

    it('gives null when all 26 Mondays are skipped or generated, even if the 27th is open', () => {
      expect(placementMonday(start, NOW, RULE, blocked(26), true)).toBeNull();
      expect(placementMonday(start, NOW, RULE, blocked(26), false)).toBeNull();
    });
  });

  it('refuses an earliest day that is not a Monday', () => {
    expect(() => placementMonday(d('2026-10-20'), NOW, RULE, [], true)).toThrow(RangeError);
  });
});
