import { and, eq, inArray, or, sql } from 'drizzle-orm';

import { futureEvents, futureItems } from '../schema';

/**
 * True when the item was approved at some point: its history holds a decision into `approved` or a
 * change out of it (`revise`). The events are append-only (migration 0020), so the fact stays after
 * the author's revise sends the akce back to review. Read by the web, never by the worker.
 */
const wasApproved = sql`EXISTS (
  SELECT 1 FROM ${futureEvents}
  WHERE ${futureEvents.futureItemId} = ${futureItems.id}
    AND (${futureEvents.fromState} = 'approved' OR ${futureEvents.toState} = 'approved'))`;

/**
 * An akce that owes its report to a porada (ADR 0049): approved, or back in review (`submitted` or
 * `returned`) after its author's revise of an approved one, so a revise never takes an ended akce
 * out of its porada. One that was never approved owes nothing.
 */
export const owedAkce = and(
  eq(futureItems.kind, 'akce'),
  or(
    eq(futureItems.state, 'approved'),
    and(inArray(futureItems.state, ['submitted', 'returned']), wasApproved),
  ),
);
