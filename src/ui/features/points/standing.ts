import { deadline, placementMonday, type DeadlineRule, type KnownIssue } from '@/domain/calendar';
import { formatDayMonth, formatTime, schoolYear, weekdayName } from '@/domain/cs';
import {
  addDays,
  compareDates,
  instantToWallClock,
  parseIsoDate,
  toIsoDate,
  type CalDate,
} from '@/domain/time';
import { points } from '@/ui/copy';

/** What the line is worked out from: `issues.window` as the wire carries it, now, and the deadline rule. */
export interface StandingInput {
  /** The first Monday whose deadline is still ahead (skips ignored). */
  readonly submitMonday: string;
  readonly issues: readonly {
    readonly monday: string;
    readonly deadlineAt: string;
    readonly status: 'open' | 'generated' | 'skipped';
  }[];
  /** The instant the page was made at, ISO. */
  readonly now: string;
  readonly rule: DeadlineRule;
}

/** Where the point stands: the porada it goes to (`placement`), and either its deadline or the one just passed. */
export type Standing =
  | {
      readonly kind: 'before';
      readonly placement: CalDate;
      readonly deadlineAt: Date;
      /** Strictly less than 24 hours to the deadline. */
      readonly urgent: boolean;
    }
  | { readonly kind: 'closed'; readonly closed: CalDate; readonly placement: CalDate };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The standing of a point that is not in yet (design sections 3 and 6). `placement` is the first
 * Monday from the submit Monday on that is neither skipped nor generated. When the porada of the
 * Monday before the submit Monday has closed and is still ahead (today is that Monday or earlier,
 * i.e. the Sunday evening and the meeting day itself), the line says the deadline has passed; from
 * the day after the porada it names the next deadline. Null when no Monday of the window is open.
 */
export function standingOf({ submitMonday, issues, now, rule }: StandingInput): Standing | null {
  const instant = new Date(now);
  const known: readonly KnownIssue[] = issues.map((row) => ({
    monday: parseIsoDate(row.monday),
    deadlineAt: new Date(row.deadlineAt),
    status: row.status,
  }));
  const first = parseIsoDate(submitMonday);
  const placement = placementMonday(first, instant, rule, known, false);
  if (placement === null) return null;

  const closed = addDays(first, -7);
  const closedRow = issues.find((row) => row.monday === toIsoDate(closed));
  const today = instantToWallClock(instant).date;
  if (compareDates(closed, today) >= 0 && closedRow?.status !== 'skipped') {
    return { kind: 'closed', closed, placement };
  }

  const row = issues.find((candidate) => candidate.monday === toIsoDate(placement));
  const deadlineAt = row === undefined ? deadline(placement, rule) : new Date(row.deadlineAt);
  return {
    kind: 'before',
    placement,
    deadlineAt,
    urgent: instant.getTime() > deadlineAt.getTime() - DAY_MS,
  };
}

/** The line as words, and whether it is the last 24 hours (the accent). */
export function standingText(standing: Standing): { text: string; urgent: boolean } {
  if (standing.kind === 'closed') {
    return {
      text: points.standing.closed(
        formatDayMonth(standing.closed),
        formatDayMonth(standing.placement),
      ),
      urgent: false,
    };
  }
  const { date, time } = instantToWallClock(standing.deadlineAt);
  return {
    text: points.standing.before(
      formatDayMonth(standing.placement),
      weekdayName(date),
      formatDayMonth(date),
      formatTime(time),
    ),
    urgent: standing.urgent,
  };
}

/**
 * The school year of the porada the point goes to: the paper's {skolniRok} is the issue's, so
 * around 1 September it differs from today's. `fallback` is used while no porada is open.
 */
export function placementYear(standing: Standing | null, fallback: string): string {
  return standing === null ? fallback : schoolYear(standing.placement);
}
