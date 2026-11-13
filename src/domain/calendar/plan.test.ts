import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { IssueStatus } from '@/domain/review';
import {
  addDays,
  compareDates,
  instantToWallClock,
  isoWeekday,
  parseIsoDate as d,
  toIsoDate,
  type CalDate,
} from '@/domain/time';

import {
  calendarBoundary,
  deadline,
  DEFAULT_DEADLINE as RULE,
  handInSlot,
  issueSlots,
  lastSlotMonday,
  moveBounds,
  orderConflicts,
  owedPorada,
  planAdd,
  planDrop,
  planMove,
  reportsSince,
  slotMondayOf,
  type IssueRow,
  type IssueSlot,
} from './index';

/** Tuesday 3 November 2026, 11.00 in Prague: this week's Monday is the 2nd. */
const NOW = new Date('2026-11-03T10:00:00Z');
const TODAY = instantToWallClock(NOW).date;
const iso = (day: CalDate) => toIsoDate(day);
const env = { rule: RULE, now: NOW };

function row(
  monday: string,
  status: IssueStatus = 'open',
  meeting = monday,
  deadlineAt?: string,
): IssueRow {
  return {
    monday: d(monday),
    meetingDate: d(meeting),
    status,
    deadlineAt: deadlineAt ? new Date(deadlineAt) : deadline(d(meeting), RULE),
  };
}

/** The calendar a caller reads at NOW. */
const calendar = (rows: readonly IssueRow[] = [], plannedThrough: string | null = null) =>
  issueSlots(rows, TODAY, RULE, calendarBoundary(plannedThrough ? d(plannedThrough) : null, TODAY));
const slotOf = (slots: readonly IssueSlot[], monday: string): IssueSlot => {
  const found = slots.find((s) => iso(s.monday) === monday);
  if (!found) throw new Error(`no slot ${monday}`);
  return found;
};
const move = (slots: readonly IssueSlot[], monday: string, to: string) =>
  planMove(slots, slotOf(slots, monday), d(to), env);

describe('slotMondayOf', () => {
  it('keeps Monday to Thursday in their week and sends Friday to Sunday to the next Monday', () => {
    const expected = ['2026-11-02', '2026-11-02', '2026-11-02', '2026-11-02'];
    expected.forEach((monday, i) => {
      expect(iso(slotMondayOf(addDays(d('2026-11-02'), i)))).toBe(monday);
    });
    for (let i = 4; i < 7; i++) {
      expect(iso(slotMondayOf(addDays(d('2026-11-02'), i)))).toBe('2026-11-09');
    }
  });

  it('always names a Monday within three days before or four days after the date', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2000 }), (n) => {
        const day = addDays(d('2026-01-01'), n);
        const monday = slotMondayOf(day);
        expect(isoWeekday(monday)).toBe(1);
        const near = [-3, -2, -1, 0, 1, 2, 3].map((k) => iso(addDays(day, k)));
        expect(near).toContain(iso(monday));
      }),
    );
  });
});

describe('calendarBoundary', () => {
  it('is last week’s Monday when nothing is stored', () => {
    expect(iso(calendarBoundary(null, TODAY))).toBe('2026-10-26');
  });

  it('is last week’s Monday on a Monday too, not today’s', () => {
    expect(iso(calendarBoundary(null, d('2026-11-09')))).toBe('2026-11-02');
  });

  it('keeps a stored boundary that lies ahead', () => {
    expect(iso(calendarBoundary(d('2026-12-07'), TODAY))).toBe('2026-12-07');
  });

  it('ignores a stored boundary that has fallen behind last week', () => {
    expect(iso(calendarBoundary(d('2026-09-07'), TODAY))).toBe('2026-10-26');
    expect(iso(calendarBoundary(d('2026-10-26'), TODAY))).toBe('2026-10-26');
  });
});

