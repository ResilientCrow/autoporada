import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { richDocFromText, richDocToPlainText, type RichDoc } from '@/domain/richtext';
import { calDate, parseIsoDate as d } from '@/domain/time';

import { issueFixtures } from '../../../../test/support/issues';
import { START } from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { composeDocument } from '@/document';
import { assembleIssueSnapshot } from './assemble';

const world = setupWorld();
const fixtures = issueFixtures(world);
const cli = system('cli:test');

// The clock starts Monday 19 October 2026. With no stored rows the porada of 26 October owes the
// akce that ended from 19 to 25 October (`reportsSince`).
const W1 = calDate(2026, 10, 26);

const headmaster = () => world.seed.user({ role: 'headmaster' });
const submitter = () => world.seed.user({ role: 'submitter' });
const plain = (text: string) => text.replaceAll('\u00a0', ' ');

async function assemble(by: UserRecord, monday = W1) {
  const assembled = await world.tx(
    world.as(by),
    (tx) => assembleIssueSnapshot(tx, monday, { now: START }),
    'read',
  );
  if (!assembled) throw new Error(`no porada on ${monday.year}-${monday.month}-${monday.day}`);
  return assembled;
}

const paragraphOf = (report: { body: RichDoc }) => plain(richDocToPlainText(report.body));

