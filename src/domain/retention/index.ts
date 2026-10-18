import type { AccessState, FutureState, PointState } from '@/domain/review';
import { calDate, type CalDate } from '@/domain/time';

/**
 * Retention (plan §1): generated issues and the points they published are the
 * official record and stay forever. Work that never made it into an issue is
 * purged once the school year is over; the audit log is kept three years.
 */

const PURGED_POINTS: ReadonlySet<PointState> = new Set([
  'draft',
  'returned',
  'rejected',
  'withdrawn',
]);
const PURGED_FUTURE: ReadonlySet<FutureState> = new Set([
  'draft',
  'returned',
  'rejected',
  'withdrawn',
]);
/** A blocked request is kept: it is what keeps the person blocked. */
const PURGED_ACCESS: ReadonlySet<AccessState> = new Set(['approved', 'rejected', 'cancelled']);

export const AUDIT_RETENTION_YEARS = 3;

export function isPurgeablePoint(state: PointState): boolean {
  return PURGED_POINTS.has(state);
}

export function isPurgeableFutureItem(state: FutureState): boolean {
  return PURGED_FUTURE.has(state);
}

export function isPurgeableAccessRequest(state: AccessState): boolean {
  return PURGED_ACCESS.has(state);
}

/** „2026/2027“ → 31 August 2027, the last day of that school year. */
export function schoolYearEnd(schoolYear: string): CalDate {
  const match = /^(\d{4})\/(\d{4})$/.exec(schoolYear);
  const [first, second] = [Number(match?.[1]), Number(match?.[2])];
  if (!match || second !== first + 1) throw new RangeError(`Not a school year: ${schoolYear}`);
  return calDate(second, 8, 31);
}

/** Audit events older than this instant may be deleted. */
export function auditCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - AUDIT_RETENTION_YEARS);
  return cutoff;
}
