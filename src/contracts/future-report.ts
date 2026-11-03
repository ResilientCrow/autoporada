import { z } from 'zod';

/**
 * „Napsat zprávu“ on an akce whose last day has passed (design section 12): the report of the
 * chosen type, prefilled from the akce. No version: the list the button sits on has none, and
 * a second press gives the same draft. Nobody can decline it (ADR 0048).
 */
export const startFutureReportInput = z.strictObject({ id: z.uuid(), typeId: z.uuid() });
export const startFutureReportOutput = z.object({ pointId: z.uuid() });

export const owedReportsInput = z.strictObject({});

/**
 * One akce of „Akce čekající na zprávu“ (ADR 0052): the author's ended akce owed to an open porada,
 * with that porada and the report's close. `report` is the draft or returned report to go on with;
 * null when none is started (or the one started was withdrawn).
 */
const owedReport = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  startDate: z.iso.date().nullable(),
  endDate: z.iso.date().nullable(),
  timeFrom: z.iso.time({ precision: -1 }).nullable(),
  timeTo: z.iso.time({ precision: -1 }).nullable(),
  /** The Monday and the meeting day of the porada the report goes to. */
  monday: z.iso.date(),
  meetingDate: z.iso.date(),
  /** When the report closes (`reportCloses`, ADR 0035). */
  closesAt: z.iso.datetime(),
  report: z.strictObject({ id: z.uuid(), state: z.enum(['draft', 'returned']) }).nullable(),
});

export const owedReportsOutput = z.object({ items: z.array(owedReport) });
