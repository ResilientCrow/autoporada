import { defineUseCase, ok } from '@/application/core';
import { issuesWindowInput, issuesWindowOutput, toDeadlineWire } from '@/contracts';
import { lastSlotMonday, stripStart } from '@/domain/calendar';
import { compareDates, instantToWallClock, mondayOf, toIsoDate } from '@/domain/time';

import { readWindow } from './calendar';

/**
 * The meeting calendar as of now: the Monday a submission is for (the first
 * open slot whose deadline is ahead), the Monday the strip of meetings starts
 * at (the same, but a generated one counts)
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
    const { slots, first, rule, plannedThrough } = await readWindow(tx, now);
    // The wire carries the version of each row, which the worker-safe calendar does not: read the
    // calendar's stored rows again in full. A porada moved past its week starts before this Monday.
    const today = instantToWallClock(now).date;
    const stored = slots.filter((slot) => slot.stored).map((slot) => slot.monday);
    const from = [mondayOf(today), ...stored].reduce((a, b) => (compareDates(a, b) <= 0 ? a : b));
    const known = await tx.issues.between(from, lastSlotMonday(today));
    return ok({
      submitMonday: toIsoDate(first),
      stripFrom: toIsoDate(stripStart(now, slots, rule, plannedThrough)),
      issues: known.map((issue) => ({
        monday: toIsoDate(issue.monday),
        meetingDate: toIsoDate(issue.meetingDate),
        deadlineAt: issue.deadlineAt.toISOString(),
        status: issue.status,
        version: issue.version,
      })),
      rule: toDeadlineWire(rule),
      plannedThrough: toIsoDate(plannedThrough),
    });
  },
});
