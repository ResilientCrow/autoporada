import { describe, expect, it } from 'vitest';

import { system, type IssueRecord, type UserRecord } from '@/application/ports';
import { deadline, DEFAULT_DEADLINE, lastSlotMonday } from '@/domain/calendar';
import { addDays, calDate, instantToWallClock, toIsoDate, type CalDate } from '@/domain/time';
import { schoolYear } from '@/domain/cs';
import type { IssueStatus } from '@/domain/review';

import { setupWorld } from '../../../../test/support/world';
import { setSkipped } from './index';

const world = setupWorld();
const seeder = system('test.seed');

// Tuesday 3 November 2026: the deadline of Monday 2 November (Saturday 31 October 20.00) has passed.
const NOW = new Date('2026-11-03T10:00:00Z');
const CURRENT = calDate(2026, 11, 2);
const SUBMIT = calDate(2026, 11, 9);
const weeks = (monday: CalDate, count: number) => addDays(monday, 7 * count);

const headmaster = () => world.seed.user({ role: 'headmaster' });

type Extra = Record<string, unknown>;
const act = (by: UserRecord, event: 'skip' | 'unskip', monday: CalDate, extra: Extra = {}) =>
  world.run(setSkipped, world.as(by), {
    monday: toIsoDate(monday),
    event,
    confirmed: true,
    ...extra,
  });

interface Seed {
  readonly status?: IssueStatus;
  readonly version?: number;
  readonly deadlineAt?: Date;
  readonly meetingDate?: CalDate;
}

/** A row as the world already holds it: status and version reached through the repository. */
function seedIssue(
  monday: CalDate,
  { status = 'open', version = 1, deadlineAt, meetingDate }: Seed = {},
) {
  return world.tx(seeder, async (tx) => {
    const created = await tx.issues.ensure({
      monday,
      meetingDate: meetingDate ?? monday,
      schoolYear: schoolYear(monday),
      deadlineAt: deadlineAt ?? deadline(monday, DEFAULT_DEADLINE),
    });
    let issue = created.issue;
    if (status !== 'open') issue = await tx.issues.setStatus(issue.id, issue.version, status);
    while (issue.version < version) {
      issue = await tx.issues.setStatus(issue.id, issue.version, issue.status);
    }
    return issue;
  });
}

/** Every issue row, the audit log and the queue, as the system sees them. */
const snapshot = () =>
  world.tx(
    seeder,
    async (tx) => ({
      issues: await tx.issues.between(calDate(2020, 1, 6), calDate(2035, 1, 1)),
      audit: await world.inspect.audit(),
      jobs: await world.inspect.jobs(),
    }),
    'read',
  );

/** Expects `run` to fail with `error` and to change nothing anywhere. */
async function refuses(run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot();
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot()).toEqual(before);
}

const invalidMonday = { code: 'invalid-input', fields: { monday: 'invalid' } };
const conflict = { code: 'conflict' };

const rowOf = async (monday: CalDate): Promise<IssueRecord> => {
  const row = (await snapshot()).issues.find(
    (issue) => toIsoDate(issue.monday) === toIsoDate(monday),
  );
  if (!row) throw new Error('no such issue');
  return row;
};

