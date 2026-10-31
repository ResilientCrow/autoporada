import { describe, expect, it } from 'vitest';

import { system, type IssueRecord, type UserRecord } from '@/application/ports';
import { lastSlotMonday } from '@/domain/calendar';
import { addDays, calDate, parseIsoDate as d, toIsoDate, type CalDate } from '@/domain/time';

import { issueFixtures } from '../../../../test/support/issues';
import { setupWorld } from '../../../../test/support/world';
import { moveIssue } from './index';

const world = setupWorld();
const fixtures = issueFixtures(world);
const seeder = system('test.seed');

// Monday 19 October 2026, 10.00 Prague (summer time; it ends on the 25th). The deadline of this
// Monday is gone; the next ones are Saturdays 20.00: 24 October (18.00Z) and 31 October (19.00Z).
const TODAY = calDate(2026, 10, 19);
const W1 = calDate(2026, 10, 26);
const W2 = calDate(2026, 11, 2);

const headmaster = () => world.seed.user({ role: 'headmaster' });

interface Move {
  readonly meeting: string;
  readonly deadline?: string;
  readonly time?: string;
  readonly skip?: readonly string[];
  readonly confirmed?: true;
  readonly expectedVersion?: number;
}

/** The move of `monday` to `meeting`, with the deadline of the rule unless given. */
const move = (by: UserRecord, monday: CalDate, m: Move, defaults = '2026-10-24') =>
  world.run(moveIssue, world.as(by), {
    monday: toIsoDate(monday),
    meetingDate: m.meeting,
    deadlineDate: m.deadline ?? defaults,
    deadlineTime: m.time ?? '20:00',
    skip: [...(m.skip ?? [])],
    ...(m.confirmed && { confirmed: m.confirmed }),
    ...(m.expectedVersion !== undefined && { expectedVersion: m.expectedVersion }),
  });

/** Every issue row, the audit log and the queue. */
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

async function refuses(run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot();
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot()).toEqual(before);
}

const rowOf = async (monday: CalDate): Promise<IssueRecord | undefined> =>
  (await snapshot()).issues.find((i) => toIsoDate(i.monday) === toIsoDate(monday));

const orderRule = { code: 'rule', rule: 'meeting-order' };

