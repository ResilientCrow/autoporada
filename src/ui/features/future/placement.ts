import { routeFutureItem, type FutureKind } from '@/domain/calendar';
import type { IssueStatus } from '@/domain/review';
import { addDays, compareDates, parseIsoDate, toIsoDate } from '@/domain/time';
import type { StripSlot } from '@/ui/copy';

/** The meeting calendar as `issues.window` carries it: only what the strip reads. */
export interface StripWindow {
  readonly submitMonday: string;
  readonly issues: readonly { readonly monday: string; readonly status: IssueStatus }[];
}

/** The item as the strip routes it: its kind and ISO dates. */
export interface StripItem {
  readonly kind: FutureKind;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export interface StripLine {
  readonly monday: string;
  readonly slot: StripSlot;
}

/** How many Mondays the strip names. */
const STRIP_MONDAYS = 4;

/**
 * Where the item lands in the next porady (design section 12): the four Mondays from the submit
 * Monday on, each routed by `routeFutureItem`; a skipped Monday has no porada, and a Monday whose
 * issue is already made is left out, since nothing joins it any more. Nothing before the item has a
 * start date. An end date before the start (which a draft may hold, the save refuses) is ignored.
 */
export function placementLines(item: StripItem, window: StripWindow): readonly StripLine[] {
  if (item.startDate === null) return [];
  const date = parseIsoDate(item.startDate);
  const end = item.endDate === null ? undefined : parseIsoDate(item.endDate);
  const dated = { date, ...(end && compareDates(end, date) >= 0 && { endDate: end }) };
  const status = new Map(window.issues.map((issue) => [issue.monday, issue.status]));
  const first = parseIsoDate(window.submitMonday);
  return Array.from({ length: STRIP_MONDAYS }, (_, week) => addDays(first, 7 * week))
    .filter((monday) => status.get(toIsoDate(monday)) !== 'generated')
    .map((monday) => ({
      monday: toIsoDate(monday),
      slot:
        status.get(toIsoDate(monday)) === 'skipped'
          ? 'skipped'
          : routeFutureItem({ ...dated, kind: item.kind }, monday),
    }));
}
