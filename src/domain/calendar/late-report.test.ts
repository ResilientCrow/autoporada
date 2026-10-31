import { describe, expect, it } from 'vitest';

import { parseIsoDate as d, parseWallTime as t, toIsoDate } from '@/domain/time';

import {
  deadline,
  DEFAULT_DEADLINE as RULE,
  eventEnd,
  handInMonday,
  isLateReport,
  issueSlots,
  lateFacts,
  reportCloses,
  type IssueSlot,
} from './index';

/** A porada held on `meeting` (a Monday unless said), the deadline counted back from it. */
const slot = (meeting: string, deadlineAt?: string): IssueSlot => ({
  monday: d(meeting),
  meetingDate: d(meeting),
  deadlineAt: deadlineAt ? new Date(deadlineAt) : deadline(d(meeting), RULE),
  status: 'open',
  stored: false,
});
const ends = (lastDay: string, timeTo: string | null = null) => ({
  lastDay: d(lastDay),
  timeTo: timeTo ? t(timeTo) : null,
});
const closes = (s: IssueSlot, lastDay: string, timeTo?: string) =>
  reportCloses(s, ends(lastDay, timeTo)).toISOString();

describe('eventEnd', () => {
  it('is the last day at its end time, or at 20.00 without one (Prague time)', () => {
    expect(eventEnd(ends('2026-11-01', '21:00')).toISOString()).toBe('2026-11-01T20:00:00.000Z');
    expect(eventEnd(ends('2026-11-01')).toISOString()).toBe('2026-11-01T19:00:00.000Z');
    expect(eventEnd(ends('2026-07-01')).toISOString()).toBe('2026-07-01T18:00:00.000Z');
  });
});

describe('reportCloses', () => {
  // Monday 2026-11-02, deadline Saturday 2026-10-31 20.00 (19:00Z), Prague on winter time.
  const monday = slot('2026-11-02');

  it.each([
    ['ends Sunday 21.00: Sunday 23.00', '2026-11-01', '21:00', '2026-11-01T22:00:00.000Z'],
    ['no end time on Sunday: 22.00', '2026-11-01', undefined, '2026-11-01T21:00:00.000Z'],
    ['ends Sunday 23.30: capped at 00.00', '2026-11-01', '23:30', '2026-11-01T23:00:00.000Z'],
    ['ends Saturday 18.30: 20.30', '2026-10-31', '18:30', '2026-10-31T19:30:00.000Z'],
    ['ends Saturday 21.00: 23.00', '2026-10-31', '21:00', '2026-10-31T22:00:00.000Z'],
    ['ends Friday 15.00: the deadline', '2026-10-30', '15:00', '2026-10-31T19:00:00.000Z'],
    ['ends on the meeting day: the deadline', '2026-11-02', '10:00', '2026-10-31T19:00:00.000Z'],
    [
      'ends after the meeting day: the deadline',
      '2026-11-03',
      undefined,
      '2026-10-31T19:00:00.000Z',
    ],
  ])('%s', (_name, lastDay, timeTo, expected) => {
    expect(closes(monday, lastDay, timeTo)).toBe(expected);
  });

  it('follows a moved porada’s own meeting date and deadline', () => {
    // Wednesday 2026-11-04 on the Monday 2026-11-02 slot, deadline Monday 2026-11-02 20.00.
    const moved: IssueSlot = {
      ...slot('2026-11-02'),
      meetingDate: d('2026-11-04'),
      deadlineAt: deadline(d('2026-11-04'), RULE),
    };
    expect(moved.deadlineAt.toISOString()).toBe('2026-11-02T19:00:00.000Z');
    expect(closes(moved, '2026-11-03', '18:00')).toBe('2026-11-03T19:00:00.000Z');
  });

  it('adds two absolute hours across the night summer time ends (2026-10-25)', () => {
    const next = slot('2026-10-26');
    // 01.30 summer time (23:30Z) + 2 h = 01:30Z, which is 02.30 on winter clocks.
    expect(closes(next, '2026-10-25', '01:30')).toBe('2026-10-25T01:30:00.000Z');
    // The cap is 00.00 wall time of Monday, 25 hours after Sunday 00.00.
    expect(closes(next, '2026-10-25', '23:30')).toBe('2026-10-25T23:00:00.000Z');
  });

  it('adds two absolute hours across the night summer time starts (2027-03-28)', () => {
    const next = slot('2027-03-29');
    // 00.30 winter time (23:30Z) + 2 h = 01:30Z, which is 03.30 on summer clocks.
    expect(closes(next, '2027-03-28', '00:30')).toBe('2027-03-28T01:30:00.000Z');
    // The cap is 00.00 wall time of Monday, 23 hours after Sunday 00.00.
    expect(closes(next, '2027-03-28', '23:30')).toBe('2027-03-28T22:00:00.000Z');
  });
});

