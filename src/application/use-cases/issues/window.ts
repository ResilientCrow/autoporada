import { defineUseCase, ok } from '@/application/core';
import { issuesWindowInput, issuesWindowOutput, toDeadlineWire } from '@/contracts';
import { lastSlotMonday, skipWindow } from '@/domain/calendar';
import { instantToWallClock, mondayOf, toIsoDate } from '@/domain/time';

import { readWindow } from './calendar';

/**
 * The meeting calendar as of now: the Monday a submission is for (the first
 * open slot whose deadline is ahead), the Monday the strip of meetings starts
 * at (the same, but a skipped or generated one counts, so it can be undone)
 * and the rows from the current week up to the last slot Monday. A Monday
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
    const { slots, first, rule } = await readWindow(tx, now);
    // The wire carries the version of each row, which the worker-safe calendar does not.
    const today = instantToWallClock(now).date;
    const known = await tx.issues.between(mondayOf(today), lastSlotMonday(today));
    return ok({
      submitMonday: toIsoDate(first),
      stripFrom: toIsoDate(skipWindow(now, slots, rule).first),
      issues: known.map((issue) => ({
        monday: toIsoDate(issue.monday),
        deadlineAt: issue.deadlineAt.toISOString(),
        status: issue.status,
        version: issue.version,
      })),
      rule: toDeadlineWire(rule),
    });
  },
});