describe('issues.move', () => {
  describe('gate', () => {
    it.each(['submitter', 'reviewer', 'pending'] as const)(
      'refuses a %s and writes nothing',
      async (role) => {
        const user = await world.seed.user({ role });
        await refuses(() => move(user, W1, { meeting: '2026-10-28' }), { code: 'forbidden' });
      },
    );
  });

  describe('a move without conflicts', () => {
    it('moves the meeting, creates the row for an untouched Monday, and keeps the deadline', async () => {
      const head = await headmaster();
      expect(await move(head, W1, { meeting: '2026-10-28' })).toEqual({
        ok: true,
        value: { version: 2, skipped: 0 },
      });
      const row = await rowOf(W1);
      expect(row).toMatchObject({ meetingDate: d('2026-10-28'), status: 'open', version: 2 });
      expect(row?.deadlineAt).toEqual(new Date('2026-10-24T18:00:00Z'));
    });

    it('sets a hand-picked deadline, in Prague time', async () => {
      const head = await headmaster();
      await move(head, W1, { meeting: '2026-10-28', deadline: '2026-10-23', time: '15:30' });
      expect((await rowOf(W1))?.deadlineAt).toEqual(new Date('2026-10-23T13:30:00Z'));
    });

    it('moves a stored row on its expected version, and refuses an old one', async () => {
      const head = await headmaster();
      const row = await fixtures.issue(W1);
      await refuses(() => move(head, W1, { meeting: '2026-10-28', expectedVersion: 7 }), {
        code: 'conflict',
      });
      const result = await move(head, W1, { meeting: '2026-10-28', expectedVersion: row.version });
      expect(result).toEqual({ ok: true, value: { version: row.version + 1, skipped: 0 } });
      // The version has moved on, so the same call is stale now.
      await refuses(() => move(head, W1, { meeting: '2026-10-29', expectedVersion: row.version }), {
        code: 'conflict',
      });
    });

    it('treats a missing expected version as the untouched row, so a stored row is a conflict', async () => {
      const head = await headmaster();
      const row = await fixtures.issue(W1);
      expect(row.version).toBeGreaterThan(0);
      await fixtures.issue(W2);
      await world.tx(seeder, async (tx) => {
        const r = await tx.issues.between(W2, W2);
        await tx.issues.reschedule(r[0]!.id, r[0]!.version, {
          meetingDate: r[0]!.meetingDate,
          deadlineAt: r[0]!.deadlineAt,
        });
        await tx.audit.record({ action: 'test.seed', target: { type: 'issue', id: r[0]!.id } });
      });
      await refuses(() => move(head, W2, { meeting: '2026-11-03', deadline: '2026-10-31' }), {
        code: 'conflict',
      });
    });

    it('lets today’s porada move with the deadline it already has, though that is past', async () => {
      const head = await headmaster();
      const result = await move(head, TODAY, { meeting: '2026-10-21', deadline: '2026-10-17' });
      expect(result.ok).toBe(true);
    });

    it('moves a porada back to its own Monday', async () => {
      const head = await headmaster();
      await move(head, W1, { meeting: '2026-10-28' });
      const result = await move(head, W1, { meeting: '2026-10-26', expectedVersion: 2 });
      expect(result).toEqual({ ok: true, value: { version: 3, skipped: 0 } });
    });
  });

  describe('bounds', () => {
    it('refuses a date that is no Monday, or is not in the calendar, as an invalid monday', async () => {
      const head = await headmaster();
      const bad = { code: 'invalid-input', fields: { monday: 'invalid' } };
      await refuses(() => move(head, calDate(2026, 10, 27), { meeting: '2026-10-28' }), bad);
      await refuses(() => move(head, addDays(TODAY, -7), { meeting: '2026-10-28' }), bad);
      await refuses(
        () => move(head, addDays(lastSlotMonday(TODAY), 7), { meeting: '2026-10-28' }),
        bad,
      );
    });

    it('refuses a meeting date before today or past the horizon', async () => {
      const head = await headmaster();
      const bad = { code: 'invalid-input', fields: { meetingDate: 'invalid' } };
      await refuses(() => move(head, W1, { meeting: '2026-10-18', deadline: '2026-10-10' }), bad);
      const horizon = addDays(lastSlotMonday(TODAY), 6);
      await refuses(
        () => move(head, W1, { meeting: toIsoDate(addDays(horizon, 1)), deadline: '2026-10-24' }),
        bad,
      );
      const last = await move(head, W1, {
        meeting: toIsoDate(horizon),
        skip: [],
        deadline: '2026-10-24',
      });
      // The far date is in the way of every later porada, so it is refused for that, not for its range.
      expect(last).toMatchObject({ ok: false, error: orderRule });
    });

    it('refuses a deadline that is not before the meeting day', async () => {
      const head = await headmaster();
      const bad = { code: 'invalid-input', fields: { deadlineDate: 'invalid' } };
      await refuses(() => move(head, W1, { meeting: '2026-10-28', deadline: '2026-10-28' }), bad);
      await refuses(() => move(head, W1, { meeting: '2026-10-28', deadline: '2026-10-29' }), bad);
    });

    it('refuses a text that is not a date, or a time that is not a time, without throwing', async () => {
      const head = await headmaster();
      for (const m of [
        { meeting: '2026-02-30' },
        { meeting: '2026-10-28', deadline: 'soon' },
        { meeting: '2026-10-28', time: '24:00' },
        { meeting: '2026-10-28', time: '8:00' },
        { meeting: '2026-10-28', skip: ['2026-13-01'] },
      ]) {
        const before = await snapshot();
        const result = await move(head, W1, m);
        expect(result.ok).toBe(false);
        expect(await snapshot()).toEqual(before);
      }
    });

    it('refuses a deadline already past, other than the one the slot has', async () => {
      const head = await headmaster();
      await refuses(
        () => move(head, W1, { meeting: '2026-10-28', deadline: '2026-10-19', time: '09:00' }),
        {
          code: 'rule',
          rule: 'deadline-past',
        },
      );
      // One minute ahead of now (08.00Z is 10.00 Prague) is still fine.
      const result = await move(head, W1, {
        meeting: '2026-10-28',
        deadline: '2026-10-19',
        time: '10:01',
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('status', () => {
    it.each(['skipped', 'generated'] as const)(
      'refuses a %s slot as issue-not-open',
      async (status) => {
        const head = await headmaster();
        await fixtures.issue(W1, { status });
        await refuses(() => move(head, W1, { meeting: '2026-10-28', expectedVersion: 2 }), {
          code: 'rule',
          rule: 'issue-not-open',
        });
      },
    );
  });

  describe('the meeting order (ADR 0034)', () => {
    const LATE = { meeting: '2026-11-04', deadline: '2026-10-30' };

    it('refuses a move past the next porada while the conflict is not skipped', async () => {
      const head = await headmaster();
      await refuses(() => move(head, W1, LATE), orderRule);
      await refuses(() => move(head, W1, { ...LATE, confirmed: true }), orderRule);
    });

    it('refuses a skip that is not confirmed, and writes nothing', async () => {
      const head = await headmaster();
      await refuses(() => move(head, W1, { ...LATE, skip: ['2026-11-02'] }), orderRule);
    });

    it('cancels the porada in the way when the headmaster confirms it, and says how many', async () => {
      const head = await headmaster();
      const result = await move(head, W1, { ...LATE, skip: ['2026-11-02'], confirmed: true });
      expect(result).toEqual({ ok: true, value: { version: 2, skipped: 1 } });
      expect(await rowOf(W2)).toMatchObject({ status: 'skipped' });
      expect(await rowOf(W1)).toMatchObject({ meetingDate: d('2026-11-04'), status: 'open' });
    });

    it('refuses a skip that is more than the conflicts, as an invalid skip', async () => {
      const head = await headmaster();
      await refuses(
        () => move(head, W1, { ...LATE, skip: ['2026-11-02', '2026-11-16'], confirmed: true }),
        { code: 'invalid-input', fields: { skip: 'invalid' } },
      );
      await refuses(
        () => move(head, W1, { meeting: '2026-10-28', skip: ['2026-11-02'], confirmed: true }),
        { code: 'invalid-input', fields: { skip: 'invalid' } },
      );
    });

    it('refuses a skip that is less than the conflicts', async () => {
      const head = await headmaster();
      await refuses(
        () =>
          move(head, W1, {
            meeting: '2026-11-11',
            deadline: '2026-10-30',
            skip: ['2026-11-02'],
            confirmed: true,
          }),
        orderRule,
      );
    });

    it('cannot cancel a generated porada: it stays in the way whatever is asked', async () => {
      const head = await headmaster();
      await fixtures.issue(W2, { status: 'generated' });
      await refuses(
        () => move(head, W1, { ...LATE, skip: ['2026-11-02'], confirmed: true }),
        orderRule,
      );
    });

    it('ignores a skipped porada: it is out of the order', async () => {
      const head = await headmaster();
      await fixtures.issue(W2, { status: 'skipped' });
      expect((await move(head, W1, LATE)).ok).toBe(true);
    });

    it('cancels the earlier porada when a move goes before it', async () => {
      const head = await headmaster();
      // W2 to the Thursday before W1’s meeting on the 26th... which is before W1 itself.
      const result = await move(head, W2, {
        meeting: '2026-10-22',
        deadline: '2026-10-21',
        time: '20:00',
        skip: ['2026-10-26'],
        confirmed: true,
      });
      expect(result).toEqual({ ok: true, value: { version: 2, skipped: 1 } });
      expect(await rowOf(W1)).toMatchObject({ status: 'skipped' });
    });
  });

  describe('audit, and no notice', () => {
    it('records issue.moved with the Monday, both dates, whether the deadline moved and the count', async () => {
      const head = await headmaster();
      await move(head, W1, { meeting: '2026-10-28', deadline: '2026-10-23' });
      const { audit, issues } = await snapshot();
      expect(audit).toEqual([
        expect.objectContaining({
          actorId: head.id,
          action: 'issue.moved',
          targetType: 'issue',
          targetId: issues[0]?.id,
          data: expect.objectContaining({
            meta: {
              monday: '2026-10-26',
              from: '2026-10-26',
              to: '2026-10-28',
              deadlineMoved: true,
              skipped: 0,
            },
          }),
        }),
      ]);
    });

    it('records issue.skipped with the reason moved for each cancelled porada, before the move itself', async () => {
      const head = await headmaster();
      await move(head, W1, {
        meeting: '2026-11-04',
        deadline: '2026-10-30',
        skip: ['2026-11-02'],
        confirmed: true,
      });
      const { audit } = await snapshot();
      expect(audit.map((e) => e.action)).toEqual(['issue.skipped', 'issue.moved']);
      expect(audit[0]?.data).toMatchObject({
        diff: { status: { from: 'open', to: 'skipped' } },
        meta: { monday: '2026-11-02', reason: 'moved' },
      });
      expect(audit[1]?.data).toMatchObject({
        meta: { monday: '2026-10-26', skipped: 1, deadlineMoved: true },
      });
    });

    it('queues no mail for a deadline that comes earlier and is still ahead (ADR 0037)', async () => {
      const head = await headmaster();
      const result = await move(head, W1, { meeting: '2026-10-28', deadline: '2026-10-23' });
      expect(result.ok).toBe(true);
      expect(await world.inspect.jobs()).toEqual([]);
    });

    it('queues nothing for the same deadline, a later one, or a past one that did not change', async () => {
      const head = await headmaster();
      await move(head, W1, { meeting: '2026-10-28' });
      await move(head, W1, { meeting: '2026-10-28', deadline: '2026-10-26', expectedVersion: 2 });
      expect(await world.inspect.jobs()).toEqual([]);
      // Today’s porada keeps its own, past deadline: nothing to announce.
      const result = await move(head, TODAY, { meeting: '2026-10-21', deadline: '2026-10-17' });
      expect(result.ok).toBe(true);
      expect(await world.inspect.jobs()).toEqual([]);
    });

    it('carries no text people wrote: only ids, dates and counts', async () => {
      const head = await headmaster();
      await move(head, W1, { meeting: '2026-10-28', deadline: '2026-10-23' });
      const { audit } = await snapshot();
      for (const e of audit) {
        const meta = (e.data as { meta?: Record<string, unknown> }).meta ?? {};
        for (const value of Object.values(meta)) {
          expect(['string', 'number', 'boolean']).toContain(typeof value);
        }
      }
    });
  });
});
