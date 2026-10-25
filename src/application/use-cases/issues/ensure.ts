import { DEADLINE_RULE } from '@/application/core';
import type { Tx } from '@/application/ports';
import { deadline } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import type { CalDate } from '@/domain/time';

/**
 * The issue of `monday`, made in the caller's transaction if it has no row
 * yet (ADR 0018). The deadline is frozen at that moment; a row that exists
 * comes back as it is. When `inserted`, the caller names the issue in the
 * audit event it records.
 */
export function ensureIssue(tx: Tx, monday: CalDate) {
  return tx.issues.ensure({
    monday,
    meetingDate: monday,
    schoolYear: schoolYear(monday),
    deadlineAt: deadline(monday, DEADLINE_RULE),
  });
}
