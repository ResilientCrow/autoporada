import type { IssueRecord, Tx } from '@/application/ports';
import type { CalendarWindow } from '@/application/core';
import { compareDates, type CalDate } from '@/domain/time';
import { deadline } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';

/**
 * The issue of `monday`, made in the caller's transaction if it has no row
 * yet (ADR 0018). The deadline is frozen at that moment by the `rule` of the caller's `window`, the
 * one it read with its slots (a save of a new rule ensures the Mondays with the old one); a row
 * that exists comes back as it is. When `inserted`, the caller names the issue in the
 * audit event it records. Null for a Monday up to the window's boundary with no row: no porada
 * is there (ADR 0054 item 7), so a stale client never brings a dropped one back; the caller
 * answers `not-found`.
 */
export async function ensureIssue(
  tx: Tx,
  monday: CalDate,
  { rule, plannedThrough }: CalendarWindow,
): Promise<{ readonly issue: IssueRecord; readonly inserted: boolean } | null> {
  const meetingDate = monday; // a new row meets on its Monday
  if (compareDates(monday, plannedThrough) <= 0) {
    const [row] = await tx.issues.between(monday, monday);
    return row ? { issue: row, inserted: false } : null;
  }
  return tx.issues.ensure({
    monday,
    meetingDate,
    schoolYear: schoolYear(monday),
    deadlineAt: deadline(meetingDate, rule),
  });
}