describe('isLateReport', () => {
  const monday = slot('2026-11-02');
  it.each([
    ['Sunday 21.00', '2026-11-01', '21:00', true],
    ['Saturday 18.30', '2026-10-31', '18:30', true],
    ['Friday 15.00', '2026-10-30', '15:00', false],
    ['the meeting day', '2026-11-02', '10:00', false],
  ])('a report about an event ending %s is late: %s', (_name, lastDay, timeTo, late) => {
    expect(isLateReport(monday, ends(lastDay, timeTo))).toBe(late);
  });
});

describe('lateFacts', () => {
  const content = (eventDate: string | null, endDate: string | null, timeTo: string | null) => ({
    eventDate: eventDate ? d(eventDate) : null,
    endDate: endDate ? d(endDate) : null,
    timeTo: timeTo ? t(timeTo) : null,
  });

  it('takes the end date as the last day, else the event date', () => {
    expect(lateFacts(content('2026-11-01', '2026-11-03', '10:00'))).toEqual(
      ends('2026-11-03', '10:00'),
    );
    expect(lateFacts(content('2026-11-01', null, null))).toEqual(ends('2026-11-01'));
  });

  it('ignores an end date before the event date and says nothing without a date', () => {
    expect(lateFacts(content('2026-11-02', '2026-11-01', null))).toEqual(ends('2026-11-02'));
    expect(lateFacts(content(null, '2026-11-01', null))).toBeUndefined();
  });
});

describe('handInMonday', () => {
  const rows = issueSlots([], d('2026-10-28'), RULE);
  const at = (iso: string, report?: ReturnType<typeof ends>) =>
    toIsoDate(handInMonday(new Date(iso), rows, RULE, report));
  const sunday = ends('2026-11-01', '21:00'); // due Sunday 23.00 (22:00Z)

  it('is the first open slot whose deadline is ahead for a report without late facts', () => {
    expect(at('2026-10-31T18:00:00Z')).toBe('2026-11-02');
    expect(at('2026-10-31T19:00:00Z')).toBe('2026-11-09');
  });

  it('puts a late report handed in before its close into the porada before it', () => {
    expect(at('2026-10-31T19:30:00Z', sunday)).toBe('2026-11-02');
    expect(at('2026-11-01T21:59:00Z', sunday)).toBe('2026-11-02');
  });

  it('sends a report handed in at or after its close to the next porada', () => {
    expect(at('2026-11-01T22:00:00Z', sunday)).toBe('2026-11-09');
  });

  it('gives a report whose event ends on the meeting day no extra time', () => {
    expect(at('2026-11-01T10:00:00Z', ends('2026-11-02', '10:00'))).toBe('2026-11-09');
  });

  it('steps over a skipped or generated slot whatever its close', () => {
    const skipped = rows.map((row) =>
      row.monday.day === 2 && row.monday.month === 11
        ? { ...row, status: 'skipped' as const }
        : row,
    );
    const found = handInMonday(new Date('2026-11-01T20:00:00Z'), skipped, RULE, sunday);
    expect(toIsoDate(found)).toBe('2026-11-09');
  });
});
