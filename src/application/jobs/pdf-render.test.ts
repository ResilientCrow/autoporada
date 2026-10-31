import { describe, expect, it } from 'vitest';

import { PDF_RENDER_ATTEMPTS, system, type JobInput, type WorkerDeps } from '@/application/ports';
import { calDate } from '@/domain/time';

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
  const issue = await fixtures.issue(calDate(2026, 11, 2 + 7 * week), { status: 'generated' });
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
    expect(pdf).toBeNull();
  });

  it('skips a document that is not there', async () => {
    const { converter, deps } = setup();

    expect(
      await JOB_HANDLERS['pdf.render'](deps, job('00000000-0000-7000-8000-00000000dead')),
    ).toEqual({ kind: 'done', code: 'skipped.unknown' });
    expect(converter.calls).toHaveLength(0);
  });
});
