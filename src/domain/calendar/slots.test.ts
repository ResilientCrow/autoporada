import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { IssueStatus } from '@/domain/review';
import {
  addDays,
  instantToWallClock,
  isoWeekday,
  mondayOf,
  parseIsoDate as d,
  parseWallTime,
  toIsoDate,
  type CalDate,
} from '@/domain/time';

import {
  deadline,
  DEFAULT_DEADLINE as RULE,
  handInMonday,
  handInSlot,
  issueSlots,
  lastSlotMonday,
  PLACEMENT_WEEKS,
  placementSlot,
  skipWindow,
  submitMonday,
  type IssueRow,
  type IssueSlot,
} from './index';

const today = (now: Date) => instantToWallClock(now).date;

/** A stored row; the meeting is on the Monday unless `meeting` says otherwise. */
function row(monday: string, status: IssueStatus, deadlineAt?: string, meeting?: string): IssueRow {
  const day = d(monday);
  return {
    monday: day,
    meetingDate: d(meeting ?? monday),
    status,
    deadlineAt: deadlineAt ? new Date(deadlineAt) : deadline(day, RULE),
  };
}

/** The slots a caller reads at `now`. */
const slotsAt = (now: Date, rows: readonly IssueRow[] = []) => issueSlots(rows, today(now), RULE);

const iso = (day: CalDate | null) => (day ? toIsoDate(day) : null);
const mondays = (slots: readonly IssueSlot[]) => slots.map((slot) => toIsoDate(slot.monday));

describe('issueSlots', () => {
  const TUESDAY = d('2026-10-27');

  it('is the 26 Mondays from this week with a computed deadline when no issue has a row', () => {
    const slots = issueSlots([], TUESDAY, RULE);
    expect(slots).toHaveLength(PLACEMENT_WEEKS);
    expect(iso(slots[0]!.monday)).toBe('2026-10-26');
    expect(iso(slots.at(-1)!.monday)).toBe(toIsoDate(addDays(d('2026-10-26'), 7 * 25)));
    expect(slots[1]).toEqual({
      monday: d('2026-11-02'),
      meetingDate: d('2026-11-02'),
      deadlineAt: deadline(d('2026-11-02'), RULE),
      status: 'open',
      stored: false,
    });
  });

  it('puts a stored row in place of the Monday it names, with its frozen values', () => {
    const frozen = row('2026-11-02', 'skipped', '2026-11-01T10:00:00Z', '2026-11-04');
    const slots = issueSlots([frozen], TUESDAY, RULE);
    expect(slots).toHaveLength(PLACEMENT_WEEKS);
    expect(slots[1]).toEqual({ ...frozen, stored: true });
    expect(slots.filter((slot) => slot.stored)).toHaveLength(1);
  });

  it('keeps a stored row before this week and one past the last virtual Monday, in Monday order', () => {
    const before = row('2026-10-19', 'open', undefined, '2026-10-28');
    const after = row(toIsoDate(addDays(d('2026-10-26'), 7 * 26)), 'skipped');
    const slots = issueSlots([after, before], TUESDAY, RULE);
    expect(slots).toHaveLength(PLACEMENT_WEEKS + 2);
    expect(mondays(slots).slice(0, 2)).toEqual(['2026-10-19', '2026-10-26']);
    expect(iso(slots.at(-1)!.monday)).toBe(iso(after.monday));
    expect(mondays(slots)).toEqual([...mondays(slots)].sort());
  });

  it('starts at the Monday of the Prague week: Sunday 23.30 UTC is already Monday', () => {
    const slots = slotsAt(new Date('2026-10-25T23:30:00Z'));
    expect(iso(slots[0]!.monday)).toBe('2026-10-26');
  });
});

describe('lastSlotMonday', () => {
  it("is the Monday PLACEMENT_WEEKS - 1 weeks after this week's Monday", () => {
    expect(iso(lastSlotMonday(d('2026-10-27')))).toBe('2027-04-19');
    expect(iso(lastSlotMonday(d('2026-10-26')))).toBe('2027-04-19');
    expect(iso(lastSlotMonday(d('2026-11-01')))).toBe('2027-04-19');
  });

  it('is the last Monday issueSlots makes', () => {
    const today = d('2026-10-27');
    expect(iso(issueSlots([], today, RULE).at(-1)!.monday)).toBe(iso(lastSlotMonday(today)));
  });
});

