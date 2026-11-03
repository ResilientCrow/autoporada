import { describe, expect, it } from 'vitest';

import type { IssueStatus } from '@/domain/review';
import { addDays, calDate, instantToWallClock, toIsoDate, type CalDate } from '@/domain/time';

import { deadline, DEFAULT_DEADLINE } from './issue-calendar';
import { nextMeetingBounds, planNextMeeting, slotMondayOf } from './next-meeting';
import { issueSlots, lastSlotMonday, type IssueRow, type IssueSlot } from './slots';

// Tuesday 3 November 2026, 11.00 in Prague: Monday 9 November's deadline (Saturday 20.00) is ahead.
const NOW = new Date('2026-11-03T10:00:00Z');
const TODAY = instantToWallClock(NOW).date;
const CURRENT = calDate(2026, 11, 2);
const M = calDate(2026, 11, 9);
const weeks = (monday: CalDate, count: number) => addDays(monday, 7 * count);
const rule = DEFAULT_DEADLINE;

const row = (monday: CalDate, over: Partial<IssueRow> = {}): IssueRow => ({
  monday,
  meetingDate: over.meetingDate ?? monday,
  deadlineAt: deadline(over.meetingDate ?? monday, rule),
  status: 'open' as IssueStatus,
  ...over,
});
const calendar = (rows: readonly IssueRow[] = []) => issueSlots(rows, TODAY, rule);
const slotOf = (slots: readonly IssueSlot[], monday: CalDate): IssueSlot => {
  const found = slots.find((s) => toIsoDate(s.monday) === toIsoDate(monday));
  if (!found) throw new Error('no such slot');
  return found;
};
const plan = (date: CalDate, { rows = [] as IssueRow[], from = M, now = NOW } = {}) => {
  const slots = calendar(rows);
  return planNextMeeting(slots, slotOf(slots, from), date, { rule, now });
};
const mondays = (slots: readonly { monday: CalDate }[]) => slots.map((s) => toIsoDate(s.monday));

describe('slotMondayOf', () => {
  it('gives Monday to Thursday their own Monday and Friday to Sunday the next one', () => {
    const days = [0, 1, 2, 3, 4, 5, 6].map((n) => toIsoDate(slotMondayOf(addDays(M, n))));
    expect(days).toEqual([
      '2026-11-09',
      '2026-11-09',
      '2026-11-09',
      '2026-11-09',
      '2026-11-16',
      '2026-11-16',
      '2026-11-16',
    ]);
  });
});

describe('nextMeetingBounds', () => {
  it('runs from the Friday before the porada to the Thursday after the last slot Monday', () => {
    expect(nextMeetingBounds(M, TODAY)).toEqual({
      from: calDate(2026, 11, 6),
      to: addDays(lastSlotMonday(TODAY), 3),
    });
  });

  it('starts today when the Friday before has passed', () => {
    expect(nextMeetingBounds(CURRENT, TODAY).from).toEqual(TODAY);
  });
});

describe('planNextMeeting', () => {
  it('holds the next Monday as it is, skipping only this porada', () => {
    const result = plan(weeks(M, 1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.moved).toBe(false);
    expect(toIsoDate(result.plan.held.monday)).toBe('2026-11-16');
    expect(result.plan.held.deadlineAt).toEqual(deadline(weeks(M, 1), rule));
    expect(mondays(result.plan.skipped)).toEqual(['2026-11-09']);
  });

  it('moves this porada itself to a day of its own week, with the rule’s deadline', () => {
    for (const day of [calDate(2026, 11, 10), calDate(2026, 11, 12), calDate(2026, 11, 6)]) {
      const result = plan(day);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.plan).toMatchObject({ moved: true, skipped: [] });
      expect(result.plan.held).toMatchObject({ monday: M, meetingDate: day });
      expect(result.plan.held.deadlineAt).toEqual(deadline(day, rule));
    }
  });

  it('moves a later porada to a Friday before its Monday and skips every one before it', () => {
    const friday = calDate(2026, 11, 20);
    const result = plan(friday);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.held).toMatchObject({ monday: weeks(M, 2), meetingDate: friday });
    expect(result.plan.held.deadlineAt).toEqual(deadline(friday, rule));
    expect(mondays(result.plan.skipped)).toEqual(['2026-11-09', '2026-11-16']);
  });

  it('leaves a porada between that is already skipped out of the skips', () => {
    const result = plan(weeks(M, 2), { rows: [row(weeks(M, 1), { status: 'skipped' })] });
    expect(result.ok && mondays(result.plan.skipped)).toEqual(['2026-11-09']);
  });

  it('refuses a day before the Friday before the porada, or before today', () => {
    expect(plan(calDate(2026, 11, 5))).toEqual({ ok: false, refusal: 'early' });
    expect(plan(CURRENT, { from: CURRENT })).toEqual({ ok: false, refusal: 'early' });
  });

  it('refuses a day whose slot is past the horizon', () => {
    const last = addDays(lastSlotMonday(TODAY), 3);
    expect(plan(last).ok).toBe(true);
    expect(plan(addDays(last, 1))).toEqual({ ok: false, refusal: 'late' });
  });

  it('refuses the meeting date the porada already has', () => {
    expect(plan(M)).toEqual({ ok: false, refusal: 'same' });
    const moved = [row(M, { meetingDate: calDate(2026, 11, 10) })];
    expect(plan(calDate(2026, 11, 10), { rows: moved })).toEqual({ ok: false, refusal: 'same' });
    expect(plan(M, { rows: moved }).ok).toBe(true);
  });

  it('refuses a day that falls on a porada that does not take place', () => {
    const rows = [row(weeks(M, 1), { status: 'skipped' })];
    expect(plan(weeks(M, 1), { rows })).toEqual({ ok: false, refusal: 'skipped' });
    expect(plan(addDays(weeks(M, 1), 1), { rows })).toEqual({ ok: false, refusal: 'skipped' });
  });

  it('refuses a move that would close a hand-in still open', () => {
    // Wednesday 4 November, 21.30 in Prague: Friday 6 November's deadline (Wednesday 20.00) has passed.
    const now = new Date('2026-11-04T20:30:00Z');
    expect(plan(calDate(2026, 11, 6), { now })).toEqual({ ok: false, refusal: 'deadline-past' });
  });

  it('takes a past deadline when the porada’s own has passed too', () => {
    // Today's porada, its deadline gone, held a day later: hand-in is closed either way.
    const result = plan(addDays(TODAY, 1), {
      rows: [row(CURRENT, { meetingDate: TODAY })],
      from: CURRENT,
    });
    expect(result.ok && result.plan.held.meetingDate).toEqual(addDays(TODAY, 1));
  });

  it('refuses a day that breaks the meeting order against a porada that takes place', () => {
    // Monday 16 November's porada was held on Wednesday 11 November by an earlier move.
    const rows = [row(weeks(M, 1), { meetingDate: calDate(2026, 11, 11) })];
    expect(plan(calDate(2026, 11, 12), { rows })).toEqual({
      ok: false,
      refusal: 'meeting-order',
    });
    // Skipping that porada on the way clears it.
    expect(plan(calDate(2026, 11, 20), { rows }).ok).toBe(true);
  });

  it('checks the order against a generated porada before it', () => {
    const rows = [row(CURRENT, { status: 'generated', meetingDate: calDate(2026, 11, 6) })];
    expect(plan(calDate(2026, 11, 6), { rows })).toEqual({ ok: false, refusal: 'meeting-order' });
  });
});
