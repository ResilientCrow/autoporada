import { defineUseCase, fail, ok } from '@/application/core';
import { moveIssueInput, moveIssueOutput } from '@/contracts';
import { planMove, type MoveRefusal } from '@/domain/calendar';
import { compareDates, toIsoDate } from '@/domain/time';

import { dayOfText, INVALID_DATE, mondayOfText, readWindow } from './calendar';
import { ensureIssue } from './ensure';
import { issueEvent } from './events';

/** What a client that saw no row for the Monday read: an untouched issue. */
const UNTOUCHED_VERSION = 1;

/** How a day the porada cannot be moved to reaches the wire (ADR 0054 item 3). */
const REFUSALS = {
  early: INVALID_DATE,
  late: INVALID_DATE,
  same: INVALID_DATE,
  'not-open': { code: 'rule', rule: 'issue-not-open' },
  'porada-exists': { code: 'rule', rule: 'porada-exists' },
  'deadline-past': { code: 'rule', rule: 'deadline-past' },
  'meeting-order': { code: 'rule', rule: 'meeting-order' },
} as const satisfies Record<MoveRefusal, unknown>;

/**
 * „Přesunout poradu“ (ADR 0054 item 3): the open porada of `monday` is held on `meetingDate`. The
 * Monday key, its points, outline, texts and annexes stay; the meeting date and the deadline (the
 * rule's for the new day, frozen) change. `planMove` decides and refuses, as the dialogs run it. The
 * calendar lock is taken in update mode first (ADR 0032, 0054 item 7); a missing row is made. Sends
 * no mail.
 */
export const moveIssue = defineUseCase({
  name: 'issues.move',
  mode: 'write',
  input: moveIssueInput,
  output: moveIssueOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.generate' }) },
  async execute({ tx, now }, input) {
    await tx.settings.lock('deadline', 'update');
    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    const date = dayOfText(input.meetingDate);
    if (!date) return fail(INVALID_DATE);

    const { slots, rule, plannedThrough } = await readWindow(tx, now);
    const slot = slots.find((s) => compareDates(s.monday, monday) === 0);
    if (!slot) return fail({ code: 'not-found' });
    const planned = planMove(slots, slot, date, { rule, now });
    if (!planned.ok) return fail(REFUSALS[planned.refusal]);

    const ensured = await ensureIssue(tx, monday, { rule, plannedThrough });
    if (!ensured) return fail({ code: 'not-found' });
    const { issue } = ensured;
    if (issue.version !== (input.expectedVersion ?? UNTOUCHED_VERSION)) {
      return fail({ code: 'conflict' });
    }
    const { moved } = planned;
    const after = await tx.issues.reschedule(issue.id, issue.version, {
      meetingDate: moved.meetingDate,
      deadlineAt: moved.deadlineAt,
    });
    await tx.audit.record(
      issueEvent('issue.moved', issue, after, {
        monday: toIsoDate(monday),
        from: toIsoDate(issue.meetingDate),
        to: toIsoDate(moved.meetingDate),
        deadlineAt: after.deadlineAt.toISOString(),
      }),
    );
    return ok({
      monday: toIsoDate(monday),
      meetingDate: toIsoDate(after.meetingDate),
      deadlineAt: after.deadlineAt.toISOString(),
      version: after.version,
    });
  },
});
