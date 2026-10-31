import { z } from 'zod';

import { PASTE_LIMITS } from '@/domain/registry';

const problem = z.enum(['name-missing', 'class-missing', 'class-unknown', 'duplicate']);

/** The paste form: the pasted text (never stored or logged), the list it is for and the name order. */
export const previewPasteInput = z.strictObject({
  listId: z.uuid(),
  text: z.string().max(PASTE_LIMITS.chars),
  order: z.enum(['given-family', 'family-given']),
});

/** The rows the preview table shows; a row with a problem arrives unticked. */
export const previewPasteOutput = z.strictObject({
  rows: z.array(
    z.strictObject({
      source: z.string(),
      givenName: z.string(),
      familyName: z.string(),
      classCode: z.string().nullable(),
      problems: z.array(problem).readonly(),
      warnings: z.array(z.literal('group-count')).readonly(),
    }),
  ),
});
