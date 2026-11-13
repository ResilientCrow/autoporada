import type { QueuedPoint, Tx } from '@/application/ports';
import type { Actor } from '@/domain/actor';
import { pointMonday, type IssueSlot } from '@/domain/calendar';
import { can } from '@/domain/policy';
import type { PointKind } from '@/domain/report';
import { instantToWallClock, toIsoDate } from '@/domain/time';

import { readWindow } from '../issues';

/** The most handed-in points the queue reads: the submitted ones first, each the oldest first. */
const QUEUE_LIMIT = 500;

/** The kinds in the order of the porada: „Provoz a akce“, „Hospodaření“, „Pokyny“. */
const KIND_ORDER: readonly PointKind[] = ['report', 'finance', 'pokyn'];

/** The ISO Monday the point goes to, or null when no Monday of the window takes it. */
const mondayOfPoint = (row: QueuedPoint, now: Date, slots: readonly IssueSlot[]) => {
  const monday = pointMonday(
    { earliest: row.earliestMonday, handIn: row.handInMonday },
    instantToWallClock(now).date,
    slots,
  );
  return monday && toIsoDate(monday);
};

/** Null last; ISO dates sort as text. */
const byMonday = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;

/** A queued point with the Monday it goes to. */
interface Placed {
  readonly monday: string | null;
  readonly row: QueuedPoint;
}

/** The submitted points by Monday, then by kind; each list keeps the queue's order. */
function grouped(rows: readonly Placed[]) {
  const mondays = [...new Set(rows.map(({ monday }) => monday))].sort(byMonday);
  return mondays.map((monday) => {
    const ofMonday = rows.filter((entry) => entry.monday === monday).map(({ row }) => row);
    return KIND_ORDER.flatMap((kind) => ofMonday.filter((row) => row.kind === kind));
  });
}

/**
 * The submitted points of the reviewer's scope by the Monday they go to (a generated Monday moves
 * them on) and then by kind. `keep` leaves rows out after the limit.
 */
async function readQueue(tx: Tx, now: Date, keep: (row: QueuedPoint) => boolean) {
  const read = await tx.points.queue(QUEUE_LIMIT + 1);
  const { slots } = await readWindow(tx, now);
  const placed = read
    .slice(0, QUEUE_LIMIT)
    .filter(keep)
    .map((row) => ({ monday: mondayOfPoint(row, now, slots), row }));
  return grouped(placed.filter(({ row }) => row.state === 'submitted'));
}

/**
 * „Schválit a pokračovat“: the first submitted point of the queue, in the queue's own order, that
 * `actor` may approve (the machine's approver: never a reviewer's own point, the headmaster's
 * yes). Read in the decision's transaction, so the point just decided is no longer waiting; null
 * when none is.
 */
export async function nextInQueue(tx: Tx, now: Date, actor: Actor): Promise<string | null> {
  const approvable = ({ authorId }: QueuedPoint) =>
    can(actor, {
      action: 'point.transition',
      point: { state: 'submitted', authorId },
      event: 'approve',
    });
  const mondays = await readQueue(tx, now, approvable);
  return mondays.flat()[0]?.id ?? null;
}
