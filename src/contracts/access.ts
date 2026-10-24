import { z } from 'zod';

import { ACCESS_EVENTS, ACCESS_REASON_MAX, ACCESS_STATES } from '@/domain/review';

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

/** What a decision can leave a request as, and the events that decide (not the requester's cancel). */
const DECIDED_STATES = z.enum(ACCESS_STATES).exclude(['pending', 'cancelled']);
export const DECISION_EVENTS = z.enum(ACCESS_EVENTS).exclude(['cancel']);
export type DecisionEventName = z.output<typeof DECISION_EVENTS>;

/** The headmaster's answer: approval names the audience, with no default; a block is confirmed. */
const ACCESS_DECISIONS = ['approve-staff', 'approve-student', 'reject', 'block'] as const;
export const decideAccessInput = z.strictObject({
  requestId: z.guid(),
  version: z.number().int().positive(),
  decision: z.enum(ACCESS_DECISIONS),
  confirmed: z.literal(true).optional(),
});
export const decideAccessOutput = z.object({ state: DECIDED_STATES });

export const pendingAccessInput = z.strictObject({});
/** The headmaster's queue, oldest first; `events` are the decisions open to them. */
export const pendingAccessOutput = z.object({
  items: z.array(
    z.object({
      requestId: z.guid(),
      version: z.number().int(),
      userId: z.guid(),
      displayName: z.string(),
      email: z.string().nullable(),
      jobTitle: z.string().nullable(),
      department: z.string().nullable(),
      reason: z.string(),
      requestedAt: z.iso.datetime(),
      events: z.array(DECISION_EVENTS),
    }),
  ),
});