describe('issues.setSkipped', () => {
  describe('gate', () => {
    it.each(['submitter', 'reviewer', 'pending'] as const)(
      'refuses a %s and writes nothing',
      async (role) => {
        world.clock.set(NOW);
        const user = await world.seed.user({ role });
        await refuses(() => act(user, 'skip', SUBMIT), { code: 'forbidden' });
      },
    );

    it('lets the headmaster skip', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      expect((await act(head, 'skip', SUBMIT)).ok).toBe(true);
    });
  });

  describe('machine', () => {
    it('skips an open issue and answers with the new status and version', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      const issue = await seedIssue(SUBMIT);
      expect(await act(head, 'skip', SUBMIT, { expectedVersion: issue.version })).toEqual({
        ok: true,
        value: { status: 'skipped', version: 2 },
      });
      expect(await rowOf(SUBMIT)).toMatchObject({ status: 'skipped', version: 2 });
    });

    it('unskips a skipped issue', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      const issue = await seedIssue(SUBMIT, { status: 'skipped' });
      expect(await act(head, 'unskip', SUBMIT, { expectedVersion: issue.version })).toEqual({
        ok: true,
        value: { status: 'open', version: 3 },
      });
      expect(await rowOf(SUBMIT)).toMatchObject({ status: 'open', version: 3 });
    });

    it.each([
      ['skip', 'skipped'],
      ['unskip', 'open'],
    ] as const)('refuses %s on a %s issue as a conflict', async (event, status) => {
      world.clock.set(NOW);
      const head = await headmaster();
      const issue = await seedIssue(SUBMIT, { status, version: 2 });
      await refuses(() => act(head, event, SUBMIT, { expectedVersion: issue.version }), conflict);
    });

    // Row 34: a generated porada is out of the headmaster's hands, whatever the event.
    it.each(['skip', 'unskip'] as const)(
      'refuses %s on a generated issue as issue-not-open',
      async (event) => {
        world.clock.set(NOW);
        const head = await headmaster();
        const issue = await seedIssue(SUBMIT, { status: 'generated', version: 2 });
        await refuses(() => act(head, event, SUBMIT, { expectedVersion: issue.version }), {
          code: 'rule',
          rule: 'issue-not-open',
        });
      },
    );

    // ADR 0041: a porada brought back after a later one was generated would come out of order.
    it('refuses to unskip a porada once a later one is generated, and still skips one', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      const skipped = await seedIssue(SUBMIT, { status: 'skipped' });
      const open = await seedIssue(weeks(SUBMIT, 1));
      await seedIssue(weeks(SUBMIT, 2), { status: 'generated' });
      await refuses(() => act(head, 'unskip', SUBMIT, { expectedVersion: skipped.version }), {
        code: 'rule',
        rule: 'later-generated',
      });
      expect(
        (await act(head, 'skip', weeks(SUBMIT, 1), { expectedVersion: open.version })).ok,
      ).toBe(true);
    });

    it('unskips a porada after a generated one', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      await seedIssue(CURRENT, { status: 'generated' });
      const skipped = await seedIssue(SUBMIT, { status: 'skipped' });
      expect((await act(head, 'unskip', SUBMIT, { expectedVersion: skipped.version })).ok).toBe(
        true,
      );
    });
  });

  describe('bounds', () => {
    it('refuses a date that is not a Monday as an invalid monday, and writes nothing', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      for (const offset of [1, 3, 6]) {
        await refuses(() => act(head, 'skip', addDays(SUBMIT, offset)), invalidMonday);
      }
    });

    it.each(['2026-02-30', '2026-11-9', 'soon', '0001-01-01', '12026-11-09'])(
      'refuses the text %j without throwing',
      async (monday) => {
        world.clock.set(NOW);
        const head = await headmaster();
        await refuses(
          () => world.run(setSkipped, world.as(head), { monday, event: 'skip', confirmed: true }),
          invalidMonday,
        );
      },
    );

    // Design §3: the calendar starts at this week's Monday; the deadline of a slot does not close it to a skip.
    it('takes this week’s Monday after its deadline, and refuses the Mondays before it', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      await refuses(() => act(head, 'skip', weeks(CURRENT, -1)), invalidMonday);
      await refuses(() => act(head, 'skip', weeks(CURRENT, -10)), invalidMonday);
      expect((await act(head, 'skip', CURRENT)).ok).toBe(true);
    });

    it('takes the submit Monday and the last slot Monday, and not the week after', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      // The horizon of the calendar: 25 weeks after this week's Monday, not after the submit Monday.
      const last = weeks(CURRENT, 25);
      expect(toIsoDate(last)).toBe('2027-04-26');
      await refuses(() => act(head, 'skip', weeks(last, 1)), invalidMonday);
      expect((await act(head, 'skip', SUBMIT)).ok).toBe(true);
      expect((await act(head, 'skip', last)).ok).toBe(true);
    });

    // The deadline is Saturday 20.00 Prague time; daylight saving ends 2026-10-25 and starts 2027-03-28.
    it.each([
      ['just before the deadline', '2026-11-07T18:59:59Z', calDate(2026, 11, 2)],
      ['at the deadline', '2026-11-07T19:00:00Z', calDate(2026, 11, 2)],
      ['just after the deadline', '2026-11-07T19:00:01Z', calDate(2026, 11, 2)],
      [
        'just before the deadline the night before the clocks go back',
        '2026-10-24T17:59:59Z',
        calDate(2026, 10, 19),
      ],
      [
        'after the deadline the night before the clocks go back',
        '2026-10-24T18:00:00Z',
        calDate(2026, 10, 19),
      ],
      [
        'just before the deadline the night before the clocks go forward',
        '2027-03-27T18:59:59Z',
        calDate(2027, 3, 22),
      ],
      [
        'after the deadline the night before the clocks go forward',
        '2027-03-27T19:00:00Z',
        calDate(2027, 3, 22),
      ],
    ])('%s: the window starts at this week’s Monday', async (_label, now, first) => {
      world.clock.set(new Date(now));
      const head = await headmaster();
      await refuses(() => act(head, 'skip', weeks(first, -1)), invalidMonday);
      expect((await act(head, 'skip', first)).ok).toBe(true);
      const last = lastSlotMonday(instantToWallClock(new Date(now)).date);
      expect((await act(head, 'skip', last)).ok).toBe(true);
      await refuses(() => act(head, 'skip', weeks(last, 1)), invalidMonday);
    });

    it('keeps the window by the week, not by a frozen deadline, and leaves that deadline alone', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      const later = new Date('2026-11-04T11:00:00Z');
      await seedIssue(CURRENT, { deadlineAt: later });
      expect((await act(head, 'skip', CURRENT)).ok).toBe(true);
      expect((await act(head, 'skip', weeks(CURRENT, 25))).ok).toBe(true);
      await refuses(() => act(head, 'skip', weeks(CURRENT, 26)), invalidMonday);
      expect((await rowOf(CURRENT)).deadlineAt).toEqual(later);

      // Past that deadline the Monday is still this week's, so the undo stays open.
      world.clock.set(later);
      expect((await act(head, 'unskip', CURRENT, { expectedVersion: 2 })).ok).toBe(true);
    });

    it('keeps a Monday before this week while its meeting is still ahead, and drops it after', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      const before = weeks(CURRENT, -1);
      await seedIssue(before, { meetingDate: calDate(2026, 11, 5) });
      expect((await act(head, 'skip', before)).ok).toBe(true);

      world.clock.set(new Date('2026-11-06T12:00:00Z'));
      await refuses(() => act(head, 'unskip', before, { expectedVersion: 2 }), invalidMonday);
    });
  });

  describe('confirm', () => {
    it.each(['skip', 'unskip'] as const)(
      'asks for the confirmation before %s and writes nothing, not even the row',
      async (event) => {
        world.clock.set(NOW);
        const head = await headmaster();
        await refuses(
          () => world.run(setSkipped, world.as(head), { monday: toIsoDate(SUBMIT), event }),
          { code: 'invalid-input', fields: { confirmed: 'required' } },
        );
        expect((await snapshot()).issues).toEqual([]);
      },
    );

    it('asks for it before it looks at the Monday', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      await refuses(
        () =>
          world.run(setSkipped, world.as(head), {
            monday: toIsoDate(addDays(SUBMIT, 2)),
            event: 'skip',
          }),
        { code: 'invalid-input', fields: { confirmed: 'required' } },
      );
    });

    it('refuses anything but true, an unknown key and a version of zero', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      const base = { monday: toIsoDate(SUBMIT), event: 'skip', confirmed: true };
      const run = (input: Extra) => () => world.run(setSkipped, world.as(head), input);
      await refuses(run({ ...base, confirmed: false }), {
        code: 'invalid-input',
        fields: { confirmed: 'invalid' },
      });
      await refuses(run({ ...base, extra: 1 }), { code: 'invalid-input', fields: {} });
      await refuses(run({ ...base, expectedVersion: 0 }), {
        code: 'invalid-input',
        fields: { expectedVersion: 'invalid' },
      });
      await refuses(run({ ...base, event: 'generate' }), {
        code: 'invalid-input',
        fields: { event: 'invalid' },
      });
    });
  });

  describe('version', () => {
    it('reads a missing version as an untouched issue: a fresh row passes', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      expect(await act(head, 'skip', SUBMIT)).toEqual({
        ok: true,
        value: { status: 'skipped', version: 2 },
      });
    });

    it('passes without a version when the row exists untouched, at version 1', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      await seedIssue(SUBMIT);
      expect((await act(head, 'skip', SUBMIT)).ok).toBe(true);
    });

    it('refuses a missing version when the row has moved on', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      await seedIssue(SUBMIT, { version: 2 });
      await refuses(() => act(head, 'skip', SUBMIT), conflict);
    });

    it.each([1, 3])('refuses the stale or invented version %i of a row at 2', async (version) => {
      world.clock.set(NOW);
      const head = await headmaster();
      await seedIssue(SUBMIT, { version: 2 });
      await refuses(() => act(head, 'skip', SUBMIT, { expectedVersion: version }), conflict);
    });

    it('takes the current version', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      await seedIssue(SUBMIT, { version: 2 });
      expect((await act(head, 'skip', SUBMIT, { expectedVersion: 2 })).ok).toBe(true);
    });

    it('refuses a version for a Monday that has no row, and leaves no row behind', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      await refuses(() => act(head, 'skip', SUBMIT, { expectedVersion: 2 }), conflict);
      expect((await snapshot()).issues).toEqual([]);
    });
  });

  describe('creation', () => {
    it('creates a missing row with the frozen default deadline and the school year', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      expect((await act(head, 'skip', SUBMIT)).ok).toBe(true);
      expect(await rowOf(SUBMIT)).toEqual({
        id: expect.any(String),
        monday: SUBMIT,
        meetingDate: SUBMIT,
        schoolYear: '2026/2027',
        deadlineAt: deadline(SUBMIT, DEFAULT_DEADLINE),
        status: 'skipped',
        version: 2,
      });
      expect((await rowOf(SUBMIT)).deadlineAt).toEqual(new Date('2026-11-07T19:00:00Z'));
    });

    // Friday 6 November 13.00 Prague, with the stored rule 3 days before at 12.00: 9 November is closed, yet skippable.
    it('freezes the deadline by the stored rule', async () => {
      world.clock.set(new Date('2026-11-06T12:00:00Z'));
      await world.seed.setting('deadline', { dayOffset: -3, time: '12:00' });
      const head = await headmaster();
      expect((await act(head, 'skip', SUBMIT)).ok).toBe(true);
      expect((await rowOf(SUBMIT)).deadlineAt).toEqual(new Date('2026-11-06T11:00:00Z'));
      const next = weeks(SUBMIT, 1);
      expect((await act(head, 'skip', next)).ok).toBe(true);
      expect((await rowOf(next)).deadlineAt).toEqual(new Date('2026-11-13T11:00:00Z'));
    });

    it('puts a September Monday in the next school year', async () => {
      world.clock.set(new Date('2027-08-25T10:00:00Z'));
      const head = await headmaster();
      const august = calDate(2027, 8, 30);
      const september = calDate(2027, 9, 6);
      expect((await act(head, 'skip', august)).ok).toBe(true);
      expect((await act(head, 'skip', september)).ok).toBe(true);
      expect((await rowOf(august)).schoolYear).toBe('2026/2027');
      expect((await rowOf(september)).schoolYear).toBe('2027/2028');
    });

    it('keeps the deadline an existing row was frozen with', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      const frozen = new Date('2026-11-08T20:30:00Z');
      await seedIssue(SUBMIT, { deadlineAt: frozen });
      expect((await act(head, 'skip', SUBMIT)).ok).toBe(true);
      expect((await rowOf(SUBMIT)).deadlineAt).toEqual(frozen);
    });
  });

  describe('audit', () => {
    it('records issue.skipped on the issue, with the status change and the Monday', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      expect((await act(head, 'skip', SUBMIT)).ok).toBe(true);
      const { audit, jobs, issues } = await snapshot();
      expect(audit).toEqual([
        {
          actorId: head.id,
          action: 'issue.skipped',
          targetType: 'issue',
          targetId: issues[0]?.id,
          data: {
            diff: { status: { from: 'open', to: 'skipped' } },
            meta: { monday: '2026-11-09' },
          },
          requestId: 'test',
        },
      ]);
      expect(jobs).toEqual([]);
    });

    it('records issue.unskipped', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      const issue = await seedIssue(SUBMIT, { status: 'skipped' });
      expect((await act(head, 'unskip', SUBMIT, { expectedVersion: issue.version })).ok).toBe(true);
      const { audit, jobs } = await snapshot();
      expect(audit).toEqual([
        {
          actorId: head.id,
          action: 'issue.unskipped',
          targetType: 'issue',
          targetId: issue.id,
          data: {
            diff: { status: { from: 'skipped', to: 'open' } },
            meta: { monday: '2026-11-09' },
          },
          requestId: 'test',
        },
      ]);
      expect(jobs).toEqual([]);
    });
  });

  describe('until a chosen porada', () => {
    const invalidUntil = { code: 'invalid-input', fields: { until: 'invalid' } };
    const statuses = async (mondays: readonly CalDate[]) => {
      const { issues } = await snapshot();
      return mondays.map(
        (m) => issues.find((i) => toIsoDate(i.monday) === toIsoDate(m))?.status ?? 'untouched',
      );
    };

    it('skips this porada and every one before the chosen one, which stays open', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      const until = weeks(SUBMIT, 3);
      expect(await act(head, 'skip', SUBMIT, { until: toIsoDate(until) })).toEqual({
        ok: true,
        value: { status: 'skipped', version: 2 },
      });
      expect(
        await statuses([SUBMIT, weeks(SUBMIT, 1), weeks(SUBMIT, 2), until, weeks(SUBMIT, 4)]),
      ).toEqual(['skipped', 'skipped', 'skipped', 'untouched', 'untouched']);
      const { audit } = await snapshot();
      expect(audit.map((a) => [a.action, (a.data as { meta: unknown }).meta])).toEqual([
        ['issue.skipped', { monday: '2026-11-09' }],
        ['issue.skipped', { monday: '2026-11-16' }],
        ['issue.skipped', { monday: '2026-11-23' }],
      ]);
    });

    it('is the plain skip when the chosen porada is the next one', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      expect((await act(head, 'skip', SUBMIT, { until: toIsoDate(weeks(SUBMIT, 1)) })).ok).toBe(
        true,
      );
      expect(await statuses([SUBMIT, weeks(SUBMIT, 1)])).toEqual(['skipped', 'untouched']);
    });

    it('leaves a porada between that is already skipped as it is', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      const between = await seedIssue(weeks(SUBMIT, 1), { status: 'skipped' });
      expect((await act(head, 'skip', SUBMIT, { until: toIsoDate(weeks(SUBMIT, 2)) })).ok).toBe(
        true,
      );
      expect(await rowOf(weeks(SUBMIT, 1))).toMatchObject({
        status: 'skipped',
        version: between.version,
      });
    });

    it.each([
      ['this porada itself', () => SUBMIT],
      ['an earlier porada', () => CURRENT],
      ['a day that is no Monday', () => addDays(weeks(SUBMIT, 2), 2)],
      ['a Monday past the calendar', () => weeks(lastSlotMonday(instantToWallClock(NOW).date), 1)],
    ])('refuses %s as the next porada and writes nothing', async (_name, until) => {
      world.clock.set(NOW);
      const head = await headmaster();
      await refuses(() => act(head, 'skip', SUBMIT, { until: toIsoDate(until()) }), invalidUntil);
    });

    it('refuses a next porada that does not take place itself', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      await seedIssue(weeks(SUBMIT, 2), { status: 'skipped' });
      await refuses(
        () => act(head, 'skip', SUBMIT, { until: toIsoDate(weeks(SUBMIT, 2)) }),
        invalidUntil,
      );
    });

    it('refuses a next porada with the undo', async () => {
      world.clock.set(NOW);
      const head = await headmaster();
      const issue = await seedIssue(SUBMIT, { status: 'skipped' });
      await refuses(
        () =>
          act(head, 'unskip', SUBMIT, {
            expectedVersion: issue.version,
            until: toIsoDate(weeks(SUBMIT, 2)),
          }),
        invalidUntil,
      );
    });
  });
});
