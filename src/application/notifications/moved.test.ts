/** The loaders of the moved mail: whom the job reaches and what the mail says at send time. */
import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { moveIssue } from '@/application/use-cases';
import { calDate } from '@/domain/time';

import { pointFixtures } from '../../../test/support/points';
import { setupWorld } from '../../../test/support/world';
import { loadMoved, movedParts, movedRecipients } from './moved';

const world = setupWorld();
const points = pointFixtures(world);

const MONDAY = calDate(2026, 11, 2);
const NOW = new Date('2026-10-28T10:00:00Z');
const FRIDAY_8PM = new Date('2026-10-30T19:00:00Z');

const asWorker = <T>(
  read: (tx: Parameters<typeof loadMoved>[0] & Parameters<typeof movedRecipients>[0]) => Promise<T>,
) =>
  world.workerDb.transaction(
    { principal: system('job:test'), now: world.clock.now(), requestId: 'test' },
    { mode: 'read' },
    (tx) => read(tx),
  );

describe('movedParts', () => {
  it('keys the mail by slot, person and the deadline in whole minutes', () => {
    const base = { userId: 'u1', monday: MONDAY, deadlineAt: FRIDAY_8PM };
    expect(movedParts(base)).toEqual({
      recipientId: 'u1',
      subjectId: 'u1',
      key: `2026-11-02:u1:${FRIDAY_8PM.getTime() / 60_000}`,
    });
    // seconds do not make another key
    const sameMinute = movedParts({ ...base, deadlineAt: new Date(FRIDAY_8PM.getTime() + 30_000) });
    expect(sameMinute.key).toBe(movedParts(base).key);
  });
});

describe('loadMoved and movedRecipients', () => {
  it('speaks for the slot collected now, with the moved meeting date and deadline', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    await points.start(author, 'pokyn');
    const other = await world.seed.user({ role: 'submitter' });
    const moved = await world.run(moveIssue, world.as(head), {
      monday: '2026-11-02',
      meetingDate: '2026-11-04',
      deadlineDate: '2026-10-30',
      deadlineTime: '20:00',
      skip: [],
    });
    expect(moved.ok).toBe(true);

    expect(await asWorker((tx) => loadMoved(tx, author.id))).toEqual({
      monday: MONDAY,
      meetingDate: calDate(2026, 11, 4),
      deadlineAt: FRIDAY_8PM,
      hasWork: true,
    });
    expect(await asWorker((tx) => loadMoved(tx, other.id))).toMatchObject({ hasWork: false });
    // a user who does not exist has no work, whatever the slot: the send pipeline stops at the recipient
    expect(
      await asWorker((tx) => loadMoved(tx, '00000000-0000-7000-8000-00000000dead')),
    ).toMatchObject({ hasWork: false });

    const notice = { monday: '2026-11-02', deadlineAt: FRIDAY_8PM.toISOString() };
    expect(await asWorker((tx) => movedRecipients(tx, notice))).toEqual({
      monday: MONDAY,
      userIds: [author.id],
    });
  });

  it('gives no recipients to a notice for another slot or another deadline', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    await points.start(author, 'pokyn');
    await world.run(moveIssue, world.as(head), {
      monday: '2026-11-02',
      meetingDate: '2026-11-02',
      deadlineDate: '2026-10-30',
      deadlineTime: '20:00',
      skip: [],
    });
    const other = { monday: '2026-11-09', deadlineAt: FRIDAY_8PM.toISOString() };
    expect(await asWorker((tx) => movedRecipients(tx, other))).toBeNull();
    const later = {
      monday: '2026-11-02',
      deadlineAt: new Date(FRIDAY_8PM.getTime() + 60_000).toISOString(),
    };
    expect(await asWorker((tx) => movedRecipients(tx, later))).toBeNull();
  });
});
