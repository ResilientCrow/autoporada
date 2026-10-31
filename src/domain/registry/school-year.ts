import { schoolYear } from '@/domain/cs';
import type { CalDate } from '@/domain/time';

/** The school years „Nový školní rok“ may archive under, and the one it offers first. */
export interface ArchiveYears {
  /** The year before and the current one, `YYYY/YYYY`. */
  readonly options: readonly [string, string];
  readonly initial: string;
}

/**
 * The archived year is a choice of the current school year and the one before (ADR 0033). In
 * September and October the year that just ended is the one being closed, so it is offered
 * first; at any other time the current one is.
 */
export function archiveYears(today: CalDate): ArchiveYears {
  const current = schoolYear(today);
  const start = Number(current.slice(0, 4));
  const previous = `${start - 1}/${start}`;
  return {
    options: [previous, current],
    initial: today.month >= 9 && today.month <= 10 ? previous : current,
  };
}
