import { beforeEach, describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';
import { calDate, parseIsoDate as d, parseWallTime } from '@/domain/time';

import { issueFixtures } from '../../../../test/support/issues';
import { setupWorld } from '../../../../test/support/world';
import { owedReports } from './index';

const world = setupWorld();
const fixtures = issueFixtures(world);

// Sunday 25 October 2026, 23.00 in Prague (winter time from that night): the week's Monday is
// 19 October, whose porada was held that day and is not generated. It owes the akce that ended from
// 12 to 18 October; the porada of 26 October owes those that ended from 19 to 25 October.
const SUNDAY_NIGHT = new Date('2026-10-25T22:00:00Z');
const W0 = calDate(2026, 10, 19);

const submitter = () => world.seed.user({ role: 'submitter' });
const read = (by: UserRecord) => world.run(owedReports, world.as(by), {});

async function listed(by: UserRecord) {
  const result = await read(by);
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`);
  return result.value.items;
}

describe('future.owedReports', () => {
  beforeEach(() => world.clock.set(SUNDAY_NIGHT));

  it('refuses a pending user', async () => {
    expect(await read(await world.seed.user({ role: 'pending' }))).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    });
  });

  it('lists the author’s ended akce owed to an open porada, by porada then close, with both', async () => {
    const author = await submitter();
    const sunday = await fixtures.future({ author, title: 'Neděle', startDate: d('2026-10-25') });
    const wednesday = await fixtures.future({
      author,
      title: 'Středa',
      startDate: d('2026-10-21'),
      endDate: d('2026-10-22'),
      content: { timeFrom: parseWallTime('09:00'), timeTo: parseWallTime('12:00') },
    });
    const held = await fixtures.future({ author, title: 'Minule', startDate: d('2026-10-15') });

    const items = await listed(author);

    expect(items.map((i) => i.id)).toEqual([held, wednesday, sunday]);
    // The porada held on 19 October is not generated yet, so it still prints its report.
    expect(items[0]).toMatchObject({
      monday: '2026-10-19',
      meetingDate: '2026-10-19',
      // Its deadline: Saturday 17 October, 20.00 (summer time).
      closesAt: '2026-10-17T18:00:00.000Z',
      report: null,
    });
    expect(items[1]).toEqual({
      id: wednesday,
      title: 'Středa',
      startDate: '2026-10-21',
      endDate: '2026-10-22',
      timeFrom: '09:00',
      timeTo: '12:00',
      monday: '2026-10-26',
      meetingDate: '2026-10-26',
      closesAt: '2026-10-24T18:00:00.000Z',
      report: null,
    });
    // Sunday's akce ends after the deadline: its own close, two hours after its 20.00 end (ADR 0035).
    expect(items[2]).toMatchObject({ monday: '2026-10-26', closesAt: '2026-10-25T21:00:00.000Z' });
  });

  it('leaves out someone else’s akce, one not ended, one not approved, a missed one and a jednání', async () => {
    const author = await submitter();
    const other = await submitter();
    await fixtures.future({ author: other, startDate: d('2026-10-21') });
    await fixtures.future({
      author,
      startDate: d('2026-10-25'),
      content: { timeTo: parseWallTime('23:30') },
    });
    await fixtures.future({ author, startDate: d('2026-10-21'), state: 'submitted' });
    await fixtures.future({ author, startDate: d('2026-10-21'), reportState: 'missed' });
    await fixtures.future({ author, kind: 'jednani', startDate: d('2026-10-21') });

    expect(await listed(author)).toEqual([]);
  });

  it('leaves out an akce whose porada is generated', async () => {
    const author = await submitter();
    await fixtures.future({ author, startDate: d('2026-10-15') });
    await fixtures.issue(W0, { status: 'generated' });

    expect(await listed(author)).toEqual([]);
  });

  it('takes a skipped porada’s akce to the next open one', async () => {
    const author = await submitter();
    const akce = await fixtures.future({ author, startDate: d('2026-10-15') });
    await fixtures.issue(W0, { status: 'skipped' });

    expect(await listed(author)).toMatchObject([{ id: akce, monday: '2026-10-26' }]);
  });

  it.each(['draft', 'returned'] as const)(
    'keeps an akce whose report is %s, with the report to go on with',
    async (state) => {
      const author = await submitter();
      const akce = await fixtures.future({ author, startDate: d('2026-10-21') });
      const report = await fixtures.point({
        author,
        kind: 'report',
        eventDate: d('2026-10-21'),
        futureItemId: akce,
        state,
      });

      expect(await listed(author)).toMatchObject([{ id: akce, report: { id: report, state } }]);
    },
  );

  it.each(['submitted', 'approved'] as const)(
    'leaves out an akce whose report is %s',
    async (state) => {
      const author = await submitter();
      const akce = await fixtures.future({
        author,
        startDate: d('2026-10-21'),
        reportState: 'written',
      });
      await fixtures.point({
        author,
        kind: 'report',
        eventDate: d('2026-10-21'),
        futureItemId: akce,
        state,
      });

      expect(await listed(author)).toEqual([]);
    },
  );

  it('counts a withdrawn report as none started, while a new one may be started', async () => {
    const author = await submitter();
    const fresh = await fixtures.future({ author, startDate: d('2026-10-21') });
    const closed = await fixtures.future({
      author,
      startDate: d('2026-10-22'),
      reportState: 'written',
    });
    for (const akce of [fresh, closed]) {
      await fixtures.point({
        author,
        kind: 'report',
        eventDate: d('2026-10-21'),
        futureItemId: akce,
        state: 'withdrawn',
      });
    }

    // A report handed in once and then withdrawn leaves the akce written: „Napsat zprávu“ would be refused.
    expect(await listed(author)).toMatchObject([{ id: fresh, report: null }]);
  });
});
