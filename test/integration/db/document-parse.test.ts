import { describe, expect, it } from 'vitest';

import { DatabaseFailure, system } from '@/application/ports';

import { setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();
const SECRET = 'Tajné jméno žáka';

/** A document as the owner, past the repository, whose snapshot the schema refuses. */
async function storeDocument(snapshot: string): Promise<string> {
  const [issue] = await database.owner<{ id: string }>(
    `INSERT INTO issues (monday, meeting_date, school_year, deadline_at, status)
     VALUES ('2026-11-09', '2026-11-09', '2026/2027', now(), 'generated') RETURNING id`,
  );
  const [document] = await database.owner<{ id: string }>(
    `INSERT INTO generated_documents (issue_id, snapshot, docx, docx_sha256)
     VALUES ($1, $2::jsonb, '\\x00', repeat('0', 64)) RETURNING id`,
    [issue!.id, snapshot],
  );
  return document!.id;
}

describe('a stored snapshot the schema refuses', () => {
  it('fails snapshot() as stored data, with a code only', async () => {
    const id = await storeDocument(JSON.stringify({ unknown: SECRET }));
    const failure = await database.app
      .transaction(
        { principal: system('test.seed'), now: new Date(), requestId: 'req-1' },
        { mode: 'read' },
        (tx) => tx.documents.snapshot(id),
      )
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failure).toEqual(new DatabaseFailure('db.parse.generated_documents'));
    expect((failure as Error).cause).toBeUndefined();
    expect(String((failure as Error).message)).not.toContain(SECRET);
  });
});
