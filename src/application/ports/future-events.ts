import type { FutureEvent, FutureState } from '@/domain/review';

/** What happened to a future item: a transition of FUTURE_MACHINE, or a reviewer's edit. */
export type FutureEventName = FutureEvent | 'edit';

/** What `append` writes; the actor and the instant come from the transaction. */
export interface NewFutureEvent {
  readonly futureItemId: string;
  readonly event: FutureEventName;
  readonly fromState: FutureState;
  readonly toState: FutureState;
  /** 1 to 2000 code points; required for `return` and `reject` (the CHECKs refuse otherwise). */
  readonly note?: string;
  /** A reviewer's edit: the names of the fields it changed. */
  readonly editedFields?: readonly string[];
}

export interface FutureEventRecord {
  readonly id: string;
  readonly futureItemId: string;
  /** The user of the transaction; null for a system event. */
  readonly actorId: string | null;
  readonly event: FutureEventName;
  readonly fromState: FutureState;
  readonly toState: FutureState;
  readonly note: string | null;
  readonly editedFields: readonly string[] | null;
  readonly createdAt: Date;
}

/**
 * The history of future items, append-only (nothing updates or deletes an event; deleting
 * an item deletes its events). It is scoped by the read scope of the transaction's
 * principal over `future_items`, the same one `FutureItemRepo` uses.
 */
export interface FutureEventRepo {
  /**
   * Adds an event. The actor is the transaction's user, null for the system, and
   * `createdAt` is the call's instant. ScopeViolation when the item is outside the
   * principal's scope or unknown to a scoped one: the use case loads the item first,
   * so reaching this is a bug. The system is unscoped; an unknown item is then
   * refused by the foreign key.
   */
  append(event: NewFutureEvent): Promise<FutureEventRecord>;
  /** The item's events, newest first; none for an item outside the scope. */
  list(futureItemId: string): Promise<readonly FutureEventRecord[]>;
}
