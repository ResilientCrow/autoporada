import { diffRecords, type AuditShape } from '@/application/core';
import type { AuditEvent, FutureItemPatch, FutureItemRecord, Tx } from '@/application/ports';
import type { Check } from '@/domain/policy';
import { FUTURE_MACHINE } from '@/domain/review';

/**
 * What the audit log shows of a future item: where it stands in review, never
 * what the author wrote. The kind never changes, so it goes in `meta`; the
 * author is the event's actor.
 */
const FUTURE: AuditShape<FutureItemRecord> = {
  id: 'omit',
  kind: 'omit',
  authorId: 'omit',
  state: 'value',
  content: 'omit',
  reportState: 'value',
  reportPointId: 'value',
  submittedAt: 'value',
  version: 'omit',
  updatedAt: 'omit',
};

/** An item created or moved (past tense, as every M8 action). */
export function futureEvent(
  action: `future.${string}`,
  before: FutureItemRecord | null,
  after: FutureItemRecord,
): AuditEvent {
  return {
    action,
    target: { type: 'future_item', id: after.id },
    diff: diffRecords(FUTURE, before, after),
    meta: { kind: after.kind },
  };
}

/** The moves of FUTURE_MACHINE the author makes here, and what the audit log calls each. */
const ACTIONS = {
  submit: 'future.submitted',
  retract: 'future.retracted',
  revise: 'future.revised',
} as const;
type FutureMove = keyof typeof ACTIONS;

/**
 * The access check of a move: the policy folds the item's state and author
 * into the events the user may trigger, so a wrong state at the current
 * version and a user who may not make the move are both `forbidden`.
 */
export const moveCheck =
  (event: FutureMove) =>
  (item: FutureItemRecord): Check => ({
    action: 'future.transition',
    item: { authorId: item.authorId, state: item.state, kind: item.kind },
    event,
  });

/**
 * Moves the locked item along `event`: the state and `patch` in one
 * versioned update, the history event, and the audit event with the states
 * only. The caller checked the move with `moveCheck`.
 */
export async function move(
  tx: Tx,
  item: FutureItemRecord,
  event: FutureMove,
  patch: Omit<FutureItemPatch, 'state'> = {},
): Promise<FutureItemRecord> {
  const { to } = FUTURE_MACHINE[event];
  const after = await tx.futureItems.update(item.id, item.version, { ...patch, state: to });
  await tx.futureEvents.append({
    futureItemId: item.id,
    event,
    fromState: item.state,
    toState: to,
  });
  await tx.audit.record(futureEvent(ACTIONS[event], item, after));
  return after;
}
