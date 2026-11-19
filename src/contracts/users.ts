import { z } from 'zod';

import { ROLES, TIERS, USER_STATUSES } from '@/domain/actor';

/**
 * The full access the form asks for; only what differs from the user's row is changed. The tier
 * is null only while it was never set (ADR 0072 item 2).
 */
export const changeUserAccessInput = z.strictObject({
  userId: z.guid(),
  version: z.number().int().positive(),
  role: z.enum(ROLES),
  tier: z.enum(TIERS).nullable(),
  status: z.enum(USER_STATUSES),
  confirmed: z.literal(true).optional(),
});
/** The row's version after the call, so the page sends the next change from it. */
export const changeUserAccessOutput = z.object({
  changed: z.boolean(),
  version: z.number().int().positive(),
});
