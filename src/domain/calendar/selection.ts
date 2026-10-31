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
): { readonly keep: CalDate; readonly from: CalDate; readonly freeze: readonly CalDate[] } | null {
  if (sameRule(oldRule, newRule)) return null;
  const keep = submitMonday(now, slots, oldRule);
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
 * hand-in slot; a deadline the headmaster set by hand, and a skipped or generated porada, stay.
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
