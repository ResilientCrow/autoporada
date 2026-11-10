import { defineUseCase, fail, ok } from '@/application/core';
import { addIssueInput, addIssueOutput } from '@/contracts';
import { planAdd, type AddRefusal } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import { toIsoDate } from '@/domain/time';

import { dayOfText, INVALID_DATE, readWindow } from './calendar';
import { issueEvent } from './events';

/** How a day no porada can be added on reaches the wire (ADR 0054 item 5). */
const REFUSALS = {
  early: INVALID_DATE,
  late: INVALID_DATE,
  'porada-exists': { code: 'rule', rule: 'porada-exists' },
  'later-generated': { code: 'rule', rule: 'later-generated' },
  'meeting-order': { code: 'rule', rule: 'meeting-order' },
} as const satisfies Record<AddRefusal, unknown>;

/**
 * „Přidat poradu“ (ADR 0054 item 5, rare): a porada held on `meetingDate`, keyed by the nearest
 * Monday of that day, which must have no porada. The row is written directly: `ensureIssue` would
 * refuse a Monday the calendar does not name. A deadline that has already passed is allowed. The
 * calendar lock is taken in update mode first. Sends no mail.
 */
export const addIssue = defineUseCase({
  name: 'issues.add',
  mode: 'write',
  input: addIssueInput,
  output: addIssueOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.generate' }) },
  async execute({ tx, now }, input) {
    await tx.settings.lock('deadline', 'update');
    const date = dayOfText(input.meetingDate);
    if (!date) return fail(INVALID_DATE);

    const { slots, rule } = await readWindow(tx, now);
    const planned = planAdd(slots, date, { rule, now });
    if (!planned.ok) return fail(REFUSALS[planned.refusal]);

    const { added } = planned;
    const { issue, inserted } = await tx.issues.ensure({
      monday: added.monday,
      meetingDate: added.meetingDate,
      schoolYear: schoolYear(added.monday),
      deadlineAt: added.deadlineAt,
    });
    // A row the calendar did not name (it never reads past the horizon) is a porada all the same.
    if (!inserted) return fail({ code: 'rule', rule: 'porada-exists' });
    await tx.audit.record(
      issueEvent('issue.added', null, issue, {
        monday: toIsoDate(added.monday),
        meetingDate: toIsoDate(added.meetingDate),
        deadlineAt: issue.deadlineAt.toISOString(),
      }),
    );
    return ok({
      monday: toIsoDate(issue.monday),
      meetingDate: toIsoDate(issue.meetingDate),
      deadlineAt: issue.deadlineAt.toISOString(),
      version: issue.version,
    });
  },
});
