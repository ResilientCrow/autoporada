import type { AuditTarget, PointPatch, PointRecord, Tx } from '@/application/ports';
import type { Check } from '@/domain/policy';
import { POINT_MACHINE } from '@/domain/review';

import { pointEvent } from './events';

/** The moves of POINT_MACHINE a user makes, the author's and the reviewer's, and what the audit log calls each. */
const ACTIONS = {
  submit: 'point.submitted',
  retract: 'point.retracted',
  withdraw: 'point.withdrawn',
  approve: 'point.approved',
  return: 'point.returned',
  reject: 'point.rejected',
} as const;
type UserMove = keyof typeof ACTIONS;

/**
 * The access check of a move: the policy folds the point's state into the
 * events the user may trigger, so a wrong state at the current version and a
 * user who may not make the move (not the author, not an approver) are both
 * `forbidden`.
 */
export const moveCheck =
  (event: UserMove) =>
  (point: PointRecord): Check => ({
    action: 'point.transition',
    point: { authorId: point.authorId, state: point.state },
    event,
  });

/** What a move writes besides the state: fields of the point, the rows it names, the note for the author. */
interface MoveExtras {
  readonly patch?: Omit<PointPatch, 'state'>;
  readonly related?: readonly AuditTarget[];
  /** A reviewer's note: in the point event only, never in the audit. */
  readonly note?: string;
}

/**
 * Moves the locked point along `event` (design section 9, F18): the state
 * and `patch` in one versioned update, the point event with the note, and
 * the audit event with the states only. `related` names the rows the move
 * wrote besides the point. The caller checked the move with `moveCheck`.
 */
export async function move(
  tx: Tx,
  point: PointRecord,
  event: UserMove,
  { patch = {}, related, note }: MoveExtras = {},
): Promise<PointRecord> {
  const { to } = POINT_MACHINE[event];
  const after = await tx.points.update(point.id, point.version, { ...patch, state: to });
  await tx.pointEvents.append({
    pointId: point.id,
    event,
    fromState: point.state,
    toState: to,
    ...(note !== undefined && { note }),
  });
  await tx.audit.record({
    ...pointEvent(ACTIONS[event], point, after),
    ...(related && { related }),
  });
  return after;
}
