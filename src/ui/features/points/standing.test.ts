import { describe, expect, it } from 'vitest';

import { DEFAULT_DEADLINE, issueSlots, pointMonday, type LateFacts } from '@/domain/calendar';
import { addDays, parseIsoDate, parseWallTime, toIsoDate } from '@/domain/time';
import { cs } from '@/ui/copy';

import {
  placementYear,
  reportFactsOf,
  standingOf,
  standingText,
  type StandingInput,
} from './standing';

const NB = '\u00a0';
const { soon } = cs.points.standing;

/** Mondays of March 2027 (the 15th is one): the Czech clocks are on winter time until the 28th. */
const issue = (monday: string, deadlineAt: string, status: 'open' | 'skipped' | 'generated') => ({
  monday,
  deadlineAt,
  status,
  version: 1,
});
const input = (
  now: string,
  submitMonday: string,
  issues: StandingInput['issues'] = [],
): StandingInput => ({ submitMonday, issues, now, rule: DEFAULT_DEADLINE });

const textOf = (given: StandingInput, report?: LateFacts) => {
  const standing = standingOf(given, report);
  return standing === null ? null : standingText(standing);
};

describe('the standing line before the deadline', () => {
  // Tuesday 9 March 2027, 11.00: the porada of the 15th closes on Saturday the 13th at 20.00.
  const TUESDAY = input('2027-03-09T10:00:00.000Z', '2027-03-15');

  it('names the porada the point goes to and its deadline, with the weekday', () => {
    expect(textOf(TUESDAY)).toEqual({
      text: `Zařadíme do porady z${NB}15.${NB}3. Uzávěrka: sobota 13.${NB}3. v${NB}20.00.`,
      urgent: false,
    });
  });

  it('leaves the year out of both dates and uses no plain space inside them', () => {
    const { text } = textOf(TUESDAY)!;
    expect(text).not.toContain('2027');
    expect(text).toContain(`15.${NB}3.`);
    expect(text).not.toMatch(/\d\. \d/);
  });

  it('takes the deadline from the row when it differs from the computed one', () => {
    // The row's deadline stayed on Monday 08.00 (a deadline already shown never moves).
    const row = issue('2027-03-15', '2027-03-15T07:00:00.000Z', 'open');
    const result = textOf(input('2027-03-09T10:00:00.000Z', '2027-03-15', [row]));
    expect(result?.text).toBe(
      `Zařadíme do porady z${NB}15.${NB}3. Uzávěrka: pondělí 15.${NB}3. v${NB}8.00.`,
    );
  });

  it('names the Monday after a skipped one', () => {
    const skipped = issue('2027-03-15', '2027-03-13T19:00:00.000Z', 'skipped');
    const result = textOf(input('2027-03-09T10:00:00.000Z', '2027-03-15', [skipped]));
    expect(result?.text).toBe(
      `Zařadíme do porady z${NB}22.${NB}3. Uzávěrka: sobota 20.${NB}3. v${NB}20.00.`,
    );
  });

  it('moves past a generated issue too', () => {
    const generated = issue('2027-03-15', '2027-03-13T19:00:00.000Z', 'generated');
    expect(textOf(input('2027-03-09T10:00:00.000Z', '2027-03-15', [generated]))?.text).toContain(
      `porady z${NB}22.${NB}3.`,
    );
  });

  it('is the before text on the Tuesday after the meeting, for the next porada', () => {
    const result = textOf(input('2027-03-16T08:00:00.000Z', '2027-03-22'));
    expect(result?.text).toBe(
      `Zařadíme do porady z${NB}22.${NB}3. Uzávěrka: sobota 20.${NB}3. v${NB}20.00.`,
    );
  });
});

