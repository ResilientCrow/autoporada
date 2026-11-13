import { z } from 'zod';

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
