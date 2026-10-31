import { toIssueRows } from '@/contracts';
import {
  handInMonday,
  isLateReport,
  issueSlots,
  lateFacts,
  placementSlot,
  reportCloses,
  type DeadlineRule,
  type IssueSlot,
  type LateFacts,
} from '@/domain/calendar';
import { formatClock, formatClose, formatDayMonth, schoolYear, weekdayName } from '@/domain/cs';
import type { PointKind } from '@/domain/report';
import {
  compareDates,
  instantToWallClock,
  parseIsoDate,
  parseWallTime,
  type CalDate,
} from '@/domain/time';
import { points } from '@/ui/copy';
import { readText } from '@/ui/form';

import type { PointContentWire } from './fields';

/** What the line is worked out from: `issues.window` as the wire carries it, now, and the deadline rule. */
export interface StandingInput {
  /** The first open Monday whose deadline is still ahead (skipped and generated ones are stepped over). */
  readonly submitMonday: string;
  readonly issues: readonly {
    readonly monday: string;
    readonly meetingDate: string;
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
      /** The day that porada is held (its Monday unless it was moved). */
      readonly meeting: CalDate;
      readonly deadlineAt: Date;
      /** Strictly less than 24 hours to the deadline. */
      readonly urgent: boolean;
    }
  | {
      readonly kind: 'closed';
      /** The meeting date of the porada that closed. */
      readonly closed: CalDate;
      readonly placement: CalDate;
      readonly meeting: CalDate;
    }
  /** A report on an event that ends after the deadline: its own close, before the porada it goes to. */
  | {
      readonly kind: 'late';
      readonly placement: CalDate;
      readonly meeting: CalDate;
      readonly closesAt: Date;
      /** Strictly less than 24 hours to the close, as for the plain deadline. */
      readonly urgent: boolean;
    };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The latest porada that is not skipped, whose deadline has passed and whose meeting is today or
 * later; its meeting date.
 */
function closedPorada(slots: readonly IssueSlot[], today: CalDate, now: Date): CalDate | null {
  const closed = slots.filter(
    (slot) =>
      slot.status !== 'skipped' &&
      slot.deadlineAt.getTime() <= now.getTime() &&
      compareDates(slot.meetingDate, today) >= 0,
  );
  return closed.at(-1)?.meetingDate ?? null;
}

/**
 * The line of a report on an event that ends after the porada's deadline, worked out as the submit
 * does: `handInMonday` over the same slots with the report's facts. Null when the report is not
 * late for the porada it would reach, so the plain line stands. `reportCloses` reads the slot's
 * meeting date for both the last-day check and the 00:00 cap.
 */
function lateStanding(
  slots: readonly IssueSlot[],
  now: Date,
  rule: DeadlineRule,
  report: LateFacts,
): Standing | null {
  const monday = handInMonday(now, slots, rule, report);
  const slot = slots.find((candidate) => compareDates(candidate.monday, monday) === 0);
  if (slot === undefined || !isLateReport(slot, report)) return null;
  const closesAt = reportCloses(slot, report);
  return {
    kind: 'late',
    placement: monday,
    meeting: slot.meetingDate,
    closesAt,
    urgent: now.getTime() > closesAt.getTime() - DAY_MS,
  };
}

/** What a report's close depends on, read from the editor's text; none for a proposal or while the start date is missing. */
export function reportFactsOf(
  kind: PointKind,
  content: Pick<PointContentWire, 'eventDate' | 'endDate' | 'timeTo'> | null,
): LateFacts | undefined {
  if (kind !== 'report' || content === null) return undefined;
  return lateFacts({
    eventDate: readText(content.eventDate, parseIsoDate),
    endDate: readText(content.endDate, parseIsoDate),
    timeTo: readText(content.timeTo, parseWallTime),
  });
}

/**
 * The standing of a point that is not in yet (design sections 3 and 6). `placement` is the first
 * Monday from the submit Monday on that is neither skipped nor generated. When the latest porada
 * that is not skipped has closed and is still ahead (today is its Monday or earlier, i.e. from the
 * deadline on Saturday evening to the meeting day itself), the line says the deadline has passed, whether or
 * not a skipped Monday lies between it and the submit Monday; from the day after the porada it
 * names the next deadline. A report on an event that ends after the deadline (`report`, ADR 0035)
 * has its own close while that is ahead. Null when no Monday of the window is open.
 */
export function standingOf(
  { submitMonday, issues, now, rule }: StandingInput,
  report?: LateFacts,
): Standing | null {
  const instant = new Date(now);
  const today = instantToWallClock(instant).date;
  const slots = issueSlots(toIssueRows(issues), today, rule);
  const slot = placementSlot(parseIsoDate(submitMonday), today, slots);
  if (slot === null) return null;
  const placement = slot.monday;
  const late = report && lateStanding(slots, instant, rule, report);
  if (late) return late;
  const closed = closedPorada(slots, today, instant);
  if (closed !== null) return { kind: 'closed', closed, placement, meeting: slot.meetingDate };

  const { deadlineAt } = slot;
  return {
    kind: 'before',
    placement,
    meeting: slot.meetingDate,
    deadlineAt,
    urgent: instant.getTime() > deadlineAt.getTime() - DAY_MS,
  };
}

/** The line as words, and whether it is the last 24 hours (the accent). */
export function standingText(standing: Standing): { text: string; urgent: boolean } {
  if (standing.kind === 'late') {
    // The cap is 00:00 of the meeting day; „do 2. 11. v 0:00“ would read as „by Monday“.
    const { date, time } = formatClose(standing.closesAt);
    return {
      text: points.standing.late(formatDayMonth(date), time, formatDayMonth(standing.meeting)),
      urgent: standing.urgent,
    };
  }
  if (standing.kind === 'closed') {
    return {
      text: points.standing.closed(
        formatDayMonth(standing.closed),
        formatDayMonth(standing.meeting),
      ),
      urgent: false,
    };
  }
  const { date, time } = instantToWallClock(standing.deadlineAt);
  return {
    text: points.standing.before(
      formatDayMonth(standing.meeting),
      weekdayName(date),
      formatDayMonth(date),
      formatClock(time),
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
