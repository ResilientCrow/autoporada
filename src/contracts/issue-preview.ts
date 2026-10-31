import { z } from 'zod';

/** The Monday of the slot to preview; a Monday without a row previews as an untouched issue. */
export const issuePreviewInput = z.strictObject({ monday: z.iso.date().max(10) });

/** What the assembler could not take into the snapshot; ids and counts, never text (ADR 0015). */
const problem = z.discriminatedUnion('code', [
  z.strictObject({ code: z.literal('report-incomplete'), pointId: z.string(), title: z.string() }),
  z.strictObject({ code: z.literal('snapshot-invalid'), paths: z.array(z.string()) }),
]);

const origin = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('stored') }),
  z.strictObject({ kind: z.literal('seed') }),
  z.strictObject({
    kind: z.literal('derived'),
    from: z.iso.date(),
    how: z.enum(['carry', 'pass']),
  }),
]);

export const issuePreviewOutput = z.strictObject({
  /** An `IssueSnapshot` (the contract layer cannot name it; read it with `parseIssueSnapshot`), or null when it is invalid. */
  snapshot: z.unknown(),
  problems: z.array(problem),
  origin,
});
