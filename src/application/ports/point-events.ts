import type { PointFieldValues } from '@/domain/report';
import type { PointEvent, PointState } from '@/domain/review';

/** What happened to a point: a transition of POINT_MACHINE, or a reviewer's edit. */
export type PointEventName = PointEvent | 'edit';

/** What `append` writes; the actor and the instant come from the transaction. */
export interface NewPointEvent {
  readonly pointId: string;
  readonly event: PointEventName;
  readonly fromState: PointState;
  readonly toState: PointState;
  /** 1 to 2000 code points; required for `reject`, and for `return` unless it names `returnParts` (the CHECKs refuse otherwise). */
  readonly note?: string;
  /** The parts of the point a `return` names for rework: 1 to 4 codes, only on `return`. */
  readonly returnParts?: readonly string[];
  /** A reviewer's edit: the names of the fields it changed. */
  readonly editedFields?: readonly string[];
  /** A reviewer's edit: the previous values of those fields; only on `edit`. */
  readonly before?: Partial<PointFieldValues>;
}

export interface PointEventRecord {
  readonly id: string;
  readonly pointId: string;
  /** The user of the transaction; null for a system event (publish, M10). */
  readonly actorId: string | null;
  readonly event: PointEventName;
  readonly fromState: PointState;
  readonly toState: PointState;
  readonly note: string | null;
  /** The parts a return named for rework; null when none (and for every other event). */
  readonly returnParts: readonly string[] | null;
  readonly editedFields: readonly string[] | null;
  /** A reviewer's edit: the values it replaced (D13), as stored. */
  readonly before: Partial<PointFieldValues> | null;
  readonly createdAt: Date;
}

/** What a decision mail reads again of its event at send time (ADR 0020): never the note or the edit. */
export type PointEventMailFacts = Pick<PointEventRecord, 'id' | 'pointId' | 'event' | 'toState'>;

/**
 * The history of points, append-only (nothing updates or deletes an event; deleting
 * a point deletes its events). It is scoped by the read scope of the transaction's
 * principal over `points`, the same one `PointRepo` uses.
 */
export interface PointEventRepo {
  /**
   * Adds an event. The actor is the transaction's user, null for the system, and
   * `createdAt` is the call's instant. ScopeViolation when the point is outside the
   * principal's scope or unknown to a scoped one: the use case loads the point first,
   * so reaching this is a bug. The system is unscoped; an unknown point is then
   * refused by the foreign key.
   */
  append(event: NewPointEvent): Promise<PointEventRecord>;
  /** The point's events, newest first; none for a point outside the scope. */
  list(pointId: string): Promise<readonly PointEventRecord[]>;
  /**
   * The worker's read: only the columns migration 0017 grants it, null for an unknown
   * event. ScopeViolation for a user.
   */
  mailFacts(id: string): Promise<PointEventMailFacts | null>;
}
