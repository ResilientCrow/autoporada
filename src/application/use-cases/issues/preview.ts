import { defineUseCase, fail, ok } from '@/application/core';
import { issuePreviewInput, issuePreviewOutput } from '@/contracts';
import type { OutlineOrigin } from '@/domain/outline';
import { toIsoDate } from '@/domain/time';

import { assembleIssueSnapshot } from './assemble';
import type { AssemblyProblem } from './assemble-types';
import { mondayOfText } from './calendar';

const originWire = (origin: OutlineOrigin) =>
  origin.kind === 'derived'
    ? { kind: origin.kind, from: toIsoDate(origin.from), how: origin.how }
    : origin;

const problemWire = (problem: AssemblyProblem) =>
  problem.code === 'snapshot-invalid' ? { ...problem, paths: [...problem.paths] } : problem;

/**
 * The document as it would be printed now, for the headmaster's preview and the reviewers' read
 * (D14, U11): the snapshot of the Monday's issue and what could not be taken into it. Problems
 * are data, not refusals; the page composes the document from the snapshot.
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
    return ok({ snapshot, problems: problems.map(problemWire), origin: originWire(facts.origin) });
  },
});
