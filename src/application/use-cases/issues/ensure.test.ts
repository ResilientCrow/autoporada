import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { DEFAULT_DEADLINE, type DeadlineRule } from '@/domain/calendar';
import { calDate, parseWallTime, type CalDate } from '@/domain/time';

import { setupWorld } from '../../../../test/support/world';
import { ensureIssue } from './index';

const world = setupWorld();
const seeder = system('test.seed');

const ensure = (monday: CalDate, rule: DeadlineRule = DEFAULT_DEADLINE) =>
  world.tx(seeder, (tx) => ensureIssue(tx, monday, rule));

describe('ensureIssue', () => {
  // The default rule: two days before the meeting date at 20.00 Prague time (Saturday for a Monday).
  it.each([
    ['a plain week', calDate(2026, 11, 9), '2026-11-07T19:00:00.000Z'],
    ['the Monday after the clocks go back', calDate(2026, 10, 26), '2026-10-24T18:00:00.000Z'],
    ['the Monday after the clocks go forward', calDate(2027, 3, 29), '2027-03-27T19:00:00.000Z'],
  ])('freezes Saturday 20.00 before the meeting: %s', async (_name, monday, closes) => {
    const { issue, inserted } = await ensure(monday);
    expect(inserted).toBe(true);
    expect(issue).toMatchObject({ monday, meetingDate: monday, status: 'open' });
    expect(issue.deadlineAt.toISOString()).toBe(closes);
  });

  it('freezes the deadline the rule it is given counts, not the default', async () => {
    // Three days before the meeting at 12.00: Friday 6 November 2026, 11.00Z.
    const rule = { dayOffset: -3, time: parseWallTime('12:00') };
    const { issue } = await ensure(calDate(2026, 11, 9), rule);
    expect(issue.deadlineAt.toISOString()).toBe('2026-11-06T11:00:00.000Z');
  });

  it('hands back the row as it is on the second call, the deadline included', async () => {
    const monday = calDate(2026, 11, 9);
    const first = await ensure(monday);
    const again = await ensure(monday);
    expect(again.inserted).toBe(false);
    expect(again.issue).toEqual(first.issue);
  });

  it('keeps the frozen deadline when it is asked again under another rule', async () => {
    const monday = calDate(2026, 11, 9);
    const first = await ensure(monday);
    const again = await ensure(monday, { dayOffset: -3, time: parseWallTime('12:00') });
    expect(again.issue.deadlineAt).toEqual(first.issue.deadlineAt);
  });
});