describe('assembleIssueSnapshot: reports nobody delivered (ADR 0049)', () => {
  it('prints a placeholder for an approved akce that ended in the window and has no report', async () => {
    const head = await headmaster();
    const author = await submitter();
    const id = await fixtures.future({
      author,
      title: 'Seminář',
      startDate: d('2026-10-22'),
      content: {
        organizer: 'organizuje pan Jan Novák (1.A)',
      },
    });

    const { snapshot, problems, facts, publish } = await assemble(head);

    expect(problems).toEqual([]);
    expect(snapshot?.reports).toHaveLength(1);
    const [report] = snapshot?.reports ?? [];
    expect(report).toMatchObject({
      id,
      title: 'Seminář',
      date: '2026-10-22',
      missing: true,
      bullets: [],
      statements: [],
    });
    expect(paragraphOf(report!)).toBe(
      'Ve čtvrtek 22. října 2026 proběhla akce Seminář. Akci zajišťovali: organizuje pan Jan Novák (1.A). Zpráva o akci nebyla dodána.',
    );
    expect(facts.missingReports).toEqual([{ id, title: 'Seminář', state: 'none' }]);
    expect(publish.missing.map((m) => m.akce.id)).toEqual([id]);
    expect(publish.missing[0]?.report).toBeNull();
  });

  it('writes a multi-day akce as a range with no time, and leaves out the sentences of an empty organizer', async () => {
    const head = await headmaster();
    const author = await submitter();
    await fixtures.future({
      author,
      title: 'Výlet',
      startDate: d('2026-10-20'),
      endDate: d('2026-10-22'),
    });

    const { snapshot } = await assemble(head);

    expect(snapshot?.reports[0]).toMatchObject({ date: '2026-10-20', endDate: '2026-10-22' });
    expect(paragraphOf(snapshot!.reports[0]!)).toBe(
      'Od úterý 20. října do čtvrtka 22. října 2026 proběhla akce Výlet. Zpráva o akci nebyla dodána.',
    );
  });

  it("prints the headmaster's stored paragraph instead of the system's", async () => {
    const head = await headmaster();
    const author = await submitter();
    const id = await fixtures.future({ author, title: 'Seminář', startDate: d('2026-10-22') });
    await world.tx(cli, async (tx) => {
      await tx.reportPlaceholders.save(id, 'Vlastní věta o semináři.', 0);
      await tx.audit.record({ action: 'test.seed', target: { type: 'future_item', id } });
    });

    const { snapshot } = await assemble(head);

    expect(paragraphOf(snapshot!.reports[0]!)).toBe('Vlastní věta o semináři.');
    expect(snapshot?.reports[0]?.missing).toBe(true);
  });

  it('leaves out an akce whose approved report the porada prints, and prints that report as it is', async () => {
    const head = await headmaster();
    const author = await submitter();
    const akce = await fixtures.future({ author, title: 'Seminář', startDate: d('2026-10-22') });
    const point = await fixtures.point({
      author,
      kind: 'report',
      title: 'Seminář',
      eventDate: d('2026-10-22'),
      futureItemId: akce,
    });

    const { snapshot, facts } = await assemble(head);

    expect(snapshot?.reports.map((r) => r.id)).toEqual([point]);
    expect(snapshot?.reports[0]?.missing).toBeUndefined();
    expect(facts.missingReports).toEqual([]);
  });

  it('dates a report by its akce: one whose own end is after the meeting still prints, with no placeholder', async () => {
    const head = await headmaster();
    const author = await submitter();
    const akce = await fixtures.future({
      author,
      title: 'Zvláštní akce',
      startDate: d('2026-10-21'),
      endDate: d('2026-10-22'),
    });
    // The report names days after the meeting; the akce, which the porada owes it for, ended before.
    const point = await fixtures.point({
      author,
      kind: 'report',
      title: 'Zvláštní zpráva',
      eventDate: d('2026-11-03'),
      endDate: d('2026-11-04'),
      futureItemId: akce,
    });

    const { snapshot, facts, publish } = await assemble(head);

    expect(snapshot?.reports).toHaveLength(1);
    expect(snapshot?.reports[0]).toMatchObject({
      id: point,
      date: '2026-10-21',
      endDate: '2026-10-22',
    });
    expect(facts.missingReports).toEqual([]);
    expect(publish.missing).toEqual([]);
    expect(JSON.stringify(composeDocument(snapshot!))).toContain('Zvláštní zpráva');
  });

  it('owes an ended akce its author revised back into review: its approved report prints', async () => {
    const head = await headmaster();
    const author = await submitter();
    const akce = await fixtures.future({
      author,
      title: 'Seminář',
      startDate: d('2026-10-22'),
      state: 'submitted',
      approvedBefore: true,
    });
    const point = await fixtures.point({
      author,
      kind: 'report',
      title: 'Seminář',
      eventDate: d('2026-10-22'),
      futureItemId: akce,
    });

    const { snapshot, facts } = await assemble(head);

    expect(snapshot?.reports.map((r) => r.id)).toEqual([point]);
    expect(facts.missingReports).toEqual([]);
  });

  it('owes an ended akce its author revised back into review: a placeholder from its current title and dates', async () => {
    const head = await headmaster();
    const author = await submitter();
    const id = await fixtures.future({
      author,
      title: 'Seminář po úpravě',
      startDate: d('2026-10-21'),
      endDate: d('2026-10-23'),
      state: 'returned',
      approvedBefore: true,
    });

    const { snapshot, facts, publish } = await assemble(head);

    expect(snapshot?.reports[0]).toMatchObject({
      id,
      title: 'Seminář po úpravě',
      date: '2026-10-21',
      endDate: '2026-10-23',
      missing: true,
    });
    expect(facts.missingReports).toEqual([{ id, title: 'Seminář po úpravě', state: 'none' }]);
    expect(publish.missing.map((m) => m.akce.id)).toEqual([id]);
  });

  it('leaves out an akce whose report is already published', async () => {
    const head = await headmaster();
    const author = await submitter();
    const akce = await fixtures.future({ author, startDate: d('2026-10-22') });
    await fixtures.point({
      author,
      kind: 'report',
      eventDate: d('2026-10-22'),
      futureItemId: akce,
      state: 'published',
    });

    const { snapshot, facts } = await assemble(head);

    expect(snapshot?.reports).toEqual([]);
    expect(facts.missingReports).toEqual([]);
  });

  it('leaves out an akce whose report the vedení refused: no placeholder, nothing to close (ADR 0056)', async () => {
    const head = await headmaster();
    const author = await submitter();
    const akce = await fixtures.future({ author, title: 'Seminář', startDate: d('2026-10-22') });
    await fixtures.point({
      author,
      kind: 'report',
      title: 'Seminář',
      eventDate: d('2026-10-22'),
      futureItemId: akce,
      state: 'rejected',
    });

    const { snapshot, facts, publish } = await assemble(head);

    expect(snapshot?.reports).toEqual([]);
    expect(facts.missingReports).toEqual([]);
    expect(publish.missing).toEqual([]);
  });

  it.each(['draft', 'submitted', 'returned', 'withdrawn'] as const)(
    'prints a placeholder, not the content, for an akce whose report is %s, and names that state',
    async (state) => {
      const head = await headmaster();
      const author = await submitter();
      const akce = await fixtures.future({ author, title: 'Seminář', startDate: d('2026-10-22') });
      const point = await fixtures.point({
        author,
        kind: 'report',
        title: 'Seminář',
        eventDate: d('2026-10-22'),
        futureItemId: akce,
        state,
        content: { opening: 'Tajný koncept.', body: richDocFromText('Tajný koncept.') },
      });

      const { snapshot, facts, publish } = await assemble(head);

      expect(snapshot?.reports.map((r) => r.id)).toEqual([akce]);
      expect(JSON.stringify(snapshot)).not.toContain('Tajný koncept');
      expect(facts.missingReports).toEqual([{ id: akce, title: 'Seminář', state }]);
      expect(publish.missing[0]?.report).toMatchObject({ id: point, state });
    },
  );

  it('does not owe an akce that ends on the meeting day, before the window, or is not approved', async () => {
    const head = await headmaster();
    const author = await submitter();
    await fixtures.future({ author, title: 'Dnes', startDate: d('2026-10-26') });
    await fixtures.future({ author, title: 'Dřív', startDate: d('2026-10-18') });
    await fixtures.future({
      author,
      title: 'Čeká',
      startDate: d('2026-10-22'),
      state: 'submitted',
    });
    await fixtures.future({ author, title: 'Návrh', startDate: d('2026-10-22'), state: 'draft' });
    await fixtures.future({
      author,
      title: 'Zamítnuto',
      startDate: d('2026-10-22'),
      state: 'rejected',
    });
    await fixtures.future({
      author,
      title: 'Schůzka',
      kind: 'jednani',
      startDate: d('2026-10-22'),
    });

    const { snapshot, facts } = await assemble(head);

    expect(snapshot?.reports).toEqual([]);
    expect(facts.missingReports).toEqual([]);
  });

  it('does not owe an akce whose report was already closed as missed', async () => {
    const head = await headmaster();
    const author = await submitter();
    await fixtures.future({
      author,
      startDate: d('2026-10-22'),
      reportState: 'missed',
    });

    const { snapshot, facts } = await assemble(head);

    expect(snapshot?.reports).toEqual([]);
    expect(facts.missingReports).toEqual([]);
  });

  it('lists placeholders with the reports that exist, oldest event first', async () => {
    const head = await headmaster();
    const author = await submitter();
    await fixtures.future({ author, title: 'Pozdní', startDate: d('2026-10-24') });
    await fixtures.future({ author, title: 'První', startDate: d('2026-10-20') });

    const { snapshot, facts } = await assemble(head);

    expect(snapshot?.reports.map((r) => r.title)).toEqual(['První', 'Pozdní']);
    expect(facts.missingReports.map((m) => m.title)).toEqual(['První', 'Pozdní']);
  });

  it('keeps a placeholder out of a porada before the akce ended', async () => {
    const head = await headmaster();
    const author = await submitter();
    await fixtures.future({ author, startDate: d('2026-10-22') });

    const { facts } = await assemble(head, calDate(2026, 10, 19));

    expect(facts.missingReports).toEqual([]);
  });
});
