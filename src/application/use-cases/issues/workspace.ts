import { defineUseCase, fail, ok } from '@/application/core';
import { issueWorkspaceInput, issueWorkspaceOutput } from '@/contracts';
import { placementSlot, workingSlot } from '@/domain/calendar';
import { compareDates, instantToWallClock, toIsoDate } from '@/domain/time';

import { documentInfoOf } from '../documents/info';
import { mondayOfText, readWindow } from './calendar';

/**
 * What the headmaster's porada page shows of a slot: its meeting date, deadline, status and the
 * points waiting for it, and the working slot (the one /porada opens). The staff reviewers ask
 * it too, for the same working slot on the way to the preview (D14). A Monday outside the
 * calendar is not found. Read-only; the rule is read first, before any issue row.
 */
export const issueWorkspace = defineUseCase({
  name: 'issues.workspace',
  mode: 'read',
  input: issueWorkspaceInput,
  output: issueWorkspaceOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.preview' }) },
  async execute({ tx, now }, input) {
    const { slots } = await readWindow(tx, now);
    const today = instantToWallClock(now).date;
    const working = workingSlot(today, slots);
    const workingMonday = working && toIsoDate(working.monday);
    if (input.monday === undefined) return ok({ working: workingMonday, slot: null });

    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    const slot = slots.find((s) => compareDates(s.monday, monday) === 0);
    if (!slot) return fail({ code: 'not-found' });

    // Where the points go if this porada does not take place: the next open slot from its Monday.
    const without = slots.map((s) => (s === slot ? { ...s, status: 'skipped' as const } : s));
    const next = placementSlot(slot.monday, today, without);
    const [row] = await tx.issues.between(monday, monday);
    const waiting = await tx.points.waitingFor(monday, slot.meetingDate);
    const approved = await tx.points.eligibleFor(monday, slot.meetingDate);
    const document = row && (await tx.documents.forIssue(row.id));
    return ok({
      working: workingMonday,
      slot: {
        monday: toIsoDate(slot.monday),
        meetingDate: toIsoDate(slot.meetingDate),
        deadlineAt: slot.deadlineAt.toISOString(),
        status: slot.status,
        version: row?.version ?? null,
        next: next && toIsoDate(next.meetingDate),
        counts: {
          waiting: waiting.submitted.length,
          returned: waiting.returned.length,
          approved: approved.length,
          later: waiting.later.length,
        },
        document: document ? documentInfoOf(document) : null,
      },
    });
  },
});
