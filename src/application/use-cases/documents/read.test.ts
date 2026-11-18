import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';

import { classifyFailure } from '@/application/core';
import { DatabaseFailure, system, type UserRecord } from '@/application/ports';
import type { readDocumentOutput } from '@/contracts';
import { composeDocument, type DocumentModel } from '@/document';
import { calDate, toIsoDate, type CalDate } from '@/domain/time';

import { documentFixtures } from '../../../../test/support/documents';
import { issueFixtures } from '../../../../test/support/issues';
import { snapshotFixture } from '../../../../test/support/snapshots';
import { setupWorld } from '../../../../test/support/world';
import { generateIssue } from '../issues';
import { readDocument } from './index';

const world = setupWorld();
const fixtures = issueFixtures(world);
const { stored } = documentFixtures(world);
const seeder = system('test.seed');

// The clock starts Monday 19 October 2026 10.00 Prague: W1, this week's, is the first porada open.
const W1 = calDate(2026, 10, 19);
const W2 = calDate(2026, 11, 2);

const headmaster = () => world.seed.user({ role: 'headmaster' });
const read = (by: UserRecord, monday: CalDate | string) =>
  world.run(readDocument, world.as(by), {
    monday: typeof monday === 'string' ? monday : toIsoDate(monday),
  });

const pointCount = (model: DocumentModel) =>
  model.sections.flatMap((s) => s.blocks).filter((b) => b.kind === 'point').length;

describe('the document wire model', () => {
  it('is the document model: nothing is added to it, nothing is lost', () => {
    type Wire = z.output<typeof readDocumentOutput>['model'];
    expectTypeOf<Wire>().toExtend<DocumentModel>();
    expectTypeOf<DocumentModel>().toExtend<Wire>();
  });
});

describe('documents.read', () => {
  it('gives the model composed from the snapshot a generation stored, with its count and time', async () => {
    const head = await headmaster();
    const generation = await world.run(generateIssue, world.as(head), {
      monday: toIsoDate(W1),
      confirmed: true,
    });
    if (!generation.ok) throw new Error(JSON.stringify(generation.error));
    const { id, generatedAt, snapshot } = await world.tx(
      seeder,
      async (tx) => {
        const [row] = await tx.documents.archive();
        if (!row) throw new Error('no document');
        return {
          id: row.id,
          generatedAt: row.generatedAt,
          snapshot: await tx.documents.snapshot(row.id),
        };
      },
      'read',
    );
    if (!snapshot) throw new Error(`no snapshot of ${id}`);
    const expected = composeDocument(snapshot);

    const result = await read(head, W1);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.model).toEqual(expected);
    expect(result.value.points).toBe(pointCount(expected));
    expect(result.value.at).toBe(generatedAt.toISOString());
  });

  it('keeps every block kind of a full document through the output schema', async () => {
    const document = await stored(W1);
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const expected = composeDocument(snapshotFixture('template-replica'));
    expect(new Set(expected.sections.flatMap((s) => s.blocks).map((b) => b.kind)).size).toBe(16);

    const result = await read(reviewer, W1);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.model).toEqual(expected);
    expect(result.value.points).toBe(17);
    expect(result.value.at).toBe(document.generatedAt.toISOString());
  });

  it('answers each porada with its own document', async () => {
    const head = await headmaster();
    const first = await stored(W1);
    const second = await stored(W2, {
      snapshot: snapshotFixture('template-replica', (raw) => {
        raw['presentText'] = 'Mgr. Jiná Osoba';
      }),
    });
    const a = await read(head, W1);
    const b = await read(head, W2);
    if (!a.ok || !b.ok) throw new Error('not read');
    expect(a.value.at).toBe(first.generatedAt.toISOString());
    expect(b.value.at).toBe(second.generatedAt.toISOString());
    expect(a.value.model).not.toEqual(b.value.model);
  });

  it('refuses a submitter, who may not read the archive', async () => {
    await stored(W1);
    const submitter = await world.seed.user({ role: 'submitter' });
    expect(await read(submitter, W1)).toEqual({ ok: false, error: { code: 'forbidden' } });
  });

  it('finds nothing for a porada without a document or a Monday that has none', async () => {
    const head = await headmaster();
    await stored(W1);
    await fixtures.issue(W2);
    expect(await read(head, W2)).toEqual({ ok: false, error: { code: 'not-found' } });
    expect(await read(head, calDate(2026, 11, 9))).toEqual({
      ok: false,
      error: { code: 'not-found' },
    });
  });

  it('fails as stored data, never ok, for a porada whose stored snapshot the schema refuses', async () => {
    const head = await headmaster();
    await stored(W1, {
      snapshot: {
        ...snapshotFixture('template-replica'),
        // A control character (BEL) in a table cell: the text rule refuses it.
        annexes: [{ title: '', parts: [{ kind: 'table', rows: [['a\u0007b']] }] }],
      },
    });

    // The use case lets the failure out; the pipeline answers it as `unavailable` (ADR 0044).
    const failure = await read(head, W1).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toEqual(new DatabaseFailure('db.parse.generated_documents'));
    expect(classifyFailure(failure)).toBe('stored-data');
  });

  it('refuses a date that is not a Monday and text that is not a date', async () => {
    const head = await headmaster();
    expect(await read(head, calDate(2026, 10, 27))).toEqual({
      ok: false,
      error: { code: 'invalid-input', fields: { monday: 'invalid' } },
    });
    expect((await read(head, 'zítra')).ok).toBe(false);
  });

  it('writes no audit record', async () => {
    await stored(W1);
    const head = await headmaster();
    const before = await world.inspect.audit();
    expect((await read(head, W1)).ok).toBe(true);
    expect(await world.inspect.audit()).toEqual(before);
  });
});
