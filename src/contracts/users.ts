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

export const getUserInput = z.strictObject({ userId: z.guid() });
/**
 * One user for the detail page: their newest request, the decisions open on
 * it (`requestEvents`) and what the access form may offer (`choices`).
 */
export const getUserOutput = z.object({
  user: z.object({
    id: z.guid(),
    displayName: z.string(),
    email: z.string().nullable(),
    jobTitle: z.string().nullable(),
    department: z.string().nullable(),
    role: z.enum(ROLES),
    status: z.enum(USER_STATUSES),
    isStudent: z.boolean(),
    version: z.number().int(),
    createdAt: z.iso.datetime(),
  }),
  isSelf: z.boolean(),
  choices: z.object({
    roles: z.array(z.enum(ROLES)),
    audience: z.boolean(),
    statuses: z.array(z.enum(USER_STATUSES)),
  }),
  request: z
    .object({
      requestId: z.guid(),
      version: z.number().int(),
      state: z.enum(['pending', 'approved', 'rejected', 'blocked', 'cancelled']),
      reason: z.string(),
      createdAt: z.iso.datetime(),
      decidedAt: z.iso.datetime().nullable(),
    })
    .nullable(),
  requestEvents: z.array(z.enum(['approve', 'reject', 'block'])),
});