describe('skipWindow', () => {
  it('starts at the first Monday whose deadline is ahead and ends at the last slot Monday', () => {
    const now = new Date('2026-11-03T10:00:00Z');
    const window = skipWindow(now, slotsAt(now), RULE);
    expect(iso(window.first)).toBe('2026-11-09');
    expect(iso(window.last)).toBe(iso(lastSlotMonday(today(now))));
  });

  it.each<IssueStatus>(['skipped', 'generated'])(
    'counts a %s head Monday as open, so it can still be undone',
    (status) => {
      const now = new Date('2026-11-03T10:00:00Z');
      const slots = slotsAt(now, [row('2026-11-09', status)]);
      expect(iso(submitMonday(now, slots, RULE))).toBe('2026-11-16');
      expect(iso(skipWindow(now, slots, RULE).first)).toBe('2026-11-09');
    },
  );

  it('keeps a frozen later deadline as the first Monday', () => {
    const now = new Date('2026-11-03T10:00:00Z');
    const slots = slotsAt(now, [row('2026-11-02', 'skipped', '2026-11-05T17:00:00Z')]);
    expect(iso(skipWindow(now, slots, RULE).first)).toBe('2026-11-02');
  });
});

describe('handInSlot', () => {
  const NOON_RULE = { dayOffset: -3, time: parseWallTime('12:00') };

  it('is the slot it stops at, with its frozen deadline whatever the rule says', () => {
    const now = new Date('2026-10-21T10:00:00Z');
    const frozen = '2026-10-24T05:00:00Z';
    const slots = slotsAt(now, [row('2026-10-26', 'open', frozen)]);
    expect(handInSlot(now, slots, RULE)).toMatchObject({
      monday: d('2026-10-26'),
      deadlineAt: new Date(frozen),
      stored: true,
    });
  });

  it('is a virtual row of the rule when the slots run out, past the last Monday', () => {
    const slots = slotsAt(new Date('2026-10-21T10:00:00Z'));
    const last = slots.at(-1)!;
    const now = new Date(last.deadlineAt.getTime() + 60_000);
    const next = addDays(last.monday, 7);
    expect(handInSlot(now, slots, NOON_RULE)).toEqual({
      monday: next,
      meetingDate: next,
      deadlineAt: deadline(next, NOON_RULE),
      status: 'open',
    });
  });

  it('is a virtual row from this week when there are no slots at all', () => {
    const now = new Date('2026-10-21T10:00:00Z');
    const slot = handInSlot(now, [], NOON_RULE);
    expect(iso(slot.monday)).toBe('2026-10-26');
    expect(slot.deadlineAt).toEqual(deadline(d('2026-10-26'), NOON_RULE));
  });

  it('has the Monday handInMonday and submitMonday answer', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2026-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }),
        (now) => {
          const slots = slotsAt(now);
          const slot = handInSlot(now, slots, RULE);
          expect(handInMonday(now, slots, RULE)).toEqual(slot.monday);
          expect(submitMonday(now, slots, RULE)).toEqual(slot.monday);
        },
      ),
    );
  });
});