describe('the plannedThrough parameter', () => {
  it('makes issueSlots a Monday-by-Monday list of rows up to the boundary', () => {
    const slots = issueSlots([row('2026-11-16')], TODAY, RULE, d('2026-11-16'));
    expect(
      slots.filter((s) => !s.stored).every((s) => compareDates(s.monday, d('2026-11-16')) > 0),
    ).toBe(true);
    expect(iso(slots[0]!.monday)).toBe('2026-11-16');
    expect(iso(slots[1]!.monday)).toBe('2026-11-23');
  });

  it('leaves a stored row after the boundary and a null boundary as before', () => {
    expect(issueSlots([], TODAY, RULE, null)).toHaveLength(26);
    expect(issueSlots([], TODAY, RULE, d('2026-10-26'))).toHaveLength(26);
    const slots = issueSlots([row('2026-12-07')], TODAY, RULE, d('2026-11-09'));
    expect(slots.filter((s) => iso(s.monday) === '2026-12-07')).toHaveLength(1);
    expect(slots.some((s) => iso(s.monday) === '2026-11-09')).toBe(false);
  });

  it('starts handInSlot’s virtual Mondays after the boundary when the slots run out', () => {
    const slot = handInSlot(NOW, [], RULE, undefined, d('2026-11-16'));
    expect(iso(slot.monday)).toBe('2026-11-23');
    expect(iso(handInSlot(NOW, [], RULE, undefined, null).monday)).toBe('2026-11-09');
  });

  it('still takes a stored open slot before the boundary', () => {
    const slots = calendar([row('2026-11-16')], '2026-11-16');
    expect(iso(handInSlot(NOW, slots, RULE, undefined, d('2026-11-16')).monday)).toBe('2026-11-16');
  });

  it('steps reportsSince and owedPorada over a Monday with no row up to the boundary', () => {
    expect(iso(reportsSince(d('2026-11-23'), [], d('2026-11-16')))).toBe('2026-08-31');
    expect(iso(reportsSince(d('2026-11-23'), [], null))).toBe('2026-11-16');
    expect(iso(owedPorada(d('2026-11-10'), [], d('2026-11-23')))).toBe('2026-11-30');
    expect(iso(owedPorada(d('2026-11-10'), [], null))).toBe('2026-11-16');
  });
});

describe('moveBounds', () => {
  it('starts today for the first porada and ends the day before the next one’s meeting', () => {
    const slots = calendar();
    const bounds = moveBounds(slots, slotOf(slots, '2026-11-02'), TODAY);
    expect([iso(bounds.from), iso(bounds.to)]).toEqual(['2026-11-03', '2026-11-08']);
  });

  it('starts the day after the previous porada’s meeting when that is later than today', () => {
    const slots = calendar([row('2026-11-02', 'open', '2026-11-05')]);
    const bounds = moveBounds(slots, slotOf(slots, '2026-11-09'), TODAY);
    expect(iso(bounds.from)).toBe('2026-11-06');
  });

  it('starts today when the previous porada met in the past', () => {
    const slots = calendar();
    expect(iso(moveBounds(slots, slotOf(slots, '2026-11-09'), TODAY).from)).toBe('2026-11-03');
  });

  it('ends at the Thursday after the last Monday for the last porada', () => {
    const slots = calendar();
    const last = slots.at(-1)!;
    const bounds = moveBounds(slots, last, TODAY);
    expect(iso(bounds.to)).toBe(iso(addDays(lastSlotMonday(TODAY), 3)));
  });

  it('is capped by the horizon even when the next porada lies past it', () => {
    const slots = calendar([row(iso(addDays(lastSlotMonday(TODAY), 7)))]);
    const last = slots.filter((s) => compareDates(s.monday, lastSlotMonday(TODAY)) <= 0).at(-1)!;
    expect(iso(moveBounds(slots, last, TODAY).to)).toBe(iso(addDays(lastSlotMonday(TODAY), 3)));
  });
});

