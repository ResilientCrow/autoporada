import { z } from 'zod';

import type { KnownIssue } from '@/domain/calendar';
import { parseIsoDate } from '@/domain/time';

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
});

/** The rows of `issues.window` as the calendar domain reads them (placement, standing line). */
export function toKnownIssues(
  rows: readonly {
    readonly monday: string;
    readonly deadlineAt: string;
    readonly status: KnownIssue['status'];
  }[],
): readonly KnownIssue[] {
  return rows.map((row) => ({
    monday: parseIsoDate(row.monday),
    deadlineAt: new Date(row.deadlineAt),
    status: row.status,
  }));
}
