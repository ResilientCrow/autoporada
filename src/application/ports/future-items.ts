import type { Campus } from '@/domain/cs';
import type { FutureKind } from '@/domain/calendar';
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
  /** Free text printed as typed (ADR 0060). */
  readonly organizer: string | null;
  readonly participants: string | null;
  readonly note: string | null;
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

/**
 * What the report prompt reads of an akce at send time and in its daily run (migration 0022's
 * columns): who wrote it and where it stands, never what is in it.
 */
export type FutureMailFacts = Pick<FutureItemRecord, 'id' | 'authorId' | 'state' | 'reportState'>;

/** An akce that may be owed a report prompt: its author and the Prague day it ended. */
export interface ReportPromptItem {
  readonly id: string;
  readonly authorId: string;
  /** The end date, or the start date of a one-day akce. */
  readonly lastDay: CalDate;
}

/**
 * An akce as the late-report mails read it (migrations 0022, 0035 and 0046): who wrote it, where its
 * report stands and when it ends, never what is in it.
 */
export interface EndingAkce {
  readonly id: string;
  readonly authorId: string;
  readonly state: FutureState;
  readonly reportState: ReportState;
  /** The end date, or the start date of a one-day akce. */
  readonly lastDay: CalDate;
  /** When the last day ends; null counts as 20.00 (`eventEnd`). */
  readonly timeTo: WallTime | null;
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
  /** Where the report stands; `future_items_report_akce` refuses one on a jednání. */
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
 * the handed-in ones; it moves the state and nothing else. The CHECKs of migration 0019
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
  /**
   * The daily run's read: the approved akce (each owes a report, ADR 0048) whose `report_state` is
   * still `none`, whose last day (the end date, or else the start date) falls from `from` to `to`,
   * both included, ordered by id. Only the columns migrations 0022 and 0046 grant the worker. ScopeViolation for a user.
   */
  reportPromptDue(window: {
    readonly from: CalDate;
    readonly to: CalDate;
  }): Promise<readonly ReportPromptItem[]>;
  /**
   * The late-report job's read: the approved akce whose `report_state` is `none` or `prompted` and
   * that have no report point yet, whose last day falls from `from` to `to`, both included, ordered
   * by id. Only the columns migrations 0022, 0035 and 0046 grant the worker. ScopeViolation for a user.
   */
  reportsEnding(window: {
    readonly from: CalDate;
    readonly to: CalDate;
  }): Promise<readonly EndingAkce[]>;
  /** The same akce at send time, whatever its state: null for an unknown item or a jednání. ScopeViolation for a user. */
  reportEnding(id: string): Promise<EndingAkce | null>;
  /** The worker's read at send time: null for an unknown item. ScopeViolation for a user. */
  mailFacts(id: string): Promise<FutureMailFacts | null>;
  /**
   * The soft reminder's read (ADR 0046): the approved akce whose report nobody has handed in, as
   * `awaitingReport` counts them, whose last day falls from `from` to `to`, both included, ordered
   * by id. Only the columns migrations 0017, 0022, 0035 and 0046 grant the worker. ScopeViolation
   * for a user.
   */
  reportsOwed(window: {
    readonly from: CalDate;
    readonly to: CalDate;
  }): Promise<readonly EndingAkce[]>;
  /**
   * How many items wait for review (`submitted`) that were handed in after `since` by anyone but
   * `notBy`: what the reviewer digest counts. ScopeViolation for a user.
   */
  countSubmittedSince(query: { readonly since: Date; readonly notBy: string }): Promise<number>;
  /**
   * The approved, not cancelled items the issue whose meeting is on `meetingDate` shows: those
   * whose last day (the end date, or else the start date) is not before it. Compose routes them
   * (`routeFutureItem`). Within the read scope, earliest start first, ties to the lower id.
   */
  forIssue(meetingDate: CalDate): Promise<readonly FutureItemRecord[]>;
  /**
   * The `submitted` items of the same reach (last day not before `meetingDate`), for the preflight's
   * „akce waiting“; the caller narrows them to the meetings and events windows. Within the read
   * scope, in the order of `forIssue`.
   */
  waitingFor(meetingDate: CalDate): Promise<readonly FutureItemRecord[]>;
  /**
   * The approved akce whose report nobody has handed in and whose last day is from `from`
   * to `to`, both included: those with no report started (`reportState` none or prompted, no
   * report point) and those whose report point is still `draft` or `returned`, whatever its
   * author's scope (the akce is shown by its own title, never the draft's): the preflight's late
   * reports (ADR 0035). Within the read scope, in the order of `forIssue`.
   */
  awaitingReport(window: {
    readonly from: CalDate;
    readonly to: CalDate;
  }): Promise<readonly FutureItemRecord[]>;
  /**
   * The akce an issue owes (ADR 0049): approved ones, and ones back in review (`submitted` or
   * `returned`) after their author's revise of an approved akce, which a revise never takes out of
   * its porada. Their last day is from `from` to `to`, both
   * included, and their report is not `missed`, whatever else it says. Within the read scope, in
   * the order of `forIssue`.
   */
  owedTo(window: {
    readonly from: CalDate;
    readonly to: CalDate;
  }): Promise<readonly FutureItemRecord[]>;
  /**
   * Closes the report of an owed akce (see `owedTo`) as `missed` (the `miss` of REPORT_MACHINE):
   * version-checked, the version rises by one, whoever wrote the akce. StaleVersion when the version
   * moved, the item is unknown, not an owed akce, or its report is already missed. ScopeViolation for a user who
   * may not `issue.generate`. The caller audits it.
   */
  markMissed(id: string, expectedVersion: number): Promise<FutureItemRecord>;
}
