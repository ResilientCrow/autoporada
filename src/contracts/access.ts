import { z } from 'zod';

import { ACCESS_REASON_MAX } from '@/domain/review';

/** Why the person needs access, in their own words; only the headmaster reads it. */
export const requestAccessInput = z.strictObject({
  reason: z.string().trim().min(1).max(ACCESS_REASON_MAX),
});
export const requestAccessOutput = z.object({ requestId: z.guid() });

export const myAccessInput = z.strictObject({});
/**
 * Where the signed-in user stands when it comes to asking for access: a
 * member already has it, otherwise the standing of their requests. The
 * `pending` variant carries what the page shows and cancels by.
 */
export const myAccessOutput = z.object({
  standing: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('member') }),
    z.object({ kind: z.literal('open'), previous: z.enum(['rejected', 'cancelled']).nullable() }),
    z.object({
      kind: z.literal('pending'),
      requestId: z.guid(),
      version: z.number().int(),
      reason: z.string(),
      createdAt: z.iso.datetime(),
    }),
    z.object({
      kind: z.literal('cooldown'),
      decidedAt: z.iso.datetime(),
      until: z.iso.datetime(),
    }),
    z.object({ kind: z.literal('blocked'), decidedAt: z.iso.datetime() }),
  ]),
});

/** „Zrušit žádost“: the version is the one the page showed. */
export const cancelAccessInput = z.strictObject({
  requestId: z.guid(),
  version: z.number().int().positive(),
});
export const cancelAccessOutput = z.object({});
