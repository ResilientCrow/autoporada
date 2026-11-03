import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DatabaseFailure,
  ScopeViolation,
  StaleVersion,
  system,
  type Principal,
} from '@/application/ports';
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

describe('FutureItemRepo.owedTo (port contract)', () => {
  const owedTo = (from: string, to: string, by: Principal = cli) =>
    world.tx(by, (tx) => tx.futureItems.owedTo({ from: d(from), to: d(to) }), 'read');

  it('takes the approved akce whose last day is from the first day to the last, both included', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    await fixtures.future({ author, title: 'before', startDate: d('2026-10-25') });
    await fixtures.future({ author, title: 'first', startDate: d('2026-10-26') });
    await fixtures.future({
      author,
      title: 'multi',
      startDate: d('2026-10-20'),
      endDate: d('2026-10-30'),
    });
    await fixtures.future({ author, title: 'last', startDate: d('2026-11-01') });
    await fixtures.future({ author, title: 'after', startDate: d('2026-11-02') });
    expect(titles(await owedTo('2026-10-26', '2026-11-01'))).toEqual(['multi', 'first', 'last']);
  });

  it('takes an akce whatever its report says, except a missed one', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    for (const reportState of ['none', 'prompted', 'written', 'missed'] as const) {
      await fixtures.future({
        author,
        title: reportState,
        reportState,
        startDate: d('2026-10-28'),
      });
    }
    expect(titles(await owedTo('2026-10-26', '2026-11-01')).sort()).toEqual([
      'none',
      'prompted',
      'written',
    ]);
  });

  it('leaves out a jednání and every state but approved', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const startDate = d('2026-10-28');
    await fixtures.future({ author, kind: 'jednani', title: 'rada', startDate });
    for (const state of [
      'draft',
      'submitted',
      'returned',
      'rejected',
      'withdrawn',
      'cancelled',
    ] as const) {
      await fixtures.future({ author, title: state, state, startDate });
    }
    expect(await owedTo('2026-10-26', '2026-11-01')).toEqual([]);
  });

  it('takes an akce back in review after its author revised an approved one, not one never approved', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const startDate = d('2026-10-28');
    for (const state of ['submitted', 'returned'] as const) {
      await fixtures.future({
        author,
        title: `revised ${state}`,
        state,
        startDate,
        approvedBefore: true,
      });
      await fixtures.future({ author, title: `new ${state}`, state, startDate });
    }
    // Withdrawn, rejected, cancelled: out of the porada whatever the history.
    for (const state of ['withdrawn', 'rejected', 'cancelled'] as const) {
      await fixtures.future({ author, title: state, state, startDate, approvedBefore: true });
    }
    expect(titles(await owedTo('2026-10-26', '2026-11-01')).sort()).toEqual([
      'revised returned',
      'revised submitted',
    ]);
  });

  it('puts the earliest start first, ties to the lower id', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const x = await fixtures.future({ author, title: 'x', startDate: d('2026-10-29') });
    const y = await fixtures.future({ author, title: 'y', startDate: d('2026-10-29') });
    const first = await fixtures.future({ author, title: 'first', startDate: d('2026-10-27') });
    expect((await owedTo('2026-10-26', '2026-11-01')).map((i) => i.id)).toEqual([
      first,
      ...[x, y].sort(),
    ]);
  });

  it('stays within the read scope: a colleague sees an approved akce, the author their own', async () => {
    const one = await world.seed.user({ role: 'submitter' });
    const two = await world.seed.user({ role: 'submitter' });
    await fixtures.future({ author: one, title: 'one', startDate: d('2026-10-28') });
    await fixtures.future({ author: two, title: 'two', startDate: d('2026-10-29') });
    expect(titles(await owedTo('2026-10-26', '2026-11-01', world.as(one)))).toEqual(['one', 'two']);
  });
});

describe('FutureItemRepo.markMissed (port contract)', () => {
  const markMissed = (by: Principal, id: string, version: number) =>
    world.tx(by, async (tx) => {
      const item = await tx.futureItems.markMissed(id, version);
      await tx.audit.record({
        action: 'future.report-missed',
        target: { type: 'future_item', id },
      });
      return item;
    });
  const get = (id: string) => world.tx(cli, (tx) => tx.futureItems.get(id), 'read');

  it('closes the report as missed whoever wrote the akce, and the version rises by one', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const head = await world.seed.user({ role: 'headmaster' });
    const id = await fixtures.future({ author, title: 'Výlet' });
    const before = (await get(id))!;
    const after = await markMissed(world.as(head), id, before.version);
    expect(after).toEqual({
      ...before,
      reportState: 'missed',
      version: before.version + 1,
      updatedAt: expect.any(Date),
    });
    expect(await get(id)).toEqual(after);
  });

  it.each(['none', 'prompted', 'written'] as const)(
    'closes an akce whose report is %s',
    async (reportState) => {
      const author = await world.seed.user({ role: 'submitter' });
      const id = await fixtures.future({ author, reportState });
      const before = (await get(id))!;
      expect((await markMissed(cli, id, before.version)).reportState).toBe('missed');
    },
  );

  it.each(['submitted', 'returned'] as const)(
    'closes an akce its author revised after it was approved and that is %s',
    async (state) => {
      const author = await world.seed.user({ role: 'submitter' });
      const id = await fixtures.future({ author, state, approvedBefore: true });
      const before = (await get(id))!;
      const after = await markMissed(cli, id, before.version);
      expect(after).toMatchObject({ state, reportState: 'missed', version: before.version + 1 });
    },
  );

  it('is StaleVersion for an akce in review that was never approved', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await fixtures.future({ author, state: 'submitted' });
    await expect(markMissed(cli, id, (await get(id))!.version)).rejects.toBeInstanceOf(
      StaleVersion,
    );
  });

  it('is StaleVersion for a moved version, an unknown id, a missed report, a draft and a jednání', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await fixtures.future({ author });
    const { version } = (await get(id))!;
    await expect(markMissed(cli, id, version + 1)).rejects.toBeInstanceOf(StaleVersion);
    await expect(markMissed(cli, randomUUID(), 1)).rejects.toBeInstanceOf(StaleVersion);
    const draft = await fixtures.future({ author, state: 'draft' });
    await expect(markMissed(cli, draft, 1)).rejects.toBeInstanceOf(StaleVersion);
    const jednani = await fixtures.future({ author, kind: 'jednani' });
    await expect(markMissed(cli, jednani, (await get(jednani))!.version)).rejects.toBeInstanceOf(
      StaleVersion,
    );
    await markMissed(cli, id, version);
    await expect(markMissed(cli, id, version + 1)).rejects.toBeInstanceOf(StaleVersion);
  });

  it('refuses a user who may not generate', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const id = await fixtures.future({ author });
    const { version } = (await get(id))!;
    for (const by of [author, reviewer]) {
      await expect(markMissed(world.as(by), id, version)).rejects.toBeInstanceOf(ScopeViolation);
    }
    expect((await get(id))!.reportState).toBe('none');
  });

  it('refuses a write in a read transaction', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await fixtures.future({ author });
    await expect(world.tx(cli, (tx) => tx.futureItems.markMissed(id, 1), 'read')).rejects.toEqual(
      new DatabaseFailure('25006'),
    );
  });
});
