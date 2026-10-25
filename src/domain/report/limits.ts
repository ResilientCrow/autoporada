import { PERSON_FIELD_MAX } from '@/domain/cs';
import { LIMITS as RICH_LIMITS } from '@/domain/richtext';

import type { PointContent } from './content';

/** Defined once in domain/cs, because the paste parser needs the same caps. */
export { PERSON_FIELD_MAX };

/**
 * The bounds of a point's content (design section 14): the single source for
 * the Zod schemas, the form counters and the numbers in the database CHECKs.
 * Character caps count UTF-16 units (`String.length`). That is never fewer than
 * the code points `char_length` counts, so a value within the cap always passes
 * the CHECK.
 */
export const POINT_LIMITS = {
  peoplePerBullet: 200,
  peoplePerPoint: 400,
  bullets: 12,
  statements: 10,
  /** Serialized rich text, as the rich text module caps it. */
  bodyBytes: RICH_LIMITS.maxBytes,
  title: 200,
  opening: 1000,
  place: 120,
  textBullet: 2000,
  quote: 1500,
  note: 2000,
  bulletLabel: 60,
  bulletKey: 40,
  /** `givenName` and `familyName` share `name`; `titlesBefore` and `titlesAfter` share `title`. */
  person: PERSON_FIELD_MAX,
  /** „2026/2027“ */
  affiliationYear: 9,
  /** A uuid. */
  graphId: 36,
  speakerGenitive: 200,
  statementAffiliation: PERSON_FIELD_MAX.affiliation,
  /**
   * UTF-8 bytes of `JSON.stringify(content)`, measured the way richtext measures
   * `bodyBytes` (`TextEncoder`), not `.length`: Czech letters are mostly two
   * bytes. The database CHECK allows 262,144 bytes of `octet_length(...::text)`;
   * the gap is headroom for the spaces jsonb adds.
   */
  contentBytes: 200_000,
} as const;

/**
 * The drafts an author may hold at once (design section 6). Only `draft`
 * counts: a returned point is there because a reviewer sent it back, and
 * that must never stop its author from starting another.
 */
export const DRAFT_CAP = 50;

/**
 * What `contentBytes` caps: UTF-8 bytes of the content's JSON, as `bodyBytes`
 * is measured. It measures the domain form, where a date or a time is an
 * object, a few bytes longer than its ISO text on the wire; a counter in the
 * browser measures the same way.
 */
export function contentBytes(content: PointContent): number {
  return new TextEncoder().encode(JSON.stringify(content)).length;
}
