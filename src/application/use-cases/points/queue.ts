import { defineUseCase, ok, pointPlacement } from '@/application/core';
import type { QueuedPoint, Tx } from '@/application/ports';
import { QUEUE_LIMIT, queuePointsInput, queuePointsOutput } from '@/contracts';
import type { Actor } from '@/domain/actor';
import type { KnownIssue } from '@/domain/calendar';
import { can } from '@/domain/policy';
import type { PointKind } from '@/domain/report';
import { toIsoDate } from '@/domain/time';

import { readWindow } from '../issues';

/** The kinds in the order of the porada: „Provoz a akce“, „Hospodaření“, „Pokyny“. */
const KIND_ORDER: readonly PointKind[] = ['report', 'finance', 'pokyn'];

const rowWire = (row: QueuedPoint) => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  typeName: row.typeName,
  submittedAt: row.submittedAt.toISOString(),
  returnedBefore: row.returnedBefore,
});

/** The ISO Monday the point goes to, or null when no Monday of the window takes it. */
const mondayOf = (row: QueuedPoint, now: Date, known: readonly KnownIssue[]) => {
  const monday = pointPlacement(row.state, row.earliestMonday, now, known);
  return monday && toIsoDate(monday);
};

/** Null last; ISO dates sort as text. */
const byMonday = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;

/** The submitted points by Monday, then by kind; each list keeps the queue's order. */
function grouped(rows: readonly { readonly monday: string | null; readonly row: QueuedPoint }[]) {
  const mondays = [...new Set(rows.map(({ monday }) => monday))].sort(byMonday);
  return mondays.map((monday) => {
    const ofMonday = rows.filter((entry) => entry.monday === monday).map(({ row }) => row);
    return {
      monday,
      kinds: KIND_ORDER.flatMap((kind) => {
        const points = ofMonday.filter((row) => row.kind === kind).map(rowWire);
        return points.length === 0 ? [] : [{ kind, points }];
      }),
    };
  });
}

/**
 * The queue as the reviewer's scope holds it now: the submitted points by the Monday they go to
 * (a skipped or generated Monday moves them on, as „Moje body“ does) and then by kind, the
 * approved ones still waiting for a porada apart. `keep` leaves rows out after the limit.
 */
async function readQueue(tx: Tx, now: Date, keep: (row: QueuedPoint) => boolean = () => true) {
  // One row past the limit tells whether more wait than the queue lists.
  const read = await tx.points.queue(QUEUE_LIMIT + 1);
  const { known } = await readWindow(tx, now);
  const placed = read
    .slice(0, QUEUE_LIMIT)
    .filter(keep)
    .map((row) => ({ monday: mondayOf(row, now, known), row }));
  return {
    mondays: grouped(placed.filter(({ row }) => row.state === 'submitted')),
    approved: placed
      .filter(({ row }) => row.state === 'approved')
      .map(({ monday, row }) => ({ ...rowWire(row), monday })),
    more: read.length > QUEUE_LIMIT,
  };
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
  const { mondays } = await readQueue(tx, now, approvable);
  return mondays[0]?.kinds[0]?.points[0]?.id ?? null;
}

/**
 * „Kontrola“ (design section 10): the handed-in points in the reviewer's scope, as `readQueue`
 * orders them. Drafts are never in scope for a reviewer, and a returned, rejected, withdrawn or
 * published point is not waiting here.
 */
export const queuePoints = defineUseCase({
  name: 'points.queue',
  mode: 'read',
  input: queuePointsInput,
  output: queuePointsOutput,
  access: { kind: 'gate', check: () => ({ action: 'review.queue' }) },
  async execute({ tx, now }) {
    return ok(await readQueue(tx, now));
  },
});
