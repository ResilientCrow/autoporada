import { DEFAULT_DEADLINE, placementMonday, type KnownIssue } from '@/domain/calendar';
import type { CalDate } from '@/domain/time';

/**
 * The deadline rule new issues are made with. M9.7 replaces this constant
 * with a read of the settings; an issue row keeps the deadline it was made
 * with (ADR 0018).
 */
export const DEADLINE_RULE = DEFAULT_DEADLINE;

/**
 * The Monday a handed-in point is shown under (design section 3), for the queue and „Moje body“
 * alike: a submitted point from the submit Monday on, an approved one from the first Monday on or
 * after today, each past skipped and generated issues; null when no Monday of the window is open.
 */
export function pointPlacement(
  state: 'submitted' | 'approved',
  earliest: CalDate,
  now: Date,
  known: readonly KnownIssue[],
): CalDate | null {
  return placementMonday(earliest, now, DEADLINE_RULE, known, state === 'approved');
}
