import { z } from 'zod';

import { MAX_RETURN_PARTS, type ReviewDecision } from '@/domain/review';

/**
 * The parts a return names: one to `MAX_RETURN_PARTS` codes of `codes`, each once. Which codes
 * apply to the item at hand (a proposal has no people) is the use case's to check.
 */
export const returnPartsSchema = <const T extends readonly [string, ...string[]]>(codes: T) =>
  z
    .array(z.enum(codes))
    .min(1)
    .max(MAX_RETURN_PARTS)
    .refine((parts) => new Set(parts).size === parts.length, { message: 'duplicate' });

/** What a decision carries for the author. */
interface DecisionExtras {
  readonly event: ReviewDecision;
  readonly note?: string | undefined;
  readonly parts?: readonly string[] | undefined;
}

/**
 * The rule of a decision's note and parts, shared by points and future items: a return needs a
 * note or at least one part (or both), a reject needs a note, an approval takes neither, and
 * parts belong to a return only. A missing note is `required` on `note`, anything else that does
 * not belong is `invalid` on the field.
 */
export function refineDecision({ event, note, parts }: DecisionExtras, ctx: z.RefinementCtx): void {
  const issue = (field: 'note' | 'parts', code: 'required' | 'invalid') =>
    ctx.addIssue({ code: 'custom', path: [field], message: code, params: { code } });
  if (parts !== undefined && event !== 'return') issue('parts', 'invalid');
  if (event === 'approve' && note !== undefined) issue('note', 'invalid');
  if (event === 'reject' && note === undefined) issue('note', 'required');
  if (event === 'return' && note === undefined && parts === undefined) issue('note', 'required');
}
