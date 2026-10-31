import { and, asc, count, desc, eq, gt, sql } from 'drizzle-orm';

import {
  scopeOf,
  ScopeViolation,
  StaleVersion,
  type AccessRequestRepo,
  type TxContext,
} from '@/application/ports';
import { can, type Check } from '@/domain/policy';

import { scopeWhere } from '../scope-sql';
import { accessRequests } from '../schema';
import type { TxDatabase } from './database';

/** The columns an AccessRequestRecord is made of. */
const ACCESS_REQUEST_RECORD = {
  id: accessRequests.id,
  userId: accessRequests.userId,
  reason: accessRequests.reason,
  state: accessRequests.state,
  decidedBy: accessRequests.decidedBy,
  decidedAt: accessRequests.decidedAt,
  version: accessRequests.version,
  createdAt: accessRequests.createdAt,
};

export function createAccessRequestRepo(db: TxDatabase, ctx: TxContext): AccessRequestRepo {
  const { principal } = ctx;
  const visible = () =>
    scopeWhere(scopeOf(principal, 'accessRequest'), { owner: accessRequests.userId });
  /** Privileged writes re-check the policy, whatever the use case declared (ADR 0011). */
  const require = (check: Check) => {
    if (principal.kind === 'user' && !can(principal.actor, check)) throw new ScopeViolation();
  };
  const byId = (id: string) =>
    db
      .select(ACCESS_REQUEST_RECORD)
      .from(accessRequests)
      .where(and(eq(accessRequests.id, id), visible()));

  return {
    async get(id) {
      const [row] = await byId(id);
      return row ?? null;
    },
    async lock(id) {
      const [row] = await byId(id).for('update');
      return row ?? null;
    },
    async forUser(userId) {
      return db
        .select(ACCESS_REQUEST_RECORD)
        .from(accessRequests)
        .where(and(eq(accessRequests.userId, userId), visible()))
        .orderBy(desc(accessRequests.createdAt), desc(accessRequests.id));
    },
    async pending() {
      require({ action: 'access.decide' });
      return db
        .select(ACCESS_REQUEST_RECORD)
        .from(accessRequests)
        .where(and(eq(accessRequests.state, 'pending'), visible()))
        .orderBy(asc(accessRequests.createdAt), asc(accessRequests.id));
    },
    async countPendingSince(since) {
      if (principal.kind !== 'system') throw new ScopeViolation();
      const [row] = await db
        .select({ count: count() })
        .from(accessRequests)
        .where(and(eq(accessRequests.state, 'pending'), gt(accessRequests.createdAt, since)));
      return row?.count ?? 0;
    },
    async create(userId, reason) {
      if (
        principal.kind !== 'user' ||
        principal.actor.id !== userId ||
        !can(principal.actor, { action: 'access.request' })
      ) {
        throw new ScopeViolation();
      }
      const [row] = await db
        .insert(accessRequests)
        .values({ userId, reason, createdAt: ctx.now })
        .returning(ACCESS_REQUEST_RECORD);
      if (!row) throw new Error('create: the insert returned no row');
      return row;
    },
    async transition(id, expectedVersion, to) {
      const cancel = to === 'cancelled';
      require({ action: cancel ? 'access.request' : 'access.decide' });
      // A decision names its headmaster (access_requests_decided_by); the system makes none.
      if (!cancel && principal.kind !== 'user') throw new ScopeViolation();
      // A cancel is the requester's own; a headmaster's scope would otherwise reach any row.
      const own =
        cancel && principal.kind === 'user'
          ? eq(accessRequests.userId, principal.actor.id)
          : undefined;
      const [row] = await db
        .update(accessRequests)
        .set({
          state: to,
          decidedBy: !cancel && principal.kind === 'user' ? principal.actor.id : null,
          decidedAt: ctx.now,
          version: sql`${accessRequests.version} + 1`,
        })
        .where(
          and(
            eq(accessRequests.id, id),
            eq(accessRequests.version, expectedVersion),
            visible(),
            own,
          ),
        )
        .returning(ACCESS_REQUEST_RECORD);
      if (!row) throw new StaleVersion();
      return row;
    },
  };
}
