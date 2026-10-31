import { describe, expect, it } from 'vitest';

import { system, type Principal } from '@/application/ports';
import { calDate, parseIsoDate as d, type CalDate } from '@/domain/time';

import { issueFixtures } from '../support/issues';
import { setupWorld } from '../support/world';

const world = setupWorld();
const fixtures = issueFixtures(world);
const cli = system('cli:test');

const MEETING = calDate(2026, 11, 9);
const forIssue = (meeting: CalDate = MEETING, by: Principal = cli) =>
  world.tx(by, (tx) => tx.futureItems.forIssue(meeting), 'read');
const waitingFor = (meeting: CalDate = MEETING, by: Principal = cli) =>
  world.tx(by, (tx) => tx.futureItems.waitingFor(meeting), 'read');
const titles = (items: readonly { content: { title: string } }[]) =>
  items.map((i) => i.content.title);

describe('FutureItemRepo.forIssue and waitingFor (port contract)', () => {
  it('takes approved items whose last day is not before the meeting date', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await fixtures.future({ author, title: 'before', startDate: d('2026-11-08') });
    await fixtures.future({ author, title: 'on the day', startDate: d('2026-11-09') });
    await fixtures.future({ author, title: 'after', startDate: d('2026-11-20') });
    await fixtures.future({
      author,
      title: 'spans',
      startDate: d('2026-11-05'),
      endDate: d('2026-11-09'),
    });
    await fixtures.future({
      author,
      title: 'ended',
      startDate: d('2026-11-05'),
      endDate: d('2026-11-08'),
    });
    expect(titles(await forIssue())).toEqual(['spans', 'on the day', 'after']);
  });

  it('takes jednání as well as akce, and only the approved ones', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await fixtures.future({ author, kind: 'jednani', title: 'rada' });
    for (const state of [
      'draft',
      'submitted',
      'returned',
      'rejected',
      'withdrawn',
      'cancelled',
    ] as const) {
      await fixtures.future({ author, title: state, state });
    }
    expect(titles(await forIssue())).toEqual(['rada']);
  });

  it('puts the earliest start first, ties to the lower id', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const x = await fixtures.future({ author, title: 'x', startDate: d('2026-11-12') });
    const y = await fixtures.future({ author, title: 'y', startDate: d('2026-11-12') });
    const first = await fixtures.future({ author, title: 'first', startDate: d('2026-11-10') });
    expect((await forIssue()).map((i) => i.id)).toEqual([first, ...[x, y].sort()]);
  });

  it('waitingFor is the same reach over the submitted items', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await fixtures.future({
      author,
      title: 'waits',
      state: 'submitted',
      startDate: d('2026-11-10'),
    });
    await fixtures.future({
      author,
      title: 'ended',
      state: 'submitted',
      startDate: d('2026-11-01'),
    });
    await fixtures.future({ author, title: 'approved', startDate: d('2026-11-10') });
    await fixtures.future({
      author,
      title: 'returned',
      state: 'returned',
      startDate: d('2026-11-10'),
    });
    expect(titles(await waitingFor())).toEqual(['waits']);
    expect(titles(await forIssue())).toEqual(['approved']);
  });

  it('stays within the read scope', async () => {
    const one = await world.seed.user({ role: 'submitter' });
    const two = await world.seed.user({ role: 'submitter' });
    const head = await world.seed.user({ role: 'headmaster' });
    await fixtures.future({ author: one, title: 'one', state: 'submitted' });
    await fixtures.future({ author: two, title: 'two', state: 'submitted' });
    expect(titles(await waitingFor(MEETING, world.as(one)))).toEqual(['one']);
    expect(titles(await waitingFor(MEETING, world.as(head))).sort()).toEqual(['one', 'two']);
  });
});
