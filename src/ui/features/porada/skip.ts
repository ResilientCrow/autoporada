import type { z } from 'zod';

import { toIssueRows, type setSkippedInput } from '@/contracts';
import {
  formatClock,
  formatDayMonth,
  formatNumericDate,
  formatTitleDate,
  weekdayName,
} from '@/domain/cs';
import {
  issueSlots,
  nextMeetingBounds,
  planNextMeeting,
  slotMondayOf,
  type DeadlineRule,
  type IssueSlot,
  type NextMeetingRefusal,
} from '@/domain/calendar';
import {
  compareDates,
  instantToWallClock,
  parseIsoDate,
  toIsoDate,
  type CalDate,
} from '@/domain/time';
import { issues, porada } from '@/ui/copy';
import { flagOf, readText, textOf, type FormSpec } from '@/ui/form';

const { skip, unskip, unconfirmed, meeting, stale } = issues.strip;
const COPY = { skip, unskip } as const;

/** The calendar the dialog plans the next porada on: `issues.window` as the wire carries it, the instant it was read and the rule. */
export interface SkipCalendar {
  readonly issues: readonly {
    readonly monday: string;
    readonly meetingDate: string;
    readonly deadlineAt: string;
    readonly status: 'open' | 'generated' | 'skipped';
  }[];
  readonly now: string;
  readonly rule: DeadlineRule;
}

/** The id of a slot's skip form, and with it the heading that names it. */
export const skipFormId = (monday: string): string => `porada-skip-${monday}`;

/**
 * The spec of the confirmed skip form; `monday` has no control, it only owns the stale message.
 * A skip also names the day the next porada is held (`nextMeeting`, ADR 0051), required when a
 * porada follows: without one the field may stay empty for a plain skip.
 */
export function skipSpec(event: 'skip' | 'unskip', label: string, hasNext: boolean): FormSpec {
  return {
    confirmed: { label: COPY[event].confirm, required: true, messages: { required: unconfirmed } },
    monday: { label: meeting(label), messages: { invalid: stale } },
    ...(event === 'skip' && {
      nextMeeting: {
        label: porada.skip.nextMeeting,
        required: hasNext,
        messages: { invalid: porada.skip.nextInvalid },
      },
    }),
  };
}

/** What the form sends: the version only for a slot with a row, `confirmed` only when ticked, and `nextMeeting` only for a skip with a day. */
export function skipInput(
  monday: string,
  event: 'skip' | 'unskip',
  version: number | null,
  data: FormData,
): z.input<typeof setSkippedInput> {
  const nextMeeting = event === 'skip' ? textOf(data, 'nextMeeting') : '';
  return {
    monday,
    event,
    ...(version !== null && { expectedVersion: version }),
    ...(flagOf(data, 'confirmed') && { confirmed: true as const }),
    ...(nextMeeting !== '' && { nextMeeting }),
  };
}

/** The slots as the use case reads them, and the slot of `monday` among them. */
function slotsOf(calendar: SkipCalendar, monday: string) {
  const now = new Date(calendar.now);
  const slots = issueSlots(
    toIssueRows(calendar.issues),
    instantToWallClock(now).date,
    calendar.rule,
  );
  const from = slots.find((s) => toIsoDate(s.monday) === monday);
  return { now, slots, from };
}

/** The meeting date of the first porada after `monday` that takes place, ISO; empty when none follows. */
export function firstHeld(calendar: SkipCalendar, monday: string): string {
  const { slots, from } = slotsOf(calendar, monday);
  if (from === undefined) return '';
  const next = slots.find((s) => s.status === 'open' && compareDates(s.monday, from.monday) > 0);
  return next === undefined ? '' : toIsoDate(next.meetingDate);
}

/** „sobota 7. 11. v 20:00“. */
function closes(at: Date): string {
  const { date, time } = instantToWallClock(at);
  return `${weekdayName(date)} ${formatDayMonth(date)} v\u00a0${formatClock(time)}`;
}

function refusalLine(
  refusal: NextMeetingRefusal,
  from: IssueSlot,
  day: CalDate,
  now: Date,
): string {
  const { refused } = porada.skip;
  const bounds = nextMeetingBounds(from.monday, instantToWallClock(now).date);
  switch (refusal) {
    case 'early':
      return refused.early(formatNumericDate(bounds.from));
    case 'late':
      return refused.late(formatNumericDate(bounds.to));
    case 'skipped':
      return refused.skipped(formatNumericDate(slotMondayOf(day)));
    case 'same':
    case 'deadline-past':
    case 'meeting-order':
      return refused[refusal];
  }
}

/**
 * What the typed day does, as the dialog says it under the field: the poradas skipped on the way
 * and the next one with its deadline, or why the day cannot be the next porada's; `self` when the
 * day only moves this porada within its week. The same `planNextMeeting` the use case runs
 * (ADR 0051). Null while the field holds no date, and for a porada outside the calendar the page read.
 */
export function nextMeetingNote(
  calendar: SkipCalendar,
  monday: string,
  typed: string,
): { readonly refused: boolean; readonly self: boolean; readonly lines: readonly string[] } | null {
  const day = readText(typed === '' ? null : typed, parseIsoDate);
  const { now, slots, from } = slotsOf(calendar, monday);
  if (day === null || from === undefined) return null;
  const result = planNextMeeting(slots, from, day, { rule: calendar.rule, now });
  if (!result.ok) {
    return { refused: true, self: false, lines: [refusalLine(result.refusal, from, day, now)] };
  }
  const { held, skipped } = result.plan;
  const between = skipped.filter((s) => compareDates(s.monday, from.monday) !== 0);
  const next = porada.skip.plan.next(formatTitleDate(held.meetingDate), closes(held.deadlineAt));
  return {
    refused: false,
    self: compareDates(held.monday, from.monday) === 0,
    lines:
      between.length === 0
        ? [next]
        : [
            porada.skip.plan.skipped(
              between.map((s) => formatNumericDate(s.meetingDate)).join(', '),
            ),
            next,
          ],
  };
}
