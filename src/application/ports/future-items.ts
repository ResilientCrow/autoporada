import type { Campus } from '@/domain/cs';
import type { FutureKind } from '@/domain/calendar';
import type { Responsible } from '@/domain/report';
import type { FutureState, ReportState } from '@/domain/review';
import type { CalDate, WallTime } from '@/domain/time';

/** What an author writes of a jednání or an akce. */
export interface FutureContent {
  readonly title: string;
  readonly startDate: CalDate | null;
  /** Last day of a multi-day akce. */
  readonly endDate: CalDate | null;
  readonly timeFrom: WallTime | null;
  readonly timeTo: WallTime | null;
  readonly campus: Campus | null;
  /** A locative phrase: „v učebně S206“. */
  readonly place: string | null;
  readonly responsible: Responsible | null;
  /** Only an akce; the author is asked for a report after its last day. */
  readonly expectsReport: boolean;
}

/** A future item as its author wrote it, with where it stands in review. */
export interface FutureItemRecord {
  readonly id: string;
  readonly kind: FutureKind;
  readonly authorId: string;
  readonly state: FutureState;
  readonly content: FutureContent;
  readonly reportState: ReportState;
  /** The report written for this akce. */
  readonly reportPointId: string | null;
  /** Set at every submit, cleared by a retract: the item is handed in, or was until a decision. */
  readonly submittedAt: Date | null;
  readonly version: number;
  readonly updatedAt: Date;
}

/**
 * A row of the review queue (design section 12): a submitted item as its author handed it in.
 * `revised` is true when the item came back to review by its author's change to it once it was
 * approved (its newest event is `revise`): the queue marks it „Změna schválené akce“.
 */
export interface QueuedFuture {
  readonly item: FutureItemRecord;
  readonly revised: boolean;
}

/** Where a page of the list ended: its last row's change and id. */
export type FutureCursor = Pick<FutureItemRecord, 'updatedAt' | 'id'>;

/** What `create` writes; the author is the transaction's user. */
export interface NewFutureItem {
  /** The draft's id in the author's browser: a retried create finds the row it made. */
  readonly clientRef: string;
  readonly kind: FutureKind;
  readonly content: FutureContent;
}

/** What a versioned update changes; a field left out keeps its value. */
export interface FutureItemPatch {
  readonly content?: FutureContent;
  readonly state?: FutureState;
  /** Null takes the hand-in back (a retract). */
  readonly submittedAt?: Date | null;
  /** Where the report stands; `future_items_report_needs_expect` refuses one on an item that expects none. */
  readonly reportState?: ReportState;
  /** The draft report started for the akce. */
  readonly reportPointId?: string;
}

/**
 * Future items, scoped by the policy's read scope for the transaction's principal
 * (`own-or-approved-akce` for submitters and students, `own-or-submitted` for
 * reviewers): an item outside it is not found, never an error. `loadForWrite` and
 * `update` use a narrower write scope, the author's own items (`futureWriteScopeOf`):
 * a colleague who reads an approved akce cannot lock or move it, and nor can a reviewer
 * move what they read. The decisions have a path of their own, `loadForDecision` and `decide`,
 * within the review scope (`futureReviewScopeOf`): the author's own items and, for reviewers,
 * the handed-in ones; it moves the state and nothing else. The
 * `responsible` jsonb goes through the contracts schema before a write and after a read;
 * a value it refuses fails as `db.parse.future_items`. The CHECKs of migration 0019
 * refuse a malformed row by its constraint name.
 */
export interface FutureItemRepo {
  /**
   * A new draft at version 1, or the author's existing item with the same
   * `clientRef`, as it is (`inserted` false). ScopeViolation for the system:
   * an item always has a user as its author.
   */
  create(
    item: NewFutureItem,
  ): Promise<{ readonly item: FutureItemRecord; readonly inserted: boolean }>;
  get(id: string): Promise<FutureItemRecord | null>;
  /**
   * As `get` but within the write scope (null for an item that is not the author's), and
   * holds the row lock (SELECT … FOR UPDATE) until the transaction ends.
   */
  loadForWrite(id: string): Promise<FutureItemRecord | null>;
  /**
   * Version-checked; the version rises by one. StaleVersion when the version
   * moved or the item is unknown or outside the write scope. The caller checks the move
   * against FUTURE_MACHINE.
   */
  update(id: string, expectedVersion: number, patch: FutureItemPatch): Promise<FutureItemRecord>;
  /**
   * As `loadForWrite` but within the review scope: the author's own items, and for reviewers the
   * handed-in ones (null for any other); holds the same row lock.
   */
  loadForDecision(id: string): Promise<FutureItemRecord | null>;
  /**
   * A decision: moves the item to `state` and nothing else (its content and hand-in time stay),
   * version-checked, within the review scope. StaleVersion when the version moved or the item is
   * unknown or outside it. The caller checks the move against FUTURE_MACHINE.
   */
  decide(id: string, expectedVersion: number, state: FutureState): Promise<FutureItemRecord>;
  /**
   * The review queue: the `submitted` items in the read scope, the oldest hand-in first, ties
   * to the lower id, at most `limit`.
   */
  queue(limit: number): Promise<readonly QueuedFuture[]>;
  /**
   * The items in scope, last changed first, ties to the higher id, at most `limit`; with `before`,
   * those after that row in this order. `updated_at` keeps milliseconds, as a cursor carries them.
   */
  list(limit: number, before?: FutureCursor): Promise<readonly FutureItemRecord[]>;
}
