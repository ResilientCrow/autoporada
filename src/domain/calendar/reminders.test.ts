import { describe, expect, it } from 'vitest';

import { calDate, compareDates, parseIsoDate, toIsoDate } from '@/domain/time';

import {
  REMINDER_STAGGER_MS,
  REPORT_LOOKBACK_WEEKS,
  deadline,
  owedPorada,
  reminderDue,
  reminderSlot,
  reminderStagger,
  reportLookback,
  reportsSince,
  type IssueRow,
} from './index';

/** Saturday 24 October 2026 20.00 Prague (the night before the clocks go back): the default deadline of Monday 26 October. */
const DEADLINE = new Date('2026-10-24T18:00:00Z');
const HOUR = 3_600_000;

describe('reminderSlot', () => {
  it('puts the soft reminder two days before the deadline at 13.00 and the hard one on the day at 12.00', () => {
    expect(reminderSlot('soft', DEADLINE)).toEqual(new Date('2026-10-22T11:00:00Z'));
    expect(reminderSlot('hard', DEADLINE)).toEqual(new Date('2026-10-24T10:00:00Z'));
  });

  it.each([
    [
      '2026-10-27',
      '2026-10-23T11:00:00Z',
      '2026-10-25T11:00:00Z',
      'the clocks go back on its deadline day',
    ],
    [
      '2027-03-30',
      '2027-03-26T12:00:00Z',
      '2027-03-28T10:00:00Z',
      'the clocks go forward on its deadline day',
    ],
  ])('puts the slots of the meeting on %s at %s and %s: %s', (meeting, softAt, hardAt) => {
    const closes = deadline(parseIsoDate(meeting));
    expect(reminderSlot('soft', closes)).toEqual(new Date(softAt));
    expect(reminderSlot('hard', closes)).toEqual(new Date(hardAt));
  });

  it.each(['2026-10-26', '2026-10-27', '2027-03-29', '2027-03-30'])(
    'opens both reminders before the default deadline of the meeting on %s, the DST weekends included',
    (meeting) => {
      const closes = deadline(parseIsoDate(meeting));
      expect(reminderSlot('soft', closes).getTime()).toBeLessThan(
        reminderSlot('hard', closes).getTime(),
      );
      expect(reminderSlot('hard', closes).getTime()).toBeLessThan(closes.getTime());
      expect(reminderDue('soft', closes, reminderSlot('soft', closes))).toBe(true);
      expect(reminderDue('hard', closes, reminderSlot('hard', closes))).toBe(true);
    },
  );

  it('counts the Prague day of a deadline that falls just after midnight', () => {
    const late = new Date('2026-10-25T23:30:00Z');
    expect(reminderSlot('hard', late)).toEqual(new Date('2026-10-26T11:00:00Z'));
  });
});

describe('reminderDue', () => {
  const slot = reminderSlot('soft', DEADLINE);

  it('opens at the slot and closes six hours later', () => {
    expect(reminderDue('soft', DEADLINE, new Date(slot.getTime() - 1))).toBe(false);
    expect(reminderDue('soft', DEADLINE, slot)).toBe(true);
    expect(reminderDue('soft', DEADLINE, new Date(slot.getTime() + 6 * HOUR - 1))).toBe(true);
    expect(reminderDue('soft', DEADLINE, new Date(slot.getTime() + 6 * HOUR))).toBe(false);
  });

  it('closes at the deadline when that comes first', () => {
    // The hard slot is 12.00; the deadline is 20.00, eight hours on, so make it earlier: 14.00.
    const early = new Date('2026-10-24T12:00:00Z');
    expect(reminderDue('hard', early, new Date('2026-10-24T11:59:59Z'))).toBe(true);
    expect(reminderDue('hard', early, early)).toBe(false);
  });

  it('never opens for a deadline at or before its own slot', () => {
    const morning = new Date('2026-10-24T08:00:00Z');
    expect(reminderDue('hard', morning, morning)).toBe(false);
    expect(reminderDue('hard', morning, new Date('2026-10-24T07:00:00Z'))).toBe(false);
  });
});

