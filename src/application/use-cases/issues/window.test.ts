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

// Tuesday 3 November 2026: the deadline of Monday 2 November (Sunday 18.00) has passed.
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
        value: { submitMonday: toIsoDate(SUBMIT), issues: [] },
      });
    });

    it('lists the rows from this week to 26 weeks on, earliest first, as text', async () => {
      world.clock.set(NOW);
      const user = await world.seed.user({ role: 'submitter' });
      const late = await seedIssue(weeks(CURRENT, 26));
      const skipped = await seedIssue(weeks(CURRENT, 2), { status: 'skipped' });
      const current = await seedIssue(CURRENT);
      await seedIssue(weeks(CURRENT, -1));
      await seedIssue(weeks(CURRENT, 27));
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
          monday: toIsoDate(weeks(CURRENT, 26)),
          deadlineAt: late.deadlineAt.toISOString(),
          status: 'open',
          version: 1,
        },
      ]);
    });

    it('reaches the last Monday a skip may name when the submit Monday is two weeks on', async () => {
      // Sunday 8 November, 19.00 in Prague: the deadline of 9 November has passed, so the submit
      // Monday is 16 November and the window ends 25 weeks later, 27 weeks from this week's Monday.
      world.clock.set(new Date('2026-11-08T18:00:00Z'));
      const user = await world.seed.user({ role: 'submitter' });
      // The end of the first read: `between` is inclusive, so the tail must start a week past it.
      const end = await seedIssue(weeks(CURRENT, 26));
      const last = await seedIssue(weeks(CURRENT, 27), { status: 'skipped' });
      await seedIssue(weeks(CURRENT, 28), { status: 'skipped' });
      const result = await read(user);
      expect(result).toMatchObject({ ok: true, value: { submitMonday: '2026-11-16' } });
      if (!result.ok) throw new Error('window refused');
      expect(result.value.issues).toEqual([
        {
          monday: toIsoDate(weeks(CURRENT, 26)),
          deadlineAt: end.deadlineAt.toISOString(),
          status: 'open',
          version: 1,
        },
        {
          monday: toIsoDate(weeks(CURRENT, 27)),
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

    it('ignores a skipped Monday when naming the submit Monday', async () => {
      world.clock.set(NOW);
      const user = await world.seed.user({ role: 'submitter' });
      await seedIssue(SUBMIT, { status: 'skipped' });
      expect(await read(user)).toMatchObject({ ok: true, value: { submitMonday: '2026-11-09' } });
    });
  });

  // The deadline is Sunday 18.00 Prague time (17.00 UTC in November).
  it.each([
    ['just before Sunday 18.00', '2026-11-08T16:59:59Z', '2026-11-09'],
    ['at Sunday 18.00', '2026-11-08T17:00:00Z', '2026-11-16'],
  ])('moves the submit Monday on at the deadline: %s', async (_name, now, monday) => {
    world.clock.set(new Date(now));
    const user = await world.seed.user({ role: 'submitter' });
    expect(await read(user)).toMatchObject({ ok: true, value: { submitMonday: monday } });
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
