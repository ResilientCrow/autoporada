import { describe, expect, it } from 'vitest';

import { DEFAULT_DEADLINE } from '@/domain/calendar';
import { porada, rules } from '@/ui/copy';

import {
  dropFormId,
  dropHeir,
  dropInput,
  moveFormId,
  moveInput,
  moveNote,
  moveRange,
  type PlanCalendar,
} from './calendar-acts';

const row = (monday: string, status: 'open' | 'generated' = 'open') => ({
  monday,
  meetingDate: monday,
  // Saturday before, 20.00 Prague (19.00 UTC in November).
  deadlineAt: new Date(Date.parse(`${monday}T19:00:00Z`) - 2 * 864e5).toISOString(),
  status,
});

/** Tuesday 3 November 2026, 11.00 in Prague; poradas on 9, 16 and 23 November, the rest virtual. */
const calendar = (
  issues: PlanCalendar['issues'] = [row('2026-11-09'), row('2026-11-16'), row('2026-11-23')],
): PlanCalendar => ({
  issues,
  now: '2026-11-03T10:00:00.000Z',
  rule: DEFAULT_DEADLINE,
  plannedThrough: '2026-11-23',
});
const MONDAY = '2026-11-09';

const data = (entries: Record<string, string>) => {
  const out = new FormData();
  for (const [k, v] of Object.entries(entries)) out.set(k, v);
  return out;
};

describe('form ids', () => {
  it('are unique per porada and per act', () => {
    expect(new Set([moveFormId(MONDAY), dropFormId(MONDAY), moveFormId('2026-11-16')]).size).toBe(
      3,
    );
  });
});

describe('moveRange', () => {
  it('runs from today to the day before the next porada', () => {
    expect(moveRange(calendar(), MONDAY)).toEqual({ min: '2026-11-03', max: '2026-11-15' });
  });

  it('starts the day after the previous porada', () => {
    expect(moveRange(calendar(), '2026-11-16')).toEqual({ min: '2026-11-10', max: '2026-11-22' });
  });

  it('is null for a porada outside the calendar', () => {
    expect(moveRange(calendar(), '2030-01-07')).toBeNull();
  });
});

describe('moveNote', () => {
  const note = (typed: string, cal = calendar()) => moveNote(cal, MONDAY, typed);

  it('says the new day and its deadline for a day that works', () => {
    expect(note('2026-11-10')).toEqual({
      refused: false,
      line: porada.move.effect('úterý 10. listopadu 2026', 'neděle 8.\u00a011. v\u00a020:00'),
    });
  });

  it.each([
    ['early', '2026-11-02', porada.move.refused.early('3. 11. 2026')],
    ['late', '2026-11-20', porada.move.refused.late('15. 11. 2026')],
    ['same', '2026-11-09', porada.move.refused.same],
    ['porada-exists', '2026-11-16', porada.move.refused['porada-exists']],
    ['deadline-past', '2026-11-04', rules['deadline-past']],
  ])('refuses %s with its sentence', (_name, typed, line) => {
    expect(note(typed)).toEqual({ refused: true, line });
  });

  it('refuses a generated porada as not open', () => {
    const cal = calendar([row(MONDAY, 'generated'), row('2026-11-16'), row('2026-11-23')]);
    expect(note('2026-11-10', cal)).toEqual({ refused: true, line: rules['issue-not-open'] });
  });

  it('says nothing for an empty or impossible day, or a porada outside the calendar', () => {
    expect(note('')).toBeNull();
    expect(note('2026-02-30')).toBeNull();
    expect(moveNote(calendar(), '2030-01-07', '2026-11-10')).toBeNull();
  });
});

describe('moveInput', () => {
  it('sends the day and the version', () => {
    expect(moveInput(MONDAY, 3, data({ meetingDate: '2026-11-10' }))).toEqual({
      monday: MONDAY,
      meetingDate: '2026-11-10',
      expectedVersion: 3,
    });
  });

  it('leaves out the version of a Monday without a row', () => {
    expect(moveInput(MONDAY, null, data({ meetingDate: '2026-11-10' }))).toEqual({
      monday: MONDAY,
      meetingDate: '2026-11-10',
    });
  });
});

describe('dropInput', () => {
  it('sends the confirmation only when ticked', () => {
    expect(dropInput(MONDAY, 3, data({ confirmed: 'on' }))).toEqual({
      monday: MONDAY,
      expectedVersion: 3,
      confirmed: true,
    });
    expect(dropInput(MONDAY, null, data({}))).toEqual({ monday: MONDAY });
  });
});

describe('dropHeir', () => {
  it('names the next stored porada', () => {
    expect(dropHeir(calendar(), MONDAY)).toEqual({
      monday: '2026-11-16',
      meeting: 'pondělí 16. listopadu 2026',
    });
  });

  it('takes a generated next porada as the heir too', () => {
    const cal = calendar([row(MONDAY), row('2026-11-16', 'generated')]);
    expect(dropHeir(cal, MONDAY)?.monday).toBe('2026-11-16');
  });

  it('names the virtual Monday after the last stored porada', () => {
    expect(dropHeir(calendar(), '2026-11-23')).toEqual({
      monday: '2026-11-30',
      meeting: 'pondělí 30. listopadu 2026',
    });
  });

  it('is null for a porada outside the calendar, and for one that is not open', () => {
    expect(dropHeir(calendar(), '2030-01-07')).toBeNull();
    expect(dropHeir(calendar([row(MONDAY, 'generated')]), MONDAY)).toBeNull();
  });
});
