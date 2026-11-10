import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { QUEUE_LIMIT, toIssueRows } from '@/contracts';
import {
  deadline,
  DEFAULT_DEADLINE,
  issueSlots,
  PLACEMENT_WEEKS,
  placementSlot,
} from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import { newDraft, type PointKind } from '@/domain/report';
import {
  addDays,
  calDate,
  instantToWallClock,
  parseIsoDate,
  toIsoDate,
  type CalDate,
} from '@/domain/time';

import { FIRST_MONDAY, pointFixtures, readyProposal, START } from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { dropIssue, issueWindow } from '../issues';
import { decidePoint, queuePoints, retractPoint, submitPoint } from './index';

const world = setupWorld();
const { start, snapshot } = pointFixtures(world);

const NEXT_MONDAY = calDate(2026, 11, 2);
/** Sunday 25 October 2026, 21.00 in Prague: the deadline of 26 October (Saturday 20.00) has passed. */
const AFTER_DEADLINE = new Date('2026-10-25T20:00:00Z');

/** One report type for the whole test: its name is unique. */
let typeId = '';
beforeEach(async () => {
  typeId = (await world.seed.pointType({ name: 'Seminář', position: 1 })).id;
});

const reviewer = (role: 'reviewer' | 'headmaster' = 'reviewer') => world.seed.user({ role });
const queue = (by: UserRecord) => world.run(queuePoints, world.as(by), {});

interface HandIn {
  readonly monday?: CalDate;
  readonly state?: 'submitted' | 'approved';
  readonly title?: string;
}

/**
 * A point of the author's handed in now for `monday`, past the use cases (the decision is row 39),
 * then a minute passes so the next one is handed in later.
 */
async function handIn(author: UserRecord, kind: PointKind, over: HandIn = {}): Promise<string> {
  const { monday = FIRST_MONDAY, state = 'submitted', title = 'Den' } = over;
  return world.tx(world.as(author), async (tx) => {
    const { point } = await tx.points.create({
      clientRef: randomUUID(),
      kind,
      typeId: kind === 'report' ? typeId : null,
      content: newDraft([]),
    });
    const { id } = point;
    const content = {
      ...point.content,
      title,
      eventDate: parseIsoDate('2027-01-14'),
      opening: 'Ve čtvrtek…',
    };
    const at = world.clock.now();
    await tx.points.update(id, point.version, {
      content,
      state,
      earliestMonday: monday,
      submittedAt: at,
      handInMonday: monday,
    });
    await tx.audit.record({ action: `point.${state}`, target: { type: 'point', id } });
    world.clock.advance(60_000);
    return id;
  });
}

/** `count` submitted pokyn points of the author's for the first Monday, in one go, all at one instant. */
const handedIn = (author: UserRecord, count: number) =>
  world.tx(world.as(author), async (tx) => {
    for (let i = 0; i < count; i++) {
      const { point } = await tx.points.create({
        clientRef: randomUUID(),
        kind: 'pokyn',
        typeId: null,
        content: newDraft([]),
      });
      const { id } = point;
      await tx.points.update(id, point.version, {
        content: { ...point.content, title: 'Den' },
        state: 'submitted',
        earliestMonday: FIRST_MONDAY,
        submittedAt: world.clock.now(),
        handInMonday: FIRST_MONDAY,
      });
      await tx.audit.record({ action: 'point.submitted', target: { type: 'point', id } });
    }
  });

/** The point returned with a note and handed in again, as the author's resubmit leaves it. */
async function returnedAndBack(author: UserRecord, id: string): Promise<void> {
  await world.tx(world.as(author), async (tx) => {
    const point = (await tx.points.get(id))!;
    const event = { event: 'return', fromState: 'submitted', toState: 'returned' } as const;
    await tx.pointEvents.append({ pointId: id, ...event, note: 'Doplňte název.' });
    const back = await tx.points.update(id, point.version, { state: 'returned' });
    await tx.points.update(id, back.version, { state: 'submitted' });
    await tx.audit.record({ action: 'point.save', target: { type: 'point', id } });
  });
}

/** The headmaster's „Porada se nekoná“: the porada of `monday` goes, its points move on. */
async function drop(monday: CalDate): Promise<void> {
  const head = await world.seed.user({ role: 'headmaster' });
  const done = await world.run(dropIssue, world.as(head), {
    monday: toIsoDate(monday),
    confirmed: true,
  });
  expect(done.ok).toBe(true);
}

