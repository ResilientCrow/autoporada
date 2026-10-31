import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { addDays, calDate } from '@/domain/time';

import { issueFixtures } from '../../support/issues';
import { snapshotFixture } from '../../support/snapshots';
import { setupWorld } from '../../support/world';

const world = setupWorld();
const fixtures = issueFixtures(world);
const PDF_SHA = 'b'.repeat(64);

let week = 0;
/** A document of its own issue, pending, made through the repository. */
async function pendingDocument(): Promise<string> {
  week += 1;
  const issue = await fixtures.issue(addDays(calDate(2026, 11, 2), 7 * week), {
    status: 'generated',
  });
  return world.tx(system('test.seed'), async (tx) => {
    const document = await tx.documents.insert({
      issueId: issue.id,
      snapshot: snapshotFixture('template-replica'),
      docx: new Uint8Array([0x50, 0x4b, 3, 4]),
    });
    await tx.audit.record({ action: 'test.seed', target: { type: 'document', id: document.id } });
    return document.id;
  });
}

/** The statement as the schema owner, which the grants do not bind: only the trigger can refuse it. */
async function ownerOutcome(sql: string, params: unknown[]) {
  try {
    await world.pg?.owner(sql, params);
    return 'allowed';
  } catch (error) {
    return (error as { code?: string }).code ?? 'failed';
  }
}

const settle = (id: string) =>
  ownerOutcome(
    `UPDATE generated_documents
        SET pdf = '\\x255044462d', pdf_sha256 = $2, pdf_status = 'ready', pdf_at = now()
      WHERE id = $1`,
    [id, PDF_SHA],
  );

const DENIED = '42501';

describe('generated_documents guard, in PostgreSQL (migration 0039)', () => {
  it('allows the pending to ready settle, as the owner', async () => {
    const id = await pendingDocument();
    expect(await settle(id)).toBe('allowed');
  });

  it('allows the pending to failed settle', async () => {
    const id = await pendingDocument();
    expect(
      await ownerOutcome(`UPDATE generated_documents SET pdf_status = 'failed' WHERE id = $1`, [
        id,
      ]),
    ).toBe('allowed');
  });

  it.each([
    ['docx', `docx = '\\x00'`],
    ['docx_sha256', `docx_sha256 = '${'c'.repeat(64)}'`],
    ['snapshot', `snapshot = '{"changed":true}'`],
    ['version', `version = 2`],
    ['generated_at', `generated_at = generated_at + interval '1 day'`],
    [
      'issue_id',
      `issue_id = (SELECT id FROM issues WHERE id <> generated_documents.issue_id LIMIT 1)`,
    ],
    ['id', `id = uuidv7()`],
  ])('refuses changing %s of a pending document, even as the owner', async (_column, set) => {
    await pendingDocument();
    await pendingDocument(); // a second issue, for issue_id to move to
    const id = await pendingDocument();
    expect(await ownerOutcome(`UPDATE generated_documents SET ${set} WHERE id = $1`, [id])).toBe(
      DENIED,
    );
  });

  it('refuses changing the DOCX when the same statement settles the PDF', async () => {
    const id = await pendingDocument();
    expect(
      await ownerOutcome(
        `UPDATE generated_documents
            SET docx = '\\x00', pdf = '\\x255044462d', pdf_sha256 = $2, pdf_status = 'ready', pdf_at = now()
          WHERE id = $1`,
        [id, PDF_SHA],
      ),
    ).toBe(DENIED);
  });

  it('refuses any change to a ready document, the PDF included', async () => {
    const id = await pendingDocument();
    expect(await settle(id)).toBe('allowed');
    expect(
      await ownerOutcome(`UPDATE generated_documents SET pdf = '\\x00' WHERE id = $1`, [id]),
    ).toBe(DENIED);
    expect(
      await ownerOutcome(
        `UPDATE generated_documents SET pdf = NULL, pdf_sha256 = NULL, pdf_at = NULL, pdf_status = 'pending' WHERE id = $1`,
        [id],
      ),
    ).toBe(DENIED);
    expect(
      await ownerOutcome(`UPDATE generated_documents SET docx = '\\x00' WHERE id = $1`, [id]),
    ).toBe(DENIED);
  });

  it('refuses any change to a failed document', async () => {
    const id = await pendingDocument();
    await world.pg?.owner(`UPDATE generated_documents SET pdf_status = 'failed' WHERE id = $1`, [
      id,
    ]);
    expect(await settle(id)).toBe(DENIED);
    expect(
      await ownerOutcome(`UPDATE generated_documents SET pdf_status = 'pending' WHERE id = $1`, [
        id,
      ]),
    ).toBe(DENIED);
  });

  it('keeps the stored files as they were after the refusals', async () => {
    const id = await pendingDocument();
    await ownerOutcome(`UPDATE generated_documents SET docx = '\\x00' WHERE id = $1`, [id]);
    const rows = await world.pg?.owner<{ docx: Buffer; pdf_status: string }>(
      `SELECT docx, pdf_status FROM generated_documents WHERE id = $1`,
      [id],
    );
    expect(rows).toEqual([{ docx: Buffer.from([0x50, 0x4b, 3, 4]), pdf_status: 'pending' }]);
  });
});
