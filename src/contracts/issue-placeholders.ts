import { z } from 'zod';

import { POINT_LIMITS } from '@/domain/report';
import type { PointState } from '@/domain/review';
import { singleLine } from '@/domain/richtext';

const monday = z.iso.date().max(10);

/**
 * The paragraph a missing report prints (ADR 0049): plain text on one line, 1 to
 * `POINT_LIMITS.opening` characters after the ends are trimmed and the line breaks collapsed (the
 * pipeline has already dropped control characters). An empty one is `required`, a long one
 * `too-long`, before the database's CHECK sees it.
 */
const paragraph = z
  .string()
  .transform(singleLine)
  .pipe(z.string().min(1).max(POINT_LIMITS.opening));

/**
 * „Uložit“ on Chybějící zprávy sends the paragraph; „Obnovit původní text“ sends null. The version
 * is the one the page read: 0 when the akce has no text of its own yet.
 */
export const setPlaceholderInput = z.strictObject({
  monday,
  itemId: z.uuid(),
  paragraph: paragraph.nullable(),
  expectedVersion: z.int().min(0),
});

export const setPlaceholderOutput = z.strictObject({
  /** The row's version after the write: what the next save starts from; 0 after a reset. */
  version: z.int().min(0),
});

export const missingReportsInput = z.strictObject({ monday });

/** Every state of a report point once, and `none` for an akce nobody started one for. */
const REPORT_STATES: Readonly<Record<'none' | PointState, 'none' | PointState>> = {
  none: 'none',
  draft: 'draft',
  submitted: 'submitted',
  returned: 'returned',
  approved: 'approved',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
  published: 'published',
};
const reportState = z.enum(REPORT_STATES);

/** One akce the porada owes a report for and does not have one (ADR 0049). */
const missingReport = z.strictObject({
  id: z.string(),
  title: z.string(),
  /** The akce's first and last day; the end is null for a one-day akce. */
  startDate: z.iso.date(),
  endDate: z.iso.date().nullable(),
  /** Where the report point stands; `none` when nobody started one. */
  state: reportState,
  /** The paragraph the document prints now: the headmaster's own, else the system's. */
  paragraph: z.string(),
  /** The paragraph the system writes: what „Obnovit původní text“ goes back to. */
  original: z.string(),
  /** True when the paragraph is the headmaster's own (a row exists). */
  own: z.boolean(),
  /** What a save names: 0 when there is no row of its own. */
  version: z.int().min(0),
});

export const missingReportsOutput = z.strictObject({
  monday: z.iso.date(),
  /** The day the porada is held. */
  meetingDate: z.iso.date(),
  /** False for a generated porada: it has nothing to edit and the list is empty. */
  open: z.boolean(),
  reports: z.array(missingReport),
});

export const reportTallyInput = z.strictObject({});

/**
 * The headmaster's count on Přehled (ADR 0052): of the akce owed to the working porada, how many
 * have no report handed in. Null when no porada is open ahead or it is owed nothing.
 */
export const reportTallyOutput = z.object({
  porada: z
    .strictObject({
      monday: z.iso.date(),
      meetingDate: z.iso.date(),
      owed: z.int().min(1),
      missing: z.int().min(0),
    })
    .nullable(),
});
