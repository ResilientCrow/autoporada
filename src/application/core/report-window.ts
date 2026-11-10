import type { PointRecord, Tx } from '@/application/ports';
import { reportLookback, reportsSince } from '@/domain/calendar';
import type { CalDate } from '@/domain/time';

/**
 * The first last day of an akce whose report goes to the porada on `monday` (ADR 0046, 0049): the
 * meeting day of the porada held before. Reads the stored rows of the look-back; a Monday with no
 * row is a porada on that Monday after `plannedThrough` (the effective boundary), none up to it.
 */
export async function readReportsSince(
  tx: Pick<Tx, 'issues'>,
  monday: CalDate,
  plannedThrough: CalDate,
): Promise<CalDate> {
  const { from, to } = reportLookback(monday);
  return reportsSince(monday, await tx.issues.calendarBetween(from, to), plannedThrough);
}

/**
 * The points the issue of `monday` prints (`PointRepo.eligibleFor`), with the `since` of its porada:
 * every reader of the eligible points goes through here, so the preview, the outline and the
 * generation agree on which report belongs to which porada.
 */
export async function eligiblePoints(
  tx: Pick<Tx, 'issues' | 'points'>,
  monday: CalDate,
  meetingDate: CalDate,
  plannedThrough: CalDate,
  options: { readonly lock?: boolean } = {},
): Promise<readonly PointRecord[]> {
  const since = await readReportsSince(tx, monday, plannedThrough);
  return tx.points.eligibleFor(monday, meetingDate, { since, ...options });
}
