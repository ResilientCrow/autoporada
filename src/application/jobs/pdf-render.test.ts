import { describe, expect, it } from 'vitest';

import {
  PDF_RENDER_ATTEMPTS,
  system,
  type Db,
  type JobInput,
  type WorkerDeps,
} from '@/application/ports';
import { addDays, calDate } from '@/domain/time';

import { createFakeConverter } from '../../../test/support/fake-converter';
import { issueFixtures } from '../../../test/support/issues';
import { snapshotFixture } from '../../../test/support/snapshots';
import { setupWorld } from '../../../test/support/world';
import { JOB_HANDLERS } from './index';

const world = setupWorld();
const fixtures = issueFixtures(world);
const DOCX = new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]);

/** The worker's side: autoporada_jobs in the pg world, with its column grants of migration 0037. */
const setup = () => {
  const converter = createFakeConverter();
  const deps: WorkerDeps = {
    db: world.workerDb,
    clock: world.clock,
    appOrigin: 'https://autoporada.test',
    converter,
    mail: { send: () => Promise.reject(new Error('a PDF job sends no mail')) },
  };
  return { converter, deps };
};

const job = (documentId: string, attempt = 1): JobInput<'pdf.render'> => ({
  id: `pdf-${attempt}`,
  data: { documentId },
  attempt,
  dedupeKey: `pdf:${documentId}`,
  redriven: false,
});

let week = 0;
const generated = async () => {
  week += 1;
  const issue = await fixtures.issue(addDays(calDate(2026, 11, 2), 7 * week), {
    status: 'generated',
  });
  return world.tx(system('test.seed'), async (tx) => {
    const document = await tx.documents.insert({
      issueId: issue.id,
      snapshot: snapshotFixture('template-replica'),
      docx: DOCX,
    });
    await tx.audit.record({ action: 'test.seed', target: { type: 'document', id: document.id } });
    return document;
  });
};

const stored = (id: string) =>
  world.tx(system('test.seed'), async (tx) => ({
    record: (await tx.documents.archive()).find((d) => d.id === id),
    pdf: await tx.documents.file(id, 'pdf'),
  }));

