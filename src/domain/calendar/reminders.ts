import {
  addDays,
  compareDates,
  instantToWallClock,
  mondayOf,
  parseWallTime,
  toIsoDate,
  wallClockToInstant,
  type CalDate,
} from '@/domain/time';

import type { IssueRow } from './slots';

/** The soft reminder comes two days before the deadline, the hard one on its day (design section 13). */
export type ReminderKind = 'soft' | 'hard';

const SLOTS = {
  soft: { daysBefore: 2, at: parseWallTime('13:00') },
  hard: { daysBefore: 0, at: parseWallTime('12:00') },
} as const;

const HOLD_MS = 6 * 3_600_000;
/** Recipients are spread over this long after the slot, so the mail gate is not hit all at once. */
export const REMINDER_STAGGER_MS = 30 * 60_000;
/** Only drafts touched within this many days are worth a reminder. */
export const REMINDER_DRAFT_DAYS = 28;

/** When the reminder opens: its wall time on the Prague day that many days before the deadline's. */
export function reminderSlot(kind: ReminderKind, deadlineAt: Date): Date {
  const { daysBefore, at } = SLOTS[kind];
  return wallClockToInstant(addDays(instantToWallClock(deadlineAt).date, -daysBefore), at);
}

/** Due from the slot until six hours later, and never at or after the deadline. */
export function reminderDue(kind: ReminderKind, deadlineAt: Date, now: Date): boolean {
  const slot = reminderSlot(kind, deadlineAt).getTime();
  const end = Math.min(slot + HOLD_MS, deadlineAt.getTime());
  return slot <= now.getTime() && now.getTime() < end;
}

/** A fixed offset of 0 to 30 minutes from the recipient's id (FNV-1a), so a rerun picks the same time. */
export function reminderStagger(recipientId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < recipientId.length; i++) {
    hash = Math.imul(hash ^ recipientId.charCodeAt(i), 0x01000193) >>> 0;
  }
  return (hash % (REMINDER_STAGGER_MS / 1000)) * 1000;
}

/** How many Mondays back the soft reminder looks for the porada before: a summer of skipped Mondays fits. */
export const REPORT_LOOKBACK_WEEKS = 12;

/** The Mondays whose rows `reportsSince` reads for the porada on `monday`: the look-back, the week before included. */
export function reportLookback(monday: CalDate): { readonly from: CalDate; readonly to: CalDate } {
  return { from: addDays(monday, -7 * REPORT_LOOKBACK_WEEKS), to: addDays(monday, -7) };
}

/**
 * The first last day of an akce whose report goes to the porada on `monday` (ADR 0046): an akce's
 * report goes to the first porada not skipped whose meeting is after its last day, so this is the
 * meeting day of the porada held before, found by stepping back over skipped Mondays. A Monday with
 * no row is a porada on that Monday; `earlier` are the stored rows of the look-back, in any order.
 * With every Monday of the look-back skipped, its first Monday.
 */
export function reportsSince(monday: CalDate, earlier: readonly IssueRow[]): CalDate {
  const rows = new Map(earlier.map((row) => [toIsoDate(row.monday), row]));
  for (let week = 1; week <= REPORT_LOOKBACK_WEEKS; week++) {
    const before = addDays(monday, -7 * week);
    const row = rows.get(toIsoDate(before));
    if (!row) return before;
    if (row.status !== 'skipped') return row.meetingDate;
  }
  return reportLookback(monday).from;
}

/**
 * The Monday of the porada an akce's report goes to (ADR 0049), the inverse of `reportsSince`: the
 * first porada not skipped, in Monday order from `REPORT_LOOKBACK_WEEKS` before the akce's last day
 * (as far back as `reportsSince` looks, so a porada moved weeks past its Monday is found), whose
 * meeting day is after that day. A Monday with no row is a porada held on its Monday; `rows` are
 * the stored rows around the day, in any order.
 */
export function owedPorada(lastDay: CalDate, rows: readonly IssueRow[]): CalDate {
  const byMonday = new Map(rows.map((row) => [toIsoDate(row.monday), row]));
  for (
    let monday = addDays(mondayOf(lastDay), -7 * REPORT_LOOKBACK_WEEKS);
    ;
    monday = addDays(monday, 7)
  ) {
    const row = byMonday.get(toIsoDate(monday));
    if (row?.status === 'skipped') continue;
    if (compareDates(row?.meetingDate ?? monday, lastDay) > 0) return monday;
  }
}
