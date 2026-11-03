import { beforeEach, describe, expect, it } from 'vitest';

import { runUseCase } from '@/application/core';
import { StaleVersion, system, type Tx, type UserRecord } from '@/application/ports';
import { calDate, parseIsoDate as d, toIsoDate, type CalDate } from '@/domain/time';

import { issueFixtures } from '../../../../test/support/issues';
import { registryFixtures } from '../../../../test/support/registry';
import { setupWorld } from '../../../../test/support/world';
import { generateIssue, issuePreview, issueWorkspace } from './index';

const world = setupWorld();
const fixtures = issueFixtures(world);
const registry = registryFixtures(world);
const seeder = system('test.seed');

// The clock starts Monday 19 October 2026 10.00 Prague; W1's deadline is still ahead.
const THIS_WEEK = calDate(2026, 10, 19);
const W1 = calDate(2026, 10, 26);
const W2 = calDate(2026, 11, 2);

const headmaster = () => world.seed.user({ role: 'headmaster' });

const generate = (by: UserRecord, monday: CalDate = W1, extra: Record<string, unknown> = {}) =>
  world.run(generateIssue, world.as(by), { monday: toIsoDate(monday), confirmed: true, ...extra });

/** What a generation may change, as the system sees it. */
const everything = () =>
  world.tx(
    seeder,
    async (tx) => ({
      issues: await tx.issues.between(calDate(2026, 1, 5), calDate(2027, 12, 27)),
      documents: await tx.documents.archive(),
      audit: await world.inspect.audit(),
      jobs: await world.inspect.jobs(),
    }),
    'read',
  );

async function refuses(run: () => Promise<unknown>, error: unknown) {
  const before = await everything();
  expect(await run()).toEqual({ ok: false, error });
  expect(await everything()).toEqual(before);
}

const pointOf = (id: string) => world.tx(seeder, (tx) => tx.points.get(id), 'read');
const akceOf = (id: string) => world.tx(seeder, (tx) => tx.futureItems.get(id), 'read');
const eventsOf = (id: string) => world.tx(seeder, (tx) => tx.pointEvents.list(id), 'read');

