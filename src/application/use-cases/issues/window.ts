import { defineUseCase, ok } from '@/application/core';
import { issuesWindowInput, issuesWindowOutput } from '@/contracts';
import { toIsoDate } from '@/domain/time';

import { readWindow } from './calendar';

/**
 * The meeting calendar as of now: the first Monday still open for
 * submissions and the rows of the next 26 weeks, current week first. A Monday
 * without a row is untouched (open, deadline computed) and is not listed.
 * The Přehled strip, the standing line and the lists read it; it writes nothing.
 */
export const issueWindow = defineUseCase({
  name: 'issues.window',
  mode: 'read',
  input: issuesWindowInput,
  output: issuesWindowOutput,
  access: { kind: 'gate', check: () => ({ action: 'point.create' }) },
  async execute({ tx, now }) {
    const { known, first } = await readWindow(tx, now);
    return ok({
      submitMonday: toIsoDate(first),
      issues: known.map((issue) => ({
        monday: toIsoDate(issue.monday),
        deadlineAt: issue.deadlineAt.toISOString(),
        status: issue.status,
        version: issue.version,
      })),
    });
  },
});
