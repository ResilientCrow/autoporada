import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';

import { DatabaseFailure, type QueuedPoint } from '@/application/ports';
import { parseIsoDate } from '@/domain/time';

import { pointEvents, points, pointTypes } from '../schema';
import type { TxDatabase } from './database';

/** Whether the point was ever returned („Vráceno dříve“): one EXISTS per row, no second query. */
const returnedBefore = sql<boolean>`EXISTS (
  SELECT 1 FROM ${pointEvents} e WHERE e.point_id = "points"."id" AND e.event = 'return'
)`.as('returned_before');

const QUEUE_ROW = {
  id: points.id,
  kind: points.kind,
  authorId: points.authorId,
  state: points.state,
  title: points.title,
  typeName: pointTypes.name,
  earliestMonday: points.earliestMonday,
  submittedAt: points.submittedAt,
  handInMonday: points.handInMonday,
  returnedBefore,
};

/** The failure code of a row the database should not hold; it never carries the payload (ADR 0015). */
export const PARSE_FAILURE = 'db.parse.points';

/** A queue row; `points_submitted_complete` and `points_hand_in_set` hold the Mondays and the submission of a handed-in point. */
function toQueued(row: Awaited<ReturnType<typeof queueRows>>[number]): QueuedPoint {
  const { state, earliestMonday, submittedAt, handInMonday } = row;
  const queued = state === 'submitted' || state === 'approved';
  if (!queued || earliestMonday === null || submittedAt === null || handInMonday === null) {
    throw new DatabaseFailure(PARSE_FAILURE);
  }
  return {
    ...row,
    state,
    earliestMonday: parseIsoDate(earliestMonday),
    submittedAt,
    handInMonday: parseIsoDate(handInMonday),
  };
}

/**
 * The submitted and approved points in scope: the submitted ones first, so approved points waiting
 * for a porada never push one out past the limit; each the oldest submission first, ties to the lower id.
 */
const queueRows = (db: TxDatabase, visible: SQL | undefined, limit: number) =>
  db
    .select(QUEUE_ROW)
    .from(points)
    .leftJoin(pointTypes, eq(pointTypes.id, points.typeId))
    .where(and(visible, inArray(points.state, ['submitted', 'approved'])))
    .orderBy(sql`${points.state} = 'approved'`, asc(points.submittedAt), asc(points.id))
    .limit(limit);

/** The review queue's rows in `visible` scope, as `PointRepo.queue` returns them. */
export async function queuedPoints(
  db: TxDatabase,
  visible: SQL | undefined,
  limit: number,
): Promise<readonly QueuedPoint[]> {
  return (await queueRows(db, visible, limit)).map(toQueued);
}
