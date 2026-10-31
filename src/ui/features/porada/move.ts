import type { z } from 'zod';

import { toIssueRows, type moveIssueInput } from '@/contracts';
import {
  deadline,
  issueSlots,
  orderConflicts,
  type DeadlineRule,
  type IssueSlot,
  type OrderConflict,
} from '@/domain/calendar';
import {
  instantToWallClock,
  parseIsoDate,
  parseWallTime,
  toIsoDate,
  toIsoTime,
  wallClockToInstant,
  type CalDate,
} from '@/domain/time';
import { flagOf, readText, textOf } from '@/ui/form';

/** What the move form works from: the slot and the calendar around it, as the page read them. */
export interface MoveView {
  readonly monday: string;
  /** Null for a Monday without a row yet. */
  readonly version: number | null;
  /** The porada's meeting date now, ISO. */
  readonly meetingDate: string;
  /** Its deadline now, ISO instant. */
  readonly deadlineAt: string;
  /** Today and the last day a porada may be moved to, ISO. */
  readonly today: string;
  readonly last: string;
  /** `issues.window` as the wire carries it, the instant it was read and the deadline rule. */
  readonly issues: readonly {
    readonly monday: string;
    readonly meetingDate: string;
    readonly deadlineAt: string;
    readonly status: 'open' | 'generated' | 'skipped';
  }[];
  readonly now: string;
  readonly rule: DeadlineRule;
}

/** The deadline the rule gives a porada held on `meeting`, as the form's two fields; null when it has already passed. */
export function ruleDeadline(
  meeting: string,
  rule: DeadlineRule,
  now: string,
): { readonly date: string; readonly time: string } | null {
  const day = readText(meeting, parseIsoDate);
  if (day === null) return null;
  const at = deadline(day, rule);
  if (at.getTime() <= new Date(now).getTime()) return null;
  const { date, time } = instantToWallClock(at);
  return { date: toIsoDate(date), time: toIsoTime(time) };
}

/** The slots the move is checked against, with the moved one as the typed values would make it; null while a value is missing. */
export function moveEffect(
  view: MoveView,
  typed: { readonly meeting: string; readonly date: string; readonly time: string },
): {
  readonly conflicts: readonly OrderConflict[];
  readonly deadlineAt: Date;
  readonly change: 'earlier' | 'later' | 'same';
} | null {
  const meetingDate = readText(typed.meeting, parseIsoDate);
  const deadlineDate = readText(typed.date, parseIsoDate);
  const time = readText(typed.time, parseWallTime);
  if (meetingDate === null || deadlineDate === null || time === null) return null;
  const today = parseIsoDate(view.today);
  const slots = issueSlots(toIssueRows(view.issues), today, view.rule);
  const slot = slots.find((s: IssueSlot) => toIsoDate(s.monday) === view.monday);
  if (slot === undefined) return null;
  const deadlineAt = wallClockToInstant(deadlineDate, time);
  return {
    conflicts: orderConflicts(slots, { ...slot, meetingDate, deadlineAt }),
    deadlineAt,
    change:
      deadlineAt.getTime() === slot.deadlineAt.getTime()
        ? 'same'
        : deadlineAt.getTime() < slot.deadlineAt.getTime()
          ? 'earlier'
          : 'later',
  };
}

/** The Mondays the move cancels, ISO. */
export const skipList = (conflicts: readonly { readonly monday: CalDate }[]): string[] =>
  conflicts.map((c) => toIsoDate(c.monday));

/** What the form sends: the version only for a slot with a row, `confirmed` only when ticked. */
export function moveInput(
  view: MoveView,
  skip: readonly string[],
  data: FormData,
): z.input<typeof moveIssueInput> {
  return {
    monday: view.monday,
    meetingDate: textOf(data, 'meetingDate'),
    deadlineDate: textOf(data, 'deadlineDate'),
    deadlineTime: textOf(data, 'deadlineTime'),
    skip: [...skip],
    ...(view.version !== null && { expectedVersion: view.version }),
    ...(flagOf(data, 'confirmed') && { confirmed: true as const }),
  };
}
