import { z } from 'zod';

import { PLACEMENT_WEEKS } from '@/domain/calendar';

import { documentInfo } from './documents';

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
  /** The open poradas after this one, any of which a skip may name as held next (`until`, ADR 0047). */
  heldNext: z
    .array(z.strictObject({ monday: z.iso.date(), meetingDate: z.iso.date() }))
    .max(PLACEMENT_WEEKS),
  counts: z.strictObject({
    waiting: z.int().min(0),
    returned: z.int().min(0),
    approved: z.int().min(0),
    /** Approved reports whose event does not end before the meeting. */
    later: z.int().min(0),
  }),
  /** The generated document; null until the porada is generated. */
  document: documentInfo.nullable(),
});

export const issueWorkspaceOutput = z.strictObject({
  /** The Monday of the porada to prepare, null when the calendar has none (`workingSlot`). */
  working: z.iso.date().nullable(),
  /** The asked slot; null when no Monday was asked. */
  slot: slot.nullable(),
});
