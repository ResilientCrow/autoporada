import { describe, expect, it } from 'vitest';

import type { IssueStatus } from '@/domain/review';
import { instantToWallClock, parseIsoDate as d, toIsoDate, type CalDate } from '@/domain/time';

import {
  deadline,
  DEFAULT_DEADLINE as RULE,
  issueSlots,
  placementSlot,
  pointMonday,
  submitMonday,
  type IssueRow,
  type IssueSlot,
} from './index';

function known(monday: string, status: IssueStatus, deadlineAt?: string): IssueRow {
  const day = d(monday);
  return {
    monday: day,
    meetingDate: day,
    status,
    deadlineAt: deadlineAt ? new Date(deadlineAt) : deadline(day, RULE),
  };
}

const iso = (day: CalDate | null) => (day ? toIsoDate(day) : null);

/** The slots a caller reads at `now`: the rows and the virtual Mondays. */
const slotsAt = (now: Date, rows: readonly IssueRow[] = []): readonly IssueSlot[] =>
  issueSlots(rows, instantToWallClock(now).date, RULE);

describe('pointMonday', () => {
  // The deadline of Monday 2026-10-26 is Saturday 2026-10-24 20:00 Prague (18:00Z).
  const ON_TIME = new Date('2026-10-23T10:00:00Z');
  const LATE = new Date('2026-10-25T20:00:00Z');
  const today = (now: Date) => instantToWallClock(now).date;
  const place = (
    point: { earliest: CalDate; handIn: CalDate },
    now: Date,
    slots: readonly IssueSlot[] = slotsAt(now),
  ) => iso(pointMonday(point, today(now), slots));

  it('keeps a point handed in on time under its Monday while reviewers finish after the deadline', () => {
    expect(place({ earliest: d('2026-10-26'), handIn: d('2026-10-26') }, LATE)).toBe('2026-10-26');
  });

  it('puts a resubmit after the deadline of its earliest Monday on the Monday it was handed in for', () => {
    // First handed in for 2026-10-26, retracted or returned, handed in again Sunday 21.00 for 11-02.
    expect(place({ earliest: d('2026-10-26'), handIn: d('2026-11-02') }, LATE)).toBe('2026-11-02');
  });

  it('puts a resubmit on the meeting day itself on the Monday it was handed in for', () => {
    // Monday 2026-11-09 08:00 Prague: its deadline passed the evening before.
    const monday = new Date('2026-11-09T07:00:00Z');
    expect(place({ earliest: d('2026-10-26'), handIn: d('2026-11-16') }, monday)).toBe(
      '2026-11-16',
    );
  });

  it('goes on past skipped and generated Mondays after a late resubmit', () => {
    const list = [known('2026-11-02', 'skipped'), known('2026-11-09', 'generated')];
    const point = { earliest: d('2026-10-26'), handIn: d('2026-11-02') };
    expect(place(point, LATE, slotsAt(LATE, list))).toBe('2026-11-16');
  });

  it('honours a frozen later deadline: the Monday is still open', () => {
    const frozen = [known('2026-10-26', 'open', '2026-10-26T08:00:00Z')];
    const point = { earliest: d('2026-10-26'), handIn: d('2026-10-26') };
    expect(place(point, LATE, slotsAt(LATE, frozen))).toBe('2026-10-26');
  });

  it('moves a point still waiting on once its porada is over', () => {
    const tuesday = new Date('2026-10-27T10:00:00Z');
    const point = { earliest: d('2026-10-26'), handIn: d('2026-10-26') };
    expect(place(point, tuesday)).toBe('2026-11-02');
  });

  it('agrees with the line a point handed in now is promised: the submit Monday, placed', () => {
    const slots = slotsAt(LATE);
    const submit = submitMonday(LATE, slots, RULE);
    const promised = placementSlot(submit, today(LATE), slots)?.monday ?? null;
    expect(iso(submit)).toBe('2026-11-02');
    const point = { earliest: d('2026-10-19'), handIn: submit };
    expect(place(point, LATE)).toBe(iso(promised));
  });

  it('does not push a point forward to the submit Monday', () => {
    // Friday 2026-10-16: the submit Monday is 2026-10-19 until Saturday 20:00, then 2026-10-26.
    const point = { earliest: d('2026-10-19'), handIn: d('2026-10-19') };
    expect(place(point, new Date('2026-10-16T10:00:00Z'))).toBe('2026-10-19');
    expect(place(point, new Date('2026-10-18T19:00:00Z'))).toBe('2026-10-19');
  });

  it('treats an open stored slot and a Monday without a row alike', () => {
    const point = { earliest: d('2026-10-19'), handIn: d('2026-10-19') };
    const now = new Date('2026-10-14T10:00:00Z');
    expect(place(point, now, slotsAt(now, [known('2026-10-19', 'open')]))).toBe('2026-10-19');
    expect(place(point, now)).toBe('2026-10-19');
  });

  it('measures today in Prague: Sunday 23:30 UTC already is the Monday', () => {
    const lateSunday = new Date('2026-10-25T23:30:00Z'); // Monday 2026-10-26 00:30 Prague
    expect(place({ earliest: d('2026-10-19'), handIn: d('2026-10-19') }, lateSunday)).toBe(
      '2026-10-26',
    );
  });

  it('measures today in Prague across the spring DST change', () => {
    const beforeMidnight = new Date('2027-03-28T21:59:59Z'); // Sunday 23:59:59 CEST
    const afterMidnight = new Date('2027-03-28T22:00:00Z'); // Monday 00:00 CEST
    const point = { earliest: d('2027-03-22'), handIn: d('2027-03-22') };
    expect(place(point, beforeMidnight)).toBe('2027-03-29');
    expect(place(point, afterMidnight)).toBe('2027-03-29');
    expect(place({ earliest: d('2027-03-29'), handIn: d('2027-03-29') }, afterMidnight)).toBe(
      '2027-03-29',
    );
  });

  it('is null when no slot from its Monday on is open', () => {
    const now = new Date('2026-10-14T10:00:00Z');
    const first = d('2026-10-19');
    const rows = slotsAt(now).map((slot) => ({ ...slot, status: 'generated' as const }));
    expect(place({ earliest: first, handIn: first }, now, rows)).toBeNull();
  });

  it('steps over a skipped slot: the point waits for the slot after it', () => {
    const now = new Date('2026-10-18T10:00:00Z');
    const point = { earliest: d('2026-10-19'), handIn: d('2026-10-19') };
    expect(place(point, now, slotsAt(now, [known('2026-10-19', 'skipped')]))).toBe('2026-10-26');
  });

  it('places by the meeting date: a slot moved to a day that is over is passed', () => {
    // Slot 2026-10-26 meets on Friday 2026-10-30; on Saturday 2026-10-31 it is over.
    const saturday = new Date('2026-10-31T10:00:00Z');
    const rows = [{ ...known('2026-10-26', 'open'), meetingDate: d('2026-10-30') }];
    const slotsOf = (now: Date) => issueSlots(rows, today(now), RULE);
    const point = { earliest: d('2026-10-26'), handIn: d('2026-10-26') };
    expect(place(point, saturday, slotsOf(saturday))).toBe('2026-11-02');
    const friday = new Date('2026-10-30T10:00:00Z');
    expect(place(point, friday, slotsOf(friday))).toBe('2026-10-26');
  });

  it('refuses an earliest day that is not a Monday', () => {
    const point = { earliest: d('2026-10-20'), handIn: d('2026-10-26') };
    expect(() => place(point, ON_TIME)).toThrow(RangeError);
  });
});