describe('submitMonday', () => {
  it('is the first Monday whose deadline is ahead when no issue is known', () => {
    const now = new Date('2026-10-21T10:00:00Z');
    expect(iso(submitMonday(now, slotsAt(now), RULE))).toBe('2026-10-26');
  });

  it.each([
    ['2026-10-17T17:59:00Z', '2026-10-19', 'Saturday 19:59 → the Monday after'],
    ['2026-10-17T18:00:00Z', '2026-10-26', 'Saturday 20:00 sharp → next week'],
    ['2026-10-18T10:00:00Z', '2026-10-26', 'Sunday → next week'],
    ['2026-10-19T08:00:00Z', '2026-10-26', 'meeting Monday → next week'],
    ['2026-10-14T10:00:00Z', '2026-10-19', 'mid-week → coming Monday'],
    ['2026-12-26T19:00:00Z', '2027-01-04', 'across the new year'],
  ])('with no issue known, %s → %s (%s)', (instant, monday) => {
    const now = new Date(instant);
    expect(iso(submitMonday(now, slotsAt(now), RULE))).toBe(monday);
  });

  it('with no issue known is the first Monday whose deadline is still ahead (property)', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2026-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }),
        (now) => {
          const monday = submitMonday(now, slotsAt(now), RULE);
          expect(isoWeekday(monday)).toBe(1);
          expect(now.getTime()).toBeLessThan(deadline(monday, RULE).getTime());
          expect(now.getTime()).toBeGreaterThanOrEqual(
            deadline(addDays(monday, -7), RULE).getTime(),
          );
        },
      ),
    );
  });

  it.each<IssueStatus>(['skipped', 'generated'])(
    'steps over a %s slot whose deadline is still ahead',
    (status) => {
      const now = new Date('2026-10-14T10:00:00Z');
      const slots = slotsAt(now, [row('2026-10-19', status)]);
      expect(iso(submitMonday(now, slots, RULE))).toBe('2026-10-26');
    },
  );

  it('steps over a run of skipped and generated slots', () => {
    const now = new Date('2026-10-14T10:00:00Z');
    const slots = slotsAt(now, [
      row('2026-10-19', 'skipped'),
      row('2026-10-26', 'generated'),
      row('2026-11-02', 'skipped'),
    ]);
    expect(iso(submitMonday(now, slots, RULE))).toBe('2026-11-09');
  });

  it('does not let a skipped slot with a later deadline take a hand-in that missed the next one', () => {
    // Slot 19 Oct is skipped and its deadline was moved to Tuesday; slot 26 Oct closes Saturday
    // 24 Oct 20.00 (18.00Z). A hand-in on Saturday 24 Oct 21.00 is after 26 Oct's deadline.
    const now = new Date('2026-10-24T19:00:00Z');
    const slots = slotsAt(now, [row('2026-10-19', 'skipped', '2026-10-27T10:00:00Z')]);
    expect(iso(submitMonday(now, slots, RULE))).toBe('2026-11-02');
  });

  it.each<IssueStatus>(['skipped', 'generated'])(
    'also steps over a %s slot whose frozen deadline is ahead of one that is open',
    (status) => {
      const now = new Date('2026-10-17T12:00:00Z');
      const frozen = row('2026-10-19', status, '2026-10-17T10:00:00Z');
      // The frozen deadline is behind us; the computed Saturday 20.00 would not have been.
      expect(iso(submitMonday(now, slotsAt(now), RULE))).toBe('2026-10-19');
      expect(iso(submitMonday(now, slotsAt(now, [frozen]), RULE))).toBe('2026-10-26');
    },
  );

  it('keeps a frozen deadline that is later than the computed one', () => {
    // Computed: Saturday 2026-10-17 20:00 Prague = 18:00Z. This row was frozen at 21:00Z.
    const now = new Date('2026-10-17T19:00:00Z');
    const late = row('2026-10-19', 'open', '2026-10-17T21:00:00Z');
    expect(iso(submitMonday(now, slotsAt(now), RULE))).toBe('2026-10-26');
    expect(iso(submitMonday(now, slotsAt(now, [late]), RULE))).toBe('2026-10-19');
  });

  it('takes the frozen deadline of a stored slot over the computed one', () => {
    // Computed: Saturday 2026-10-17 20:00 Prague = 18:00Z. This row was frozen eight hours earlier.
    const now = new Date('2026-10-17T12:00:00Z');
    const early = row('2026-10-19', 'open', '2026-10-17T10:00:00Z');
    expect(iso(submitMonday(now, slotsAt(now), RULE))).toBe('2026-10-19');
    expect(iso(submitMonday(now, slotsAt(now, [early]), RULE))).toBe('2026-10-26');
  });

  it('falls back to the computed deadline for Mondays without a row', () => {
    const now = new Date('2026-10-17T12:00:00Z');
    const early = row('2026-10-19', 'open', '2026-10-17T10:00:00Z');
    expect(iso(submitMonday(now, slotsAt(now, [early, row('2026-10-26', 'open')]), RULE))).toBe(
      '2026-10-26',
    );
    const frozen = row('2026-10-26', 'open', '2026-10-17T11:00:00Z');
    expect(iso(submitMonday(now, slotsAt(now, [early, frozen]), RULE))).toBe('2026-11-02');
  });

  it('goes by the deadline of a slot, not by its meeting date', () => {
    // The 19 Oct slot meets on Friday 23 Oct; its frozen deadline is still Saturday 17 Oct 20.00.
    const now = new Date('2026-10-17T19:00:00Z');
    const moved = row('2026-10-19', 'open', undefined, '2026-10-23');
    expect(iso(submitMonday(now, slotsAt(now, [moved]), RULE))).toBe('2026-10-26');
  });

  it('can name a slot of the week before this one when its meeting was moved past its deadline', () => {
    // Slot 19 Oct meets on Sunday 25 Oct and was given a deadline of Saturday 24 Oct 12.00.
    const now = new Date('2026-10-24T08:00:00Z');
    const lingering = row('2026-10-19', 'open', '2026-10-24T10:00:00Z', '2026-10-25');
    expect(iso(submitMonday(now, issueSlots([lingering], d('2026-10-24'), RULE), RULE))).toBe(
      '2026-10-19',
    );
  });

  it('goes on past the last slot when all 26 are skipped', () => {
    const now = new Date('2026-10-14T10:00:00Z');
    const blocked = Array.from({ length: PLACEMENT_WEEKS }, (_, week) =>
      row(toIsoDate(addDays(d('2026-10-12'), 7 * week)), 'skipped'),
    );
    expect(iso(submitMonday(now, slotsAt(now, blocked), RULE))).toBe(
      toIsoDate(addDays(d('2026-10-12'), 7 * PLACEMENT_WEEKS)),
    );
  });

  it('goes on from this week with no slots at all, either side of Saturday 20.00', () => {
    expect(iso(submitMonday(new Date('2026-10-24T17:59:59Z'), [], RULE))).toBe('2026-10-26');
    expect(iso(submitMonday(new Date('2026-10-24T18:00:00Z'), [], RULE))).toBe('2026-11-02');
  });

  it('goes on from this week with no slots at all', () => {
    const now = new Date('2026-10-21T10:00:00Z');
    expect(iso(submitMonday(now, [], RULE))).toBe('2026-10-26');
  });

  it.each([
    ['2026-10-23T22:00:00Z', '2026-10-26'],
    ['2026-10-24T17:59:59Z', '2026-10-26'],
    ['2026-10-24T18:00:00Z', '2026-11-02'],
    ['2026-10-25T23:59:59Z', '2026-11-02'],
    ['2027-03-26T22:00:00Z', '2027-03-29'],
    ['2027-03-27T18:59:59Z', '2027-03-29'],
    ['2027-03-27T19:00:00Z', '2027-04-05'],
    ['2027-03-28T22:00:00Z', '2027-04-05'],
  ])(
    'at %s the submit Monday is %s (Saturday 20.00 either side of the DST weekends)',
    (at, monday) => {
      const now = new Date(at);
      expect(iso(submitMonday(now, slotsAt(now), RULE))).toBe(monday);
    },
  );

  it('reads a frozen deadline that differs from the computed one across the DST changes', () => {
    // Computed: 18:00Z (autumn) and 19:00Z (spring). These rows were frozen an hour later.
    const autumn = row('2026-10-26', 'open', '2026-10-24T19:00:00Z');
    const spring = row('2027-03-29', 'open', '2027-03-27T20:00:00Z');
    const autumnNow = new Date('2026-10-24T18:30:00Z');
    const springNow = new Date('2027-03-27T19:30:00Z');
    expect(iso(submitMonday(autumnNow, slotsAt(autumnNow), RULE))).toBe('2026-11-02');
    expect(iso(submitMonday(autumnNow, slotsAt(autumnNow, [autumn]), RULE))).toBe('2026-10-26');
    expect(iso(submitMonday(springNow, slotsAt(springNow), RULE))).toBe('2027-04-05');
    expect(iso(submitMonday(springNow, slotsAt(springNow, [spring]), RULE))).toBe('2027-03-29');
  });

  it('uses a frozen deadline on each side of the DST changes', () => {
    // Old rows frozen on Sunday 18.00 (ADR 0032 item 8): deliberately later than the computed deadline.
    const autumn = row('2026-10-26', 'open', '2026-10-25T17:00:00Z');
    const spring = row('2027-03-29', 'open', '2027-03-28T16:00:00Z');
    const at = (text: string, rows: IssueRow[]) => {
      const now = new Date(text);
      return iso(submitMonday(now, slotsAt(now, rows), RULE));
    };
    expect(at('2026-10-25T16:59:59Z', [autumn])).toBe('2026-10-26');
    expect(at('2026-10-25T17:00:00Z', [autumn])).toBe('2026-11-02');
    expect(at('2027-03-28T15:59:59Z', [spring])).toBe('2027-03-29');
    expect(at('2027-03-28T16:00:00Z', [spring])).toBe('2027-04-05');
  });
});

