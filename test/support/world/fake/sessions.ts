import {
  ScopeViolation,
  type SessionRecord,
  type SessionRepo,
  type TxContext,
} from '@/application/ports';

import { guard, refusedBy } from './guards';
import { newId, type FakeTxState } from './state';

const SHA256_HEX = /^[0-9a-f]{64}$/;
const hash = (hex: string) => {
  if (!SHA256_HEX.test(hex)) throw new Error('expected a SHA-256 as 64 lower-case hex characters');
  return hex;
};

/** Sessions over the fake state: the same scope rules, and every write named for the audit check. */
export function fakeSessionRepo(tx: FakeTxState, ctx: TxContext): SessionRepo {
  const { principal } = ctx;
  const { sessions, users } = tx.draft;
  const systemOnly = () => {
    if (principal.kind !== 'system') throw new ScopeViolation();
  };
  const record = ({ tokenSha256: _hash, ...session }: SessionRecord & { tokenSha256: string }) =>
    session;
  const written = (id: string) => tx.written.push({ type: 'session', id });

  return {
    async find(tokenSha256) {
      guard(tx, false);
      systemOnly();
      const key = hash(tokenSha256);
      const session = [...sessions.values()].find((s) => s.tokenSha256 === key);
      const user = session && users.get(session.userId);
      return session && user ? { session: record(session), user } : null;
    },
    async create(session) {
      guard(tx, true);
      systemOnly();
      const tokenSha256 = hash(session.tokenSha256);
      if ([...sessions.values()].some((s) => s.tokenSha256 === tokenSha256)) {
        throw refusedBy('sessions_token_hash_key');
      }
      const created = {
        id: newId(tx.draft),
        userId: session.userId,
        authTime: session.authTime,
        createdAt: ctx.now,
        lastSeenAt: session.lastSeenAt,
        idleExpiresAt: session.idleExpiresAt,
        absExpiresAt: session.absExpiresAt,
      };
      sessions.set(created.id, { ...created, tokenSha256 });
      written(created.id);
      return created;
    },
    async touch(id, times) {
      guard(tx, true);
      systemOnly();
      const session = sessions.get(id);
      if (!session) return;
      sessions.set(id, { ...session, ...times });
      written(id);
    },
    async end(selector) {
      guard(tx, true);
      if (principal.kind === 'user') {
        const own =
          'id' in selector || ('userId' in selector && selector.userId === principal.actor.id);
        if (!own) throw new ScopeViolation();
      }
      const matches = (s: SessionRecord & { tokenSha256: string }) =>
        ('id' in selector
          ? s.id === selector.id
          : 'userId' in selector
            ? s.userId === selector.userId
            : s.tokenSha256 === hash(selector.tokenSha256)) &&
        (principal.kind !== 'user' || s.userId === principal.actor.id);
      const ended = [...sessions.values()].filter(matches).map((s) => s.id);
      for (const id of ended) {
        sessions.delete(id);
        written(id);
      }
      return ended;
    },
  };
}
