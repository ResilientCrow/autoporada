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

/** „Zrušit akci“; `confirmed` is the checkbox that must be ticked. */
export const cancelFutureInput = z.strictObject({ ...futureWrite, confirmed: z.boolean() });
export const cancelFutureOutput = z.object({ version });

/** „Kontrola“, the akce and jednání section: no input; the reviewer's scope decides what is in it. */
export const queueFutureInput = z.strictObject({});
export const queueFutureOutput = z.object({
  /** The submitted items, the oldest hand-in first; a past `QUEUE_LIMIT` are left out. */
  items: z
    .array(
      futureView.pick({ title: true, startDate: true, endDate: true }).extend({
        id: z.uuid(),
        kind: futureKindSchema,
        submittedAt: z.iso.datetime(),
        /** „Změna schválené akce“: the author changed it after it was approved. */
        revised: z.boolean(),
      }),
    )
    .max(QUEUE_LIMIT),
  more: z.boolean(),
});