describe('placementSlot', () => {
  const TUESDAY = d('2026-10-27');
  const slotsOn = (rows: readonly IssueRow[] = [], on = TUESDAY) => issueSlots(rows, on, RULE);

  it('is the open slot of the due Monday when its meeting is ahead', () => {
    expect(iso(placementSlot(d('2026-11-09'), TUESDAY, slotsOn())?.monday ?? null)).toBe(
      '2026-11-09',
    );
  });

  it('moves past skipped and generated slots', () => {
    const rows = [
      row('2026-11-02', 'skipped'),
      row('2026-11-09', 'generated'),
      row('2026-11-16', 'skipped'),
    ];
    expect(iso(placementSlot(d('2026-11-02'), TUESDAY, slotsOn(rows))?.monday ?? null)).toBe(
      '2026-11-23',
    );
  });

  it('skips a slot whose meeting is over, even when it is open and not before the due Monday', () => {
    // This week's slot met on Monday; it is open (nobody generated it) but today is Tuesday.
    expect(iso(placementSlot(d('2026-10-19'), TUESDAY, slotsOn())?.monday ?? null)).toBe(
      '2026-11-02',
    );
  });

  it('counts a meeting today', () => {
    const monday = d('2026-10-26');
    expect(iso(placementSlot(d('2026-10-19'), monday, slotsOn([], monday))?.monday ?? null)).toBe(
      '2026-10-26',
    );
  });

  it('goes by the meeting date: a slot of this week moved to Friday still takes the point', () => {
    const moved = row('2026-10-26', 'open', undefined, '2026-10-30');
    const picked = placementSlot(d('2026-10-26'), TUESDAY, slotsOn([moved]));
    expect(picked).toMatchObject({ monday: d('2026-10-26'), meetingDate: d('2026-10-30') });
  });

  it('skips a slot whose meeting moved before today', () => {
    // Monday 19 Oct slot, meeting moved to Friday 23 Oct; today is Saturday 24 Oct.
    const early = row('2026-10-19', 'open', undefined, '2026-10-23');
    const saturday = d('2026-10-24');
    const slots = issueSlots([early], saturday, RULE);
    expect(iso(placementSlot(d('2026-10-19'), saturday, slots)?.monday ?? null)).toBe('2026-10-26');
  });

  it('keeps a slot of an earlier week whose meeting was moved to a day still ahead', () => {
    const lingering = row('2026-10-19', 'open', undefined, '2026-10-25');
    const saturday = d('2026-10-24');
    const slots = issueSlots([lingering], saturday, RULE);
    expect(iso(placementSlot(d('2026-10-19'), saturday, slots)?.monday ?? null)).toBe('2026-10-19');
  });

  it('does not place a point before its due Monday', () => {
    expect(iso(placementSlot(d('2026-11-16'), TUESDAY, slotsOn())?.monday ?? null)).toBe(
      '2026-11-16',
    );
  });

  it('is null when every slot from the due Monday is skipped or generated', () => {
    const first = mondayOf(TUESDAY);
    const blocked = Array.from({ length: PLACEMENT_WEEKS }, (_, week) =>
      row(toIsoDate(addDays(first, 7 * week)), week % 2 ? 'skipped' : 'generated'),
    );
    expect(placementSlot(first, TUESDAY, slotsOn(blocked))).toBeNull();
  });

  it('is null when the due Monday lies past the slots', () => {
    const far = addDays(mondayOf(TUESDAY), 7 * PLACEMENT_WEEKS);
    expect(placementSlot(far, TUESDAY, slotsOn())).toBeNull();
  });

  it('finds the last slot when the ones before it are blocked', () => {
    const first = d('2026-11-02');
    const blocked = Array.from({ length: PLACEMENT_WEEKS - 2 }, (_, week) =>
      row(toIsoDate(addDays(first, 7 * week)), 'skipped'),
    );
    expect(iso(placementSlot(first, TUESDAY, slotsOn(blocked))?.monday ?? null)).toBe(
      toIsoDate(addDays(d('2026-10-26'), 7 * 25)),
    );
  });
});