/** An issue row with this status, as the generation leaves it. */
const issue = (monday: CalDate, status: 'generated' | 'open') =>
  world.tx(system('test.seed'), async (tx) => {
    const { issue: row } = await tx.issues.ensure({
      monday,
      meetingDate: monday,
      schoolYear: schoolYear(monday),
      deadlineAt: deadline(monday, DEFAULT_DEADLINE),
    });
    return tx.issues.setStatus(row.id, row.version, status);
  });

/** The queue as Mondays of kinds of ids, and the approved ids with their Monday. */
async function shape(by: UserRecord) {
  const got = await queue(by);
  if (!got.ok) throw new Error(`queue refused: ${got.error.code}`);
  return {
    mondays: got.value.mondays.map(({ monday, kinds }) => [
      monday,
      kinds.map(({ kind, points }) => [kind, points.map((p) => p.id)]),
    ]),
    approved: got.value.approved.map((p) => [p.id, p.monday]),
  };
}

describe('points.queue', () => {
  it('groups the submitted points by Monday, then by kind, the oldest submission first', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const lateReport = await handIn(author, 'report', { monday: NEXT_MONDAY });
    const report = await handIn(author, 'report');
    const pokyn = await handIn(author, 'pokyn');
    const finance = await handIn(author, 'finance');
    const report2 = await handIn(author, 'report');

    expect(await shape(await reviewer())).toEqual({
      mondays: [
        [
          '2026-10-26',
          [
            ['report', [report, report2]],
            ['finance', [finance]],
            ['pokyn', [pokyn]],
          ],
        ],
        ['2026-11-02', [['report', [lateReport]]]],
      ],
      approved: [],
    });
  });

  it('gives each row what the queue shows', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await handIn(author, 'report', { title: 'Seminář o vodě' });
    const got = await queue(await reviewer('headmaster'));
    expect(got).toEqual({
      ok: true,
      value: {
        mondays: [
          {
            monday: '2026-10-26',
            meetingDate: '2026-10-26',
            kinds: [
              {
                kind: 'report',
                points: [
                  {
                    id,
                    kind: 'report',
                    title: 'Seminář o vodě',
                    typeName: 'Seminář',
                    submittedAt: START.toISOString(),
                    returnedBefore: false,
                  },
                ],
              },
            ],
          },
        ],
        approved: [],
        more: false,
      },
    });
  });

  it('says when more points wait than the queue lists: only past the limit', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const by = await reviewer();
    const listed = async () => {
      const got = await queue(by);
      if (!got.ok) throw new Error(`queue refused: ${got.error.code}`);
      const rows = got.value.mondays.flatMap((m) => m.kinds.flatMap((k) => k.points));
      return [rows.length, got.value.more];
    };
    await handedIn(author, QUEUE_LIMIT);
    expect(await listed()).toEqual([QUEUE_LIMIT, false]);
    await handedIn(author, 1);
    expect(await listed()).toEqual([QUEUE_LIMIT, true]);
  });

  it('moves the points of a dropped or generated Monday on to the next open one', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const first = await handIn(author, 'pokyn');
    const second = await handIn(author, 'pokyn', { monday: NEXT_MONDAY });
    await drop(FIRST_MONDAY);
    await issue(NEXT_MONDAY, 'generated');
    expect((await shape(await reviewer())).mondays).toEqual([
      ['2026-11-09', [['pokyn', [first, second]]]],
    ]);
  });

  it('lists the points no slot of the calendar takes last, after the placed ones', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    // Due past the 26 Mondays the calendar reaches, with no row to make a slot of it.
    const beyond = await handIn(author, 'pokyn', {
      monday: addDays(FIRST_MONDAY, 7 * (PLACEMENT_WEEKS + 10)),
    });
    const placed = await handIn(author, 'pokyn', { monday: addDays(FIRST_MONDAY, 7) });
    expect((await shape(await reviewer())).mondays).toEqual([
      [toIsoDate(addDays(FIRST_MONDAY, 7)), [['pokyn', [placed]]]],
      [null, [['pokyn', [beyond]]]],
    ]);
  });

  it('places nothing when every slot of the calendar is generated', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await handIn(author, 'pokyn');
    for (let week = 0; week < PLACEMENT_WEEKS; week++) {
      await issue(addDays(FIRST_MONDAY, 7 * week), 'generated');
    }
    expect((await shape(await reviewer())).mondays).toEqual([[null, [['pokyn', [id]]]]]);
  });

  it('keeps a point handed in on time under its Monday past the deadline, while reviewers finish the issue', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await handIn(author, 'pokyn');
    world.clock.set(AFTER_DEADLINE);
    const late = await handIn(author, 'pokyn', { monday: NEXT_MONDAY });
    expect((await shape(await reviewer())).mondays).toEqual([
      ['2026-10-26', [['pokyn', [id]]]],
      ['2026-11-02', [['pokyn', [late]]]],
    ]);
  });

  describe('a late resubmit goes to the next open Monday (ADR 0018 item 1)', () => {
    /** Submitted on time through the use case: version 2, earliest Monday 26 October. */
    async function submittedOnTime(author: UserRecord): Promise<string> {
      const id = await start(author, 'pokyn');
      const done = await world.run(submitPoint, world.as(author), {
        id,
        expectedVersion: 1,
        content: readyProposal(),
      });
      expect(done).toEqual({ ok: true, value: { version: 2 } });
      return id;
    }

    /** Handed in again at the world clock's time, from `expectedVersion`. */
    const resubmit = (author: UserRecord, id: string, expectedVersion: number) =>
      world.run(submitPoint, world.as(author), { id, expectedVersion, content: readyProposal() });

    /** The Monday the standing line promises a point handed in now: standingOf's own placement. */
    async function promised(by: UserRecord): Promise<string> {
      const got = await world.run(issueWindow, world.as(by), {});
      if (!got.ok) throw new Error(`window refused: ${got.error.code}`);
      const { submitMonday, issues, plannedThrough } = got.value;
      const today = instantToWallClock(world.clock.now()).date;
      const slots = issueSlots(
        toIssueRows(issues),
        today,
        DEFAULT_DEADLINE,
        parseIsoDate(plannedThrough),
      );
      const slot = placementSlot(parseIsoDate(submitMonday), today, slots);
      return toIsoDate(slot!.monday);
    }

    it('keeps a resubmitted point on the Monday it was handed in for when the porada before it is dropped (ADR 0029 item 3, 0054)', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const id = await submittedOnTime(author);
      await world.run(retractPoint, world.as(author), { id, expectedVersion: 2 });
      await drop(FIRST_MONDAY);
      expect((await resubmit(author, id, 3)).ok).toBe(true);
      const by = await reviewer();
      expect((await shape(by)).mondays).toEqual([['2026-11-02', [['pokyn', [id]]]]]);
    });

    it('places a point retracted and handed in again after the deadline under the next porada', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const id = await submittedOnTime(author);
      const by = await reviewer();
      expect((await shape(by)).mondays).toEqual([['2026-10-26', [['pokyn', [id]]]]]);

      const retracted = await world.run(retractPoint, world.as(author), { id, expectedVersion: 2 });
      expect(retracted.ok).toBe(true);
      world.clock.set(AFTER_DEADLINE);
      expect((await resubmit(author, id, 3)).ok).toBe(true);

      expect((await shape(by)).mondays).toEqual([[await promised(by), [['pokyn', [id]]]]]);
      expect(await promised(by)).toBe('2026-11-02');
    });

    it('does the same for a point a reviewer returned and the author handed in again', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const id = await submittedOnTime(author);
      const by = await reviewer();
      const returned = await world.run(decidePoint, world.as(by), {
        id,
        expectedVersion: 2,
        event: 'return',
        note: 'Doplňte prosím vyjádření.',
      });
      expect(returned.ok).toBe(true);
      world.clock.set(AFTER_DEADLINE);
      expect((await resubmit(author, id, 3)).ok).toBe(true);

      expect((await shape(by)).mondays).toEqual([['2026-11-02', [['pokyn', [id]]]]]);
      expect(await promised(by)).toBe('2026-11-02');
    });

    it('does not move a resubmitted point that is handed in again in time', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const id = await submittedOnTime(author);
      await world.run(retractPoint, world.as(author), { id, expectedVersion: 2 });
      world.clock.advance(60_000);
      expect((await resubmit(author, id, 3)).ok).toBe(true);
      expect((await shape(await reviewer())).mondays).toEqual([['2026-10-26', [['pokyn', [id]]]]]);
    });

    it('leaves a point approved after the deadline under the Monday it was handed in for', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const id = await submittedOnTime(author);
      world.clock.set(AFTER_DEADLINE);
      const by = await reviewer();
      expect(
        (await world.run(decidePoint, world.as(by), { id, expectedVersion: 2, event: 'approve' }))
          .ok,
      ).toBe(true);
      expect((await shape(by)).approved).toEqual([[id, '2026-10-26']]);
    });
  });

  it('moves a point still waiting on once its porada is over', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await handIn(author, 'pokyn');
    world.clock.set(new Date('2026-10-27T10:00:00Z'));
    expect((await shape(await reviewer())).mondays).toEqual([['2026-11-02', [['pokyn', [id]]]]]);
  });

  describe('the approved points still waiting for a porada', () => {
    it('lists them apart, the oldest first, each with the Monday it goes to', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const older = await handIn(author, 'report', { state: 'approved' });
      const waiting = await handIn(author, 'pokyn');
      const later = await handIn(author, 'pokyn', { state: 'approved', monday: NEXT_MONDAY });
      expect(await shape(await reviewer())).toEqual({
        mondays: [['2026-10-26', [['pokyn', [waiting]]]]],
        approved: [
          [older, '2026-10-26'],
          [later, '2026-11-02'],
        ],
      });
    });

    it('keeps an approved point on its own Monday past that deadline, and moves it past a drop', async () => {
      const author = await world.seed.user({ role: 'submitter' });
      const id = await handIn(author, 'pokyn', { state: 'approved' });
      world.clock.set(AFTER_DEADLINE);
      const by = await reviewer();
      expect((await shape(by)).approved).toEqual([[id, '2026-10-26']]);
      await drop(FIRST_MONDAY);
      expect((await shape(by)).approved).toEqual([[id, toIsoDate(NEXT_MONDAY)]]);
    });
  });

  it('never shows a draft, nor a returned, withdrawn or rejected point', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const by = await reviewer();
    await start(author, 'pokyn');
    await start(by, 'pokyn');
    for (const state of ['returned', 'withdrawn', 'rejected'] as const) {
      const id = await handIn(author, 'pokyn');
      await world.tx(world.as(author), async (tx) => {
        const point = (await tx.points.get(id))!;
        await tx.points.update(id, point.version, { state });
        await tx.audit.record({ action: 'point.save', target: { type: 'point', id } });
      });
    }
    expect(await queue(by)).toEqual({
      ok: true,
      value: { mondays: [], approved: [], more: false },
    });
  });

  it('marks a point returned before and handed in again', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const fresh = await handIn(author, 'pokyn');
    const back = await handIn(author, 'pokyn');
    await returnedAndBack(author, back);
    const got = await queue(await reviewer());
    const rows = got.ok ? got.value.mondays.flatMap((m) => m.kinds.flatMap((k) => k.points)) : [];
    expect(rows.map((row) => [row.id, row.returnedBefore])).toEqual([
      [fresh, false],
      [back, true],
    ]);
  });

  it('shows a reviewer their own handed-in point too: the decision bar says who decides', async () => {
    const by = await reviewer();
    const own = await handIn(by, 'pokyn');
    expect((await shape(by)).mondays).toEqual([['2026-10-26', [['pokyn', [own]]]]]);
  });

  describe('gate', () => {
    it.each([
      ['a submitter', { role: 'submitter' }],
      ['a student submitter', { role: 'submitter', isStudent: true }],
      ['a pending user', { role: 'pending' }],
      ['a deactivated reviewer', { role: 'reviewer', status: 'deactivated' }],
    ] as const)('refuses %s', async (_case, seed) => {
      expect(await queue(await world.seed.user(seed))).toEqual({
        ok: false,
        error: { code: 'forbidden' },
      });
    });

    it('cannot run for the system', async () => {
      await expect(world.run(queuePoints, system('cli:test'), {})).rejects.toThrow(
        'points.queue: runs as a signed-in user',
      );
    });
  });

  it('writes nothing', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await handIn(author, 'pokyn');
    const before = await snapshot(id);
    await queue(await reviewer());
    expect(await snapshot(id)).toEqual(before);
  });
});