describe('reminderStagger', () => {
  it('is the same for the same recipient and within 30 minutes', () => {
    const ids = ['a', 'b', '0198f3a2-7c1e-7b52-9d4a-5e6f70812345', ''];
    for (const id of ids) {
      expect(reminderStagger(id)).toBe(reminderStagger(id));
      expect(reminderStagger(id)).toBeGreaterThanOrEqual(0);
      expect(reminderStagger(id)).toBeLessThan(REMINDER_STAGGER_MS);
    }
  });

  it('spreads recipients over the half hour', () => {
    const offsets = new Set(Array.from({ length: 60 }, (_, i) => reminderStagger(`user-${i}`)));
    expect(offsets.size).toBeGreaterThan(30);
  });
});

describe('reportsSince (the akce whose report goes to a porada)', () => {
  const MONDAY = calDate(2026, 10, 26);
  const row = (
    monday: string,
    status: IssueRow['status'] = 'open',
    meeting = monday,
  ): IssueRow => ({
    monday: parseIsoDate(monday),
    meetingDate: parseIsoDate(meeting),
    deadlineAt: new Date(`${monday}T00:00:00Z`),
    status,
  });

  it('looks back over the Mondays before the porada, the week before included', () => {
    expect(reportLookback(MONDAY)).toEqual({
      from: calDate(2026, 8, 3),
      to: calDate(2026, 10, 19),
    });
    expect(REPORT_LOOKBACK_WEEKS).toBe(12);
  });

  it('starts on the meeting day of the porada a week before, which has no row', () => {
    expect(reportsSince(MONDAY, [])).toEqual(calDate(2026, 10, 19));
  });

  it('starts on that porada’s own meeting day when it was moved, and whatever its status but skipped', () => {
    expect(reportsSince(MONDAY, [row('2026-10-19', 'open', '2026-10-21')])).toEqual(
      calDate(2026, 10, 21),
    );
    expect(reportsSince(MONDAY, [row('2026-10-19', 'generated')])).toEqual(calDate(2026, 10, 19));
  });

  it('steps over skipped Mondays to the porada held before them', () => {
    const rows = [row('2026-10-12', 'skipped'), row('2026-10-19', 'skipped')];
    expect(reportsSince(MONDAY, rows)).toEqual(calDate(2026, 10, 5));
    expect(reportsSince(MONDAY, [...rows, row('2026-10-05', 'generated', '2026-10-06')])).toEqual(
      calDate(2026, 10, 6),
    );
  });

  it('ignores rows outside the look-back, and stops at its first Monday when all of it is skipped', () => {
    expect(reportsSince(MONDAY, [row('2026-10-26', 'open', '2026-10-27')])).toEqual(
      calDate(2026, 10, 19),
    );
    const all = Array.from({ length: REPORT_LOOKBACK_WEEKS }, (_, i) => {
      const day = new Date(Date.UTC(2026, 9, 19 - 7 * i));
      return row(day.toISOString().slice(0, 10), 'skipped');
    });
    expect(reportsSince(MONDAY, all)).toEqual(calDate(2026, 8, 3));
  });
});

