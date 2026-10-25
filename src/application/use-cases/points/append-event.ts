import type { AuditTarget, PointPatch, PointRecord, Tx } from '@/application/ports';
import type { Check } from '@/domain/policy';
import { POINT_MACHINE } from '@/domain/review';

import { pointEvent } from './events';

/** The author's moves of POINT_MACHINE and what the audit log calls each. */
const ACTIONS = {
  submit: 'point.submitted',
  retract: 'point.retracted',
  withdraw: 'point.withdrawn',
} as const;
type AuthorEvent = keyof typeof ACTIONS;

/**
 * The access check of an author's move: the policy folds the point's state
 * into the events the user may trigger, so a wrong state at the current
 * version and a user who is not the author are both `forbidden`.
 */
export const moveCheck =
  (event: AuthorEvent) =>
  (point: PointRecord): Check => ({
    action: 'point.transition',
    point: { authorId: point.authorId, state: point.state },
    event,
  });

/**
 * Moves the locked point along `event` (design section 9, F18): the state
 * and `patch` in one versioned update, the point event, and the audit event
 * with the states only. `related` names the rows the move wrote besides the
 * point. The caller checked the move with `moveCheck`.
 */
export async function move(
  tx: Tx,
  point: PointRecord,
  event: AuthorEvent,
  patch: Omit<PointPatch, 'state'> = {},
  related?: readonly AuditTarget[],
): Promise<PointRecord> {
  const { to } = POINT_MACHINE[event];
  const after = await tx.points.update(point.id, point.version, { ...patch, state: to });
  await tx.pointEvents.append({ pointId: point.id, event, fromState: point.state, toState: to });
  await tx.audit.record({
    ...pointEvent(ACTIONS[event], point, after),
    ...(related && { related }),
  });
  return after;
}
