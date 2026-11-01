import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DatabaseFailure,
  ScopeViolation,
  system,
  type DocumentRecord,
  type Principal,
  type Tx,
} from '@/application/ports';
import { PDF_FAILURES } from '@/contracts';
import { addDays, calDate } from '@/domain/time';

import { issueFixtures } from '../support/issues';
import { snapshotFixture } from '../support/snapshots';
import { setupWorld } from '../support/world';

const world = setupWorld();
const fixtures = issueFixtures(world);
const seeder = system('test.seed');
const DOCX = new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]);
const DOCX_SHA256 = createHash('sha256').update(DOCX).digest('hex');
const PDF = new TextEncoder().encode('%PDF-1.7 test');
const UNKNOWN_ID = '00000000-0000-7000-8000-00000000dead';

let week = 0;
/** A fresh issue on its own Monday, so a test never meets another test's document. */
const issue = (meetingOffsetDays = 0) => {
  week += 1;
  const monday = addDays(calDate(2026, 11, 2), 7 * week);
  return fixtures.issue(monday, {
    status: 'generated',
    meetingDate: addDays(monday, meetingOffsetDays),
  });
};

const insert = (issueId: string, by: Principal = seeder) =>
  world.tx(by, async (tx) => {
    const document = await tx.documents.insert({
      issueId,
      snapshot: snapshotFixture('template-replica'),
      docx: DOCX,
    });
    await tx.audit.record({ action: 'test.seed', target: { type: 'document', id: document.id } });
    return document;
  });

const generated = async (): Promise<DocumentRecord> => insert((await issue()).id);

const read = <T>(work: (tx: Tx) => Promise<T>, by: Principal = seeder) =>
  world.tx(by, work, 'read');

/** The worker's side: the jobs role in the pg world (migrations 0037 and the one after). */
const asWorker = <T>(work: (tx: Tx) => Promise<T>, mode: 'read' | 'write' = 'write') =>
  world.workerDb.transaction(
    { principal: system('job:pdf.render'), now: world.clock.now(), requestId: 'test' },
    { mode },
    work,
  );

