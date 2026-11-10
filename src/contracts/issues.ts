import { z } from 'zod';

import type { IssueRow } from '@/domain/calendar';
import { parseIsoDate } from '@/domain/time';

import { deadlineSchema } from './settings';

/**
 * „Přesunout poradu“ (ADR 0054 item 3): the open porada keyed by `monday` is held on `meetingDate`
 * instead. `expectedVersion` is the version of the row the page showed; a Monday without a row has
 * none, which reads as an untouched issue.
 */
export const moveIssueInput = z.strictObject({
  monday: z.iso.date().max(10),
  meetingDate: z.iso.date().max(10),
  expectedVersion: z.number().int().positive().optional(),
});
/** An issue as a calendar act leaves it: its key, the day it is held and its deadline. */
const calendarActOutput = z.object({
  monday: z.iso.date(),
  meetingDate: z.iso.date(),
  deadlineAt: z.iso.datetime(),
  version: z.number().int().positive(),
});
export const moveIssueOutput = calendarActOutput;

/** „Porada se nekoná“ (ADR 0054 item 4); `confirmed` is the checkbox (ADR 0013 item 10). */
export const dropIssueInput = z.strictObject({
  monday: z.iso.date().max(10),
  expectedVersion: z.number().int().positive().optional(),
  confirmed: z.literal(true).optional(),
});
/** The porada that takes the dropped one's place in the calendar and its prepared content. */
export const dropIssueOutput = z.object({
  heir: z.object({ monday: z.iso.date(), meetingDate: z.iso.date() }),
});

/** „Přidat poradu“ (ADR 0054 item 5): a porada held on `meetingDate`, keyed by that day's nearest Monday. */
export const addIssueInput = z.strictObject({ meetingDate: z.iso.date().max(10) });
export const addIssueOutput = calendarActOutput;

/**
 * Generating a porada's document (ADR 0038): the version of the row the preview showed (none for
 * a Monday without a row) and the checkbox that says the headmaster has read the preview.
 */
export const generateIssueInput = z.strictObject({
  monday: z.iso.date().max(10),
  expectedVersion: z.number().int().positive().optional(),
  confirmed: z.literal(true).optional(),
});
export const generateIssueOutput = z.object({
  documentId: z.uuid(),
  version: z.number().int().positive(),
});

/** The calendar the Přehled, the standing line and the lists read: no input. */
export const issuesWindowInput = z.strictObject({});
export const issuesWindowOutput = z.object({
  /** The first open Monday whose deadline is still ahead: where a hand-in goes (generated Mondays are stepped over). */
  submitMonday: z.iso.date(),
  /** The first Monday whose deadline is still ahead, whatever its status: where the strips of meetings start. */
  stripFrom: z.iso.date(),
  /** The rows from this week's Monday to the last slot Monday (25 weeks on), earliest first; a Monday without a row has none. */
  issues: z.array(
    z.object({
      monday: z.iso.date(),
      /** The day the porada is held: the Monday until it is moved (ADR 0051). */
      meetingDate: z.iso.date(),
      deadlineAt: z.iso.datetime(),
      status: z.enum(['open', 'generated']),
      version: z.number().int().positive(),
    }),
  ),
  /** The deadline rule in force: what a Monday with no row is counted by (`toDeadlineRule` reads it). */
  rule: deadlineSchema,
  /** The effective boundary (ADR 0054): up to it a Monday with no row is no porada. */
  plannedThrough: z.iso.date(),
});

/** The rows of `issues.window` as the calendar domain reads them (placement, standing line). */
export function toIssueRows(
  rows: readonly {
    readonly monday: string;
    readonly meetingDate: string;
    readonly deadlineAt: string;
    readonly status: IssueRow['status'];
  }[],
): readonly IssueRow[] {
  return rows.map((row) => {
    return {
      monday: parseIsoDate(row.monday),
      meetingDate: parseIsoDate(row.meetingDate),
      deadlineAt: new Date(row.deadlineAt),
      status: row.status,
    };
  });
}
