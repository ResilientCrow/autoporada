import { z } from 'zod';

import { TIERS } from '@/domain/actor';
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

/**
 * The headmaster's answer: an approval names the tier, with no default (ADR 0072 item 2), and
 * only an approval takes one; a block is confirmed.
 */
const ACCESS_DECISIONS = ['approve', 'reject', 'block'] as const;
export const decideAccessInput = z
  .strictObject({
    requestId: z.guid(),
    version: z.number().int().positive(),
    decision: z.enum(ACCESS_DECISIONS),
    tier: z.enum(TIERS).optional(),
    confirmed: z.literal(true).optional(),
  })
  .superRefine(({ decision, tier }, ctx) => {
    const approves = decision === 'approve';
    if (approves === (tier !== undefined)) return;
    const code = approves ? 'required' : 'invalid';
    ctx.addIssue({ code: 'custom', path: ['tier'], message: code, params: { code } });
  });
/**
 * An approval also answers the approved user and their new version, which Arch keys by the user
 * (`version` is the user's, not the request's); a reject or block leaves the user as they were.
 */
export const decideAccessOutput = z.object({
  state: DECIDED_STATES,
  userId: z.guid().optional(),
  version: z.number().int().positive().optional(),
});
