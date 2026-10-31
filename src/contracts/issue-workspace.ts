import { z } from 'zod';

/** The slot to open, by its Monday; without one the answer names the working slot only. */
export const issueWorkspaceInput = z.strictObject({ monday: z.iso.date().max(10).optional() });

/** What /porada/[datum] shows of one slot: its dates, status and what waits for it. */
const slot = z.strictObject({
  monday: z.iso.date(),
  meetingDate: z.iso.date(),
  deadlineAt: z.iso.datetime(),
  status: z.enum(['open', 'generated', 'skipped']),
  /** Null for a Monday without a row yet. */
  version: z.number().int().positive().nullable(),
  /** The meeting the approved points move to if this porada is skipped; null when no slot follows. */
  next: z.iso.date().nullable(),
  counts: z.strictObject({
    waiting: z.int().min(0),
    returned: z.int().min(0),
    approved: z.int().min(0),
    /** Approved reports whose event does not end before the meeting. */
    later: z.int().min(0),
  }),
});

export const issueWorkspaceOutput = z.strictObject({
  /** The Monday of the porada to prepare, null when the calendar has none (`workingSlot`). */
  working: z.iso.date().nullable(),
  /** The asked slot; null when no Monday was asked. */
  slot: slot.nullable(),
});
