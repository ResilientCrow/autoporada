import { z } from 'zod';

import { POINT_LIMITS } from '@/domain/report';
import { FUTURE_RETURN_PARTS, REVIEW_DECISIONS } from '@/domain/review';

import { refineDecision, returnPartsSchema } from './decision';
import { futureKindSchema, futureView, futureWrite, version } from './future';
import { QUEUE_LIMIT } from './point-read';

/**
 * „Schválit“, „Vrátit k úpravě“, „Zamítnout“ on an akce or a jednání (design section 12), as a
 * point's decision is made. The note and the `parts` to rework are for the author: a return takes either or both, a
 * reject a note, an approval neither (`refineDecision`). One object with a refinement, since a use case's input is one strict object.
 */
export const decideFutureInput = z
  .strictObject({
    ...futureWrite,
    event: z.enum(REVIEW_DECISIONS),
    note: z.string().trim().min(1).max(POINT_LIMITS.note).optional(),
    parts: returnPartsSchema(FUTURE_RETURN_PARTS).optional(),
  })
  .superRefine(refineDecision);
export const decideFutureOutput = z.object({ version });

/**
 * „Zrušit akci“ by the vedení, or „Potvrdit zrušení“ of an author's request (ADR 0062);
 * `confirmed` is the checkbox that must be ticked.
 */
export const cancelFutureInput = z.strictObject({ ...futureWrite, confirmed: z.boolean() });
export const cancelFutureOutput = z.object({ version });

/** „Požádat o zrušení“: an author outside the vedení asks; `confirmed` is the dialog's yes. */
export const requestCancelFutureInput = z.strictObject({ ...futureWrite, confirmed: z.boolean() });
export const requestCancelFutureOutput = z.object({ version });

/** „Vzít žádost zpět“: the author takes the waiting request back. */
export const retractCancelFutureInput = z.strictObject(futureWrite);
export const retractCancelFutureOutput = z.object({ version });

/** „Zamítnout zrušení“: the vedení keeps the akce and tells the author why (the note is required). */
export const refuseCancelFutureInput = z.strictObject({
  ...futureWrite,
  note: z.string().trim().min(1).max(POINT_LIMITS.note),
});
export const refuseCancelFutureOutput = z.object({ version });

/** „Kontrola“, the akce and jednání section: no input; the reviewer's scope decides what is in it. */
export const queueFutureInput = z.strictObject({});
export const queueFutureOutput = z.object({
  /**
   * The submitted items and the approved ones whose cancel waits, the oldest hand-in or request
   * first; a past `QUEUE_LIMIT` are left out.
   */
  items: z
    .array(
      futureView.pick({ title: true, startDate: true, endDate: true }).extend({
        id: z.uuid(),
        kind: futureKindSchema,
        submittedAt: z.iso.datetime(),
        /** „Žádost o zrušení“: when the author asked to cancel the approved item; else null (ADR 0062). */
        cancelRequestedAt: z.iso.datetime().nullable(),
        /** „Změna schválené akce“: the author changed it after it was approved. */
        revised: z.boolean(),
      }),
    )
    .max(QUEUE_LIMIT),
  more: z.boolean(),
});