describe('the last 24 hours', () => {
  // The deadline is Saturday 13 March 2027, 20.00 = 19.00 UTC.
  const at = (now: string) => textOf(input(now, '2027-03-15'));

  it.each([
    ['25 hours before', '2027-03-12T18:00:00.000Z', false],
    ['24 hours and a minute before', '2027-03-12T18:59:00.000Z', false],
    ['exactly 24 hours before', '2027-03-12T19:00:00.000Z', false],
    ['24 hours minus a minute before', '2027-03-12T19:01:00.000Z', true],
    ['a minute before', '2027-03-13T18:59:00.000Z', true],
  ])('%s: urgent is %s', (_name, now, urgent) => {
    expect(at(now)?.urgent).toBe(urgent);
  });

  // The computed deadline is Saturday 13 March 20.00 (19.00 UTC); the row kept Monday 15 March 08.00 (07.00 UTC).
  const ROW = issue('2027-03-15', '2027-03-15T07:00:00.000Z', 'open');

  it('measures against the deadline of the row, not the computed one', () => {
    // 21 hours before the computed deadline, 57 before the row's: only the row's counts.
    const result = textOf(input('2027-03-12T22:00:00.000Z', '2027-03-15', [ROW]));
    expect(result?.urgent).toBe(false);
  });

  it('is urgent in the last 24 hours of the deadline of the row', () => {
    // 12 hours before the row's deadline, which is after the computed one.
    const result = textOf(input('2027-03-14T19:00:00.000Z', '2027-03-15', [ROW]));
    expect(result?.urgent).toBe(true);
  });

  it('measures against the deadline of the porada the point goes to', () => {
    // 15 March is skipped: the point goes to the 22nd, whose deadline is a week later.
    const skipped = issue('2027-03-15', '2027-03-13T19:00:00.000Z', 'skipped');
    const result = textOf(input('2027-03-13T10:00:00.000Z', '2027-03-15', [skipped]));
    expect(result?.urgent).toBe(false);
  });

  it('says so in words, in the catalogue', () => {
    expect(soon).toBe(`Do uzávěrky zbývá méně než 24${NB}hodin.`);
  });
});

describe('the standing line after the deadline', () => {
  it.each([
    ['on the Saturday evening at 20.00', '2027-03-13T19:00:00.000Z'],
    ['on the Sunday', '2027-03-14T17:30:00.000Z'],
  ])('%s says the porada of the 15th has closed', (_when, now) => {
    // The submit Monday is the 22nd.
    const result = textOf(input(now, '2027-03-22'));
    expect(result).toEqual({
      text: `Uzávěrka porady z${NB}15.${NB}3. už proběhla. Bod půjde do porady z${NB}22.${NB}3.`,
      urgent: false,
    });
  });

  it('on the meeting Monday itself says the same', () => {
    const result = textOf(input('2027-03-15T08:00:00.000Z', '2027-03-22'));
    expect(result?.text).toBe(
      `Uzávěrka porady z${NB}15.${NB}3. už proběhla. Bod půjde do porady z${NB}22.${NB}3.`,
    );
  });

  it('is over on the Tuesday after: the porada has happened', () => {
    const result = textOf(input('2027-03-16T08:00:00.000Z', '2027-03-22'));
    expect(result?.text).toContain('Zařadíme do porady');
  });

  it('names the Monday after a skipped one as the porada the point goes to', () => {
    const skipped = issue('2027-03-22', '2027-03-20T19:00:00.000Z', 'skipped');
    const result = textOf(input('2027-03-14T17:30:00.000Z', '2027-03-22', [skipped]));
    expect(result?.text).toBe(
      `Uzávěrka porady z${NB}15.${NB}3. už proběhla. Bod půjde do porady z${NB}29.${NB}3.`,
    );
  });

  it('names the porada that closed even when the Monday after it is skipped', () => {
    // Sunday 14 March 2027, 18.30: the 15th has closed, the 22nd is skipped, so hand-ins go to
    // the 29th (the submit Monday the window names); the line still says the 15th has closed.
    const skipped = issue('2027-03-22', '2027-03-20T19:00:00.000Z', 'skipped');
    const result = textOf(input('2027-03-14T17:30:00.000Z', '2027-03-29', [skipped]));
    expect(result?.text).toBe(
      `Uzávěrka porady z${NB}15.${NB}3. už proběhla. Bod půjde do porady z${NB}29.${NB}3.`,
    );
  });

  it('does not talk about a closed porada that is skipped: nobody meets', () => {
    const skipped = issue('2027-03-15', '2027-03-13T19:00:00.000Z', 'skipped');
    const result = textOf(input('2027-03-15T08:00:00.000Z', '2027-03-22', [skipped]));
    expect(result?.text).toBe(
      `Zařadíme do porady z${NB}22.${NB}3. Uzávěrka: sobota 20.${NB}3. v${NB}20.00.`,
    );
  });
});

describe('without an open Monday', () => {
  it('has no standing when the 26 Mondays are all skipped', () => {
    const first = parseIsoDate('2027-03-15');
    const issues = Array.from({ length: 27 }, (_, week) =>
      issue(toIsoDate(addDays(first, 7 * week)), '2027-03-13T19:00:00.000Z', 'skipped'),
    );
    expect(standingOf(input('2027-03-09T10:00:00.000Z', '2027-03-15', issues))).toBeNull();
  });
});

