import { z } from 'zod';

import { PLACEMENT_WEEKS, type IssueRow } from '@/domain/calendar';
import { parseIsoDate } from '@/domain/time';

import { deadlineSchema } from './settings';

/**
 * „Porada se nekoná“ and its undo. `expectedVersion` is the version of the row
 * the page showed; a Monday without a row has none, which reads as an
 * untouched issue. `confirmed` is the checkbox (ADR 0013 item 10).
 */
export const setSkippedInput = z.strictObject({
  monday: z.iso.date().max(10),
  event: z.enum(['skip', 'unskip']),
  expectedVersion: z.number().int().positive().optional(),
  confirmed: z.literal(true).optional(),
});
export const setSkippedOutput = z.object({
  status: z.enum(['open', 'generated', 'skipped']),
  version: z.number().int().positive(),
});

/**
 * Moving a porada to another meeting date (ADR 0034). The deadline is a date and a time of day
 * the form pre-fills from the rule. `skip` lists the Mondays of the slots in the way that the
 * move cancels; they must be exactly the conflicts, and `confirmed` is the checkbox that says so.
 */
export const moveIssueInput = z.strictObject({
  monday: z.iso.date().max(10),
  meetingDate: z.iso.date().max(10),
  deadlineDate: z.iso.date().max(10),
  deadlineTime: z
    .string()
    .max(5)
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  skip: z.array(z.iso.date().max(10)).max(PLACEMENT_WEEKS),
  expectedVersion: z.number().int().positive().optional(),
  confirmed: z.literal(true).optional(),
});
export const moveIssueOutput = z.object({
  version: z.number().int().positive(),
  skipped: z.int().min(0),
});

/** The calendar the Přehled, the standing line and the lists read: no input. */
export const issuesWindowInput = z.strictObject({});
export const issuesWindowOutput = z.object({
  /** The first open Monday whose deadline is still ahead: where a hand-in goes (skipped and generated Mondays are stepped over). */
  submitMonday: z.iso.date(),
  /** The first Monday whose deadline is still ahead, whatever its status: where the strips of meetings start, so a skipped one stays in view to be undone. */
  stripFrom: z.iso.date(),
  /** The rows from this week's Monday to the last slot Monday (25 weeks on), earliest first; a Monday without a row has none. */
  issues: z.array(
    z.object({
      monday: z.iso.date(),
      deadlineAt: z.iso.datetime(),
      status: z.enum(['open', 'generated', 'skipped']),
      version: z.number().int().positive(),
    }),
  ),
  /** The deadline rule in force: what a Monday with no row is counted by (`toDeadlineRule` reads it). */
  rule: deadlineSchema,
});

/** The rows of `issues.window` as the calendar domain reads them (placement, standing line). */
export function toIssueRows(
  rows: readonly {
    readonly monday: string;
    readonly deadlineAt: string;
    readonly status: IssueRow['status'];
  }[],
): readonly IssueRow[] {
  return rows.map((row) => {
    const monday = parseIsoDate(row.monday);
    // The wire carries no meeting date until row 35: every stored row meets on its Monday (ADR 0034).
    return {
      monday,
      meetingDate: monday,
      deadlineAt: new Date(row.deadlineAt),
      status: row.status,
    };
  });
}
