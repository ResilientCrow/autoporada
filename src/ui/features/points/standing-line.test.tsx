import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DEFAULT_DEADLINE, type LateFacts } from '@/domain/calendar';
import { parseIsoDate, parseWallTime } from '@/domain/time';
import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { StandingLine } from './StandingLine';
import type { StandingInput } from './standing';

const NB = '\u00a0';
const input = (now: string, submitMonday: string): StandingInput => ({
  submitMonday,
  issues: [],
  now,
  rule: DEFAULT_DEADLINE,
});
const render = (given: StandingInput, report?: LateFacts) =>
  renderToStaticMarkup(<StandingLine standing={given} report={report} />);

describe('StandingLine', () => {
  it('writes the porada and the deadline in one paragraph', () => {
    const html = render(input('2027-03-09T10:00:00.000Z', '2027-03-15'));
    expect(html).toContain(
      `Zařadíme do porady z${NB}15.${NB}3. Uzávěrka: sobota 13.${NB}3. v${NB}20.00.`,
    );
    expect(html).toMatch(/^<p[ >]/);
    expect(html).not.toContain(cs.points.standing.soon);
    expect(html).not.toContain('bg-accent');
  });

  it('adds the warning with the accent in the last 24 hours', () => {
    const html = render(input('2027-03-13T10:00:00.000Z', '2027-03-15'));
    expect(html).toContain(`Zařadíme do porady z${NB}15.${NB}3.`);
    expect(html).toContain(cs.points.standing.soon);
    expect(html).toContain('bg-accent');
  });

  it('says the deadline has passed after it, with no warning', () => {
    const html = render(input('2027-03-14T17:30:00.000Z', '2027-03-22'));
    expect(html).toContain(
      `Uzávěrka porady z${NB}15.${NB}3. už proběhla. Bod půjde do porady z${NB}22.${NB}3.`,
    );
    expect(html).not.toContain(cs.points.standing.soon);
  });

  it('renders nothing when no porada is open', () => {
    const issues = Array.from({ length: 27 }, (_, week) => ({
      monday: new Date(Date.UTC(2027, 2, 15 + 7 * week)).toISOString().slice(0, 10),
      meetingDate: new Date(Date.UTC(2027, 2, 15 + 7 * week)).toISOString().slice(0, 10),
      deadlineAt: '2027-03-13T19:00:00.000Z',
      status: 'skipped' as const,
      version: 1,
    }));
    expect(render({ ...input('2027-03-09T10:00:00.000Z', '2027-03-15'), issues })).toBe('');
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(render(input('2027-03-13T10:00:00.000Z', '2027-03-15')))).toEqual([]);
  });

  it('writes the close of a late report and its porada, with the warning in its last 24 hours', () => {
    // Sunday 1 November 2026, 21.30: the event ended at 21.00, the report is owed until 23.00.
    const report: LateFacts = {
      lastDay: parseIsoDate('2026-11-01'),
      timeTo: parseWallTime('21:00'),
    };
    const given = input('2026-11-01T20:30:00.000Z', '2026-11-09');
    const html = render(given, report);
    expect(html).toContain(
      `Zprávu odevzdejte do 1.${NB}11. v${NB}23.00; půjde na poradu 2.${NB}11.`,
    );
    expect(html).not.toContain('už proběhla');
    expect(html).toContain(cs.points.standing.soon);
    expect(html).toMatch(/^<p[ >]/);
    expect(cspMarkupProblems(html)).toEqual([]);
    expect(render(given)).toContain('už proběhla');
  });
});
