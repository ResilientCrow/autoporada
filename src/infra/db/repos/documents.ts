import { createHash } from 'node:crypto';

import { and, desc, eq } from 'drizzle-orm';

import { ScopeViolation, type DocumentRepo, type TxContext } from '@/application/ports';
import { can } from '@/domain/policy';
import { parseIsoDate } from '@/domain/time';
import { parseIssueSnapshot } from '@/snapshot';

import { generatedDocuments, issues, pdfSources } from '../schema';
import type { TxDatabase } from './database';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const DOCUMENT_ROW = {
  id: generatedDocuments.id,
  issueId: generatedDocuments.issueId,
  version: generatedDocuments.version,
  docxSha256: generatedDocuments.docxSha256,
  pdfStatus: generatedDocuments.pdfStatus,
  pdfSha256: generatedDocuments.pdfSha256,
  generatedAt: generatedDocuments.generatedAt,
};

/**
 * Generated documents over `generated_documents` and `pdf_sources` (ADR 0038). The worker's grants
 * are migrations 0037 and 0039: it reads the DOCX only from the source of a pending document.
 */
export function createDocumentRepo(db: TxDatabase, ctx: TxContext): DocumentRepo {
  const { principal } = ctx;
  // A user re-checks the policy here (ADR 0011); the worker's role is held by its column grants.
  const may = (action: 'issue.generate' | 'archive.view') => {
    if (principal.kind === 'user' && !can(principal.actor, { action })) {
      throw new ScopeViolation();
    }
  };
  const systemOnly = () => {
    if (principal.kind === 'user') throw new ScopeViolation();
  };

  return {
    async insert({ issueId, snapshot, docx }) {
      may('issue.generate');
      const [row] = await db
        .insert(generatedDocuments)
        .values({ issueId, snapshot, docx, docxSha256: sha256(docx), generatedAt: ctx.now })
        .returning(DOCUMENT_ROW);
      if (!row) throw new Error('documents.insert: no row came back');
      // The same transaction: a document without its source could never get a PDF.
      await db.insert(pdfSources).values({ documentId: row.id, docx });
      return row;
    },
    async forIssue(issueId) {
      may('archive.view');
      const [row] = await db
        .select(DOCUMENT_ROW)
        .from(generatedDocuments)
        .where(eq(generatedDocuments.issueId, issueId))
        .orderBy(desc(generatedDocuments.version))
        .limit(1);
      return row ?? null;
    },
    async archive() {
      may('archive.view');
      const rows = await db
        .select({ ...DOCUMENT_ROW, monday: issues.monday, meetingDate: issues.meetingDate })
        .from(generatedDocuments)
        .innerJoin(issues, eq(issues.id, generatedDocuments.issueId))
        .orderBy(desc(issues.meetingDate), desc(generatedDocuments.version));
      return rows.map((row) => ({
        ...row,
        monday: parseIsoDate(row.monday),
        meetingDate: parseIsoDate(row.meetingDate),
      }));
    },
    async snapshot(id) {
      may('archive.view');
      const [row] = await db
        .select({ snapshot: generatedDocuments.snapshot })
        .from(generatedDocuments)
        .where(eq(generatedDocuments.id, id));
      if (!row) return null;
      const parsed = parseIssueSnapshot(row.snapshot);
      // It was parsed before it was stored: a refusal now is a fault, not a finding.
      if (!parsed.ok) throw new Error('documents.snapshot: the stored snapshot fails its schema');
      return parsed.snapshot;
    },
    async file(id, format) {
      may('archive.view');
      const [row] = await db
        .select({
          docx: generatedDocuments.docx,
          docxSha256: generatedDocuments.docxSha256,
          pdf: generatedDocuments.pdf,
          pdfSha256: generatedDocuments.pdfSha256,
        })
        .from(generatedDocuments)
        .where(eq(generatedDocuments.id, id));
      if (!row) return null;
      if (format === 'docx') return { bytes: row.docx, sha256: row.docxSha256 };
      return row.pdf && row.pdfSha256 ? { bytes: row.pdf, sha256: row.pdfSha256 } : null;
    },
    async toConvert(id) {
      systemOnly();
      const [row] = await db
        .select({ pdfStatus: generatedDocuments.pdfStatus, docx: pdfSources.docx })
        .from(generatedDocuments)
        .leftJoin(pdfSources, eq(pdfSources.documentId, generatedDocuments.id))
        .where(eq(generatedDocuments.id, id));
      return row ?? null;
    },
    async settlePdf(id, result) {
      systemOnly();
      const set =
        result === 'failed'
          ? { pdfStatus: 'failed' as const }
          : {
              pdf: result.pdf,
              pdfSha256: sha256(result.pdf),
              pdfStatus: 'ready' as const,
              pdfAt: ctx.now,
            };
      const settled = await db
        .update(generatedDocuments)
        .set(set)
        .where(and(eq(generatedDocuments.id, id), eq(generatedDocuments.pdfStatus, 'pending')))
        .returning({ id: generatedDocuments.id });
      if (settled.length === 0) return false;
      // Settled either way, the DOCX has nothing left to wait for.
      await db.delete(pdfSources).where(eq(pdfSources.documentId, id));
      return true;
    },
  };
}
