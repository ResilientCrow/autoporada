import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEADLINE,
  deadline,
  dueMonday,
  issueSlots,
  pointMonday,
  workingSlot,
  type IssueRow,
} from '@/domain/calendar';
import { addDays, calDate, parseIsoDate as d, toIsoDate, type CalDate } from '@/domain/time';

import { issueFixtures } from '../../../../test/support/issues';
import { setupWorld } from '../../../../test/support/world';
import { issueWorkspace } from './index';

const world = setupWorld();
const fixtures = issueFixtures(world);

// The clock starts Monday 19 October 2026 10.00 Prague: that meeting is today, its deadline is gone.
const TODAY = calDate(2026, 10, 19);
const W1 = calDate(2026, 10, 26);
const W2 = calDate(2026, 11, 2);
const W3 = calDate(2026, 11, 9);

const headmaster = () => world.seed.user({ role: 'headmaster' });
const ask = async (monday?: CalDate, who?: Awaited<ReturnType<typeof headmaster>>) => {
  const by = who ?? (await headmaster());
  return world.run(issueWorkspace, world.as(by), monday ? { monday: toIsoDate(monday) } : {});
};
const slotOf = async (monday: CalDate) => {
  const result = await ask(monday);
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`);
  return result.value.slot!;
};

describe('issues.workspace', () => {
  describe('gate', () => {
    it('answers the headmaster and a staff reviewer, and refuses a submitter', async () => {
      expect((await ask()).ok).toBe(true);
      expect((await ask(undefined, await world.seed.user({ role: 'reviewer' }))).ok).toBe(true);
      expect(await ask(undefined, await world.seed.user({ role: 'submitter' }))).toEqual({
        ok: false,
        error: { code: 'forbidden' },
      });
    });
  });

  describe('the working slot', () => {
    it('is the porada of today while its meeting is today or later, whatever its deadline', async () => {
      const result = await ask();
      expect(result).toEqual({ ok: true, value: { working: '2026-10-19', slot: null } });
    });

    it('steps over a skipped slot and a generated one', async () => {
      await fixtures.issue(TODAY, { status: 'skipped' });
      await fixtures.issue(W1, { status: 'generated' });
      const result = await ask();
      expect(result.ok && result.value.working).toBe('2026-11-02');
    });

    it('goes by the meeting date: a porada moved ahead of today is over', async () => {
      world.clock.set(new Date('2026-10-21T10:00:00Z')); // Wednesday
      await fixtures.issue(TODAY, { meetingDate: d('2026-10-20') });
      const result = await ask();
      expect(result.ok && result.value.working).toBe('2026-10-26');
    });
  });

  describe('a slot', () => {
    it('describes a Monday without a row: no version, the rule’s deadline, the meeting on the Monday', async () => {
      const slot = await slotOf(W1);
      expect(slot).toEqual({
        monday: '2026-10-26',
        meetingDate: '2026-10-26',
        deadlineAt: deadline(W1, DEFAULT_DEADLINE).toISOString(),
        status: 'open',
        version: null,
        next: '2026-11-02',
        heldNext: slot.heldNext,
        counts: { waiting: 0, returned: 0, approved: 0, later: 0, missing: 0 },
        document: null,
      });
    });

    it('offers every open porada after it as the one held next, by Monday and meeting date', async () => {
      await fixtures.issue(W2, { status: 'skipped' });
      await fixtures.issue(W3, { meetingDate: d('2026-11-11') });
      const { heldNext } = await slotOf(W1);
      expect(heldNext.slice(0, 2)).toEqual([
        { monday: '2026-11-09', meetingDate: '2026-11-11' },
        { monday: '2026-11-16', meetingDate: '2026-11-16' },
      ]);
      // To the end of the calendar: TODAY's 26 Mondays less TODAY, W1 and the skipped W2.
      expect(heldNext).toHaveLength(23);
      expect((await slotOf(addDays(TODAY, 7 * 25))).heldNext).toEqual([]);
    });

    it('describes a stored row by its own meeting date, deadline, status and version', async () => {
      const row = await fixtures.issue(W2, {
        meetingDate: d('2026-11-04'),
        deadlineAt: new Date('2026-10-30T15:00:00Z'),
      });
      expect(await slotOf(W2)).toMatchObject({
        monday: '2026-11-02',
        meetingDate: '2026-11-04',
        deadlineAt: '2026-10-30T15:00:00.000Z',
        status: 'open',
        version: row.version,
        next: '2026-11-09',
      });
    });

    it('reports a skipped slot as skipped and still names where its points would go', async () => {
      await fixtures.issue(W1, { status: 'skipped' });
      expect(await slotOf(W1)).toMatchObject({ status: 'skipped', next: '2026-11-02' });
    });

    it('names the next open slot past skipped and generated ones, and none when none follows', async () => {
      await fixtures.issue(W2, { status: 'skipped' });
      await fixtures.issue(W3, { status: 'generated' });
      expect((await slotOf(W1)).next).toBe('2026-11-16');
      const last = addDays(TODAY, 7 * 25);
      expect((await slotOf(last)).next).toBeNull();
    });

    it('counts what waits, what is returned, what is approved and the reports that come later', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      await fixtures.point({ author, state: 'submitted', earliest: W1 });
      await fixtures.point({ author, state: 'submitted', earliest: W1 });
      await fixtures.point({ author, state: 'returned', earliest: W1 });
      await fixtures.point({ author, state: 'draft', earliest: W1 });
      await fixtures.point({ author, state: 'approved', earliest: W1 });
      await fixtures.point({ author, state: 'approved', earliest: W2 });
      await fixtures.point({ author, kind: 'report', eventDate: d('2026-10-22'), earliest: W1 });
      await fixtures.point({ author, kind: 'report', eventDate: d('2026-10-27'), earliest: W1 });
      expect((await slotOf(W1)).counts).toEqual({
        waiting: 2,
        returned: 1,
        approved: 2,
        later: 1,
        missing: 0,
      });
      expect((await slotOf(W2)).counts).toMatchObject({ approved: 4 });
    });

    it('counts the akce the porada owes a report for and has none, not those with an approved one', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      await fixtures.future({ author, startDate: d('2026-10-21') });
      await fixtures.future({ author, startDate: d('2026-10-22') });
      const done = await fixtures.future({ author, startDate: d('2026-10-23') });
      await fixtures.point({
        author,
        kind: 'report',
        eventDate: d('2026-10-23'),
        futureItemId: done,
      });
      expect((await slotOf(W1)).counts).toMatchObject({ missing: 2, approved: 1 });
      // The next porada owes none of them.
      expect((await slotOf(W2)).counts).toMatchObject({ missing: 0 });
    });

    it('counts no missing report in a generated porada, which has nothing to edit', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      await fixtures.future({ author, startDate: d('2026-10-21') });
      await fixtures.issue(W1, { status: 'generated' });
      expect((await slotOf(W1)).counts).toMatchObject({ missing: 0 });
    });

    it('counts against the meeting date of a moved slot', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      await fixtures.issue(W1, { meetingDate: d('2026-10-28') });
      await fixtures.point({ author, kind: 'report', eventDate: d('2026-10-27'), earliest: W1 });
      expect((await slotOf(W1)).counts).toMatchObject({ approved: 1, later: 0 });
    });

    it.each([
      ['not a Monday', '2026-10-27'],
      ['not a date', 'soon'],
    ])('refuses %s as invalid-input', async (_name, monday) => {
      const by = await headmaster();
      const result = await world.run(issueWorkspace, world.as(by), { monday });
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    });

    it('does not find a Monday outside the calendar', async () => {
      expect(await ask(addDays(TODAY, 7 * 26))).toEqual({
        ok: false,
        error: { code: 'not-found' },
      });
      expect(await ask(addDays(TODAY, -7))).toEqual({ ok: false, error: { code: 'not-found' } });
    });

    it('finds a stored row that lies before this week (a porada moved past its own)', async () => {
      await fixtures.issue(addDays(TODAY, -7), { meetingDate: d('2026-10-20') });
      expect(await slotOf(addDays(TODAY, -7))).toMatchObject({ meetingDate: '2026-10-20' });
    });

    it('writes nothing', async () => {
      const before = await world.inspect.audit();
      await ask(W1);
      expect(await world.inspect.audit()).toEqual(before);
    });
  });
});

describe('the working slot and where a point lands (parity, design §3)', () => {
  const mondayArb = fc.integer({ min: 0, max: 40 }).map((n) => addDays(calDate(2026, 8, 3), 7 * n));
  const statusArb = fc.constantFrom('open', 'open', 'open', 'skipped', 'generated' as const);

  const scenario = fc.record({
    today: fc.integer({ min: 0, max: 280 }).map((n) => addDays(calDate(2026, 9, 1), n)),
    rows: fc.uniqueArray(
      fc.record({ monday: mondayArb, status: statusArb, shift: fc.integer({ min: -3, max: 9 }) }),
      { selector: (r) => toIsoDate(r.monday), maxLength: 12 },
    ),
    points: fc.array(
      fc.record({
        earliest: mondayArb,
        handIn: fc.integer({ min: 0, max: 3 }),
      }),
      { minLength: 1, maxLength: 8 },
    ),
  });

  it('a point lands on the working slot exactly when it is due by that slot', () => {
    fc.assert(
      fc.property(scenario, ({ today, rows, points }) => {
        const issueRows: IssueRow[] = rows.map((r) => ({
          monday: r.monday,
          meetingDate: addDays(r.monday, r.shift),
          deadlineAt: deadline(r.monday, DEFAULT_DEADLINE),
          status: r.status,
        }));
        const slots = issueSlots(issueRows, today, DEFAULT_DEADLINE);
        const working = workingSlot(today, slots);
        for (const p of points) {
          const point = { earliest: p.earliest, handIn: addDays(p.earliest, 7 * p.handIn) };
          const lands = pointMonday(point, today, slots);
          if (working === null) {
            expect(lands).toBeNull();
            continue;
          }
          const onWorking = lands !== null && toIsoDate(lands) === toIsoDate(working.monday);
          const dueBy = toIsoDate(dueMonday(point)) <= toIsoDate(working.monday);
          expect(onWorking).toBe(dueBy);
        }
      }),
      { numRuns: 2000 },
    );
  });
});
