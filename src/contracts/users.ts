import { z } from 'zod';

import { ROLES, TIERS, USER_STATUSES } from '@/domain/actor';
import { PERSON_FIELD_MAX, SALUTATIONS } from '@/domain/cs';
import { hasForbiddenCharacters } from '@/domain/richtext';

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

/**
 * A degree on one line, as typed: trimmed, and empty is none. Control characters, line breaks,
 * tabs and direction marks are refused, as the snapshot's `text` rule does, and the length cap is
 * the one of the column's CHECK.
 */
const degree = z
  .string()
  .trim()
  .max(PERSON_FIELD_MAX.title)
  .refine(
    (value) => !hasForbiddenCharacters(value, { allowTab: false }),
    'contains control or direction characters',
  )
  .transform((value) => value || null)
  .nullable();

/**
 * A person's own answer to how documents address them (ADR 0072 item 6): the whole address, since
 * the form sends all of it. Whether the salutation suits the tier is the use case's to check. It
 * names no user: it is always the signed-in one's own row.
 */
export const setAddressInput = z.strictObject({
  salutation: z.enum(SALUTATIONS),
  titlesBefore: degree,
  titlesAfter: degree,
});
/** Whether anything was written; the version stays, since an address is not access. */
export const setAddressOutput = z.object({ changed: z.boolean() });
