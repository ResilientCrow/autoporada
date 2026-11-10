import { toDeadlineRule } from '@/contracts';
import type { Tx } from '@/application/ports';
import { calendarBoundary, issueSlots, type DeadlineRule, type IssueSlot } from '@/domain/calendar';
import { instantToWallClock, parseIsoDate, type CalDate } from '@/domain/time';

import { readSettingValue } from './settings';

/**
 * The deadline rule in force: the stored `deadline` setting, else the default of the registry. A
 * new issue is frozen with it (`ensureIssue`) and a Monday with no row is counted by it. Reads
 * the value alone, which the worker may do (`settings` grants it `key` and `value`). It first
 * waits for a save of a new rule in flight, which freezes and refreezes rows by the old one: a
 * caller never freezes a Monday by a rule that save has replaced (ADR 0032).
 */
export async function readDeadlineRule(tx: Pick<Tx, 'settings'>): Promise<DeadlineRule> {
  await tx.settings.lock('deadline', 'share');
  return toDeadlineRule(await readSettingValue(tx, 'deadline'));
}

/** What a caller counts the calendar by: the deadline rule and the effective boundary (ADR 0054). */
export interface CalendarWindow {
  readonly rule: DeadlineRule;
  /** The Monday up to and including which a Monday with no row is no porada (`calendarBoundary`). */
  readonly plannedThrough: CalDate;
}

/**
 * The effective boundary at `now`: the later of the `calendar` setting and last week's Monday. Read
 * after `readDeadlineRule`, whose share lock also holds back a drop in flight, which writes it.
 */
export async function readPlannedThrough(tx: Pick<Tx, 'settings'>, now: Date): Promise<CalDate> {
  const { plannedThrough } = await readSettingValue(tx, 'calendar');
  return calendarBoundary(
    plannedThrough ? parseIsoDate(plannedThrough) : null,
    instantToWallClock(now).date,
  );
}

/**
 * The meeting calendar at `now`: the stored rows from this week on (or with a meeting still
 * ahead) and a virtual slot for each Monday without one after the boundary, under the deadline
 * rule, which comes back with them so the caller counts and freezes by the rule the slots were made
 * with. One read, which the worker may make too (`issues.calendar` selects only the columns it is
 * granted; the `calendar` setting is within its `settings` grant).
 */
export async function readSlots(
  tx: Pick<Tx, 'issues' | 'settings'>,
  now: Date,
): Promise<{ readonly slots: readonly IssueSlot[] } & CalendarWindow> {
  const today = instantToWallClock(now).date;
  const rule = await readDeadlineRule(tx);
  const plannedThrough = await readPlannedThrough(tx, now);
  return {
    slots: issueSlots(await tx.issues.calendar(today), today, rule, plannedThrough),
    rule,
    plannedThrough,
  };
}
