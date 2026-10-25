import type { PointEvent, PointState } from '@/domain/review';

/** What happened to a point: a transition of POINT_MACHINE, or a reviewer's edit. */
export type PointEventName = PointEvent | 'edit';

/** What `append` writes; the actor and the instant come from the transaction. */
export interface NewPointEvent {
  readonly pointId: string;
  readonly event: PointEventName;
  readonly fromState: PointState;
  readonly toState: PointState;
  /** 1 to 2000 code points; required for `return` and `reject` (the CHECKs refuse otherwise). */
  readonly note?: string;
  /** A reviewer's edit: the names of the fields it changed. */
  readonly editedFields?: readonly string[];
  /** A reviewer's edit: the previous values of those fields; only on `edit`. */
  readonly before?: Readonly<Record<string, unknown>>;
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
  readonly editedFields: readonly string[] | null;
  readonly before: Readonly<Record<string, unknown>> | null;
  readonly createdAt: Date;
}

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
}
