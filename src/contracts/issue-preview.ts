import { z } from 'zod';

import { documentInfo } from './documents';

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
    how: z.literal('carry'),
  }),
]);

/** One line of the preflight list (design §11); the copy is `porada.preflight.<code>`. */
const finding = z.strictObject({
  code: z.enum([
    'issue-not-open',
    'earlier-open',
    'snapshot-invalid',
    'report-incomplete',
    'points-waiting',
    'points-returned',
    'akce-waiting',
    'late-reports-expected',
    'reports-missing',
    'proposal-dropped',
    'deadline-ahead',
    'source-not-generated',
    'annex1-empty',
    'reports-later',
    'ohlasy-empty',
    'registry-new',
    'meeting-moved',
  ]),
  level: z.enum(['block', 'warn', 'info']),
  /** `earlier-open`: the porada to generate or drop first. */
  earlier: z.strictObject({ monday: z.iso.date(), meetingDate: z.iso.date() }).optional(),
  refs: z
    .array(
      z.strictObject({
        id: z.string(),
        title: z.string(),
        /** `late-reports-expected`: when the report closes. */
        due: z.iso.datetime().optional(),
        /** `late-reports-expected`: an akce or a report draft; `reports-missing`: always an akce. */
        of: z.enum(['akce', 'point']).optional(),
      }),
    )
    .optional(),
  paths: z.array(z.string()).optional(),
  count: z.int().min(0).optional(),
});

export const issuePreviewOutput = z.strictObject({
  /**
   * The `IssueSnapshot` as JSON text, or null when it is invalid. The contract layer cannot name
   * the snapshot and a wire type must not accept anything, so the reader parses the text and then
   * `parseIssueSnapshot`.
   */
  snapshot: z.string().nullable(),
  problems: z.array(problem),
  findings: z.array(finding),
  origin,
  /** A generated porada previews the snapshot it was generated from, with this; null before. */
  document: documentInfo.nullable(),
});
