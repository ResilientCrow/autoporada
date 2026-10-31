import type { RecentSource } from '@/domain/people';
import type { PointContent, PointKind } from '@/domain/report';
import type { PointState } from '@/domain/review';
import type { CalDate, WallTime } from '@/domain/time';

/** A point as its author wrote it, with where it stands in review. */
export interface PointRecord {
  readonly id: string;
  readonly kind: PointKind;
  readonly authorId: string;
  /** The point type of a report; null for finance and pokyn. */
  readonly typeId: string | null;
  readonly state: PointState;
  readonly content: PointContent;
  /** The akce a report answers; null for every other point. Fixed at the create. */
  readonly futureItemId: string | null;
  /** Set once, at the first submit. */
  readonly earliestMonday: CalDate | null;
  /** Set at every submit, cleared by a retract: the point is handed in, or was until a decision. */
  readonly submittedAt: Date | null;
  /**
   * The porada's Monday the point was handed in for (ADR 0029): set with `submittedAt` at every
   * submit, cleared with it by a retract, kept by a return, a decision and a withdrawal.
   */
  readonly handInMonday: CalDate | null;
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
  /** The akce the report answers. */
  readonly futureItemId?: string;
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
  /** Null takes the hand-in back (a retract). */
  readonly submittedAt?: Date | null;
  /** Written with `submittedAt`; null takes it back with the hand-in. */
  readonly handInMonday?: CalDate | null;
}

/**
 * A row of the author's list: no content beyond the title and the date, and the
 * note of the last return while the point is `returned` (whole; null otherwise).
 */
export type PointSummary = Pick<
  PointRecord,
  'id' | 'kind' | 'typeId' | 'state' | 'earliestMonday' | 'handInMonday' | 'version' | 'updatedAt'
> &
  Pick<PointContent, 'title' | 'eventDate'> & { readonly returnNote: string | null };

/**
 * A row of the review queue (design section 10): what `/kontrola` shows of a submitted or
 * approved point. Both states are handed in, so the Monday and the submission are always set. The
 * author never reaches the page: it tells which points the reviewer may approve (`points.decide`).
 */
export type QueuedPoint = Pick<PointRecord, 'id' | 'kind' | 'authorId'> &
  Pick<PointContent, 'title'> & {
    /** The queue lists only these. */
    readonly state: Extract<PointState, 'submitted' | 'approved'>;
    readonly earliestMonday: CalDate;
    readonly submittedAt: Date;
    /** The Monday it was last handed in for; the queue places it by this and `earliestMonday`. */
    readonly handInMonday: CalDate;
    /** A report's type; null for finance and pokyn. */
    readonly typeName: string | null;
    /** True once the point was ever returned: „Vráceno dříve“. */
    readonly returnedBefore: boolean;
  };

/** A point the summary of a meeting counts: where it stands and what placement reads of it. */
interface HandedInPoint {
  readonly state: Extract<PointState, 'submitted' | 'approved' | 'returned'>;
  readonly earliestMonday: CalDate;
  readonly handInMonday: CalDate;
}

/**
 * A report point as the late-report jobs read it (migrations 0017, 0024, 0027 and 0035): who wrote
 * it, where it stands, the Monday it was handed in for and when its event ends, never what is in it.
 */
export interface ReportPoint {
  readonly id: string;
  readonly authorId: string;
  readonly state: PointState;
  /** Set while the point is handed in. */
  readonly handInMonday: CalDate | null;
  /** The event's end date, or else its date. */
  readonly lastDay: CalDate;
  /** When the last day ends; null counts as 20.00 (`eventEnd`). */
  readonly timeTo: WallTime | null;
}

/** A point named for a finding: where to find it, and what to call it. */
export interface PointRef {
  readonly id: string;
  readonly kind: PointKind;
  readonly title: string;
}

/**
 * What waits for the porada of one slot (design section 11): handed-in points whose due Monday is
 * not after the slot's Monday, and approved reports due by then whose event does not end before
 * the meeting date (`later`: they wait for a later issue).
 */
export interface WaitingPoints {
  readonly submitted: readonly PointRef[];
  readonly returned: readonly PointRef[];
  readonly later: readonly PointRef[];
}

/** What a decision mail reads again of its point at send time (ADR 0020): who wrote it, where it stands. */
export type PointMailFacts = Pick<PointRecord, 'id' | 'authorId' | 'state'>;

