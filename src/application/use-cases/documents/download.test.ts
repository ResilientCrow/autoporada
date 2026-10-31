import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { calDate, toIsoDate, type CalDate } from '@/domain/time';

import { issueFixtures } from '../../../../test/support/issues';
import { setupWorld } from '../../../../test/support/world';
import { generateIssue } from '../issues';
import { downloadDocument } from './index';

const world = setupWorld();
const fixtures = issueFixtures(world);
const worker = system('job:pdf.render');

// The clock starts Monday 19 October 2026 10.00 Prague; W1's deadline is still ahead.
const W1 = calDate(2026, 10, 26);
const W2 = calDate(2026, 11, 2);

const headmaster = () => world.seed.user({ role: 'headmaster' });

async function generated(monday: CalDate = W1) {
  const head = await headmaster();
  const result = await world.run(generateIssue, world.as(head), {
    monday: toIsoDate(monday),
    confirmed: true,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value.documentId;
}

const download = (by: UserRecord, format: 'docx' | 'pdf', monday: CalDate = W1) =>
  world.run(downloadDocument, world.as(by), { monday: toIsoDate(monday), format });

describe('documents.download', () => {
  it('hands a staff reviewer the DOCX by the meeting date and audits its digest', async () => {
    const documentId = await generated();
    const reviewer = await world.seed.user({ role: 'reviewer' });

    const result = await download(reviewer, 'docx');
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.fileName).toBe('porada-2026-10-26.docx');
    expect(result.value.bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));

    const audit = await world.inspect.audit();
    const row = audit.find((r) => r.action === 'document.downloaded');
    expect(row).toMatchObject({
      actorId: reviewer.id,
      targetType: 'document',
      targetId: documentId,
    });
    expect(row?.data).toMatchObject({
      meta: { monday: toIsoDate(W1), format: 'docx', sha256: result.value.sha256 },
    });
  });

  it('finds no PDF until the worker stored it, then hands it out', async () => {
    const documentId = await generated();
    const head = await headmaster();
    expect(await download(head, 'pdf')).toEqual({ ok: false, error: { code: 'not-found' } });

    const pdf = new TextEncoder().encode('%PDF-1.7 test');
    await world.workerDb.transaction(
      { principal: worker, now: world.clock.now(), requestId: 'test' },
      { mode: 'write' },
      (tx) => tx.documents.settlePdf(documentId, { pdf }),
    );
    const result = await download(head, 'pdf');
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value).toMatchObject({ fileName: 'porada-2026-10-26.pdf', bytes: pdf });
  });

  it('names the file by the meeting date of a moved porada', async () => {
    await fixtures.issue(W1, { meetingDate: calDate(2026, 10, 27) });
    const head = await headmaster();
    const result = await world.run(generateIssue, world.as(head), {
      monday: toIsoDate(W1),
      expectedVersion: 1,
      confirmed: true,
    });
    expect(result.ok).toBe(true);
    expect(await download(head, 'docx')).toMatchObject({
      ok: true,
      value: { fileName: 'porada-2026-10-27.docx' },
    });
  });

  it('refuses a submitter, and finds nothing for a porada without a document', async () => {
    await generated();
    const submitter = await world.seed.user({ role: 'submitter' });
    expect(await download(submitter, 'docx')).toEqual({ ok: false, error: { code: 'forbidden' } });

    const head = await headmaster();
    await fixtures.issue(W2);
    expect(await download(head, 'docx', W2)).toEqual({ ok: false, error: { code: 'not-found' } });
    expect(await download(head, 'docx', calDate(2026, 11, 9))).toEqual({
      ok: false,
      error: { code: 'not-found' },
    });
    expect(await download(head, 'docx', calDate(2026, 10, 27))).toEqual({
      ok: false,
      error: { code: 'invalid-input', fields: { monday: 'invalid' } },
    });
  });
});
