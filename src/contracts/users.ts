import { z } from 'zod';

import { ROLES, USER_STATUSES } from '@/domain/actor';
import { AUDIENCES } from '@/domain/policy';

/** The full access the form asks for; only what differs from the user's row is changed. */
export const changeUserAccessInput = z.strictObject({
  userId: z.guid(),
  version: z.number().int().positive(),
  role: z.enum(ROLES),
  audience: z.enum(AUDIENCES),
  status: z.enum(USER_STATUSES),
  confirmed: z.literal(true).optional(),
});
export const changeUserAccessOutput = z.object({ changed: z.boolean() });
