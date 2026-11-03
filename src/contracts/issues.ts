import { z } from 'zod';

import type { IssueRow } from '@/domain/calendar';
import { parseIsoDate } from '@/domain/time';

import { deadlineSchema } from './settings';

/**
 * „Porada se nekoná“ and its undo. `expectedVersion` is the version of the row
 * the page showed; a Monday without a row has none, which reads as an
 * untouched issue. `confirmed` is the checkbox (ADR 0013 item 10). `nextMeeting`,
 * with a skip only, is the day the next porada is held, any weekday: the porada
 * of its nearest Monday is held on it, and every one before it is skipped
 * (ADR 0051).
 */
export const setSkippedInput = z.strictObject({
  monday: z.iso.date().max(10),
  event: z.enum(['skip', 'unskip']),
  expectedVersion: z.number().int().positive().optional(),
  confirmed: z.literal(true).optional(),
  nextMeeting: z.iso.date().max(10).optional(),
});
export const setSkippedOutput = z.object({
  status: z.enum(['open', 'generated', 'skipped']),
  version: z.number().int().positive(),
});

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
  /** The first open Monday whose deadline is still ahead: where a hand-in goes (skipped and generated Mondays are stepped over). */
  submitMonday: z.iso.date(),
  /** The first Monday whose deadline is still ahead, whatever its status: where the strips of meetings start, so a skipped one stays in view to be undone. */
  stripFrom: z.iso.date(),
  /** The rows from this week's Monday to the last slot Monday (25 weeks on), earliest first; a Monday without a row has none. */
  issues: z.array(
    z.object({
      monday: z.iso.date(),
      /** The day the porada is held: the Monday until it is moved (ADR 0051). */
      meetingDate: z.iso.date(),
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
