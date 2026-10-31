import { toKnownIssues } from '@/contracts';
import {
  deadline,
  issueSlots,
  placementMonday,
  type DeadlineRule,
  type KnownIssue,
} from '@/domain/calendar';
import { formatDayMonth, formatTime, schoolYear, weekdayName } from '@/domain/cs';
import {
  compareDates,
  instantToWallClock,
  parseIsoDate,
  toIsoDate,
  type CalDate,
} from '@/domain/time';
import { points } from '@/ui/copy';

/** What the line is worked out from: `issues.window` as the wire carries it, now, and the deadline rule. */
export interface StandingInput {
  /** The first open Monday whose deadline is still ahead (skipped and generated ones are stepped over). */
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
 * The latest porada that is not skipped, whose deadline has passed and whose meeting is today or
 * later. The wire has no meeting date until M9 row 35: the meeting is on the Monday.
 */
function closedPorada(
  known: readonly KnownIssue[],
  today: CalDate,
  now: Date,
  rule: DeadlineRule,
): CalDate | null {
  const rows = known.map((row) => ({ ...row, meetingDate: row.monday }));
  const closed = issueSlots(rows, today, rule).filter(
    (slot) =>
      slot.status !== 'skipped' &&
      slot.deadlineAt.getTime() <= now.getTime() &&
      compareDates(slot.meetingDate, today) >= 0,
  );
  return closed.at(-1)?.monday ?? null;
}

/**
 * The standing of a point that is not in yet (design sections 3 and 6). `placement` is the first
 * Monday from the submit Monday on that is neither skipped nor generated. When the latest porada
 * that is not skipped has closed and is still ahead (today is its Monday or earlier, i.e. the
 * Sunday evening and the meeting day itself), the line says the deadline has passed, whether or
 * not a skipped Monday lies between it and the submit Monday; from the day after the porada it
 * names the next deadline. Null when no Monday of the window is open.
 */
export function standingOf({ submitMonday, issues, now, rule }: StandingInput): Standing | null {
  const instant = new Date(now);
  const known = toKnownIssues(issues);
  const first = parseIsoDate(submitMonday);
  const placement = placementMonday(first, instant, known);
  if (placement === null) return null;

  const today = instantToWallClock(instant).date;
  const closed = closedPorada(known, today, instant, rule);
  if (closed !== null) return { kind: 'closed', closed, placement };

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
