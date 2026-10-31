import type { Tx } from '@/application/ports';
import { deadline, type DeadlineRule } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import type { CalDate } from '@/domain/time';

/**
 * The issue of `monday`, made in the caller's transaction if it has no row
 * yet (ADR 0018). The deadline is frozen at that moment by `rule`, the one the caller
 * read with its slots (a save of a new rule ensures the Mondays with the old one); a row
 * that exists comes back as it is. When `inserted`, the caller names the issue in the
 * audit event it records.
 */
export function ensureIssue(tx: Tx, monday: CalDate, rule: DeadlineRule) {
  const meetingDate = monday; // a new row meets on its Monday
  return tx.issues.ensure({
    monday,
    meetingDate,
    schoolYear: schoolYear(monday),
    deadlineAt: deadline(meetingDate, rule),
  });
}
