import { describe, expect, it } from 'vitest';

import { deadline } from '@/domain/calendar';
import { calDate } from '@/domain/time';

import { issueFixtures } from '../../../../test/support/issues';
import { monday, outlineFixtures } from '../../../../test/support/outline';
import { setupWorld } from '../../../../test/support/world';
import { dropIssue, moveIssue } from './index';

const world = setupWorld();
const fx = outlineFixtures(world);
const issues = issueFixtures(world);

// Tuesday 3 November 2026: Monday 9 November is the next porada, with no row yet; this week's
// Monday (2 November) is a porada too, and so is every Monday after.
const NOW = new Date('2026-11-03T10:00:00Z');
const NEXT = calDate(2026, 11, 9);
const NEXT_STR = monday(NEXT);

type User = Awaited<ReturnType<typeof fx.headmaster>>;
const move = (by: User, meetingDate: string, over: Record<string, unknown> = {}) =>
  world.run(moveIssue, world.as(by), { monday: NEXT_STR, meetingDate, ...over });
const rule = (code: string) => ({ ok: false, error: { code: 'rule', rule: code } });
const invalid = { ok: false, error: { code: 'invalid-input' } };

describe('issues.move', () => {
  it('moves a porada to another day of its week and freezes the deadline for it', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    expect(await move(head, '2026-11-11')).toEqual({
      ok: true,
      value: {
        monday: '2026-11-09',
        meetingDate: '2026-11-11',
        deadlineAt: deadline(calDate(2026, 11, 11)).toISOString(),
        version: 2,
      },
    });
    expect(await fx.issueOf(NEXT)).toMatchObject({
      monday: NEXT,
      meetingDate: calDate(2026, 11, 11),
      deadlineAt: deadline(calDate(2026, 11, 11)),
    });
  });

  it('keeps the Monday key and may move on a within the gap between its neighbours', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    // Last day before the next porada's meeting, and the day after the previous one's.
    expect((await move(head, '2026-11-15')).ok).toBe(true);
    const row = await fx.issueOf(NEXT);
    expect(row).toMatchObject({ monday: NEXT, meetingDate: calDate(2026, 11, 15), version: 2 });
    expect((await move(head, '2026-11-05', { expectedVersion: 2 })).ok).toBe(true);
  });

  it('records the move with dates only, from the old day to the new one', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await move(head, '2026-11-10');
    const [event] = await fx.auditOf('issue.moved');
    expect(event).toMatchObject({ actorId: head.id });
    expect(event?.data['meta']).toEqual({
      monday: '2026-11-09',
      from: '2026-11-09',
      to: '2026-11-10',
      deadlineAt: deadline(calDate(2026, 11, 10)).toISOString(),
    });
  });

  it('refuses a submitter and writes nothing', async () => {
    world.clock.set(NOW);
    const user = await world.seed.user({ role: 'submitter' });
    expect(await move(user, '2026-11-11')).toEqual({ ok: false, error: { code: 'forbidden' } });
    expect(await fx.issueOf(NEXT)).toBeNull();
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('refuses a day that is not a change, one before today and one past the next porada', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    expect(await move(head, '2026-11-09')).toMatchObject(invalid);
    // Before today, and into the previous porada's day (a porada already meets on 2 November).
    expect(await move(head, '2026-11-01')).toMatchObject(invalid);
    expect(await move(head, '2026-11-02')).toEqual(rule('porada-exists'));
    // The next porada meets on the 16th: a move never reaches into or past it.
    expect(await move(head, '2026-11-16')).toEqual(rule('porada-exists'));
    expect(await move(head, '2026-11-17')).toMatchObject(invalid);
    expect(await fx.issueOf(NEXT)).toBeNull();
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('refuses a day past the horizon for the last porada', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    const last = '2027-04-26';
    expect(await move(head, '2027-04-30', { monday: last })).toMatchObject(invalid);
    expect((await move(head, '2027-04-29', { monday: last })).ok).toBe(true);
  });

  it('refuses a Monday that is none, one outside the calendar and a malformed day', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    expect(await move(head, '2026-11-11', { monday: '2026-11-10' })).toMatchObject(invalid);
    expect(await move(head, '2026-11-11', { monday: '2026-10-26' })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    });
    expect(await move(head, '2026-13-40')).toMatchObject(invalid);
  });

  it('refuses a generated porada', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await fx.seedIssue(NEXT, 'generated');
    expect(await move(head, '2026-11-11')).toEqual(rule('issue-not-open'));
    expect(await fx.issueOf(NEXT)).toMatchObject({ meetingDate: NEXT, status: 'generated' });
  });

  it('refuses a day whose deadline is already past while the porada still collects', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    // Wednesday 4 November closes on Monday 2 November at 20.00, which is gone.
    expect(await move(head, '2026-11-04')).toEqual(rule('deadline-past'));
    expect(await fx.issueOf(NEXT)).toBeNull();
  });

  it('refuses a day that breaks the order of the deadlines', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    // The previous porada closes on 4 November at 20.00, after the new deadline of 3 November.
    await issues.reschedule(calDate(2026, 11, 2), { deadlineAt: new Date('2026-11-04T19:00:00Z') });
    expect(await move(head, '2026-11-05')).toEqual(rule('meeting-order'));
    expect(await fx.issueOf(NEXT)).toBeNull();
  });

  it('refuses a stale version as a conflict, for a stored porada and a row-less one', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    expect(await move(head, '2026-11-11', { expectedVersion: 4 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(await fx.issueOf(NEXT)).toBeNull();
    await move(head, '2026-11-11');
    expect(await move(head, '2026-11-10', { expectedVersion: 1 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(await fx.issueOf(NEXT)).toMatchObject({
      meetingDate: calDate(2026, 11, 11),
      version: 2,
    });
    expect(await fx.auditOf('issue.moved')).toHaveLength(1);
  });

  it('refuses a Monday that was dropped: it is no porada', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await world.run(dropIssue, world.as(head), { monday: NEXT_STR, confirmed: true });
    expect(await move(head, '2026-11-11')).toEqual({ ok: false, error: { code: 'not-found' } });
  });
});
