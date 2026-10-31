import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { deadline, DEFAULT_DEADLINE } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import type { IssueStatus } from '@/domain/review';
import { addDays, calDate, toIsoDate, type CalDate } from '@/domain/time';

import { setupWorld } from '../../../../test/support/world';
import { issueWindow } from './index';

const world = setupWorld();
const seeder = system('test.seed');

// Tuesday 3 November 2026: the deadline of Monday 2 November (Saturday 31 October 20.00) has passed.
const NOW = new Date('2026-11-03T10:00:00Z');
const CURRENT = calDate(2026, 11, 2);
const SUBMIT = calDate(2026, 11, 9);
const weeks = (monday: CalDate, count: number) => addDays(monday, 7 * count);

const read = (user: UserRecord) => world.run(issueWindow, world.as(user), {});

interface Seed {
  readonly status?: IssueStatus;
  readonly deadlineAt?: Date;
}

/** A row as the world already holds it, made through the repository. */
function seedIssue(monday: CalDate, { status = 'open', deadlineAt }: Seed = {}) {
  return world.tx(seeder, async (tx) => {
    const { issue } = await tx.issues.ensure({
      monday,
      meetingDate: monday,
      schoolYear: schoolYear(monday),
      deadlineAt: deadlineAt ?? deadline(monday, DEFAULT_DEADLINE),
    });
    return status === 'open' ? issue : tx.issues.setStatus(issue.id, issue.version, status);
  });
}

