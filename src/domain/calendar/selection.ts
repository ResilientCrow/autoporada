import type { PointKind } from '@/domain/report';
import type { PointState } from '@/domain/review';
import { addDays, compareDates, instantToWallClock, mondayOf, type CalDate } from '@/domain/time';

import { deadline, type DeadlineRule } from './issue-calendar';
import { submitMonday, type IssueRow, type IssueSlot } from './slots';

/**
 * The Monday a handed-in point is due for (ADR 0029): the later of its fixed first Monday and the
 * Monday of its last hand-in. A resubmit after a retract or a return needs the hand-in one, as its
 * `earliest` may be over.
 */
export function dueMonday({
  earliest,
  handIn,
}: {
  readonly earliest: CalDate;
  readonly handIn: CalDate;
}): CalDate {
  return compareDates(earliest, handIn) >= 0 ? earliest : handIn;
}

/**
 * Whether a point belongs to the issue of `slot` (ADR 0029): approved, due by the slot's Monday,
 * and a report only once its event's last day is before the meeting date (no last day, no
 * report). Independent of now, the rule and the other slots: the SQL of `points.eligibleFor` says
 * the same.
 */
export function inIssue(
  point: {
    readonly state: PointState;
    readonly kind: PointKind;
    readonly earliest: CalDate;
    readonly handIn: CalDate;
    readonly lastDay: CalDate | null;
  },
  slot: Pick<IssueSlot, 'monday' | 'meetingDate'>,
): boolean {
  return (
    point.state === 'approved' &&
    compareDates(dueMonday(point), slot.monday) <= 0 &&
    (point.kind !== 'report' ||
      (point.lastDay !== null && compareDates(point.lastDay, slot.meetingDate) < 0))
  );
}

/**
 * The porada the headmaster prepares: the first open slot whose meeting is today (a Prague date)
 * or later, whatever its deadline. Null when the calendar has none (the strip reaches
 * `PLACEMENT_WEEKS`): „Žádná porada k přípravě“.
 */
export const workingSlot = (today: CalDate, slots: readonly IssueSlot[]): IssueSlot | null =>
  slots.find((slot) => slot.status === 'open' && compareDates(slot.meetingDate, today) >= 0) ??
  null;

/** The Monday a new rule applies from: the one after `keep`, the Monday a hand-in goes to now. */
export const ruleFrom = (keep: CalDate): CalDate => addDays(keep, 7);

const sameRule = (a: DeadlineRule, b: DeadlineRule) =>
  a.dayOffset === b.dayOffset && a.time.hour === b.time.hour && a.time.minute === b.time.minute;

/**
 * What saving `newRule` over `oldRule` at `now` changes (ADR 0032), null for the same rule. `keep`
 * is the Monday a hand-in goes to now, the deadline people are shown: it and every Monday of
 * `freeze` (the unstored slots from this week's Monday to `keep`) are frozen with the old rule
 * first, so that no later rule can send the submit Monday backwards (a rule from Thursday to
 * Sunday saved on a Friday). The new rule applies from `from`, the Monday after `keep`.
 */
export function deadlineChange(
  now: Date,
  oldRule: DeadlineRule,
  newRule: DeadlineRule,
  slots: readonly IssueSlot[],
  plannedThrough: CalDate | null,
): { readonly keep: CalDate; readonly from: CalDate; readonly freeze: readonly CalDate[] } | null {
  if (sameRule(oldRule, newRule)) return null;
  const keep = submitMonday(now, slots, oldRule, plannedThrough);
  const week = mondayOf(instantToWallClock(now).date);
  const freeze = slots
    .filter((slot) => !slot.stored)
    .map((slot) => slot.monday)
    .filter((monday) => compareDates(monday, week) >= 0 && compareDates(monday, keep) <= 0);
  return { keep, from: ruleFrom(keep), freeze };
}

/**
 * The stored rows a new rule refreezes, each with its new deadline: the open ones from `from` on
 * whose deadline is still the old rule's for their meeting date. Nobody was shown them as a
 * hand-in slot; a deadline the headmaster set by hand, and a generated porada, stay.
 */
export function refreezable<R extends IssueRow>(
  rows: readonly R[],
  from: CalDate,
  oldRule: DeadlineRule,
  newRule: DeadlineRule,
): readonly { readonly row: R; readonly deadlineAt: Date }[] {
  return rows
    .filter(
      (row) =>
        row.status === 'open' &&
        compareDates(row.monday, from) >= 0 &&
        row.deadlineAt.getTime() === deadline(row.meetingDate, oldRule).getTime(),
    )
    .map((row) => ({ row, deadlineAt: deadline(row.meetingDate, newRule) }));
}
