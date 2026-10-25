import type { PointContent, PointKind } from '@/domain/report';
import type { PointState } from '@/domain/review';
import type { CalDate } from '@/domain/time';

/** A point as its author wrote it, with where it stands in review. */
export interface PointRecord {
  readonly id: string;
  readonly kind: PointKind;
  readonly authorId: string;
  /** The point type of a report; null for finance and pokyn. */
  readonly typeId: string | null;
  readonly state: PointState;
  readonly content: PointContent;
  /** Set once, at the first submit. */
  readonly earliestMonday: CalDate | null;
  /** Set at every submit and never cleared: "ever submitted". */
  readonly submittedAt: Date | null;
  readonly version: number;
  readonly updatedAt: Date;
}

/** What `create` writes; the author is the transaction's user. */
export interface NewPoint {
  /** The draft's id in the author's browser: a retried create finds the row it made. */
  readonly clientRef: string;
  readonly kind: PointKind;
  readonly typeId: string | null;
  readonly content: PointContent;
}

/** What `beginCreate` reports, under the lock. */
interface CreateStart {
  readonly existing: PointRecord | null;
  readonly drafts: number;
}

/** What a versioned update changes; a field left out keeps its value. */
export interface PointPatch {
  readonly content?: PointContent;
  readonly state?: PointState;
  readonly earliestMonday?: CalDate;
  readonly submittedAt?: Date;
}

/** A row of the author's list: no content beyond the title and the date. */
export type PointSummary = Pick<
  PointRecord,
  'id' | 'kind' | 'typeId' | 'state' | 'earliestMonday' | 'submittedAt' | 'version' | 'updatedAt'
> &
  Pick<PointContent, 'title' | 'eventDate'>;

/**
 * Points, scoped by the policy's read scope for the transaction's principal
 * (`own-or-submitted` for reviewers): a point outside it is not found, never
 * an error. The jsonb content is parsed with the contracts schemas on read and
 * before write; a stored row they refuse fails as `db.parse.points`.
 */
export interface PointRepo {
  /**
   * A new draft at version 1, or the author's existing point with the same
   * `clientRef`, as it is (`inserted` false). ScopeViolation for the system:
   * a point always has a user as its author.
   */
  create(point: NewPoint): Promise<{ readonly point: PointRecord; readonly inserted: boolean }>;
  /**
   * What a create decides on: the user's own point with this `clientRef`, and
   * how many of their points are drafts. It first takes a lock on the user
   * held until the transaction ends, so two of their creates never both pass
   * the draft cap; other users are not held up. ScopeViolation for the system.
   */
  beginCreate(clientRef: string): Promise<CreateStart>;
  get(id: string): Promise<PointRecord | null>;
  /** As `get`, and holds the row lock (SELECT … FOR UPDATE) until the transaction ends. */
  loadForWrite(id: string): Promise<PointRecord | null>;
  /**
   * Version-checked; the version rises by one. StaleVersion when the version
   * moved or the point is unknown or out of scope. The caller checks the move
   * against POINT_MACHINE and readiness.
   */
  update(id: string, expectedVersion: number, patch: PointPatch): Promise<PointRecord>;
  /** The user's own points, last changed first. ScopeViolation for the system. */
  listMine(limit: number): Promise<readonly PointSummary[]>;
}