describe('the school year of the paper', () => {
  it('is the year of the porada the point goes to, not of today', () => {
    // Sunday 29 August 2027, 21.00: the porada of 30 August has closed, the point goes to 6 September.
    const standing = standingOf(input('2027-08-29T19:00:00.000Z', '2027-09-06'));
    expect(placementYear(standing, '2026/2027')).toBe('2027/2028');
  });

  it('falls back to the given year without a standing', () => {
    expect(placementYear(null, '2026/2027')).toBe('2026/2027');
  });
});

describe('the line and the porada a resubmit lands in', () => {
  it('names the Monday pointMonday gives a point handed in again at that instant', () => {
    // Sunday 25 October 2026, 21.00: the porada of the 26th has closed. A point first handed in
    // for the 26th, retracted and sent again now, goes where the line says: the 2nd of November.
    const now = new Date('2026-10-25T20:00:00.000Z');
    const standing = standingOf(input(now.toISOString(), '2026-11-02'));
    const point = { earliest: parseIsoDate('2026-10-26'), handIn: parseIsoDate('2026-11-02') };
    const landed = pointMonday(
      point,
      parseIsoDate('2026-10-25'),
      issueSlots([], parseIsoDate('2026-10-25'), DEFAULT_DEADLINE),
    );
    expect(landed && toIsoDate(landed)).toBe('2026-11-02');
    expect(standing && toIsoDate(standing.placement)).toBe('2026-11-02');
  });
});

