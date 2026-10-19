import { and, eq } from 'drizzle-orm';

import {
  ScopeViolation,
  type SessionRecord,
  type SessionRepo,
  type TxContext,
} from '@/application/ports';

import { sessions, users } from '../schema';
import type { TxDatabase } from './database';
import { sha256Bytes } from './digest';
import { USER_RECORD } from './users';

const SESSION_RECORD = {
  id: sessions.id,
  userId: sessions.userId,
  authTime: sessions.authTime,
  createdAt: sessions.createdAt,
  lastSeenAt: sessions.lastSeenAt,
  idleExpiresAt: sessions.idleExpiresAt,
  absExpiresAt: sessions.absExpiresAt,
};

export function createSessionRepo(db: TxDatabase, ctx: TxContext): SessionRepo {
  const { principal } = ctx;
  const systemOnly = () => {
    if (principal.kind !== 'system') throw new ScopeViolation();
  };
  return {
    async find(tokenSha256) {
      systemOnly();
      const [row] = await db
        .select({ session: SESSION_RECORD, user: USER_RECORD })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.tokenHash, sha256Bytes(tokenSha256)));
      return row ?? null;
    },
    async create(session): Promise<SessionRecord> {
      systemOnly();
      const [row] = await db
        .insert(sessions)
        .values({
          tokenHash: sha256Bytes(session.tokenSha256),
          userId: session.userId,
          authTime: session.authTime,
          createdAt: ctx.now,
          lastSeenAt: session.lastSeenAt,
          idleExpiresAt: session.idleExpiresAt,
          absExpiresAt: session.absExpiresAt,
        })
        .returning(SESSION_RECORD);
      if (!row) throw new Error('sessions.create: the insert returned no row');
      return row;
    },
    async touch(id, times) {
      systemOnly();
      await db
        .update(sessions)
        .set({ lastSeenAt: times.lastSeenAt, idleExpiresAt: times.idleExpiresAt })
        .where(eq(sessions.id, id));
    },
    async end(selector) {
      const where =
        'id' in selector
          ? eq(sessions.id, selector.id)
          : 'userId' in selector
            ? eq(sessions.userId, selector.userId)
            : eq(sessions.tokenHash, sha256Bytes(selector.tokenSha256));
      if (principal.kind === 'user') {
        const own =
          'id' in selector || ('userId' in selector && selector.userId === principal.actor.id);
        if (!own) throw new ScopeViolation();
      }
      const ownOnly =
        principal.kind === 'user' ? eq(sessions.userId, principal.actor.id) : undefined;
      const rows = await db
        .delete(sessions)
        .where(and(where, ownOnly))
        .returning({ id: sessions.id });
      return rows.map((r) => r.id);
    },
  };
}
