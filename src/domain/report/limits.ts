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
  /** A missing report's paragraph, the system's or the headmaster's (ADR 0061). */
  placeholder: 4000,
  /** An akce's Organizátor, Účastníci and Poznámka: free text printed as typed (ADR 0060). */
  organizer: 1000,
  participants: 2000,
  futureNote: 1000,
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
 * The bounds of the school people search (design sections 4 and 14): the Graph
 * adapter, the dev adapter, the hit contract and the search box all read these.
 */
export const DIRECTORY_LIMITS = {
  /** Hits one search answers with. */
  hits: 10,
  /** Shorter queries answer nothing: three characters is where a prefix search starts to mean something. */
  minQuery: 3,
  /** The longest query the route takes: no name is longer, and Graph's adapter trims to less. */
  query: 64,
  /** The `displayName` cap of a directory hit. */
  displayName: 160,
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

/**
 * The further annexes of one porada, as the JSON `arch.annexes` saves (ids included): below the
 * `arch_annexes_size` CHECK (4 MB), which also counts jsonb's own spacing. The annex import checks
 * against it before it adds a file's parts (ADR 0066).
 */
export const ANNEXES_MAX_BYTES = 3_500_000;