/** Where a page of the author's list ended: its last row's change and id. */
export type PointCursor = Pick<PointRecord, 'updatedAt' | 'id'>;

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
  /**
   * The user's own points, last changed first, ties to the higher id; with
   * `before`, only the rows strictly after that cursor in this order.
   * ScopeViolation for the system.
   */
  listMine(limit: number, before?: PointCursor): Promise<readonly PointSummary[]>;
  /**
   * The review queue: the points in scope that are `submitted` or `approved`, the submitted ones
   * first, then each the oldest submission first, ties to the lower id, at most `limit`.
   */
  queue(limit: number): Promise<readonly QueuedPoint[]>;
  /**
   * The people memory's read (design section 4): the bullets, statements and
   * change instant of the user's own points changed at or after `since`, in
   * any state, in `listMine`'s order, at most `limit`. Own whatever the read scope, so a
   * reviewer remembers only whom they named. ScopeViolation for the system.
   */
  ownRecent(query: {
    readonly limit: number;
    readonly since: Date;
  }): Promise<readonly RecentSource[]>;
  /**
   * The worker's read: only the columns migration 0017 grants it, null for an unknown
   * point. ScopeViolation for a user.
   */
  mailFacts(id: string): Promise<PointMailFacts | null>;
  /**
   * The authors the hard reminder is for, each once, ordered by id: those with a draft changed
   * since `draftsSince` and those with a returned point whose first Monday is not after `monday`.
   * Only the columns migrations 0017 and 0024 grant the worker. ScopeViolation for a user.
   */
  reminderAuthors(window: {
    readonly draftsSince: Date;
    readonly monday: CalDate;
  }): Promise<readonly string[]>;
  /**
   * The authors with a point handed in since `since` (`submitted_at`, which a retract clears),
   * each once, ordered by id. ScopeViolation for a user.
   */
  submitterIds(since: Date): Promise<readonly string[]>;
  /**
   * How many points wait for review (`submitted`) that were handed in after `since` by anyone but
   * `notBy`: what the reviewer digest counts. Only the columns migrations 0017 and 0024 grant the worker.
   * ScopeViolation for a user.
   */
  countSubmittedSince(query: { readonly since: Date; readonly notBy: string }): Promise<number>;
  /**
   * The points a meeting's summary counts: those waiting for review, approved or returned whose
   * first Monday is not after `monday`, with what placement reads of them (`pointMonday`) so the caller
   * can tell which are the Monday's. Only the columns migrations 0017, 0024 and 0027
   * (`hand_in_monday`) grant the worker. ScopeViolation for a user.
   */
  handedInFor(monday: CalDate): Promise<readonly HandedInPoint[]>;
  /**
   * The late-report jobs' read: the report points that are neither withdrawn nor rejected, with an
   * event date, whose last day falls from `from` to `to`, both included, ordered by id. Only the
   * columns migrations 0017, 0024, 0027 and 0035 grant the worker. ScopeViolation for a user.
   */
  reportPoints(window: {
    readonly from: CalDate;
    readonly to: CalDate;
  }): Promise<readonly ReportPoint[]>;
  /** The same point at send time, whatever its state: null for an unknown point or one with no event date. ScopeViolation for a user. */
  reportPoint(id: string): Promise<ReportPoint | null>;
  /**
   * The points that belong to the issue of `monday` whose meeting is on `meetingDate` (ADR 0029,
   * `inIssue`): approved, due by `monday` (`greatest(earliest_monday, hand_in_monday)`), and for a
   * report only when its last day is before `meetingDate`. Cumulative: a point stays in every
   * issue from its due Monday on. Within the principal's read scope, in the order handed in
   * (`submitted_at`, ties to the lower id). With `lock` it holds the rows (SELECT … FOR UPDATE)
   * until the transaction ends; generation takes it, a preview does not.
   */
  eligibleFor(
    monday: CalDate,
    meetingDate: CalDate,
    options?: { readonly lock?: boolean },
  ): Promise<readonly PointRecord[]>;
  /** What waits for that issue, within the read scope; each list in the order of `eligibleFor`. */
  waitingFor(monday: CalDate, meetingDate: CalDate): Promise<WaitingPoints>;
}