describe('planMove', () => {
  it('moves a porada: the Monday stays, the meeting and the rule’s deadline change', () => {
    const slots = calendar();
    const result = move(slots, '2026-11-09', '2026-11-10');
    expect(result).toEqual({
      ok: true,
      moved: {
        monday: d('2026-11-09'),
        meetingDate: d('2026-11-10'),
        deadlineAt: deadline(d('2026-11-10'), RULE),
        status: 'open',
        stored: false,
      },
    });
  });

  it('refuses a generated porada as not-open', () => {
    const slots = calendar([row('2026-11-09', 'generated')]);
    expect(move(slots, '2026-11-09', '2026-11-10')).toEqual({ ok: false, refusal: 'not-open' });
  });

  it('refuses the day it already meets on as same', () => {
    expect(move(calendar(), '2026-11-09', '2026-11-09')).toEqual({ ok: false, refusal: 'same' });
  });

  it('refuses a day another porada meets on as porada-exists', () => {
    expect(move(calendar(), '2026-11-09', '2026-11-16')).toEqual({
      ok: false,
      refusal: 'porada-exists',
    });
  });

  it('refuses a day before today as early', () => {
    expect(move(calendar(), '2026-11-09', '2026-11-01')).toEqual({ ok: false, refusal: 'early' });
  });

  it('refuses a day not after the previous porada’s meeting as early', () => {
    const slots = calendar([row('2026-11-02', 'open', '2026-11-12')]);
    expect(move(slots, '2026-11-09', '2026-11-12')).toEqual({
      ok: false,
      refusal: 'porada-exists',
    });
    expect(move(slots, '2026-11-09', '2026-11-11')).toEqual({ ok: false, refusal: 'early' });
  });

  it('refuses a day past the next porada’s meeting as late', () => {
    expect(move(calendar(), '2026-11-09', '2026-11-17')).toEqual({ ok: false, refusal: 'late' });
  });

  it('allows the day before the next porada’s meeting', () => {
    expect(move(calendar(), '2026-11-09', '2026-11-15')).toMatchObject({ ok: true });
  });

  it('refuses a day past the horizon as late and allows the horizon itself', () => {
    const slots = calendar();
    const last = iso(slots.at(-1)!.monday);
    const horizon = iso(addDays(lastSlotMonday(TODAY), 3));
    expect(move(slots, last, iso(addDays(lastSlotMonday(TODAY), 4)))).toEqual({
      ok: false,
      refusal: 'late',
    });
    expect(move(slots, last, horizon)).toMatchObject({ ok: true });
  });

  it('refuses a move whose new deadline has passed while the hand-in is open as deadline-past', () => {
    // 4 November: deadline Monday 2 November 20.00, already behind us.
    expect(move(calendar(), '2026-11-09', '2026-11-04')).toEqual({
      ok: false,
      refusal: 'deadline-past',
    });
  });

  it('allows a move to a passed deadline when the hand-in was closed already', () => {
    const closed = row('2026-11-09', 'open', '2026-11-09', '2026-11-01T10:00:00Z');
    expect(move(calendar([closed]), '2026-11-09', '2026-11-04')).toMatchObject({ ok: true });
  });

  it('refuses a move that breaks the deadline order against a neighbour as meeting-order', () => {
    const next = row('2026-11-16', 'open', '2026-11-16', '2026-11-08T10:00:00Z');
    expect(move(calendar([next]), '2026-11-09', '2026-11-15')).toEqual({
      ok: false,
      refusal: 'meeting-order',
    });
  });

  it('checks the status before the date', () => {
    const slots = calendar([row('2026-11-09', 'generated')]);
    expect(move(slots, '2026-11-09', '2026-11-09')).toEqual({ ok: false, refusal: 'not-open' });
  });
});