describe('owedPorada (the porada an akce’s report goes to, ADR 0049)', () => {
  const row = (
    monday: string,
    status: IssueRow['status'] = 'open',
    meeting = monday,
  ): IssueRow => ({
    monday: parseIsoDate(monday),
    meetingDate: parseIsoDate(meeting),
    deadlineAt: new Date(`${monday}T00:00:00Z`),
    status,
  });

  it('is the next Monday for an akce in the middle of a week, with no rows', () => {
    // Wednesday 14 October 2026
    expect(owedPorada(calDate(2026, 10, 14), [])).toEqual(calDate(2026, 10, 19));
  });

  it('is the next Monday for an akce on a Monday, because the meeting must be after the last day', () => {
    expect(owedPorada(calDate(2026, 10, 12), [])).toEqual(calDate(2026, 10, 19));
  });

  it('is the next Monday for an akce on a Sunday', () => {
    expect(owedPorada(calDate(2026, 10, 18), [])).toEqual(calDate(2026, 10, 19));
  });

  it('keeps the porada held earlier in the akce’s own week when the akce ends after its meeting', () => {
    // 12 October's porada was moved to Wednesday 14; an akce ending Tuesday 13 still goes to it
    expect(owedPorada(calDate(2026, 10, 13), [row('2026-10-12', 'open', '2026-10-14')])).toEqual(
      calDate(2026, 10, 12),
    );
    expect(owedPorada(calDate(2026, 10, 14), [row('2026-10-12', 'open', '2026-10-14')])).toEqual(
      calDate(2026, 10, 19),
    );
  });

  it('steps over skipped Mondays and whatever status the porada has', () => {
    const rows = [row('2026-10-19', 'skipped'), row('2026-10-26', 'skipped')];
    expect(owedPorada(calDate(2026, 10, 14), rows)).toEqual(calDate(2026, 11, 2));
    expect(owedPorada(calDate(2026, 10, 14), [row('2026-10-19', 'generated')])).toEqual(
      calDate(2026, 10, 19),
    );
  });

  it('names a porada by its Monday even when it was moved', () => {
    expect(owedPorada(calDate(2026, 10, 21), [row('2026-10-19', 'open', '2026-10-22')])).toEqual(
      calDate(2026, 10, 19),
    );
  });

  it('finds a porada moved weeks past its Monday, as reportsSince does', () => {
    // 12 October's porada moved to 2 November: an akce ending 28 October still goes to it
    const moved = [row('2026-10-12', 'open', '2026-11-02')];
    expect(owedPorada(calDate(2026, 10, 28), moved)).toEqual(calDate(2026, 10, 12));
    expect(owedPorada(calDate(2026, 11, 2), moved)).toEqual(calDate(2026, 11, 9));
  });

  it.each([1, 2, 3, 5, REPORT_LOOKBACK_WEEKS - 1])(
    'names the first porada whose reportsSince window holds the last day, with a porada moved %i weeks',
    (weeks) => {
      const day = (offset: number) => {
        const d = new Date(Date.UTC(2026, 9, 12 + offset));
        return calDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      };
      const rows = [row('2026-10-12', 'open', toIsoDate(day(7 * weeks)))];
      const mondays = Array.from({ length: 2 * weeks + 30 }, (_, i) => day(7 * (i - 15)));
      for (let offset = -3; offset < 7 * (weeks + 3); offset++) {
        const lastDay = day(offset);
        const claiming = mondays.filter((monday) => {
          const porada = rows.find((r) => compareDates(r.monday, monday) === 0);
          if (porada?.status === 'skipped') return false;
          const since = reportsSince(
            monday,
            rows.filter((r) => compareDates(r.monday, monday) < 0),
          );
          return (
            compareDates(lastDay, since) >= 0 &&
            compareDates(lastDay, porada?.meetingDate ?? monday) < 0
          );
        });
        expect(claiming[0], toIsoDate(lastDay)).toEqual(owedPorada(lastDay, rows));
      }
    },
  );

  it('is the inverse of reportsSince: the akce of [since, meeting) go to that porada', () => {
    const rows = [
      row('2026-10-05', 'generated', '2026-10-06'),
      row('2026-10-12', 'skipped'),
      row('2026-10-19', 'open', '2026-10-21'),
      row('2026-10-26', 'skipped'),
      row('2026-11-02', 'open'),
    ];
    for (let offset = 0; offset < 40; offset++) {
      const day = new Date(Date.UTC(2026, 9, 1 + offset));
      const lastDay = calDate(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
      const owed = owedPorada(lastDay, rows);
      const porada = rows.find((r) => compareDates(r.monday, owed) === 0);
      expect(porada?.status).not.toBe('skipped');
      const meeting = porada?.meetingDate ?? owed;
      const since = reportsSince(
        owed,
        rows.filter((r) => compareDates(r.monday, owed) < 0),
      );
      expect(compareDates(lastDay, since)).toBeGreaterThanOrEqual(0);
      expect(compareDates(lastDay, meeting)).toBeLessThan(0);
    }
  });
});
