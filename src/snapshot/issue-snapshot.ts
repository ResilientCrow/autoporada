import { z } from 'zod';

import { campus, dated, refineSnapshot, required, snapshotFields, text, title } from './shape';
import { upcastV1 } from './upcast-v1';

export { issueAnnexSchema } from './shape';

/**
 * IssueSnapshot v2: everything the document engine needs to render one issue,
 * and nothing else. It is stored with every generated version, so it must
 * stay readable forever: every object is strict, and a change to its shape
 * means a new `schema` number with an upcaster from the old one (`upcast-v1.ts`
 * reads schema 1).
 */

const futureItem = z.strictObject({
  id: required,
  kind: z.enum(['jednani', 'akce']),
  title,
  ...dated,
  campus: campus.optional(),
  place: text.optional(),
  /** Free texts, printed as the author typed them (ADR 0060). */
  organizer: text.optional(),
  participants: text.optional(),
  note: text.optional(),
});

export const issueSnapshotSchema = z
  .strictObject({ schema: z.literal(2), ...snapshotFields(futureItem) })
  .superRefine(refineSnapshot);

export type IssueSnapshot = z.output<typeof issueSnapshotSchema>;
export type SnapshotItem = IssueSnapshot['pokyny'][number];
export type SnapshotReport = IssueSnapshot['reports'][number];
export type SnapshotFutureItem = IssueSnapshot['futureItems'][number];
export type SnapshotRegistryList = IssueSnapshot['registry'][number];
export type SnapshotStatement = SnapshotReport['statements'][number];
export type SnapshotBullet = SnapshotReport['bullets'][number];

export const SNAPSHOT_SCHEMA_VERSION = 2;

export type SnapshotResult =
  | { readonly ok: true; readonly snapshot: IssueSnapshot }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Validates untrusted (stored or assembled) snapshot data; a schema 1 snapshot is upcast first. */
export function parseIssueSnapshot(input: unknown): SnapshotResult {
  let current = input;
  if (typeof input === 'object' && input !== null && 'schema' in input && input.schema === 1) {
    const upcast = upcastV1(input);
    if (!upcast.ok) return upcast;
    current = upcast.input;
  }
  const parsed = issueSnapshotSchema.safeParse(current);
  if (parsed.success) return { ok: true, snapshot: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}
