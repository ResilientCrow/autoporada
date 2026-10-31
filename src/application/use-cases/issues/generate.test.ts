import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { calDate, toIsoDate, type CalDate } from '@/domain/time';

import { issueFixtures } from '../../../../test/support/issues';
import { registryFixtures } from '../../../../test/support/registry';
import { setupWorld } from '../../../../test/support/world';
import { generateIssue, issuePreview, issueWorkspace } from './index';

const world = setupWorld();
const fixtures = issueFixtures(world);
const registry = registryFixtures(world);
const seeder = system('test.seed');

// The clock starts Monday 19 October 2026 10.00 Prague; W1's deadline is still ahead.
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
const eventsOf = (id: string) => world.tx(seeder, (tx) => tx.pointEvents.list(id), 'read');

describe('issues.generate', () => {
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
        entries: 1,
      },
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
