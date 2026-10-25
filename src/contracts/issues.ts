import { z } from 'zod';

/**
 * „Porada se nekoná“ and its undo. `expectedVersion` is the version of the row
 * the page showed; a Monday without a row has none, which reads as an
 * untouched issue. `confirmed` is the checkbox (ADR 0013 item 10).
 */
export const setSkippedInput = z.strictObject({
  monday: z.iso.date().max(10),
  event: z.enum(['skip', 'unskip']),
  expectedVersion: z.number().int().positive().optional(),
  confirmed: z.literal(true).optional(),
});
export const setSkippedOutput = z.object({
  status: z.enum(['open', 'generated', 'skipped']),
  version: z.number().int().positive(),
});