describe('planDrop', () => {
  const drop = (
    slots: readonly IssueSlot[],
    monday: string,
    plannedThrough: string | null = null,
  ) =>
    planDrop(slots, slotOf(slots, monday), {
      rule: RULE,
      plannedThrough: plannedThrough ? d(plannedThrough) : null,
    });

  it('refuses a generated porada as not-open', () => {
    const slots = calendar([row('2026-11-09', 'generated')]);
    expect(drop(slots, '2026-11-09')).toEqual({ ok: false, refusal: 'not-open' });
  });

  it('fills the coming Mondays before it that have no row and hands over to the next Monday', () => {
    const result = drop(calendar(), '2026-11-16');
    if (!result.ok) throw new Error('refused');
    expect(result.fill.map((s) => iso(s.monday))).toEqual(['2026-11-02', '2026-11-09']);
    expect(iso(result.heir.monday)).toBe('2026-11-23');
    expect(result.heir.stored).toBe(false);
    expect(iso(result.plannedThrough)).toBe('2026-11-23');
  });

  it('leaves stored rows before it out of the fill', () => {
    const result = drop(calendar([row('2026-11-02'), row('2026-11-09')]), '2026-11-16');
    if (!result.ok) throw new Error('refused');
    expect(result.fill).toEqual([]);
  });

  it('names a stored open heir', () => {
    const result = drop(calendar([row('2026-11-23')]), '2026-11-16');
    if (!result.ok) throw new Error('refused');
    expect(result.heir).toMatchObject({ monday: d('2026-11-23'), status: 'open', stored: true });
  });

  it('names a generated heir', () => {
    const result = drop(calendar([row('2026-11-23', 'generated')]), '2026-11-16');
    if (!result.ok) throw new Error('refused');
    expect(result.heir).toMatchObject({ monday: d('2026-11-23'), status: 'generated' });
  });

  it('names the next porada even when it was moved or is a later Monday than the next week', () => {
    const slots = calendar(
      [row('2026-11-16', 'open', '2026-11-17'), row('2026-11-30')],
      '2026-11-30',
    );
    const result = drop(slots, '2026-11-16', '2026-11-30');
    if (!result.ok) throw new Error('refused');
    expect(iso(result.heir.monday)).toBe('2026-11-30');
  });

  it('makes a virtual heir after the last porada, with the rule’s deadline', () => {
    const slots = calendar();
    const last = slots.at(-1)!;
    const result = drop(slots, iso(last.monday));
    if (!result.ok) throw new Error('refused');
    const heir = addDays(last.monday, 7);
    expect(result.heir).toEqual({
      monday: heir,
      meetingDate: heir,
      deadlineAt: deadline(heir, RULE),
      status: 'open',
      stored: false,
    });
    expect(result.plannedThrough).toEqual(heir);
  });

  it('never lowers plannedThrough', () => {
    const result = drop(
      calendar([row('2026-11-16'), row('2026-11-23')], '2026-12-14'),
      '2026-11-16',
      '2026-12-14',
    );
    if (!result.ok) throw new Error('refused');
    expect(iso(result.plannedThrough)).toBe('2026-12-14');
  });

  it('raises plannedThrough that lies below the heir', () => {
    const result = drop(calendar(), '2026-11-16', '2026-11-09');
    if (!result.ok) throw new Error('refused');
    expect(iso(result.plannedThrough)).toBe('2026-11-23');
  });
});

describe('planAdd', () => {
  /** Mondays 2 and 16 November have rows and the boundary is the 16th: the 9th is free. */
  const gap = () => calendar([row('2026-11-02'), row('2026-11-16')], '2026-11-16');
  const add = (slots: readonly IssueSlot[], date: string) => planAdd(slots, d(date), env);

  it('adds a porada on the free Monday’s week, keyed by the nearest Monday', () => {
    expect(add(gap(), '2026-11-10')).toEqual({
      ok: true,
      closed: false,
      added: {
        monday: d('2026-11-09'),
        meetingDate: d('2026-11-10'),
        deadlineAt: deadline(d('2026-11-10'), RULE),
        status: 'open',
        stored: true,
      },
    });
  });

  it('keys a Friday by the Monday after it', () => {
    const slots = calendar([row('2026-11-02'), row('2026-11-23')], '2026-11-23');
    const result = add(slots, '2026-11-13');
    expect(result).toMatchObject({ ok: true, added: { monday: d('2026-11-16') } });
  });

  it('flags a deadline that has passed as closed, and still adds', () => {
    // 2 November has no row here; a meeting on the 4th has its deadline on the 2nd.
    const slots = calendar([row('2026-11-09')], '2026-11-09');
    expect(add(slots, '2026-11-04')).toMatchObject({ ok: true, closed: true });
  });

  it('refuses a day before today as early', () => {
    expect(add(gap(), '2026-11-02')).toEqual({ ok: false, refusal: 'early' });
  });

  it('refuses a day past the horizon as late and allows the horizon', () => {
    const horizon = addDays(lastSlotMonday(TODAY), 3);
    const slots = calendar([], iso(lastSlotMonday(TODAY)));
    expect(planAdd(slots, addDays(horizon, 1), env)).toEqual({ ok: false, refusal: 'late' });
    expect(planAdd(slots, horizon, env)).toMatchObject({ ok: true });
  });

  it('refuses a week that has a stored porada', () => {
    expect(add(gap(), '2026-11-17')).toEqual({ ok: false, refusal: 'porada-exists' });
  });

  it('refuses a week whose Monday is a virtual porada', () => {
    expect(add(calendar(), '2026-11-10')).toEqual({ ok: false, refusal: 'porada-exists' });
  });

  it('refuses a day another porada meets on, though its own week is free', () => {
    // 9 November’s porada meets on Friday 20th; the 23rd’s week has no porada.
    const slots = calendar([row('2026-11-09', 'open', '2026-11-20')], '2026-11-23');
    expect(add(slots, '2026-11-20')).toEqual({ ok: false, refusal: 'porada-exists' });
  });

  it('refuses a porada before a generated one as later-generated', () => {
    const slots = calendar([row('2026-11-02'), row('2026-11-16', 'generated')], '2026-11-16');
    expect(add(slots, '2026-11-10')).toEqual({ ok: false, refusal: 'later-generated' });
  });

  it('refuses a day that breaks the meeting order as meeting-order', () => {
    const slots = calendar(
      [row('2026-11-02', 'open', '2026-11-12'), row('2026-11-16')],
      '2026-11-16',
    );
    expect(add(slots, '2026-11-10')).toEqual({ ok: false, refusal: 'meeting-order' });
  });
});

