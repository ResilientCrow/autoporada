import type { Actor } from '@/domain/actor';
import type { FutureKind } from '@/domain/calendar';
import { can } from '@/domain/policy';
import {
  REVIEW_DECISIONS,
  type FutureEvent,
  type FutureState,
  type ReviewDecision,
} from '@/domain/review';

/** What /akce/[id] may offer this viewer besides reading and editing, worked out so the page only renders it. */
export interface FutureBarModel {
  /** The decisions the policy allows from the item's state (separation of duties included). */
  readonly decisions: readonly ReviewDecision[];
  /**
   * The viewer may not approve only because the item is their own: the bar says another reviewer
   * or the headmaster approves it.
   */
  readonly othersApprove: boolean;
  /**
   * „Zrušit akci“ at once, or „Potvrdit zrušení“ of a waiting request: an approved akce, by a
   * reviewer or the headmaster only (ADR 0062).
   */
  readonly canCancel: boolean;
  /** „Požádat o zrušení“: the author outside the vedení, while no request of theirs waits. */
  readonly canRequestCancel: boolean;
  /** „Vzít žádost zpět“: the author whose request waits. */
  readonly canRetractCancel: boolean;
  /** „Zamítnout zrušení“ (with a note): the vedení, while a request waits. */
  readonly canRefuseCancel: boolean;
}

/**
 * The bar for this actor. A reviewer always has one, empty when nothing may be decided, so the
 * page's status line outlives a decision that leaves the item with nothing more to decide; anyone
 * else has one only when they have a cancel move to make. Null otherwise.
 */
export function futureBarOf(
  actor: Actor,
  item: { isAuthor: boolean; state: FutureState; kind: FutureKind; cancelRequested: boolean },
): FutureBarModel | null {
  const may = (event: FutureEvent, as = item) =>
    can(actor, { action: 'future.transition', item: as, event });
  const decisions = REVIEW_DECISIONS.filter((event) => may(event));
  const othersApprove =
    !decisions.includes('approve') && may('approve', { ...item, isAuthor: false });
  const moves = {
    canCancel: may('cancel'),
    canRequestCancel: may('request-cancel'),
    canRetractCancel: may('retract-cancel'),
    canRefuseCancel: may('refuse-cancel'),
  };
  return can(actor, { action: 'review.queue' }) || Object.values(moves).some(Boolean)
    ? { decisions, othersApprove, ...moves }
    : null;
}
