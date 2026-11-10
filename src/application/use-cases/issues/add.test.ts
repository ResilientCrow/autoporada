import { describe, expect, it } from 'vitest';

import { deadline } from '@/domain/calendar';
import { calDate } from '@/domain/time';

import { issueFixtures } from '../../../../test/support/issues';
import { monday, outlineFixtures } from '../../../../test/support/outline';
import { setupWorld } from '../../../../test/support/world';
import { addOutlineItem } from '../outline';
import { addIssue, dropIssue, issueWindow } from './index';

const world = setupWorld();
const fx = outlineFixtures(world);
const issues = issueFixtures(world);

// Tuesday 3 November 2026: Monday 9 November is the porada the tests drop to make a hole.
const NOW = new Date('2026-11-03T10:00:00Z');
const HOLE = calDate(2026, 11, 9);
const HEIR = calDate(2026, 11, 16);

type User = Awaited<ReturnType<typeof fx.headmaster>>;
const add = (by: User, meetingDate: string) => world.run(addIssue, world.as(by), { meetingDate });
const drop = (by: User, day = HOLE) =>
  world.run(dropIssue, world.as(by), { monday: monday(day), confirmed: true });

describe('issues.add', () => {
  it('refuses a week that already has a porada', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    const exists = { ok: false, error: { code: 'rule', rule: 'porada-exists' } };
    // The Monday itself, a Thursday of its week, and a Friday that belongs to the next Monday.
    expect(await add(head, '2026-11-09')).toEqual(exists);
    expect(await add(head, '2026-11-12')).toEqual(exists);
    expect(await add(head, '2026-11-13')).toEqual(exists);
    expect(await fx.issueOf(HOLE)).toBeNull();
    expect(await fx.auditOf('issue.added')).toEqual([]);
  });

  it('refuses a submitter, a day before today, one past the horizon and one that is no date', async () => {
    world.clock.set(NOW);
    const user = await world.seed.user({ role: 'submitter' });
    expect(await add(user, '2026-11-10')).toEqual({ ok: false, error: { code: 'forbidden' } });
    const head = await world.seed.user({ role: 'headmaster' });
    await drop(head);
    for (const day of ['2026-11-02', '2027-05-07', '2026-02-30', 'pondělí']) {
      expect(await add(head, day)).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    }
    expect(await fx.issueOf(HOLE)).toBeNull();
    expect(await fx.auditOf('issue.added')).toEqual([]);
  });

  it('refuses a hole in front of a generated porada', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await drop(head);
    await fx.seedIssue(HEIR, 'generated');
    expect(await add(head, '2026-11-10')).toEqual({
      ok: false,
      error: { code: 'rule', rule: 'later-generated' },
    });
    expect(await fx.issueOf(HOLE)).toBeNull();
  });

  it('refuses a day that would break the order of the meetings and their deadlines', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await drop(head);
    // The next porada closes before the new one would.
    await issues.reschedule(HEIR, { deadlineAt: new Date('2026-11-09T19:00:00Z') });
    expect(await add(head, '2026-11-12')).toEqual({
      ok: false,
      error: { code: 'rule', rule: 'meeting-order' },
    });
    expect(await fx.issueOf(HOLE)).toBeNull();
  });

  it('adds a porada back in a week that was dropped, keyed by the nearest Monday', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await drop(head);
    const added = await add(head, '2026-11-12');
    expect(added).toEqual({
      ok: true,
      value: {
        monday: '2026-11-09',
        meetingDate: '2026-11-12',
        deadlineAt: deadline(calDate(2026, 11, 12)).toISOString(),
        version: 1,
      },
    });
    expect(await fx.issueOf(HOLE)).toMatchObject({
      status: 'open',
      meetingDate: calDate(2026, 11, 12),
      schoolYear: '2026/2027',
    });
    // The boundary stays where the drop put it, and the week is a porada again.
    const window = await world.run(issueWindow, world.as(head), {});
    expect(window).toMatchObject({ ok: true, value: { plannedThrough: '2026-11-16' } });
    expect(await add(head, '2026-11-10')).toEqual({
      ok: false,
      error: { code: 'rule', rule: 'porada-exists' },
    });
  });

  it('records the dates only and takes writes to the new porada', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await drop(head);
    await add(head, '2026-11-10');
    const [event] = await fx.auditOf('issue.added');
    expect(event).toMatchObject({ action: 'issue.added', actorId: head.id });
    expect(event?.data['meta']).toEqual({
      monday: '2026-11-09',
      meetingDate: '2026-11-10',
      deadlineAt: deadline(calDate(2026, 11, 10)).toISOString(),
    });
    const written = await world.run(addOutlineItem, world.as(head), {
      monday: '2026-11-09',
      lineageId: crypto.randomUUID(),
      section: 'pokyny',
      title: 'Do nové porady',
      persistence: 'once',
    });
    expect(written.ok).toBe(true);
  });
});
