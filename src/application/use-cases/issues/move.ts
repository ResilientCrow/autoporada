import { defineUseCase, fail, fromTransition, ok } from '@/application/core';
import { movedNoticeJob } from '@/application/notifications';
import { moveIssueInput, moveIssueOutput } from '@/contracts';
import { lastSlotMonday, orderConflicts } from '@/domain/calendar';
import { ISSUE_MACHINE, transition } from '@/domain/review';
import {
  addDays,
  compareDates,
  instantToWallClock,
  isSameDate,
  parseIsoDate,
  parseWallTime,
  toIsoDate,
  wallClockToInstant,
  type CalDate,
} from '@/domain/time';

import { mondayOfText, readWindow } from './calendar';
import { ensureIssue } from './ensure';
import { issueEvent } from './events';

/** What a client that saw no row for the Monday read: an untouched issue. */
const UNTOUCHED_VERSION = 1;

/** The calendar day the text names, or null when it is out of range. */
function dayOfText(text: string): CalDate | null {
  try {
    return parseIsoDate(text);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/**
 * Moves a porada to any date from today to the end of the calendar's horizon (ADR 0034), with
 * the deadline that goes with it. The slots in the way (`orderConflicts`) are named by the form
 * and cancelled with the move when the headmaster confirmed them; a generated one can never be
 * cancelled, and the cancelled set must be exactly the conflicts, so nothing is skipped by
 * accident. The rule is read first, before any issue row (lock order, ADR 0032). A skipped or
 * generated slot is not moved (`issue-not-open`); a deadline already past, other than the one
 * the slot has, is refused (`deadline-past`). Dates and counts go to the audit log, no text.
 */
export const moveIssue = defineUseCase({
  name: 'issues.move',
  mode: 'write',
  input: moveIssueInput,
  output: moveIssueOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.generate' }) },
  async execute({ tx, actor, now }, input) {
    const monday = mondayOfText(input.monday);
    const meetingDate = dayOfText(input.meetingDate);
    const deadlineDate = dayOfText(input.deadlineDate);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    if (!meetingDate) return fail({ code: 'invalid-input', fields: { meetingDate: 'invalid' } });
    if (!deadlineDate) return fail({ code: 'invalid-input', fields: { deadlineDate: 'invalid' } });
    const skip = input.skip.map(dayOfText);
    if (skip.some((day) => day === null)) {
      return fail({ code: 'invalid-input', fields: { skip: 'invalid' } });
    }
    const skipDays = skip.flatMap((day) => (day ? [day] : []));

    const { slots, rule } = await readWindow(tx, now);
    const slot = slots.find((s) => compareDates(s.monday, monday) === 0);
    if (!slot) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    if (slot.status !== 'open') return fail({ code: 'rule', rule: 'issue-not-open' });

    const today = instantToWallClock(now).date;
    const horizon = addDays(lastSlotMonday(today), 13);
    if (compareDates(meetingDate, today) < 0 || compareDates(meetingDate, horizon) > 0) {
      return fail({ code: 'invalid-input', fields: { meetingDate: 'invalid' } });
    }
    if (compareDates(deadlineDate, meetingDate) >= 0) {
      return fail({ code: 'invalid-input', fields: { deadlineDate: 'invalid' } });
    }
    const deadlineAt = wallClockToInstant(deadlineDate, parseWallTime(input.deadlineTime));
    const deadlineMoved = deadlineAt.getTime() !== slot.deadlineAt.getTime();
    if (deadlineMoved && deadlineAt.getTime() <= now.getTime()) {
      return fail({ code: 'rule', rule: 'deadline-past' });
    }

    const conflicts = orderConflicts(slots, { ...slot, meetingDate, deadlineAt });
    const inWay = (day: CalDate) => conflicts.some((c) => isSameDate(c.monday, day));
    if (
      conflicts.some(
        (c) => c.status === 'generated' || !skipDays.some((d) => isSameDate(d, c.monday)),
      )
    ) {
      return fail({ code: 'rule', rule: 'meeting-order' });
    }
    if (skipDays.length > 0 && !input.confirmed)
      return fail({ code: 'rule', rule: 'meeting-order' });
    if (!skipDays.every(inWay)) return fail({ code: 'invalid-input', fields: { skip: 'invalid' } });

    const { issue } = await ensureIssue(tx, monday, rule);
    if (issue.version !== (input.expectedVersion ?? UNTOUCHED_VERSION)) {
      return fail({ code: 'conflict' });
    }
    for (const day of skipDays) {
      const { issue: other } = await ensureIssue(tx, day, rule);
      const step = transition(ISSUE_MACHINE, other.status, 'skip', {
        kind: 'user',
        role: actor.role,
        isAuthor: false,
      });
      if (!step.ok) return fromTransition(step);
      const after = await tx.issues.setStatus(other.id, other.version, step.to);
      await tx.audit.record(
        issueEvent('issue.skipped', other, after, {
          monday: toIsoDate(other.monday),
          reason: 'moved',
        }),
      );
    }
    const after = await tx.issues.reschedule(issue.id, issue.version, { meetingDate, deadlineAt });
    await tx.audit.record({
      ...issueEvent('issue.moved', issue, after, {
        monday: toIsoDate(monday),
        from: toIsoDate(slot.meetingDate),
        to: toIsoDate(meetingDate),
        deadlineMoved,
        skipped: skipDays.length,
      }),
    });
    // Only a deadline that comes earlier and is still ahead costs the submitters time (D21).
    if (deadlineAt.getTime() < slot.deadlineAt.getTime() && deadlineAt.getTime() > now.getTime()) {
      const notice = movedNoticeJob(monday, deadlineAt);
      await tx.jobs.enqueue('issues.moved-notice', notice.data, { dedupeKey: notice.dedupeKey });
    }
    return ok({ version: after.version, skipped: skipDays.length });
  },
});
