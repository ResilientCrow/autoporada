import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { IssueStatus } from '@/domain/review';
import {
  addDays,
  calDate,
  compareDates,
  parseWallTime,
  toIsoDate,
  wallClockToInstant,
  type CalDate,
} from '@/domain/time';

import { orderConflicts } from './order';
import type { IssueSlot } from './slots';

const MONDAY0 = calDate(2026, 11, 2);
const TIME = parseWallTime('20:00');

/** A slot of week `week` whose meeting is `shift` days after its Monday, deadline 2 days before. */
function slot(week: number, shift = 0, status: IssueStatus = 'open', gap = 2): IssueSlot {
  const monday = addDays(MONDAY0, 7 * week);
  const meetingDate = addDays(monday, shift);
  return {
    monday,
    meetingDate,
    deadlineAt: wallClockToInstant(addDays(meetingDate, -gap), TIME),
    status,
    stored: true,
  };
}
const key = (c: { monday: CalDate }) => toIsoDate(c.monday);
const conflictsOf = (slots: readonly IssueSlot[], changed: IssueSlot) =>
  orderConflicts(slots, changed).map(key);

describe('orderConflicts', () => {
  const calendar = [slot(0), slot(1), slot(2), slot(3)];
  const at = (week: number) => key(slot(week));

  it('has none for a slot that stays where it is', () => {
    expect(orderConflicts(calendar, calendar[1] as IssueSlot)).toEqual([]);
  });

  it('has none for a move inside the gap between its neighbours', () => {
    expect(orderConflicts(calendar, slot(1, 3))).toEqual([]);
    expect(orderConflicts(calendar, slot(1, -3))).toEqual([]);
  });

  it('names a later slot that the moved meeting reaches or passes', () => {
    // Week 1 moved to the meeting day of week 2: the same day is a conflict, not a tie.
    expect(conflictsOf(calendar, slot(1, 7))).toEqual([at(2)]);
    expect(conflictsOf(calendar, slot(1, 8))).toEqual([at(2)]);
    expect(conflictsOf(calendar, slot(1, 15))).toEqual([at(2), at(3)]);
  });

  it('names an earlier slot that the moved meeting reaches or precedes', () => {
    expect(conflictsOf(calendar, slot(2, -7))).toEqual([at(1)]);
    expect(conflictsOf(calendar, slot(2, -15))).toEqual([at(0), at(1)]);
  });

  it('names a neighbour whose deadline is not before the moved one, meetings in order', () => {
    // Meeting stays after the previous slot's, but the deadline (4 days before) is no later.
    const before = [slot(0, 0, 'open', 2), slot(1, 0, 'open', 2)];
    const changed = { ...slot(1, 0, 'open', 2), deadlineAt: before[0]!.deadlineAt };
    expect(conflictsOf(before, changed)).toEqual([at(0)]);
  });

  it('checks all poradas over a Monday with no porada between them', () => {
    const gap = [slot(0), slot(2), slot(3)];
    expect(orderConflicts(gap, slot(0, 10))).toEqual([]);
    expect(conflictsOf(gap, slot(0, 15))).toEqual([at(2)]);
  });

  it('counts a generated slot and reports its status, so it is never dropped away', () => {
    const generated = [slot(0, 0, 'generated'), slot(1)];
    expect(orderConflicts(generated, slot(1, -10))).toEqual([
      { monday: slot(0).monday, meetingDate: slot(0).meetingDate, status: 'generated' },
    ]);
  });

  it('never names the changed slot itself, whatever its status', () => {
    expect(orderConflicts(calendar, { ...slot(1, 30), status: 'generated' }).map(key)).toEqual([
      at(2),
      at(3),
    ]);
    expect(orderConflicts([slot(1)], slot(1, 5))).toEqual([]);
  });

  it('reports the dates and status of a conflict and nothing else', () => {
    const [c] = orderConflicts(calendar, slot(1, 9));
    expect(c).toEqual({
      monday: slot(2).monday,
      meetingDate: slot(2).meetingDate,
      status: 'open',
    });
  });
});

describe('orderConflicts property (design §3, row 33)', () => {
  /** Whether the slots rise in meeting date and deadline with their Monday. */
  const holds = (slots: readonly IssueSlot[]) => {
    const taken = [...slots].sort((a, b) => compareDates(a.monday, b.monday));
    return taken.every((s, i) => {
      const prev = taken[i - 1];
      return (
        !prev ||
        (compareDates(prev.meetingDate, s.meetingDate) < 0 &&
          prev.deadlineAt.getTime() < s.deadlineAt.getTime())
      );
    });
  };

  // A calendar that keeps the order: strictly rising meeting days, each deadline 1-4 days before its meeting
  // but never reaching back past the previous meeting's deadline.
  const calendars = fc
    .record({
      steps: fc.array(fc.integer({ min: 1, max: 14 }), { minLength: 2, maxLength: 9 }),
      status: fc.constantFrom<IssueStatus>('open', 'generated'),
    })
    .map(({ steps, status }) => {
      let day = 0;
      return steps.map((step, week) => {
        day += step;
        const meetingDate = addDays(MONDAY0, day + 7 * week);
        return {
          monday: addDays(MONDAY0, 7 * week),
          meetingDate,
          deadlineAt: wallClockToInstant(addDays(meetingDate, -1), TIME),
          status,
          stored: true,
        } satisfies IssueSlot;
      });
    });

  it('dropping every conflict restores the order the calendar had', () => {
    fc.assert(
      fc.property(
        calendars,
        fc.nat(),
        fc.integer({ min: -20, max: 160 }),
        fc.integer({ min: 1, max: 4 }),
        (slots, pick, meetingShift, gap) => {
          fc.pre(holds(slots));
          const index = pick % slots.length;
          const old = slots[index] as IssueSlot;
          const meetingDate = addDays(MONDAY0, meetingShift);
          const changed: IssueSlot = {
            ...old,
            meetingDate,
            deadlineAt: wallClockToInstant(addDays(meetingDate, -gap), TIME),
          };
          const conflicts = new Set(orderConflicts(slots, changed).map(key));
          const after = slots
            .filter((s) => s === old || !conflicts.has(key(s)))
            .map((s) => (s === old ? changed : s));
          expect(holds(after)).toBe(true);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('names nothing when the changed slot keeps the order by itself', () => {
    fc.assert(
      fc.property(calendars, fc.nat(), (slots, pick) => {
        fc.pre(holds(slots));
        const old = slots[pick % slots.length] as IssueSlot;
        expect(orderConflicts(slots, old)).toEqual([]);
      }),
      { numRuns: 500 },
    );
  });
});
