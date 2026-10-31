import { toDeadlineRule } from '@/contracts';
import type { Tx } from '@/application/ports';
import { DEFAULT_DEADLINE, issueSlots, type DeadlineRule, type IssueSlot } from '@/domain/calendar';
import { instantToWallClock } from '@/domain/time';

import { readSettingValue } from './settings';

/** The rule the server pages count by until `issues.window` carries the one in force. */
export const DEADLINE_RULE = DEFAULT_DEADLINE;

/**
 * The deadline rule in force: the stored `deadline` setting, else the default of the registry. A
 * new issue is frozen with it (`ensureIssue`) and a Monday with no row is counted by it. Reads
 * the value alone, which the worker may do (`settings` grants it `key` and `value`).
 */
export async function readDeadlineRule(tx: Pick<Tx, 'settings'>): Promise<DeadlineRule> {
  return toDeadlineRule(await readSettingValue(tx, 'deadline'));
}

/**
 * The meeting calendar at `now`: the stored rows from this week on (or with a meeting still
 * ahead) and a virtual slot for each Monday without one, under the deadline rule, which comes
 * back with them so the caller counts and freezes by the rule the slots were made with. One read,
 * which the worker may make too (`issues.calendar` selects only the columns it is granted).
 */
export async function readSlots(
  tx: Pick<Tx, 'issues' | 'settings'>,
  now: Date,
): Promise<{ readonly slots: readonly IssueSlot[]; readonly rule: DeadlineRule }> {
  const today = instantToWallClock(now).date;
  const rule = await readDeadlineRule(tx);
  return { slots: issueSlots(await tx.issues.calendar(today), today, rule), rule };
}
