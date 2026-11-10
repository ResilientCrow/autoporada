import type { z } from 'zod';

import { toIssueRows, type dropIssueInput, type moveIssueInput } from '@/contracts';
import {
  formatClock,
  formatDayMonth,
  formatNumericDate,
  formatTitleDate,
  weekdayName,
} from '@/domain/cs';
import {
  issueSlots,
  moveBounds,
  planDrop,
  planMove,
  type DeadlineRule,
  type IssueSlot,
  type MoveRefusal,
} from '@/domain/calendar';
import { instantToWallClock, parseIsoDate, toIsoDate } from '@/domain/time';
import { issues, porada, rules } from '@/ui/copy';
import { flagOf, readText, textOf, type FormSpec } from '@/ui/form';

/** The calendar the dialogs plan on: `issues.window` as the wire carries it, the instant it was read, the rule and the boundary. */
export interface PlanCalendar {
  readonly issues: readonly {
    readonly monday: string;
    readonly meetingDate: string;
    readonly deadlineAt: string;
    readonly status: 'open' | 'generated';
  }[];
  readonly now: string;
  readonly rule: DeadlineRule;
  readonly plannedThrough: string;
}

/** The ids of a porada's two forms; `monday` has no control, it only owns the stale message. */
export const moveFormId = (monday: string): string => `porada-move-${monday}`;
export const dropFormId = (monday: string): string => `porada-drop-${monday}`;

/** The slots as the use cases read them, and the slot of `monday` among them. */
function slotsOf(calendar: PlanCalendar, monday: string) {
  const now = new Date(calendar.now);
  const today = instantToWallClock(now).date;
  const slots = issueSlots(
    toIssueRows(calendar.issues),
    today,
    calendar.rule,
    parseIsoDate(calendar.plannedThrough),
  );
  return { now, today, slots, slot: slots.find((s) => toIsoDate(s.monday) === monday) };
}

/** „sobota 7. 11. v 20:00“. */
function closes(at: Date): string {
  const { date, time } = instantToWallClock(at);
  return `${weekdayName(date)} ${formatDayMonth(date)} v\u00a0${formatClock(time)}`;
}

/** The days the date field of „Přesunout poradu“ offers, ISO; null for a porada outside the calendar. */
export function moveRange(
  calendar: PlanCalendar,
  monday: string,
): { readonly min: string; readonly max: string } | null {
  const { today, slots, slot } = slotsOf(calendar, monday);
  if (slot === undefined) return null;
  const bounds = moveBounds(slots, slot, today);
  return { min: toIsoDate(bounds.from), max: toIsoDate(bounds.to) };
}

/** The spec of the move form. */
export function moveSpec(label: string): FormSpec {
  return {
    meetingDate: {
      label: porada.move.day,
      required: true,
      messages: { invalid: porada.move.invalid, required: porada.move.invalid },
    },
    monday: { label: porada.meeting(label), messages: { invalid: issues.strip.stale } },
  };
}

/** What the move form sends: the version only for a porada with a row. */
export function moveInput(
  monday: string,
  version: number | null,
  data: FormData,
): z.input<typeof moveIssueInput> {
  return {
    monday,
    meetingDate: textOf(data, 'meetingDate'),
    ...(version !== null && { expectedVersion: version }),
  };
}

/** The spec of the confirmed drop form. */
export function dropSpec(label: string): FormSpec {
  return {
    confirmed: {
      label: porada.drop.confirm,
      required: true,
      messages: { required: issues.strip.unconfirmed },
    },
    monday: { label: porada.meeting(label), messages: { invalid: issues.strip.stale } },
  };
}

/** What the drop form sends: the version only for a porada with a row, `confirmed` only when ticked. */
export function dropInput(
  monday: string,
  version: number | null,
  data: FormData,
): z.input<typeof dropIssueInput> {
  return {
    monday,
    ...(version !== null && { expectedVersion: version }),
    ...(flagOf(data, 'confirmed') && { confirmed: true as const }),
  };
}

function refusalLine(refusal: MoveRefusal, calendar: PlanCalendar, monday: string): string {
  const { refused } = porada.move;
  const range = moveRange(calendar, monday);
  switch (refusal) {
    case 'early':
      return refused.early(range ? formatNumericDate(parseIsoDate(range.min)) : '');
    case 'late':
      return refused.late(range ? formatNumericDate(parseIsoDate(range.max)) : '');
    case 'same':
      return refused.same;
    case 'not-open':
      return rules['issue-not-open'];
    case 'porada-exists':
      return refused['porada-exists'];
    case 'deadline-past':
    case 'meeting-order':
      return rules[refusal];
  }
}

/**
 * What the typed day does to the porada of `monday`, as the dialog says it under the field: the
 * new meeting date with its deadline, or why the day cannot be the porada's. The same `planMove`
 * the use case runs (ADR 0054 item 6). Null while the field holds no date, and for a porada
 * outside the calendar the page read.
 */
export function moveNote(
  calendar: PlanCalendar,
  monday: string,
  typed: string,
): { readonly refused: boolean; readonly line: string } | null {
  const day = readText(typed === '' ? null : typed, parseIsoDate);
  const { now, slots, slot } = slotsOf(calendar, monday);
  if (day === null || slot === undefined) return null;
  const result = planMove(slots, slot, day, { rule: calendar.rule, now });
  if (!result.ok) return { refused: true, line: refusalLine(result.refusal, calendar, monday) };
  const { meetingDate, deadlineAt } = result.moved;
  return {
    refused: false,
    line: porada.move.effect(formatTitleDate(meetingDate), closes(deadlineAt)),
  };
}

/** The porada that takes over a dropped one, as written, and its Monday for the link; null for a porada outside the calendar. */
export function dropHeir(
  calendar: PlanCalendar,
  monday: string,
): { readonly monday: string; readonly meeting: string } | null {
  const { slots, slot } = slotsOf(calendar, monday);
  if (slot === undefined) return null;
  const planned = planDrop(slots, slot, {
    rule: calendar.rule,
    plannedThrough: parseIsoDate(calendar.plannedThrough),
  });
  if (!planned.ok) return null;
  const heir: IssueSlot = planned.heir;
  return { monday: toIsoDate(heir.monday), meeting: formatTitleDate(heir.meetingDate) };
}
