import { eq, inArray, sql } from 'drizzle-orm';

import { ScopeViolation, StaleVersion, type PointRepo, type TxContext } from '@/application/ports';
import { can } from '@/domain/policy';
import { POINT_MACHINE } from '@/domain/review';

import { pointEvents, points } from '../schema';
import type { TxDatabase } from './database';
import { eventActor } from './events';

/**
 * What the generation reads and does to the report points of the akce it prints a placeholder for
 * (ADR 0049), whoever wrote them: the scoped repositories hide another author's draft (SSU-5), so
 * these two go around the read scope and are gated by the policy instead.
 */
export function createPointCloseRepo(
  db: TxDatabase,
  ctx: TxContext,
): Pick<PointRepo, 'statesOf' | 'close'> {
  const { principal, now } = ctx;
  const allowed = (action: 'issue.preview' | 'issue.generate') => {
    if (principal.kind === 'user' && !can(principal.actor, { action })) throw new ScopeViolation();
  };

  return {
    async statesOf(ids) {
      allowed('issue.preview');
      if (ids.length === 0) return [];
      return db
        .select({ id: points.id, state: points.state, version: points.version })
        .from(points)
        .where(inArray(points.id, [...ids]));
    },
    async close(id, expectedVersion) {
      allowed('issue.generate');
      const [current] = await db
        .select({ state: points.state, version: points.version })
        .from(points)
        .where(eq(points.id, id))
        .for('update');
      if (
        !current ||
        current.version !== expectedVersion ||
        !POINT_MACHINE.close.from.includes(current.state)
      ) {
        throw new StaleVersion();
      }
      const [moved] = await db
        .update(points)
        .set({
          state: POINT_MACHINE.close.to,
          version: sql`${points.version} + 1`,
          updatedAt: now,
        })
        .where(eq(points.id, id))
        .returning({ version: points.version });
      if (!moved) throw new StaleVersion();
      await db.insert(pointEvents).values({
        pointId: id,
        actorId: eventActor(ctx),
        event: 'close',
        fromState: current.state,
        toState: POINT_MACHINE.close.to,
        createdAt: now,
      });
      return { id, from: current.state, version: moved.version };
    },
  };
}
