import { createHash } from 'node:crypto';

import {
  DatabaseFailure,
  ScopeViolation,
  type DocumentRecord,
  type DocumentRepo,
  type TxContext,
} from '@/application/ports';
import { can } from '@/domain/policy';
import { compareDates } from '@/domain/time';
import { parseIssueSnapshot } from '@/snapshot';

import { guard, refusedBy } from './guards';
import { newId, type FakeDocument, type FakeTxState } from './state';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const record = ({
  snapshot: _s,
  docx: _d,
  pdf: _p,
  pdfAt: _a,
  source: _src,
  ...rest
}: FakeDocument) => rest satisfies DocumentRecord;

/**
 * Generated documents over the fake state, with migration 0036's unique key and foreign key. The
 * PDF is the worker's derived file of the audited DOCX, so settling it writes nothing the oracle
 * counts (the worker has no audit grant; a download audits the PDF's digest).
 */
export function fakeDocumentRepo(tx: FakeTxState, ctx: TxContext): DocumentRepo {
  const { principal } = ctx;
  const { documents, issues } = tx.draft;
  const may = (action: 'issue.generate' | 'archive.view') => {
    if (principal.kind === 'user' && !can(principal.actor, { action })) throw new ScopeViolation();
  };
  const systemOnly = () => {
    if (principal.kind === 'user') throw new ScopeViolation();
  };
  // The fake keeps issues by Monday.
  const issueOf = (id: string) => [...issues.values()].find((i) => i.id === id);
  const latest = (issueId: string) =>
    [...documents.values()]
      .filter((d) => d.issueId === issueId)
      .sort((a, b) => b.version - a.version)[0];
  return {
    async insert({ issueId, snapshot, docx }) {
      guard(tx, true);
      may('issue.generate');
      if (latest(issueId)) throw refusedBy('generated_documents_issue_version_key');
      if (!issueOf(issueId)) throw refusedBy('generated_documents_issue_id_issues_id_fk');
      const row: FakeDocument = {
        id: newId(tx.draft),
        issueId,
        version: 1,
        docxSha256: sha256(docx),
        pdfStatus: 'pending',
        pdfSha256: null,
        pdfFailure: null,
        generatedAt: ctx.now,
        snapshot,
        docx,
        pdf: null,
        pdfAt: null,
        source: docx,
      };
      documents.set(row.id, row);
      tx.written.push({ type: 'document', id: row.id });
      return record(row);
    },
    async forIssue(issueId) {
      guard(tx, false);
      may('archive.view');
      const row = latest(issueId);
      return row ? record(row) : null;
    },
    async archive() {
      guard(tx, false);
      may('archive.view');
      return [...documents.values()]
        .flatMap((d) => {
          const issue = issueOf(d.issueId);
          return issue
            ? [{ ...record(d), monday: issue.monday, meetingDate: issue.meetingDate }]
            : [];
        })
        .sort((a, b) => compareDates(b.meetingDate, a.meetingDate) || b.version - a.version);
    },
    async snapshot(id) {
      guard(tx, false);
      may('archive.view');
      const row = documents.get(id);
      if (!row) return null;
      // As the repository reads it: through JSON, and refused when it fails its schema.
      const parsed = parseIssueSnapshot(JSON.parse(JSON.stringify(row.snapshot)));
      if (!parsed.ok) throw new DatabaseFailure('db.parse.generated_documents');
      return parsed.snapshot;
    },
    async file(id, format) {
      guard(tx, false);
      may('archive.view');
      const row = documents.get(id);
      if (!row) return null;
      if (format === 'docx') return { bytes: row.docx, sha256: row.docxSha256 };
      return row.pdf && row.pdfSha256 ? { bytes: row.pdf, sha256: row.pdfSha256 } : null;
    },
    async toConvert(id) {
      guard(tx, false);
      systemOnly();
      const row = documents.get(id);
      return row ? { pdfStatus: row.pdfStatus, docx: row.source } : null;
    },
    async settlePdf(id, result) {
      guard(tx, true);
      systemOnly();
      const row = documents.get(id);
      if (!row || row.pdfStatus !== 'pending') return false;
      documents.set(
        id,
        'failure' in result
          ? { ...row, pdfStatus: 'failed', pdfFailure: result.failure, source: null }
          : {
              ...row,
              pdf: result.pdf,
              pdfSha256: sha256(result.pdf),
              pdfStatus: 'ready',
              pdfAt: ctx.now,
              source: null,
            },
      );
      return true;
    },
  };
}
