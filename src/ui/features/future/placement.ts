import { routeFutureItem, type FutureKind } from '@/domain/calendar';
import type { IssueStatus } from '@/domain/review';
import { addDays, compareDates, parseIsoDate, toIsoDate } from '@/domain/time';
import type { StripSlot } from '@/ui/copy';

/** The meeting calendar as `issues.window` carries it: only what the strip reads. */
export interface StripWindow {
  /** The first Monday whose deadline is ahead, a generated one too (`issues.window`'s `stripFrom`). */
  readonly stripFrom: string;
  /** The calendar's boundary (ADR 0054): up to it a Monday with no row is no porada. */
  readonly plannedThrough?: string;
  readonly issues: readonly {
    readonly monday: string;
    /** The day the porada is held; the item is routed by it, not by the Monday. */
    readonly meetingDate: string;
    readonly status: IssueStatus;
  }[];
}

/** The item as the strip routes it: its kind and ISO dates. */
export interface StripItem {
  readonly kind: FutureKind;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export interface StripLine {
  readonly monday: string;
  /** ISO date the porada is held. */
  readonly meeting: string;
  readonly slot: StripSlot;
}

/** How many Mondays the strip names. */
const STRIP_MONDAYS = 4;

/**
 * Where the item lands in the next porady (design section 12): the four Mondays from `stripFrom`
 * (the first whose deadline is ahead, a generated one too), each routed by `routeFutureItem` over
 * the porada's meeting date (its Monday unless it was moved); a
 * Monday with no porada (none up to `plannedThrough` without a row) is left out, and a Monday whose issue is already made is left out, since
 * nothing joins it any more. Nothing before the item has a start date. An end date before the start (which a draft may hold, the save refuses) is ignored.
 */
export function placementLines(item: StripItem, window: StripWindow): readonly StripLine[] {
  if (item.startDate === null) return [];
  const date = parseIsoDate(item.startDate);
  const end = item.endDate === null ? undefined : parseIsoDate(item.endDate);
  const dated = { date, ...(end && compareDates(end, date) >= 0 && { endDate: end }) };
  const rows = new Map(window.issues.map((issue) => [issue.monday, issue]));
  const first = parseIsoDate(window.stripFrom);
  const boundary = window.plannedThrough ? parseIsoDate(window.plannedThrough) : null;
  return Array.from({ length: STRIP_MONDAYS }, (_, week) => addDays(first, 7 * week))
    .map((monday) => ({ monday, row: rows.get(toIsoDate(monday)) }))
    .filter(({ monday, row }) =>
      row ? row.status !== 'generated' : !(boundary && compareDates(monday, boundary) <= 0),
    )
    .map(({ monday, row }) => {
      const meeting = row ? parseIsoDate(row.meetingDate) : monday;
      return {
        monday: toIsoDate(monday),
        meeting: toIsoDate(meeting),
        slot: routeFutureItem({ ...dated, kind: item.kind }, meeting),
      };
    });
}