describe('issues.generate', () => {
  // This week's porada did not happen, so W1 is the first one open (ADR 0040).
  beforeEach(() => fixtures.issue(THIS_WEEK, { status: 'skipped' }));

  it('stores the document, publishes the points, marks the new entries and queues the PDF', async () => {
    const head = await headmaster();
    const author = await world.seed.user({ role: 'submitter' });
    const pokyn = await fixtures.point({ author, title: 'Nový rozvrh' });
    const list = await registry.list();
    const entry = await registry.entry(list.id, 'Dvořák');

    const result = await generate(head);
    if (!result.ok) throw new Error(JSON.stringify(result.error));

    const { issues, documents, audit, jobs } = await everything();
    const issue = issues.find((i) => toIsoDate(i.monday) === toIsoDate(W1));
    expect(issue).toMatchObject({ status: 'generated', version: result.value.version });
    expect(documents).toEqual([
      expect.objectContaining({
        id: result.value.documentId,
        issueId: issue?.id,
        version: 1,
        pdfStatus: 'pending',
        pdfSha256: null,
      }),
    ]);
    const docx = await world.tx(seeder, (tx) => tx.documents.file(result.value.documentId, 'docx'));
    expect(docx?.bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
    expect(docx?.sha256).toBe(documents[0]?.docxSha256);

    expect((await pointOf(pokyn))?.state).toBe('published');
    expect((await eventsOf(pokyn)).map((e) => e.event)).toContain('publish');
    expect((await registry.entryById(entry.id))?.firstPublishedIssueId).toBe(issue?.id);

    expect(jobs).toEqual([
      expect.objectContaining({
        name: 'pdf.render',
        data: { documentId: result.value.documentId },
        options: { dedupeKey: `pdf:${result.value.documentId}` },
      }),
    ]);
    const generated = audit.find((row) => row.action === 'issue.generated');
    expect(generated).toMatchObject({
      actorId: head.id,
      targetType: 'issue',
      targetId: issue?.id,
    });
    expect(generated?.data).toMatchObject({
      meta: {
        monday: toIsoDate(W1),
        documentId: result.value.documentId,
        docxSha256: documents[0]?.docxSha256,
        points: 1,
        missing: 0,
        entries: 1,
      },
    });
  });

  describe('reports nobody delivered (ADR 0049)', () => {
    const ended = (author: UserRecord, title = 'Seminář') =>
      fixtures.future({ author, title, startDate: d('2026-10-22') });

    it('prints the placeholder, closes the akce as missed and audits it without text', async () => {
      const head = await headmaster();
      const author = await world.seed.user({ role: 'submitter' });
      const akce = await ended(author);

      const result = await generate(head);
      if (!result.ok) throw new Error(JSON.stringify(result.error));

      expect((await akceOf(akce))?.reportState).toBe('missed');
      const stored = await world.tx(seeder, (tx) => tx.documents.snapshot(result.value.documentId));
      expect(stored?.reports.map((r) => [r.id, r.missing])).toEqual([[akce, true]]);
      const audit = await world.inspect.audit();
      const missed = audit.filter((row) => row.action === 'future.report-missed');
      expect(missed).toHaveLength(1);
      expect(missed[0]).toMatchObject({
        actorId: head.id,
        targetType: 'future_item',
        targetId: akce,
      });
      expect(JSON.stringify(missed[0]?.data)).not.toContain('Seminář');
    });

    it.each(['draft', 'returned', 'submitted'] as const)(
      'withdraws the %s report point of the akce, with its event and audit',
      async (state) => {
        const head = await headmaster();
        const author = await world.seed.user({ role: 'submitter' });
        const akce = await ended(author);
        const point = await fixtures.point({
          author,
          kind: 'report',
          eventDate: d('2026-10-22'),
          futureItemId: akce,
          state,
        });

        expect((await generate(head)).ok).toBe(true);

        expect((await pointOf(point))?.state).toBe('withdrawn');
        expect((await eventsOf(point)).at(-1)).toMatchObject({
          event: 'close',
          fromState: state,
          toState: 'withdrawn',
        });
        const closed = (await world.inspect.audit()).filter((row) => row.action === 'point.closed');
        expect(closed).toHaveLength(1);
        expect(closed[0]).toMatchObject({ actorId: head.id, targetType: 'point', targetId: point });
        expect((await akceOf(akce))?.reportState).toBe('missed');
      },
    );

    it('publishes an approved report as it is and leaves its akce alone', async () => {
      const head = await headmaster();
      const author = await world.seed.user({ role: 'submitter' });
      const akce = await ended(author);
      const point = await fixtures.point({
        author,
        kind: 'report',
        eventDate: d('2026-10-22'),
        futureItemId: akce,
      });

      expect((await generate(head)).ok).toBe(true);

      expect((await pointOf(point))?.state).toBe('published');
      expect((await akceOf(akce))?.reportState).not.toBe('missed');
      const actions = (await world.inspect.audit()).map((row) => row.action);
      expect(actions).not.toContain('future.report-missed');
      expect(actions).not.toContain('point.closed');
    });

    it('does not owe the akce again: the next porada prints no placeholder for it', async () => {
      const head = await headmaster();
      const author = await world.seed.user({ role: 'submitter' });
      await ended(author);
      expect((await generate(head)).ok).toBe(true);

      const next = await world.run(issuePreview, world.as(head), { monday: toIsoDate(W2) });
      if (!next.ok) throw new Error(JSON.stringify(next.error));
      const snapshot = JSON.parse(next.value.snapshot ?? 'null') as { reports: unknown[] } | null;
      expect(snapshot?.reports).toEqual([]);
      expect(next.value.findings.map((f) => f.code)).not.toContain('reports-missing');
    });

    it('changes nothing when the akce moves under it after the first writes: a late refusal rolls everything back', async () => {
      const head = await headmaster();
      const author = await world.seed.user({ role: 'submitter' });
      const akce = await ended(author);
      const draft = await fixtures.point({
        author,
        kind: 'report',
        eventDate: d('2026-10-22'),
        futureItemId: akce,
        state: 'draft',
      });
      const other = await ended(author, 'Jiný seminář');
      const approved = await fixtures.point({
        author,
        kind: 'report',
        eventDate: d('2026-10-22'),
        futureItemId: other,
      });
      const before = await everything();

      // Another click changed the akce after the generation read it: the real write is done, then
      // the version check of the next one fails, as it would for a concurrent edit.
      const racing = {
        ...world.deps,
        db: {
          transaction: <T>(ctx: never, options: never, work: (tx: Tx) => Promise<T>) =>
            world.deps.db.transaction(ctx, options, (tx) =>
              work({
                ...tx,
                futureItems: {
                  ...tx.futureItems,
                  markMissed: async (id: string, version: number) => {
                    const missed = await tx.futureItems.markMissed(id, version);
                    if (id === akce) throw new StaleVersion();
                    return missed;
                  },
                },
              }),
            ),
        },
      };
      const result = await runUseCase(
        generateIssue,
        {
          principal: world.as(head),
          requestId: 'test',
          input: { monday: toIsoDate(W1), confirmed: true },
        },
        racing,
      );

      expect(result).toEqual({ ok: false, error: { code: 'conflict' } });
      expect(await everything()).toEqual(before);
      expect((await akceOf(akce))?.reportState).not.toBe('missed');
      expect((await akceOf(other))?.reportState).not.toBe('missed');
      expect((await pointOf(draft))?.state).toBe('draft');
      expect((await pointOf(approved))?.state).toBe('approved');
    });

    it('closes the akce once: a second generation, or a double click, adds no second miss', async () => {
      const head = await headmaster();
      const author = await world.seed.user({ role: 'submitter' });
      const akce = await ended(author);
      const issue = await fixtures.issue(W1);
      const version = (await akceOf(akce))!.version;

      const [a, b] = await Promise.all([
        generate(head, W1, { expectedVersion: issue.version }),
        generate(head, W1, { expectedVersion: issue.version }),
      ]);
      expect([a.ok, b.ok].sort()).toEqual([false, true]);
      await refuses(() => generate(head), { code: 'rule', rule: 'issue-not-open' });

      const missed = (await world.inspect.audit()).filter(
        (row) => row.action === 'future.report-missed',
      );
      expect(missed).toHaveLength(1);
      expect((await akceOf(akce))?.version).toBe(version + 1);
    });

    it('changes nothing when the generation is refused', async () => {
      const head = await headmaster();
      const author = await world.seed.user({ role: 'submitter' });
      const akce = await ended(author);

      await refuses(() => generate(head, W1, { confirmed: undefined }), {
        code: 'invalid-input',
        fields: { confirmed: 'required' },
      });
      expect((await akceOf(akce))?.reportState).not.toBe('missed');
    });
  });

  it('lets the next porada carry on from the generated one, without what it published', async () => {
    const head = await headmaster();
    const author = await world.seed.user({ role: 'submitter' });
    await fixtures.point({ author, title: 'Jednou' });
    expect((await generate(head)).ok).toBe(true);

    const next = await world.run(issuePreview, world.as(head), { monday: toIsoDate(W2) });
    if (!next.ok) throw new Error(JSON.stringify(next.error));
    expect(next.value.origin).toMatchObject({ kind: 'derived', from: toIsoDate(W1) });
    expect(next.value.snapshot).not.toContain('Jednou');
  });

  it('previews a generated porada as it was generated, and the workspace names its document', async () => {
    const head = await headmaster();
    const author = await world.seed.user({ role: 'submitter' });
    await fixtures.point({ author, title: 'Vytištěno' });
    expect((await generate(head)).ok).toBe(true);

    const preview = await world.run(issuePreview, world.as(head), { monday: toIsoDate(W1) });
    if (!preview.ok) throw new Error(JSON.stringify(preview.error));
    expect(preview.value).toMatchObject({
      problems: [],
      findings: [],
      origin: { kind: 'stored' },
      document: { pdfStatus: 'pending' },
    });
    expect(preview.value.snapshot).toContain('Vytištěno');

    const workspace = await world.run(issueWorkspace, world.as(head), { monday: toIsoDate(W1) });
    expect(workspace).toMatchObject({
      ok: true,
      value: { slot: { status: 'generated', document: { pdfStatus: 'pending' } } },
    });
  });

  it('refuses everyone but the headmaster', async () => {
    for (const role of ['reviewer', 'submitter'] as const) {
      const user = await world.seed.user({ role });
      await refuses(() => generate(user), { code: 'forbidden' });
    }
  });

  it('needs the checkbox and a Monday of the calendar', async () => {
    const head = await headmaster();
    await refuses(() => generate(head, W1, { confirmed: undefined }), {
      code: 'invalid-input',
      fields: { confirmed: 'required' },
    });
    await refuses(() => generate(head, calDate(2026, 10, 27)), {
      code: 'invalid-input',
      fields: { monday: 'invalid' },
    });
  });

  it('refuses a skipped porada and a generated one', async () => {
    const head = await headmaster();
    await fixtures.issue(W1, { status: 'skipped' });
    await fixtures.issue(W2, { status: 'generated' });
    await refuses(() => generate(head, W1, { expectedVersion: 2 }), {
      code: 'rule',
      rule: 'issue-not-open',
    });
    await refuses(() => generate(head, W2, { expectedVersion: 2 }), {
      code: 'rule',
      rule: 'issue-not-open',
    });
  });

  it('refuses while the preview blocks it', async () => {
    const head = await headmaster();
    const issue = await fixtures.issue(W1);
    // A text the snapshot refuses (as the preview's snapshot-invalid test).
    const blocked = await world.tx(seeder, async (tx) => {
      const row = await tx.issues.setTexts(issue.id, issue.version, { present: 'Jan\u202eNovák' });
      await tx.audit.record({ action: 'test.seed', target: { type: 'issue', id: issue.id } });
      return row;
    });
    await refuses(() => generate(head, W1, { expectedVersion: blocked.version }), {
      code: 'rule',
      rule: 'issue-blocked',
    });
  });

  it('refuses a stale preview, and generates once when two click at the same time', async () => {
    const head = await headmaster();
    const issue = await fixtures.issue(W1);
    await refuses(() => generate(head, W1, { expectedVersion: issue.version + 1 }), {
      code: 'conflict',
    });

    const [a, b] = await Promise.all([
      generate(head, W1, { expectedVersion: issue.version }),
      generate(head, W1, { expectedVersion: issue.version }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    // The second waits for the first: it then finds the row changed or no longer open.
    expect([{ code: 'conflict' }, { code: 'rule', rule: 'issue-not-open' }]).toContainEqual(
      [a, b].find((r) => !r.ok)?.error,
    );
    expect((await everything()).documents).toHaveLength(1);
  });
});

describe('issues.generate in order (ADR 0040)', () => {
  it('refuses a porada while an earlier one is open, then generates both in order', async () => {
    const head = await headmaster();
    await refuses(() => generate(head, W1), { code: 'rule', rule: 'issue-blocked' });
    expect((await generate(head, THIS_WEEK)).ok).toBe(true);
    await refuses(() => generate(head, W2), { code: 'rule', rule: 'issue-blocked' });
    expect((await generate(head, W1)).ok).toBe(true);
    expect((await everything()).documents).toHaveLength(2);
  });

  it('generates a later porada once the earlier one is skipped', async () => {
    const head = await headmaster();
    await fixtures.issue(THIS_WEEK, { status: 'skipped' });
    expect((await generate(head, W1)).ok).toBe(true);
  });
});