describe('a calendar under random moves, drops and adds', () => {
  type Op = { kind: 'move' | 'drop' | 'add'; pick: number; day: number };
  const ops = fc.array(
    fc.record({
      kind: fc.constantFrom<Op['kind']>('move', 'drop', 'add', 'move'),
      pick: fc.nat(40),
      day: fc.integer({ min: -2, max: 200 }),
    }),
    { minLength: 1, maxLength: 25 },
  );

  /** The stored side of the calendar, as the database holds it. */
  interface State {
    readonly rows: readonly IssueRow[];
    readonly plannedThrough: CalDate | null;
  }

  const slotsOf = ({ rows, plannedThrough }: State) =>
    issueSlots(rows, TODAY, RULE, calendarBoundary(plannedThrough, TODAY));
  const asRow = ({ monday, meetingDate, deadlineAt, status }: IssueSlot): IssueRow => ({
    monday,
    meetingDate,
    deadlineAt,
    status,
  });
  const withRow = (rows: readonly IssueRow[], next: IssueRow) => [
    ...rows.filter((r) => compareDates(r.monday, next.monday) !== 0),
    asRow(next as IssueSlot),
  ];

  /** The use cases’ effect on the stored side. */
  function apply(state: State, op: Op): State {
    const slots = slotsOf(state);
    const open = slots.filter((s) => s.status === 'open');
    const date = addDays(TODAY, op.day);
    if (op.kind === 'add') {
      const result = planAdd(slots, date, env);
      return result.ok ? { ...state, rows: withRow(state.rows, result.added) } : state;
    }
    const slot = open[op.pick % open.length];
    if (!slot) return state;
    if (op.kind === 'move') {
      const result = planMove(slots, slot, date, env);
      return result.ok ? { ...state, rows: withRow(state.rows, result.moved) } : state;
    }
    const result = planDrop(slots, slot, { rule: RULE, plannedThrough: state.plannedThrough });
    if (!result.ok) return state;
    let rows = state.rows.filter((r) => compareDates(r.monday, slot.monday) !== 0);
    for (const s of [...result.fill, result.heir]) {
      if (!rows.some((r) => compareDates(r.monday, s.monday) === 0)) rows = withRow(rows, s);
    }
    return { rows, plannedThrough: result.plannedThrough };
  }

  function expectInvariants(state: State) {
    const slots = slotsOf(state);
    const boundary = calendarBoundary(state.plannedThrough, TODAY);
    const mondays = slots.map((s) => iso(s.monday));
    expect(new Set(mondays).size).toBe(mondays.length);
    const meetings = slots.map((s) => iso(s.meetingDate));
    expect(new Set(meetings).size).toBe(meetings.length);
    for (const slot of slots) {
      expect(orderConflicts(slots, slot), iso(slot.monday)).toEqual([]);
      if (!slot.stored) expect(compareDates(slot.monday, boundary)).toBeGreaterThan(0);
    }
    expect(mondays).toEqual([...mondays].sort());
  }

  it('keeps unique Mondays and meeting dates, the meeting order and no virtual slot behind the boundary', () => {
    fc.assert(
      fc.property(fc.boolean(), ops, (generatedFirst, sequence) => {
        let state: State = {
          rows: generatedFirst ? [row('2026-11-02', 'generated')] : [],
          plannedThrough: null,
        };
        expectInvariants(state);
        for (const op of sequence) {
          state = apply(state, op);
          expectInvariants(state);
        }
      }),
      { numRuns: 400 },
    );
    // 400 runs take about 3 s alone; the default 5 s is too tight when the whole suite shares the CPU.
  }, 20_000);
});
