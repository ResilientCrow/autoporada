import { z } from 'zod';

import { ACCESS_REASON_MAX, ACCESS_STATES } from '@/domain/review';

/** Why the person needs access, in their own words; only the headmaster reads it. */
export const requestAccessInput = z.strictObject({
  reason: z.string().trim().min(1).max(ACCESS_REASON_MAX),
});
export const requestAccessOutput = z.object({ requestId: z.guid() });

/** „Zrušit žádost“: the version is the one the page showed. */
export const cancelAccessInput = z.strictObject({
  requestId: z.guid(),
  version: z.number().int().positive(),
});
export const cancelAccessOutput = z.object({});

/** What a decision can leave a request as. */
const DECIDED_STATES = z.enum(ACCESS_STATES).exclude(['pending', 'cancelled']);

/** The headmaster's answer: approval names the audience, with no default; a block is confirmed. */
const ACCESS_DECISIONS = ['approve-staff', 'approve-student', 'reject', 'block'] as const;
export const decideAccessInput = z.strictObject({
  requestId: z.guid(),
  version: z.number().int().positive(),
  decision: z.enum(ACCESS_DECISIONS),
  confirmed: z.literal(true).optional(),
});
export const decideAccessOutput = z.object({ state: DECIDED_STATES });