describe('DocumentRepo (port contract)', () => {
  it('makes version 1, pending, with the digest of the DOCX', async () => {
    const row = await issue();
    const document = await insert(row.id);
    expect(document).toEqual({
      id: document.id,
      issueId: row.id,
      version: 1,
      docxSha256: DOCX_SHA256,
      pdfStatus: 'pending',
      pdfSha256: null,
      pdfFailure: null,
      generatedAt: world.clock.now(),
    });
  });

  it('refuses a second document for the issue, and keeps the first', async () => {
    const row = await issue();
    const first = await insert(row.id);
    await expect(insert(row.id)).rejects.toEqual(
      new DatabaseFailure('db.constraint.generated_documents_issue_version_key'),
    );
    expect(await read((tx) => tx.documents.forIssue(row.id))).toEqual(first);
  });

  it('gives the latest document of an issue, or null', async () => {
    const row = await issue();
    const other = await issue();
    expect(await read((tx) => tx.documents.forIssue(row.id))).toBeNull();
    const document = await insert(row.id);
    expect(await read((tx) => tx.documents.forIssue(row.id))).toEqual(document);
    expect(await read((tx) => tx.documents.forIssue(other.id))).toBeNull();
  });

  it('lists the archive by meeting date, the latest meeting first', async () => {
    const early = await issue();
    const moved = await issue(5);
    const late = await issue();
    // inserted out of order
    const documents = [await insert(moved.id), await insert(late.id), await insert(early.id)];
    const archive = await read((tx) => tx.documents.archive());
    const ids = new Set(documents.map((d) => d.id));
    const ours = archive.filter((d) => ids.has(d.id));
    expect(ours.map((d) => d.issueId)).toEqual([late.id, moved.id, early.id]);
    expect(ours[1]).toMatchObject({ monday: moved.monday, meetingDate: moved.meetingDate });
    expect(ours.map((d) => d.meetingDate)).toEqual([
      late.meetingDate,
      moved.meetingDate,
      early.meetingDate,
    ]);
  });

  it('gives back the snapshot it was made from, parsed, and null for an unknown document', async () => {
    const document = await generated();
    expect(await read((tx) => tx.documents.snapshot(document.id))).toEqual(
      snapshotFixture('template-replica'),
    );
    expect(await read((tx) => tx.documents.snapshot(UNKNOWN_ID))).toBeNull();
  });

  it('gives the DOCX with its digest, and the PDF only once it is ready', async () => {
    const document = await generated();
    expect(await read((tx) => tx.documents.file(document.id, 'docx'))).toEqual({
      bytes: DOCX,
      sha256: DOCX_SHA256,
    });
    expect(await read((tx) => tx.documents.file(document.id, 'pdf'))).toBeNull();
    expect(await read((tx) => tx.documents.file(UNKNOWN_ID, 'docx'))).toBeNull();

    await asWorker((tx) => tx.documents.settlePdf(document.id, { pdf: PDF }));
    expect(await read((tx) => tx.documents.file(document.id, 'pdf'))).toEqual({
      bytes: PDF,
      sha256: createHash('sha256').update(PDF).digest('hex'),
    });
  });

  describe('the worker’s side', () => {
    it('reads the status and the DOCX of a pending document, and knows no unknown one', async () => {
      const document = await generated();
      expect(await asWorker((tx) => tx.documents.toConvert(document.id), 'read')).toEqual({
        pdfStatus: 'pending',
        docx: DOCX,
      });
      expect(await asWorker((tx) => tx.documents.toConvert(UNKNOWN_ID), 'read')).toBeNull();
    });

    it('settles a pending document once, and the source is gone afterwards', async () => {
      const document = await generated();
      expect(await asWorker((tx) => tx.documents.settlePdf(document.id, { pdf: PDF }))).toBe(true);

      expect(await asWorker((tx) => tx.documents.toConvert(document.id), 'read')).toEqual({
        pdfStatus: 'ready',
        docx: null,
      });
      expect(await read((tx) => tx.documents.forIssue(document.issueId))).toMatchObject({
        pdfStatus: 'ready',
        pdfSha256: createHash('sha256').update(PDF).digest('hex'),
      });
      // only from pending: neither another PDF nor a failure changes it
      expect(
        await asWorker((tx) => tx.documents.settlePdf(document.id, { failure: 'error' })),
      ).toBe(false);
      expect(
        await asWorker((tx) =>
          tx.documents.settlePdf(document.id, { pdf: new TextEncoder().encode('%PDF-other') }),
        ),
      ).toBe(false);
      expect(await read((tx) => tx.documents.file(document.id, 'pdf'))).toMatchObject({
        bytes: PDF,
      });
    });

    it('marks a document failed, drops the source, and the DOCX stays', async () => {
      const document = await generated();
      expect(
        await asWorker((tx) => tx.documents.settlePdf(document.id, { failure: 'error' })),
      ).toBe(true);

      expect(await asWorker((tx) => tx.documents.toConvert(document.id), 'read')).toEqual({
        pdfStatus: 'failed',
        docx: null,
      });
      expect(await asWorker((tx) => tx.documents.settlePdf(document.id, { pdf: PDF }))).toBe(false);
      expect(await read((tx) => tx.documents.file(document.id, 'pdf'))).toBeNull();
      expect(await read((tx) => tx.documents.file(document.id, 'docx'))).toMatchObject({
        bytes: DOCX,
      });
    });

    it('keeps why the conversion failed, for every reason, and none for a pending or a ready one', async () => {
      const pending = await generated();
      expect(pending.pdfFailure).toBeNull();
      const ready = await generated();
      await asWorker((tx) => tx.documents.settlePdf(ready.id, { pdf: PDF }));
      expect(await read((tx) => tx.documents.forIssue(ready.issueId))).toMatchObject({
        pdfStatus: 'ready',
        pdfFailure: null,
      });
      for (const failure of PDF_FAILURES) {
        const document = await generated();
        expect(
          await asWorker((tx) => tx.documents.settlePdf(document.id, { failure })),
          failure,
        ).toBe(true);
        expect(await read((tx) => tx.documents.forIssue(document.issueId))).toMatchObject({
          pdfStatus: 'failed',
          pdfFailure: failure,
        });
        const archived = (await read((tx) => tx.documents.archive())).find(
          (d) => d.id === document.id,
        );
        expect(archived).toMatchObject({ pdfStatus: 'failed', pdfFailure: failure });
      }
    });

    it('does not change the reason of a settled document', async () => {
      const document = await generated();
      await asWorker((tx) => tx.documents.settlePdf(document.id, { failure: 'timeout' }));
      expect(
        await asWorker((tx) => tx.documents.settlePdf(document.id, { failure: 'refused' })),
      ).toBe(false);
      expect(await read((tx) => tx.documents.forIssue(document.issueId))).toMatchObject({
        pdfFailure: 'timeout',
      });
    });

    it('does not settle an unknown document', async () => {
      expect(await asWorker((tx) => tx.documents.settlePdf(UNKNOWN_ID, { failure: 'error' }))).toBe(
        false,
      );
    });
  });

  describe('scope', () => {
    it('lets only the headmaster make a document', async () => {
      const row = await issue();
      for (const role of ['submitter', 'reviewer'] as const) {
        const user = world.as(await world.seed.user({ role }));
        await expect(insert(row.id, user), role).rejects.toBeInstanceOf(ScopeViolation);
      }
      const head = world.as(await world.seed.user({ role: 'headmaster' }));
      await expect(insert(row.id, head)).resolves.toMatchObject({ issueId: row.id });
    });

    it('lets only a reviewer or the headmaster read the archive, the snapshot and the files', async () => {
      const document = await generated();
      const teacher = world.as(await world.seed.user({ role: 'submitter' }));
      const reads: ((tx: Tx) => Promise<unknown>)[] = [
        (tx) => tx.documents.forIssue(document.issueId),
        (tx) => tx.documents.archive(),
        (tx) => tx.documents.snapshot(document.id),
        (tx) => tx.documents.file(document.id, 'docx'),
        (tx) => tx.documents.file(document.id, 'pdf'),
      ];
      for (const work of reads) {
        await expect(read(work, teacher)).rejects.toBeInstanceOf(ScopeViolation);
      }
      for (const role of ['reviewer', 'headmaster'] as const) {
        const user = world.as(await world.seed.user({ role }));
        for (const work of reads) await expect(read(work, user)).resolves.not.toThrow();
      }
    });

    it('keeps the PDF job’s calls from every user, whatever the role', async () => {
      const document = await generated();
      for (const role of ['submitter', 'reviewer', 'headmaster'] as const) {
        const user = world.as(await world.seed.user({ role }));
        await expect(
          read((tx) => tx.documents.toConvert(document.id), user),
          role,
        ).rejects.toBeInstanceOf(ScopeViolation);
        await expect(
          world.tx(user, (tx) => tx.documents.settlePdf(document.id, { failure: 'error' })),
          role,
        ).rejects.toBeInstanceOf(ScopeViolation);
      }
      expect(await read((tx) => tx.documents.forIssue(document.issueId))).toMatchObject({
        pdfStatus: 'pending',
      });
    });
  });
});
