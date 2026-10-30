import type { Actor } from '@/domain/actor';
import type { FutureKind } from '@/domain/calendar';
import { can } from '@/domain/policy';
import { REVIEW_DECISIONS, type FutureState, type ReviewDecision } from '@/domain/review';

/** What /akce/[id] may offer this viewer besides reading and editing, worked out so the page only renders it. */
export interface FutureBarModel {
  /** The decisions the policy allows from the item's state (separation of duties included). */
  readonly decisions: readonly ReviewDecision[];
  /**
   * The viewer may not approve only because the item is their own: the bar says another reviewer
   * or the headmaster approves it.
   */
  readonly othersApprove: boolean;
  /** „Zrušit akci“: an approved akce, by its author or a reviewer. */
  readonly canCancel: boolean;
}

/**
 * The bar for this actor. A reviewer always has one, empty when nothing may be decided, so the
 * page's status line outlives a decision that leaves the item with nothing more to decide; anyone
 * else has one only when they may cancel. Null otherwise.
 */
export function futureBarOf(
  actor: Actor,
  { isAuthor, state, kind }: { isAuthor: boolean; state: FutureState; kind: FutureKind },
): FutureBarModel | null {
  const item = { isAuthor, state, kind };
  const decisions = REVIEW_DECISIONS.filter((event) =>
    can(actor, { action: 'future.transition', item, event }),
  );
  const othersApprove =
    !decisions.includes('approve') &&
    can(actor, {
      action: 'future.transition',
      item: { isAuthor: false, state, kind },
      event: 'approve',
    });
  const canCancel = can(actor, { action: 'future.transition', item, event: 'cancel' });
  return can(actor, { action: 'review.queue' }) || canCancel
    ? { decisions, othersApprove, canCancel }
    : null;
}
