import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { calDate, parseIsoDate as d } from '@/domain/time';

import { issueFixtures } from '../../../../test/support/issues';
import { setupWorld } from '../../../../test/support/world';
import { issueMissingReports } from './index';

const world = setupWorld();
const fixtures = issueFixtures(world);
const cli = system('cli:test');

// The clock starts Monday 19 October 2026: the porada of 26 October owes the akce that ended from
// 19 to 25 October.
const W1 = calDate(2026, 10, 26);

const headmaster = () => world.seed.user({ role: 'headmaster' });
const submitter = () => world.seed.user({ role: 'submitter' });
const read = (by: UserRecord, monday = '2026-10-26') =>
  world.run(issueMissingReports, world.as(by), { monday });
const plain = (text: string) => text.replaceAll('\u00a0', ' ');

async function listed(by: UserRecord, monday?: string) {
  const result = await read(by, monday);
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`);
  return result.value;
}

describe('issues.missingReports', () => {
  it.each(['submitter', 'reviewer', 'pending'] as const)('refuses a %s', async (role) => {
    expect(await read(await world.seed.user({ role }))).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    });
  });

  it('lists the akce owed to the porada with no report, by their date, with the system’s paragraph', async () => {
    const head = await headmaster();
    const author = await submitter();
    const later = await fixtures.future({
      author,
      title: 'Výlet',
      startDate: d('2026-10-23'),
      endDate: d('2026-10-24'),
    });
    const earlier = await fixtures.future({
      author,
      title: 'Seminář',
      startDate: d('2026-10-21'),
      content: {
        organizer: 'organizuje pan Jan Novák (1.A)',
      },
    });

    const page = await listed(head);

    expect(page).toMatchObject({ monday: '2026-10-26', meetingDate: '2026-10-26', open: true });
    expect(page.reports.map((r) => r.id)).toEqual([earlier, later]);
    expect(page.reports[0]).toEqual({
      id: earlier,
      title: 'Seminář',
      startDate: '2026-10-21',
      endDate: null,
      state: 'none',
      paragraph: expect.any(String),
      original: expect.any(String),
      own: false,
      status: 'open',
      checked: false,
      dueAt: expect.any(String),
      akceVersion: expect.any(Number),
      version: 0,
    });
    expect(plain(page.reports[0]!.paragraph)).toBe(
      'Ve středu 21. října 2026 proběhl Seminář. Akci zajišťovali: organizuje pan Jan Novák (1.A). Zpráva o akci nebyla dodána.',
    );
    expect(page.reports[0]!.original).toBe(page.reports[0]!.paragraph);
    expect(page.reports[1]).toMatchObject({ startDate: '2026-10-23', endDate: '2026-10-24' });
    expect(plain(page.reports[1]!.paragraph)).toBe(
      'Od pátku 23. října do soboty 24. října 2026 proběhl Výlet. Zpráva o akci nebyla dodána.',
    );
  });

  it('gives the headmaster’s own paragraph and its version in place of the system’s', async () => {
    const head = await headmaster();
    const author = await submitter();
    const id = await fixtures.future({ author, title: 'Seminář', startDate: d('2026-10-22') });
    await world.tx(cli, async (tx) => {
      await tx.reportPlaceholders.save(id, 'Vlastní věta.', 0);
      await tx.audit.record({ action: 'test.seed', target: { type: 'future_item', id } });
    });

    const [report] = (await listed(head)).reports;

    expect(report).toMatchObject({ id, paragraph: 'Vlastní věta.', own: true, version: 1 });
    // The system's paragraph stays known, for „Obnovit původní text“.
    expect(plain(report!.original)).toBe(
      'Ve čtvrtek 22. října 2026 proběhl Seminář. Zpráva o akci nebyla dodána.',
    );
  });

  it.each(['draft', 'submitted', 'returned', 'withdrawn'] as const)(
    'names the state of the report point: %s',
    async (state) => {
      const head = await headmaster();
      const author = await submitter();
      const akce = await fixtures.future({ author, startDate: d('2026-10-22') });
      await fixtures.point({
        author,
        kind: 'report',
        eventDate: d('2026-10-22'),
        futureItemId: akce,
        state,
        content: { opening: 'Tajný koncept.' },
      });

      const page = await listed(head);

      expect(page.reports.map((r) => [r.id, r.state])).toEqual([[akce, state]]);
      expect(JSON.stringify(page)).not.toContain('Tajný koncept');
    },
  );

  it('leaves out an akce whose report is approved, and one that is not owed to this porada', async () => {
    const head = await headmaster();
    const author = await submitter();
    const done = await fixtures.future({ author, startDate: d('2026-10-22') });
    await fixtures.point({
      author,
      kind: 'report',
      eventDate: d('2026-10-22'),
      futureItemId: done,
    });
    await fixtures.future({ author, title: 'Příště', startDate: d('2026-10-28') });
    await fixtures.future({ author, title: 'Dřív', startDate: d('2026-10-15') });

    expect((await listed(head)).reports).toEqual([]);
  });

  it.each(['generated'] as const)(
    'shows a %s porada as closed, with nothing to edit',
    async (status) => {
      const head = await headmaster();
      const author = await submitter();
      await fixtures.future({ author, startDate: d('2026-10-22') });
      await fixtures.issue(W1, { status });

      expect(await listed(head)).toMatchObject({ open: false, reports: [] });
    },
  );

  it('refuses a day that is no Monday and a Monday outside the calendar', async () => {
    const head = await headmaster();
    expect(await read(head, '2026-10-27')).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await read(head, '2020-01-06')).toEqual({ ok: false, error: { code: 'not-found' } });
  });
});
