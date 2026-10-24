import { z } from 'zod';

import { ROLES, USER_STATUSES } from '@/domain/actor';

/** The groups of the users list: a role (among active accounts), everyone, or the inactive. */
export const USER_GROUPS = [
  'all',
  'pending',
  'submitter',
  'reviewer',
  'headmaster',
  'inactive',
] as const;
export type UserGroup = (typeof USER_GROUPS)[number];

export const listUsersInput = z.strictObject({
  q: z.string().trim().max(100).optional(),
  group: z.enum(USER_GROUPS).default('all'),
});
/** `total` counts every match; `users` is capped. */
export const listUsersOutput = z.object({
  users: z.array(
    z.object({
      id: z.guid(),
      displayName: z.string(),
      email: z.string().nullable(),
      role: z.enum(ROLES),
      status: z.enum(USER_STATUSES),
      isStudent: z.boolean(),
    }),
  ),
  total: z.number().int(),
});