describe('issues.window', () => {
  describe('gate', () => {
    it.each(['pending'] as const)('refuses a %s user', async (role) => {
      world.clock.set(NOW);
      const user = await world.seed.user({ role });
      expect(await read(user)).toEqual({ ok: false, error: { code: 'forbidden' } });
    });

    it.each(['submitter', 'reviewer', 'headmaster'] as const)('lets a %s read', async (role) => {
      world.clock.set(NOW);
      const user = await world.seed.user({ role });
      expect((await read(user)).ok).toBe(true);
    });
  });

  describe('rows', () => {
    it('is an empty list with the computed submit Monday when no issue has a row', async () => {
      world.clock.set(NOW);
      const user = await world.seed.user({ role: 'submitter' });
      expect(await read(user)).toEqual({
        ok: true,
        value: {
          submitMonday: toIsoDate(SUBMIT),
          stripFrom: toIsoDate(SUBMIT),
          issues: [],
          rule: { dayOffset: -2, time: '20:00' },
        },
      });
    });

    it('lists the rows from this week to the last slot Monday, earliest first, as text', async () => {
      world.clock.set(NOW);
      const user = await world.seed.user({ role: 'submitter' });
      const late = await seedIssue(weeks(CURRENT, 25));
      const skipped = await seedIssue(weeks(CURRENT, 2), { status: 'skipped' });
      const current = await seedIssue(CURRENT);
      await seedIssue(weeks(CURRENT, -1));
      await seedIssue(weeks(CURRENT, 26));
      const result = await read(user);
      if (!result.ok) throw new Error('window refused');
      expect(result.value.issues).toEqual([
        {
          monday: '2026-11-02',
          deadlineAt: current.deadlineAt.toISOString(),
          status: 'open',
          version: 1,
        },
        {
          monday: '2026-11-16',
          deadlineAt: skipped.deadlineAt.toISOString(),
          status: 'skipped',
          version: 2,
        },
        {
          monday: toIsoDate(weeks(CURRENT, 25)),
          deadlineAt: late.deadlineAt.toISOString(),
          status: 'open',
          version: 1,
        },
      ]);
    });

    it('ends at the last slot Monday, however far on the submit Monday is', async () => {
      // Saturday 7 November, 21.00 in Prague: the deadline of 9 November has passed, so the submit
      // Monday is 16 November; the rows still end 25 weeks after this week's Monday.
      world.clock.set(new Date('2026-11-07T20:00:00Z'));
      const user = await world.seed.user({ role: 'submitter' });
      const last = await seedIssue(weeks(CURRENT, 25), { status: 'skipped' });
      await seedIssue(weeks(CURRENT, 26), { status: 'skipped' });
      const result = await read(user);
      expect(result).toMatchObject({ ok: true, value: { submitMonday: '2026-11-16' } });
      if (!result.ok) throw new Error('window refused');
      expect(result.value.issues).toEqual([
        {
          monday: toIsoDate(weeks(CURRENT, 25)),
          deadlineAt: last.deadlineAt.toISOString(),
          status: 'skipped',
          version: 2,
        },
      ]);
    });

    it('lets a frozen later deadline keep its Monday as the submit Monday', async () => {
      world.clock.set(NOW);
      const user = await world.seed.user({ role: 'submitter' });
      // Monday 2 November was frozen with a deadline still ahead of Tuesday 3 November.
      await seedIssue(CURRENT, { deadlineAt: new Date('2026-11-05T17:00:00Z') });
      const result = await read(user);
      expect(result).toMatchObject({ ok: true, value: { submitMonday: '2026-11-02' } });
    });

    it('steps over a skipped Monday when naming the submit Monday, and keeps it where the strips start', async () => {
      world.clock.set(NOW);
      const user = await world.seed.user({ role: 'submitter' });
      await seedIssue(SUBMIT, { status: 'skipped' });
      expect(await read(user)).toMatchObject({
        ok: true,
        value: { submitMonday: '2026-11-16', stripFrom: '2026-11-09' },
      });
    });

    it('starts the strips at a generated head Monday too', async () => {
      world.clock.set(NOW);
      const user = await world.seed.user({ role: 'submitter' });
      await seedIssue(SUBMIT, { status: 'generated' });
      expect(await read(user)).toMatchObject({
        ok: true,
        value: { submitMonday: '2026-11-16', stripFrom: '2026-11-09' },
      });
    });
  });

  // The deadline is Saturday 20.00 Prague time (19.00 UTC in November).
  it.each([
    ['just before Saturday 20.00', '2026-11-07T18:59:59Z', '2026-11-09'],
    ['at Saturday 20.00', '2026-11-07T19:00:00Z', '2026-11-16'],
  ])('moves the submit Monday on at the deadline: %s', async (_name, now, monday) => {
    world.clock.set(new Date(now));
    const user = await world.seed.user({ role: 'submitter' });
    expect(await read(user)).toMatchObject({ ok: true, value: { submitMonday: monday } });
  });

  describe('with a stored deadline rule', () => {
    const STORED = { dayOffset: -3, time: '12:00' };

    it('returns the rule in force', async () => {
      world.clock.set(NOW);
      await world.seed.setting('deadline', STORED);
      const user = await world.seed.user({ role: 'submitter' });
      expect(await read(user)).toMatchObject({ ok: true, value: { rule: STORED } });
    });

    // Friday 6 November 13.00 Prague: past 12.00 of the Friday the stored rule counts, before the
    // default Saturday 20.00.
    it.each([
      ['the stored rule', STORED, '2026-11-16'],
      ['the default', undefined, '2026-11-09'],
    ])('names the submit Monday by %s', async (_name, rule, monday) => {
      world.clock.set(new Date('2026-11-06T12:00:00Z'));
      if (rule) await world.seed.setting('deadline', rule);
      const user = await world.seed.user({ role: 'submitter' });
      expect(await read(user)).toMatchObject({
        ok: true,
        value: { submitMonday: monday, stripFrom: monday },
      });
    });

    it('keeps the frozen deadline of a stored row and counts only the virtual Mondays by the rule', async () => {
      world.clock.set(new Date('2026-11-06T12:00:00Z'));
      await world.seed.setting('deadline', STORED);
      await seedIssue(SUBMIT);
      const user = await world.seed.user({ role: 'submitter' });
      expect(await read(user)).toMatchObject({
        ok: true,
        value: { submitMonday: '2026-11-09', issues: [{ monday: '2026-11-09' }] },
      });
    });
  });

  it('writes nothing: a read makes no row and no audit event', async () => {
    world.clock.set(NOW);
    const user = await world.seed.user({ role: 'headmaster' });
    await read(user);
    const rows = await world.tx(
      seeder,
      (tx) => tx.issues.between(calDate(2020, 1, 6), calDate(2035, 1, 1)),
      'read',
    );
    expect(rows).toEqual([]);
    expect(await world.inspect.audit()).toEqual([]);
  });
});
