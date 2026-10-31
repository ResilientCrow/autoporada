import { describe, expect, it } from 'vitest';

import { DEFAULT_DEADLINE, issueSlots, pointMonday } from '@/domain/calendar';
import { addDays, parseIsoDate, toIsoDate } from '@/domain/time';
import { cs } from '@/ui/copy';

import { placementYear, standingOf, standingText, type StandingInput } from './standing';

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

const textOf = (given: StandingInput) => {
  const standing = standingOf(given);
  return standing === null ? null : standingText(standing);
};

describe('the standing line before the deadline', () => {
  // Tuesday 9 March 2027, 11.00: the porada of the 15th closes on Sunday the 14th at 18.00.
  const TUESDAY = input('2027-03-09T10:00:00.000Z', '2027-03-15');

  it('names the porada the point goes to and its deadline, with the weekday', () => {
    expect(textOf(TUESDAY)).toEqual({
      text: `Zařadíme do porady z${NB}15.${NB}3. Uzávěrka: neděle 14.${NB}3. v${NB}18.00.`,
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
    const skipped = issue('2027-03-15', '2027-03-14T17:00:00.000Z', 'skipped');
    const result = textOf(input('2027-03-09T10:00:00.000Z', '2027-03-15', [skipped]));
    expect(result?.text).toBe(
      `Zařadíme do porady z${NB}22.${NB}3. Uzávěrka: neděle 21.${NB}3. v${NB}18.00.`,
    );
  });

  it('moves past a generated issue too', () => {
    const generated = issue('2027-03-15', '2027-03-14T17:00:00.000Z', 'generated');
    expect(textOf(input('2027-03-09T10:00:00.000Z', '2027-03-15', [generated]))?.text).toContain(
      `porady z${NB}22.${NB}3.`,
    );
  });

  it('is the before text on the Tuesday after the meeting, for the next porada', () => {
    const result = textOf(input('2027-03-16T08:00:00.000Z', '2027-03-22'));
    expect(result?.text).toBe(
      `Zařadíme do porady z${NB}22.${NB}3. Uzávěrka: neděle 21.${NB}3. v${NB}18.00.`,
    );
  });
});

describe('the last 24 hours', () => {
  // The deadline is Sunday 14 March 2027, 18.00 = 17.00 UTC.
  const at = (now: string) => textOf(input(now, '2027-03-15'));

  it.each([
    ['25 hours before', '2027-03-13T16:00:00.000Z', false],
    ['24 hours and a minute before', '2027-03-13T16:59:00.000Z', false],
    ['exactly 24 hours before', '2027-03-13T17:00:00.000Z', false],
    ['24 hours minus a minute before', '2027-03-13T17:01:00.000Z', true],
    ['a minute before', '2027-03-14T16:59:00.000Z', true],
  ])('%s: urgent is %s', (_name, now, urgent) => {
    expect(at(now)?.urgent).toBe(urgent);
  });

  // The computed deadline is Sunday 14 March 18.00 (17.00 UTC); the row kept Monday 15 March 08.00 (07.00 UTC).
  const ROW = issue('2027-03-15', '2027-03-15T07:00:00.000Z', 'open');

  it('measures against the deadline of the row, not the computed one', () => {
    // 21 hours before the computed deadline, 35 before the row's: only the row's counts.
    const result = textOf(input('2027-03-13T20:00:00.000Z', '2027-03-15', [ROW]));
    expect(result?.urgent).toBe(false);
  });

  it('is urgent in the last 24 hours of the deadline of the row', () => {
    // 12 hours before the row's deadline, which is after the computed one.
    const result = textOf(input('2027-03-14T19:00:00.000Z', '2027-03-15', [ROW]));
    expect(result?.urgent).toBe(true);
  });

  it('measures against the deadline of the porada the point goes to', () => {
    // 15 March is skipped: the point goes to the 22nd, whose deadline is a week later.
    const skipped = issue('2027-03-15', '2027-03-14T17:00:00.000Z', 'skipped');
    const result = textOf(input('2027-03-14T10:00:00.000Z', '2027-03-15', [skipped]));
    expect(result?.urgent).toBe(false);
  });

  it('says so in words, in the catalogue', () => {
    expect(soon).toBe(`Do uzávěrky zbývá méně než 24${NB}hodin.`);
  });
});

describe('the standing line after the deadline', () => {
  it('on a Sunday evening after 18.00 says the porada of tomorrow has closed', () => {
    // Sunday 14 March 2027, 18.30: the submit Monday is the 22nd.
    const result = textOf(input('2027-03-14T17:30:00.000Z', '2027-03-22'));
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
    const skipped = issue('2027-03-22', '2027-03-21T17:00:00.000Z', 'skipped');
    const result = textOf(input('2027-03-14T17:30:00.000Z', '2027-03-22', [skipped]));
    expect(result?.text).toBe(
      `Uzávěrka porady z${NB}15.${NB}3. už proběhla. Bod půjde do porady z${NB}29.${NB}3.`,
    );
  });

  it('names the porada that closed even when the Monday after it is skipped', () => {
    // Sunday 14 March 2027, 18.30: the 15th has closed, the 22nd is skipped, so hand-ins go to
    // the 29th (the submit Monday the window names); the line still says the 15th has closed.
    const skipped = issue('2027-03-22', '2027-03-21T17:00:00.000Z', 'skipped');
    const result = textOf(input('2027-03-14T17:30:00.000Z', '2027-03-29', [skipped]));
    expect(result?.text).toBe(
      `Uzávěrka porady z${NB}15.${NB}3. už proběhla. Bod půjde do porady z${NB}29.${NB}3.`,
    );
  });

  it('does not talk about a closed porada that is skipped: nobody meets', () => {
    const skipped = issue('2027-03-15', '2027-03-14T17:00:00.000Z', 'skipped');
    const result = textOf(input('2027-03-15T08:00:00.000Z', '2027-03-22', [skipped]));
    expect(result?.text).toBe(
      `Zařadíme do porady z${NB}22.${NB}3. Uzávěrka: neděle 21.${NB}3. v${NB}18.00.`,
    );
  });
});

describe('without an open Monday', () => {
  it('has no standing when the 26 Mondays are all skipped', () => {
    const first = parseIsoDate('2027-03-15');
    const issues = Array.from({ length: 27 }, (_, week) =>
      issue(toIsoDate(addDays(first, 7 * week)), '2027-03-14T17:00:00.000Z', 'skipped'),
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
    const point = { earliest: parseIsoDate('2026-10-26'), submittedAt: now };
    const landed = pointMonday(
      point,
      DEFAULT_DEADLINE,
      now,
      issueSlots([], parseIsoDate('2026-10-25'), DEFAULT_DEADLINE),
    );
    expect(landed && toIsoDate(landed)).toBe('2026-11-02');
    expect(standing && toIsoDate(standing.placement)).toBe('2026-11-02');
  });
});