describe('the standing line of a report on a late event', () => {
  // Sunday 1 November 2026 21.00: after the Saturday 31 October 20.00 deadline of the 2nd, so the
  // report closes at 23.00 that Sunday (CET, UTC+1) and still goes to the porada of the 2nd.
  const ENDS_SUNDAY: LateFacts = {
    lastDay: parseIsoDate('2026-11-01'),
    timeTo: parseWallTime('21:00'),
  };
  const LATE = `Zprávu odevzdejte do 1.${NB}11. v${NB}23.00; půjde na poradu 2.${NB}11.`;
  // The wire without the report: its submit Monday is the 9th once the Saturday deadline has passed.
  const wire = (now: string) => input(now, '2026-11-09');

  it('names the close and the porada on Sunday 21.30, when the plain line says closed', () => {
    const now = '2026-11-01T20:30:00.000Z';
    expect(textOf(wire(now))?.text).toContain(`už proběhla`);
    expect(textOf(wire(now), ENDS_SUNDAY)).toEqual({ text: LATE, urgent: true });
  });

  it('says the same on the Saturday evening, just after the deadline', () => {
    // Saturday 31 October 21.00: the deadline of the 2nd (20.00) is past, so the wire says the 9th.
    const given = wire('2026-10-31T20:00:00.000Z');
    expect(textOf(given)?.text).toContain('už proběhla');
    expect(textOf(given, ENDS_SUNDAY)?.text).toBe(LATE);
  });

  it('says the same on the Wednesday before, when the deadline is still ahead', () => {
    const given = input('2026-10-28T10:00:00.000Z', '2026-11-02');
    expect(textOf(given, ENDS_SUNDAY)).toEqual({ text: LATE, urgent: false });
  });

  it.each([
    ['exactly 24 hours before the close', '2026-10-31T22:00:00.000Z', false],
    ['a minute inside the last 24 hours', '2026-10-31T22:01:00.000Z', true],
  ])('warns as the plain line does: %s is urgent %s', (_name, now, urgent) => {
    expect(textOf(wire(now), ENDS_SUNDAY)?.urgent).toBe(urgent);
  });

  it.each([
    ['ending at 22.30 (capped from 0.30)', '22:30'],
    ['ending at 23.30 (capped from 1.30)', '23:30'],
    ['ending at 22.00 (exactly midnight)', '22:00'],
  ])('writes the cap as 24.00 of the Sunday, not 0.00 of the Monday: %s', (_name, end) => {
    const facts: LateFacts = { lastDay: parseIsoDate('2026-11-01'), timeTo: parseWallTime(end) };
    expect(textOf(wire('2026-11-01T20:30:00.000Z'), facts)?.text).toBe(
      `Zprávu odevzdejte do 1.${NB}11. ve${NB}24.00; půjde na poradu 2.${NB}11.`,
    );
  });

  it('is the plain line again once the close has passed', () => {
    const now = '2026-11-01T23:30:00.000Z'; // Monday 00.30
    expect(textOf(wire(now), ENDS_SUNDAY)).toEqual(textOf(wire(now)));
    expect(textOf(wire(now), ENDS_SUNDAY)?.text).toContain(`porady z${NB}9.${NB}11.`);
  });

  it('is the plain line for an event that ended before the deadline', () => {
    const early: LateFacts = {
      lastDay: parseIsoDate('2026-10-30'),
      timeTo: parseWallTime('10:00'),
    };
    const given = input('2026-10-28T10:00:00.000Z', '2026-11-02');
    expect(textOf(given, early)).toEqual(textOf(given));
  });

  it('is the plain line for an event on the meeting day itself', () => {
    const monday: LateFacts = { lastDay: parseIsoDate('2026-11-02'), timeTo: null };
    const given = input('2026-10-28T10:00:00.000Z', '2026-11-02');
    expect(textOf(given, monday)).toEqual(textOf(given));
  });

  it('is the plain line when the porada the report would reach is skipped', () => {
    const skipped = issue('2026-11-02', '2026-10-31T19:00:00.000Z', 'skipped');
    const given = input('2026-11-01T20:30:00.000Z', '2026-11-09', [skipped]);
    expect(textOf(given, ENDS_SUNDAY)).toEqual(textOf(given));
  });

  it('closes at 20.00 + 2 h without an end time', () => {
    const noTime: LateFacts = { lastDay: parseIsoDate('2026-11-01'), timeTo: null };
    expect(textOf(wire('2026-11-01T20:30:00.000Z'), noTime)?.text).toBe(
      `Zprávu odevzdejte do 1.${NB}11. v${NB}22.00; půjde na poradu 2.${NB}11.`,
    );
  });

  it('follows the stored deadline of the porada: one after the report close makes it not late', () => {
    // The row's deadline is Sunday 23.30, after the report's close (23.00): nothing is late.
    const row = issue('2026-11-02', '2026-11-01T22:30:00.000Z', 'open');
    const given = input('2026-11-01T20:30:00.000Z', '2026-11-02', [row]);
    expect(textOf(given, ENDS_SUNDAY)).toEqual(textOf(given));
    expect(textOf(given, ENDS_SUNDAY)?.text).toBe(
      `Zařadíme do porady z${NB}2.${NB}11. Uzávěrka: neděle 1.${NB}11. v${NB}23.30.`,
    );
  });

  it('is late for a stored deadline that lies before the close', () => {
    const row = issue('2026-11-02', '2026-11-01T21:30:00.000Z', 'open'); // Sunday 22.30
    const given = input('2026-11-01T20:30:00.000Z', '2026-11-09', [row]);
    expect(textOf(given, ENDS_SUNDAY)?.text).toBe(LATE);
  });

  it('places the report on the porada of the 2nd, which is what the preview year follows', () => {
    const standing = standingOf(wire('2026-11-01T20:30:00.000Z'), ENDS_SUNDAY);
    expect(standing && standing.placement).toEqual(parseIsoDate('2026-11-02'));
  });
});

describe('reportFactsOf', () => {
  const typed = { eventDate: '2026-11-01', endDate: null, timeTo: '21:00' };

  it('reads the typed day and end time of a report', () => {
    expect(reportFactsOf('report', typed)).toEqual({
      lastDay: parseIsoDate('2026-11-01'),
      timeTo: parseWallTime('21:00'),
    });
  });

  it('takes the end day when it is later than the start', () => {
    const facts = reportFactsOf('report', { ...typed, endDate: '2026-11-03' });
    expect(facts?.lastDay).toEqual(parseIsoDate('2026-11-03'));
  });

  it.each([
    ['a finance proposal', 'finance' as const, typed],
    ['a report without a start date', 'report' as const, { ...typed, eventDate: null }],
    [
      'a report with a date that does not exist',
      'report' as const,
      { ...typed, eventDate: '2026-02-30' },
    ],
    ['no content', 'report' as const, null],
  ])('is none for %s', (_name, kind, content) => {
    expect(reportFactsOf(kind, content)).toBeUndefined();
  });

  it('ignores an end time that is not one', () => {
    expect(reportFactsOf('report', { ...typed, timeTo: '25:99' })?.timeTo).toBeNull();
  });
});
