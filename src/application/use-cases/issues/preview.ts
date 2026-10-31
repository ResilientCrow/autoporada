import { defineUseCase, fail, ok } from '@/application/core';
import { issuePreviewInput, issuePreviewOutput } from '@/contracts';
import type { OutlineOrigin } from '@/domain/outline';
import { toIsoDate } from '@/domain/time';

import { documentInfoOf } from '../documents/info';
import { assembleIssueSnapshot } from './assemble';
import type { AssemblyProblem } from './assemble-types';
import { mondayOfText } from './calendar';
import { preflight, type Finding } from './preflight';

const originWire = (origin: OutlineOrigin) =>
  origin.kind === 'derived'
    ? { kind: origin.kind, from: toIsoDate(origin.from), how: origin.how }
    : origin;

const problemWire = (problem: AssemblyProblem) =>
  problem.code === 'snapshot-invalid' ? { ...problem, paths: [...problem.paths] } : problem;

const findingWire = ({ refs, paths, earlier, ...finding }: Finding) => ({
  ...finding,
  ...(earlier && {
    earlier: { monday: toIsoDate(earlier.monday), meetingDate: toIsoDate(earlier.meetingDate) },
  }),
  ...(refs && {
    refs: refs.map(({ due, ...r }) => ({ ...r, ...(due && { due: due.toISOString() }) })),
  }),
  ...(paths && { paths: [...paths] }),
});

/**
 * The document as it would be printed now, for the headmaster's preview and the reviewers' read
 * (D14, U11): the snapshot of the Monday's issue and what could not be taken into it, and the
 * preflight findings. Problems are data, not refusals; the page composes the document from the snapshot.
 * A generated porada previews the snapshot its document was composed from (ADR 0038).
 */
export const issuePreview = defineUseCase({
  name: 'issues.preview',
  mode: 'read',
  input: issuePreviewInput,
  output: issuePreviewOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.preview' }) },
  async execute({ tx, now }, input) {
    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    const { snapshot, problems, facts } = await assembleIssueSnapshot(tx, monday, { now });
    const { id, status } = facts.issue;
    const document = id !== null && status === 'generated' ? await tx.documents.forIssue(id) : null;
    if (document) {
      // A generated porada shows what was generated, not what the data would print now.
      const stored = await tx.documents.snapshot(document.id);
      return ok({
        snapshot: stored && JSON.stringify(stored),
        problems: [],
        findings: [],
        origin: { kind: 'stored' as const },
        document: documentInfoOf(document),
      });
    }
    return ok({
      snapshot: snapshot === null ? null : JSON.stringify(snapshot),
      problems: problems.map(problemWire),
      findings: preflight(facts, problems, now).map(findingWire),
      origin: originWire(facts.origin),
      document: null,
    });
  },
});
