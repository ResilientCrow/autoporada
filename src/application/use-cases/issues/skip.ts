import { defineUseCase, fail, fromTransition, ok } from '@/application/core';
import type { IssueRecord, Tx } from '@/application/ports';
import { setSkippedInput, setSkippedOutput } from '@/contracts';
import { ISSUE_MACHINE, transition } from '@/domain/review';
import {
  orderConflicts,
  planNextMeeting,
  type DeadlineRule,
  type IssueSlot,
  type NextMeetingRefusal,
} from '@/domain/calendar';
import { compareDates, isSameDate, toIsoDate } from '@/domain/time';

import { dayOfText, mondayOfText, readWindow } from './calendar';
import { ensureIssue } from './ensure';
import { issueEvent } from './events';

const ACTIONS = { skip: 'issue.skipped', unskip: 'issue.unskipped' } as const;
/** What a client that saw no row for the Monday read: an untouched issue. */
const UNTOUCHED_VERSION = 1;

const INVALID_NEXT = { code: 'invalid-input', fields: { nextMeeting: 'invalid' } } as const;
/** How a day the next porada cannot be held on reaches the wire (ADR 0051 item 3). */
const REFUSALS = {
  early: INVALID_NEXT,
  late: INVALID_NEXT,
  same: INVALID_NEXT,
  skipped: INVALID_NEXT,
  'deadline-past': { code: 'rule', rule: 'deadline-past' },
  'meeting-order': { code: 'rule', rule: 'meeting-order' },
} as const satisfies Record<NextMeetingRefusal, unknown>;

/**
 * „Porada se nekoná“ and its undo, for one slot. The headmaster may skip any slot of the
 * calendar (`readWindow`: from this week's Monday on, or earlier with a meeting still ahead)
 * whatever its deadline: after the deadline the approved points move to the next porada, which
 * the form says. A generated slot has no skip or unskip (refused as `issue-not-open`).
 * An unskip that would break the meeting order is refused (`meeting-order`; the wire carries
 * codes only, so the conflicting slots are not named), and so is one after a later porada was
 * generated (`later-generated`, ADR 0041). A missing row is made first (ADR 0018). Skipping writes no point and sends no mail: placement
 * is computed on read.
 *
 * A skip with `nextMeeting` names the day the next porada is held (ADR 0051): `planNextMeeting`
 * decides its slot, what is skipped and the deadline of a moved slot, and refuses what it must.
 * When the day is this slot's own, it is moved and stays open; otherwise it and every open slot
 * before the held one are skipped in the same transaction, each audited, and the held one is
 * moved when the day is not its meeting date (`issue.moved`).
 */
export const setSkipped = defineUseCase({
  name: 'issues.setSkipped',
  mode: 'write',
  input: setSkippedInput,
  output: setSkippedOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.generate' }) },
  async execute({ tx, actor, now }, input) {
    if (!input.confirmed) return fail({ code: 'invalid-input', fields: { confirmed: 'required' } });
    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    const nextDay = input.nextMeeting === undefined ? undefined : dayOfText(input.nextMeeting);
    if (nextDay === null || (nextDay && input.event !== 'skip')) return fail(INVALID_NEXT);

    const { slots, rule } = await readWindow(tx, now);
    const slot = slots.find((s) => compareDates(s.monday, monday) === 0);
    if (!slot) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    if (slot.status === 'generated') return fail({ code: 'rule', rule: 'issue-not-open' });
    let plan = null;
    if (nextDay) {
      if (slot.status !== 'open') return fail({ code: 'rule', rule: 'issue-not-open' });
      const planned = planNextMeeting(slots, slot, nextDay, { rule, now });
      if (!planned.ok) return fail(REFUSALS[planned.refusal]);
      plan = planned.plan;
    }
    // A porada that takes place again must still fit the order of the others (ADR 0034).
    if (input.event === 'unskip' && slot.status === 'skipped') {
      // Poradas are generated in order (ADR 0040): none comes back behind a generated one.
      if (slots.some((s) => s.status === 'generated' && compareDates(s.monday, monday) > 0))
        return fail({ code: 'rule', rule: 'later-generated' });
      const back = { ...slot, status: 'open' as const };
      if (orderConflicts(slots, back).length > 0)
        return fail({ code: 'rule', rule: 'meeting-order' });
    }

    const { issue } = await ensureIssue(tx, monday, rule);
    if (issue.version !== (input.expectedVersion ?? UNTOUCHED_VERSION)) {
      return fail({ code: 'conflict' });
    }
    if (plan && isSameDate(plan.held.monday, monday)) {
      const moved = await reschedule(tx, issue, plan.held);
      return ok({ status: moved.status, version: moved.version });
    }
    const step = transition(ISSUE_MACHINE, issue.status, input.event, {
      kind: 'user',
      role: actor.role,
      isAuthor: false,
    });
    if (!step.ok) return fromTransition(step);

    const after = await tx.issues.setStatus(issue.id, issue.version, step.to);
    await tx.audit.record(
      issueEvent(ACTIONS[input.event], issue, after, { monday: toIsoDate(monday) }),
    );
    if (plan) {
      const between = plan.skipped.filter((s) => !isSameDate(s.monday, monday));
      // A failure rolls this slot's skip back with the rest.
      if (!(await holdNext(tx, rule, slots, between, plan.moved ? plan.held : null)))
        return fail({ code: 'conflict' });
    }
    return ok({ status: after.status, version: after.version });
  },
});

/** The row is still the slot the plan was made on: open, with the same meeting date and deadline. */
function asPlanned(row: IssueRecord, slots: readonly IssueSlot[]): boolean {
  const seen = slots.find((s) => isSameDate(s.monday, row.monday));
  return (
    seen !== undefined &&
    row.status === 'open' &&
    isSameDate(row.meetingDate, seen.meetingDate) &&
    row.deadlineAt.getTime() === seen.deadlineAt.getTime()
  );
}

/**
 * Skips the open slots `between` and moves `held` to its new day, each audited. False, having
 * written part of it, when a row changed since `slots` were read: only the skipped slot carries
 * the client's version, so this is how a concurrent skip or move of a later slot is caught.
 */
async function holdNext(
  tx: Tx,
  rule: DeadlineRule,
  slots: readonly IssueSlot[],
  between: readonly IssueSlot[],
  held: IssueSlot | null,
): Promise<boolean> {
  for (const later of between) {
    const { issue: row } = await ensureIssue(tx, later.monday, rule);
    if (!asPlanned(row, slots)) return false;
    const skipped = await tx.issues.setStatus(row.id, row.version, 'skipped');
    await tx.audit.record(
      issueEvent(ACTIONS.skip, row, skipped, { monday: toIsoDate(later.monday) }),
    );
  }
  if (!held) return true;
  const { issue: row } = await ensureIssue(tx, held.monday, rule);
  if (!asPlanned(row, slots)) return false;
  await reschedule(tx, row, held);
  return true;
}

/** Moves the row to the held slot's meeting date and deadline, audited with the dates and the new deadline (ADR 0034). */
async function reschedule(tx: Tx, row: IssueRecord, held: IssueSlot): Promise<IssueRecord> {
  const after = await tx.issues.reschedule(row.id, row.version, {
    meetingDate: held.meetingDate,
    deadlineAt: held.deadlineAt,
  });
  await tx.audit.record(
    issueEvent('issue.moved', row, after, {
      monday: toIsoDate(row.monday),
      from: toIsoDate(row.meetingDate),
      to: toIsoDate(held.meetingDate),
      deadlineAt: after.deadlineAt.toISOString(),
    }),
  );
  return after;
}
