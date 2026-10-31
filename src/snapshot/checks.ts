import type { z } from 'zod';

import { assertMonday } from '@/domain/calendar';
import { compareDates, compareTimes, parseIsoDate, parseWallTime } from '@/domain/time';

/**
 * Cross-field rules of IssueSnapshot v1 that a field schema cannot express.
 * Each one prevents a document that compose would render wrongly or silently
 * shorten.
 */

type Ctx = z.RefinementCtx;
type Path = (string | number)[];
const problem = (ctx: Ctx, path: Path, message: string) =>
  ctx.addIssue({ code: 'custom', path, message });

interface Dated {
  readonly date: string;
  readonly endDate?: string | undefined;
  readonly timeFrom?: string | undefined;
  readonly timeTo?: string | undefined;
}

export function checkIssueWeek(issue: { monday: string; schoolYear: string }, ctx: Ctx): void {
  const monday = parseIsoDate(issue.monday);
  try {
    assertMonday(monday);
  } catch {
    problem(ctx, ['issue', 'monday'], 'must be a Monday');
    return;
  }
  const [first, second] = issue.schoolYear.split('/').map(Number);
  if (second !== (first ?? 0) + 1)
    problem(ctx, ['issue', 'schoolYear'], 'must be two consecutive years');
}

/** Dates in order; a time range only with a start, and forwards within one day. */
export function checkDates(
  list: 'reports' | 'futureItems',
  items: readonly Dated[],
  ctx: Ctx,
): void {
  items.forEach((item, i) => {
    const singleDay = !item.endDate || item.endDate === item.date;
    if (item.endDate && compareDates(parseIsoDate(item.endDate), parseIsoDate(item.date)) < 0) {
      problem(ctx, [list, i, 'endDate'], 'ends before it starts');
    }
    if (item.timeTo && !item.timeFrom) problem(ctx, [list, i, 'timeTo'], 'needs a start time');
    if (singleDay && item.timeFrom && item.timeTo) {
      if (compareTimes(parseWallTime(item.timeTo), parseWallTime(item.timeFrom)) <= 0) {
        problem(ctx, [list, i, 'timeTo'], 'must be after the start time');
      }
    }
  });
}

interface ItemShape {
  readonly slot: string | null;
  readonly quotes: readonly unknown[];
  readonly body: { readonly content: readonly unknown[] };
}

/** Slots whose content compose generates; a stored body would be silently ignored. */
const GENERATED: ReadonlySet<string> = new Set(['meetings', 'events', 'partners']);
const REQUIRED_SLOTS = ['meetings', 'events'] as const;

/**
 * Each system slot at most once (twice would print the point twice), the
 * agenda slots always present (or approved future items would vanish), and
 * no content where compose would ignore it.
 */
export function checkItems(
  pokyny: readonly ItemShape[],
  hospodareni: readonly ItemShape[],
  ctx: Ctx,
): void {
  const seen = new Set<string>();
  pokyny.forEach((item, i) => {
    if (item.slot !== null) {
      if (seen.has(item.slot))
        problem(ctx, ['pokyny', i, 'slot'], `slot ${item.slot} appears twice`);
      seen.add(item.slot);
    }
    if (item.slot !== 'partners' && item.quotes.length > 0) {
      problem(ctx, ['pokyny', i, 'quotes'], 'only the partners slot has quotes');
    }
    if (item.slot !== null && GENERATED.has(item.slot) && item.body.content.length > 0) {
      problem(ctx, ['pokyny', i, 'body'], `the ${item.slot} slot has no body`);
    }
  });
  for (const slot of REQUIRED_SLOTS) {
    if (!seen.has(slot)) problem(ctx, ['pokyny'], `the ${slot} slot is missing`);
  }
  hospodareni.forEach((item, i) => {
    if (item.slot !== null)
      problem(ctx, ['hospodareni', i, 'slot'], 'HOSPODAŘENÍ items have no slot');
    if (item.quotes.length > 0)
      problem(ctx, ['hospodareni', i, 'quotes'], 'HOSPODAŘENÍ items have no quotes');
  });
}

/** Příloha 1 is one table: a second list would merge into it unlabelled. */
export function checkRegistry(registry: readonly { readonly purpose: string }[], ctx: Ctx): void {
  registry.forEach((list, i) => {
    if (list.purpose === 'annex1' && registry.findIndex((l) => l.purpose === 'annex1') !== i) {
      problem(ctx, ['registry', i, 'purpose'], 'only one Příloha 1 list');
    }
  });
}