describe('the pdf.render handler', () => {
  it('converts the DOCX outside any transaction and stores the PDF with its digest', async () => {
    const { converter, deps } = setup();
    const document = await generated();

    expect(await JOB_HANDLERS['pdf.render'](deps, job(document.id))).toEqual({
      kind: 'done',
      code: 'rendered',
    });

    expect(converter.calls).toEqual([{ docx: DOCX, insideTransaction: false }]);
    const { record, pdf } = await stored(document.id);
    expect(record?.pdfStatus).toBe('ready');
    expect(pdf?.bytes.slice(0, 5)).toEqual(new TextEncoder().encode('%PDF-'));
    expect(pdf?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record?.pdfSha256).toBe(pdf?.sha256);
  });

  it('converts once: a second run finds the PDF settled', async () => {
    const { converter, deps } = setup();
    const document = await generated();
    await JOB_HANDLERS['pdf.render'](deps, job(document.id));

    expect(await JOB_HANDLERS['pdf.render'](deps, job(document.id, 2))).toEqual({
      kind: 'done',
      code: 'already.settled',
    });
    expect(converter.calls).toHaveLength(1);
  });

  it('retries a failed conversion, then marks the PDF failed on the last attempt', async () => {
    const { converter, deps } = setup();
    const document = await generated();
    converter.script(
      { ok: false, code: 'convert.unavailable' },
      { ok: false, code: 'convert.http.503' },
    );

    expect(await JOB_HANDLERS['pdf.render'](deps, job(document.id))).toEqual({
      kind: 'retry',
      code: 'convert.unavailable',
    });
    expect((await stored(document.id)).record?.pdfStatus).toBe('pending');

    expect(await JOB_HANDLERS['pdf.render'](deps, job(document.id, PDF_RENDER_ATTEMPTS))).toEqual({
      kind: 'done',
      code: 'failed.convert.http.503',
    });
    const { record, pdf } = await stored(document.id);
    expect(record?.pdfStatus).toBe('failed');
    expect(record?.pdfFailure).toBe('unavailable');
    expect(pdf).toBeNull();
  });

  it.each([
    ['convert.timeout', 'timeout'],
    ['convert.http.422', 'refused'],
    ['convert.not-pdf', 'not-pdf'],
    ['convert.too-large', 'too-large'],
  ] as const)('stores why the last attempt failed: %s is %s', async (code, reason) => {
    const { converter, deps } = setup();
    const document = await generated();
    converter.script({ ok: false, code });

    await JOB_HANDLERS['pdf.render'](deps, job(document.id, PDF_RENDER_ATTEMPTS));

    expect((await stored(document.id)).record).toMatchObject({
      pdfStatus: 'failed',
      pdfFailure: reason,
    });
  });

  it('stores no reason for a PDF that was made', async () => {
    const { deps } = setup();
    const document = await generated();
    await JOB_HANDLERS['pdf.render'](deps, job(document.id));
    expect((await stored(document.id)).record?.pdfFailure).toBeNull();
  });

  it('skips a document that is not there', async () => {
    const { converter, deps } = setup();

    expect(
      await JOB_HANDLERS['pdf.render'](deps, job('00000000-0000-7000-8000-00000000dead')),
    ).toEqual({ kind: 'done', code: 'skipped.unknown' });
    expect(converter.calls).toHaveLength(0);
  });

  it('treats a pending document without its source as a fault: it is thrown, not skipped', async () => {
    const { converter, deps } = setup();
    const document = await generated();
    const sourceless: Db = {
      transaction: (ctx, options, work) =>
        world.workerDb.transaction(ctx, options, (tx) =>
          work({
            ...tx,
            documents: {
              ...tx.documents,
              toConvert: () => Promise.resolve({ pdfStatus: 'pending', docx: null }),
            },
          }),
        ),
    };

    await expect(
      JOB_HANDLERS['pdf.render']({ ...deps, db: sourceless }, job(document.id)),
    ).rejects.toThrow(/source/);
    expect(converter.calls).toHaveLength(0);
    expect((await stored(document.id)).record?.pdfStatus).toBe('pending');
  });

  describe('a fault (a throw, not a failed conversion)', () => {
    const boom = new Error('converter blew up');

    it('propagates before the last attempt, so the queue retries, and leaves the PDF pending', async () => {
      const { converter, deps } = setup();
      const document = await generated();
      converter.script(boom);

      await expect(
        JOB_HANDLERS['pdf.render'](deps, job(document.id, PDF_RENDER_ATTEMPTS - 1)),
      ).rejects.toBe(boom);
      expect((await stored(document.id)).record?.pdfStatus).toBe('pending');
    });

    it('marks the PDF failed on the last attempt instead of leaving it pending for good', async () => {
      const { converter, deps } = setup();
      const document = await generated();
      converter.script(boom);

      const outcome = await JOB_HANDLERS['pdf.render'](deps, job(document.id, PDF_RENDER_ATTEMPTS));

      expect(outcome).toEqual({ kind: 'done', code: 'failed.error' });
      const { record, pdf } = await stored(document.id);
      expect(record?.pdfStatus).toBe('failed');
      expect(record?.pdfFailure).toBe('error');
      expect(pdf).toBeNull();
    });

    it('carries a code the job log accepts', async () => {
      const { converter, deps } = setup();
      const document = await generated();
      converter.script(boom);

      const outcome = await JOB_HANDLERS['pdf.render'](deps, job(document.id, PDF_RENDER_ATTEMPTS));

      expect(outcome.kind === 'done' && outcome.code).toMatch(/^[a-z]+(\.[A-Za-z0-9_-]+)*$/);
      expect(outcome.kind === 'done' && outcome.code.length).toBeLessThanOrEqual(40);
    });

    it('rethrows the original error on the last attempt when the failed mark cannot be written', async () => {
      const { converter, deps } = setup();
      const document = await generated();
      converter.script(boom);
      const readOnly: Db = {
        transaction: (ctx, options, work) =>
          options.mode === 'write'
            ? Promise.reject(new Error('the database is gone'))
            : world.workerDb.transaction(ctx, options, work),
      };

      await expect(
        JOB_HANDLERS['pdf.render'](
          { ...deps, db: readOnly },
          job(document.id, PDF_RENDER_ATTEMPTS),
        ),
      ).rejects.toBe(boom);
      expect((await stored(document.id)).record?.pdfStatus).toBe('pending');
    });

    it('does not mark a document failed whose PDF a concurrent run already stored', async () => {
      const { converter, deps } = setup();
      const document = await generated();
      converter.script(boom);
      // the other run finishes between this one's read and its failure mark
      const racing: Db = {
        transaction: async (ctx, options, work) => {
          if (options.mode === 'write') {
            await world.workerDb.transaction(ctx, options, (tx) =>
              tx.documents.settlePdf(document.id, { pdf: new TextEncoder().encode('%PDF-1') }),
            );
          }
          return world.workerDb.transaction(ctx, options, work);
        },
      };

      expect(
        await JOB_HANDLERS['pdf.render'](
          { ...deps, db: racing },
          job(document.id, PDF_RENDER_ATTEMPTS),
        ),
      ).toEqual({ kind: 'done', code: 'already.settled' });
      expect((await stored(document.id)).record?.pdfStatus).toBe('ready');
    });
  });
});
